import { Button } from "@opencode-ai/ui/button";
import { Icon } from "@opencode-ai/ui/icon";
import { Tag } from "@opencode-ai/ui/tag";
import { For, Show, createMemo, createResource } from "solid-js";
import { createStore } from "solid-js/store";
import { useGlobalSDK } from "@/context/global-sdk";
import { useLayout } from "@/context/layout";
import type { OrchestraData, TabId, Workflow } from "@/pages/orchestra/orchestra-types";
import { loadOrchestraDataFromDirectory, mergeOrchestraDataSets } from "@/pages/orchestra/orchestra-data";
import { ServersTab } from "@/pages/orchestra/orchestra-servers-tab";
import { MemoriesTab } from "@/pages/orchestra/orchestra-memories-tab";
import { formatSummaryCount, getRuntimeSummaryCounts } from "@/pages/orchestra/orchestra-summary";
import { SkillsTab } from "@/pages/orchestra/orchestra-skills-tab";
import { TicketsTab } from "@/pages/orchestra/orchestra-tickets-tab";
import { WorkersTab } from "@/pages/orchestra/orchestra-workers-tab";
import { WorkflowsTab } from "@/pages/orchestra/orchestra-workflows-tab";

export default function OrchestraPage() {
  const [state, setState] = createStore({
    activeTab: "workers" as TabId,
    refreshKey: 0,
    isEditing: false,
  });
  const globalSDK = useGlobalSDK();
  const layout = useLayout();
  const defaultDirectory = () => layout.projects.list()[0]?.worktree ?? "";

  async function readJsonFile<T>(directory: string, path: string, fallback: T): Promise<T> {
    try {
      const response = await globalSDK.client.file.read({ directory, path });
      if (response.data && response.data.content) {
        return JSON.parse(response.data.content) as T;
      }
      return fallback;
    } catch {
      return fallback;
    }
  }

  async function listWorkflowFiles(directory: string): Promise<Workflow[]> {
    try {
      const response = await globalSDK.client.file.list({ directory, path: ".opencode/workforce/workflows" });
      if (response.data) {
        const files = response.data as Array<{ name: string; type: string }>;
        const workflows: Workflow[] = [];
        for (const file of files) {
          if (file.name.endsWith(".json")) {
            const workflow = await readJsonFile<Workflow | null>(
              directory,
              `.opencode/workforce/workflows/${file.name}`,
              null,
            );
            if (workflow) workflows.push(workflow);
          }
        }
        return workflows;
      }
      return [];
    } catch {
      return [];
    }
  }

  async function loadOrchestraDataFromDirectoryWithClient(directory: string) {
    return loadOrchestraDataFromDirectory({ readJsonFile, listWorkflowFiles }, directory);
  }

  const [data, { refetch }] = createResource(
    () => state.refreshKey,
    async () => {
      const projects = layout.projects.list();
      const dataSets: OrchestraData[] = [];

      if (projects.length === 0) {
        dataSets.push(await loadOrchestraDataFromDirectoryWithClient(""));
      } else {
        for (const project of projects) {
          dataSets.push(await loadOrchestraDataFromDirectoryWithClient(project.worktree));
        }
      }

      return mergeOrchestraDataSets(dataSets);
    },
  );

  // Auto-refresh disabled - use manual Refresh/Sync buttons instead

  const runtimeCounts = createMemo(() => getRuntimeSummaryCounts(data()));

  const tabs = [
    { id: "workers" as const, label: "Workers", icon: "brain" as const },
    { id: "workflows" as const, label: "Workflows", icon: "branch" as const },
    { id: "servers" as const, label: "Servers", icon: "server" as const },
    { id: "skills" as const, label: "Skills", icon: "checklist" as const },
    { id: "memories" as const, label: "Memories", icon: "task" as const },
    { id: "tickets" as const, label: "Tickets", icon: "task" as const },
  ];

  return (
    <div class="flex flex-col h-full w-full bg-background-base">
      <div class="flex items-center justify-between px-4 sm:px-6 py-4 border-b border-border-base">
        <div class="flex items-center gap-3">
          <Icon name="task" class="size-6 text-text-accent" />
          <div class="flex flex-col gap-1">
            <h1 class="text-18-semibold text-text-base">Orchestra Dashboard</h1>
            <div class="flex flex-wrap gap-2">
              <Tag size="normal">Workers {formatSummaryCount(runtimeCounts().runningWorkers)}</Tag>
              <Tag size="normal">Jobs {formatSummaryCount(runtimeCounts().runningJobs)}</Tag>
              <Tag size="normal">Workflows {formatSummaryCount(runtimeCounts().runningWorkflows)}</Tag>
              <Tag size="normal">Integrations {formatSummaryCount(runtimeCounts().runningIntegrations)}</Tag>
              <Tag size="normal">Memories {formatSummaryCount(runtimeCounts().memoryEntries)}</Tag>
              <Tag size="normal">Tickets {formatSummaryCount(runtimeCounts().openTickets)}</Tag>
            </div>
          </div>
        </div>
        <Button variant="secondary" size="small" onClick={() => setState("refreshKey", (value) => value + 1)}>
          <Icon name="branch" class="size-4" />
          Refresh
        </Button>
      </div>

      <div class="flex border-b border-border-base overflow-x-auto">
        <For each={tabs}>
          {(tab) => (
            <button
              class={`px-4 sm:px-6 py-3 text-14-medium transition-colors whitespace-nowrap ${
                state.activeTab === tab.id
                  ? "text-text-accent border-b-2 border-text-accent"
                  : "text-text-weak hover:text-text-base"
              }`}
              onClick={() => setState("activeTab", tab.id)}
            >
              <div class="flex items-center gap-2">
                <Icon name={tab.icon} class="size-4" />
                {tab.label}
              </div>
            </button>
          )}
        </For>
      </div>

      <div class="flex-1 overflow-auto p-4 sm:p-6">
        {/* Show loading indicator but DON'T unmount content - keeps component state */}
        <Show when={data.loading && !data()}>
          <div class="flex items-center justify-center h-32 text-text-weak">
            <div class="size-6 mr-2 animate-spin border-2 border-current border-t-transparent rounded-full" />
            Loading...
          </div>
        </Show>

        <Show when={data()}>
          <Show when={state.activeTab === "workers"}>
            <WorkersTab
              workers={data()!.workers}
              instances={data()!.instances}
              jobs={data()!.jobs}
              onRefresh={refetch}
              onEditingChange={(editing) => setState("isEditing", editing)}
              defaultDirectory={defaultDirectory()}
            />
          </Show>
          <Show when={state.activeTab === "workflows"}>
            <WorkflowsTab
              workflows={data()!.workflows}
              runs={data()!.workflowRuns}
              onRefresh={refetch}
              onEditingChange={(editing) => setState("isEditing", editing)}
              defaultDirectory={defaultDirectory()}
            />
          </Show>
          <Show when={state.activeTab === "servers"}>
            <ServersTab
              integrations={data()!.integrations}
              instances={data()!.integrationInstances}
              onRefresh={refetch}
              onEditingChange={(editing) => setState("isEditing", editing)}
              defaultDirectory={defaultDirectory()}
            />
          </Show>
          <Show when={state.activeTab === "skills"}>
            <SkillsTab
              skills={data()!.skills}
              roots={data()!.skillRoots}
              onRefresh={refetch}
              defaultDirectory={defaultDirectory()}
            />
          </Show>
          <Show when={state.activeTab === "memories"}>
            <MemoriesTab
              entries={data()!.memoryEntries}
            />
          </Show>
          <Show when={state.activeTab === "tickets"}>
            <TicketsTab
              linear={data()!.linear}
              workers={data()!.workers}
              workflows={data()!.workflows}
              onRefresh={refetch}
              defaultDirectory={defaultDirectory()}
            />
          </Show>
        </Show>
      </div>
    </div>
  );
}
