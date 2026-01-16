import { z } from "zod";
import type { OrchestratorEvent } from "../core/orchestrator-events";
import type { JobStatus } from "../core/jobs";
import type { OrchestratorConfig } from "../types";
import type { Ticket, TicketAssignment, TicketRunRef, TicketStatus } from "../tickets/types";
import { createOrchestratorEvent } from "../core/orchestrator-events";
import { createJobRecord, finalizeJobRecord, jobToTicketRun } from "../core/jobs";
import {
  createIssue,
  fetchTeamStates,
  mapTicketStatusToLinearStateId,
  updateIssueState,
} from "../tickets/linear";
import { createTicketOps } from "../tickets/ops";
import { getTicketById, getTicketStorePath, updateTicket as updateTicketInStore } from "../tickets/store";
import { randomUUID } from "node:crypto";

export type TaskOpKind =
  | "ticket.create"
  | "ticket.update"
  | "ticket.status.set"
  | "ticket.assign"
  | "ticket.list"
  | "ticket.get"
  | "ticket.delete"
  | "ticket.linear.sync";

export type TicketOpResult<T> = { ok: true; result: T } | { ok: false; error: string };

export type TaskContext = {
  baseDir: string;
  config: OrchestratorConfig;
  emitEvent?: (event: OrchestratorEvent) => void;
  sendToWorker?: (input: {
    taskId: string;
    workerId: string;
    task: string;
  }) => Promise<{ status: JobStatus; output?: unknown; error?: string }>;
  runWorkflow?: (input: {
    taskId: string;
    workflowId: string;
    task: string;
  }) => Promise<{ status: JobStatus; output?: unknown; error?: string }>;
};

const ticketStatusSchema = z.enum(["open", "in_progress", "blocked", "done", "canceled"]);

const ticketAssignmentSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("worker"), workerId: z.string() }),
  z.object({ kind: z.literal("workflow"), workflowId: z.string() }),
]);

const ticketRunSchema = z.object({
  taskId: z.string(),
  kind: z.enum(["worker", "workflow"]),
  workerId: z.string().optional(),
  workflowId: z.string().optional(),
  startedAt: z.number(),
  finishedAt: z.number().optional(),
  status: z.enum(["running", "succeeded", "failed", "canceled"]).optional(),
});

const ticketLinearSchema = z.object({
  issueId: z.string(),
  identifier: z.string().optional(),
  url: z.string().optional(),
  lastSyncedAt: z.number().optional(),
  lastSyncError: z.string().optional(),
});

const ticketPatchSchema = z
  .object({
    title: z.string().optional(),
    description: z.string().optional(),
    status: ticketStatusSchema.optional(),
    assignment: ticketAssignmentSchema.optional(),
    sessionId: z.string().optional(),
    projectId: z.string().optional(),
    tags: z.array(z.string()).optional(),
    runs: z.array(ticketRunSchema).optional(),
    linear: ticketLinearSchema.optional(),
  })
  .strict();

const ticketOpSchemas = {
  "ticket.create": z.object({
    title: z.string().min(1),
    description: z.string().optional(),
    assignment: ticketAssignmentSchema.optional(),
    sessionId: z.string().optional(),
    projectId: z.string().optional(),
    tags: z.array(z.string()).optional(),
  }),
  "ticket.update": z.object({
    ticketId: z.string(),
    patch: ticketPatchSchema,
  }),
  "ticket.status.set": z.object({
    ticketId: z.string(),
    status: ticketStatusSchema,
  }),
  "ticket.assign": z.object({
    ticketId: z.string(),
    assignment: ticketAssignmentSchema,
  }),
  "ticket.list": z.object({
    status: ticketStatusSchema.optional(),
    sessionId: z.string().optional(),
    projectId: z.string().optional(),
    limit: z.number().int().positive().optional(),
  }),
  "ticket.get": z.object({
    ticketId: z.string(),
  }),
  "ticket.delete": z.object({
    ticketId: z.string(),
  }),
  "ticket.linear.sync": z.object({
    ticketId: z.string(),
    teamId: z.string().optional(),
  }),
} as const;

const workerTaskSchema = z.object({
  kind: z.literal("worker"),
  workerId: z.string(),
  task: z.string(),
  ticketId: z.string().optional(),
  ticketStatusOnSuccess: ticketStatusSchema.optional(),
  ticketStatusOnFailure: ticketStatusSchema.optional(),
});

