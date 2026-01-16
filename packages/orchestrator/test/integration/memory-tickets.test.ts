import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { createWorkflowTriggers } from "../../src/workflows/triggers";
import { createTaskTools } from "../../src/command/task-tools";
import type { MemoryTaskPayload } from "../../src/memory/tasks";
import type { Ticket } from "../../src/tickets/types";
import { listTickets } from "../../src/tickets/store";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

const originalNow = Date.now;

describe("memory tickets integration", () => {
  let tempDir = "";

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "orchestrator-memory-"));
  });

  afterEach(async () => {
    Date.now = originalNow;
    if (tempDir) {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  test("memory turn todos create tickets", async () => {
    const context = {
      baseDir: tempDir,
      config: {
        tickets: {
          enabled: true,
          linear: {
            enabled: false,
          },
        },
      },
    };

    const tools = createTaskTools(context);

    const triggers = createWorkflowTriggers({
      runWorkflow: async ({ task }) => {
        const payload = JSON.parse(task) as MemoryTaskPayload;
        const todos = payload.turn.todos ?? [];
        for (const todo of todos) {
          const descriptionParts: string[] = [];
          if (payload.turn.sessionId) {
            descriptionParts.push(`Session: ${payload.turn.sessionId}`);
          }
          if (payload.turn.projectId) {
            descriptionParts.push(`Project: ${payload.turn.projectId}`);
          }
          if (payload.turn.summary) {
            descriptionParts.push(`Summary: ${payload.turn.summary}`);
          }
          const description = descriptionParts.join(" | ");

          const created = await tools.ticket_create({
            title: todo,
            description,
            sessionId: payload.turn.sessionId,
            projectId: payload.turn.projectId,
            tags: ["memory", "todo"],
          });

          if (created.ok && context.config.tickets?.linear?.enabled) {
            const ticket = created.result as Ticket;
            await tools.ticket_linear_sync({ ticketId: ticket.id });
          }
        }

        await tools.memory_done({ taskId: payload.taskId });
      },
    });

    await triggers.handleMemoryTurnEnd({
      turn: {
        summary: "User asked to implement feature X",
        todos: ["Implement feature X", "Write tests"],
        sessionId: "sess-1",
        projectId: "proj-1",
      },
    });

    const storePath = join(tempDir, ".opencode", "orchestrator", "tickets.json");
    const tickets = await listTickets(storePath);
    expect(tickets).toHaveLength(2);
    expect(tickets.map(ticket => ticket.title)).toEqual([
      "Write tests",
      "Implement feature X",
    ]);
    for (const ticket of tickets) {
      expect(ticket.sessionId).toBe("sess-1");
      expect(ticket.projectId).toBe("proj-1");
      expect(ticket.tags).toContain("memory");
    }
  });
});
