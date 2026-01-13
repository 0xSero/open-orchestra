import { describe, test, expect, beforeEach } from "bun:test"
import { createRuntime, type Runtime } from "../src/tools"
import type { WorkerInstance, Job } from "../src/types"

describe("Runtime", () => {
  let runtime: Runtime

  beforeEach(() => {
    runtime = createRuntime()
  })

  test("starts with empty instances and jobs", () => {
    expect(runtime.instances.size).toBe(0)
    expect(runtime.jobs.size).toBe(0)
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
})
