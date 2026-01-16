import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import type { Ticket } from "../../src/tickets/types";
import { getTicketStorePath, readTicketStore, upsertTicket } from "../../src/tickets/store";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

function createTicket(overrides: Partial<Ticket> = {}): Ticket {
  return {
    id: "ticket-integrated",
    title: "Integration ticket",
    status: "open",
    createdAt: 1,
    updatedAt: 1,
    runs: [],
    ...overrides,
  };
}

describe("ticket store integration", () => {
  let tempDir = "";

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "orchestrator-int-"));
  });

  afterEach(async () => {
    if (tempDir) {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  test("writes to default .opencode path and reads back", async () => {
    const path = getTicketStorePath(tempDir);
    const ticket = createTicket();

    await upsertTicket(path, ticket);
    const store = await readTicketStore(path);

    expect(store.tickets).toHaveLength(1);
    expect(store.tickets[0].id).toBe("ticket-integrated");

    const raw = await readFile(path, "utf-8");
    expect(raw).toContain("ticket-integrated");
  });
});
