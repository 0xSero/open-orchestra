# Orchestra: Machine State Map

## Current State (v0 - Minimal Foundation)

```
┌─────────────────────────────────────────────────────────────────┐
│                        OPENCODE SERVER                          │
│                    (CLI/Desktop/IDE Clients)                    │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             │ Standard Session API
                             │
        ┌────────────────────▼────────────────────┐
        │        ORCHESTRATOR AGENT               │
        │  (.opencode/agent/orchestrator.md)      │
        │  - Configured but NO TOOLS IMPLEMENTED  │
        │  - Has guardrails defined (in prompt)   │
        └────────────────────┬────────────────────┘
                             │
                             │ Non-functional delegation
                             │ (tools don't exist yet)
                             │
        ┌────────────────────▼────────────────────┐
        │        MISSING: WORKFORCE PLUGIN        │
        │  (.opencode/plugin/workforce.ts)        │
        │  ❌ NO WORKER SPAWNING                  │
        │  ❌ NO TASK DELEGATION                  │
        │  ❌ NO WORKFLOW RUNNER                  │
        │  ❌ NO SKILLS MANAGEMENT                │
        │  ❌ NO EVENT HOOKS                      │
        └──────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                    FILESYSTEM LAYER                             │
├─────────────────────────────────────────────────────────────────┤
│ .opencode/                                                      │
│ ├── workforce/                                                  │
│ │   ├── workers.json              ✓ EXISTS (3 profiles)         │
│ │   └── workflows/                                               │
│ │       └── workpack.json          ✓ EXISTS (1 workflow)        │
│ ├── agent/                                                      │
│ │   └── orchestrator.md           ✓ EXISTS (configured)        │
│ ├── plugin/                     ❌ MISSING                      │
│ ├── command/                    ❌ MISSING                      │
│ ├── skill/                      ❌ MISSING                      │
│ └── workforce/                                               │
│     ├── workers.json              ✓ EXISTS (3 profiles)         │
│     ├── workflows/                 │
│     │   └── workpack.json          ✓ EXISTS (2-step workflow)   │
│     └── runtime.json              ❌ MISSING                    │
│                                                                 │
│ .claude/                                                         │
│ └── skills/                      ❌ MISSING (for sync)           │
│                                                                 │
│ workforce/ (planned working directory)                         │
│ └── skill-sources/               ❌ MISSING (anthropics/skills) │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                    WORKER PROFILES (static)                     │
├─────────────────────────────────────────────────────────────────┤
│ ✓ reader      (subagent, zhipuai/glm-4.7)  - Read-only           │
│ ✓ coder       (agent, openai/gpt-5.2-codex) - Implements         │
│ ✓ reviewer    (subagent, openai/gpt-5.2)    - Reviews            │
│                                                                 │
│ NO LIVE INSTANCES - Only declarative profiles in JSON            │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                    WORKFLOWS (static)                            │
├─────────────────────────────────────────────────────────────────┤
│ ✓ workpack.json    - 2-step workflow (read → build)              │
│                   - iterations: max 2, mode until_verified       │
│                   - Has verification but NO RUNNER               │
│                                                                 │
│ ❌ boomerang.json   - Async wake-up workflow                      │
│ ❌ shepherd.json    - Long-running iterative workflow             │
│                                                                 │
│ NO WORKFLOW RUNNER - Definitions exist but can't execute        │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                    DATA FLOW (BROKEN)                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  USER REQUEST ──► ORCHESTRATOR ──► ??? (no tools exist)           │
│                     │                                            │
│                     ├──► delegate(to: "reader")    ❌ NO IMPL     │
│                     ├──► workflow(id: "workpack") ❌ NO IMPL     │
│                     └──► workers()                ❌ NO IMPL     │
│                                                                 │
│  NO WORKER SESSIONS CREATED                                       │
│  NO TASK EXECUTION                                                │
│  NO RESULT COLLECTION                                            │
│  NO ASYNC WAKE-UPS                                                │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                    EVENT STREAM (PASSIVE)                        │
├─────────────────────────────────────────────────────────────────┤
│  ✓ OpenCode server emits events (SSE)                           │
│  ❌ NO LISTENER (plugin doesn't exist)                           │
│  ❌ NO session.idle hooking                                      │
│  ❌ NO worker wake-ups injected                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Desired State (v1 - Functional Workforce Control Plane)

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                        ORCHESTRA ARCHITECTURE                                   │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                        OPENCODE SERVER                               │   │
│  │                    (port 4096, internal only)                        │   │
│  │                    + Workforce Plugin Loaded                         │   │
│  └────────────────────────┬────────────────────────────────────────────┘   │
│                           │                                                │
│                           │ Event Stream (SSE)                             │
│                           │ session.created, session.idle,                  │
│                           │ message.updated, tool.execute.before/after     │
│                           │                                                │
│  ┌────────────────────────▼────────────────────────────────────────────┐   │
│  │                   WORKFORCE PLUGIN                                   │   │
│  │              (.opencode/plugin/workforce.ts)                         │   │
│  │                                                                      │   │
│  │  ┌──────────────────────────────────────────────────────────────┐  │   │
│  │  │  EVENT HANDLERS                                               │  │   │
│  │  │  - session.idle → Detect worker task completion              │  │   │
│  │  │  - Inject wake-up message into orchestrator session           │  │   │
│  │  │  - Forward events to Orchestra API (optional)                │  │   │
│  │  └──────────────────────────────────────────────────────────────┘  │   │
│  │                                                                      │   │
│  │  ┌──────────────────────────────────────────────────────────────┐  │   │
│  │  │  TOOLS (exposed to LLM via OpenCode tool system)             │  │   │
│  │  │                                                               │  │   │
│  │  │  WORKER MANAGEMENT:                                          │  │   │
│  │  │  ✓ workforce_list_workers      - List profiles + instances    │  │   │
│  │  │  ✓ workforce_spawn_worker      - Spawn subagent/agent/server │  │   │
│  │  │  ✓ workforce_send_task         - Send task (sync/async)       │  │   │
│  │  │  ✓ workforce_manage_worker     - Kill/restart                 │  │   │
│  │  │                                                               │  │   │
│  │  │  WORKFLOW EXECUTION:                                         │  │   │
│  │  │  ✓ workforce_workflow_run        - Run workflow (deterministic)│   │
│  │  │  ✓ workforce_workflow_list       - List available workflows  │  │   │
│  │  │                                                               │  │   │
│  │  │  SKILLS MANAGEMENT:                                          │  │   │
│  │  │  ✓ workforce_skill_list          - List installed skills     │  │   │
│  │  │  ✓ workforce_skill_install       - Install from anthropics/   │  │   │
│  │  │  ✓ workforce_skill_delete        - Delete skill              │  │   │
│  │  │                                                               │  │   │
│  │  └──────────────────────────────────────────────────────────────┘  │   │
│  │                                                                      │   │
│  │  ┌──────────────────────────────────────────────────────────────┐  │   │
│  │  │  RUNTIME STATE (in-memory per worktree)                      │  │   │
│  │  │  - profiles: Map<string, WorkerProfile>                       │  │   │
│  │  │  - instances: Map<string, WorkerInstance>                      │  │   │
│  │  │  - jobs: Map<string, Job>                                     │  │   │
│  │  │  - serverHandles: Map<string, {baseUrl, close}>               │  │   │
│  │  └──────────────────────────────────────────────────────────────┘  │   │
│  └────────────────────────┬────────────────────────────────────────────┘   │
│                           │                                                │
│                           │ Plugin Tools                                    │
│                           │ (orchestrator calls these via OpenCode API)    │
│                           │                                                │
│  ┌────────────────────────▼────────────────────────────────────────────┐   │
│  │                   ORCHESTRATOR AGENT                                 │   │
│  │              (.opencode/agent/orchestrator.md)                        │   │
│  │                                                                      │   │
│  │  RULES:                                                              │   │
│  │  ✓ Never execute user requests directly                             │   │
│  │  ✓ Only use workforce tools                                          │   │
│  │  ✓ Delegate to workers                                               │   │
│  │  ✓ Run workflows when available                                      │   │
│  │                                                                      │   │
│  │  TOOL PERMISSIONS:                                                   │   │
│  │  ✓ delegate (alias for send_task)                                   │   │
│  │  ✓ workflow (alias for workflow_run)                                │   │
│  │  ✓ workers (alias for list_workers)                                 │   │
│  │  ✓ todowrite, todoread (meta tools)                                 │   │
│  │  ✗ write, edit, bash, read, glob, grep, webfetch, websearch          │   │
│  └────────────────────────┬────────────────────────────────────────────┘   │
│                           │                                                │
│                           │ User Interaction (TUI/Desktop/IDE)            │
│                           │                                                │
│  ┌────────────────────────▼────────────────────────────────────────────┐   │
│  │                   USER INTERACTION                                   │   │
│  │                                                                      │   │
│  │  SLASH COMMANDS:                                                    │   │
│  │  ✓ /workers     → Prompts orchestrator to list workers               │   │
│  │  ✓ /workpack    → Runs workpack workflow                            │   │
│  │  ✓ /boomerang   → Runs async boomerang workflow                     │   │
│  │  ✓ /shepherd    → Runs long-running shepherd workflow               │   │
│  │                                                                      │   │
│  │  NATURAL LANGUAGE:                                                   │   │
│  │  User: "Add a logout button to the header"                          │   │
│  │    → Orchestrator delegates to workers                               │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────────────┐
│                    WORKER EXECUTION LAYER                                    │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  WORKER TYPE 1: SUBAGENT (in-proc, child session)                           │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │  Orchestrator Session (sess_orch)                                     │  │
│  │      │                                                                │  │
│  │      └──► Child Session (sess_reader)  ← WORKER INSTANCE              │  │
│  │              - Fast, shared context                                  │  │
│  │              - parentID: sess_orch                                    │  │
│  │              - Limited tool access                                    │  │
│  │              - Used for: reader, reviewer                              │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│                                                                              │
│  WORKER TYPE 2: AGENT SESSION (in-proc, independent session)                │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │  Orchestrator Session (sess_orch)                                     │  │
│  │      │                                                                │  │
│  │      └──► Independent Session (sess_builder)  ← WORKER INSTANCE      │  │
│  │              - Parallel execution                                    │  │
│  │              - Separate from orchestrator                           │  │
│  │              - Full tool access (per agent config)                    │  │
│  │              - Used for: builder, coder                               │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│                                                                              │
│  WORKER TYPE 3: SERVER (separate OpenCode instance)                          │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │  Orchestrator Session (sess_orch)                                     │  │
│  │      │                                                                │  │
│  │      └──► SDK Client → OpenCode Server (port 4100+) ← WORKER INSTANCE │  │
│  │                      - HTTP API communication                        │  │
│  │                      - Resource-isolated                              │  │
│  │                      - Future: Docker container                      │  │
│  │                      - Used for: shepherd, long-running tasks        │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────────────┐
│                    WORKFLOW EXECUTION (DETERMINISTIC)                        │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  workflow_run(workflow_id)                                                  │
│       │                                                                      │
│       ▼                                                                      │
│  1. Load workflow definition (.opencode/workforce/workflows/*.json)          │
│       │                                                                      │
│       ▼                                                                      │
│  2. For each step in workflow_steps:                                         │
│       │                                                                      │
│       │   2a. Spawn required workers (if not already active)                │
│       │       - spawn_worker(worker_id, runtime, model)                     │
│       │                                                                      │
│       │   2b. Send prompt to worker                                         │
│       │       - send_task(instanceId, rendered_prompt)                      │
│       │                                                                      │
│       │   2c. Wait for completion (sync OR async via event)                 │
│       │                                                                      │
│       │   2d. Run verification                                              │
│       │       - Deterministic: files_exist, must_contain, run_tests          │
│       │       - Delegated: delegate:reviewer (spawn verifier worker)         │
│       │                                                                      │
│       │   2e. If verification fails AND iterations < max:                   │
│       │       - Increment retry count                                       │
│       │       - Retry step (step-retry) OR retry entire workflow (full-retry)│
│       │                                                                      │
│       │   2f. If verification passes:                                       │
│       │       - Mark step as completed                                      │
│       │       - Move to next step                                           │
│       │                                                                      │
│       ▼                                                                      │
│  3. All steps complete → Mark workflow run as SUCCESS                       │
│       OR                                                                    │
│     Max iterations reached → Mark workflow run as FAILED                    │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────────────┐
│                    ASYNC WAKE-UP MECHANISM                                    │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  BOOMERANG PATTERN (async task → orchestrator wake-up)                       │
│                                                                              │
│  1. Orchestrator sends async task to worker:                                 │
│     delegate(to: "builder", task: "...", async: true)                         │
│                                                                              │
│  2. Plugin creates job record:                                               │
│     {                                                                         │
│       jobId: "job_xyz",                                                      │
│       orchestratorSessionId: "sess_orch",                                    │
│       workerInstanceId: "wkr_reader",                                        │
│       workerSessionId: "sess_reader",                                        │
│       status: "running"                                                      │
│     }                                                                         │
│                                                                              │
│  3. Worker session processes task in background                              │
│                                                                              │
│  4. Worker session finishes → goes IDLE                                      │
│                                                                              │
│  5. Plugin receives session.idle event:                                      │
│     event: { type: "session.idle", sessionID: "sess_reader" }               │
│                                                                              │
│  6. Plugin looks up pending jobs for that session:                           │
│     jobs.values().filter(j => j.workerSessionId === sess_reader)            │
│                                                                              │
│  7. Plugin fetches worker's last messages                                    │
│                                                                              │
│  8. Plugin injects wake-up message into orchestrator session:               │
│     POST /session/sess_orch/prompt                                           │
│     body: {                                                                  │
│       parts: [{ type: "text", text: "Worker completed job job_xyz.\n\n..." }]│
│     }                                                                         │
│                                                                              │
│  9. Orchestrator receives message "as if user"                               │
│     → Continues workflow, sends next task                                   │
│                                                                              │
│  10. Job status updated to "completed"                                        │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────────────┐
│                    SKILLS MANAGEMENT                                         │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  SKILL SOURCES:                                                              │
│  ✓ Project-local: .opencode/skill/<name>/SKILL.md                           │
│  ✓ Global: ~/.config/opencode/skill/<name>/SKILL.md                         │
│  ✓ Claude-compatible: .claude/skills/<name>/SKILL.md                        │
│                                                                              │
│  SYNC FLOW:                                                                  │
│                                                                              │
│  1. skill_install(from: "anthropics/skills", skill_names: ["thrive-data"])  │
│       │                                                                      │
│       ▼                                                                      │
│  2. Clone anthropics/skills into .opencode/workforce/skill-sources/         │
│       (if not already cloned)                                                │
│       │                                                                      │
│       ▼                                                                      │
│  3. Parse SKILL.md files, extract metadata (name, description, license)      │
│       │                                                                      │
       ▼                                                                      │
│  4. Copy skill directory to .claude/skills/<name>/                          │
│       (OpenCode auto-discovers from there)                                   │
│       │                                                                      │
│       ▼                                                                      │
│  5. OpenCode loads skill automatically                                      │
│       → Available to all agents/workers                                     │
│                                                                              │
│  CRUD OPERATIONS:                                                            │
│  ✓ skill_list() → List installed skills                                      │
│  ✓ skill_delete(name) → Remove skill directory                               │
│  (Optional: skill_edit, skill_share)                                        │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────────────┐
│                    FILESYSTEM (COMPLETE)                                     │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  .opencode/                                                                  │
│  ├── plugin/                                                                 │
│  │   └── workforce.ts                    ✓ WORKFORCE PLUGIN IMPLEMENTED     │
│  │                                                                         │
│  ├── agent/                                                                  │
│  │   ├── orchestrator.md                 ✓ CONFIGURED WITH TOOLS          │
│  │   ├── reader.md                      (optional: worker-specific agents)  │
│  │   ├── builder.md                                                           │
│  │   └── reviewer.md                                                         │
│  │                                                                         │
│  ├── command/                                                                 │
│  │   ├── workers.md                    ✓ PROMPTS LIST WORKERS              │
│  │   ├── workflow-workpack.md          ✓ RUNS WORKPACK WORKFLOW           │
│  │   ├── workflow-boomerang.md         ✓ RUNS BOOMERANG WORKFLOW         │
│  │   └── workflow-shepherd.md           ✓ RUNS SHEPHERD WORKFLOW          │
│  │                                                                         │
│  ├── skill/                       ✓ AUTO-CREATED (from install)            │
│  │   └── <name>/SKILL.md             (installed skills materialized)        │
│  │                                                                         │
│  └── workforce/                                                               │
│      ├── workers.json                    ✓ 3+ worker profiles            │
│      ├── runtime.json                    ✓ (optional snapshot)            │
│      ├── skill-sources/                  ✓ Git repos for skills           │
│      │   └── anthropics-skills/                                               │
│      └── workflows/                                                           │
│          ├── workpack.json               ✓ 2-4 step workflow              │
│          ├── boomerang.json              ✓ Async workflow                │
│          └── shepherd.json               ✓ Long-running iterative        │
│                                                                              │
│  .claude/                                                                    │
│  └── skills/                           ✓ AUTO-CREATED (from install)        │
│      └── <name>/SKILL.md                                                         │
│                                                                              │
│  workforce/ (working directory for workflow artifacts)                        │
│  ├── work/                         ✓ Created during workflow runs             │
│  │   ├── <task-id>/                                                          │
│  │   │   ├── rules.md                                                         │
│  │   │   ├── scope.md                                                         │
│  │   │   └── results.md                                                       │
│  └── tasks/                                                                   │
│      └── task.md                                                              │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────────────┐
│                    DATA FLOW (FUNCTIONAL)                                    │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  USER REQUEST                                                                │
│       │                                                                      │
│       ▼                                                                      │
│  [TUI/DESKTOP/IDE] → ORCHESTRATOR SESSION                                    │
│       │                                                                      │
│       ▼                                                                      │
│  ORCHESTRATOR (interprets request)                                           │
│       │                                                                      │
│       ├──► Has workflow? → workflow_run("workpack")                        │
│       │        │                                                             │
│       │        ▼                                                             │
│       │    WORKFLOW RUNNER (deterministic)                                   │
│       │        │                                                             │
│       │        ├──► Step 0: spawn_worker("reader")                         │
│       │        │         │                                                   │
│       │        │         └──► Create child session                          │
│       │        │                   │                                         │
│       │        │                   └──► Send prompt via SDK                 │
│       │        │                              │                                │
│       │        │                              └──► Worker executes          │
│       │        │                                         │                   │
│       │        │                                         └──► Returns result  │
│       │        │                                                   │         │
│       │        ├──► Step 1: verification (files_exist, contains, etc.)      │
│       │        │         │                                                   │
│       │        └──► Step 2: spawn_worker("builder")                        │
│       │                  │                                                   │
│       │                  └──► Send task (async)                              │
│       │                              │                                      │
│       │                              └──► Worker processes in background    │
│       │                                                   │                 │
│       │                                                   ▼                 │
│       │                                              session.idle            │
│       │                                                   │                 │
│       │                                                   ▼                 │
│       │                                              Plugin wakes up        │
│       │                                              orchestrator           │
│       │                                                   │                 │
│       │                                                   ▼                 │
│       │                                            Orchestrator sees        │
│       │                                            "user message"           │
│       │                                                   │                 │
│       │                                                   ▼                 │
│       │                                         Continue workflow...        │
│       │                                                                      │
│       └──► No workflow? → Manual delegation                                 │
│                │                                                             │
│                ├──► delegate(to: "reader", task: "...")                     │
│                │         │                                                   │
│                │         └──► send_task(instanceId, prompt)                 │
│                │                              │                               │
│                │                              └──► Worker executes         │
│                │                                         │                    │
│                │                                         └──► Returns result  │
│                │                                                   │         │
│                └──► delegate(to: "reviewer", task: "...")                   │
│                          │                                                   │
│                          └──► ...                                            │
│                                                                              │
│  RESULT                                                                      │
│       │                                                                      │
│       ▼                                                                      │
│  [TUI/DESKTOP/IDE] → Displays result to user                                 │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────────────┐
│                    WORKER PROFILES (ACTIVE)                                  │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  WORKER TEMPLATES (.opencode/workforce/workers.json):                         │
│                                                                              │
│  ✓ reader      (subagent, zhipuai/glm-4.7)  - Read-only, fast                │
│     - skills: ["pdf", "docx"]                                               │
│     - tools: { read: true, grep: true }                                      │
│                                                                              │
│  ✓ coder       (agent, openai/gpt-5.2-codex) - Implements, writes code      │
│     - tools: { write: true, edit: true, bash: true }                        │
│                                                                              │
│  ✓ reviewer    (subagent, openai/gpt-5.2)    - Reviews, security             │
│     - tools: { read: true, glob: true }                                      │
│                                                                              │
│  ✓ shepherd    (server, anthropic/claude-sonnet-4)  - Long-running         │
│     - sandbox: { kind: "docker", cpu: 2, memoryMb: 4096 }                   │
│     - tools: all                                                            │
│                                                                              │
│  WORKER INSTANCES (in-memory, created on demand):                           │
│  - instanceId: "wkr_01HXabc123..."                                          │
│  - workerId: "reader"                                                        │
│  - runtime: "subagent"                                                       │
│  - sessionId: "sess_reader_..."                                              │
│  - status: "available" | "busy" | "off"                                      │
│  - createdAt: "2026-01-13T..."                                              │
│  - lastSeenAt: "2026-01-13T..."                                              │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────────────┐
│                    WORKFLOWS (ACTIVE)                                        │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ✓ workpack.json  - Multi-step development flow                              │
│     Steps:                                                                  │
│       0. Read repo → reader                                                 │
│       1. Create artifacts (rules.md, scope.md, task.md) → builder           │
│       2. Implement task → builder                                           │
│       3. Review changes → reviewer                                          │
│     Verification per step (files_exist, delegate:reviewer, etc.)            │
│     Iterations: max 2, mode "until_verified"                                 │
│                                                                              │
│  ✓ boomerang.json  - Async wake-up workflow                                  │
│     Steps:                                                                  │
│       0. Delegate async task to builder                                     │
│       1. Wait for worker wake-up (session.idle event)                       │
│       2. Process results                                                   │
│     Used for: long-running tasks where user can disconnect                  │
│                                                                              │
│  ✓ shepherd.json  - Long-running iterative workflow                         │
│     Steps:                                                                  │
│       0. Spawn server worker (docker container)                             │
│       1. Execute task in container                                         │
│       2. Verify                                                             │
│       3. If failed → fix loop → checkpoint → repeat                         │
│     Stops via API call (stop_workflow)                                        │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────────────┐
│                    API SURFACE (via OpenCode Plugin Tools)                  │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  WORKER MANAGEMENT:                                                          │
│  POST /tool/workforce_spawn_worker                                           │
│  POST /tool/workforce_send_task                                              │
│  POST /tool/workforce_manage_worker                                          │
│  POST /tool/workforce_list_workers                                           │
│                                                                              │
│  WORKFLOW EXECUTION:                                                         │
│  POST /tool/workforce_workflow_run                                           │
│  POST /tool/workforce_workflow_list                                          │
│                                                                              │
│  SKILLS MANAGEMENT:                                                          │
│  POST /tool/workforce_skill_list                                            │
│  POST /tool/workforce_skill_install                                         │
│  POST /tool/workforce_skill_delete                                          │
│                                                                              │
│  EVENTS (SSE):                                                               │
│  GET /event → Stream:                                                        │
│  - session.created                                                          │
│  - session.idle                                                              │
│  - session.status                                                            │
│  - message.updated                                                           │
│  - tool.execute.before                                                       │
│  - tool.execute.after                                                        │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘
```

---

## Architecture Principles

### Current → Desired Transition Strategy

1. **Incremental implementation**: Plugin can be added without disrupting existing OpenCode
2. **File-based state**: All durable state in JSON/MD files (easily inspectable, version-controlled)
3. **Event-driven async**: Uses OpenCode's native event system (no polling)
4. **Tool-based delegation**: LLM calls tools, plugin implements behavior (natural pattern)
5. **Multi-runtime support**: Starts with in-proc (subagent/agent), evolves to server (Docker)

### Why This Architecture Works

- **No new UI**: Use existing TUI/Desktop/IDE as-is
- **OpenCode-native**: Uses plugin API, sessions API, SSE events
- **Deterministic workflows**: Code runner, not LLM-driven orchestration
- **Headless**: Can be driven via SDK from any future UI (web/desktop/mobile)
- **Observable**: Everything tracked in state, events stream all actions

### Future Extensions (v2+)

- Orchestra Sidecar API (reverse proxy + control plane)
- Database-backed Scorebook (skills/workers/workflows/versions)
- Multi-engine support (multiple OpenCode servers)
- Docker-native worker containers
- Sharing/export/import of workflows and skills
- Real-time performance dashboard (web UI)