const workflowTaskSchema = z.object({
  kind: z.literal("workflow"),
  workflowId: z.string(),
  task: z.string(),
  ticketId: z.string().optional(),
  ticketStatusOnSuccess: ticketStatusSchema.optional(),
  ticketStatusOnFailure: ticketStatusSchema.optional(),
});

export type TicketOpPayload = {
  [K in keyof typeof ticketOpSchemas]: z.infer<(typeof ticketOpSchemas)[K]>;
};

export type TaskStartInput =
  | {
      kind: "op";
      op: TaskOpKind;
      payload: unknown;
    }
  | z.infer<typeof workerTaskSchema>
  | z.infer<typeof workflowTaskSchema>;

export type TaskExecutionResult = {
  taskId: string;
  status: JobStatus;
  output?: unknown;
  error?: string;
};

function resolveTicketStorePath(context: TaskContext): string {
  return context.config.tickets?.storePath ?? getTicketStorePath(context.baseDir);
}

function shouldTrackTickets(context: TaskContext, ticketId?: string): boolean {
  return Boolean(ticketId && context.config.tickets?.enabled === true);
}

async function appendTicketRun(
  context: TaskContext,
  ticketId: string,
  run: TicketRunRef,
): Promise<Ticket | undefined> {
  const storePath = resolveTicketStorePath(context);
  const ticket = await getTicketById(storePath, ticketId);
  if (!ticket) {
    return undefined;
  }
  const runs = [...ticket.runs, run];
  const updated = await updateTicketInStore(storePath, ticketId, {
    status: "in_progress",
    runs,
  });
  if (updated) {
    context.emitEvent?.(
      createOrchestratorEvent("orchestra.ticket.updated", {
        ticketId: updated.id,
        ticket: updated,
      }),
    );
  }
  return updated;
}

async function finalizeTicketRun(
  context: TaskContext,
  ticketId: string,
  taskId: string,
  status: JobStatus,
  ticketStatusOnSuccess: TicketStatus,
  ticketStatusOnFailure: TicketStatus,
): Promise<Ticket | undefined> {
  const storePath = resolveTicketStorePath(context);
  const ticket = await getTicketById(storePath, ticketId);
  if (!ticket) {
    return undefined;
  }
  const finishedAt = Date.now();
  const runs = ticket.runs.map(run =>
    run.taskId === taskId
      ? {
          ...run,
          status,
          finishedAt,
        }
      : run,
  );
  const nextStatus = status === "succeeded" ? ticketStatusOnSuccess : ticketStatusOnFailure;
  const updated = await updateTicketInStore(storePath, ticketId, {
    status: nextStatus,
    runs,
  });
  if (updated) {
    context.emitEvent?.(
      createOrchestratorEvent("orchestra.ticket.updated", {
        ticketId: updated.id,
        ticket: updated,
      }),
    );
  }
  return updated;
}

export async function taskStart(
  context: TaskContext,
  input: TaskStartInput,
): Promise<TicketOpResult<unknown>> {
  if (input.kind === "op") {
    return await runTicketOp(context, input.op, input.payload);
  }

  if (input.kind === "worker") {
    const parsed = workerTaskSchema.safeParse(input);
    if (!parsed.success) {
      return { ok: false, error: parsed.error.message };
    }
    return await runWorkerTask(context, parsed.data);
  }

  const parsed = workflowTaskSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.message };
  }
  return await runWorkflowTask(context, parsed.data);
}

