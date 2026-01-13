import { createSignal, createResource, For, Show, createMemo, onMount, onCleanup } from "solid-js"
import { Button } from "@opencode-ai/ui/button"
import { Icon } from "@opencode-ai/ui/icon"
import { useGlobalSDK } from "@/context/global-sdk"
import { useLayout } from "@/context/layout"
// Types for Orchestra data - mirroring packages/plugin/src/types.ts
type WorkerRuntime = "subagent" | "agent" | "server"
type WorkerStatus = "available" | "busy" | "off" | "error"

type Worker = {
  id: string
  name: string
  description?: string
  runtime: WorkerRuntime
  model?: string
  prompt?: string
  tools?: Record<string, boolean>
  skills?: string[]
  integrations?: WorkerIntegration[]
}

type WorkerInstance = {
  instanceId: string
  workerId: string
  runtime: WorkerRuntime
  status: WorkerStatus
  sessionId?: string
  parentSessionId?: string
  createdAt: string
  lastSeenAt: string
}

type Workflow = {
  id: string
  name: string
  description?: string
  iterations?: { max: number; mode: "until_verified" | "fixed" }
  steps: WorkflowStep[]
}

type WorkflowStep = {
  step: number
  name: string
  worker: string
  prompt: string
  tools?: string[]
  verification?: string
}

type Integration = {
  id: string
  name: string
  description?: string
  process?: {
    command: string
    args?: string[]
    env?: Record<string, string>
    type: "mcp" | "http" | "stdio"
    port?: number
  }
  instructions?: string
}

type WorkerIntegration = {
  integrationId: string
  enabled?: boolean
}

type IntegrationInstance = {
  integrationId: string
  status: "starting" | "ready" | "error" | "stopped"
  pid?: number
  url?: string
  startedAt: string
  error?: string
}

// Types for Orchestra data
interface OrchestraData {
  workers: Worker[]
  instances: WorkerInstance[]
  workflows: Workflow[]
  integrations: Integration[]
  integrationInstances: IntegrationInstance[]
}

// Tab type
type TabId = "workers" | "workflows" | "servers"

