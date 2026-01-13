import type { Plugin } from "@opencode-ai/plugin"
import { createFileStore } from "./store"
import { createRuntime, createTools } from "./tools"
import { createIntegrationManager } from "./integrations"
import { join } from "node:path"
import { appendFile, mkdir } from "node:fs/promises"

export type { Worker, WorkerInstance, Job, Workflow, WorkflowStep, WorkflowRun, Integration, WorkerIntegration, IntegrationInstance } from "./types"
export { createFileStore, type Store } from "./store"
export { createRuntime, createTools, type Runtime } from "./tools"
export { createIntegrationManager, type IntegrationManager } from "./integrations"
export { runWorkflow, type MaestroResult, type StepResult } from "./maestro"

export const OrchestraPlugin: Plugin = async ({ directory, client }) => {
  const store = createFileStore(join(directory, ".opencode", "workforce"))
  const runtime = createRuntime()
  const integrations = createIntegrationManager()

  // Load integration definitions
  await integrations.loadDefinitions(directory)

  const tools = createTools(store, runtime, integrations, client)

  return {
    tool: tools,

    async event({ event }) {
      // Wake-up mechanism: when a worker session goes idle,
      // inject result back to orchestrator session as if user message
      if (event.type === "session.status") {
        const payload = event.properties as any

        // DEBUG: Write to file instead of console
        if (payload?.status === "idle") {
          const idleSessionId = payload.id ?? payload.sessionId
          if (!idleSessionId) return

          // Check if this is one of our jobs
          let foundJob = false
          for (const [, job] of runtime.jobs) {
            if (job.status === "running" && job.workerSessionId === idleSessionId) {
              foundJob = true
              break
            }
          }

          // Write debug info to file
          const logDir = join(directory, ".opencode", "workforce")
          await mkdir(logDir, { recursive: true })
          await appendFile(
            join(logDir, "debug.log"),
            `[${new Date().toISOString()}] Session ${idleSessionId} went idle. Found job: ${foundJob}. Total running jobs: ${Array.from(runtime.jobs.values()).filter(j => j.status === "running").length}\n`
          )

          // Find jobs waiting on this session
          for (const [, job] of runtime.jobs) {
            if (job.status === "running" && job.workerSessionId === idleSessionId) {
              // Get worker instance (needed for both success and failure paths)
              const instance = runtime.instances.get(job.workerInstanceId)

              try {
                // Fetch last messages from worker session
                const msgs = await client.session.messages({ path: { id: idleSessionId } })
                const messages = msgs.data ?? []
                const lastMsg = messages[messages.length - 1]

                // Extract text from last message
                const parts = (lastMsg as any)?.parts ?? []
                const textParts = parts
                  .filter((p: any) => p.type === "text")
                  .map((p: any) => p.text)
                const resultText = textParts.join("\n")

                // Get worker info
                const workerId = instance?.workerId ?? "unknown"

                // Inject result into orchestrator session as user-like message
                await client.session.prompt({
                  path: { id: job.orchestratorSessionId },
                  body: {
                    noReply: true, // Don't trigger AI response yet, just inject context
                    parts: [{
                      type: "text",
                      text: `[Worker "${workerId}" completed job ${job.jobId}]\n\n${resultText}`
                    }]
                  }
                })

                job.status = "completed"
                job.completedAt = new Date().toISOString()

                // Mark instance as available for querying
                if (instance) {
                  instance.status = "available"
                  instance.lastSeenAt = new Date().toISOString()
                }

              } catch (err: any) {
                job.status = "failed"
                job.completedAt = new Date().toISOString()

                // Mark instance as available even on failure
                if (instance) {
                  instance.status = "available"
                  instance.lastSeenAt = new Date().toISOString()
                }

                // Still notify orchestrator about the failure
                try {
                  await client.session.prompt({
                    path: { id: job.orchestratorSessionId },
                    body: {
                      noReply: true,
                      parts: [{
                        type: "text",
                        text: `[Worker job ${job.jobId} failed: ${err?.message ?? String(err)}]`
                      }]
                    }
                  })
                } catch {}
              }
            }
          }
        }
      }
    }
  }
}
