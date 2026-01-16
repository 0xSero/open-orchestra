import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import type { Ticket } from "../../../src/tickets/types";
import {
  deleteTicket,
  getTicketById,
  getTicketStorePath,
  listTickets,
  readTicketStore,
  updateTicket,
  upsertTicket,
} from "../../../src/tickets/store";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

const originalNow = Date.now;

function createTicket(overrides: Partial<Ticket> = {}): Ticket {
  return {
    id: "ticket-1",
    title: "Test ticket",
    status: "open",
    createdAt: 100,
    updatedAt: 100,
    runs: [],
    ...overrides,
  };
}

describe("ticket store", () => {
  let tempDir = "";

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "orchestrator-test-"));
  });

  afterEach(async () => {
    Date.now = originalNow;
    if (tempDir) {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  test("missing file returns empty store", async () => {
    const path = join(tempDir, "missing.json");
    const store = await readTicketStore(path);
    expect(store).toEqual({ version: 1, tickets: [] });
  });

  test("invalid JSON returns empty store", async () => {
    const path = join(tempDir, "invalid.json");
    await writeFile(path, "not-json", "utf-8");
    const store = await readTicketStore(path);
    expect(store).toEqual({ version: 1, tickets: [] });
  });

  test("getTicketStorePath resolves default location", () => {
    const path = getTicketStorePath(tempDir);
    expect(path).toBe(join(tempDir, ".opencode", "orchestrator", "tickets.json"));
  });

  test("create ticket persists and updates updatedAt", async () => {
    const path = join(tempDir, "tickets.json");
    Date.now = () => 500;
    const ticket = createTicket({ createdAt: 250, updatedAt: 250 });

    const created = await upsertTicket(path, ticket);
    expect(created.createdAt).toBe(250);
    expect(created.updatedAt).toBe(500);

    const stored = await getTicketById(path, ticket.id);
    expect(stored?.updatedAt).toBe(500);
    expect(stored?.createdAt).toBe(250);
  });

  test("update status and assignment persists", async () => {
    const path = join(tempDir, "tickets.json");
    Date.now = () => 300;
    const ticket = createTicket({ id: "ticket-2" });
    await upsertTicket(path, ticket);

    Date.now = () => 900;
    const updated = await updateTicket(path, "ticket-2", {
      status: "in_progress",
      assignment: { kind: "worker", workerId: "worker-1" },
    });

    expect(updated?.status).toBe("in_progress");
    expect(updated?.assignment).toEqual({ kind: "worker", workerId: "worker-1" });
    const stored = await getTicketById(path, "ticket-2");
    expect(stored?.updatedAt).toBe(900);
  });

  test("update returns undefined when ticket missing", async () => {
    const path = join(tempDir, "tickets.json");
    const updated = await updateTicket(path, "missing", { status: "done" });
    expect(updated).toBeUndefined();
  });

  test("run history append remains stable and list is ordered", async () => {
    const path = join(tempDir, "tickets.json");
    Date.now = () => 1000;
    await upsertTicket(path, createTicket({ id: "ticket-a" }));

    Date.now = () => 1200;
    await upsertTicket(
      path,
      createTicket({
        id: "ticket-b",
        updatedAt: 1200,
        runs: [
          {
            taskId: "task-1",
            kind: "worker",
            workerId: "worker-1",
            startedAt: 1100,
            status: "running",
          },
        ],
      })
    );

    Date.now = () => 1300;
    const updated = await updateTicket(path, "ticket-b", {
      runs: [
        {
          taskId: "task-1",
          kind: "worker",
          workerId: "worker-1",
          startedAt: 1100,
          status: "running",
        },
        {
          taskId: "task-2",
          kind: "workflow",
          workflowId: "flow-1",
          startedAt: 1250,
          status: "succeeded",
          finishedAt: 1290,
        },
      ],
    });

    expect(updated?.runs).toHaveLength(2);
    const stored = await getTicketById(path, "ticket-b");
    expect(stored?.runs[1].taskId).toBe("task-2");

    const list = await listTickets(path);
    expect(list[0].id).toBe("ticket-b");
    expect(list[1].id).toBe("ticket-a");
  });

  test("delete removes ticket", async () => {
    const path = join(tempDir, "tickets.json");
    await upsertTicket(path, createTicket({ id: "ticket-delete" }));
    const deleted = await deleteTicket(path, "ticket-delete");
    expect(deleted).toBe(true);
    const stored = await getTicketById(path, "ticket-delete");
    expect(stored).toBeUndefined();
  });
});
