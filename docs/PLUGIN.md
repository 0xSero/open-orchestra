# Plugin Module (packages/plugin)

## Overview

The Orchestra Plugin provides multi-agent orchestration capabilities for OpenCode. It manages workers, workflows, integrations, and job execution.

## State Machine

```
┌─────────────────────────────────────────────────────────────────────────┐
│                      PLUGIN STATE MACHINE                               │
└─────────────────────────────────────────────────────────────────────────┘

                    ┌───────────────┐
                    │ PLUGIN INIT   │
                    └───────┬───────┘
                            │
        ┌───────────────────┼───────────────────┐
        │                   │                   │
        ▼                   ▼                   ▼
┌───────────────┐   ┌───────────────┐   ┌───────────────┐
│  FileStore    │   │   Runtime     │   │ Integrations  │
│  (workers,    │   │  (instances,  │   │  Manager      │
│  workflows)   │   │   jobs)       │   │               │
└───────┬───────┘   └───────┬───────┘   └───────┬───────┘
        │                   │                   │
        └───────────────────┼───────────────────┘
                            │
                            ▼
                    ┌───────────────┐
                    │  Create Tools │
                    └───────┬───────┘
                            │
                            ▼
                    ┌───────────────┐
                    │ Plugin Ready  │──────► Event listener
                    │ (tools, event)│        for session.status
                    └───────────────┘
```

## Directory Structure

```
packages/plugin/
├── src/
│   ├── index.ts           # Plugin entry point & event handler
│   ├── types.ts           # Type definitions
│   ├── store.ts           # FileStore for workers/workflows
│   ├── tools.ts           # Tool implementations
│   ├── integrations.ts    # Integration manager
│   └── maestro.ts         # Workflow orchestration
├── .opencode/workforce/   # Data files (when server runs from here)
│   ├── workers.json       # Worker definitions
│   ├── integrations.json  # Integration definitions
│   └── workflows/*.json   # Workflow definitions
├── package.json
└── tsconfig.json
```

## Data Flow

```
┌─────────────────────────────────────────────────────────────────────────┐
│                      JOB EXECUTION FLOW                                 │
└─────────────────────────────────────────────────────────────────────────┘

  ┌───────────────┐
  │ Orchestrator  │──────► orchestra.dispatch tool
  │   Session     │
  └───────┬───────┘
          │
          ▼
  ┌───────────────┐
  │   Runtime     │──────► Create worker instance
  │               │
  └───────┬───────┘
          │
          ▼
  ┌───────────────┐
  │ Worker Session│──────► Execute task via session.prompt
  └───────┬───────┘
          │
          ▼ (on session.status = "idle")
  ┌───────────────┐
  │ Event Handler │──────► Fetch messages, update job status
  └───────┬───────┘
          │
          ▼
  ┌───────────────┐
  │ Orchestrator  │──────► Inject result as user message
  │   Notified    │
  └───────────────┘
```

## Key Types

### Worker
```typescript
type Worker = {
  id: string
  name: string
  description: string
  runtime: "subagent" | "agent" | "server"
  model?: string
  agent?: string
  tools?: Record<string, boolean>
  skills?: string[]
  integrations?: WorkerIntegration[]
}
```

### WorkerInstance
```typescript
type WorkerInstance = {
  instanceId: string
  workerId: string
  runtime: WorkerRuntime
  status: "available" | "busy" | "off" | "error"
  sessionId?: string
  parentSessionId?: string
  createdAt: string
  lastSeenAt: string
}
```

### Job
```typescript
type Job = {
  jobId: string
  orchestratorSessionId: string
  workerInstanceId: string
  workerSessionId?: string
  status: "running" | "completed" | "failed"
  createdAt: string
  completedAt?: string
}
```

### Workflow
```typescript
type Workflow = {
  id: string
  name: string
  description?: string
  iterations?: { max: number; mode: "until_verified" | "fixed" }
  steps: WorkflowStep[]
}
```

### Integration
```typescript
type Integration = {
  id: string
  name: string
  description: string
  process?: {
    command: string
    args?: string[]
    env?: Record<string, string>
    type: "mcp" | "http" | "stdio"
    port?: number
  }
  instructions: string
}
```

## Tools Provided

```
┌─────────────────────────────────────────────────────────────────────────┐
│                      ORCHESTRA TOOLS                                    │
└─────────────────────────────────────────────────────────────────────────┘

  ┌────────────────────┐    ┌────────────────────┐    ┌────────────────────┐
  │ orchestra.dispatch │    │ orchestra.status   │    │ orchestra.workers  │
  │                    │    │                    │    │                    │
  │ Send prompt to a   │    │ Check job status   │    │ List available     │
  │ worker             │    │ by ID              │    │ worker templates   │
  └────────────────────┘    └────────────────────┘    └────────────────────┘

  ┌────────────────────┐    ┌────────────────────┐
  │ orchestra.workflows│    │ orchestra.run      │
  │                    │    │                    │
  │ List workflow      │    │ Execute a workflow │
  │ definitions        │    │ by ID              │
  └────────────────────┘    └────────────────────┘

  ┌────────────────────┐
  │ memory_record      │
  │                    │
  │ Persist memory     │
  │ entries for the UI │
  └────────────────────┘
```

## Event Handling

The plugin listens for `session.status` events to detect when worker sessions go idle:

