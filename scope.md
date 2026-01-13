# Orchestra: Technical Specification

## Executive Summary

Orchestra is a workforce control plane plugin for OpenCode that enables multi-agent orchestration, deterministic workflow execution, and async task delegation. It transforms OpenCode from a single-agent coding assistant into a coordinated system of specialized workers managed by an orchestrator agent.

**Goal**: Enable complex, long-running software development tasks through:
1. Multi-worker delegation (specialized agents for reading, building, reviewing)
2. Deterministic workflows with verification gates
3. Async task execution with wake-up mechanism
4. Skills management (sync from anthropics/skills)
5. Multi-runtime workers (subagent, agent, server/Docker)

**Non-goals**:
- New UI initially (use existing OpenCode clients)
- Forking OpenCode (extend via plugin API only)
- Database dependency (file-based state in v1)

---

## 1. System Architecture

### 1.1 Component Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    ORCHESTRA LAYERS                          │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  LAYER 1: CLIENT UI                                          │
│  - OpenCode TUI/Desktop/IDE (existing)                      │
│  - User interaction via natural language + slash commands  │
│                                                             │
│  LAYER 2: ORCHESTRATOR AGENT                                 │
│  - Interprets user requests                                 │
│  - Delegates to workers via tools                           │
│  - Enforces guardrails (never does work itself)            │
│  - Runs workflows via workflow_run tool                     │
│                                                             │
│  LAYER 3: WORKFORCE PLUGIN                                  │
│  - Implements orchestration tools                           │
│  - Manages worker instances (spawn, send_task, manage)      │
│  - Runs workflows deterministically                         │
│  - Handles events (session.idle → wake-up)                  │
│  - Manages skills (install, list, delete)                   │
│                                                             │
│  LAYER 4: WORKER EXECUTION                                  │
│  - Subagent workers (child sessions)                        │
│  - Agent workers (independent sessions)                     │
│  - Server workers (separate OpenCode instances)             │
│                                                             │
│  LAYER 5: OPENCODE SERVER                                   │
│  - Session API (create, prompt, abort)                      │
│  - Tool system (LLM calls tool, plugin handles)             │
│  - Event stream (SSE)                                       │
│  - Skill discovery (SKILL.md files)                         │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 1.2 Data Flow

#### Synchronous Delegation Flow
```
User Request
  ↓
Orchestrator interprets
  ↓
delegate(to: "reader", task: "...")
  ↓
workforce_send_task (tool call)
  ↓
Plugin sends prompt to worker session (via SDK)
  ↓
Worker executes (sync)
  ↓
Worker returns result
  ↓
Orchestrator receives result
  ↓
Orchestrator delegates to next worker OR reports to user
```

#### Asynchronous Delegation Flow (Boomerang Pattern)
```
User Request
  ↓
Orchestrator interprets
  ↓
delegate(to: "builder", task: "...", async: true)
  ↓
workforce_send_task (tool call, async: true)
  ↓
Plugin creates job record
  ↓
Plugin sends async prompt to worker session
  ↓
Plugin returns immediately { jobId, status: "running" }
  ↓
Worker processes in background...
  ↓
Worker finishes → session goes IDLE
  ↓
Plugin receives session.idle event
  ↓
Plugin looks up pending job for this session
  ↓
Plugin fetches worker's last messages
  ↓
Plugin injects wake-up message into orchestrator session
  ↓
Orchestrator receives "as if user" message
  ↓
Orchestrator continues workflow / reports result
```

#### Workflow Execution Flow
```
workflow_run(id: "workpack")
  ↓
Plugin loads workflow definition (JSON)
  ↓
For each step in workflow_steps:
  ↓
  1. Spawn required workers (if not active)
  2. Render prompt template
  3. Send task to worker (sync or async)
  4. Wait for completion
  5. Run verification:
     - Deterministic: files_exist, must_contain, run_tests
     - Delegated: delegate:reviewer (spawn verifier worker)
  6. If verification failed AND iterations < max:
     - Retry step OR retry entire workflow (per strategy)
  7. If verification passed:
     - Mark step complete
     - Move to next step
  ↓
All steps complete → SUCCESS
OR
Max iterations → FAILED
```

### 1.3 Event-Driven Wake-Up

The wake-up mechanism is critical for async workflows. OpenCode emits events via SSE:

**Events to handle:**
- `session.idle`: Worker session finished a task
- `session.status`: Worker session status change
- `message.updated`: New message in worker session
- `tool.execute.before`: Worker about to call tool
- `tool.execute.after`: Worker finished tool call

**Wake-up implementation:**
```typescript
Plugin event handler:
  on session.idle:
    1. Get idle session ID from event
    2. Find pending jobs: jobs.filter(j => j.workerSessionId === sessionID)
    3. For each waiting job:
       a. Fetch worker's last messages (via session.messages API)
       b. Extract result (last text parts)
       c. Inject message into orchestrator session (via session.prompt API)
          Format: "Worker completed job {jobId} (instance {instanceId}).\n\n{result}"
       d. Update job status to "completed"
```

This makes the orchestrator "feel" like it received a user message when a worker finishes.

---

## 2. Plugin Specification

### 2.1 Plugin Contract

The workforce plugin implements the OpenCode Plugin interface:

```typescript
interface Plugin {
  event?: ({ event }: PluginEventContext) => void | Promise<void>;
  tool?: Record<string, Tool>;
}
```

The plugin must:
1. Export a default function returning `Plugin`
2. Use `@opencode-ai/plugin` SDK helpers (`tool()`)
3. Store state in-memory per worktree
4. Persist durable state to files
5. Register tools that the orchestrator can call

### 2.2 Runtime State Management

**State structure (per worktree):**
```typescript
type RuntimeState = {
  root: string; // .opencode/workforce

  // Worker templates (from workers.json)
  profiles: Map<string, WorkerProfile>;

  // Live worker instances
  instances: Map<string, WorkerInstance>;

  // Async jobs (for wake-up tracking)
  jobs: Map<string, Job>;

  // Server worker handles (for cleanup)
  serverHandles: Map<string, { baseUrl: string; close: () => void }>;
};
```

