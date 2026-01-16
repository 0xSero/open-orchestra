import type { createOpencodeClient } from "@opencode-ai/sdk"
import type { Store } from "./store"
import type { Runtime } from "./tools"
import type { WorkflowRunState, WorkflowStep } from "./types"

type Client = ReturnType<typeof createOpencodeClient>

export type StepResult = {
  step: number
  name: string
  status: "completed" | "failed" | "skipped"
  result?: string
  error?: string
  workerInstanceId?: string
  verification?: {
    type: string
    passed: boolean
    message?: string
  }
}

export type MaestroResult = {
  runId: string
  workflowId: string
  status: "completed" | "failed"
  steps: StepResult[]
  startedAt: string
  completedAt: string
}

// Generate unique ID
function generateId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`
}

// Current timestamp
function now(): string {
  return new Date().toISOString()
}

// Verify step result
async function verifyStep(
  verification: string | undefined,
  result: string,
  store: Store,
  _runtime: Runtime,
  client: Client,
  orchestratorSessionId: string
): Promise<{ passed: boolean; type: string; message?: string }> {
  if (!verification) {
    return { passed: true, type: "none" }
  }

  // contains:TEXT - check if result contains text
  if (verification.startsWith("contains:")) {
    const expected = verification.slice("contains:".length)
    const passed = result.includes(expected)
    return {
      type: "contains",
      passed,
      message: passed ? `Found "${expected}"` : `Missing "${expected}"`
    }
  }

  // files_exist:path1,path2 - check files exist
  if (verification.startsWith("files_exist:")) {
    const paths = verification.slice("files_exist:".length).split(",").map(p => p.trim())
    const missing: string[] = []

    for (const path of paths) {
      try {
        const resp = await client.file.read({ query: { path } })
        if (!resp.data?.content) {
          missing.push(path)
        }
      } catch {
        missing.push(path)
      }
    }

    return {
      type: "files_exist",
      passed: missing.length === 0,
      message: missing.length === 0 ? "All files exist" : `Missing: ${missing.join(", ")}`
    }
  }

  // delegate:worker_id - send to another worker for verification
  if (verification.startsWith("delegate:")) {
    const workerId = verification.slice("delegate:".length)
    const worker = await store.getWorker(workerId)

    if (!worker) {
      return { type: "delegate", passed: false, message: `Worker not found: ${workerId}` }
    }

    // Spawn verifier worker
    const session = await client.session.create({
      body: {
        parentID: orchestratorSessionId,
        title: `${worker.name} (verifier)`
      }
    })

    if (!session.data) {
      return { type: "delegate", passed: false, message: "Failed to create verifier session" }
    }

    // Ask verifier to review
    const verifyPrompt = `Review the following result and determine if it is acceptable.

RESULT TO VERIFY:
${result}

