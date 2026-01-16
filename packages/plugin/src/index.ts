import type { Plugin } from "@opencode-ai/plugin"
import { createFileStore } from "./store"
import { buildRuntimeState, createRuntime, createTools, sortMemoryEntries, type Runtime } from "./tools"
import { createIntegrationManager } from "./integrations"
import { listSkills, writeSkillsState } from "./skills"
import { join } from "node:path"
import { appendFile, mkdir, writeFile, readdir, readFile, access } from "node:fs/promises"
import { fileURLToPath } from "node:url"

async function syncTemplateDirectory(sourceDir: string, targetDir: string) {
  const entries = await readdir(sourceDir, { withFileTypes: true }).catch(() => null)
  if (!entries) return

  await mkdir(targetDir, { recursive: true })

  for (const entry of entries) {
    const sourcePath = join(sourceDir, entry.name)
    const targetPath = join(targetDir, entry.name)

    if (entry.isDirectory()) {
      await syncTemplateDirectory(sourcePath, targetPath)
      continue
    }

    try {
      await access(targetPath)
      continue
    } catch {}

    const content = await readFile(sourcePath)
    await writeFile(targetPath, content)
  }
}

async function ensurePluginTemplates(directory: string) {
  try {
    const pluginRoot = fileURLToPath(new URL("..", import.meta.url))
    await syncTemplateDirectory(join(pluginRoot, ".opencode", "agent"), join(directory, ".opencode", "agent"))
    await syncTemplateDirectory(join(pluginRoot, ".opencode", "workforce"), join(directory, ".opencode", "workforce"))
  } catch {}
}

// Write runtime state to file for UI consumption
async function writeRuntimeState(directory: string, runtime: Runtime, integrations: ReturnType<typeof createIntegrationManager>) {
  const runtimeDir = join(directory, ".opencode", "workforce")
  await mkdir(runtimeDir, { recursive: true })

  const state = buildRuntimeState(runtime, integrations)

  await writeFile(
    join(runtimeDir, "runtime.json"),
    JSON.stringify(state, null, 2)
  )
}

async function writeSkillState(directory: string) {
  const state = await listSkills(directory)
  await writeSkillsState(directory, state)
}

async function writeMemoryState(directory: string, runtime: Runtime) {
  const runtimeDir = join(directory, ".opencode", "workforce")
  await mkdir(runtimeDir, { recursive: true })
  const entries = sortMemoryEntries(Array.from(runtime.memoryEntries.values()))
  await writeFile(
    join(runtimeDir, "memories.json"),
    JSON.stringify({ entries }, null, 2)
  )
}

export type { Worker, WorkerInstance, Job, Workflow, WorkflowStep, WorkflowRun, WorkflowRunState, Integration, WorkerIntegration, IntegrationInstance, MemoryEntry } from "./types"
export type { LinearTeam, LinearWorkflowState, LinearProject, LinearLabel, LinearUser, LinearIssue, LinearData, CreateIssueInput } from "./linear-types"
export { createLinearClient, type LinearClient } from "./linear-client"
export { createFileStore, type Store } from "./store"
export { createRuntime, createTools, type Runtime } from "./tools"
export { createIntegrationManager, type IntegrationManager } from "./integrations"
export { runWorkflow, type MaestroResult, type StepResult } from "./maestro"

export const OrchestraPlugin: Plugin = async ({ directory, client }) => {
  await ensurePluginTemplates(directory)
  const store = createFileStore(join(directory, ".opencode", "workforce"))
  const runtime = createRuntime()
  const integrations = createIntegrationManager()

  // Load integration definitions
  await integrations.loadDefinitions(directory)

  await writeSkillState(directory).catch(() => undefined)

  // Create tools with callback to write runtime state
  const tools = createTools(store, runtime, integrations, client, () => {
    writeRuntimeState(directory, runtime, integrations)
    writeMemoryState(directory, runtime)
  })

  return {
    tool: tools,

    async event({ event }) {
      // Write runtime state on every session status event
      if (event.type === "session.status") {
        await writeRuntimeState(directory, runtime, integrations)
        await writeMemoryState(directory, runtime)
        await writeSkillState(directory).catch(() => undefined)
      }

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