export default function OrchestraPage() {
  const [activeTab, setActiveTab] = createSignal<TabId>("workers")
  const [refreshKey, setRefreshKey] = createSignal(0)
  const globalSDK = useGlobalSDK()
  const layout = useLayout()

  // Helper to read JSON files from the server using the SDK
  async function readJsonFile<T>(directory: string, path: string, fallback: T): Promise<T> {
    try {
      // Try to read using the SDK file API
      const response = await globalSDK.client.file.read({ directory, path })
      if (response.data && response.data.content) {
        return JSON.parse(response.data.content) as T
      }
      return fallback
    } catch {
      return fallback
    }
  }

  // Helper to list workflow files from directory
  async function listWorkflowFiles(directory: string): Promise<Workflow[]> {
    try {
      const response = await globalSDK.client.file.list({ directory, path: ".opencode/workforce/workflows" })
      if (response.data) {
        const files = response.data as Array<{ name: string; type: string }>
        const workflows: Workflow[] = []
        for (const file of files) {
          if (file.name.endsWith(".json")) {
            const workflow = await readJsonFile<Workflow | null>(
              directory,
              `.opencode/workforce/workflows/${file.name}`,
              null
            )
            if (workflow) workflows.push(workflow)
          }
        }
        return workflows
      }
      return []
    } catch {
      return []
    }
  }

  // Fetch orchestra data from all projects' plugin files
  const [data, { refetch }] = createResource(
    () => refreshKey(),
    async () => {
      const projects = layout.projects.list()
      const allWorkers: Worker[] = []
      const allWorkflows: Workflow[] = []
      const allIntegrations: Integration[] = []

      // Read data from each project
      for (const project of projects) {
        const directory = project.worktree

        try {
          // Read workers from .opencode/workforce/workers.json
          const workersData = await readJsonFile<{ workers: Worker[] }>(
            directory,
            ".opencode/workforce/workers.json",
            { workers: [] }
          )
          allWorkers.push(...(workersData.workers || []))

          // Read workflows from .opencode/workforce/workflows/*.json
          const workflows = await listWorkflowFiles(directory)
          allWorkflows.push(...workflows)

          // Read integrations from .opencode/workforce/integrations.json
          const integrationsData = await readJsonFile<{ integrations: Integration[] }>(
            directory,
            ".opencode/workforce/integrations.json",
            { integrations: [] }
          )
          allIntegrations.push(...(integrationsData.integrations || []))
        } catch (err) {
          console.log(`Failed to load orchestra data from ${directory}:`, err)
        }
      }

      // Deduplicate by ID
      const uniqueWorkers = [...new Map(allWorkers.map(w => [w.id, w])).values()]
      const uniqueWorkflows = [...new Map(allWorkflows.map(w => [w.id, w])).values()]
      const uniqueIntegrations = [...new Map(allIntegrations.map(i => [i.id, i])).values()]

      return {
        workers: uniqueWorkers,
        instances: [], // Runtime instances not persisted to file
        workflows: uniqueWorkflows,
        integrations: uniqueIntegrations,
        integrationInstances: [], // Runtime instances not persisted to file
      } as OrchestraData
    }
  )

  // Auto-refresh every 5 seconds
  onMount(() => {
    const interval = setInterval(() => {
      setRefreshKey((k) => k + 1)
    }, 5000)
    onCleanup(() => clearInterval(interval))
  })

  const tabs = [
    { id: "workers" as const, label: "Workers", icon: "brain" as const },
    { id: "workflows" as const, label: "Workflows", icon: "branch" as const },
    { id: "servers" as const, label: "Servers", icon: "server" as const },
  ]

  return (
    <div class="flex flex-col h-full bg-background-base">
      {/* Header */}
      <div class="flex items-center justify-between px-6 py-4 border-b border-border-base">
        <div class="flex items-center gap-3">
          <Icon name="task" class="size-6 text-text-accent" />
          <h1 class="text-18-semibold text-text-base">Orchestra Dashboard</h1>
        </div>
        <Button variant="secondary" size="small" onClick={() => setRefreshKey((k) => k + 1)}>
          <Icon name="branch" class="size-4" />
          Refresh
        </Button>
      </div>

      {/* Tabs */}
      <div class="flex border-b border-border-base">
        <For each={tabs}>
          {(tab) => (
            <button
              class={`px-6 py-3 text-14-medium transition-colors ${
                activeTab() === tab.id
                  ? "text-text-accent border-b-2 border-text-accent"
                  : "text-text-weak hover:text-text-base"
              }`}
              onClick={() => setActiveTab(tab.id)}
            >
              <div class="flex items-center gap-2">
                <Icon name={tab.icon} class="size-4" />
                {tab.label}
              </div>
            </button>
          )}
        </For>
      </div>

      {/* Content */}
      <div class="flex-1 overflow-auto p-6">
        <Show when={data.loading}>
          <div class="flex items-center justify-center h-32 text-text-weak">
            <div class="size-6 mr-2 animate-spin border-2 border-current border-t-transparent rounded-full" />
            Loading...
          </div>
        </Show>

        <Show when={!data.loading && data()}>
          <Show when={activeTab() === "workers"}>
            <WorkersTab workers={data()!.workers} instances={data()!.instances} onRefresh={refetch} />
          </Show>
          <Show when={activeTab() === "workflows"}>
            <WorkflowsTab workflows={data()!.workflows} onRefresh={refetch} />
          </Show>
          <Show when={activeTab() === "servers"}>
            <ServersTab
              integrations={data()!.integrations}
              instances={data()!.integrationInstances}
              onRefresh={refetch}
            />
          </Show>
        </Show>
      </div>
    </div>
  )
}

