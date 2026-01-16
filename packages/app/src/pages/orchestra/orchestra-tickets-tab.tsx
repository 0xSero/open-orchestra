import { Button } from "@opencode-ai/ui/button";
import { Icon } from "@opencode-ai/ui/icon";
import { Select } from "@opencode-ai/ui/select";
import { Show, createMemo, createSignal, onMount } from "solid-js";
import type { Session } from "@opencode-ai/sdk/v2/client";
import type { LinearData, LinearIssue, LinearIssueAssignment, LinearTeam, Worker, Workflow } from "@/pages/orchestra/orchestra-types";
import { KanbanBoard } from "@/pages/orchestra/orchestra-kanban";
import { IssueDetailSheet } from "@/pages/orchestra/orchestra-issue-detail";
import { IssueCreateSheet } from "@/pages/orchestra/orchestra-issue-create";
import { useGlobalSDK } from "@/context/global-sdk";
import { writeJsonFile } from "@/pages/orchestra/orchestra-utils";

const LINEAR_API_URL = "https://api.linear.app/graphql";

// Get API key from Vite env or localStorage fallback
function getLinearApiKey(): string | null {
  // Check Vite environment variable first (requires VITE_ prefix in .env)
  const envKey = import.meta.env.VITE_LINEAR_API_KEY;
  if (envKey) return envKey;
  // Fallback to localStorage
  return localStorage.getItem("LINEAR_API_KEY") || null;
}

async function linearQuery<T>(apiKey: string, query: string, variables?: Record<string, unknown>): Promise<T> {
  const response = await fetch(LINEAR_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": apiKey,
    },
    body: JSON.stringify({ query, variables }),
  });

  if (!response.ok) {
    const text = await response.text();
    console.error("[Linear] HTTP error:", response.status, text);
    throw new Error(`Linear request failed: ${response.status} - ${text}`);
  }

  const payload = await response.json();
  if (payload.errors?.length) {
    const errorMsg = payload.errors.map((e: any) => e.message).join("; ");
    console.error("[Linear] GraphQL errors:", payload.errors);
    throw new Error(errorMsg);
  }
  return payload.data;
}

async function syncLinearData(apiKey: string, teamId?: string): Promise<LinearData> {
  // Fetch teams first
  const teamsData = await linearQuery<{ teams: { nodes: LinearTeam[] } }>(apiKey, `
    query Teams { teams { nodes { id key name } } }
  `);
  const teams = teamsData.teams.nodes;

  if (teams.length === 0) {
    throw new Error("No teams found in Linear");
  }

  const targetTeamId = teamId || teams[0].id;

  // Fetch all data for the team in parallel - use inline teamId to avoid type issues
  const [statesData, projectsData, labelsData, usersData, issuesData] = await Promise.all([
    linearQuery<{ team: { states: { nodes: any[] } } }>(apiKey, `
      query { team(id: "${targetTeamId}") { states { nodes { id name type color position } } } }
    `),
    linearQuery<{ team: { projects: { nodes: any[] } } }>(apiKey, `
      query { team(id: "${targetTeamId}") { projects { nodes { id name state } } } }
    `),
    linearQuery<{ team: { labels: { nodes: any[] } } }>(apiKey, `
      query { team(id: "${targetTeamId}") { labels { nodes { id name color } } } }
    `),
    linearQuery<{ team: { members: { nodes: any[] } } }>(apiKey, `
      query { team(id: "${targetTeamId}") { members { nodes { id name email avatarUrl } } } }
    `),
    linearQuery<{ issues: { nodes: any[] } }>(apiKey, `
      query { issues(first: 250, filter: { team: { id: { eq: "${targetTeamId}" } } }, orderBy: updatedAt) {
        nodes {
          id identifier title description priority url createdAt updatedAt
          state { id name type }
          assignee { id name email avatarUrl }
          project { id name }
          labels { nodes { id name color } }
        }
      } }
    `),
  ]);

  const states = statesData.team.states.nodes.map((s: any) => ({ ...s, teamId: targetTeamId }));
  const projects = projectsData.team.projects.nodes.map((p: any) => ({ ...p, teamId: targetTeamId }));
  const labels = labelsData.team.labels.nodes.map((l: any) => ({ ...l, teamId: targetTeamId }));
  const users = usersData.team.members.nodes;

  const issues: LinearIssue[] = issuesData.issues.nodes.map((issue: any) => ({
    id: issue.id,
    identifier: issue.identifier,
    title: issue.title,
    description: issue.description,
    priority: issue.priority,
    stateId: issue.state.id,
    state: issue.state,
    assigneeId: issue.assignee?.id,
    assignee: issue.assignee,
    projectId: issue.project?.id,
    project: issue.project,
    labelIds: issue.labels.nodes.map((l: any) => l.id),
    labels: issue.labels.nodes.map((l: any) => ({ ...l, teamId: targetTeamId })),
    teamId: targetTeamId,
    url: issue.url,
    createdAt: issue.createdAt,
    updatedAt: issue.updatedAt,
  }));

  return {
    apiConfigured: true,
    teams,
    states,
    projects,
    labels,
    users,
    issues,
    activeTeamId: targetTeamId,
    lastSyncedAt: Date.now(),
  };
}

