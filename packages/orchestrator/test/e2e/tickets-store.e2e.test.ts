import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import type { Ticket } from "../../src/tickets/types";
import {
  deleteTicket,
  getTicketById,
  getTicketStorePath,
  listTickets,
  updateTicket,
  upsertTicket,
} from "../../src/tickets/store";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

const originalNow = Date.now;

function createTicket(overrides: Partial<Ticket> = {}): Ticket {
  return {
    id: "ticket-e2e",
    title: "E2E ticket",
    status: "open",
    createdAt: 10,
    updatedAt: 10,
    runs: [],
    ...overrides,
  };
}

describe("ticket store e2e", () => {
  let tempDir = "";

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "orchestrator-e2e-"));
  });

  afterEach(async () => {
    Date.now = originalNow;
    if (tempDir) {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  test("create, update, list, and delete ticket", async () => {
    const path = getTicketStorePath(tempDir);

    Date.now = () => 200;
    await upsertTicket(path, createTicket({ id: "ticket-1" }));

    Date.now = () => 300;
    await upsertTicket(path, createTicket({ id: "ticket-2" }));

    Date.now = () => 400;
    const updated = await updateTicket(path, "ticket-1", {
      status: "in_progress",
      assignment: { kind: "workflow", workflowId: "flow-1" },
      runs: [
        {
          taskId: "task-1",
          kind: "workflow",
          workflowId: "flow-1",
          startedAt: 350,
          status: "running",
        },
      ],
    });

    expect(updated?.status).toBe("in_progress");

    const list = await listTickets(path);
    expect(list.map(ticket => ticket.id)).toEqual(["ticket-1", "ticket-2"]);

    const stored = await getTicketById(path, "ticket-1");
    expect(stored?.runs).toHaveLength(1);

    const deleted = await deleteTicket(path, "ticket-2");
    expect(deleted).toBe(true);
    const missing = await getTicketById(path, "ticket-2");
    expect(missing).toBeUndefined();
  });
});