// Workers Tab Component
function WorkersTab(props: { workers: Worker[]; instances: WorkerInstance[]; onRefresh: () => void }) {
  const [editingWorker, setEditingWorker] = createSignal<Worker | null>(null)

  return (
    <div class="space-y-6">
      {/* Worker Templates */}
      <section>
        <div class="flex items-center justify-between mb-4">
          <h2 class="text-16-semibold text-text-base">Worker Templates</h2>
          <Button variant="primary" size="small" onClick={() => setEditingWorker({ id: "", name: "", runtime: "subagent", model: "claude-sonnet" } as Worker)}>
            <Icon name="plus" class="size-4" />
            Add Worker
          </Button>
        </div>
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <For each={props.workers} fallback={<EmptyState message="No workers defined" />}>
            {(worker) => (
              <WorkerCard worker={worker} onEdit={() => setEditingWorker(worker)} />
            )}
          </For>
        </div>
      </section>

      {/* Running Instances */}
      <section>
        <h2 class="text-16-semibold text-text-base mb-4">Running Instances</h2>
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <For each={props.instances} fallback={<EmptyState message="No running instances" />}>
            {(instance) => <InstanceCard instance={instance} />}
          </For>
        </div>
      </section>

      {/* Edit Modal */}
      <Show when={editingWorker()}>
        <WorkerEditModal
          worker={editingWorker()!}
          onClose={() => setEditingWorker(null)}
          onSave={() => { setEditingWorker(null); props.onRefresh() }}
        />
      </Show>
    </div>
  )
}

function WorkerCard(props: { worker: Worker; onEdit: () => void }) {
  const runtimeColors: Record<string, string> = {
    subagent: "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300",
    agent: "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300",
    server: "bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300",
  }

  return (
    <div class="bg-background-elevated rounded-lg border border-border-base p-4">
      <div class="flex items-start justify-between mb-3">
        <div>
          <h3 class="text-14-semibold text-text-base">{props.worker.name}</h3>
          <p class="text-12-regular text-text-weak">{props.worker.id}</p>
        </div>
        <span class={`px-2 py-1 rounded text-11-medium ${runtimeColors[props.worker.runtime] || "bg-gray-100 text-gray-700"}`}>
          {props.worker.runtime}
        </span>
      </div>
      <Show when={props.worker.model}>
        <p class="text-12-regular text-text-weak mb-2">Model: {props.worker.model}</p>
      </Show>
      <Show when={props.worker.skills?.length}>
        <div class="flex flex-wrap gap-1 mb-3">
          <For each={props.worker.skills}>
            {(skill) => (
              <span class="px-2 py-0.5 bg-background-base rounded text-11-regular text-text-weak">
                {skill}
              </span>
            )}
          </For>
        </div>
      </Show>
      <div class="flex gap-2">
        <Button variant="secondary" size="small" onClick={props.onEdit}>
          <Icon name="pencil-line" class="size-3" />
          Edit
        </Button>
      </div>
    </div>
  )
}

function InstanceCard(props: { instance: WorkerInstance }) {
  const statusColors: Record<string, string> = {
    available: "bg-green-500",
    busy: "bg-yellow-500",
    error: "bg-red-500",
    initializing: "bg-blue-500",
  }

  return (
    <div class="bg-background-elevated rounded-lg border border-border-base p-4">
      <div class="flex items-center justify-between mb-2">
        <h3 class="text-14-medium text-text-base">{props.instance.workerId}</h3>
        <div class="flex items-center gap-2">
          <span class={`size-2 rounded-full ${statusColors[props.instance.status] || "bg-gray-500"}`} />
          <span class="text-12-regular text-text-weak">{props.instance.status}</span>
        </div>
      </div>
      <p class="text-11-regular text-text-weak">ID: {props.instance.instanceId}</p>
      <Show when={props.instance.sessionId}>
        {(sessionId) => <p class="text-11-regular text-text-weak">Session: {sessionId().slice(0, 8)}...</p>}
      </Show>
    </div>
  )
}

