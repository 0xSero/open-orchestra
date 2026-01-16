import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import type { OrchestratorEvent } from "../../../src/core/orchestrator-events";
import type { Ticket } from "../../../src/tickets/types";
import { runTicketOp, type TaskContext } from "../../../src/command/tasks";
import { createServer } from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const originalEnv = { ...process.env };
const originalNow = Date.now;

type RecordedRequest = {
  body: any;
};

async function startLinearServer(
  handler: (record: RecordedRequest) => unknown,
): Promise<{ url: string; close: () => Promise<void> }> {
  const server = createServer(async (req, res) => {
    const chunks: Uint8Array[] = [];
    for await (const chunk of req) {
      chunks.push(chunk);
    }
    const bodyText = Buffer.concat(chunks).toString("utf-8");
    const body = bodyText ? JSON.parse(bodyText) : null;

    const responseBody = handler({ body });
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify(responseBody));
  });

  await new Promise<void>((resolve, reject) => {
    server.listen(0, () => resolve());
    server.on("error", err => reject(err));
  });

  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Failed to start test server");
  }

  return {
    url: `http://127.0.0.1:${address.port}`,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close(err => (err ? reject(err) : resolve()));
      }),
  };
}

function resetEnv() {
  process.env = { ...originalEnv } as NodeJS.ProcessEnv;
}

function createContext(baseDir: string, events: OrchestratorEvent[], linear = false): TaskContext {
  return {
    baseDir,
    config: {
      tickets: {
        enabled: true,
        linear: {
          enabled: linear,
        },
      },
    },
    emitEvent: event => {
      events.push(event);
    },
  };
}

describe("ticket ops", () => {
  let tempDir = "";

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "orchestrator-ticket-"));
    resetEnv();
  });

  afterEach(async () => {
    Date.now = originalNow;
    resetEnv();
    if (tempDir) {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  test("gates ticket ops when disabled", async () => {
    const context: TaskContext = {
      baseDir: tempDir,
      config: { tickets: { enabled: false } },
    };

    const result = await runTicketOp(context, "ticket.create", { title: "Blocked" });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe("Tickets are disabled");
    }
  });

  test("create/update/assign/list/delete emit events", async () => {
    const events: OrchestratorEvent[] = [];
    const context = createContext(tempDir, events);

    Date.now = () => 1000;
    const created = await runTicketOp(context, "ticket.create", { title: "First" });
    expect(created.ok).toBe(true);
    const ticket = (created as { ok: true; result: Ticket }).result;

    Date.now = () => 1100;
    const updated = await runTicketOp(context, "ticket.update", {
      ticketId: ticket.id,
      patch: { description: "Updated" },
    });
    expect(updated.ok).toBe(true);

    const assigned = await runTicketOp(context, "ticket.assign", {
      ticketId: ticket.id,
      assignment: { kind: "worker", workerId: "worker-1" },
    });
    expect(assigned.ok).toBe(true);

    const statusSet = await runTicketOp(context, "ticket.status.set", {
      ticketId: ticket.id,
      status: "in_progress",
    });
    expect(statusSet.ok).toBe(true);

    await runTicketOp(context, "ticket.create", { title: "Second" });
    const list = await runTicketOp(context, "ticket.list", { status: "in_progress" });
    expect(list.ok).toBe(true);
    if (list.ok) {
      expect((list.result as Ticket[]).length).toBe(1);
    }

    const deleted = await runTicketOp(context, "ticket.delete", { ticketId: ticket.id });
    expect(deleted.ok).toBe(true);

    const types = events.map(event => event.type);
    expect(types).toContain("orchestra.ticket.created");
    expect(types).toContain("orchestra.ticket.updated");
    expect(types).toContain("orchestra.ticket.deleted");
  });

  test("linear sync emits events and updates ticket", async () => {
    const server = await startLinearServer(record => {
      const query = record.body?.query ?? "";
      if (query.includes("TeamStates")) {
        return {
          data: {
            team: {
              states: {
                nodes: [
                  { id: "state-1", name: "Backlog", type: "backlog" },
                  { id: "state-2", name: "In Progress", type: "started" },
                ],
              },
            },
          },
        };
      }
      if (query.includes("issueUpdate")) {
        return {
          data: {
            issueUpdate: {
              success: true,
            },
          },
        };
      }
      return {
        errors: [{ message: "Unexpected query" }],
      };
    });

    process.env.LINEAR_API_URL = server.url;
    process.env.LINEAR_API_KEY = "test-key";
    process.env.LINEAR_TEAM_ID = "team-1";

    const events: OrchestratorEvent[] = [];
    const context = createContext(tempDir, events, true);

    const created = await runTicketOp(context, "ticket.create", { title: "Linear ticket" });
    expect(created.ok).toBe(true);
    const ticket = (created as { ok: true; result: Ticket }).result;

    await runTicketOp(context, "ticket.update", {
      ticketId: ticket.id,
      patch: { linear: { issueId: "issue-1" }, status: "in_progress" },
    });

    Date.now = () => 2000;
    const synced = await runTicketOp(context, "ticket.linear.sync", { ticketId: ticket.id });
    expect(synced.ok).toBe(true);

    const syncedEvent = events.find(event => event.type === "orchestra.ticket.linear.synced");
    expect(syncedEvent).toBeTruthy();
    if (syncedEvent) {
      expect(syncedEvent.data.ticketId).toBe(ticket.id);
      expect(syncedEvent.data.issueId).toBe("issue-1");
    }

    await server.close();
  });

  test("linear sync gated when disabled", async () => {
    const events: OrchestratorEvent[] = [];
    const context = createContext(tempDir, events, false);
    const created = await runTicketOp(context, "ticket.create", { title: "Linear" });
    expect(created.ok).toBe(true);
    const ticket = (created as { ok: true; result: Ticket }).result;

    const synced = await runTicketOp(context, "ticket.linear.sync", { ticketId: ticket.id });
    expect(synced.ok).toBe(false);
    if (!synced.ok) {
      expect(synced.error).toBe("Linear sync is disabled");
    }
  });
});