**State lifecycle:**
- Initialized when plugin loads (first tool call)
- Persists in-memory during server lifetime
- Durable state stored in `.opencode/workforce/` files:
  - `workers.json` - Worker profiles
  - `runtime.json` (optional) - Snapshot of running instances
- Server workers (type "server") are ephemeral but tracked

**Multi-worktree support:**
- One `RuntimeState` per worktree (directory path key)
- Allows Orchestra to work in multiple projects simultaneously
- Workers are scoped to their originating worktree

### 2.3 Tool Specifications

#### 2.3.1 Worker Management Tools

##### `workforce_list_workers`

**Purpose**: List all worker profiles and live instances.

**Args**: None

**Returns**:
```typescript
{
  profiles: WorkerProfile[];      // From workers.json
  instances: WorkerInstance[];     // In-memory active instances
  currentSession: string;          // Orchestrator's session ID
}
```

**Use case**: Orchestrator checks which workers are available before delegating.

---

##### `workforce_spawn_worker`

**Purpose**: Create a new worker instance (subagent, agent, or server).

**Args**:
```typescript
{
  worker_id: string;           // Profile ID from workers.json
  runtime?: "subagent" | "agent" | "server";  // Override profile default
  model?: string;              // Override profile default model
  confirm?: boolean;          // If true, send handshake prompt
}
```

**Returns**:
```typescript
{
  instanceId: string;          // Unique handle (e.g., "wkr_01HXabc123")
  status: "available" | "busy" | "off";
  workerId: string;
  runtime: "subagent" | "agent" | "server";
  sessionId?: string;          // For subagent/agent workers
  parentSessionId?: string;    // For subagent workers
  baseUrl?: string;            // For server workers
  port?: number;               // For server workers
  createdAt: string;            // ISO timestamp
  model?: string;
  profile: WorkerProfile;      // Full profile
}
```

**Behavior by runtime type:**

**Subagent (child session)**:
```typescript
1. Create child session via client.session.create({ parentID: orchestratorSessionId })
2. Set sessionId and parentSessionId on instance
3. If confirm: Send handshake prompt
4. Mark status as "available"
5. Store instance in rt.instances
6. Return instance
```

**Agent (independent session)**:
```typescript
1. Create session via client.session.create()  // No parentID
2. Set sessionId on instance
3. If confirm: Send handshake prompt with agent config
4. Mark status as "available"
5. Store instance in rt.instances
6. Return instance
```

**Server (separate OpenCode instance)**:
```typescript
1. Pick free port (4100-6100 range)
2. Start OpenCode server via createOpencode({ hostname, port, config })
3. Get baseUrl from server URL
4. Create remote client via createOpencodeClient({ baseUrl })
5. Create session on remote server
6. Set baseUrl, port, sessionId on instance
7. Store server handle (for cleanup)
8. If confirm: Send handshake prompt
9. Mark status as "available"
10. Store instance in rt.instances
11. Return instance
```

**Handshake prompt** (if confirm: true):
```
You are a worker instance.

Worker profile:
- id: {profile.id}
- name: {profile.name}
- description: {profile.description}
- runtime: {profile.runtime}
- model: {instance.model}
- skills: {profile.skills?.join(", ")}

Orchestrator session: {orchestratorSessionId}
Your instanceId: {instance.instanceId}

Rules:
1) Do the task you are given.
2) When finished, provide a concise "RESULT" section and any artifacts/paths created.
3) If asked to do async work, you may provide incremental updates.
4) Do not pretend to be the orchestrator.

Confirm you understand by replying with:
READY: <one sentence summary of your role>.
```

**Use case**: Orchestrator spawns workers on-demand for delegation/workflows.

---

##### `workforce_send_task`

**Purpose**: Send a task to a worker instance (sync or async).

**Args**:
```typescript
{
  instanceId: string;    // From spawn_worker
  task: string;          // Task description/prompt
  async?: boolean;       // If true, return immediately (async mode)
}
```

**Returns** (sync mode):
```typescript
{
  status: "completed";
  response: Message;     // Worker's response
}
```

**Returns** (async mode):
```typescript
{
  jobId: string;         // Job ID for tracking
  status: "running";
}
```

**Behavior**:

**Sync mode** (`async: false` or undefined):
```typescript
1. Find instance in rt.instances
2. Set status to "busy", update lastSeenAt
3. Send prompt to worker session (via client.session.prompt)
   - For server workers: use remote client (createOpencodeClient)
4. Wait for response (blocking)
5. Set status back to "available"
6. Return response
```

**Async mode** (`async: true`):
```typescript
1. Find instance in rt.instances
2. Set status to "busy", update lastSeenAt
3. Create job record:
   {
     jobId: id("job"),
     orchestratorSessionId: ctx.sessionID,
     workerInstanceId: instance.instanceId,
     workerSessionId: instance.sessionId,
     createdAt: nowISO(),
     status: "running"
   }
4. Store job in rt.jobs
5. Send async prompt to worker session
   - Use promptAsync endpoint if available
   - Fallback: noReply flag or fire-and-forget
6. Return { jobId, status: "running" }
7. When worker finishes (session.idle event), plugin handles wake-up
```

**Use case**: Orchestrator sends tasks to workers. Sync for immediate results, async for background work.

---

##### `workforce_manage_worker`

**Purpose**: Control worker instances (kill, restart).

**Args**:
```typescript
{
  instanceId: string;
  action: "kill" | "restart";
}
```

**Returns**:
```typescript
// kill action:
{
  status: "off";
  instance: WorkerInstance;
}

// restart action:
{
  status: "off";
  message: "Restart requested. Spawn a new instance with spawn_worker.";
  instance: WorkerInstance;
}
```

**Behavior**:

**Kill action**:
```typescript
1. Find instance in rt.instances
2. If server worker:
   a. Get handle from rt.serverHandles
   b. Call handle.close() to shut down OpenCode server
   c. Remove handle from rt.serverHandles
3. If subagent/agent worker:
   a. Call client.session.abort({ id: instance.sessionId })
4. Set instance.status to "off"
5. Return { status: "off", instance }
```