// Workflows Tab Component
function WorkflowsTab(props: { workflows: Workflow[]; onRefresh: () => void }) {
  const [editingWorkflow, setEditingWorkflow] = createSignal<Workflow | null>(null)

  return (
    <div class="space-y-4">
      <div class="flex items-center justify-between mb-4">
        <h2 class="text-16-semibold text-text-base">Workflows</h2>
        <Button variant="primary" size="small" onClick={() => setEditingWorkflow({ id: "", name: "", description: "", steps: [] } as Workflow)}>
          <Icon name="plus" class="size-4" />
          Add Workflow
        </Button>
      </div>
      <div class="space-y-4">
        <For each={props.workflows} fallback={<EmptyState message="No workflows defined" />}>
          {(workflow) => (
            <WorkflowCard workflow={workflow} onEdit={() => setEditingWorkflow(workflow)} />
          )}
        </For>
      </div>

      <Show when={editingWorkflow()}>
        <WorkflowEditModal
          workflow={editingWorkflow()!}
          onClose={() => setEditingWorkflow(null)}
          onSave={() => { setEditingWorkflow(null); props.onRefresh() }}
        />
      </Show>
    </div>
  )
}

function WorkflowCard(props: { workflow: Workflow; onEdit: () => void }) {
  return (
    <div class="bg-background-elevated rounded-lg border border-border-base p-4">
      <div class="flex items-start justify-between mb-3">
        <div>
          <h3 class="text-14-semibold text-text-base">{props.workflow.name}</h3>
          <p class="text-12-regular text-text-weak">{props.workflow.description}</p>
        </div>
        <span class="px-2 py-1 bg-background-base rounded text-11-medium text-text-weak">
          {props.workflow.steps?.length || 0} steps
        </span>
      </div>
      <Show when={props.workflow.iterations}>
        {(iterations) => (
          <p class="text-12-regular text-text-weak mb-2">
            Max iterations: {iterations().max}, Mode: {iterations().mode}
          </p>
        )}
      </Show>
      <div class="flex gap-2">
        <Button variant="secondary" size="small" onClick={props.onEdit}>
          <Icon name="pencil-line" class="size-3" />
          Edit
        </Button>
        <Button variant="secondary" size="small">
          <Icon name="chevron-right" class="size-3" />
          Run
        </Button>
      </div>
    </div>
  )
}

// Servers Tab Component
function ServersTab(props: { integrations: Integration[]; instances: IntegrationInstance[]; onRefresh: () => void }) {
  const [editingIntegration, setEditingIntegration] = createSignal<Integration | null>(null)

  return (
    <div class="space-y-6">
      {/* Integration Definitions */}
      <section>
        <div class="flex items-center justify-between mb-4">
          <h2 class="text-16-semibold text-text-base">Integration Definitions</h2>
          <Button variant="primary" size="small" onClick={() => setEditingIntegration({ id: "", name: "" } as Integration)}>
            <Icon name="plus" class="size-4" />
            Add Integration
          </Button>
        </div>
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <For each={props.integrations} fallback={<EmptyState message="No integrations defined" />}>
            {(integration) => (
              <IntegrationCard integration={integration} onEdit={() => setEditingIntegration(integration)} />
            )}
          </For>
        </div>
      </section>

      {/* Running Integration Instances */}
      <section>
        <h2 class="text-16-semibold text-text-base mb-4">Running Instances</h2>
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <For each={props.instances} fallback={<EmptyState message="No running integration instances" />}>
            {(instance) => <IntegrationInstanceCard instance={instance} />}
          </For>
        </div>
      </section>

      <Show when={editingIntegration()}>
        <IntegrationEditModal
          integration={editingIntegration()!}
          onClose={() => setEditingIntegration(null)}
          onSave={() => { setEditingIntegration(null); props.onRefresh() }}
        />
      </Show>
    </div>
  )
}