Respond with exactly one of:
- APPROVED: <reason>
- REJECTED: <reason>`

    const resp = await client.session.prompt({
      path: { id: session.data.id },
      body: {
        model: worker.model ? {
          providerID: worker.model.split("/")[0],
          modelID: worker.model.split("/")[1]
        } : undefined,
        parts: [{ type: "text", text: verifyPrompt }]
      }
    })

    const parts = resp.data?.parts ?? []
    const text = parts.filter((p: any) => p.type === "text").map((p: any) => p.text).join("\n")
    const passed = text.toUpperCase().includes("APPROVED")

    // Cleanup verifier session
    try {
      await client.session.abort({ path: { id: session.data.id } })
    } catch {}

    return {
      type: "delegate",
      passed,
      message: text.slice(0, 200)
    }
  }

  // Unknown verification type
  return { type: "unknown", passed: true, message: `Unknown verification: ${verification}` }
}

// Spawn or reuse worker for a step
async function getWorkerForStep(
  step: WorkflowStep,
  runtime: Runtime,
  store: Store,
  client: Client,
  orchestratorSessionId: string
): Promise<{ instanceId: string; sessionId: string } | { error: string }> {
  const worker = await store.getWorker(step.worker)
  if (!worker) {
    return { error: `Worker not found: ${step.worker}` }
  }

  // Check if we have an available instance
  for (const instance of runtime.instances.values()) {
    if (instance.workerId === step.worker && instance.status === "available" && instance.sessionId) {
      return { instanceId: instance.instanceId, sessionId: instance.sessionId }
    }
  }

  // Spawn new instance
  const session = await client.session.create({
    body: {
      parentID: worker.runtime === "subagent" ? orchestratorSessionId : undefined,
      title: `${worker.name} (workflow)`
    }
  })

  if (!session.data) {
    return { error: "Failed to create worker session" }
  }

  const instanceId = generateId("wkr")
  const createdAt = now()

  runtime.instances.set(instanceId, {
    instanceId,
    workerId: worker.id,
    runtime: worker.runtime,
    status: "available",
    sessionId: session.data.id,
    parentSessionId: worker.runtime === "subagent" ? orchestratorSessionId : undefined,
    model: worker.model,
    createdAt,
    lastSeenAt: createdAt
  })

  return { instanceId, sessionId: session.data.id }
}

// Execute a single step
async function executeStep(
  step: WorkflowStep,
  runtime: Runtime,
  store: Store,
  client: Client,
  orchestratorSessionId: string
): Promise<StepResult> {
  // Get or spawn worker
  const workerResult = await getWorkerForStep(step, runtime, store, client, orchestratorSessionId)

  if ("error" in workerResult) {
    return {
      step: step.step,
      name: step.name,
      status: "failed",
      error: workerResult.error
    }
  }

  const { instanceId, sessionId } = workerResult
  const instance = runtime.instances.get(instanceId)!
  instance.status = "busy"
  instance.lastSeenAt = now()

  // Send task
  try {
    const worker = await store.getWorker(step.worker)
    const resp = await client.session.prompt({
      path: { id: sessionId },
      body: {
        model: worker?.model ? {
          providerID: worker.model.split("/")[0],
          modelID: worker.model.split("/")[1]
        } : undefined,
        parts: [{ type: "text", text: step.prompt }]
      }
    })

    instance.status = "available"
    instance.lastSeenAt = now()

    // Extract result
    const parts = resp.data?.parts ?? []
    const result = parts.filter((p: any) => p.type === "text").map((p: any) => p.text).join("\n")

    // Verify
    const verification = await verifyStep(
      step.verification,
      result,
      store,
      runtime,
      client,
      orchestratorSessionId
    )

    if (!verification.passed) {
      return {
        step: step.step,
        name: step.name,
        status: "failed",
        result,
        workerInstanceId: instanceId,
        verification,
        error: `Verification failed: ${verification.message}`
      }
    }

    return {
      step: step.step,
      name: step.name,
      status: "completed",
      result,
      workerInstanceId: instanceId,
      verification
    }
  } catch (err: any) {
    instance.status = "available"
    instance.lastSeenAt = now()

    return {
      step: step.step,
      name: step.name,
      status: "failed",
      error: err?.message ?? String(err),
      workerInstanceId: instanceId
    }
  }
}

// Main workflow runner
export async function runWorkflow(
  workflowId: string,
  orchestratorSessionId: string,
  store: Store,
  runtime: Runtime,
  client: Client,
  onRuntimeUpdate?: () => void | Promise<void>
): Promise<MaestroResult> {
  const startedAt = now()
  const runId = generateId("run")

  const runState: WorkflowRunState = {
    runId,
    workflowId,
    status: "running",
    startedAt,
    steps: []
  }

  runtime.workflowRuns.set(runId, runState)
  if (onRuntimeUpdate) await onRuntimeUpdate()

  // Load workflow
  const workflow = await store.getWorkflow(workflowId)
  if (!workflow) {
    runState.status = "failed"
    runState.steps = []
    runState.completedAt = now()
    runtime.workflowRuns.set(runId, runState)
    if (onRuntimeUpdate) await onRuntimeUpdate()
    return {
      runId,
      workflowId,
      status: "failed",
      steps: [],
      startedAt,
      completedAt: now()
    }
  }

  const maxIterations = workflow.iterations?.max ?? 1
  const steps: StepResult[] = []
  let failed = false

  // Execute steps in order
  for (const step of workflow.steps) {
    let attempts = 0
    let stepResult: StepResult | null = null

    while (attempts < maxIterations) {
      attempts++
      stepResult = await executeStep(step, runtime, store, client, orchestratorSessionId)

      if (stepResult.status === "completed") {
        break
      }

      // If fixed mode, don't retry
      if (workflow.iterations?.mode === "fixed") {
        break
      }
    }

    if (stepResult) {
      steps.push(stepResult)
      runState.steps.push({
        step: stepResult.step,
        name: stepResult.name,
        status: stepResult.status,
        workerInstanceId: stepResult.workerInstanceId,
        verification: stepResult.verification,
        error: stepResult.error
      })
      runtime.workflowRuns.set(runId, runState)
      if (onRuntimeUpdate) await onRuntimeUpdate()

      if (stepResult.status === "failed") {
        failed = true
        break // Stop on first failure
      }
    }
  }

  runState.status = failed ? "failed" : "completed"
  runState.completedAt = now()
  runtime.workflowRuns.set(runId, runState)
  if (onRuntimeUpdate) await onRuntimeUpdate()

  return {
    runId,
    workflowId,
    status: failed ? "failed" : "completed",
    steps,
    startedAt,
    completedAt: now()
  }
}
