import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import type { Ticket } from "../../src/tickets/types";
import { taskStart, type TaskContext } from "../../src/command/tasks";
import { getTicketById, getTicketStorePath } from "../../src/tickets/store";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

const originalNow = Date.now;

describe("ticket run linking", () => {
  let tempDir = "";

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "orchestrator-run-"));
  });

  afterEach(async () => {
    Date.now = originalNow;
    if (tempDir) {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  test("worker task updates ticket run history and status", async () => {
    let now = 1000;
    Date.now = () => now;

    const context: TaskContext = {
      baseDir: tempDir,
      config: {
        tickets: {
          enabled: true,
        },
      },
      sendToWorker: async () => ({ status: "succeeded" }),
    };

    const created = await taskStart(context, {
      kind: "op",
      op: "ticket.create",
      payload: { title: "Run ticket" },
    });
    expect(created.ok).toBe(true);
    const ticket = (created as { ok: true; result: Ticket }).result;

    now = 2000;
    const runResult = await taskStart(context, {
      kind: "worker",
      workerId: "worker-1",
      task: "Do work",
      ticketId: ticket.id,
    });
    expect(runResult.ok).toBe(true);
    const taskId = (runResult as { ok: true; result: { taskId: string } }).result.taskId;

    const storePath = getTicketStorePath(tempDir);
    const stored = await getTicketById(storePath, ticket.id);
    expect(stored?.status).toBe("done");
    expect(stored?.runs).toHaveLength(1);
    expect(stored?.runs[0].taskId).toBe(taskId);
    expect(stored?.runs[0].status).toBe("succeeded");
    expect(stored?.runs[0].workerId).toBe("worker-1");
    expect(stored?.runs[0].finishedAt).toBeDefined();
  });

  test("worker task failure sets blocked status", async () => {
    let now = 3000;
    Date.now = () => now;

    const context: TaskContext = {
      baseDir: tempDir,
      config: {
        tickets: {
          enabled: true,
        },
      },
      sendToWorker: async () => ({ status: "failed", error: "boom" }),
    };

    const created = await taskStart(context, {
      kind: "op",
      op: "ticket.create",
      payload: { title: "Failure ticket" },
    });
    expect(created.ok).toBe(true);
    const ticket = (created as { ok: true; result: Ticket }).result;

    now = 4000;
    const runResult = await taskStart(context, {
      kind: "worker",
      workerId: "worker-2",
      task: "Fail work",
      ticketId: ticket.id,
    });
    expect(runResult.ok).toBe(true);

    const storePath = getTicketStorePath(tempDir);
    const stored = await getTicketById(storePath, ticket.id);
    expect(stored?.status).toBe("blocked");
    expect(stored?.runs).toHaveLength(1);
    expect(stored?.runs[0].status).toBe("failed");
  });

  test("ticketId is ignored when tickets disabled", async () => {
    const context: TaskContext = {
      baseDir: tempDir,
      config: {
        tickets: {
          enabled: false,
        },
      },
      sendToWorker: async () => ({ status: "succeeded" }),
    };

    const runResult = await taskStart(context, {
      kind: "worker",
      workerId: "worker-3",
      task: "No ticket",
      ticketId: "ticket-missing",
    });
    expect(runResult.ok).toBe(true);

    const storePath = getTicketStorePath(tempDir);
    const stored = await getTicketById(storePath, "ticket-missing");
    expect(stored).toBeUndefined();
  });
});
