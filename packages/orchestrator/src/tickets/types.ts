export type TicketStatus = "open" | "in_progress" | "blocked" | "done" | "canceled";

export type TicketAssignment =
  | { kind: "worker"; workerId: string }
  | { kind: "workflow"; workflowId: string };

export type TicketRunRef = {
  taskId: string;
  kind: "worker" | "workflow";
  workerId?: string;
  workflowId?: string;
  startedAt: number;
  finishedAt?: number;
  status?: "running" | "succeeded" | "failed" | "canceled";
};

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
  runs: TicketRunRef[];
  linear?: TicketLinearLink;
};

export type TicketStoreFile = {
  version: 1;
  tickets: Ticket[];
};
