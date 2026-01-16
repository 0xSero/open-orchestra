import { describe, test, expect } from "bun:test"

// Note: Full integration tests require a running OpenCode server.
// These are unit tests for the module structure.

describe("Maestro", () => {
  test("can import runWorkflow", async () => {
    const { runWorkflow } = await import("../src/maestro")
    expect(typeof runWorkflow).toBe("function")
  })

  test("records failed run when workflow missing", async () => {
    const { runWorkflow } = await import("../src/maestro")
    const { createRuntime } = await import("../src/tools")
    const runtime = createRuntime()

    const store = {
      getWorkflow: async () => undefined,
    }

    await runWorkflow("missing", "sess", store as any, runtime, {} as any)

    expect(runtime.workflowRuns.size).toBe(1)
    const run = Array.from(runtime.workflowRuns.values())[0]
    expect(run.status).toBe("failed")
    expect(run.completedAt).toBeDefined()
  })

  test("records run lifecycle and step summaries", async () => {
    const { runWorkflow } = await import("../src/maestro")
    const { createRuntime } = await import("../src/tools")
    const runtime = createRuntime()

    const store = {
      getWorkflow: async (id: string) => ({
        id,
        name: "Test Workflow",
        steps: [
          {
            step: 1,
            name: "Step One",
            worker: "worker-1",
            prompt: "Do the thing",
            verification: "contains:OK"
          },
          {
            step: 2,
            name: "Step Two",
            worker: "worker-1",
            prompt: "Do the next thing"
          }
        ]
      }),
      getWorker: async (id: string) => ({
        id,
        name: "Worker",
        description: "Test worker",
        runtime: "subagent"
      })
    }

    let createCount = 0
    const responses = ["OK result", "Second result"]
    const client = {
      session: {
        create: async () => ({ data: { id: `sess_${++createCount}` } }),
        prompt: async () => ({
          data: { parts: [{ type: "text", text: responses.shift() ?? "" }] }
        })
      }
    }

    const updates: string[] = []
    const result = await runWorkflow(
      "workflow-1",
      "sess-orch",
      store as any,
      runtime,
      client as any,
      async () => {
        const run = Array.from(runtime.workflowRuns.values())[0]
        if (run) updates.push(run.status)
      }
    )

    const runState = Array.from(runtime.workflowRuns.values())[0]
    expect(runState.status).toBe("completed")
    expect(runState.completedAt).toBeDefined()
    expect(runState.steps.length).toBe(2)
    expect(runState.steps[0]?.status).toBe("completed")
    expect((runState.steps[0] as any).result).toBeUndefined()
    expect(result.status).toBe("completed")
    expect(updates[0]).toBe("running")
    expect(updates[updates.length - 1]).toBe("completed")
  })

  test("marks run failed on verification failure", async () => {
    const { runWorkflow } = await import("../src/maestro")
    const { createRuntime } = await import("../src/tools")
    const runtime = createRuntime()

    const store = {
      getWorkflow: async (id: string) => ({
        id,
        name: "Fail Workflow",
        steps: [
          {
            step: 1,
            name: "Step Fail",
            worker: "worker-1",
            prompt: "Do the thing",
            verification: "contains:OK"
          }
        ]
      }),
      getWorker: async (id: string) => ({
        id,
        name: "Worker",
        description: "Test worker",
        runtime: "subagent"
      })
    }

    const client = {
      session: {
        create: async () => ({ data: { id: "sess_fail" } }),
        prompt: async () => ({ data: { parts: [{ type: "text", text: "NOPE" }] } })
      }
    }

    await runWorkflow("workflow-fail", "sess-orch", store as any, runtime, client as any)

    const runState = Array.from(runtime.workflowRuns.values())[0]
    expect(runState.status).toBe("failed")
    expect(runState.completedAt).toBeDefined()
    expect(runState.steps[0]?.status).toBe("failed")
    expect(runState.steps[0]?.error).toContain("Verification failed")
  })

  test("marks run failed on worker error", async () => {
    const { runWorkflow } = await import("../src/maestro")
    const { createRuntime } = await import("../src/tools")
    const runtime = createRuntime()

    const store = {
      getWorkflow: async (id: string) => ({
        id,
        name: "Error Workflow",
        steps: [
          {
            step: 1,
            name: "Step Error",
            worker: "worker-1",
            prompt: "Do the thing"
          }
        ]
      }),
      getWorker: async (id: string) => ({
        id,
        name: "Worker",
        description: "Test worker",
        runtime: "subagent"
      })
    }

    const client = {
      session: {
        create: async () => ({ data: { id: "sess_error" } }),
        prompt: async () => {
          throw new Error("worker failed")
        }
      }
    }

    await runWorkflow("workflow-error", "sess-orch", store as any, runtime, client as any)

    const runState = Array.from(runtime.workflowRuns.values())[0]
    expect(runState.status).toBe("failed")
    expect(runState.completedAt).toBeDefined()
    expect(runState.steps[0]?.status).toBe("failed")
    expect(runState.steps[0]?.error).toContain("worker failed")
  })
})