**Restart action**:
```typescript
1. Execute kill action (clean up existing instance)
2. Mark status as "off"
3. Return message to spawn new instance
```

**Use case**: Orchestrator can terminate stuck workers or restart failed ones.

---

#### 2.3.2 Workflow Execution Tools

##### `workforce_workflow_run`

**Purpose**: Execute a workflow deterministically with verification gates.

**Args**:
```typescript
{
  workflow_id: string;           // Workflow ID from workflows/*.json
  input?: Record<string, any>;   // Optional input parameters for prompt rendering
}
```

**Returns**:
```typescript
{
  workflowId: string;
  runId: string;                 // Unique run ID
  status: "running" | "completed" | "failed";
  step: number;                  // Current step index
  steps: WorkflowStep[];         // Steps being executed
  results: {
    step: number;
    status: string;
    output?: string;
    verification?: {
      passed: boolean;
      result: any;
      error?: string;
    };
  }[];
}
```

**Behavior**:
```typescript
1. Load workflow definition from .opencode/workforce/workflows/{workflow_id}.json
2. Create runId (id("run"))
3. Initialize results array
4. For each step in workflow_steps (in order):
   a. Extract step config:
      - workers: string[] (worker profile IDs)
      - prompt: string (template)
      - tools?: string[] (optional tool constraints)
      - verification?: string (verification rule)

   b. Spawn required workers:
      - For each worker_id in step.workers:
        - Check if instance exists in rt.instances
        - If not: call spawn_worker(worker_id)

   c. Render prompt template:
      - Replace placeholders like {{input.task}} with input.*
      - Use simple template engine (e.g., string replace or tiny templating)

   d. Send task to worker:
      - If 1 worker: send_task(instanceId, renderedPrompt)
      - If multiple workers: send to each, collect results

   e. Wait for completion (sync or async per step config)

   f. Run verification:
      - Parse verification rule (format: "type:param")
      - Supported types:
        * "delegate:reviewer" → Spawn reviewer worker, send verification task
        * "files_exist:/path1,/path2" → Check files exist via SDK
        * "contains:SUMMARY" → Check output contains string
        * "must_not_contain:CRITICAL" → Check output doesn't contain string
        * "run_tests:command" → Run bash command, check exit code

      - Verification result:
        { passed: boolean, result: any, error?: string }

   g. Handle verification result:
      - If passed:
        * Mark step as completed
        * Store output in results array
        * Continue to next step

      - If failed:
        * Increment retry count
        * If retryCount < workflow.iterations.max:
          - If strategy == "step-retry": retry current step
          - If strategy == "full-retry": retry entire workflow (step 0)
        * Else:
          - Mark workflow as FAILED
          - Return { status: "failed", step, results, error: "Max iterations reached" }

5. All steps completed:
   - Return { status: "completed", workflowId, runId, results }
```

**Verification implementation**:

**delegate:reviewer**:
```typescript
1. Spawn reviewer worker
2. Send task: "Review the following output for correctness:\n\n{workerOutput}"
3. Wait for reviewer result
4. Parse reviewer output for approval:
   - If contains "APPROVED" or no issues found: passed = true
   - If contains "ISSUES:" or "CRITICAL": passed = false
5. Return { passed, result: reviewerOutput }
```

**files_exist:/path1,/path2**:
```typescript
1. Parse paths from param (split by comma)
2. For each path:
   a. Check if file exists via client.filesystem.stat() or fs.exists()
   b. If missing: return { passed: false, error: "Missing file: {path}" }
3. Return { passed: true, result: "All files exist" }
```

**contains:SUMMARY**:
```typescript
1. Check if worker output contains the substring
2. Return { passed: true/false, result: "Output contains/doesn't contain '{substring}'" }
```

**must_not_contain:CRITICAL**:
```typescript
1. Check if worker output contains the substring
2. Return { passed: !contains, result: "..." }
```

**run_tests:pytest**:
```typescript
1. Execute command via bash tool
2. Check exit code (0 = success)
3. Return { passed: exitCode === 0, result: stdout, error: stderr }
```

**Use case**: Orchestrator runs multi-step development workflows with verification gates.

---

##### `workforce_workflow_list`

**Purpose**: List available workflow definitions.

**Args**: None

**Returns**:
```typescript
{
  workflows: Array<{
    id: string;
    name: string;
    description: string;
    stepsCount: number;
    iterations: { max: number; strategy: string };
  }>;
}
```

**Behavior**:
```typescript
1. Read all JSON files from .opencode/workforce/workflows/
2. For each file, parse and extract metadata:
   - id (from workflow_id field)
   - name
   - description
   - stepsCount = workflow_steps.length
   - iterations
3. Return array
```

**Use case**: Orchestrator shows available workflows to user or chooses automatically.

---

#### 2.3.3 Skills Management Tools

##### `workforce_skill_list`

**Purpose**: List installed skills in the project.

**Args**: None

**Returns**:
```typescript
{
  skillRoot: string;  // Path to .opencode/skill directory
  skills: Array<{
    dir: string;       // Skill directory name
    name?: string;     // From SKILL.md frontmatter
    description?: string;  // From SKILL.md frontmatter
    path: string;      // Full path to SKILL.md
  }>;
}
```

**Behavior**:
```typescript
1. Get skillRoot = .opencode/skill
2. Read directory entries (withFileTypes: true)
3. For each directory:
   a. Read SKILL.md file
   b. Parse YAML frontmatter (between --- markers)
   c. Extract name and description
   d. Add to skills array
4. Return { skillRoot, skills }
```

**Use case**: Orchestrator can reference available skills when delegating.

---

##### `workforce_skill_install`

**Purpose**: Install a skill from anthropics/skills repository.

**Args**:
```typescript
{
  source: "anthropics/skills" | "git:<url>";  // Source repo
  skills: string[];                           // Skill names to install
}
```

**Returns**:
```typescript
{
  installed: string[];      // Successfully installed skills
  failed: Array<{           // Failed installations
    skill: string;
    error: string;
  }>;
}
```