function IntegrationCard(props: { integration: Integration; onEdit: () => void }) {
  const typeColors: Record<string, string> = {
    mcp: "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300",
    http: "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300",
    stdio: "bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300",
  }

  const integrationType = () => props.integration.process?.type || "mcp"

  return (
    <div class="bg-background-elevated rounded-lg border border-border-base p-4">
      <div class="flex items-start justify-between mb-3">
        <div>
          <h3 class="text-14-semibold text-text-base">{props.integration.name}</h3>
          <p class="text-12-regular text-text-weak">{props.integration.id}</p>
        </div>
        <span class={`px-2 py-1 rounded text-11-medium ${typeColors[integrationType()] || "bg-gray-100 text-gray-700"}`}>
          {integrationType()}
        </span>
      </div>
      <Show when={props.integration.process?.command}>
        <p class="text-11-regular text-text-weak font-mono mb-2">
          {props.integration.process!.command.slice(0, 50)}...
        </p>
      </Show>
      <div class="flex gap-2">
        <Button variant="secondary" size="small" onClick={props.onEdit}>
          <Icon name="pencil-line" class="size-3" />
          Edit
        </Button>
      </div>
    </div>
  )
}

function IntegrationInstanceCard(props: { instance: IntegrationInstance }) {
  const statusColors: Record<string, string> = {
    running: "bg-green-500",
    starting: "bg-yellow-500",
    stopped: "bg-gray-500",
    error: "bg-red-500",
  }

  return (
    <div class="bg-background-elevated rounded-lg border border-border-base p-4">
      <div class="flex items-center justify-between mb-2">
        <h3 class="text-14-medium text-text-base">{props.instance.integrationId}</h3>
        <div class="flex items-center gap-2">
          <span class={`size-2 rounded-full ${statusColors[props.instance.status] || "bg-gray-500"}`} />
          <span class="text-12-regular text-text-weak">{props.instance.status}</span>
        </div>
      </div>
      <Show when={props.instance.pid}>
        <p class="text-11-regular text-text-weak">PID: {props.instance.pid}</p>
      </Show>
      <Show when={props.instance.url}>
        <p class="text-11-regular text-text-weak">URL: {props.instance.url}</p>
      </Show>
    </div>
  )
}

// Empty State Component
function EmptyState(props: { message: string }) {
  return (
    <div class="col-span-full flex flex-col items-center justify-center py-12 text-text-weak">
      <Icon name="archive" class="size-8 mb-2 opacity-50" />
      <p class="text-14-regular">{props.message}</p>
    </div>
  )
}

// Edit Modal Components
function WorkerEditModal(props: { worker: Worker; onClose: () => void; onSave: () => void }) {
  const [formData, setFormData] = createSignal({ ...props.worker })

  const handleSave = async () => {
    // TODO: Implement file-based saving via SDK
    // For now, just log and close
    console.log("Worker data to save:", formData())
    alert("Saving workers is not yet implemented. Edit the .opencode/workforce/workers.json file directly.")
    props.onClose()
  }

  return (
    <div class="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={props.onClose}>
      <div class="bg-background-elevated rounded-lg border border-border-base p-6 w-[500px] max-h-[80vh] overflow-auto" onClick={(e) => e.stopPropagation()}>
        <h2 class="text-16-semibold text-text-base mb-4">{props.worker.id ? "Edit Worker" : "Add Worker"}</h2>
        <div class="space-y-4">
          <div>
            <label class="block text-12-medium text-text-weak mb-1">ID</label>
            <input
              type="text"
              class="w-full px-3 py-2 bg-background-base border border-border-base rounded text-14-regular text-text-base"
              value={formData().id}
              onInput={(e) => setFormData({ ...formData(), id: e.currentTarget.value })}
            />
          </div>
          <div>
            <label class="block text-12-medium text-text-weak mb-1">Name</label>
            <input
              type="text"
              class="w-full px-3 py-2 bg-background-base border border-border-base rounded text-14-regular text-text-base"
              value={formData().name}
              onInput={(e) => setFormData({ ...formData(), name: e.currentTarget.value })}
            />
          </div>
          <div>
            <label class="block text-12-medium text-text-weak mb-1">Runtime</label>
            <select
              class="w-full px-3 py-2 bg-background-base border border-border-base rounded text-14-regular text-text-base"
              value={formData().runtime}
              onChange={(e) => setFormData({ ...formData(), runtime: e.currentTarget.value as Worker["runtime"] })}
            >
              <option value="subagent">Subagent</option>
              <option value="agent">Agent</option>
              <option value="server">Server</option>
            </select>
          </div>
          <div>
            <label class="block text-12-medium text-text-weak mb-1">Model</label>
            <input
              type="text"
              class="w-full px-3 py-2 bg-background-base border border-border-base rounded text-14-regular text-text-base"
              value={formData().model || ""}
              onInput={(e) => setFormData({ ...formData(), model: e.currentTarget.value })}
            />
          </div>
          <div>
            <label class="block text-12-medium text-text-weak mb-1">Prompt</label>
            <textarea
              class="w-full px-3 py-2 bg-background-base border border-border-base rounded text-14-regular text-text-base min-h-[100px]"
              value={formData().prompt || ""}
              onInput={(e) => setFormData({ ...formData(), prompt: e.currentTarget.value })}
            />
          </div>
        </div>
        <div class="flex gap-2 mt-6">
          <Button variant="secondary" onClick={props.onClose}>Cancel</Button>
          <Button variant="primary" onClick={handleSave}>Save</Button>
        </div>
      </div>
    </div>
  )
}

