export type LinearTeam = {
  id: string;
  key: string;
  name: string;
};

export type LinearWorkflowState = {
  id: string;
  name: string;
  type: string; // backlog | unstarted | started | completed | canceled
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

export type LinearIssue = {
  id: string;
  identifier: string;
  title: string;
  description?: string;
  priority: number; // 0=none, 1=urgent, 2=high, 3=medium, 4=low
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

export type CreateIssueInput = {
  title: string;
  description?: string;
  priority?: number;
  stateId?: string;
  assigneeId?: string;
  projectId?: string;
  labelIds?: string[];
};
