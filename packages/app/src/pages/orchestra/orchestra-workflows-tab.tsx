import { Accordion } from "@opencode-ai/ui/accordion";
import { Button } from "@opencode-ai/ui/button";
import { DropdownMenu } from "@opencode-ai/ui/dropdown-menu";
import { Icon } from "@opencode-ai/ui/icon";
import { IconButton } from "@opencode-ai/ui/icon-button";
import { Tag } from "@opencode-ai/ui/tag";
import { For, Show, createMemo } from "solid-js";
import { createStore } from "solid-js/store";
import type { Workflow, WorkflowRunState } from "@/pages/orchestra/orchestra-types";
import { Sheet } from "@/pages/orchestra/orchestra-sheet";
import { WorkflowEditForm } from "@/pages/orchestra/orchestra-workflow-edit-form";
import { deleteFile, notifySaveError, notifySaveSuccess, writeJsonFile } from "@/pages/orchestra/orchestra-utils";
import { buildWorkflowRunRows, formatVerificationSummary } from "@/pages/orchestra/orchestra-workflows-tab-helpers";
import { useGlobalSDK } from "@/context/global-sdk";

export function WorkflowsTab(props: {
  workflows: Workflow[];
  runs: WorkflowRunState[];
  onRefresh: () => void;
  onEditingChange: (editing: boolean) => void;
  defaultDirectory: string;
}) {
  const sdk = useGlobalSDK();
  const [state, setState] = createStore({
    editingWorkflow: null as Workflow | null,
    isCreating: false,
  });

  const openEdit = (workflow: Workflow) => {
    setState({ editingWorkflow: workflow, isCreating: false });
    props.onEditingChange(true);
  };

  const openCreate = () => {
    setState({
      editingWorkflow: { id: "", name: "", description: "", steps: [], directory: props.defaultDirectory },
      isCreating: true,
    });
    props.onEditingChange(true);
  };

  const closeSheet = () => {
    setState({ editingWorkflow: null, isCreating: false });
    props.onEditingChange(false);
  };

  const sortedRuns = createMemo(() => [...props.runs].sort((a, b) => b.startedAt.localeCompare(a.startedAt)));
  const runRows = createMemo(() => buildWorkflowRunRows(props.runs));

  return (
    <div class="space-y-6">
      <div class="flex items-center justify-between">
        <div class="text-14-regular text-text-weak">
          {props.workflows.length} workflow{props.workflows.length !== 1 ? "s" : ""} configured
        </div>
        <Button variant="primary" size="small" onClick={openCreate}>
          <Icon name="plus" class="size-4" />
          Add Workflow
        </Button>
      </div>

      <div class="border border-border-base rounded-lg overflow-hidden">
        <table class="w-full">
          <thead>
            <tr class="bg-surface-raised-base border-b border-border-base">
              <th class="text-left px-4 py-2 text-12-medium text-text-weak font-medium">Name</th>
              <th class="text-left px-4 py-2 text-12-medium text-text-weak font-medium hidden sm:table-cell">Steps</th>
              <th class="text-left px-4 py-2 text-12-medium text-text-weak font-medium hidden md:table-cell">Iterations</th>
              <th class="w-10 px-2"></th>
            </tr>
          </thead>
          <tbody>
            <For
              each={props.workflows}
              fallback={
                <tr>
                  <td colspan="4" class="px-4 py-8 text-center text-text-weak">
                    <div class="flex flex-col items-center gap-2">
                      <Icon name="branch" class="size-8 opacity-50" />
                      <p class="text-14-regular">No workflows configured</p>
                      <Button variant="secondary" size="small" onClick={openCreate}>
                        <Icon name="plus" class="size-4" />
                        Add your first workflow
                      </Button>
                    </div>
                  </td>
                </tr>
              }
            >
              {(workflow) => (
                <tr
                  class="border-b border-border-base last:border-b-0 hover:bg-surface-raised-base-hover cursor-pointer transition-colors"
                  onClick={() => openEdit(workflow)}
                >
                  <td class="px-4 py-3">
                    <div class="flex flex-col gap-0.5">
                      <span class="text-14-medium text-text-strong">{workflow.name}</span>
                      <span class="text-12-regular text-text-weak truncate max-w-xs">{workflow.description || workflow.id}</span>
                    </div>
                  </td>
                  <td class="px-4 py-3 hidden sm:table-cell">
                    <Tag size="normal">{workflow.steps?.length || 0} steps</Tag>
                  </td>
                  <td class="px-4 py-3 hidden md:table-cell">
                    <span class="text-13-regular text-text-base">
                      {workflow.iterations ? `${workflow.iterations.max} (${workflow.iterations.mode})` : "—"}
                    </span>
                  </td>
                  <td class="px-2 py-3" onClick={(event) => event.stopPropagation()}>
                    <DropdownMenu>
                      <DropdownMenu.Trigger as={IconButton} icon="overflow-menu-horizontal" variant="ghost" />
                      <DropdownMenu.Portal>
                        <DropdownMenu.Content>
                          <DropdownMenu.Item onSelect={() => openEdit(workflow)}>
                            <Icon name="pencil-line" class="size-4" />
                            <DropdownMenu.ItemLabel>Edit</DropdownMenu.ItemLabel>
                          </DropdownMenu.Item>
                          <DropdownMenu.Item onSelect={() => navigator.clipboard.writeText(JSON.stringify(workflow, null, 2))}>
                            <Icon name="copy" class="size-4" />
                            <DropdownMenu.ItemLabel>Copy JSON</DropdownMenu.ItemLabel>
                          </DropdownMenu.Item>
                          <DropdownMenu.Separator />
                          <DropdownMenu.Item class="text-text-critical-base" onSelect={() => console.log("Delete", workflow.id)}>
                            <Icon name="circle-x" class="size-4" />
                            <DropdownMenu.ItemLabel>Delete</DropdownMenu.ItemLabel>
                          </DropdownMenu.Item>
                        </DropdownMenu.Content>
                      </DropdownMenu.Portal>
                    </DropdownMenu>
                  </td>
                </tr>
              )}
            </For>
          </tbody>
        </table>
      </div>

      <Show when={runRows().length > 0}>
        <div class="space-y-3">
          <h3 class="text-14-medium text-text-base">Workflow Runs ({runRows().length})</h3>
          <div class="border border-border-base rounded-lg overflow-hidden">
            <table class="w-full">
              <thead>
                <tr class="bg-surface-raised-base border-b border-border-base">
                  <th class="text-left px-4 py-2 text-12-medium text-text-weak font-medium">Run ID</th>
                  <th class="text-left px-4 py-2 text-12-medium text-text-weak font-medium">Status</th>
                  <th class="text-left px-4 py-2 text-12-medium text-text-weak font-medium hidden sm:table-cell">Steps</th>
                  <th class="text-left px-4 py-2 text-12-medium text-text-weak font-medium hidden md:table-cell">Last Step</th>
                  <th class="text-left px-4 py-2 text-12-medium text-text-weak font-medium hidden md:table-cell">Started</th>
                  <th class="text-left px-4 py-2 text-12-medium text-text-weak font-medium hidden md:table-cell">Completed</th>
                </tr>
              </thead>
              <tbody>
                <For each={runRows()}>
                  {(run) => (
                    <tr class="border-b border-border-base last:border-b-0">
                      <td class="px-4 py-3 text-12-regular text-text-weak font-mono">{run.runId}</td>
                      <td class="px-4 py-3"><Tag size="normal">{run.statusLabel}</Tag></td>
                      <td class="px-4 py-3 hidden sm:table-cell">
                        <Tag size="normal">{run.stepCount}</Tag>
                      </td>
                      <td class="px-4 py-3 text-12-regular text-text-weak hidden md:table-cell">{run.lastStepName}</td>
                      <td class="px-4 py-3 text-12-regular text-text-weak hidden md:table-cell">{run.startedAt}</td>
                      <td class="px-4 py-3 text-12-regular text-text-weak hidden md:table-cell">{run.completedAt}</td>
                    </tr>
                  )}
                </For>
              </tbody>
            </table>
          </div>

          <div class="border border-border-base rounded-lg overflow-hidden">
            <Accordion multiple>
              <For each={sortedRuns()}>
                {(run) => (
                  <Accordion.Item value={run.runId}>
                    <Accordion.Trigger>
                      <div class="flex items-center justify-between w-full px-4 py-3">
                        <div class="flex items-center gap-3 min-w-0">
                          <span class="text-13-medium text-text-strong truncate">{run.runId}</span>
                          <Tag size="normal">{run.status}</Tag>
                        </div>
                        <span class="text-12-regular text-text-weak">{run.steps.length} steps</span>
                      </div>
                    </Accordion.Trigger>
                    <Accordion.Content class="bg-background-base">
                      <div class="px-4 pb-4 space-y-2">
                        <For each={run.steps}>
                          {(step) => (
                            <div class="flex items-center justify-between text-12-regular text-text-weak">
                              <div class="flex items-center gap-2">
                                <Tag size="normal">{step.status}</Tag>
                                <span class="text-text-base">{step.name}</span>
                              </div>
                              <div class="flex items-center gap-4">
                                <span class="text-text-weak">{formatVerificationSummary(step.verification)}</span>
                                <span class="font-mono">{step.workerInstanceId ?? "—"}</span>
                              </div>
                            </div>
                          )}
                        </For>
                      </div>
                    </Accordion.Content>
                  </Accordion.Item>
                )}
              </For>
            </Accordion>
          </div>
        </div>
      </Show>

      <Sheet
        open={!!state.editingWorkflow}
        onClose={closeSheet}
        title={state.isCreating ? "New Workflow" : `Edit ${state.editingWorkflow?.name || "Workflow"}`}
      >
        <Show when={state.editingWorkflow}>
          {(workflow) => (
            <WorkflowEditForm
              workflow={workflow()}
              isNew={state.isCreating}
              onSave={async (updated) => {
                const directory = updated.directory ?? props.defaultDirectory;
                const { directory: _directory, ...payload } = updated;

                try {
                  await writeJsonFile(sdk.client, directory, `.opencode/workforce/workflows/${payload.id}.json`, payload);
                  notifySaveSuccess(state.isCreating ? "create" : "update", `workflow ${payload.name}`);
                  closeSheet();
                  props.onRefresh();
                } catch (err) {
                  notifySaveError(`workflow ${payload.name}`, err);
                }
              }}
              onDelete={async () => {
                const directory = workflow().directory ?? props.defaultDirectory;

                try {
                  await deleteFile(sdk.client, directory, `.opencode/workforce/workflows/${workflow().id}.json`);
                  notifySaveSuccess("delete", `workflow ${workflow().name}`);
                  closeSheet();
                  props.onRefresh();
                } catch (err) {
                  notifySaveError(`workflow ${workflow().name}`, err);
                }
              }}
              onCancel={closeSheet}
            />
          )}
        </Show>
      </Sheet>
    </div>
  );
}
