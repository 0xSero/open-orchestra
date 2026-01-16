import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { taskStart, type TaskContext } from "../../src/command/tasks";
import type { Ticket } from "../../src/tickets/types";
import { getTicketById, getTicketStorePath } from "../../src/tickets/store";
import { createServer } from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

const originalEnv = { ...process.env };
const originalNow = Date.now;

type RecordedQuery = {
  query: string;
  variables?: Record<string, unknown>;
};

async function startLinearServer(): Promise<{ url: string; queries: RecordedQuery[]; close: () => Promise<void> }> {
  const queries: RecordedQuery[] = [];

  const server = createServer(async (req, res) => {
    const chunks: Uint8Array[] = [];
    for await (const chunk of req) {
      chunks.push(chunk);
    }
    const bodyText = Buffer.concat(chunks).toString("utf-8");
    const body = bodyText ? JSON.parse(bodyText) : null;
    const query = body?.query ?? "";
    const variables = body?.variables ?? undefined;
    queries.push({ query, variables });

    if (query.includes("TeamStates")) {
      res.setHeader("content-type", "application/json");
      res.end(
        JSON.stringify({
          data: {
            team: {
              states: {
                nodes: [
                  { id: "state-backlog", name: "Backlog", type: "backlog" },
                  { id: "state-started", name: "In Progress", type: "started" },
                  { id: "state-done", name: "Done", type: "completed" },
                ],
              },
            },
          },
        })
      );
      return;
    }

    if (query.includes("issueCreate")) {
      res.setHeader("content-type", "application/json");
      res.end(
        JSON.stringify({
          data: {
            issueCreate: {
              issue: {
                id: "issue-1",
                identifier: "LIN-1",
                url: "https://linear.app/issue/LIN-1",
              },
            },
          },
        })
      );
      return;
    }

    if (query.includes("issueUpdate")) {
      res.setHeader("content-type", "application/json");
      res.end(
        JSON.stringify({
          data: {
            issueUpdate: {
              success: true,
            },
          },
        })
      );
      return;
    }

    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ errors: [{ message: "Unexpected query" }] }));
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
    queries,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close(err => (err ? reject(err) : resolve()));
      }),
  };
}

function resetEnv() {
  process.env = { ...originalEnv } as NodeJS.ProcessEnv;
}

describe("tickets linear e2e", () => {
  let tempDir = "";

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "orchestrator-linear-"));
    resetEnv();
  });

  afterEach(async () => {
    Date.now = originalNow;
    resetEnv();
    if (tempDir) {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  test("ticket lifecycle with Linear sync", async () => {
    const server = await startLinearServer();
    process.env.LINEAR_API_URL = server.url;
    process.env.LINEAR_API_KEY = "test-key";
    process.env.LINEAR_TEAM_ID = "team-1";

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
      runWorkflow: async () => ({ status: "succeeded" }),
    };

    Date.now = () => 1000;
    const created = await taskStart(context, {
      kind: "op",
      op: "ticket.create",
      payload: { title: "Linear E2E" },
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
    const runResult = await taskStart(context, {
      kind: "workflow",
      workflowId: "workflow-1",
      task: "Run work",
      ticketId: ticket.id,
    });
    expect(runResult.ok).toBe(true);
    const taskId = (runResult as { ok: true; result: { taskId: string } }).result.taskId;

    Date.now = () => 1300;
    const secondSync = await taskStart(context, {
      kind: "op",
      op: "ticket.linear.sync",
      payload: { ticketId: ticket.id },
    });
    expect(secondSync.ok).toBe(true);

    const storePath = getTicketStorePath(tempDir);
    const stored = await getTicketById(storePath, ticket.id);
    expect(stored?.runs).toHaveLength(1);
    expect(stored?.runs[0].taskId).toBe(taskId);
    expect(stored?.status).toBe("done");

    const hasIssueCreate = server.queries.some(entry => entry.query.includes("issueCreate"));
    const hasIssueUpdate = server.queries.some(entry => entry.query.includes("issueUpdate"));
    expect(hasIssueCreate).toBe(true);
    expect(hasIssueUpdate).toBe(true);

    await server.close();
  });
});
