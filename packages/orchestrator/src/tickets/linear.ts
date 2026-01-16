import type { TicketStatus } from "./types";
import type { LinearIssueLink, LinearState } from "./linear-types";

export const LINEAR_API_URL = process.env.LINEAR_API_URL ?? "https://api.linear.app/graphql";

type LinearConfig = {
  apiUrl: string;
  apiKey: string;
  teamId: string;
};

type GraphQLResponse<T> = {
  data?: T;
  errors?: { message?: string }[];
};

function resolveLinearConfig(teamId?: string): LinearConfig {
  const apiKey = process.env.LINEAR_API_KEY;
  if (!apiKey) {
    throw new Error("LINEAR_API_KEY is required");
  }

  const resolvedTeamId = teamId ?? process.env.LINEAR_TEAM_ID;
  if (!resolvedTeamId) {
    throw new Error("LINEAR_TEAM_ID is required");
  }

  return {
    apiUrl: process.env.LINEAR_API_URL ?? LINEAR_API_URL,
    apiKey,
    teamId: resolvedTeamId,
  };
}

async function runGraphQL<T>(
  query: string,
  variables: Record<string, unknown>,
  teamId?: string,
): Promise<T> {
  const { apiUrl, apiKey } = resolveLinearConfig(teamId);
  const response = await fetch(apiUrl, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: apiKey,
    },
    body: JSON.stringify({ query, variables }),
  });

  if (!response.ok) {
    throw new Error(`Linear request failed with status ${response.status}`);
  }

  const payload = (await response.json()) as GraphQLResponse<T>;
  if (payload.errors && payload.errors.length > 0) {
    const message = payload.errors
      .map(err => err?.message)
      .filter(Boolean)
      .join("; ");
    throw new Error(message || "Linear GraphQL error");
  }

  if (!payload.data) {
    throw new Error("Linear GraphQL response missing data");
  }

  return payload.data;
}

export async function fetchTeamStates(teamId: string): Promise<LinearState[]> {
  const data = await runGraphQL<{
    team: {
      states: { nodes: LinearState[] };
    } | null;
  }>(
    `query TeamStates($teamId: String!) {\n  team(id: $teamId) {\n    states {\n      nodes {\n        id\n        name\n        type\n      }\n    }\n  }\n}`,
    { teamId },
    teamId,
  );

  if (!data.team) {
    throw new Error("Linear team not found");
  }

  return data.team.states.nodes;
}

function findByType(states: LinearState[], types: string[]): LinearState | undefined {
  const normalized = types.map(value => value.toLowerCase());
  for (const type of normalized) {
    const match = states.find(state => state.type?.toLowerCase() === type);
    if (match) return match;
  }
  return undefined;
}

function findByName(states: LinearState[], tokens: string[]): LinearState | undefined {
  const normalized = tokens.map(token => token.toLowerCase());
  for (const token of normalized) {
    const match = states.find(state => state.name.toLowerCase().includes(token));
    if (match) return match;
  }
  return undefined;
}

export function mapTicketStatusToLinearStateId(
  status: TicketStatus,
  states: LinearState[]
): string {
  const typePreferences: Record<TicketStatus, string[]> = {
    open: ["unstarted", "backlog"],
    in_progress: ["started"],
    blocked: ["blocked"],
    done: ["completed"],
    canceled: ["canceled"],
  };

  const namePreferences: Record<TicketStatus, string[]> = {
    open: ["backlog", "todo", "unstarted", "triage"],
    in_progress: ["in progress", "started", "doing"],
    blocked: ["blocked", "stuck"],
    done: ["done", "completed", "shipped", "resolved"],
    canceled: ["canceled", "cancelled"],
  };

  const byType = findByType(states, typePreferences[status]);
  if (byType) return byType.id;

  const byName = findByName(states, namePreferences[status]);
  if (byName) return byName.id;

  throw new Error(`No Linear state found for ticket status: ${status}`);
}

export async function createIssue(params: {
  title: string;
  description?: string;
  teamId?: string;
  priority?: number;
}): Promise<LinearIssueLink> {
  const { teamId } = resolveLinearConfig(params.teamId);
  const variables: Record<string, unknown> = {
    input: {
      teamId,
      title: params.title,
      description: params.description,
      priority: params.priority,
    },
  };

  const data = await runGraphQL<{
    issueCreate: {
      issue: {
        id: string;
        identifier?: string | null;
        url?: string | null;
      } | null;
    } | null;
  }>(
    `mutation IssueCreate($input: IssueCreateInput!) {\n  issueCreate(input: $input) {\n    issue {\n      id\n      identifier\n      url\n    }\n  }\n}`,
    variables,
    teamId,
  );

  if (!data.issueCreate?.issue) {
    throw new Error("Linear issue creation failed");
  }

  return {
    issueId: data.issueCreate.issue.id,
    identifier: data.issueCreate.issue.identifier ?? undefined,
    url: data.issueCreate.issue.url ?? undefined,
  };
}

export async function updateIssueState(params: {
  issueId: string;
  stateId: string;
  teamId?: string;
}): Promise<void> {
  await runGraphQL<{
    issueUpdate: {
      success: boolean;
    } | null;
  }>(
    `mutation IssueUpdate($input: IssueUpdateInput!) {\n  issueUpdate(input: $input) {\n    success\n  }\n}`,
    {
      input: {
        id: params.issueId,
        stateId: params.stateId,
      },
    },
    params.teamId,
  );
}