**Behavior**:
```typescript
1. Ensure skill-sources directory exists (.opencode/workforce/skill-sources/)
2. Clone source repo if not present:
   - git clone <source_url> .opencode/workforce/skill-sources/anthropics-skills/
3. For each skill name in skills:
   a. Check if skill directory exists in source:
      - Path: .opencode/workforce/skill-sources/anthropics-skills/skills/<name>/
   b. If not found: add to failed list, continue
   c. Read SKILL.md to extract metadata
   d. Create destination directory: .claude/skills/<name>/
      (OpenCode auto-discovers skills from .claude/skills/)
   e. Copy skill directory to destination
   f. Add to installed list
4. Return { installed, failed }
```

**Use case**: User or orchestrator can install skills on-demand.

---

##### `workforce_skill_delete`

**Purpose**: Delete an installed skill.

**Args**:
```typescript
{
  name: string;  // Skill directory name
}
```

**Returns**:
```typescript
{
  deleted: boolean;
  path: string;
}
```

**Behavior**:
```typescript
1. Remove directory: .claude/skills/{name}/ (recursive)
2. Return { deleted: true, path }
```

**Use case**: Orchestrator can uninstall unused skills.

---

### 2.4 Event Handlers

#### Session Idle Handler

**Purpose**: Detect worker task completion and wake up orchestrator.

**Event**: `session.idle`

**Implementation**:
```typescript
event: async ({ event }) => {
  if (event.type !== "session.idle") return;

  // Extract session ID from event (shape may vary by OpenCode version)
  const idleSessionId = event.sessionID ?? event.sessionId ?? event.id;
  if (!idleSessionId) return;

  // Find jobs waiting on this session
  const waitingJobs = [...rt.jobs.values()].filter(
    j => j.status === "running" && j.workerSessionId === idleSessionId
  );
  if (waitingJobs.length === 0) return;

  for (const job of waitingJobs) {
    try {
      // Fetch worker's last messages
      const msgs = await client.session.messages({ path: { id: idleSessionId } });
      const last = msgs.data[msgs.data.length - 1];

      // Extract text parts
      const textParts = (last?.parts ?? [])
        .filter((p: any) => p.type === "text")
        .map((p: any) => p.text)
        .join("\n");

      // Update job status
      job.status = "completed";

      // Inject wake-up message into orchestrator session
      await client.session.prompt({
        path: { id: job.orchestratorSessionId },
        body: {
          parts: [{
            type: "text",
            text: `Worker completed job ${job.jobId} (instance ${job.workerInstanceId}).\n\n${textParts}`
          }],
        },
      });

    } catch (e: any) {
      job.status = "failed";

      // Notify orchestrator of failure
      await client.session.prompt({
        path: { id: job.orchestratorSessionId },
        body: {
          parts: [{
            type: "text",
            text: `Worker job ${job.jobId} failed while collecting results.\nError: ${e?.message ?? String(e)}`
          }],
        },
      });
    }
  }
}
```

**Use case**: Async tasks complete and orchestrator wakes up to process results.

---

## 3. Data Models

### 3.1 Worker Profile (Template)

**Location**: `.opencode/workforce/workers.json`

**Schema**:
```typescript
type WorkerRuntime = "subagent" | "agent" | "server";

type WorkerProfile = {
  id: string;                      // Stable slug: "reader", "builder", "reviewer"
  name: string;                    // Display name
  description: string;             // What this worker does

  runtime: WorkerRuntime;          // How this worker runs

  // Worker capabilities
  model?: string;                  // "provider/model-id" (OpenCode convention)
  agent?: string;                  // Optional: agent name to run as

  // Capabilities (declarative)
  tools?: Record<string, boolean>; // Tool allow/deny (or patterns)
  skills?: string[];               // Skill names to rely on
  prompts?: string[];              // Prompt template IDs
  mcps?: string[];                 // MCP server keys

  // Optional: for server workers / shepherd containers (future)
  sandbox?: {
    kind: "local" | "docker";
    cpu?: number;
    memoryMb?: number;
    workdir?: string;
    image?: string;
  };
};
```

**Example**:
```json
{
  "id": "reader",
  "name": "Repo Reader",
  "description": "Reads codebase and produces structured summaries",
  "runtime": "subagent",
  "model": "zhipuai-coding-plan/glm-4.7",
  "skills": ["pdf", "docx"],
  "tools": {
    "read": true,
    "grep": true,
    "glob": true,
    "write": false,
    "edit": false,
    "bash": false
  }
}
```

---

### 3.2 Worker Instance (Runtime)

**Location**: In-memory (rt.instances), optionally persisted to `runtime.json`

**Schema**:
```typescript
type WorkerStatus = "available" | "busy" | "off";

type WorkerInstance = {
  instanceId: string;            // Unique handle (e.g., "wkr_01HXabc123")
  workerId: string;              // Profile ID
  runtime: WorkerRuntime;        // How this instance runs
  status: WorkerStatus;          // Current state

  // For in-proc workers (subagent/agent)
  sessionId?: string;            // OpenCode session ID
  parentSessionId?: string;      // For subagent workers

  // For server workers
  baseUrl?: string;              // e.g., "http://127.0.0.1:5123"
  port?: number;                 // Server port

  model?: string;                // Model used for this instance
  createdAt: string;             // ISO timestamp
  lastSeenAt: string;            // ISO timestamp (updated on activity)
};
```

**Lifecycle**:
1. **Spawning**: Created via `spawn_worker`, status = "busy" (during handshake)
2. **Available**: Handshake complete, status = "available", ready for tasks
3. **Busy**: Processing task via `send_task`, status = "busy"
4. **Off**: Terminated via `manage_worker(action: "kill")` or server crash

---

### 3.3 Job (Async Task Tracking)

**Location**: In-memory (rt.jobs)

