# AI Agent Development Guide

This document provides comprehensive guidance for AI coding agents working on the Orchestra repository - a plugin-based system for orchestrating AI workers and workflows.

## Table of Contents

- [Development Commands](#development-commands)
- [Code Style Guidelines](#code-style-guidelines)
- [Project Architecture](#project-architecture)
- [Testing Patterns](#testing-patterns)
- [Tech Stack](#tech-stack)
- [File Organization](#file-organization)
- [Worker System](#worker-system)
- [Integration System](#integration-system)

## Development Commands

All commands use the Bun runtime and toolchain:

```bash
# Run all tests
bun test

# Type checking
bun run typecheck

# Run specific test file
bun test test/tools.test.ts

# Filter tests by name pattern
bun test -t "worker instances"

# Watch mode for continuous testing
bun test --watch
```

## Code Style Guidelines

### Import Organization
Organize imports in this specific order:
1. External type imports using `import type`
2. External package imports
3. Internal imports (relative paths)
4. Node.js built-in imports (prefixed with `node:`)

```typescript
import type { ToolDefinition } from "@opencode-ai/plugin"
import { tool } from "@opencode-ai/plugin"
import type { createOpencodeClient } from "@opencode-ai/sdk"
import type { Store } from "./store"
import type { WorkerInstance, Job } from "./types"
import { readFile, writeFile } from "node:fs/promises"
import { join } from "node:path"
```

### Formatting Rules
- **Indentation**: 2 spaces (no tabs)
- **Quotes**: Double quotes always (`"string"`)
- **Semicolons**: Always required
- **Trailing commas**: Required in multi-line objects/arrays

### Naming Conventions
- **Variables/Functions**: `camelCase`
- **Types/Interfaces**: `PascalCase`
- **Constants**: `UPPER_SNAKE_CASE`
- **File names**: `kebab-case.ts`

### Comments
- Use single-line `//` comments above declarations
- Document complex logic and business rules
- Avoid obvious comments

### Error Handling
```typescript
// Annotate caught errors as 'any' type
try {
  await riskyOperation()
} catch (err: any) {
  return { error: err?.message ?? String(err) }
}

// Use nested try-catch for cleanup operations
try {
  const resource = await acquireResource()
  try {
    await processResource(resource)
  } finally {
    await cleanupResource(resource)
  }
} catch (err: any) {
  // Handle outer errors
}
```

## Project Architecture

Orchestra is built on these core architectural patterns:

### Plugin-Based System
- Tools are implemented as opencode plugins
- Workers are spawned and managed through the tool delegation system
- Each worker type has specific runtime modes and capabilities

### File-Based Persistence
- **Workers**: Stored in `.opencode/workforce/workers.json`
- **Workflows**: Individual JSON files in `.opencode/workforce/workflows/`
- **Integrations**: Stored in `.opencode/workforce/integrations.json`

### Event-Driven Async Model
- Workers can run synchronously or asynchronously
- Session-based communication with wake-up patterns
- Job tracking for async operations

### Multi-Runtime Support
Three worker runtime modes:
- `subagent`: Short-lived, task-specific (reader, coder, reviewer)
- `agent`: Long-lived service workers (docs, memory)
- `server`: External HTTP services

## Testing Patterns

### Test File Structure
Mirror source structure: `src/tools.ts` → `test/tools.test.ts`

### Test Organization
```typescript
import { describe, test, expect, beforeEach } from "bun:test"
import { createRuntime, type Runtime } from "../src/tools"

describe("Runtime", () => {
  let runtime: Runtime

  beforeEach(() => {
    runtime = createRuntime()
  })

  test("starts with empty instances and jobs", () => {
    expect(runtime.instances.size).toBe(0)
    expect(runtime.jobs.size).toBe(0)
  })
})
```

### Test Data Patterns
Use `as const` for literal types:
```typescript
const testWorker = {
  id: "test-worker",
  name: "Test Worker",
  runtime: "subagent"
} as const
```

### Coverage Strategy
- **Happy path**: Normal successful operations
- **Error cases**: Invalid inputs, network failures, missing resources
- **Edge cases**: Empty datasets, concurrent access, timeout scenarios
- **Integration points**: Tool interactions, file system operations

## Tech Stack

### Core Technologies
- **Runtime**: Bun (JavaScript runtime and test runner)
- **Language**: TypeScript 5.7 with strict mode enabled
- **HTTP Client**: @opencode-ai/sdk for session management
- **Plugin System**: @opencode-ai/plugin for tool definitions
- **Validation**: Zod for runtime type checking

### Node.js Built-ins
Prefer explicit `node:` prefixes:
```typescript
import { readFile } from "node:fs/promises"
import { join } from "node:path"
import { randomUUID } from "node:crypto"
```

### Key Dependencies
- `@opencode-ai/sdk`: Session and client management
- `@opencode-ai/plugin`: Tool definition framework
- `zod`: Schema validation and type inference

## File Organization

### Source Structure
```
src/
├── types.ts          # Core type definitions
├── tools.ts          # Main tool implementations
├── store.ts          # File-based data persistence
├── maestro.ts        # Workflow orchestration
├── integrations.ts   # External service management
└── index.ts          # Plugin entry point
```

### Key Files
- **`src/types.ts`**: All TypeScript interfaces and types
- **`src/tools.ts`**: Worker management and delegation tools
- **`.opencode/workforce/workers.json`**: Worker template definitions
- **`test/`**: Mirror structure of `src/` for test files

## Worker System

### Worker Types
1. **Reader** (`subagent`): Code analysis and documentation
2. **Coder** (`subagent`): Feature implementation and bug fixes
3. **Reviewer** (`subagent`): Code review and security analysis
4. **Docs** (`agent`): Documentation ingestion and Q&A
5. **Memory** (`agent`): Context tracking and decision history

### Worker Lifecycle
1. **Template Definition**: Stored in workers.json
2. **Instance Spawning**: Runtime creation with session
3. **Task Delegation**: Sync or async execution
4. **Status Tracking**: Available, busy, error states

### Tool Usage Patterns
```typescript
// For subagents (reader, coder, reviewer) - use native Task tool
Task(subagent_type: "coder", prompt: "Implement feature X")

// For service agents (docs, memory) - use delegate tool
delegate(to: "docs", task: "What is the JWT API?", async: true)

// Query running services
query(service: "memory", question: "What was decided about auth?")
```

## Integration System

### Integration Types
- **MCP**: Model Context Protocol services
- **HTTP**: REST API endpoints
- **STDIO**: Standard input/output communication

### Integration Binding
Workers can bind to integrations for enhanced capabilities:
```json
{
  "id": "docs",
  "integrations": [
    { "integrationId": "context7", "enabled": true }
  ]
}
```

### Lifecycle Management
- Integrations are started before worker spawning
- Health checks ensure service availability
- Failed integrations don't block worker creation

---

## Quick Reference

### Most Common Operations
1. **Add new tool**: Implement in `src/tools.ts`, add tests
2. **Create worker type**: Add to `workers.json`, define capabilities
3. **Run tests**: `bun test` for full suite, `bun test -t "name"` for specific
4. **Type check**: `bun run typecheck` before committing

### Error Handling Checklist
- [ ] Annotate caught errors as `any`
- [ ] Use optional chaining for error messages
- [ ] Include helpful error context
- [ ] Clean up resources in finally blocks

### Before Committing
- [ ] All tests pass (`bun test`)
- [ ] No type errors (`bun run typecheck`)
- [ ] Code follows style guidelines
- [ ] Error handling is consistent
- [ ] Tests cover new functionality

This guide ensures consistent, maintainable code that integrates seamlessly with the Orchestra system architecture.