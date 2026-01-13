import { describe, test, expect, beforeEach, afterEach } from "bun:test"
import { createFileStore } from "../src/store"
import { rm, mkdir } from "node:fs/promises"
import { join } from "node:path"

const TEST_DIR = join(import.meta.dir, ".test-data")

describe("FileStore", () => {
  let store: ReturnType<typeof createFileStore>

  beforeEach(async () => {
    await mkdir(TEST_DIR, { recursive: true })
    store = createFileStore(TEST_DIR)
  })

  afterEach(async () => {
    await rm(TEST_DIR, { recursive: true, force: true })
  })

  describe("workers", () => {
    test("listWorkers returns empty array initially", async () => {
      const workers = await store.listWorkers()
      expect(workers).toEqual([])
    })

    test("saveWorker and getWorker", async () => {
      const worker = {
        id: "reader",
        name: "Reader",
        description: "Reads files",
        runtime: "subagent" as const
      }
      await store.saveWorker(worker)

      const retrieved = await store.getWorker("reader")
      expect(retrieved).toEqual(worker)
    })

    test("saveWorker updates existing", async () => {
      const worker = {
        id: "reader",
        name: "Reader",
        description: "Reads files",
        runtime: "subagent" as const
      }
      await store.saveWorker(worker)

      const updated = { ...worker, name: "Updated Reader" }
      await store.saveWorker(updated)

      const workers = await store.listWorkers()
      expect(workers).toHaveLength(1)
      expect(workers[0].name).toBe("Updated Reader")
    })

    test("deleteWorker removes worker", async () => {
      const worker = {
        id: "reader",
        name: "Reader",
        description: "Reads files",
        runtime: "subagent" as const
      }
      await store.saveWorker(worker)
      await store.deleteWorker("reader")

      const retrieved = await store.getWorker("reader")
      expect(retrieved).toBeUndefined()
    })
  })

  describe("workflows", () => {
    test("listWorkflows returns empty array initially", async () => {
      const workflows = await store.listWorkflows()
      expect(workflows).toEqual([])
    })

    test("saveWorkflow and getWorkflow", async () => {
      const workflow = {
        id: "workpack",
        name: "Workpack",
        steps: [
          { step: 0, name: "Read", worker: "reader", prompt: "Read the repo" }
        ]
      }
      await store.saveWorkflow(workflow)

      const retrieved = await store.getWorkflow("workpack")
      expect(retrieved).toEqual(workflow)
    })

    test("deleteWorkflow removes workflow", async () => {
      const workflow = {
        id: "workpack",
        name: "Workpack",
        steps: []
      }
      await store.saveWorkflow(workflow)
      await store.deleteWorkflow("workpack")

      const retrieved = await store.getWorkflow("workpack")
      expect(retrieved).toBeUndefined()
    })
  })
})