async function runWorkerTask(
  context: TaskContext,
  input: z.infer<typeof workerTaskSchema>,
): Promise<TicketOpResult<TaskExecutionResult>> {
  if (!context.sendToWorker) {
    return { ok: false, error: "Worker execution is unavailable" };
  }

  const taskId = randomUUID();
  const startedAt = Date.now();
  const job = createJobRecord({
    taskId,
    kind: "worker",
    workerId: input.workerId,
    startedAt,
  });

  if (shouldTrackTickets(context, input.ticketId)) {
    const run = jobToTicketRun(job);
    const updated = await appendTicketRun(context, input.ticketId!, run);
    if (!updated) {
      return { ok: false, error: "Ticket not found" };
    }
  }

  try {
    const result = await context.sendToWorker({
      taskId,
      workerId: input.workerId,
      task: input.task,
    });
    const status = result.status;
    const finalized = finalizeJobRecord(job, status, Date.now());

    if (shouldTrackTickets(context, input.ticketId)) {
      await finalizeTicketRun(
        context,
        input.ticketId!,
        taskId,
        finalized.status,
        input.ticketStatusOnSuccess ?? "done",
        input.ticketStatusOnFailure ?? "blocked",
      );
    }

    return {
      ok: true,
      result: {
        taskId,
        status,
        output: result.output,
        error: result.error,
      },
    };
  } catch (err: any) {
    const status: JobStatus = "failed";
    if (shouldTrackTickets(context, input.ticketId)) {
      await finalizeTicketRun(
        context,
        input.ticketId!,
        taskId,
        status,
        input.ticketStatusOnSuccess ?? "done",
        input.ticketStatusOnFailure ?? "blocked",
      );
    }
    return { ok: false, error: err?.message ?? String(err) };
  }
}

async function runWorkflowTask(
  context: TaskContext,
  input: z.infer<typeof workflowTaskSchema>,
): Promise<TicketOpResult<TaskExecutionResult>> {
  if (!context.runWorkflow) {
    return { ok: false, error: "Workflow execution is unavailable" };
  }

  const taskId = randomUUID();
  const startedAt = Date.now();
  const job = createJobRecord({
    taskId,
    kind: "workflow",
    workflowId: input.workflowId,
    startedAt,
  });

  if (shouldTrackTickets(context, input.ticketId)) {
    const run = jobToTicketRun(job);
    const updated = await appendTicketRun(context, input.ticketId!, run);
    if (!updated) {
      return { ok: false, error: "Ticket not found" };
    }
  }

  try {
    const result = await context.runWorkflow({
      taskId,
      workflowId: input.workflowId,
      task: input.task,
    });
    const status = result.status;
    const finalized = finalizeJobRecord(job, status, Date.now());

    if (shouldTrackTickets(context, input.ticketId)) {
      await finalizeTicketRun(
        context,
        input.ticketId!,
        taskId,
        finalized.status,
        input.ticketStatusOnSuccess ?? "done",
        input.ticketStatusOnFailure ?? "blocked",
      );
    }

    return {
      ok: true,
      result: {
        taskId,
        status,
        output: result.output,
        error: result.error,
      },
    };
  } catch (err: any) {
    const status: JobStatus = "failed";
    if (shouldTrackTickets(context, input.ticketId)) {
      await finalizeTicketRun(
        context,
        input.ticketId!,
        taskId,
        status,
        input.ticketStatusOnSuccess ?? "done",
        input.ticketStatusOnFailure ?? "blocked",
      );
    }
    return { ok: false, error: err?.message ?? String(err) };
  }
}