function WorkflowEditModal(props: { workflow: Workflow; onClose: () => void; onSave: () => void }) {
  const [formData, setFormData] = createSignal({ ...props.workflow })

  const handleSave = async () => {
    // TODO: Implement file-based saving via SDK
    // For now, just log and close
    console.log("Workflow data to save:", formData())
    alert("Saving workflows is not yet implemented. Edit the .opencode/workforce/workflows/*.json files directly.")
    props.onClose()
  }

  return (
    <div class="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={props.onClose}>
      <div class="bg-background-elevated rounded-lg border border-border-base p-6 w-[600px] max-h-[80vh] overflow-auto" onClick={(e) => e.stopPropagation()}>
        <h2 class="text-16-semibold text-text-base mb-4">{props.workflow.id ? "Edit Workflow" : "Add Workflow"}</h2>
        <div class="space-y-4">
          <div>
            <label class="block text-12-medium text-text-weak mb-1">ID</label>
            <input
              type="text"
              class="w-full px-3 py-2 bg-background-base border border-border-base rounded text-14-regular text-text-base"
              value={formData().id}
              onInput={(e) => setFormData({ ...formData(), id: e.currentTarget.value })}
            />
          </div>
          <div>
            <label class="block text-12-medium text-text-weak mb-1">Name</label>
            <input
              type="text"
              class="w-full px-3 py-2 bg-background-base border border-border-base rounded text-14-regular text-text-base"
              value={formData().name}
              onInput={(e) => setFormData({ ...formData(), name: e.currentTarget.value })}
            />
          </div>
          <div>
            <label class="block text-12-medium text-text-weak mb-1">Description</label>
            <textarea
              class="w-full px-3 py-2 bg-background-base border border-border-base rounded text-14-regular text-text-base"
              value={formData().description}
              onInput={(e) => setFormData({ ...formData(), description: e.currentTarget.value })}
            />
          </div>
          <div class="grid grid-cols-2 gap-4">
            <div>
              <label class="block text-12-medium text-text-weak mb-1">Max Iterations</label>
              <input
                type="number"
                class="w-full px-3 py-2 bg-background-base border border-border-base rounded text-14-regular text-text-base"
                value={formData().iterations?.max || 1}
                onInput={(e) => setFormData({
                  ...formData(),
                  iterations: { ...formData().iterations, max: parseInt(e.currentTarget.value) || 1, mode: formData().iterations?.mode || "fixed" }
                })}
              />
            </div>
            <div>
              <label class="block text-12-medium text-text-weak mb-1">Iteration Mode</label>
              <select
                class="w-full px-3 py-2 bg-background-base border border-border-base rounded text-14-regular text-text-base"
                value={formData().iterations?.mode || "fixed"}
                onChange={(e) => setFormData({
                  ...formData(),
                  iterations: { ...formData().iterations, mode: e.currentTarget.value as "fixed" | "until_verified", max: formData().iterations?.max || 1 }
                })}
              >
                <option value="fixed">Fixed</option>
                <option value="until_verified">Until Verified</option>
              </select>
            </div>
          </div>
        </div>
        <div class="flex gap-2 mt-6">
          <Button variant="secondary" onClick={props.onClose}>Cancel</Button>
          <Button variant="primary" onClick={handleSave}>Save</Button>
        </div>
      </div>
    </div>
  )
}

