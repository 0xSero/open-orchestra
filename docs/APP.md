# App Module (packages/app)

## Overview

The shared Solid.js application containing pages, components, and contexts used by both web and desktop apps.

## State Machine

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        APP STATE MACHINE                                 │
└─────────────────────────────────────────────────────────────────────────┘

                    ┌───────────────┐
                    │   INITIAL     │
                    └───────┬───────┘
                            │
                            ▼
                    ┌───────────────┐
                    │  CONNECTING   │──────► Server URL resolution
                    │  TO SERVER    │
                    └───────┬───────┘
                            │
                            ▼
                    ┌───────────────┐
                    │    SYNCING    │──────► GlobalSync fetches data
                    └───────┬───────┘
                            │
        ┌───────────────────┼───────────────────┐
        │                   │                   │
        ▼                   ▼                   ▼
┌───────────────┐   ┌───────────────┐   ┌───────────────┐
│     HOME      │   │   SESSION     │   │   ORCHESTRA   │
│     PAGE      │   │    PAGE       │   │   DASHBOARD   │
└───────────────┘   └───────────────┘   └───────────────┘
```

## Directory Structure

```
packages/app/
├── src/
│   ├── app.tsx              # Main app component with routing
│   ├── entry.tsx            # Entry point
│   ├── index.css            # Global styles (Tailwind)
│   ├── pages/
│   │   ├── home.tsx         # Home page
│   │   ├── session.tsx      # Session page
│   │   ├── orchestra.tsx    # Orchestra Dashboard
│   │   ├── layout.tsx       # Main layout with sidebar
│   │   └── directory-layout.tsx
│   ├── context/
│   │   ├── global-sdk.tsx   # SDK provider
│   │   ├── global-sync.tsx  # Data sync provider
│   │   ├── layout.tsx       # Layout state
│   │   ├── platform.tsx     # Platform detection
│   │   └── ...
│   ├── components/
│   │   └── ...              # Reusable components
│   ├── hooks/
│   │   └── ...              # Custom hooks
│   └── utils/
│       └── ...              # Utility functions
└── package.json
```

## Orchestra Dashboard Data Flow

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    ORCHESTRA PAGE DATA FLOW                              │
└─────────────────────────────────────────────────────────────────────────┘

  ┌──────────────┐      ┌──────────────┐      ┌──────────────┐
  │ createSignal │      │createResource│      │   onMount    │
  │  activeTab   │      │    data      │      │ auto-refresh │
  │  isEditing   │      │   refetch    │      │  interval    │
  └──────┬───────┘      └──────┬───────┘      └──────┬───────┘
         │                     │                     │
         │                     ▼                     │
         │         ┌───────────────────┐             │
         │         │  loadOrchestraData │            │
         │         │  FromDirectory()   │            │
         │         └─────────┬─────────┘             │
         │                   │                       │
         │                   ▼                       │
         │         ┌───────────────────┐             │
         │         │  SDK file.read()   │            │
         │         │  SDK file.list()   │            │
         │         └─────────┬─────────┘             │
         │                   │                       │
         │                   ▼                       │
         │         ┌───────────────────┐             │
         │         │  JSON.parse()      │            │
         │         │  workers.json      │            │
         │         │  integrations.json │            │
         │         │  workflows/*.json  │            │
         │         │  runtime.json      │            │
         │         │  memories.json     │            │
         │         └─────────┬─────────┘             │
         │                   │                       │
         ▼                   ▼                       ▼
  ┌─────────────────────────────────────────────────────────┐
  │                    RENDER UI                             │
  │  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌─────────┐  │
  │  │ Workers  │  │ Workflows│  │ Servers  │  │ Memories│  │
  │  │   Tab    │  │   Tab    │  │   Tab    │  │   Tab   │  │
  │  └──────────┘  └──────────┘  └──────────┘  └─────────┘  │
  └─────────────────────────────────────────────────────────┘
```

## Key Components

### OrchestraPage
- Main dashboard component
- Manages tabs (Workers, Workflows, Servers, Skills, Memories)
- Auto-refreshes every 5 seconds (paused when editing)

### WorkersTab
- Displays worker templates as cards
- Shows running worker instances
- Edit modal for worker configuration

### WorkflowsTab
- Displays workflow definitions
- Shows workflow steps and iterations
- Edit modal for workflow configuration

### ServersTab (Integrations)
- Displays integration definitions (MCP, HTTP, STDIO)
- Shows running integration instances
- Edit modal for integration configuration

### MemoriesTab
- Displays memory entries recorded by the memory agent
- Supports filtering by content/tags/source

## Runtime + Memory Data Contracts

The Orchestra dashboard reads runtime state from `.opencode/workforce/runtime.json` and merges persisted memories from `.opencode/workforce/memories.json`.

- `runtime.json` provides `timestamp`, `instances`, `jobs`, `workflowRuns`, `integrationInstances`, and `memoryEntries`.
- `memories.json` stores `{ entries: MemoryEntry[] }` and is merged into the runtime `memoryEntries` list.
- The loader dedupes records by stable IDs (`instanceId`, `jobId`, `runId`, `integrationId`, `id`) before rendering.

## Validation

- `bun test packages/app/src/pages/orchestra/orchestra-memory-utils.test.ts`
- `bun run --cwd packages/app test:e2e`

## Orchestra Runtime UI Checklist

- Workers tab shows configured workers + running instances/jobs when present.
- Workflows tab shows run history and step summaries.
- Servers tab shows integration instance status with safe metadata.
- Memories tab lists persisted entries from `memories.json`.

## Connections

| Source | Target | Protocol |
|--------|--------|----------|
| App | OpenCode Server | HTTP REST API |
| App | SDK | TypeScript imports |
| App | UI Components | Solid.js components |
