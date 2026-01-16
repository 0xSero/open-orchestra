import { describe, expect, test } from "bun:test";
import { mapIntegrationInstances } from "./orchestra-servers-tab-helpers";

describe("ServersTab helpers", () => {
  test("maps integration instances with graceful labels", () => {
    const rows = mapIntegrationInstances([
      {
        integrationId: "context7",
        status: "ready",
        pid: 123,
        url: "http://localhost:4000",
        startedAt: "2024-01-01T00:00:00.000Z",
      },
      {
        integrationId: "memory",
        status: "error",
        startedAt: "2024-01-01T01:00:00.000Z",
        error: "failed",
      },
    ]);

    expect(rows).toHaveLength(2);
    expect(rows[0]?.pidLabel).toBe("123");
    expect(rows[1]?.pidLabel).toBe("—");
    expect(rows[1]?.urlLabel).toBe("—");
    expect(rows[1]?.status).toBe("error");
  });
});
