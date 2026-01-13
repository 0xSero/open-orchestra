// Worker runtime modes
export type WorkerRuntime = "subagent" | "agent" | "server"

// Worker status
export type WorkerStatus = "available" | "busy" | "off" | "error"

// Worker template (stored in workers.json)
export type Worker = {
  id: string
  name: string
  description: string
  runtime: WorkerRuntime
  model?: string
  agent?: string
  tools?: Record<string, boolean>
  skills?: string[]
  prompts?: string[]
  mcps?: string[]
  integrations?: WorkerIntegration[]  // Bound integrations
}

// Live worker instance
export type WorkerInstance = {
  instanceId: string
  workerId: string
  runtime: WorkerRuntime
  status: WorkerStatus
  sessionId?: string
  parentSessionId?: string
  baseUrl?: string
  port?: number
  model?: string
  createdAt: string
  lastSeenAt: string
}

// Async job tracking
export type Job = {
  jobId: string
  orchestratorSessionId: string
  workerInstanceId: string
  workerSessionId?: string
  status: "running" | "completed" | "failed"
  createdAt: string
  completedAt?: string
}

// Workflow step
export type WorkflowStep = {
  step: number
  name: string
  worker: string
  prompt: string
  tools?: string[]
  verification?: string
}

// Workflow template
export type Workflow = {
  id: string
  name: string
  description?: string
  iterations?: { max: number; mode: "until_verified" | "fixed" }
  steps: WorkflowStep[]
}

// Workflow run (execution instance)
export type WorkflowRun = {
  runId: string
  workflowId: string
  status: "pending" | "running" | "completed" | "failed"
  currentStep: number
  startedAt: string
  completedAt?: string
}

// Skill definition (parsed from SKILL.md)
export type Skill = {
  id: string          // directory name
  name: string        // from frontmatter
  description: string // from frontmatter
  path: string        // full path to SKILL.md
  content: string     // full file content
}

// Integration definition - user-defined, stored in integrations.json
export type Integration = {
  id: string                    // "context7", "memory-graph"
  name: string                  // Display name
  description: string           // What it provides

  process?: {                   // Optional managed process
    command: string             // "npx" or binary path
    args?: string[]             // ["@context7/mcp"]
    env?: Record<string, string>
    cwd?: string
    type: "mcp" | "http" | "stdio"
    port?: number               // For HTTP type
    healthCheck?: string        // URL or command to check if ready
  }

  tools?: string[]              // Tool names this integration provides
  instructions: string          // Injected into agent prompt
}

// Binding an integration to a worker
export type WorkerIntegration = {
  integrationId: string
  enabled?: boolean             // Default true
  config?: Record<string, any>  // Runtime overrides
}

// Live integration instance (running process)
export type IntegrationInstance = {
  integrationId: string
  status: "starting" | "ready" | "error" | "stopped"
  process?: any                 // Bun.Subprocess
  port?: number
  startedAt: string
  error?: string
}