**Schema**:
```typescript
type JobStatus = "running" | "completed" | "failed";

type Job = {
  jobId: string;                      // Unique ID
  orchestratorSessionId: string;      // Who owns this job
  workerInstanceId: string;           // Worker handling the job
  workerSessionId: string;            // Worker's session ID
  createdAt: string;                  // ISO timestamp
  status: JobStatus;                  // Current state
};
```

**Purpose**: Track async tasks so `session.idle` events can be matched to orchestrators.

---

### 3.4 Workflow Template

**Location**: `.opencode/workforce/workflows/{id}.json`

**Schema**:
```typescript
type WorkflowStep = {
  step: number;                      // Step index (0-based)
  name?: string;                     // Human-readable name
  workers: string[];                 // Worker profile IDs to use
  prompt: string;                    // Template string (supports {{input.*}})
  tools?: string[];                  // Optional tool constraints
  verification?: string;             // Verification rule
};

type Workflow = {
  id: string;                        // Unique workflow ID
  name: string;                      // Display name
  description: string;               // What this workflow does
  iterations: {
    max: number;                     // Max retries
    strategy: "step-retry" | "full-retry";  // Retry strategy
  };
  steps: WorkflowStep[];
};
```

**Example** (workpack.json):
```json
{
  "id": "workpack",
  "name": "Workpack Development Flow",
  "description": "Read repo, create work artifacts, implement, review",
  "iterations": { "max": 2, "strategy": "step-retry" },
  "steps": [
    {
      "step": 0,
      "name": "Read Repository",
      "workers": ["reader"],
      "prompt": "Read the repository structure and provide a summary.",
      "verification": "contains:SUMMARY"
    },
    {
      "step": 1,
      "name": "Create Task Artifacts",
      "workers": ["builder"],
      "prompt": "Create /work/{{input.taskId}}/rules.md, scope.md, and /tasks/task.md.",
      "verification": "files_exist:/work/{{input.taskId}}/rules.md,/work/{{input.taskId}}/scope.md,/tasks/task.md"
    },
    {
      "step": 2,
      "name": "Implement Task",
      "workers": ["builder"],
      "prompt": "Implement the task described in /tasks/task.md.",
      "verification": "delegate:reviewer"
    },
    {
      "step": 3,
      "name": "Review Changes",
      "workers": ["reviewer"],
      "prompt": "Review the changes for correctness and security.",
      "verification": "must_not_contain:CRITICAL"
    }
  ]
}
```

---

### 3.5 Workflow Run

**Location**: In-memory (during execution), optionally persisted to DB (future)

**Schema**:
```typescript
type WorkflowRunStatus = "running" | "completed" | "failed";

type WorkflowRun = {
  runId: string;                    // Unique run ID
  workflowId: string;              // Workflow template ID
  status: WorkflowRunStatus;
  startedAt: string;               // ISO timestamp
  endedAt?: string;                // ISO timestamp (when done)
  input?: Record<string, any>;     // Input parameters
  currentStep: number;             // Current step index
  retryCount: number;              // Current retry count

  results: Array<{
    step: number;
    status: string;
    workerInstanceId?: string;
    output?: string;
    verification?: {
      passed: boolean;
      result: any;
      error?: string;
    };
    startedAt: string;
    endedAt?: string;
  }>;
};
```

---

### 3.6 Skill

**Location** (installed): `.claude/skills/{name}/SKILL.md`
**Location** (source): `.opencode/workforce/skill-sources/anthropics-skills/skills/{name}/SKILL.md`

**Format** (SKILL.md):
```markdown
---
name: thrive-data
description: Extract non-TPL projects from Thrive database, cross-reference with TPL projects, submit via Thrive Core API.
license: MIT
version: 1.0.0
---

# Thrive Data

This skill provides tools and prompts for...
```

**OpenCode auto-discovers** skills from:
- `.opencode/skill/<name>/SKILL.md`
- `~/.config/opencode/skill/<name>/SKILL.md`
- `.claude/skills/<name>/SKILL.md`
- `~/.claude/skills/<name>/SKILL.md`

---

## 4. Orchestrator Agent

### 4.1 Agent Configuration

**Location**: `.opencode/agent/orchestrator.md`

**YAML frontmatter**:
```yaml
---
name: orchestrator
description: Delegates all work to workers. Never performs repo edits or executes commands directly.
mode: primary
tools:
  # Orchestra tools - allowed
  delegate: true
  workflow: true
  workers: true

  # Task management - allowed
  todowrite: true
  todoread: true

  # Explicitly deny "doing work" tools
  write: false
  edit: false
  bash: false
  read: false
  glob: false
  grep: false
  webfetch: false
  websearch: false
---
```

**Tool permissions**:
- **Allowed**: `delegate`, `workflow`, `workers`, `todowrite`, `todoread`
  - These map to plugin tools: `workforce_send_task`, `workforce_workflow_run`, `workforce_list_workers`
- **Denied**: All file operations, bash, web access
  - Prevents orchestrator from doing work itself

**Mode**: `primary`
- Orchestrator is the main agent users interact with
- Other agents can be spawned as workers

---

### 4.2 Agent Behavior Rules

**Core rules** (in agent prompt):

1. **NEVER execute the user's request directly.**
   - No reading files
   - No editing code
   - No running commands
   - No browsing the web

2. **ONLY delegate.**
   - Delegate tasks with `delegate(to, task)`
   - Run workflows with `workflow(id)`
   - Check active workers with `workers()`
   - Track progress with todos

3. **Use workflows when possible.**
   - If a workflow exists for the task, use `workflow(id)`
   - Otherwise, delegate step by step manually

4. **Choose the right worker:**
   - **reader**: Understanding code, reading files, summarizing
   - **builder**: Implementing changes, writing code
   - **reviewer**: Reviewing changes, checking correctness

5. **Sync vs Async delegation:**
   - Default (sync): `delegate(to: "reader", task: "...")` - waits for result
   - Async: `delegate(to: "builder", task: "...", async: true)` - returns immediately, result injected later

---

### 4.3 Tool Aliases

For LLM ergonomics, orchestrator uses simplified aliases that map to plugin tools:

| Alias | Plugin Tool | Purpose |
|-------|-------------|---------|
| `delegate(to, task, async?)` | `workforce_send_task` | Send task to worker |
| `workflow(id, input?)` | `workforce_workflow_run` | Run workflow |
| `workers()` | `workforce_list_workers` | List workers |

**Mapping** (implemented via OpenCode's agent system or plugin tool naming):
- Plugin tools can be named `delegate` directly
- Or orchestrator agent can define aliases in its config

---

## 5. Slash Commands

### 5.1 Command Definitions

**Location**: `.opencode/command/{name}.md`

**Purpose**: Provide shortcuts for common workflows. Users type `/workers` instead of "List all workers and their status".

---

#### `/workers`

**Location**: `.opencode/command/workers.md`

**Prompt**:
```markdown
List all worker profiles and their current instances.

Use the workers() tool to get:
- Available worker profiles
- Live worker instances (status, runtime, model)
- Current session ID

Present as a table with columns: ID, Name, Runtime, Status, Instance ID, Model.
```

**Use case**: User wants to see what workers are available and their status.

---

#### `/workpack`

**Location**: `.opencode/command/workflow-workpack.md`

**Prompt**:
```markdown
Run the workpack workflow for the current task.

Use workflow(id: "workpack", input: { taskId: "<generated-uuid>" }).

The workpack workflow will:
1. Read the repository
2. Create work artifacts (rules.md, scope.md, task.md)
3. Implement the task
4. Review the changes

Report progress at each step.
```

**Use case**: User wants to execute a complete development workflow.

---

#### `/boomerang`

**Location**: `.opencode/command/workflow-boomerang.md`

**Prompt**:
```markdown
Run the boomerang workflow for async task execution.

Use workflow(id: "boomerang", input: { task: "<user task>" }).

The boomerang workflow will:
1. Delegate an async task to the builder
2. Return immediately with job ID
3. Wake up when the worker finishes (via event system)

Report the job ID and inform the user they can disconnect.
```

**Use case**: User wants to start a long-running task and can disconnect.

---

#### `/shepherd`

**Location**: `.opencode/command/workflow-shepherd.md`

**Prompt**:
```markdown
Run the shepherd workflow for long-running iterative work.

Use workflow(id: "shepherd", input: { task: "<user task>" }).

The shepherd workflow will:
1. Spawn a server worker (separate OpenCode instance)
2. Execute the task in an isolated environment
3. Run verification
4. If failed: fix loop → checkpoint → repeat
5. Continue until stopped or verified

Inform the user this is a long-running workflow that can be monitored and stopped.
```

**Use case**: User wants to run a long, iterative task (e.g., 8-hour build/test loop).

---

## 6. Filesystem Layout

### 6.1 Directory Structure

```
.opencode/
  plugin/
    workforce.ts                    # Main plugin implementation

  agent/
    orchestrator.md                 # Orchestrator agent config
    # Optional: worker-specific agents
    reader.md
    builder.md
    reviewer.md

  command/
    workers.md                      # List workers command
    workflow-workpack.md            # Workpack workflow command
    workflow-boomerang.md           # Boomerang workflow command
    workflow-shepherd.md            # Shepherd workflow command

  skill/
    # Auto-populated by skill_install tool
    thrive-data/SKILL.md
    pdf/SKILL.md
    docx/SKILL.md

  workforce/
    workers.json                    # Worker profiles
    runtime.json                    # (optional) Runtime snapshot

    skill-sources/
      anthropics-skills/            # Cloned from git
        skills/
          thrive-data/SKILL.md
          pdf/SKILL.md
          ...

    workflows/
      workpack.json                 # Workpack workflow
      boomerang.json                # Boomerang workflow
      shepherd.json                 # Shepherd workflow

.claude/
  skills/
    # Auto-populated by skill_install (OpenCode discovers from here)
    thrive-data/SKILL.md
    pdf/SKILL.md

workforce/
  work/
    <task-id>/
      rules.md
      scope.md
      results.md
  tasks/
    task.md
```

---

### 6.2 File Details

#### `.opencode/plugin/workforce.ts`
- Main plugin implementation
- Exports `WorkforcePlugin` default function
- Implements all tools and event handlers
- Manages runtime state

#### `.opencode/agent/orchestrator.md`
- Orchestrator agent configuration
- Defines tool permissions
- Contains behavior rules and examples

#### `.opencode/workforce/workers.json`
- Worker profiles (templates)
- Defines id, name, description, runtime, model, skills, tools

#### `.opencode/workforce/workflows/*.json`
- Workflow definitions
- Each file = one workflow (id, steps, iterations, verification)

#### `.opencode/workforce/skill-sources/`
- Git clones of skill repositories (e.g., anthropics/skills)
- Read-only source for skill installation
- Skills copied to `.claude/skills/` to be active

#### `.claude/skills/`
- Active skills (discovered by OpenCode)
- Populated by `skill_install` tool
- OpenCode loads these automatically

---

## 7. Verification Gates

### 7.1 Verification Types

Workflows support multiple verification types to ensure quality:

#### 7.1.1 Delegated Verification

**Format**: `delegate:<worker-id>`

**Behavior**:
1. Spawn a verifier worker (e.g., "reviewer")
2. Send verification task with original worker output
3. Wait for verifier's assessment
4. Parse for approval (e.g., contains "APPROVED")

**Use case**: Human-like review of code, architecture, security

**Example**:
```json
{
  "step": 2,
  "workers": ["builder"],
  "prompt": "Implement the feature...",
  "verification": "delegate:reviewer"
}
```

---

#### 7.1.2 Deterministic Verification

**Files Exist**

**Format**: `files_exist:/path1,/path2`

**Behavior**:
1. Parse paths (comma-separated)
2. Check each file exists via filesystem API
3. Pass only if all files exist

**Use case**: Ensure artifacts were created

**Example**:
```json
{
  "verification": "files_exist:/work/task-id/rules.md,/tasks/task.md"
}
```

---

**Contains**

**Format**: `contains:<substring>`

**Behavior**:
1. Check if worker output contains the substring
2. Pass if substring is found

**Use case**: Ensure output includes required sections

**Example**:
```json
{
  "verification": "contains:SUMMARY"
}
```

---

**Must Not Contain**

**Format**: `must_not_contain:<substring>`

**Behavior**:
1. Check if worker output contains the substring
2. Pass if substring is NOT found

**Use case**: Ensure output doesn't contain error markers

**Example**:
```json
{
  "verification": "must_not_contain:CRITICAL"
}
```

---

**Run Tests**

**Format**: `run_tests:<command>`

**Behavior**:
1. Execute command via bash
2. Check exit code (0 = success)
3. Pass if exit code is 0

**Use case**: Run tests/linters as part of workflow

**Example**:
```json
{
  "verification": "run_tests:npm test"
}
```

---

### 7.2 Retry Strategies

#### Step Retry

**Strategy**: `"step-retry"`

**Behavior**:
- If verification fails on step N:
  - Increment retry count
  - Retry step N only
  - Continue to step N+1 only after step N passes

**Use case**: Individual step may need refinement without re-running entire workflow

---

#### Full Retry

**Strategy**: `"full-retry"`

**Behavior**:
- If verification fails on step N:
  - Increment retry count
  - Restart from step 0
  - Re-run entire workflow

**Use case**: Early steps may need to be adjusted based on later failures

---

## 8. Async Task Execution

### 8.1 Boomerang Pattern

The **boomerang pattern** enables async task execution with automatic orchestrator wake-up:

**Scenario**: User starts a long-running task, then disconnects. Worker finishes in background, orchestrator wakes up to process results.

**Flow**:
1. User: "Build the project and run tests"
2. Orchestrator: `delegate(to: "builder", task: "...", async: true)`
3. Plugin: Returns `{ jobId, status: "running" }`
4. User can disconnect
5. Worker processes in background...
6. Worker finishes → session goes IDLE
7. Plugin: Receives `session.idle` event
8. Plugin: Matches to job, fetches results
9. Plugin: Injects wake-up message into orchestrator session
10. Orchestrator: Wakes up "as if user returned" with results
11. Orchestrator: Continues workflow or reports to user

**Key components**:
- `jobs` map: Tracks async tasks by worker session ID
- `session.idle` event: Signals worker completion
- Wake-up injection: Makes orchestrator think user sent a message

---

### 8.2 Job Tracking

**Job creation**:
```typescript
{
  jobId: "job_01HXabc123",
  orchestratorSessionId: "sess_orch_...",
  workerInstanceId: "wkr_builder_...",
  workerSessionId: "sess_builder_...",
  createdAt: "2026-01-13T...",
  status: "running"
}
```

**Job matching** (on `session.idle`):
```typescript
const waitingJobs = [...rt.jobs.values()].filter(
  j => j.status === "running" && j.workerSessionId === idleSessionId
);
```

**Job completion**:
- Update `status` to `"completed"` or `"failed"`
- Remove from `jobs` map (optional: keep for audit trail)

---

## 9. Multi-Runtime Workers

### 9.1 Subagent Workers

**Characteristics**:
- Child session under orchestrator session
- Fast, in-process
- Shared context (can access orchestrator's state)
- Limited tool access

**Use case**: Fast, focused tasks like reading files, summarizing

**Implementation**:
```typescript
const session = await client.session.create({
  body: {
    parentID: orchestratorSessionId,
    title: `${profile.name} (subagent)`,
  },
});
```

**Pros**:
- Fast (no network overhead)
- Shared context with orchestrator

**Cons**:
- Not isolated (can access orchestrator's state)
- Limited tool access

---

### 9.2 Agent Workers

**Characteristics**:
- Independent session (no parent)
- Parallel execution possible
- Full tool access (per agent config)
- In-process (same OpenCode server)

**Use case**: Independent tasks like implementing features, running builds

**Implementation**:
```typescript
const session = await client.session.create({
  body: {
    agent: profile.agent,
    model: instance.model,
    title: `${profile.name} (agent)`,
  },
});
```

**Pros**:
- Parallel execution
- Independent state
- Full tool access

**Cons**:
- No shared context with orchestrator

---

### 9.3 Server Workers

**Characteristics**:
- Separate OpenCode server instance
- HTTP API communication via SDK
- Resource-isolated
- Future: Docker containers

**Use case**: Long-running tasks, resource-intensive work, isolation needed

**Implementation**:
```typescript
const op = await createOpencode({
  hostname: "127.0.0.1",
  port,
  config: {
    model: instance.model,
  } as any,
});

const remote = createOpencodeClient({ baseUrl: op.server.url });
const sess = await remote.session.create({ body: { title: `${profile.name} (server)` } });
```

**Pros**:
- Isolated (separate process/container)
- Can run with different configuration
- Can be resource-capped (future: Docker)

**Cons**:
- Slower (HTTP overhead)
- More complex

---

## 10. Future Extensions (v2+)

### 10.1 Orchestra Sidecar API

A reverse proxy + control plane that sits in front of OpenCode servers:

**Endpoints**:
- `/orchestra/workers` - CRUD worker templates
- `/orchestra/workflows` - CRUD workflow templates
- `/orchestra/runs` - Create/list/stop workflow runs
- `/orchestra/skills` - Skills management
- `/orchestra/events` - Unified event stream

**Benefits**:
- Single API surface for all clients
- Can enforce orchestration logic centrally
- Can add auth, rate limiting, metrics
- Easier to scale (multiple OpenCode engines behind one sidecar)

---

### 10.2 Database-Backed Scorebook

Move from file-based state to database for:

**Benefits**:
- Concurrent access (multi-user)
- Querying (find workflows by status, workers by type, etc.)
- Sharing (export/import workflows and skills)
- Versioning (track changes to templates)
- Analytics (workflow success rates, worker performance)

**Schema** (Postgres):
```
skills
worker_templates
worker_instances
workflow_templates
workflow_runs
workflow_step_runs
events
shares
```

---

### 10.3 Multi-Engine Support

Run multiple OpenCode servers for:

- Resource isolation (different projects on different servers)
- Scalability (distribute load)
- Different configurations (different models, tool sets)

Sidecar manages routing:
- `/opencode/engine1/*` → Engine 1
- `/opencode/engine2/*` → Engine 2

---

### 10.4 Docker-Native Worker Containers

Workers can run in Docker containers with resource caps:

**Configuration**:
```json
{
  "id": "shepherd",
  "runtime": "server",
  "sandbox": {
    "kind": "docker",
    "cpu": 2,
    "memoryMb": 4096,
    "image": "ghcr.io/anomalyco/opencode:latest"
  }
}
```

**Benefits**:
- True isolation
- Resource limits (CPU, memory)
- Persistent volumes for artifacts
- Can run long-running tasks safely

---

### 10.5 Real-Time Dashboard

Web UI showing:

- Live workflow runs
- Worker status
- Event log
- Performance metrics
- Stop/start workflows

---

## 11. Implementation Phases

### Phase 1: Core Plugin (Current)

**Deliverables**:
- ✅ Workforce plugin skeleton (.opencode/plugin/workforce.ts)
- ✅ Worker profiles (workers.json)
- ✅ Orchestrator agent (orchestrator.md)
- ✅ Basic workflow (workpack.json)

**Missing**:
- ❌ Plugin tool implementations
- ❌ Event handlers
- ❌ Workflow runner
- ❌ Skills management
- ❌ Command definitions

---

### Phase 2: Worker Management

**Deliverables**:
- Implement `spawn_worker` tool (subagent, agent, server)
- Implement `send_task` tool (sync + async)
- Implement `manage_worker` tool (kill, restart)
- Implement `list_workers` tool
- Add event handler for `session.idle`
- Test worker spawning and task delegation

---

### Phase 3: Workflow Runner

**Deliverables**:
- Implement `workflow_run` tool
- Implement `workflow_list` tool
- Add verification gates:
  - delegate:reviewer
  - files_exist
  - contains
  - must_not_contain
  - run_tests
- Add retry logic (step-retry, full-retry)
- Test workflow execution

---

### Phase 4: Skills Management

**Deliverables**:
- Implement `skill_list` tool
- Implement `skill_install` tool (anthropics/skills)
- Implement `skill_delete` tool
- Add git clone logic for skill sources
- Test skill installation and discovery

---

### Phase 5: Commands & Polish

**Deliverables**:
- Add `/workers` command
- Add `/workpack` command
- Add `/boomerang` command
- Add `/shepherd` command
- Create boomerang.json workflow
- Create shepherd.json workflow
- Test end-to-end workflows
- Documentation and examples

---

## 12. Success Criteria

**Phase 1 Complete**:
- Plugin loads without errors
- Orchestrator agent is configured

**Phase 2 Complete**:
- Can spawn workers (all three runtimes)
- Can send sync/async tasks
- Can manage workers (kill, restart)
- Async wake-ups work (session.idle → orchestrator message)

**Phase 3 Complete**:
- Can run workflows deterministically
- Verification gates work
- Retry logic works (step-retry, full-retry)
- Workflows fail gracefully

**Phase 4 Complete**:
- Can install skills from anthropics/skills
- Skills are discovered by OpenCode
- Can delete skills

**Phase 5 Complete**:
- All slash commands work
- All three workflows work (workpack, boomerang, shepherd)
- End-to-end user journeys work
- Documentation is complete

---

## 13. Risks & Mitigations

### Risk 1: OpenCode API Changes

**Risk**: OpenCode SDK or server API changes, breaking plugin compatibility.

**Mitigation**:
- Use well-documented, stable APIs
- Test with multiple OpenCode versions
- Monitor for deprecations
- Wrap API calls in adapters

---

### Risk 2: Event System Unreliable

**Risk**: `session.idle` events may not fire reliably, breaking async wake-ups.

**Mitigation**:
- Implement polling fallback (check job status periodically)
- Add timeout mechanism (wake up after N minutes regardless)
- Log event failures for debugging

---

### Risk 3: Server Worker Port Conflicts

**Risk**: Picking ports naively (4100-6100) may conflict with existing processes.

**Mitigation**:
- Implement proper free-port detection
- Use OS-specific port allocation APIs
- Add retry logic with exponential backoff

---

### Risk 4: Workflow Runner Complexity

**Risk**: Deterministic workflow runner becomes too complex to maintain.

**Mitigation**:
- Keep verification types simple and composable
- Use strategy pattern for different verification types
- Add extensive logging and debugging output
- Write unit tests for each verification type

---

### Risk 5: Skills Sync Conflicts

**Risk**: Syncing from anthropics/skills may conflict with local edits.

**Mitigation**:
- Treat source as read-only
- Never write back to source checkout
- Warn user if skill already exists (overwrite confirmation)
- Use version tags/commits for reproducibility

---

## 14. Testing Strategy

### Unit Tests

**Test each tool in isolation**:
- `spawn_worker`: Test all three runtime types
- `send_task`: Test sync and async paths
- `manage_worker`: Test kill and restart
- `list_workers`: Test listing
- `workflow_run`: Test happy path and failure paths
- `skill_install`: Test git clone and copy logic

---

### Integration Tests

**Test end-to-end workflows**:
- Spawn worker → send task → receive result
- Async task → session.idle → wake-up → orchestrator receives
- Workflow runs all steps → verification passes
- Workflow fails → retry → passes on second attempt

---

### Manual Tests

**Test with real OpenCode server**:
- Load plugin in OpenCode Desktop
- Interact with orchestrator via TUI
- Run slash commands
- Monitor events via SSE

---

## 15. Documentation Plan

### Developer Documentation

- Plugin architecture (this document)
- Tool API reference
- Event system reference
- Workflow JSON schema

---

### User Documentation

- How to use Orchestra (quick start)
- Worker profiles (what each worker does)
- Workflows (available workflows and how to use them)
- Slash commands (reference)

---

### Examples

- Example workflow: Adding a feature
- Example workflow: Debugging an issue
- Example workflow: Running tests
- Example workflow: Async task (boomerang)
- Example workflow: Long-running task (shepherd)