```
┌─────────────────────────────────────────────────────────────────────────┐
│                      EVENT FLOW                                         │
└─────────────────────────────────────────────────────────────────────────┘

  Worker Session ────► session.status: "idle" ────► Plugin Event Handler
                                                           │
                                                           ▼
                                                   ┌───────────────┐
                                                   │ Find matching │
                                                   │ running job   │
                                                   └───────┬───────┘
                                                           │
                                                           ▼
                                                   ┌───────────────┐
                                                   │ Fetch session │
                                                   │ messages      │
                                                   └───────┬───────┘
                                                           │
                                                           ▼
                                                   ┌───────────────┐
                                                   │ Inject result │
                                                   │ into parent   │
                                                   │ session       │
                                                   └───────────────┘
```

## Workflow Execution (Maestro)

```
┌─────────────────────────────────────────────────────────────────────────┐
│                      WORKFLOW EXECUTION                                 │
└─────────────────────────────────────────────────────────────────────────┘

  ┌───────────────┐
  │ runWorkflow() │
  └───────┬───────┘
          │
          ▼
  ┌───────────────┐
  │ For each step │
  │   in workflow │
  └───────┬───────┘
          │
  ┌───────┴───────────────────────────────┐
  │                                       │
  ▼                                       ▼
┌──────────────────┐            ┌──────────────────┐
│ Get worker for   │            │ Execute step     │
│ step.worker      │───────────►│ prompt via       │
└──────────────────┘            │ session.prompt   │
                                └────────┬─────────┘
                                         │
                                         ▼
                                ┌──────────────────┐
                                │ Collect result   │
                                │ Move to next     │
                                │ step             │
                                └──────────────────┘
```

## File Storage

Data is stored in JSON files under `.opencode/workforce/`:

| File | Content |
|------|---------|
| `workers.json` | Worker template definitions |
| `integrations.json` | Integration definitions |
| `workflows/*.json` | Individual workflow definitions |
| `runtime.json` | Runtime snapshot (instances, jobs, workflow runs, integration instances, memory entries) |
| `memories.json` | Persisted memory entries for UI |

## Runtime Snapshot

`runtime.json` is written under `.opencode/workforce/` and is consumed by the Orchestra UI. It keeps legacy keys intact while appending new collections.

### Runtime visibility checklist

- Ensure `runtime.json` is updated on session status changes.
- Ensure `memories.json` is written whenever `memory_record` updates entries.
- Verify workflow runs update `workflowRuns` on start/step/complete transitions.

### runtime.json schema

```json
{
  "timestamp": "2024-01-01T00:00:00.000Z",
  "instances": [
    {
      "id": "wkr_...",
      "instanceId": "wkr_...",
      "workerId": "coder",
      "runtime": "subagent",
      "status": "available",
      "sessionId": "session_...",
      "parentSessionId": "session_...",
      "model": "openai/gpt-4o",
      "baseUrl": "http://localhost:3000",
      "port": 43121,
      "createdAt": "2024-01-01T00:00:00.000Z",
      "lastSeenAt": "2024-01-01T00:00:00.000Z"
    }
  ],
  "jobs": [
    {
      "id": "job_...",
      "jobId": "job_...",
      "workerId": "coder",
      "workerInstanceId": "wkr_...",
      "workerSessionId": "session_...",
      "status": "running",
      "createdAt": "2024-01-01T00:00:00.000Z",
      "completedAt": "2024-01-01T00:00:00.000Z"
    }
  ],
  "workflowRuns": [
    {
      "runId": "run_...",
      "workflowId": "workpack",
      "status": "completed",
      "startedAt": "2024-01-01T00:00:00.000Z",
      "completedAt": "2024-01-01T00:00:00.000Z",
      "steps": [
        {
          "step": 1,
          "name": "Plan",
          "status": "completed",
          "workerInstanceId": "wkr_...",
          "verification": {
            "type": "regex",
            "passed": true,
            "message": "Verified"
          }
        }
      ]
    }
  ],
  "integrationInstances": [
    {
      "integrationId": "context7",
      "status": "ready",
      "pid": 12345,
      "port": 43121,
      "url": "http://localhost:43121",
      "startedAt": "2024-01-01T00:00:00.000Z",
      "error": "..."
    }
  ],
  "memoryEntries": [
    {
      "id": "mem_...",
      "content": "Remember this...",
      "tags": ["summary"],
      "source": "memory",
      "sessionId": "session_...",
      "createdAt": "2024-01-01T00:00:00.000Z"
    }
  ]
}
```

- `instances[].id` mirrors `instanceId` for backward compatibility.
- `memoryEntries` is the current in-memory snapshot; the durable log lives in `memories.json`.
 - `integrationInstances` should omit raw process handles and only include safe metadata (`pid`, `port`, `url`, `status`, `error`).

### memories.json schema

`memories.json` stores the persisted memory log and is merged into the UI alongside `runtime.json`.

```json
{
  "entries": [
    {
      "id": "mem_...",
      "content": "Remember this...",
      "tags": ["summary"],
      "source": "memory",
      "sessionId": "session_...",
      "createdAt": "2024-01-01T00:00:00.000Z"
    }
  ]
}
```

## Connections

| Source | Target | Protocol |
|--------|--------|----------|
| Plugin | OpenCode Server | HTTP via SDK Client |
| Plugin | FileStore | File system JSON |
| Plugin | Integrations | Process spawn (MCP/HTTP/STDIO) |

## Usage Example

```typescript
import { OrchestraPlugin } from "@opencode-ai/plugin"

// Plugin is automatically loaded by OpenCode when configured
// in .opencode.json or as CLI argument

// Tools become available in sessions:
// - orchestra.dispatch { worker: "researcher", prompt: "..." }
// - orchestra.status { jobId: "..." }
// - orchestra.workers
// - orchestra.workflows
// - orchestra.run { workflow: "feature-dev" }
```
