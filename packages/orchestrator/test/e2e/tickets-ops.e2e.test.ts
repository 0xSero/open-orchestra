import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import type { OrchestratorEvent } from "../../src/core/orchestrator-events";
import type { Ticket } from "../../src/tickets/types";
import { taskStart, type TaskContext } from "../../src/command/tasks";
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

describe("ticket ops e2e", () => {
  let tempDir = "";

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "orchestrator-ticket-e2e-"));
    resetEnv();
  });

  afterEach(async () => {
    Date.now = originalNow;
    resetEnv();
    if (tempDir) {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  test("taskStart ticket lifecycle with linear sync", async () => {
    const server = await startLinearServer(record => {
      const query = record.body?.query ?? "";
      if (query.includes("issueCreate")) {
        return {
          data: {
            issueCreate: {
              issue: {
                id: "issue-1",
                identifier: "LIN-1",
                url: "https://linear.app/issue/LIN-1",
              },
            },
          },
        };
      }
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
    const context: TaskContext = {
      baseDir: tempDir,
      config: {
        tickets: {
          enabled: true,
          linear: {
            enabled: true,
          },
        },
      },
      emitEvent: event => {
        events.push(event);
      },
    };

    Date.now = () => 1000;
    const created = await taskStart(context, {
      kind: "op",
      op: "ticket.create",
      payload: { title: "E2E Ticket" },
    });

    expect(created.ok).toBe(true);
    const ticket = (created as { ok: true; result: Ticket }).result;

    Date.now = () => 1100;
    const firstSync = await taskStart(context, {
      kind: "op",
      op: "ticket.linear.sync",
      payload: { ticketId: ticket.id },
    });
    expect(firstSync.ok).toBe(true);

    Date.now = () => 1200;
    const statusSet = await taskStart(context, {
      kind: "op",
      op: "ticket.status.set",
      payload: { ticketId: ticket.id, status: "in_progress" },
    });
    expect(statusSet.ok).toBe(true);

    Date.now = () => 1300;
    const secondSync = await taskStart(context, {
      kind: "op",
      op: "ticket.linear.sync",
      payload: { ticketId: ticket.id },
    });
    expect(secondSync.ok).toBe(true);

    const linearEvents = events.filter(event =>
      event.type.startsWith("orchestra.ticket.linear"),
    );
    expect(linearEvents.length).toBe(2);

    await server.close();
  });
});
