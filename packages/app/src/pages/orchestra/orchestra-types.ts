export type WorkerRuntime = "subagent" | "agent" | "server";
export type WorkerStatus = "available" | "busy" | "off" | "error";

export type Worker = {
  id: string;
  name: string;
  description?: string;
  runtime: WorkerRuntime;
  model?: string;
  prompt?: string;
  tools?: Record<string, boolean>;
  skills?: string[];
  integrations?: WorkerIntegration[];
  directory?: string;
};

export type WorkerInstance = {
  instanceId: string;
  workerId: string;
  runtime: WorkerRuntime;
  status: WorkerStatus;
  sessionId?: string;
  parentSessionId?: string;
  createdAt: string;
  lastSeenAt: string;
  directory?: string;
};

export type Workflow = {
  id: string;
  name: string;
  description?: string;
  iterations?: { max: number; mode: "until_verified" | "fixed" };
  steps: WorkflowStep[];
  directory?: string;
};

export type RuntimeJob = {
  id: string;
  jobId: string;
  status: "pending" | "running" | "completed" | "failed";
  workerId?: string;
  workerSessionId?: string;
  workerInstanceId: string;
  createdAt: string;
  completedAt?: string;
  directory?: string;
};

export type WorkflowRunState = {
  runId: string;
  workflowId: string;
  status: "running" | "completed" | "failed";
  startedAt: string;
  completedAt?: string;
  directory?: string;
  steps: Array<{
    step: number;
    name: string;
    status: "completed" | "failed" | "skipped";
    workerInstanceId?: string;
    verification?: {
      type: string;
      passed: boolean;
      message?: string;
    };
    error?: string;
  }>;
};

export type MemoryEntry = {
  id: string;
  content: string;
  tags?: string[];
  source?: string;
  sessionId?: string;
  createdAt: string;
  directory?: string;
};

export type WorkflowStep = {
  step: number;
  name: string;
  worker: string;
  prompt: string;
  tools?: string[];
  verification?: string;
};

export type Integration = {
  id: string;
  name: string;
  description?: string;
  process?: {
    command: string;
    args?: string[];
    env?: Record<string, string>;
    type: "mcp" | "http" | "stdio";
    port?: number;
  };
  instructions?: string;
  directory?: string;
};

export type WorkerIntegration = {
  integrationId: string;
  enabled?: boolean;
};

export type IntegrationInstance = {
  integrationId: string;
  status: "starting" | "ready" | "error" | "stopped";
  pid?: number;
  port?: number;
  url?: string;
  startedAt: string;
  error?: string;
  directory?: string;
};

export type SkillLocation = "project" | "global" | "config";

export type SkillInfo = {
  id: string;
  name: string;
  description: string;
  path: string;
  location: SkillLocation;
};

export type SkillRoots = {
  project: string[];
  global?: string;
  config?: string;
};

export interface OrchestraData {
  workers: Worker[];
  instances: WorkerInstance[];
  jobs: RuntimeJob[];
  workflowRuns: WorkflowRunState[];
  workflows: Workflow[];
  integrations: Integration[];
  integrationInstances: IntegrationInstance[];
  skills: SkillInfo[];
  memoryEntries: MemoryEntry[];
  skillRoots: SkillRoots;
  tickets: Ticket[];
  linear: LinearData;
}

export type TabId = "workers" | "workflows" | "servers" | "skills" | "memories" | "tickets";

// Ticket types
export type TicketStatus = "open" | "in_progress" | "blocked" | "done" | "canceled";

export type TicketAssignment =
  | { kind: "worker"; workerId: string }
  | { kind: "workflow"; workflowId: string };

export type TicketLinearLink = {
  issueId: string;
  identifier?: string;
  url?: string;
  lastSyncedAt?: number;
  lastSyncError?: string;
};

export type Ticket = {
  id: string;
  title: string;
  description?: string;
  status: TicketStatus;
  assignment?: TicketAssignment;
  sessionId?: string;
  projectId?: string;
  createdAt: number;
  updatedAt: number;
  tags?: string[];
  linear?: TicketLinearLink;
  directory?: string;
};

// Linear integration types
export type LinearTeam = {
  id: string;
  key: string;
  name: string;
};

export type LinearWorkflowState = {
  id: string;
  name: string;
  type: string;
  color: string;
  position: number;
  teamId: string;
};

export type LinearProject = {
  id: string;
  name: string;
  state: string;
  teamId: string;
};

export type LinearLabel = {
  id: string;
  name: string;
  color: string;
  teamId: string;
};

export type LinearUser = {
  id: string;
  name: string;
  email: string;
  avatarUrl?: string;
};

// Orchestra assignment for Linear issues
export type LinearIssueAssignment =
  | { kind: "worker"; workerId: string }
  | { kind: "workflow"; workflowId: string };

export type LinearIssue = {
  id: string;
  identifier: string;
  title: string;
  description?: string;
  priority: number;
  stateId: string;
  state: { id: string; name: string; type: string };
  assigneeId?: string;
  assignee?: LinearUser;
  projectId?: string;
  project?: { id: string; name: string };
  labelIds: string[];
  labels: LinearLabel[];
  teamId: string;
  url: string;
  createdAt: string;
  updatedAt: string;
  // Orchestra-specific fields
  orchestraAssignment?: LinearIssueAssignment;
  orchestraModel?: string;
  orchestraContext?: string[];
  orchestraLinkedSessions?: string[];
};

export type LinearData = {
  apiConfigured: boolean;
  teams: LinearTeam[];
  states: LinearWorkflowState[];
  projects: LinearProject[];
  labels: LinearLabel[];
  users: LinearUser[];
  issues: LinearIssue[];
  activeTeamId?: string;
  lastSyncedAt?: number;
  lastError?: string;
};