export async function runTicketOp(
  context: TaskContext,
  op: TaskOpKind,
  payload: unknown,
): Promise<TicketOpResult<unknown>> {
  if (context.config.tickets?.enabled !== true) {
    return { ok: false, error: "Tickets are disabled" };
  }

  const schema = ticketOpSchemas[op];
  const parsed = schema.safeParse(payload);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.message };
  }

  const storePath = resolveTicketStorePath(context);
  const ticketOps = createTicketOps(storePath);

  try {
    switch (op) {
      case "ticket.create": {
        const result = await ticketOps.createTicket(parsed.data);
        context.emitEvent?.(
          createOrchestratorEvent("orchestra.ticket.created", {
            ticketId: result.id,
            ticket: result,
          }),
        );
        return { ok: true, result };
      }
      case "ticket.update": {
        const updated = await ticketOps.updateTicket(parsed.data);
        if (!updated) {
          return { ok: false, error: "Ticket not found" };
        }
        context.emitEvent?.(
          createOrchestratorEvent("orchestra.ticket.updated", {
            ticketId: updated.id,
            ticket: updated,
          }),
        );
        return { ok: true, result: updated };
      }
      case "ticket.status.set": {
        const updated = await ticketOps.setTicketStatus(parsed.data);
        if (!updated) {
          return { ok: false, error: "Ticket not found" };
        }
        context.emitEvent?.(
          createOrchestratorEvent("orchestra.ticket.updated", {
            ticketId: updated.id,
            ticket: updated,
          }),
        );
        return { ok: true, result: updated };
      }
      case "ticket.assign": {
        const updated = await ticketOps.assignTicket(parsed.data);
        if (!updated) {
          return { ok: false, error: "Ticket not found" };
        }
        context.emitEvent?.(
          createOrchestratorEvent("orchestra.ticket.updated", {
            ticketId: updated.id,
            ticket: updated,
          }),
        );
        return { ok: true, result: updated };
      }
      case "ticket.list": {
        const list = await ticketOps.listTickets(parsed.data);
        return { ok: true, result: list };
      }
      case "ticket.get": {
        const ticket = await ticketOps.getTicket(parsed.data.ticketId);
        if (!ticket) {
          return { ok: false, error: "Ticket not found" };
        }
        return { ok: true, result: ticket };
      }
      case "ticket.delete": {
        const deleted = await ticketOps.deleteTicket(parsed.data);
        if (!deleted) {
          return { ok: false, error: "Ticket not found" };
        }
        context.emitEvent?.(
          createOrchestratorEvent("orchestra.ticket.deleted", {
            ticketId: parsed.data.ticketId,
          }),
        );
        return { ok: true, result: { ticketId: parsed.data.ticketId } };
      }
      case "ticket.linear.sync": {
        if (context.config.tickets?.linear?.enabled !== true) {
          return { ok: false, error: "Linear sync is disabled" };
        }
        const ticket = await ticketOps.getTicket(parsed.data.ticketId);
        if (!ticket) {
          return { ok: false, error: "Ticket not found" };
        }
        try {
          const teamId =
            parsed.data.teamId ??
            context.config.tickets?.linear?.teamId ??
            process.env.LINEAR_TEAM_ID;
          if (!teamId) {
            return { ok: false, error: "LINEAR_TEAM_ID is required" };
          }
          const now = Date.now();
          if (!ticket.linear?.issueId) {
            const created = await createIssue({
              title: ticket.title,
              description: ticket.description,
              teamId,
            });
            const updated = await updateTicketInStore(storePath, ticket.id, {
              linear: {
                issueId: created.issueId,
                identifier: created.identifier,
                url: created.url,
                lastSyncedAt: now,
                lastSyncError: undefined,
              },
            });
            if (!updated) {
              return { ok: false, error: "Ticket not found" };
            }
            context.emitEvent?.(
              createOrchestratorEvent("orchestra.ticket.linear.synced", {
                ticketId: updated.id,
                issueId: created.issueId,
                identifier: created.identifier,
                url: created.url,
              }),
            );
            return { ok: true, result: updated };
          }

          const states = await fetchTeamStates(teamId);
          const stateId = mapTicketStatusToLinearStateId(ticket.status, states);
          await updateIssueState({
            issueId: ticket.linear.issueId,
            stateId,
            teamId,
          });
          const updated = await updateTicketInStore(storePath, ticket.id, {
            linear: {
              ...ticket.linear,
              lastSyncedAt: now,
              lastSyncError: undefined,
            },
          });
          if (!updated) {
            return { ok: false, error: "Ticket not found" };
          }
          context.emitEvent?.(
            createOrchestratorEvent("orchestra.ticket.linear.synced", {
              ticketId: updated.id,
              issueId: ticket.linear.issueId,
              identifier: ticket.linear.identifier,
              url: ticket.linear.url,
            }),
          );
          return { ok: true, result: updated };
        } catch (err: any) {
          const message = err?.message ?? String(err);
          await updateTicketInStore(storePath, ticket.id, {
            linear: {
              ...(ticket.linear ?? { issueId: "" }),
              issueId: ticket.linear?.issueId ?? "",
              lastSyncError: message,
            },
          });
          context.emitEvent?.(
            createOrchestratorEvent("orchestra.ticket.linear.failed", {
              ticketId: ticket.id,
              error: message,
            }),
          );
          return { ok: false, error: message };
        }
      }
      default:
        return { ok: false, error: "Unsupported op" };
    }
  } catch (err: any) {
    return { ok: false, error: err?.message ?? String(err) };
  }
}

export type TicketOpResultData = {
  create: Ticket;
  update: Ticket;
  status: Ticket;
  assign: Ticket;
  list: Ticket[];
  get: Ticket;
  delete: { ticketId: string };
  linearSync: Ticket;
};

export type TicketStatusInput = TicketStatus;
export type TicketAssignmentInput = TicketAssignment;
