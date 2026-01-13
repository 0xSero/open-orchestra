import { tool, type ToolDefinition } from "@opencode-ai/plugin"
import type { createOpencodeClient } from "@opencode-ai/sdk"
import type { Store } from "./store"
import type { WorkerInstance, Job, Worker } from "./types"
import type { IntegrationManager } from "./integrations"
import { runWorkflow } from "./maestro"

type Client = ReturnType<typeof createOpencodeClient>
type Tools = Record<string, ToolDefinition>

// Runtime state (in-memory)
export type Runtime = {
  instances: Map<string, WorkerInstance>
  jobs: Map<string, Job>
}

export function createRuntime(): Runtime {
  return {
    instances: new Map(),
    jobs: new Map()
  }
}

// Utility: generate ID
function generateId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`
}

// Utility: current ISO timestamp
function now(): string {
  return new Date().toISOString()
}

// Get or spawn a worker instance
async function getOrSpawnWorker(
  workerId: string,
  store: Store,
  runtime: Runtime,
  integrations: IntegrationManager,
  client: Client,
  orchestratorSessionId: string
): Promise<{ instance: WorkerInstance; sessionId: string; instructions?: string } | { error: string }> {
  const worker = await store.getWorker(workerId)
  if (!worker) {
    return { error: `Worker not found: ${workerId}` }
  }

  // Check for existing available instance
  for (const instance of runtime.instances.values()) {
    if (instance.workerId === workerId && instance.status === "available" && instance.sessionId) {
      return { instance, sessionId: instance.sessionId }
    }
  }

  // Start integrations for this worker before spawning
  if (worker.integrations) {
    for (const binding of worker.integrations) {
      if (binding.enabled !== false) {
        try {
          await integrations.start(binding.integrationId)
        } catch {
          // Silently continue - integration failure shouldn't block worker
          // Errors are tracked in integration instance status
        }
      }
    }
  }

  // Get integration instructions for this worker
  const instructions = await integrations.getInstructions(workerId, store)

  // Spawn new instance
  const isSubagent = worker.runtime === "subagent"
  const session = await client.session.create({
    body: {
      parentID: isSubagent ? orchestratorSessionId : undefined,
      title: `${worker.name} (${worker.runtime})`
    }
  })

  if (!session.data) {
    return { error: "Failed to create worker session" }
  }

  const instanceId = generateId("wkr")
  const createdAt = now()

  const instance: WorkerInstance = {
    instanceId,
    workerId: worker.id,
    runtime: worker.runtime,
    status: "available",
    sessionId: session.data.id,
    parentSessionId: isSubagent ? orchestratorSessionId : undefined,
    model: worker.model,
    createdAt,
    lastSeenAt: createdAt
  }

  runtime.instances.set(instanceId, instance)
  return { instance, sessionId: session.data.id, instructions }
}

export function createTools(store: Store, runtime: Runtime, integrations: IntegrationManager, client: Client): Tools {
  return {
    // List worker templates and active instances
    workers: tool({
      description: "List available worker templates and currently active worker instances",
      args: {},
      async execute(_args, ctx) {
        const templates = await store.listWorkers()
        const instances = Array.from(runtime.instances.values())
        const jobs = Array.from(runtime.jobs.values())

        return JSON.stringify({
          templates: templates.map(w => ({
            id: w.id,
            name: w.name,
            description: w.description,
            runtime: w.runtime,
            model: w.model
          })),
          instances: instances.map(i => ({
            instanceId: i.instanceId,
            workerId: i.workerId,
            status: i.status,
            sessionId: i.sessionId,
            runtime: i.runtime,
            createdAt: i.createdAt,
            lastSeenAt: i.lastSeenAt
          })),
          jobs: jobs.map(j => ({
            jobId: j.jobId,
            status: j.status,
            workerSessionId: j.workerSessionId,
            workerInstanceId: j.workerInstanceId,
            createdAt: j.createdAt,
            completedAt: j.completedAt
          })),
          orchestratorSessionId: ctx.sessionID
        }, null, 2)
      }
    }),

    // Delegate work to a worker (for agent/server runtimes only)
    delegate: tool({
      description: "Spawn SERVICE agents (docs, memory) that stay alive. NEVER use for reader/coder/reviewer - those are subagents that MUST use the native Task tool. Only for runtime:agent or runtime:server workers.",
      args: {
        to: tool.schema.string().describe("Service worker ID like 'docs' or 'memory' (NOT 'reader', 'coder', 'reviewer' - those MUST use Task tool)"),
        task: tool.schema.string().describe("The task to delegate"),
        async: tool.schema.boolean().optional().describe("Run asynchronously (default: false). Always use async:true for service agents.")
      },
      async execute(args, ctx) {
        // CRITICAL: Only orchestrator should use delegate
        // Get current session info to verify caller
        const sessionInfo = await client.session.get({ path: { id: ctx.sessionID } }).catch(() => null)
        const sessionAgent = (sessionInfo?.data as any)?.agent

        // If this is being called from a subagent (reader, coder, reviewer), REJECT
        if (sessionAgent && !["orchestrator", "primary"].includes(sessionAgent)) {
          return JSON.stringify({
            error: "UNAUTHORIZED: delegate tool can only be used by the orchestrator",
            hint: "Subagents (reader, coder, reviewer) must use Task tool for spawning or query tool for asking services questions.",
            calledFrom: sessionAgent
          })
        }

        // Check worker runtime first
        const worker = await store.getWorker(args.to)
        if (!worker) {
          return JSON.stringify({ error: `Worker not found: ${args.to}` })
        }

        // Reject subagent runtime - should use native Task tool
        if (worker.runtime === "subagent") {
          return JSON.stringify({
            error: `Worker "${args.to}" has runtime:subagent. Use the native Task tool instead: Task(subagent_type: "${args.to}", prompt: "...")`,
            hint: "The delegate tool is only for agent and server runtime workers."
          })
        }

        // Get or spawn worker
        const result = await getOrSpawnWorker(args.to, store, runtime, integrations, client, ctx.sessionID)

        if ("error" in result) {
          return JSON.stringify({ error: result.error })
        }

        const { instance, sessionId, instructions } = result

        // Prepend integration instructions to task if available
        const taskWithInstructions = instructions
          ? `${instructions}\n\n---\n\n${args.task}`
          : args.task

        instance.status = "busy"
        instance.lastSeenAt = now()

        // Async mode: fire and track
        if (args.async) {
          const jobId = generateId("job")
          const job: Job = {
            jobId,
            orchestratorSessionId: ctx.sessionID,
            workerInstanceId: instance.instanceId,
            workerSessionId: sessionId,
            status: "running",
            createdAt: now()
          }
          runtime.jobs.set(jobId, job)

          // Fire without waiting
          client.session.prompt({
            path: { id: sessionId },
            body: {
              model: worker?.model ? {
                providerID: worker.model.split("/")[0],
                modelID: worker.model.split("/")[1]
              } : undefined,
              parts: [{ type: "text", text: taskWithInstructions }]
            }
          }).catch(() => {
            job.status = "failed"
            job.completedAt = now()
          })

          return JSON.stringify({
            mode: "async",
            jobId,
            workerId: args.to,
            instanceId: instance.instanceId,
            message: "Task delegated. Result will be injected when complete."
          }, null, 2)
        }

        // Sync mode: wait for response
        try {
          const response = await client.session.prompt({
            path: { id: sessionId },
            body: {
              model: worker?.model ? {
                providerID: worker.model.split("/")[0],
                modelID: worker.model.split("/")[1]
              } : undefined,
              parts: [{ type: "text", text: taskWithInstructions }]
            }
          })

          instance.status = "available"
          instance.lastSeenAt = now()

          // Extract text from response
          const parts = response.data?.parts ?? []
          const textParts = parts.filter((p: any) => p.type === "text").map((p: any) => p.text)
          const resultText = textParts.join("\n")

          return JSON.stringify({
            mode: "sync",
            workerId: args.to,
            instanceId: instance.instanceId,
            result: resultText.length > 4000 ? resultText.slice(0, 4000) + "\n...(truncated)" : resultText
          }, null, 2)

        } catch (err: any) {
          instance.status = "available"
          instance.lastSeenAt = now()
          return JSON.stringify({ error: err?.message ?? String(err) })
        }
      }
    }),

    // Query a running service agent
    query: tool({
      description: "Ask a question to a running service agent (docs, memory, etc). Automatically waits up to 30 seconds if service is busy initializing.",
      args: {
        service: tool.schema.string().describe("Service worker ID (e.g., 'docs', 'memory')"),
        question: tool.schema.string().describe("The question to ask the service")
      },
      async execute(args, ctx) {
        // Auto-retry logic: wait for service to become available
        const maxRetries = 6  // 6 retries = up to 30 seconds
        const retryDelay = 5000  // 5 seconds between retries

        let serviceInstance: WorkerInstance | undefined
        let attempt = 0

        while (attempt <= maxRetries) {
          // Find running instance of this service
          let busyInstance: WorkerInstance | undefined

          for (const instance of runtime.instances.values()) {
            if (instance.workerId === args.service && instance.sessionId) {
              if (instance.status === "available") {
                serviceInstance = instance
                break
              } else if (instance.status === "busy") {
                busyInstance = instance
              }
            }
          }

          // Found available service - proceed
          if (serviceInstance) break

          // Not found or busy - wait and retry (unless max retries reached)
          if (attempt < maxRetries) {
            attempt++
            await new Promise(resolve => setTimeout(resolve, retryDelay))
            continue
          }

          // Max retries reached
          if (busyInstance) {
            return JSON.stringify({
              error: `Service "${args.service}" is still busy after ${maxRetries * retryDelay / 1000} seconds`,
              hint: "The service is taking longer than expected to initialize. Check service logs.",
              instanceId: busyInstance.instanceId
            })
          } else {
            return JSON.stringify({
              error: `No running service found: ${args.service} after ${maxRetries * retryDelay / 1000} seconds`,
              hint: "Service was never spawned or failed to register. Use: delegate(to: \"${args.service}\", task: \"...\", async: true)"
            })
          }
        }

        if (!serviceInstance || !serviceInstance.sessionId) {
          return JSON.stringify({
            error: `Service "${args.service}" became unavailable`,
            hint: "Service instance was found but lost during retry"
          })
        }

        const worker = await store.getWorker(args.service)
        if (!worker) {
          return JSON.stringify({ error: `Worker not found: ${args.service}` })
        }

        const sessionId = serviceInstance.sessionId

        // Mark as busy while querying
        serviceInstance.status = "busy"
        serviceInstance.lastSeenAt = now()

        try {
          const response = await client.session.prompt({
            path: { id: sessionId },
            body: {
              model: worker.model ? {
                providerID: worker.model.split("/")[0],
                modelID: worker.model.split("/")[1]
              } : undefined,
              parts: [{ type: "text", text: args.question }]
            }
          })

          serviceInstance.status = "available"
          serviceInstance.lastSeenAt = now()

          // Extract text from response
          const parts = response.data?.parts ?? []
          const textParts = parts.filter((p: any) => p.type === "text").map((p: any) => p.text)
          const resultText = textParts.join("\n")

          return JSON.stringify({
            service: args.service,
            instanceId: serviceInstance.instanceId,
            answer: resultText.length > 4000 ? resultText.slice(0, 4000) + "\n...(truncated)" : resultText
          }, null, 2)

        } catch (err: any) {
          serviceInstance.status = "available"
          serviceInstance.lastSeenAt = now()
          return JSON.stringify({ error: err?.message ?? String(err) })
        }
      }
    }),

    // Run a workflow
    workflow: tool({
      description: "Run a predefined workflow by ID. Executes steps in sequence with verification.",
      args: {
        id: tool.schema.string().describe("Workflow ID (e.g., 'workpack')")
      },
      async execute(args, ctx) {
        const result = await runWorkflow(
          args.id,
          ctx.sessionID,
          store,
          runtime,
          client
        )
        return JSON.stringify(result, null, 2)
      }
    })
  }
}
