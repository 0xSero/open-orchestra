import { describe, test, expect, beforeAll, beforeEach, afterAll, afterEach } from "bun:test";
import type { TicketStatus } from "../../../src/tickets/types";
import { createServer } from "node:http";
import type { IncomingHttpHeaders } from "node:http";

const originalEnv = { ...process.env };

type RecordedRequest = {
  headers: IncomingHttpHeaders;
  body: any;
};

let handler: (record: RecordedRequest) => unknown = () => ({ data: {} });

async function startServer(): Promise<{
  url: string;
  requests: RecordedRequest[];
  close: () => Promise<void>;
}> {
  const requests: RecordedRequest[] = [];

  const server = createServer(async (req, res) => {
    const chunks: Uint8Array[] = [];
    for await (const chunk of req) {
      chunks.push(chunk);
    }
    const bodyText = Buffer.concat(chunks).toString("utf-8");
    const body = bodyText ? JSON.parse(bodyText) : null;
    const record = { headers: req.headers, body };
    requests.push(record);

    const responseBody = handler(record);
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
    requests,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close(err => (err ? reject(err) : resolve()));
      }),
  };
}

function resetEnv() {
  process.env = { ...originalEnv } as NodeJS.ProcessEnv;
}

describe("Linear client", () => {
  let server: { url: string; requests: RecordedRequest[]; close: () => Promise<void> };
  let linear: typeof import("../../../src/tickets/linear");

  beforeAll(async () => {
    server = await startServer();
    process.env.LINEAR_API_URL = server.url;
    process.env.LINEAR_API_KEY = "test-key";
    process.env.LINEAR_TEAM_ID = "team-1";
    linear = await import("../../../src/tickets/linear");
  });

  beforeEach(() => {
    resetEnv();
    process.env.LINEAR_API_URL = server.url;
    process.env.LINEAR_API_KEY = "test-key";
    process.env.LINEAR_TEAM_ID = "team-1";
    server.requests.length = 0;
    handler = () => ({ data: {} });
  });

  afterEach(() => {
    resetEnv();
  });

  afterAll(async () => {
    await server.close();
  });

  test("sends authorization header and query", async () => {
    handler = record => {
      if (!record.body?.query) {
        return { errors: [{ message: "missing query" }] };
      }
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
    };
    const states = await linear.fetchTeamStates("team-1");

    expect(states).toHaveLength(2);
    expect(server.requests).toHaveLength(1);
    expect(server.requests[0].headers.authorization).toBe("test-key");
    expect(server.requests[0].body.query).toContain("TeamStates");

  });

  test("GraphQL errors throw without leaking secrets", async () => {
    handler = () => ({ errors: [{ message: "Nope" }] });
    process.env.LINEAR_API_KEY = "super-secret";
    let message = "";
    try {
      await linear.fetchTeamStates("team-1");
    } catch (err: any) {
      message = err?.message ?? String(err);
    }

    expect(message).toContain("Nope");
    expect(message).not.toContain("super-secret");

  });

  test("createIssue and updateIssueState send expected payloads", async () => {
    handler = record => {
      const query: string = record.body?.query ?? "";
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
      if (query.includes("issueUpdate")) {
        return {
          data: {
            issueUpdate: {
              success: true,
            },
          },
        };
      }
      return { errors: [{ message: "unexpected query" }] };
    };
    const created = await linear.createIssue({
      title: "Test",
      description: "Details",
      priority: 2,
    });

    expect(created.issueId).toBe("issue-1");
    expect(server.requests[0].body.query).toContain("issueCreate");
    expect(server.requests[0].body.variables.input.teamId).toBe("team-1");
    expect(server.requests[0].body.variables.input.title).toBe("Test");

    await linear.updateIssueState({ issueId: "issue-1", stateId: "state-2" });

    expect(server.requests[1].body.query).toContain("issueUpdate");
    expect(server.requests[1].body.variables.input.id).toBe("issue-1");
    expect(server.requests[1].body.variables.input.stateId).toBe("state-2");

  });

  test("status mapping picks correct state ids", async () => {
    const states = [
      { id: "state-open", name: "Backlog", type: "backlog" },
      { id: "state-in-progress", name: "In Progress", type: "started" },
      { id: "state-blocked", name: "Blocked", type: "blocked" },
      { id: "state-done", name: "Done", type: "completed" },
      { id: "state-canceled", name: "Canceled", type: "canceled" },
    ];

    const mapping: Record<TicketStatus, string> = {
      open: "state-open",
      in_progress: "state-in-progress",
      blocked: "state-blocked",
      done: "state-done",
      canceled: "state-canceled",
    };

    for (const status of Object.keys(mapping) as TicketStatus[]) {
      const stateId = linear.mapTicketStatusToLinearStateId(status, states);
      expect(stateId).toBe(mapping[status]);
    }
  });

  test("status mapping falls back to name heuristics", async () => {
    const states = [
      { id: "state-backlog", name: "Backlog", type: null },
      { id: "state-doing", name: "Doing", type: null },
      { id: "state-done", name: "Completed", type: null },
      { id: "state-canceled", name: "Cancelled", type: null },
    ];

    expect(linear.mapTicketStatusToLinearStateId("open", states)).toBe("state-backlog");
    expect(linear.mapTicketStatusToLinearStateId("in_progress", states)).toBe("state-doing");
    expect(linear.mapTicketStatusToLinearStateId("done", states)).toBe("state-done");
    expect(linear.mapTicketStatusToLinearStateId("canceled", states)).toBe(
      "state-canceled",
    );
  });
});
