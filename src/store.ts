import { readFile, writeFile, mkdir } from "node:fs/promises"
import { join, dirname } from "node:path"
import type { Worker, Workflow, Integration } from "./types"

export type Store = {
  baseDir: string

  // Workers
  listWorkers(): Promise<Worker[]>
  getWorker(id: string): Promise<Worker | undefined>
  saveWorker(worker: Worker): Promise<void>
  deleteWorker(id: string): Promise<void>

  // Workflows
  listWorkflows(): Promise<Workflow[]>
  getWorkflow(id: string): Promise<Workflow | undefined>
  saveWorkflow(workflow: Workflow): Promise<void>
  deleteWorkflow(id: string): Promise<void>

  // Integrations
  listIntegrations(): Promise<Integration[]>
  getIntegration(id: string): Promise<Integration | undefined>
  saveIntegration(integration: Integration): Promise<void>
  deleteIntegration(id: string): Promise<void>
}

async function ensureDir(path: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true })
}

async function readJson<T>(path: string, fallback: T): Promise<T> {
  try {
    const content = await readFile(path, "utf-8")
    return JSON.parse(content) as T
  } catch {
    return fallback
  }
}

async function writeJson(path: string, data: unknown): Promise<void> {
  await ensureDir(path)
  await writeFile(path, JSON.stringify(data, null, 2), "utf-8")
}

export function createFileStore(baseDir: string): Store {
  const workersPath = join(baseDir, "workers.json")
  const workflowsDir = join(baseDir, "workflows")
  const integrationsPath = join(baseDir, "integrations.json")

  return {
    baseDir,

    async listWorkers() {
      const data = await readJson<{ workers: Worker[] }>(workersPath, { workers: [] })
      return data.workers
    },

    async getWorker(id) {
      const workers = await this.listWorkers()
      return workers.find(w => w.id === id)
    },

    async saveWorker(worker) {
      const workers = await this.listWorkers()
      const index = workers.findIndex(w => w.id === worker.id)
      if (index >= 0) {
        workers[index] = worker
      } else {
        workers.push(worker)
      }
      await writeJson(workersPath, { workers })
    },

    async deleteWorker(id) {
      const workers = await this.listWorkers()
      const filtered = workers.filter(w => w.id !== id)
      await writeJson(workersPath, { workers: filtered })
    },

    async listWorkflows() {
      const { readdir } = await import("node:fs/promises")
      try {
        const files = await readdir(workflowsDir)
        const workflows: Workflow[] = []
        for (const file of files) {
          if (file.endsWith(".json")) {
            const workflow = await readJson<Workflow>(join(workflowsDir, file), null as any)
            if (workflow) workflows.push(workflow)
          }
        }
        return workflows
      } catch {
        return []
      }
    },

    async getWorkflow(id) {
      const workflows = await this.listWorkflows()
      return workflows.find(w => w.id === id)
    },

    async saveWorkflow(workflow) {
      const path = join(workflowsDir, `${workflow.id}.json`)
      await writeJson(path, workflow)
    },

    async deleteWorkflow(id) {
      const { unlink } = await import("node:fs/promises")
      const path = join(workflowsDir, `${id}.json`)
      try {
        await unlink(path)
      } catch {}
    },

    async listIntegrations() {
      const data = await readJson<{ integrations: Integration[] }>(integrationsPath, { integrations: [] })
      return data.integrations
    },

    async getIntegration(id) {
      const integrations = await this.listIntegrations()
      return integrations.find(i => i.id === id)
    },

    async saveIntegration(integration) {
      const integrations = await this.listIntegrations()
      const index = integrations.findIndex(i => i.id === integration.id)
      if (index >= 0) {
        integrations[index] = integration
      } else {
        integrations.push(integration)
      }
      await writeJson(integrationsPath, { integrations })
    },

    async deleteIntegration(id) {
      const integrations = await this.listIntegrations()
      const filtered = integrations.filter(i => i.id !== id)
      await writeJson(integrationsPath, { integrations: filtered })
    }
  }
}
