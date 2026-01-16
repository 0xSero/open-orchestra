import type { ToolDefinition } from "@opencode-ai/plugin";
import { tool } from "@opencode-ai/plugin";
import { createLinearClient } from "./linear-client";
import type { LinearData } from "./linear-types";
import { writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";

type Tools = Record<string, ToolDefinition>;

function getLinearApiKey(): string | null {
  return process.env.LINEAR_API_KEY || null;
}

function getDefaultTeamId(): string | null {
  return process.env.LINEAR_TEAM_ID || null;
}

async function writeLinearData(directory: string, data: LinearData): Promise<void> {
  const runtimeDir = join(directory, ".opencode", "workforce");
  await mkdir(runtimeDir, { recursive: true });
  await writeFile(
    join(runtimeDir, "linear.json"),
    JSON.stringify(data, null, 2)
  );
}

async function readLinearData(directory: string): Promise<LinearData> {
  const { readFile } = await import("node:fs/promises");
  try {
    const content = await readFile(
      join(directory, ".opencode", "workforce", "linear.json"),
      "utf-8"
    );
    return JSON.parse(content);
  } catch {
    return {
      apiConfigured: false,
      teams: [],
      states: [],
      projects: [],
      labels: [],
      users: [],
      issues: [],
    };
  }
}

export function createLinearTools(
  getDirectory: () => string,
  onUpdate?: () => void | Promise<void>
): Tools {
  const notifyUpdate = () => {
    if (onUpdate) onUpdate();
  };

  return {
    linear_sync: tool({
      description:
        "Sync all Linear data (teams, workflow states, issues, projects, labels, users) to local storage. Run this to fetch latest data from Linear.",
      args: {
        teamId: tool.schema
          .string()
          .optional()
          .describe("Team ID to sync. If not provided, uses LINEAR_TEAM_ID env or syncs first team."),
      },
      async execute(args) {
        const apiKey = getLinearApiKey();
        if (!apiKey) {
          return JSON.stringify({
            error: "LINEAR_API_KEY not configured",
            hint: "Set LINEAR_API_KEY environment variable",
          });
        }

        const client = createLinearClient(apiKey);
        const directory = getDirectory();

        try {
          // Fetch teams first
          const teams = await client.fetchTeams();
          if (teams.length === 0) {
            return JSON.stringify({ error: "No teams found in Linear" });
          }

          // Determine which team to sync
          const teamId = args.teamId || getDefaultTeamId() || teams[0].id;
          const team = teams.find((t) => t.id === teamId);
          if (!team) {
            return JSON.stringify({ error: `Team ${teamId} not found` });
          }

          // Fetch all data for the team
          const [states, projects, labels, users, issues] = await Promise.all([
            client.fetchStates(teamId),
            client.fetchProjects(teamId),
            client.fetchLabels(teamId),
            client.fetchUsers(teamId),
            client.fetchIssues(teamId),
          ]);

          const data: LinearData = {
            apiConfigured: true,
            teams,
            states,
            projects,
            labels,
            users,
            issues,
            activeTeamId: teamId,
            lastSyncedAt: Date.now(),
          };

          await writeLinearData(directory, data);
          notifyUpdate();

          return JSON.stringify({
            success: true,
            team: team.name,
            counts: {
              states: states.length,
              projects: projects.length,
              labels: labels.length,
              users: users.length,
              issues: issues.length,
            },
          });
        } catch (err: any) {
          const data = await readLinearData(directory);
          data.lastError = err?.message || String(err);
          await writeLinearData(directory, data);
          notifyUpdate();

          return JSON.stringify({ error: err?.message || String(err) });
        }
      },
    }),

    linear_teams: tool({
      description: "List all Linear teams you have access to",
      args: {},
      async execute() {
        const apiKey = getLinearApiKey();
        if (!apiKey) {
          return JSON.stringify({ error: "LINEAR_API_KEY not configured" });
        }

        const client = createLinearClient(apiKey);
        try {
          const teams = await client.fetchTeams();
          return JSON.stringify({ teams }, null, 2);
        } catch (err: any) {
          return JSON.stringify({ error: err?.message || String(err) });
        }
      },
    }),

    linear_states: tool({
      description: "List workflow states for a team (used as Kanban columns)",
      args: {
        teamId: tool.schema.string().describe("Team ID"),
      },
      async execute(args) {
        const apiKey = getLinearApiKey();
        if (!apiKey) {
          return JSON.stringify({ error: "LINEAR_API_KEY not configured" });
        }

        const client = createLinearClient(apiKey);
        try {
          const states = await client.fetchStates(args.teamId);
          return JSON.stringify({ states }, null, 2);
        } catch (err: any) {
          return JSON.stringify({ error: err?.message || String(err) });
        }
      },
    }),

    linear_projects: tool({
      description: "List projects in a Linear team",
      args: {
        teamId: tool.schema.string().describe("Team ID"),
      },
      async execute(args) {
        const apiKey = getLinearApiKey();
        if (!apiKey) {
          return JSON.stringify({ error: "LINEAR_API_KEY not configured" });
        }

        const client = createLinearClient(apiKey);
        try {
          const projects = await client.fetchProjects(args.teamId);
          return JSON.stringify({ projects }, null, 2);
        } catch (err: any) {
          return JSON.stringify({ error: err?.message || String(err) });
        }
      },
    }),

    linear_issues: tool({
      description: "List issues from Linear. Can filter by team, project, or state.",
      args: {
        teamId: tool.schema
          .string()
          .optional()
          .describe("Team ID. If not provided, uses active team from last sync."),
        projectId: tool.schema.string().optional().describe("Filter by project ID"),
        stateId: tool.schema.string().optional().describe("Filter by state ID"),
        limit: tool.schema.number().optional().describe("Max issues to return (default 100)"),
      },
      async execute(args) {
        const apiKey = getLinearApiKey();
        if (!apiKey) {
          return JSON.stringify({ error: "LINEAR_API_KEY not configured" });
        }

        const directory = getDirectory();
        const data = await readLinearData(directory);
        const teamId = args.teamId || data.activeTeamId || getDefaultTeamId();

        if (!teamId) {
          return JSON.stringify({
            error: "No team specified. Run linear_sync first or provide teamId.",
          });
        }

        const client = createLinearClient(apiKey);
        try {
          const issues = await client.fetchIssues(teamId, {
            first: args.limit,
            projectId: args.projectId,
            stateId: args.stateId,
          });
          return JSON.stringify({ issues, count: issues.length }, null, 2);
        } catch (err: any) {
          return JSON.stringify({ error: err?.message || String(err) });
        }
      },
    }),

    linear_issue_create: tool({
      description: "Create a new issue in Linear",
      args: {
        teamId: tool.schema.string().describe("Team ID"),
        title: tool.schema.string().describe("Issue title"),
        description: tool.schema.string().optional().describe("Issue description (markdown)"),
        priority: tool.schema
          .number()
          .optional()
          .describe("Priority: 0=none, 1=urgent, 2=high, 3=medium, 4=low"),
        stateId: tool.schema.string().optional().describe("Initial state ID"),
        assigneeId: tool.schema.string().optional().describe("Assignee user ID"),
        projectId: tool.schema.string().optional().describe("Project ID"),
      },
      async execute(args) {
        const apiKey = getLinearApiKey();
        if (!apiKey) {
          return JSON.stringify({ error: "LINEAR_API_KEY not configured" });
        }

        const client = createLinearClient(apiKey);
        const directory = getDirectory();

        try {
          const issue = await client.createIssue(args.teamId, {
            title: args.title,
            description: args.description,
            priority: args.priority,
            stateId: args.stateId,
            assigneeId: args.assigneeId,
            projectId: args.projectId,
          });

          // Update local data
          const data = await readLinearData(directory);
          data.issues.unshift(issue);
          data.lastSyncedAt = Date.now();
          await writeLinearData(directory, data);
          notifyUpdate();

          return JSON.stringify({
            success: true,
            issue: {
              id: issue.id,
              identifier: issue.identifier,
              title: issue.title,
              url: issue.url,
            },
          });
        } catch (err: any) {
          return JSON.stringify({ error: err?.message || String(err) });
        }
      },
    }),

    linear_issue_update: tool({
      description: "Update an existing Linear issue",
      args: {
        issueId: tool.schema.string().describe("Issue ID to update"),
        title: tool.schema.string().optional().describe("New title"),
        description: tool.schema.string().optional().describe("New description"),
        priority: tool.schema.number().optional().describe("New priority"),
        stateId: tool.schema.string().optional().describe("New state ID"),
        assigneeId: tool.schema.string().optional().describe("New assignee ID"),
        projectId: tool.schema.string().optional().describe("New project ID"),
      },
      async execute(args) {
        const apiKey = getLinearApiKey();
        if (!apiKey) {
          return JSON.stringify({ error: "LINEAR_API_KEY not configured" });
        }

        const client = createLinearClient(apiKey);
        const directory = getDirectory();

        try {
          const { issueId, ...input } = args;
          await client.updateIssue(issueId, input);

          // Update local data
          const data = await readLinearData(directory);
          const idx = data.issues.findIndex((i) => i.id === issueId);
          if (idx >= 0) {
            Object.assign(data.issues[idx], input);
            if (input.stateId) {
              const state = data.states.find((s) => s.id === input.stateId);
              if (state) {
                data.issues[idx].stateId = state.id;
                data.issues[idx].state = { id: state.id, name: state.name, type: state.type };
              }
            }
            data.issues[idx].updatedAt = new Date().toISOString();
          }
          data.lastSyncedAt = Date.now();
          await writeLinearData(directory, data);
          notifyUpdate();

          return JSON.stringify({ success: true, issueId });
        } catch (err: any) {
          return JSON.stringify({ error: err?.message || String(err) });
        }
      },
    }),

    linear_issue_move: tool({
      description:
        "Move a Linear issue to a different state (column). Used for Kanban drag-and-drop.",
      args: {
        issueId: tool.schema.string().describe("Issue ID to move"),
        stateId: tool.schema.string().describe("Target state ID"),
      },
      async execute(args) {
        const apiKey = getLinearApiKey();
        if (!apiKey) {
          return JSON.stringify({ error: "LINEAR_API_KEY not configured" });
        }

        const client = createLinearClient(apiKey);
        const directory = getDirectory();

        try {
          await client.updateIssueState(args.issueId, args.stateId);

          // Update local data
          const data = await readLinearData(directory);
          const idx = data.issues.findIndex((i) => i.id === args.issueId);
          if (idx >= 0) {
            const state = data.states.find((s) => s.id === args.stateId);
            if (state) {
              data.issues[idx].stateId = state.id;
              data.issues[idx].state = { id: state.id, name: state.name, type: state.type };
            }
            data.issues[idx].updatedAt = new Date().toISOString();
          }
          data.lastSyncedAt = Date.now();
          await writeLinearData(directory, data);
          notifyUpdate();

          return JSON.stringify({ success: true, issueId: args.issueId, stateId: args.stateId });
        } catch (err: any) {
          return JSON.stringify({ error: err?.message || String(err) });
        }
      },
    }),
  };
}