async function moveIssueApi(apiKey: string, issueId: string, stateId: string): Promise<void> {
  await linearQuery(apiKey, `
    mutation UpdateIssueState($issueId: String!, $stateId: String!) {
      issueUpdate(id: $issueId, input: { stateId: $stateId }) { success }
    }
  `, { issueId, stateId });
}

async function deleteIssueApi(apiKey: string, issueId: string): Promise<void> {
  await linearQuery(apiKey, `
    mutation DeleteIssue($issueId: String!) {
      issueDelete(id: $issueId) { success }
    }
  `, { issueId });
}

type CreateIssueInput = {
  title: string;
  description?: string;
  priority?: number;
  stateId?: string;
  assigneeId?: string;
  projectId?: string;
};

async function createIssueApi(apiKey: string, teamId: string, input: CreateIssueInput): Promise<LinearIssue> {
  // Build mutation with inline values - matches Linear's documented examples exactly
  const escapeString = (s: string) => s.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n');

  const inputFields = [
    `title: "${escapeString(input.title)}"`,
    `teamId: "${teamId}"`,
  ];
  if (input.description) inputFields.push(`description: "${escapeString(input.description)}"`);
  if (input.priority) inputFields.push(`priority: ${input.priority}`);
  if (input.stateId) inputFields.push(`stateId: "${input.stateId}"`);
  if (input.assigneeId) inputFields.push(`assigneeId: "${input.assigneeId}"`);
  if (input.projectId) inputFields.push(`projectId: "${input.projectId}"`);

  const mutation = `
    mutation {
      issueCreate(input: { ${inputFields.join(', ')} }) {
        success
        issue {
          id
          identifier
          title
          description
          priority
          url
          createdAt
          updatedAt
          state { id name type }
          assignee { id name email avatarUrl }
          project { id name }
          labels { nodes { id name color } }
        }
      }
    }
  `;

  const data = await linearQuery<{ issueCreate: { success: boolean; issue: any } }>(apiKey, mutation);

  if (!data.issueCreate?.success) {
    throw new Error("Linear failed to create issue");
  }

  const issue = data.issueCreate.issue;
  return {
    id: issue.id,
    identifier: issue.identifier,
    title: issue.title,
    description: issue.description,
    priority: issue.priority,
    stateId: issue.state.id,
    state: issue.state,
    assigneeId: issue.assignee?.id,
    assignee: issue.assignee,
    projectId: issue.project?.id,
    project: issue.project,
    labelIds: issue.labels?.nodes?.map((l: any) => l.id) || [],
    labels: issue.labels?.nodes?.map((l: any) => ({ ...l, teamId })) || [],
    teamId,
    url: issue.url,
    createdAt: issue.createdAt,
    updatedAt: issue.updatedAt,
  };
}

