import type {
  LinearTeam,
  LinearWorkflowState,
  LinearProject,
  LinearLabel,
  LinearUser,
  LinearIssue,
  CreateIssueInput,
} from "./linear-types";

const LINEAR_API_URL = "https://api.linear.app/graphql";

type GraphQLResponse<T> = {
  data?: T;
  errors?: { message?: string }[];
};

export function createLinearClient(apiKey: string) {
  async function query<T>(
    gql: string,
    variables?: Record<string, unknown>
  ): Promise<T> {
    const response = await fetch(LINEAR_API_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: apiKey,
      },
      body: JSON.stringify({ query: gql, variables }),
    });

    if (!response.ok) {
      throw new Error(`Linear request failed with status ${response.status}`);
    }

    const payload = (await response.json()) as GraphQLResponse<T>;
    if (payload.errors && payload.errors.length > 0) {
      const message = payload.errors
        .map((err) => err?.message)
        .filter(Boolean)
        .join("; ");
      throw new Error(message || "Linear GraphQL error");
    }

    if (!payload.data) {
      throw new Error("Linear GraphQL response missing data");
    }

    return payload.data;
  }

  return {
    async fetchTeams(): Promise<LinearTeam[]> {
      const data = await query<{
        teams: { nodes: LinearTeam[] };
      }>(`
        query Teams {
          teams {
            nodes {
              id
              key
              name
            }
          }
        }
      `);
      return data.teams.nodes;
    },

    async fetchStates(teamId: string): Promise<LinearWorkflowState[]> {
      const data = await query<{
        team: {
          states: {
            nodes: Array<{
              id: string;
              name: string;
              type: string;
              color: string;
              position: number;
            }>;
          };
        } | null;
      }>(
        `
        query WorkflowStates($teamId: String!) {
          team(id: $teamId) {
            states {
              nodes {
                id
                name
                type
                color
                position
              }
            }
          }
        }
      `,
        { teamId }
      );

      if (!data.team) {
        throw new Error("Team not found");
      }

      return data.team.states.nodes.map((state) => ({
        ...state,
        teamId,
      }));
    },

    async fetchProjects(teamId: string): Promise<LinearProject[]> {
      const data = await query<{
        team: {
          projects: {
            nodes: Array<{
              id: string;
              name: string;
              state: string;
            }>;
          };
        } | null;
      }>(
        `
        query Projects($teamId: String!) {
          team(id: $teamId) {
            projects {
              nodes {
                id
                name
                state
              }
            }
          }
        }
      `,
        { teamId }
      );

      if (!data.team) {
        throw new Error("Team not found");
      }

      return data.team.projects.nodes.map((project) => ({
        ...project,
        teamId,
      }));
    },

    async fetchLabels(teamId: string): Promise<LinearLabel[]> {
      const data = await query<{
        team: {
          labels: {
            nodes: Array<{
              id: string;
              name: string;
              color: string;
            }>;
          };
        } | null;
      }>(
        `
        query Labels($teamId: String!) {
          team(id: $teamId) {
            labels {
              nodes {
                id
                name
                color
              }
            }
          }
        }
      `,
        { teamId }
      );

      if (!data.team) {
        throw new Error("Team not found");
      }

      return data.team.labels.nodes.map((label) => ({
        ...label,
        teamId,
      }));
    },

    async fetchUsers(teamId: string): Promise<LinearUser[]> {
      const data = await query<{
        team: {
          members: {
            nodes: Array<{
              id: string;
              name: string;
              email: string;
              avatarUrl?: string;
            }>;
          };
        } | null;
      }>(
        `
        query Users($teamId: String!) {
          team(id: $teamId) {
            members {
              nodes {
                id
                name
                email
                avatarUrl
              }
            }
          }
        }
      `,
        { teamId }
      );

      if (!data.team) {
        throw new Error("Team not found");
      }

      return data.team.members.nodes;
    },

    async fetchIssues(
      teamId: string,
      options?: {
        first?: number;
        projectId?: string;
        stateId?: string;
      }
    ): Promise<LinearIssue[]> {
      const first = options?.first ?? 100;
      const filters: string[] = [`team: { id: { eq: "${teamId}" } }`];

      if (options?.projectId) {
        filters.push(`project: { id: { eq: "${options.projectId}" } }`);
      }
      if (options?.stateId) {
        filters.push(`state: { id: { eq: "${options.stateId}" } }`);
      }

      const filterString = filters.length > 0 ? `filter: { ${filters.join(", ")} }` : "";

      const data = await query<{
        issues: {
          nodes: Array<{
            id: string;
            identifier: string;
            title: string;
            description?: string;
            priority: number;
            url: string;
            createdAt: string;
            updatedAt: string;
            state: { id: string; name: string; type: string };
            assignee?: { id: string; name: string; email: string; avatarUrl?: string };
            project?: { id: string; name: string };
            labels: { nodes: Array<{ id: string; name: string; color: string }> };
          }>;
        };
      }>(`
        query Issues($first: Int!) {
          issues(first: $first, ${filterString}, orderBy: updatedAt) {
            nodes {
              id
              identifier
              title
              description
              priority
              url
              createdAt
              updatedAt
              state {
                id
                name
                type
              }
              assignee {
                id
                name
                email
                avatarUrl
              }
              project {
                id
                name
              }
              labels {
                nodes {
                  id
                  name
                  color
                }
              }
            }
          }
        }
      `, { first });

      return data.issues.nodes.map((issue) => ({
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
        labelIds: issue.labels.nodes.map((l) => l.id),
        labels: issue.labels.nodes.map((l) => ({ ...l, teamId })),
        teamId,
        url: issue.url,
        createdAt: issue.createdAt,
        updatedAt: issue.updatedAt,
      }));
    },

    async updateIssueState(issueId: string, stateId: string): Promise<void> {
      await query<{ issueUpdate: { success: boolean } }>(
        `
        mutation UpdateIssueState($issueId: String!, $stateId: String!) {
          issueUpdate(id: $issueId, input: { stateId: $stateId }) {
            success
          }
        }
      `,
        { issueId, stateId }
      );
    },

    async updateIssue(
      issueId: string,
      input: {
        title?: string;
        description?: string;
        priority?: number;
        stateId?: string;
        assigneeId?: string;
        projectId?: string;
      }
    ): Promise<void> {
      await query<{ issueUpdate: { success: boolean } }>(
        `
        mutation UpdateIssue($issueId: String!, $input: IssueUpdateInput!) {
          issueUpdate(id: $issueId, input: $input) {
            success
          }
        }
      `,
        { issueId, input }
      );
    },

    async createIssue(teamId: string, input: CreateIssueInput): Promise<LinearIssue> {
      const data = await query<{
        issueCreate: {
          issue: {
            id: string;
            identifier: string;
            title: string;
            description?: string;
            priority: number;
            url: string;
            createdAt: string;
            updatedAt: string;
            state: { id: string; name: string; type: string };
            assignee?: { id: string; name: string; email: string; avatarUrl?: string };
            project?: { id: string; name: string };
            labels: { nodes: Array<{ id: string; name: string; color: string }> };
          };
        };
      }>(
        `
        mutation CreateIssue($input: IssueCreateInput!) {
          issueCreate(input: $input) {
            issue {
              id
              identifier
              title
              description
              priority
              url
              createdAt
              updatedAt
              state {
                id
                name
                type
              }
              assignee {
                id
                name
                email
                avatarUrl
              }
              project {
                id
                name
              }
              labels {
                nodes {
                  id
                  name
                  color
                }
              }
            }
          }
        }
      `,
        { input: { teamId, ...input } }
      );

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
        labelIds: issue.labels.nodes.map((l) => l.id),
        labels: issue.labels.nodes.map((l) => ({ ...l, teamId })),
        teamId,
        url: issue.url,
        createdAt: issue.createdAt,
        updatedAt: issue.updatedAt,
      };
    },
  };
}

export type LinearClient = ReturnType<typeof createLinearClient>;