function IntegrationEditModal(props: { integration: Integration; onClose: () => void; onSave: () => void }) {
  const [formData, setFormData] = createSignal({ ...props.integration })

  const handleSave = async () => {
    // TODO: Implement file-based saving via SDK
    // For now, just log and close
    console.log("Integration data to save:", formData())
    alert("Saving integrations is not yet implemented. Edit the .opencode/workforce/integrations.json file directly.")
    props.onClose()
  }

  return (
    <div class="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={props.onClose}>
      <div class="bg-background-elevated rounded-lg border border-border-base p-6 w-[500px] max-h-[80vh] overflow-auto" onClick={(e) => e.stopPropagation()}>
        <h2 class="text-16-semibold text-text-base mb-4">{props.integration.id ? "Edit Integration" : "Add Integration"}</h2>
        <div class="space-y-4">
          <div>
            <label class="block text-12-medium text-text-weak mb-1">ID</label>
            <input
              type="text"
              class="w-full px-3 py-2 bg-background-base border border-border-base rounded text-14-regular text-text-base"
              value={formData().id}
              onInput={(e) => setFormData({ ...formData(), id: e.currentTarget.value })}
            />
          </div>
          <div>
            <label class="block text-12-medium text-text-weak mb-1">Name</label>
            <input
              type="text"
              class="w-full px-3 py-2 bg-background-base border border-border-base rounded text-14-regular text-text-base"
              value={formData().name}
              onInput={(e) => setFormData({ ...formData(), name: e.currentTarget.value })}
            />
          </div>
          <div>
            <label class="block text-12-medium text-text-weak mb-1">Type</label>
            <select
              class="w-full px-3 py-2 bg-background-base border border-border-base rounded text-14-regular text-text-base"
              value={formData().process?.type || "mcp"}
              onChange={(e) => setFormData({
                ...formData(),
                process: { ...formData().process, type: e.currentTarget.value as "mcp" | "http" | "stdio", command: formData().process?.command || "" }
              })}
            >
              <option value="mcp">MCP</option>
              <option value="http">HTTP</option>
              <option value="stdio">STDIO</option>
            </select>
          </div>
          <div>
            <label class="block text-12-medium text-text-weak mb-1">Command (for process-based)</label>
            <input
              type="text"
              class="w-full px-3 py-2 bg-background-base border border-border-base rounded text-14-regular text-text-base font-mono"
              value={formData().process?.command || ""}
              onInput={(e) => {
                const currentProcess = formData().process
                setFormData({
                  ...formData(),
                  process: {
                    command: e.currentTarget.value,
                    type: currentProcess?.type || "mcp",
                    args: currentProcess?.args,
                    env: currentProcess?.env,
                    port: currentProcess?.port,
                  }
                })
              }}
              placeholder="e.g., npx -y @modelcontextprotocol/server-everything"
            />
          </div>
          <div>
            <label class="block text-12-medium text-text-weak mb-1">Instructions</label>
            <textarea
              class="w-full px-3 py-2 bg-background-base border border-border-base rounded text-14-regular text-text-base min-h-[100px]"
              value={formData().instructions || ""}
              onInput={(e) => setFormData({ ...formData(), instructions: e.currentTarget.value })}
            />
          </div>
        </div>
        <div class="flex gap-2 mt-6">
          <Button variant="secondary" onClick={props.onClose}>Cancel</Button>
          <Button variant="primary" onClick={handleSave}>Save</Button>
        </div>
      </div>
    </div>
  )
}