export function TicketsTab(props: {
  linear: LinearData;
  workers: Worker[];
  workflows: Workflow[];
  onRefresh: () => void;
  defaultDirectory: string;
}) {
  const sdk = useGlobalSDK();
  const [sessions, setSessions] = createSignal<Session[]>([]);
  const [sessionsLoaded, setSessionsLoaded] = createSignal(false);

  // Fetch sessions on mount - only once
  onMount(async () => {
    if (sessionsLoaded()) return;
    try {
      const response = await sdk.client.session.list();
      setSessions(response.data ?? []);
    } catch {
      // Sessions not available, that's ok
    } finally {
      setSessionsLoaded(true);
    }
  });
  const [isSyncing, setIsSyncing] = createSignal(false);
  const [syncError, setSyncError] = createSignal<string | null>(null);
  const [apiKey, setApiKey] = createSignal<string | null>(getLinearApiKey());
  const [selectedIssue, setSelectedIssue] = createSignal<LinearIssue | null>(null);
  const [showCreateSheet, setShowCreateSheet] = createSignal(false);

  const activeTeam = createMemo(() => {
    if (!props.linear.activeTeamId) return props.linear.teams[0];
    return props.linear.teams.find((t) => t.id === props.linear.activeTeamId) ?? props.linear.teams[0];
  });

  const lastSyncedAt = createMemo(() => {
    if (!props.linear.lastSyncedAt) return null;
    return new Date(props.linear.lastSyncedAt).toLocaleString();
  });

  // Keep selected issue in sync with data updates
  const currentSelectedIssue = createMemo(() => {
    const selected = selectedIssue();
    if (!selected) return null;
    return props.linear.issues.find((i) => i.id === selected.id) || null;
  });

  async function handleSync(teamId?: string) {
    const key = apiKey();
    if (!key) {
      setSyncError("LINEAR_API_KEY not set. Enter your API key below.");
      return;
    }

    setIsSyncing(true);
    setSyncError(null);

    try {
      const data = await syncLinearData(key, teamId || activeTeam()?.id);

      // Write to linear.json via SDK
      const linearPath = props.defaultDirectory
        ? `${props.defaultDirectory}/.opencode/workforce/linear.json`
        : ".opencode/workforce/linear.json";
      await writeJsonFile(sdk.client, props.defaultDirectory, linearPath, data);

      props.onRefresh();
    } catch (err: any) {
      setSyncError(err?.message || "Sync failed");
    } finally {
      setIsSyncing(false);
    }
  }

  async function handleMoveIssue(issueId: string, stateId: string) {
    const key = apiKey();
    if (!key) {
      setSyncError("LINEAR_API_KEY not set");
      return;
    }

    try {
      await moveIssueApi(key, issueId, stateId);

      // Update local data optimistically
      const updatedIssues = props.linear.issues.map((issue) => {
        if (issue.id === issueId) {
          const newState = props.linear.states.find((s) => s.id === stateId);
          return {
            ...issue,
            stateId,
            state: newState ? { id: newState.id, name: newState.name, type: newState.type } : issue.state,
            updatedAt: new Date().toISOString(),
          };
        }
        return issue;
      });

      const updatedData = {
        ...props.linear,
        issues: updatedIssues,
        lastSyncedAt: Date.now(),
      };

      const linearPath = props.defaultDirectory
        ? `${props.defaultDirectory}/.opencode/workforce/linear.json`
        : ".opencode/workforce/linear.json";
      await writeJsonFile(sdk.client, props.defaultDirectory, linearPath, updatedData);

      props.onRefresh();
    } catch (err: any) {
      setSyncError(err?.message || "Move failed");
    }
  }

  function handleApiKeyInput(e: Event) {
    const input = e.target as HTMLInputElement;
    const key = input.value.trim();
    if (key) {
      localStorage.setItem("LINEAR_API_KEY", key);
      setApiKey(key);
    }
  }

  function handleTeamSelect(team: LinearTeam | undefined) {
    if (team) {
      handleSync(team.id);
    }
  }

  function handleSelectIssue(issue: LinearIssue) {
    setSelectedIssue(issue);
  }

  function handleCloseDetail() {
    setSelectedIssue(null);
  }

  function handleChangeStateFromDetail(stateId: string) {
    const issue = currentSelectedIssue();
    if (issue) {
      handleMoveIssue(issue.id, stateId);
    }
  }

  async function handleUpdateIssueOrchestra(
    issueId: string,
    update: {
      assignment?: LinearIssueAssignment | null;
      model?: string | null;
      context?: string[] | null;
    }
  ) {
    const updatedIssues = props.linear.issues.map((issue) => {
      if (issue.id === issueId) {
        return {
          ...issue,
          orchestraAssignment: update.assignment === null ? undefined : (update.assignment ?? issue.orchestraAssignment),
          orchestraModel: update.model === null ? undefined : (update.model ?? issue.orchestraModel),
          orchestraContext: update.context === null ? undefined : (update.context ?? issue.orchestraContext),
        };
      }
      return issue;
    });

    const updatedData = {
      ...props.linear,
      issues: updatedIssues,
    };

    const linearPath = props.defaultDirectory
      ? `${props.defaultDirectory}/.opencode/workforce/linear.json`
      : ".opencode/workforce/linear.json";
    await writeJsonFile(sdk.client, props.defaultDirectory, linearPath, updatedData);

    props.onRefresh();
  }

  async function handleDeleteIssue(issueId: string) {
    const key = apiKey();
    if (!key) {
      setSyncError("LINEAR_API_KEY not set");
      return;
    }

    try {
      await deleteIssueApi(key, issueId);

      // Remove from local data
      const updatedIssues = props.linear.issues.filter((issue) => issue.id !== issueId);

      const updatedData = {
        ...props.linear,
        issues: updatedIssues,
      };

      const linearPath = props.defaultDirectory
        ? `${props.defaultDirectory}/.opencode/workforce/linear.json`
        : ".opencode/workforce/linear.json";
      await writeJsonFile(sdk.client, props.defaultDirectory, linearPath, updatedData);

      // Close detail panel and refresh
      setSelectedIssue(null);
      props.onRefresh();
    } catch (err: any) {
      setSyncError(err?.message || "Delete failed");
    }
  }

  async function handleCreateIssue(input: {
    title: string;
    description?: string;
    priority?: number;
    stateId?: string;
    assigneeId?: string;
    projectId?: string;
  }) {
    const key = apiKey();
    const team = activeTeam();

    if (!key || !team) {
      throw new Error("LINEAR_API_KEY not set or no team selected");
    }

    const newIssue = await createIssueApi(key, team.id, input);

    // Add to local data - don't call onRefresh to avoid re-render
    const updatedData = {
      ...props.linear,
      issues: [newIssue, ...props.linear.issues],
      lastSyncedAt: Date.now(),
    };

    const linearPath = props.defaultDirectory
      ? `${props.defaultDirectory}/.opencode/workforce/linear.json`
      : ".opencode/workforce/linear.json";
    await writeJsonFile(sdk.client, props.defaultDirectory, linearPath, updatedData);

    // Don't call props.onRefresh() here - it causes re-render that kills the sheet
    // User can manually sync if needed
  }

  return (
    <div class="flex h-full">
      {/* Main content */}
      <div class="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <div class="flex items-center justify-between pb-4 shrink-0">
          <div class="flex items-center gap-4">
            <Show when={props.linear.teams.length > 0}>
              <Select
                options={props.linear.teams}
                current={activeTeam()}
                value={(team) => team.id}
                label={(team) => `${team.key} - ${team.name}`}
                onSelect={handleTeamSelect}
                variant="secondary"
                class="min-w-[200px]"
                placeholder="Select team..."
              />
            </Show>

            <Show when={lastSyncedAt()}>
              <span class="text-12-regular text-text-weak">
                Last synced: {lastSyncedAt()}
              </span>
            </Show>
          </div>

          <div class="flex items-center gap-2">
            <Show when={syncError()}>
              <span class="text-12-regular text-text-critical-base">{syncError()}</span>
            </Show>

            <Button
              variant="primary"
              size="small"
              onClick={() => setShowCreateSheet(true)}
              disabled={!apiKey() || !activeTeam()}
            >
              <Icon name="plus" class="size-4" />
              Create
            </Button>

            <Button
              variant="secondary"
              size="small"
              onClick={() => handleSync()}
              disabled={isSyncing()}
            >
              <Show when={isSyncing()} fallback={<Icon name="branch" class="size-4" />}>
                <div class="size-4 animate-spin border-2 border-current border-t-transparent rounded-full" />
              </Show>
              Sync
            </Button>
          </div>
        </div>

        {/* API Key Input (if not set) */}
        <Show when={!apiKey()}>
          <div class="mb-4 p-4 bg-surface-raised-base rounded-lg">
            <label class="block text-14-medium text-text-base mb-2">
              Enter Linear API Key
            </label>
            <input
              type="password"
              placeholder="lin_api_xxx..."
              class="w-full px-3 py-2 bg-surface-base border border-border-base rounded-lg text-14-regular text-text-base focus:outline-none focus:ring-2 focus:ring-text-accent"
              onBlur={handleApiKeyInput}
              onKeyDown={(e) => e.key === "Enter" && handleApiKeyInput(e)}
            />
            <p class="mt-2 text-12-regular text-text-weak">
              Get your API key from Linear Settings → API → Personal API Keys
            </p>
          </div>
        </Show>

        {/* Content */}
        <Show
          when={props.linear.apiConfigured || apiKey()}
          fallback={
            <div class="flex-1 flex items-center justify-center">
              <div class="text-center max-w-md space-y-4">
                <Icon name="task" class="size-12 mx-auto text-text-weaker" />
                <h3 class="text-16-semibold text-text-base">Linear Not Configured</h3>
                <p class="text-14-regular text-text-weak">
                  Enter your Linear API key above to connect to Linear.
                </p>
              </div>
            </div>
          }
        >
          <Show
            when={props.linear.issues.length > 0}
            fallback={
              <div class="flex-1 flex items-center justify-center">
                <div class="text-center space-y-4">
                  <Icon name="task" class="size-12 mx-auto text-text-weaker" />
                  <h3 class="text-16-semibold text-text-base">No Issues Found</h3>
                  <p class="text-14-regular text-text-weak">
                    {props.linear.teams.length === 0
                      ? "Click Sync to fetch your teams and issues."
                      : "No issues in this team. Click Sync to refresh."}
                  </p>
                  <Button variant="primary" size="small" onClick={() => handleSync()}>
                    <Icon name="branch" class="size-4" />
                    Sync from Linear
                  </Button>
                </div>
              </div>
            }
          >
            <div class="flex-1 min-h-0 overflow-hidden">
              <KanbanBoard
                linear={props.linear}
                onMoveIssue={handleMoveIssue}
                onSelectIssue={handleSelectIssue}
              />
            </div>
          </Show>
        </Show>

        {/* Error display */}
        <Show when={props.linear.lastError}>
          <div class="shrink-0 mt-4 p-3 bg-surface-critical-base rounded-lg text-14-regular text-text-critical-base">
            <strong>Sync Error:</strong> {props.linear.lastError}
          </div>
        </Show>
      </div>

      {/* Detail Panel */}
      <Show when={currentSelectedIssue()}>
        {(issue) => (
          <IssueDetailSheet
            issue={issue()}
            states={props.linear.states}
            workers={props.workers}
            workflows={props.workflows}
            sessions={sessions()}
            onClose={handleCloseDetail}
            onChangeState={handleChangeStateFromDetail}
            onUpdateOrchestra={(update) => handleUpdateIssueOrchestra(issue().id, update)}
            onDelete={() => handleDeleteIssue(issue().id)}
          />
        )}
      </Show>

      {/* Create Issue Sheet */}
      <IssueCreateSheet
        open={showCreateSheet()}
        states={props.linear.states}
        projects={props.linear.projects}
        users={props.linear.users}
        onClose={() => setShowCreateSheet(false)}
        onCreate={handleCreateIssue}
      />
    </div>
  );
}
