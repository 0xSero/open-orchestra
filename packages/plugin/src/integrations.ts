import { readFile } from "node:fs/promises"
import { join } from "node:path"
import type { Integration, IntegrationInstance } from "./types"
import type { Store } from "./store"

export type IntegrationManager = {
  definitions: Map<string, Integration>
  instances: Map<string, IntegrationInstance>

  loadDefinitions(directory: string): Promise<void>
  start(integrationId: string): Promise<IntegrationInstance>
  stop(integrationId: string): Promise<void>
  stopAll(): Promise<void>

  getInstructions(workerId: string, store: Store): Promise<string>
  getTools(workerId: string, store: Store): Promise<string[]>
}

async function readJson<T>(path: string, fallback: T): Promise<T> {
  try {
    const content = await readFile(path, "utf-8")
    return JSON.parse(content) as T
  } catch {
    return fallback
  }
}

async function waitForHealth(check: string, timeoutMs: number): Promise<void> {
  const start = Date.now()

  while (Date.now() - start < timeoutMs) {
    try {
      if (check.startsWith("http")) {
        // HTTP health check
        const response = await fetch(check)
        if (response.ok) return
      } else {
        // Command health check - not implemented yet
        // Could use Bun.spawn to run command
      }
    } catch {
      // Health check failed, retry
    }
    await new Promise(resolve => setTimeout(resolve, 500))
  }

  throw new Error(`Health check timed out after ${timeoutMs}ms: ${check}`)
}

export function createIntegrationManager(): IntegrationManager {
  const definitions = new Map<string, Integration>()
  const instances = new Map<string, IntegrationInstance>()

  const now = () => new Date().toISOString()

  return {
    definitions,
    instances,

    async loadDefinitions(directory: string) {
      // Load global integrations
      const globalPath = join(directory, ".opencode", "workforce", "integrations.json")
      const globalData = await readJson<{ integrations: Integration[] }>(globalPath, { integrations: [] })

      for (const integration of globalData.integrations) {
        definitions.set(integration.id, integration)
      }

      // Load local overrides
      const localPath = join(directory, ".opencode", "workforce", "integrations.local.json")
      const localData = await readJson<{ overrides?: Record<string, Partial<Integration>> }>(localPath, {})

      // Apply overrides
      if (localData.overrides) {
        for (const [id, overrides] of Object.entries(localData.overrides)) {
          const existing = definitions.get(id)
          if (existing) {
            definitions.set(id, { ...existing, ...overrides })
          }
        }
      }
    },

    async start(integrationId: string) {
      const def = definitions.get(integrationId)
      if (!def) {
        throw new Error(`Integration not found: ${integrationId}`)
      }

      // Already running?
      const existing = instances.get(integrationId)
      if (existing?.status === "ready") {
        return existing
      }

      // Create instance
      const instance: IntegrationInstance = {
        integrationId,
        status: "starting",
        startedAt: now()
      }
      instances.set(integrationId, instance)

      // Handle based on process type
      if (def.process) {
        try {
          instance.port = def.process.port

          // Only spawn if there's a command (mcp, stdio types)
          if (def.process.command) {
            const args = def.process.args ?? []
            const env = { ...process.env, ...(def.process.env ?? {}) }
            const cwd = def.process.cwd ?? process.cwd()

            // Use Bun.spawn for process management
            const proc = Bun.spawn([def.process.command, ...args], {
              cwd,
              env,
              stdout: "pipe",
              stderr: "pipe"
            })

            instance.process = proc
          }

          // Wait for health check if specified (works for both spawned and external)
          if (def.process.healthCheck) {
            await waitForHealth(def.process.healthCheck, 30000)
          } else if (def.process.command) {
            // Only wait for spawned processes without health check
            await new Promise(resolve => setTimeout(resolve, 1000))
          }

          instance.status = "ready"

        } catch (err: any) {
          instance.status = "error"
          instance.error = err?.message ?? String(err)
          throw err
        }
      } else {
        // No process needed (just instructions)
        instance.status = "ready"
      }

      return instance
    },

    async stop(integrationId: string) {
      const instance = instances.get(integrationId)
      if (!instance) return

      if (instance.process) {
        try {
          instance.process.kill()
        } catch {
          // Process may already be dead
        }
      }

      instance.status = "stopped"
      instances.delete(integrationId)
    },

    async stopAll() {
      for (const id of instances.keys()) {
        await this.stop(id)
      }
    },

    async getInstructions(workerId: string, store: Store) {
      const worker = await store.getWorker(workerId)
      if (!worker?.integrations) return ""

      const instructions: string[] = []

      for (const binding of worker.integrations) {
        if (binding.enabled === false) continue

        const def = definitions.get(binding.integrationId)
        if (def?.instructions) {
          instructions.push(def.instructions)
        }
      }

      return instructions.join("\n\n---\n\n")
    },

    async getTools(workerId: string, store: Store) {
      const worker = await store.getWorker(workerId)
      if (!worker?.integrations) return []

      const tools: string[] = []

      for (const binding of worker.integrations) {
        if (binding.enabled === false) continue

        const def = definitions.get(binding.integrationId)
        if (def?.tools) {
          tools.push(...def.tools)
        }
      }

      return tools
    }
  }
}
