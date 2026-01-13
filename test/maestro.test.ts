import { describe, test, expect } from "bun:test"

// Note: Full integration tests require a running OpenCode server.
// These are unit tests for the module structure.

describe("Maestro", () => {
  test("can import runWorkflow", async () => {
    const { runWorkflow } = await import("../src/maestro")
    expect(typeof runWorkflow).toBe("function")
  })
})
