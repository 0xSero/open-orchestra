import { describe, test, expect, beforeEach } from "bun:test"
import { buildRuntimeState, createRuntime, createTools, sortMemoryEntries, type Runtime } from "../src/tools"
import { createIntegrationManager } from "../src/integrations"
import type { Job, MemoryEntry, WorkerInstance, WorkflowRunState } from "../src/types"

describe("Runtime", () => {
  let runtime: Runtime

  beforeEach(() => {
    runtime = createRuntime()
  })

  test("starts with empty instances and jobs", () => {
    expect(runtime.instances.size).toBe(0)
    expect(runtime.jobs.size).toBe(0)
    expect(runtime.workflowRuns.size).toBe(0)
    expect(runtime.memoryEntries.size).toBe(0)
  })

  test("can track worker instances", () => {
    const instance: WorkerInstance = {
      instanceId: "wkr_test",
      workerId: "reader",
      runtime: "subagent",
      status: "available",
      sessionId: "sess_123",
      createdAt: new Date().toISOString(),
      lastSeenAt: new Date().toISOString()
    }
    runtime.instances.set(instance.instanceId, instance)

    expect(runtime.instances.get("wkr_test")).toEqual(instance)
    expect(runtime.instances.size).toBe(1)
  })

  test("can track async jobs", () => {
    const job: Job = {
      jobId: "job_test",
      orchestratorSessionId: "sess_orch",
      workerInstanceId: "wkr_test",
      workerSessionId: "sess_worker",
      status: "running",
      createdAt: new Date().toISOString()
    }
    runtime.jobs.set(job.jobId, job)

    expect(runtime.jobs.get("job_test")?.status).toBe("running")
  })

  test("memory_record stores memory entries", async () => {
    const store = {
      baseDir: "/tmp",
      listWorkers: async () => [],
      getWorker: async () => undefined,
      saveWorker: async () => undefined,
      deleteWorker: async () => undefined,
      listWorkflows: async () => [],
      getWorkflow: async () => undefined,
      saveWorkflow: async () => undefined,
      deleteWorkflow: async () => undefined,
      listIntegrations: async () => [],
      getIntegration: async () => undefined,
      saveIntegration: async () => undefined,
      deleteIntegration: async () => undefined,
    }

    const integrations = createIntegrationManager()
    const tools = createTools(store as any, runtime, integrations, {} as any)

    const result = await tools.memory_record.execute({
      content: "Remember this",
      tags: ["test"],
      source: "unit-test",
    }, {} as any)

    const parsed = JSON.parse(result) as MemoryEntry
    expect(parsed.content).toBe("Remember this")
    expect(runtime.memoryEntries.get(parsed.id)?.source).toBe("unit-test")
  })

  test("memory_record updates existing entry and preserves createdAt", async () => {
    const store = {
      baseDir: "/tmp",
      listWorkers: async () => [],
      getWorker: async () => undefined,
      saveWorker: async () => undefined,
      deleteWorker: async () => undefined,
      listWorkflows: async () => [],
      getWorkflow: async () => undefined,
      saveWorkflow: async () => undefined,
      deleteWorkflow: async () => undefined,
      listIntegrations: async () => [],
      getIntegration: async () => undefined,
      saveIntegration: async () => undefined,
      deleteIntegration: async () => undefined,
    }

    const integrations = createIntegrationManager()
    const tools = createTools(store as any, runtime, integrations, {} as any)

    const first = await tools.memory_record.execute({
      id: "mem-1",
      content: "First",
      tags: ["alpha"]
    }, {} as any)
    const createdAt = (JSON.parse(first) as MemoryEntry).createdAt

    const second = await tools.memory_record.execute({
      id: "mem-1",
      content: "Second",
      tags: ["beta"]
    }, {} as any)
    const updated = JSON.parse(second) as MemoryEntry

    expect(updated.id).toBe("mem-1")
    expect(updated.content).toBe("Second")
    expect(updated.createdAt).toBe(createdAt)
    expect(runtime.memoryEntries.size).toBe(1)
  })

  test("sortMemoryEntries orders by createdAt", () => {
    const entries: MemoryEntry[] = [
      { id: "mem-2", content: "two", createdAt: "2025-01-01T00:00:02.000Z" },
      { id: "mem-1", content: "one", createdAt: "2025-01-01T00:00:01.000Z" },
      { id: "mem-3", content: "three", createdAt: "2025-01-01T00:00:03.000Z" }
    ]

    const sorted = sortMemoryEntries(entries)
    expect(sorted.map(entry => entry.id)).toEqual(["mem-1", "mem-2", "mem-3"])
  })

  test("buildRuntimeState includes integrations, workflow runs, and memories", () => {
    const integrations = createIntegrationManager()

    const instance: WorkerInstance = {
      instanceId: "wkr_state",
      workerId: "coder",
      runtime: "subagent",
      status: "available",
      sessionId: "sess_state",
      createdAt: "2025-01-01T00:00:00.000Z",
      lastSeenAt: "2025-01-01T00:00:10.000Z"
    }
    runtime.instances.set(instance.instanceId, instance)

    const job: Job = {
      jobId: "job_state",
      orchestratorSessionId: "sess_orch",
      workerInstanceId: instance.instanceId,
      workerSessionId: "sess_worker",
      workerId: "coder",
      status: "running",
      createdAt: "2025-01-01T00:00:15.000Z"
    }
    runtime.jobs.set(job.jobId, job)

    const runState: WorkflowRunState = {
      runId: "run_state",
      workflowId: "wf_1",
      status: "running",
      startedAt: "2025-01-01T00:00:20.000Z",
      steps: []
    }
    runtime.workflowRuns.set(runState.runId, runState)

    const memoryEntry: MemoryEntry = {
      id: "mem_state",
      content: "Remember this",
      createdAt: "2025-01-01T00:00:25.000Z"
    }
    runtime.memoryEntries.set(memoryEntry.id, memoryEntry)

    integrations.instances.set("int_ready", {
      integrationId: "int_ready",
      status: "ready",
      process: { pid: 123 },
      port: 4321,
      startedAt: "2025-01-01T00:00:30.000Z"
    })
    integrations.instances.set("int_error", {
      integrationId: "int_error",
      status: "error",
      startedAt: "2025-01-01T00:00:40.000Z",
      error: "boom"
    })
    integrations.instances.set("int_stopped", {
      integrationId: "int_stopped",
      status: "stopped",
      startedAt: "2025-01-01T00:00:50.000Z"
    })

    const state = buildRuntimeState(runtime, integrations, "2025-01-01T00:00:55.000Z")

    expect(state.timestamp).toBe("2025-01-01T00:00:55.000Z")
    expect(state.instances[0]?.id).toBe("wkr_state")
    expect(state.instances[0]?.instanceId).toBe("wkr_state")
    expect(state.jobs[0]?.jobId).toBe("job_state")
    expect(state.workflowRuns[0]?.runId).toBe("run_state")
    expect(state.memoryEntries[0]?.id).toBe("mem_state")

    const ready = state.integrationInstances.find(item => item.integrationId === "int_ready")
    const errored = state.integrationInstances.find(item => item.integrationId === "int_error")
    const stopped = state.integrationInstances.find(item => item.integrationId === "int_stopped")

    expect(ready?.pid).toBe(123)
    expect(ready?.url).toBe("http://localhost:4321")
    expect((ready as any)?.process).toBeUndefined()
    expect(errored?.error).toBe("boom")
    expect(stopped?.pid).toBeUndefined()
  })
})
