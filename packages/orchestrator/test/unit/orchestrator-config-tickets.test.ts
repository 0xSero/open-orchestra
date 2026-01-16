import { describe, test, expect } from "bun:test";
import { parseOrchestratorConfig } from "../../src/config/orchestrator";

describe("orchestrator config tickets", () => {
  test("defaults tickets disabled", () => {
    const config = parseOrchestratorConfig({});
    expect(config.tickets?.enabled).toBe(false);
    expect(config.tickets?.autoFromMemoryTodos).toBe(false);
    expect(config.tickets?.linear?.enabled).toBe(false);
  });

  test("parses tickets enabled true", () => {
    const config = parseOrchestratorConfig({ tickets: { enabled: true } });
    expect(config.tickets?.enabled).toBe(true);
    expect(config.tickets?.linear?.enabled).toBe(false);
  });

  test("parses full tickets config", () => {
    const config = parseOrchestratorConfig({
      tickets: {
        enabled: true,
        storePath: "/tmp/tickets.json",
        autoFromMemoryTodos: true,
        linear: {
          enabled: true,
          teamId: "team-123",
        },
      },
    });

    expect(config.tickets?.enabled).toBe(true);
    expect(config.tickets?.storePath).toBe("/tmp/tickets.json");
    expect(config.tickets?.autoFromMemoryTodos).toBe(true);
    expect(config.tickets?.linear?.enabled).toBe(true);
    expect(config.tickets?.linear?.teamId).toBe("team-123");
  });
});
