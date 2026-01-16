# Orchestra Monorepo Architecture

## Overview

Orchestra is a multi-agent orchestration system built as a Bun monorepo. It provides a dashboard for managing AI workers, workflows, and integrations.

## State Machine Graph

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           MONOREPO ROOT                                  │
│  /Users/sero/projects/orchestra                                         │
└───────────────────────────────┬─────────────────────────────────────────┘
                                │
        ┌───────────────────────┼───────────────────────┐
        │                       │                       │
        ▼                       ▼                       ▼
┌───────────────┐      ┌───────────────┐      ┌───────────────┐
│   packages/   │      │   .opencode/  │      │    docs/      │
│    app        │      │   workforce   │      │  (generated)  │
│    apps/      │      │   - workers   │      └───────────────┘
│    plugin     │      │   - workflows │
│    sdk        │      │   - integr.   │
│    ui         │      └───────────────┘
│    util       │
└───────────────┘
```

## Data Flow

```
┌──────────────────────────────────────────────────────────────────────────┐
│                          DATA FLOW DIAGRAM                               │
└──────────────────────────────────────────────────────────────────────────┘

   ┌─────────────┐         ┌─────────────┐         ┌─────────────┐
   │   User      │         │  OpenCode   │         │  .opencode/ │
   │   Browser   │◄───────►│   Server    │◄───────►│  workforce  │
   │   /Tauri    │   HTTP  │  :4096      │  File   │  JSON files │
   └─────────────┘         └─────────────┘   I/O   └─────────────┘
         │                       │
         │                       │
         ▼                       ▼
   ┌─────────────┐         ┌─────────────┐
   │  packages/  │         │  AI Workers │
   │    app      │         │  (runtime)  │
   │  Orchestra  │         │ subagent/   │
   │  Dashboard  │         │ agent       │
   └─────────────┘         └─────────────┘
```

## Package Dependencies

```
┌─────────────────────────────────────────────────────────────────────────┐
│                     PACKAGE DEPENDENCY GRAPH                            │
└─────────────────────────────────────────────────────────────────────────┘

                        ┌───────────────┐
                        │  packages/ui  │
                        │  (components) │
                        └───────┬───────┘
                                │
                                ▼
                        ┌───────────────┐
          ┌────────────►│ packages/app  │◄────────────┐
          │             │ (shared app)  │             │
          │             └───────────────┘             │
          │                     │                     │
          │                     │ uses                │
          │                     ▼                     │
   ┌──────┴──────┐      ┌───────────────┐     ┌──────┴──────┐
   │ apps/tauri  │      │ packages/sdk  │     │  apps/web   │
   │  (desktop)  │      │ (SDK client)  │     │   (web)     │
   └─────────────┘      └───────────────┘     └─────────────┘
          │                     │                     │
          │                     ▼                     │
          │             ┌───────────────┐             │
          └────────────►│packages/util  │◄────────────┘
                        │  (utilities)  │
                        └───────────────┘
                                │
                                ▼
                        ┌───────────────┐
                        │packages/plugin│
                        │ (Orchestra)   │
                        └───────────────┘
```

## Module Summary

| Module | Path | Purpose |
|--------|------|---------|
| **app** | `packages/app` | Shared Solid.js app components and pages |
| **ui** | `packages/apps/ui` | Reusable UI component library |
| **web** | `packages/apps/web` | Web application entry point |
| **tauri** | `packages/apps/tauri` | Desktop application (Tauri + Rust) |
| **plugin** | `packages/plugin` | Orchestra plugin with agent definitions |
| **sdk** | `packages/sdk` | SDK for communicating with OpenCode server |
| **util** | `packages/util` | Shared utility functions |

## Key Configuration Files

- `package.json` - Root monorepo configuration
- `bun.lock` - Bun lockfile for dependencies
- `tsconfig.json` - TypeScript configuration
- `.opencode/workforce/workers.json` - Worker definitions
- `.opencode/workforce/integrations.json` - Integration definitions
- `.opencode/workforce/workflows/*.json` - Workflow definitions
