# Orchestra: Implementation Checklist

## Overview

This checklist breaks down the scope.md specification into actionable tasks. Each task is marked as:
- ✅ **DONE**: Completed
- ⚠️ **PARTIAL**: Partially completed (some subtasks done)
- ❌ **TODO**: Not started

**Current Progress**: Phase 1 (Core Plugin Setup) - PARTIAL

---

## Phase 3: Workflow Runner

### 3.1 Workflow Data Models

| Task | Description | Status | Notes |
|------|-------------|--------|-------|
| 3.1.1 | Define `WorkflowStep` type | ❌ TODO | step, name, workers, prompt, tools, verification |
| 3.1.2 | Define `Workflow` type | ❌ TODO | id, name, description, iterations, steps |
| 3.1.3 | Define `WorkflowRun` type | ❌ TODO | runId, workflowId, status, currentStep, retryCount, results |
| 3.1.4 | Define `WorkflowRunStatus` enum | ❌ TODO | "running", "completed", "failed" |

---

### 3.2 Workflow List Tool

| Task | Description | Status | Notes |
|------|-------------|--------|-------|
| 3.2.1 | Define `workforce_workflow_list` tool schema | ❌ TODO | No args |
| 3.2.2 | Read workflow directory | ❌ TODO | .opencode/workforce/workflows/*.json |
| 3.2.3 | Parse each workflow JSON | ❌ TODO | Extract metadata (id, name, description, stepsCount) |
| 3.2.4 | Return workflows array | ❌ TODO | Simplified metadata only |
| 3.2.5 | Test listing workflows | ❌ TODO | Verify workpack.json is loaded |

---

### 3.3 Workflow Run Tool - Core Logic

| Task | Description | Status | Notes |
|------|-------------|--------|-------|
| 3.3.1 | Define `workforce_workflow_run` tool schema | ❌ TODO | Args: workflow_id, input |
| 3.3.2 | Load workflow definition from file | ❌ TODO | Read JSON from workflows directory |
| 3.3.3 | Generate run ID | ❌ TODO | id("run") |
| 3.3.4 | Initialize results array | ❌ TODO | Empty array for step results |
| 3.3.5 | Initialize retry count | ❌ TODO | Set to 0 |
| 3.3.6 | Implement step iteration loop | ❌ TODO | For each step in workflow.steps |

---

### 3.4 Workflow Step Execution

| Task | Description | Status | Notes |
|------|-------------|--------|-------|
| 3.4.1 | Extract step configuration | ❌ TODO | Get workers, prompt, tools, verification |
| 3.4.2 | Spawn required workers | ❌ TODO | Check if instance exists, spawn if not |
| 3.4.3 | Handle multiple workers per step | ❌ TODO | Send task to each, collect results |
| 3.4.4 | Render prompt template | ❌ TODO | Replace {{input.*}} with input parameters |
| 3.4.5 | Send task to worker(s) | ❌ TODO | Use send_task tool internally |
| 3.4.6 | Wait for completion | ❌ TODO | Sync or async based on step config |
| 3.4.7 | Record step output | ❌ TODO | Store in results array |
| 3.4.8 | Record step timestamps | ❌ TODO | startedAt, endedAt |

---

### 3.5 Verification - Delegated

| Task | Description | Status | Notes |
|------|-------------|--------|-------|
| 3.5.1 | Parse `delegate:reviewer` verification | ❌ TODO | Extract worker ID |
| 3.5.2 | Spawn verifier worker | ❌ TODO | Use spawn_worker internally |
| 3.5.3 | Send verification task | ❌ TODO | Include original worker output |
| 3.5.4 | Wait for verifier result | ❌ TODO | Sync execution |
| 3.5.5 | Parse verifier output for approval | ❌ TODO | Check for "APPROVED" or lack of issues |
| 3.5.6 | Return verification result | ❌ TODO | { passed: boolean, result } |
| 3.5.7 | Test delegated verification | ❌ TODO | Verify reviewer worker spawns and checks |

---

### 3.6 Verification - Files Exist

| Task | Description | Status | Notes |
|------|-------------|--------|-------|
| 3.6.1 | Parse `files_exist:/path1,/path2` verification | ❌ TODO | Split by comma |
| 3.6.2 | Check each file exists | ❌ TODO | Use fs.exists() or client.filesystem API |
| 3.6.3 | Fail if any file missing | ❌ TODO | Return { passed: false, error } |
| 3.6.4 | Pass if all files exist | ❌ TODO | Return { passed: true } |
| 3.6.5 | Test files_exist verification | ❌ TODO | Verify files are checked correctly |

---

### 3.7 Verification - Contains

| Task | Description | Status | Notes |
|------|-------------|--------|-------|
| 3.7.1 | Parse `contains:SUMMARY` verification | ❌ TODO | Extract substring |
| 3.7.2 | Check if output contains substring | ❌ TODO | String includes check |
| 3.7.3 | Pass if found | ❌ TODO | Return { passed: true } |
| 3.7.4 | Fail if not found | ❌ TODO | Return { passed: false, error } |
| 3.7.5 | Test contains verification | ❌ TODO | Verify substring check works |

---

### 3.8 Verification - Must Not Contain

| Task | Description | Status | Notes |
|------|-------------|--------|-------|
| 3.8.1 | Parse `must_not_contain:CRITICAL` verification | ❌ TODO | Extract substring |
| 3.8.2 | Check if output contains substring | ❌ TODO | String includes check |
| 3.8.3 | Pass if not found | ❌ TODO | Return { passed: true } |
| 3.8.4 | Fail if found | ❌ TODO | Return { passed: false, error } |
| 3.8.5 | Test must_not_contain verification | ❌ TODO | Verify inverse check works |

---

### 3.9 Verification - Run Tests

| Task | Description | Status | Notes |
|------|-------------|--------|-------|
| 3.9.1 | Parse `run_tests:npm test` verification | ❌ TODO | Extract command |
| 3.9.2 | Execute command via bash | ❌ TODO | Use bash tool or SDK |
| 3.9.3 | Check exit code | ❌ TODO | 0 = success, non-zero = failure |
| 3.9.4 | Pass if exit code is 0 | ❌ TODO | Return { passed: true, result: stdout } |
| 3.9.5 | Fail if exit code is non-zero | ❌ TODO | Return { passed: false, error: stderr } |
| 3.9.6 | Test run_tests verification | ❌ TODO | Verify command execution works |

---

### 3.10 Retry Logic

| Task | Description | Status | Notes |
|------|-------------|--------|-------|
| 3.10.1 | Handle verification failure | ❌ TODO | If passed === false |
| 3.10.2 | Increment retry count | ❌ TODO | retryCount++ |
| 3.10.3 | Check against max iterations | ❌ TODO | workflow.iterations.max |
| 3.10.4 | Implement step-retry strategy | ❌ TODO | Retry current step only |
| 3.10.5 | Implement full-retry strategy | ❌ TODO | Restart from step 0 |
| 3.10.6 | Mark workflow as failed if max reached | ❌ TODO | Return { status: "failed", error } |
| 3.10.7 | Mark step as completed if verified | ❌ TODO | Move to next step |
| 3.10.8 | Test step-retry | ❌ TODO | Verify only current step retries |
| 3.10.9 | Test full-retry | ❌ TODO | Verify entire workflow restarts |
| 3.10.10 | Test max iterations limit | ❌ TODO | Verify workflow fails gracefully |

---

### 3.11 Workflow Completion

| Task | Description | Status | Notes |
|------|-------------|--------|-------|
| 3.11.1 | Handle all steps completed | ❌ TODO | After loop finishes |
| 3.11.2 | Mark workflow as completed | ❌ TODO | status: "completed" |
| 3.11.3 | Set end timestamp | ❌ TODO | endedAt |
| 3.11.4 | Return final results | ❌ TODO | { status, workflowId, runId, results } |
| 3.11.5 | Test successful workflow run | ❌ TODO | Verify workpack executes fully |

---

## Phase 4: Skills Management

### 4.1 Skill List Tool

| Task | Description | Status | Notes |
|------|-------------|--------|-------|
| 4.1.1 | Define `workforce_skill_list` tool schema | ❌ TODO | No args |
| 4.1.2 | Read skill directory | ❌ TODO | .opencode/skill or .claude/skills |
| 4.1.3 | List directories | ❌ TODO | withFileTypes: true, filter directories |
| 4.1.4 | Read each SKILL.md file | ❌ TODO | For each skill directory |
| 4.1.5 | Parse YAML frontmatter | ❌ TODO | Extract name, description |
| 4.1.6 | Return skills array | ❌ TODO | dir, name, description, path |
| 4.1.7 | Test listing skills | ❌ TODO | Verify skills are discovered |

---

### 4.2 Skill Install Tool

| Task | Description | Status | Notes |
|------|-------------|--------|-------|
| 4.2.1 | Define `workforce_skill_install` tool schema | ❌ TODO | Args: source, skills |
| 4.2.2 | Ensure skill-sources directory exists | ❌ TODO | .opencode/workforce/skill-sources/ |
| 4.2.3 | Implement git clone logic | ❌ TODO | Clone if not present |
| 4.2.4 | Handle source URL parsing | ❌ TODO | anthropics/skills or custom git URL |
| 4.2.5 | Check if skill exists in source | ❌ TODO | Verify directory exists |
| 4.2.6 | Read SKILL.md from source | ❌ TODO | Extract metadata |
| 4.2.7 | Create destination directory | ❌ TODO | .claude/skills/<name>/ |
| 4.2.8 | Copy skill directory | ❌ TODO | Recursive copy |
| 4.2.9 | Track installed skills | ❌ TODO | Add to installed array |
| 4.2.10 | Track failed installations | ❌ TODO | Add to failed array with error |
| 4.2.11 | Return result | ❌ TODO | { installed, failed } |
| 4.2.12 | Test installing skill from anthropics/skills | ❌ TODO | Verify git clone and copy |
| 4.2.13 | Test installing multiple skills | ❌ TODO | Batch installation |
| 4.2.14 | Test error handling (skill not found) | ❌ TODO | Verify failed array |

---

### 4.3 Skill Delete Tool

| Task | Description | Status | Notes |
|------|-------------|--------|-------|
| 4.3.1 | Define `workforce_skill_delete` tool schema | ❌ TODO | Args: name |
| 4.3.2 | Remove skill directory | ❌ TODO | Recursive rm |
| 4.3.3 | Return confirmation | ❌ TODO | { deleted: true, path } |
| 4.3.4 | Test deleting skill | ❌ TODO | Verify directory removed |

---

## Phase 5: Commands & Polish

### 5.1 Command Definitions

| Task | Description | Status | Notes |
|------|-------------|--------|-------|
| 5.1.1 | Create `.opencode/command/workers.md` | ❌ TODO | List workers command |
| 5.1.2 | Create `.opencode/command/workflow-workpack.md` | ❌ TODO | Workpack workflow command |
| 5.1.3 | Create `.opencode/command/workflow-boomerang.md` | ❌ TODO | Boomerang workflow command |
| 5.1.4 | Create `.opencode/command/workflow-shepherd.md` | ❌ TODO | Shepherd workflow command |
| 5.1.5 | Test /workers command | ❌ TODO | Verify workers are listed |
| 5.1.6 | Test /workpack command | ❌ TODO | Verify workflow runs |
| 5.1.7 | Test /boomerang command | ❌ TODO | Verify async workflow runs |
| 5.1.8 | Test /shepherd command | ❌ TODO | Verify long-running workflow runs |

---

### 5.2 Additional Workflows

| Task | Description | Status | Notes |
|------|-------------|--------|-------|
| 5.2.1 | Create `boomerang.json` workflow | ❌ TODO | Async wake-up workflow definition |
| 5.2.2 | Create `shepherd.json` workflow | ❌ TODO | Long-running iterative workflow |
| 5.2.3 | Add shepherd sandbox config | ❌ TODO | Docker config for shepherd worker |
| 5.2.4 | Test boomerang workflow | ❌ TODO | End-to-end async test |
| 5.2.5 | Test shepherd workflow | ❌ TODO | End-to-end long-running test |

---

### 5.3 Worker Profile Enhancements

| Task | Description | Status | Notes |
|------|-------------|--------|-------|
| 5.3.1 | Add skills array to reader profile | ❌ TODO | e.g., ["pdf", "docx"] |
| 5.3.2 | Add tools map to each profile | ❌ TODO | Explicit tool allow/deny |
| 5.3.3 | Add shepherd worker profile | ❌ TODO | server runtime, docker sandbox |
| 5.3.4 | Update coder profile to builder | ❌ TODO | Rename for consistency |
| 5.3.5 | Test worker profiles load correctly | ❌ TODO | Verify all profiles valid |

---

### 5.4 Orchestrator Refinements

| Task | Description | Status | Notes |
|------|-------------|--------|-------|
| 5.4.1 | Add tool aliases to orchestrator | ❌ TODO | delegate, workflow, workers |
| 5.4.2 | Update orchestrator rules | ❌ TODO | Emphasize workflow usage |
| 5.4.3 | Add worker selection guidance | ❌ TODO | When to use each worker |
| 5.4.4 | Add sync vs async examples | ❌ TODO | In orchestrator prompt |
| 5.4.5 | Test orchestrator delegation | ❌ TODO | Verify it delegates, doesn't do work |

---

### 5.5 Error Handling & Logging

| Task | Description | Status | Notes |
|------|-------------|--------|-------|
| 5.5.1 | Add error handling to spawn_worker | ❌ TODO | Catch and report errors |
| 5.5.2 | Add error handling to send_task | ❌ TODO | Catch and report errors |
| 5.5.3 | Add error handling to workflow_run | ❌ TODO | Catch and report errors |
| 5.5.4 | Add logging for debugging | ❌ TODO | Log key events |
| 5.5.5 | Add input validation | ❌ TODO | Validate tool args |
| 5.5.6 | Test error scenarios | ❌ TODO | Invalid worker ID, missing instance, etc. |

---

### 5.6 Testing

| Task | Description | Status | Notes |
|------|-------------|--------|-------|
| 5.6.1 | Unit tests for worker tools | ❌ TODO | Test each tool in isolation |
| 5.6.2 | Unit tests for workflow runner | ❌ TODO | Test happy path and failure paths |
| 5.6.3 | Unit tests for verification types | ❌ TODO | Test each verification |
| 5.6.4 | Integration tests for sync delegation | ❌ TODO | End-to-end sync flow |
| 5.6.5 | Integration tests for async delegation | ❌ TODO | End-to-end async flow with wake-up |
| 5.6.6 | Integration tests for workflows | ❌ TODO | Workpack, boomerang, shepherd |
| 5.6.7 | Manual testing with OpenCode Desktop | ❌ TODO | Real-world usage |
| 5.6.8 | Manual testing with TUI | ❌ TODO | Real-world usage |

---

### 5.7 Documentation

| Task | Description | Status | Notes |
|------|-------------|--------|-------|
| 5.7.1 | Create README.md | ❌ TODO | Project overview |
| 5.7.2 | Create QUICKSTART.md | ❌ TODO | Get started quickly |
| 5.7.3 | Create WORKFLOWS.md | ❌ TODO | Available workflows |
| 5.7.4 | Create WORKERS.md | ❌ TODO | Worker profiles reference |
| 5.7.5 | Create API.md | ❌ TODO | Plugin tool reference |
| 5.7.6 | Create EXAMPLES.md | ❌ TODO | Example use cases |
| 5.7.7 | Create CONTRIBUTING.md | ❌ TODO | Dev guide |

---

## Phase 6: Future Extensions (v2+)

### 6.1 Orchestra Sidecar API

| Task | Description | Status | Notes |
|------|-------------|--------|-------|
| 6.1.1 | Design Sidecar API | ❌ TODO | OpenAPI spec |
| 6.1.2 | Implement reverse proxy | ❌ TODO | Proxy OpenCode endpoints |
| 6.1.3 | Implement `/orchestra/workers` endpoint | ❌ TODO | CRUD workers |
| 6.1.4 | Implement `/orchestra/workflows` endpoint | ❌ TODO | CRUD workflows |
| 6.1.5 | Implement `/orchestra/runs` endpoint | ❌ TODO | Run management |
| 6.1.6 | Implement `/orchestra/skills` endpoint | ❌ TODO | Skills management |
| 6.1.7 | Implement `/orchestra/events` endpoint | ❌ TODO | Unified event stream |
| 6.1.8 | Add authentication | ❌ TODO | API keys or OAuth |
| 6.1.9 | Add rate limiting | ❌ TODO | Prevent abuse |
| 6.1.10 | Add metrics collection | ❌ TODO | Performance tracking |

---

### 6.2 Database-Backed Scorebook

| Task | Description | Status | Notes |
|------|-------------|--------|-------|
| 6.2.1 | Design database schema | ❌ TODO | Skills, workers, workflows, runs, events |
| 6.2.2 | Choose ORM (Prisma/Drizzle) | ❌ TODO | Type-safe DB access |
| 6.2.3 | Implement migrations | ❌ TODO | Schema versioning |
| 6.2.4 | Implement skills CRUD | ❌ TODO | DB-backed |
| 6.2.5 | Implement workers CRUD | ❌ TODO | DB-backed |
| 6.2.6 | Implement workflows CRUD | ❌ TODO | DB-backed |
| 6.2.7 | Implement runs tracking | ❌ TODO | DB-backed |
| 6.2.8 | Implement event log | ❌ TODO | Append-only |
| 6.2.9 | Implement sharing | ❌ TODO | Export/import workflows |
| 6.2.10 | Migrate file-based state to DB | ❌ TODO | Migration script |

---

### 6.3 Multi-Engine Support

| Task | Description | Status | Notes |
|------|-------------|--------|-------|
| 6.3.1 | Design engine routing | ❌ TODO | Map worktrees to engines |
| 6.3.2 | Implement engine registry | ❌ TODO | Track multiple engines |
| 6.3.3 | Implement load balancer | ❌ TODO | Distribute requests |
| 6.3.4 | Add engine health checks | ❌ TODO | Monitor engine status |
| 6.3.5 | Implement engine failover | ❌ TODO | Handle engine failures |

---

### 6.4 Docker-Native Workers

| Task | Description | Status | Notes |
|------|-------------|--------|-------|
| 6.4.1 | Implement Docker client integration | ❌ TODO | Use Docker API |
| 6.4.2 | Parse sandbox config from profile | ❌ TODO | cpu, memory, image |
| 6.4.3 | Implement container creation | ❌ TODO | docker run with resource limits |
| 6.4.4 | Implement volume mounting | ❌ TODO | Worktree access |
| 6.4.5 | Implement container cleanup | ❌ TODO | Remove on kill |
| 6.4.6 | Implement container logs | ❌ TODO | Stream logs to event stream |
| 6.4.7 | Test containerized workers | ❌ TODO | Verify isolation and limits |

---

### 6.5 Real-Time Dashboard

| Task | Description | Status | Notes |
|------|-------------|--------|-------|
| 6.5.1 | Design dashboard UI | ❌ TODO | React/Vue/Framework TBD |
| 6.5.2 | Implement workflow runs view | ❌ TODO | Live status |
| 6.5.3 | Implement worker status view | ❌ TODO | Live status |
| 6.5.4 | Implement event log view | ❌ TODO | Live stream |
| 6.5.5 | Implement metrics view | ❌ TODO | Performance graphs |
| 6.5.6 | Implement workflow controls | ❌ TODO | Start/stop/pause |
| 6.5.7 | Connect to Orchestra API | ❌ TODO | WebSocket/SSE |
| 6.5.8 | Test dashboard | ❌ TODO | Real-world usage |

---

## Summary Statistics

### Overall Progress

| Phase | Tasks | Done | Partial | Todo | Progress |
|-------|-------|------|---------|------|----------|
| Phase 1: Core Plugin Setup | 23 | 8 | 0 | 15 | 35% |
| Phase 2: Worker Management | 54 | 0 | 0 | 54 | 0% |
| Phase 3: Workflow Runner | 49 | 0 | 0 | 49 | 0% |
| Phase 4: Skills Management | 14 | 0 | 0 | 14 | 0% |
| Phase 5: Commands & Polish | 45 | 0 | 0 | 45 | 0% |
| Phase 6: Future Extensions | 44 | 0 | 0 | 44 | 0% |
| **Total** | **229** | **8** | **0** | **221** | **3.5%** |

### Critical Path to v1 MVP

**Minimum viable product for Phase 5 completion**:
1. ✅ Phase 1: Basic structure and configuration
2. ❌ Phase 2: Worker management tools (all 54 tasks)
3. ❌ Phase 3: Workflow runner (core 49 tasks)
4. ❌ Phase 4: Skills management (basic 14 tasks)
5. ❌ Phase 5: Commands and polish (basic 45 tasks)

**Total critical tasks**: 162
**Completed**: 8
**Remaining**: 154 (95% of critical path)

---

## Next Immediate Steps (Priority Order)

1. **Create plugin file** (2.1.1 - 2.1.5): Define data types
2. **Implement list_workers tool** (2.2.1 - 2.2.4): Simplest tool to start
3. **Implement spawn_worker (subagent only)** (2.3.1 - 2.3.10): Get basic worker spawning
4. **Implement send_task (sync only)** (2.6.1 - 2.6.11): Enable task delegation
5. **Implement manage_worker (kill only)** (2.8.1 - 2.8.4): Basic worker control
6. **Test end-to-end sync delegation**: Orchestrator → subagent → result
7. **Implement workflow_run (basic)** (3.3.1 - 3.4.8): Sequential step execution
8. **Add verification (contains only)** (3.7.1 - 3.7.5): Simplest verification
9. **Test workpack workflow**: End-to-end workflow execution
10. **Add async mode to send_task** (2.7.1 - 2.7.7): Enable background tasks
11. **Implement session.idle handler** (2.9.1 - 2.9.10): Async wake-up
12. **Test boomerang pattern**: Async task → wake-up → result
13. **Add remaining verification types** (3.5.1 - 3.9.6): delegate, files_exist, run_tests
14. **Add retry logic** (3.10.1 - 3.10.10): step-retry and full-retry
15. **Implement skills management** (4.1.1 - 4.3.4): Install and list skills
16. **Create slash commands** (5.1.1 - 5.1.8): User-friendly shortcuts
17. **Create additional workflows** (5.2.1 - 5.2.5): boomerang.json, shepherd.json
18. **Add error handling and logging** (5.5.1 - 5.5.6): Robust error handling
19. **Documentation** (5.7.1 - 5.7.7): Complete user and dev docs
20. **Testing** (5.6.1 - 5.6.8): Unit, integration, manual tests

---

## Notes

- **Phase 1 is mostly done**: Basic structure and configuration files exist
- **Phase 2 is the largest**: Worker management is the core of the system
- **Phase 3 builds on Phase 2**: Workflow runner uses worker tools internally
- **Phase 4 is relatively small**: Skills management is self-contained
- **Phase 5 ties everything together**: Commands, workflows, testing, documentation
- **Phase 6 is future work**: Not needed for v1 MVP

**Estimated effort**:
- Phase 1: 2 days (8 tasks remaining)
- Phase 2: 1 week (54 tasks)
- Phase 3: 1 week (49 tasks)
- Phase 4: 2 days (14 tasks)
- Phase 5: 3 days (45 tasks)
- **Total for v1 MVP**: ~3 weeks

**Key risks**:
1. OpenCode API changes may break plugin compatibility
2. Event system may not fire reliably for async wake-ups
3. Server worker port conflicts (need proper port detection)
4. Workflow runner complexity (keep verification simple)
5. Skills sync conflicts (treat source as read-only)

**Mitigations**:
1. Wrap API calls in adapters, test with multiple versions
2. Add polling fallback for async tasks
3. Use OS-specific port allocation, retry with backoff
4. Keep verification types composable, add extensive logging
5. Never write to source checkout, warn on overwrite
