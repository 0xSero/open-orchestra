# SDK Module (packages/sdk)

## Overview

The SDK provides a TypeScript client for communicating with the OpenCode server. It includes both client and server utilities for managing OpenCode instances.

## State Machine

```
┌─────────────────────────────────────────────────────────────────────────┐
│                      SDK INITIALIZATION FLOW                            │
└─────────────────────────────────────────────────────────────────────────┘

                    ┌───────────────┐
                    │  IMPORT SDK   │
                    └───────┬───────┘
                            │
        ┌───────────────────┼───────────────────┐
        │                   │                   │
        ▼                   ▼                   ▼
┌───────────────┐   ┌───────────────┐   ┌───────────────┐
│createOpencode │   │createOpencode │   │createOpencode │
│  Client()     │   │   Server()    │   │     Tui()     │
└───────┬───────┘   └───────┬───────┘   └───────┬───────┘
        │                   │                   │
        ▼                   ▼                   ▼
┌───────────────┐   ┌───────────────┐   ┌───────────────┐
│ OpencodeClient│   │ Server spawn  │   │  TUI spawn    │
│    instance   │   │ with URL      │   │  with stdio   │
└───────────────┘   └───────────────┘   └───────────────┘
```

## Directory Structure

```
packages/sdk/
├── src/
│   ├── index.ts           # Main exports
│   ├── client.ts          # Client factory
│   ├── server.ts          # Server & TUI spawning
│   ├── gen/               # Auto-generated types
│   │   ├── types.gen.ts   # API types
│   │   ├── sdk.gen.ts     # SDK client class
│   │   ├── client/        # Client utilities
│   │   └── core/          # Core helpers
│   └── v2/                # V2 API (future)
├── package.json
└── tsconfig.json
```

## API Client Flow

```
┌─────────────────────────────────────────────────────────────────────────┐
│                      CLIENT API STRUCTURE                                │
└─────────────────────────────────────────────────────────────────────────┘

                    ┌───────────────────┐
                    │  OpencodeClient   │
                    └─────────┬─────────┘
                              │
    ┌─────────────────────────┼─────────────────────────┐
    │                         │                         │
    ▼                         ▼                         ▼
┌─────────┐             ┌─────────┐             ┌─────────┐
│ session │             │  file   │             │ project │
│         │             │         │             │         │
│ • list  │             │ • list  │             │ • list  │
│ • create│             │ • read  │             │ • current│
│ • get   │             │ • status│             │ • update│
│ • update│             └─────────┘             └─────────┘
│ • delete│
│ • messages│            ┌─────────┐             ┌─────────┐
│ • prompt │            │  pty    │             │  tool   │
│ • abort  │            │         │             │         │
│ • fork   │            │ • list  │             │ • ids   │
│ • share  │            │ • create│             │ • list  │
│ • diff   │            │ • remove│             └─────────┘
│ • summarize│          │ • get   │
└─────────┘             │ • connect│
                        └─────────┘
```

## Key Exports

### createOpencodeClient(config)
Creates an API client for communicating with an OpenCode server.

```typescript
import { createOpencodeClient } from "@opencode-ai/sdk"

const client = createOpencodeClient({
  baseUrl: "http://localhost:4096",
  directory: "/path/to/project"  // Optional
})

// Use the client
const sessions = await client.session.list()
const file = await client.file.read({
  directory: "/project",
  path: ".opencode/workforce/workers.json"
})
```

### createOpencodeServer(options)
Spawns an OpenCode server process and returns the URL.

```typescript
import { createOpencodeServer } from "@opencode-ai/sdk"

const server = await createOpencodeServer({
  hostname: "127.0.0.1",
  port: 4096,
  timeout: 5000
})

console.log(`Server running at ${server.url}`)
// Later: server.close()
```

### createOpencodeTui(options)
Spawns the OpenCode TUI in the current terminal.

```typescript
import { createOpencodeTui } from "@opencode-ai/sdk"

const tui = createOpencodeTui({
  project: "/path/to/project",
  model: "anthropic/claude-sonnet-4",
  session: "optional-session-id"
})
```

## Generated Types

The SDK includes auto-generated types from the OpenAPI spec:

| Type | Purpose |
|------|---------|
| `Session` | Chat session metadata |
| `Message` | Message in a session |
| `FileDiff` | File diff information |
| `Project` | Project configuration |
| `Pty` | Pseudo-terminal instance |
| `Tool` | Available tool definition |

## Connections

| Source | Target | Protocol |
|--------|--------|----------|
| SDK Client | OpenCode Server | HTTP REST |
| SDK Server | opencode CLI | Process spawn |
| SDK TUI | opencode CLI | Process spawn (stdio) |

## Configuration

### Client Config
```typescript
type Config = {
  baseUrl: string
  headers?: Record<string, string>
  fetch?: typeof fetch
  logLevel?: "debug" | "info" | "warn" | "error"
}
```

### Server Options
```typescript
type ServerOptions = {
  hostname?: string      // Default: "127.0.0.1"
  port?: number          // Default: 4096
  signal?: AbortSignal   // For cancellation
  timeout?: number       // Default: 5000ms
  config?: Config
}
```
