import { Button } from "@opencode-ai/ui/button";
import { DropdownMenu } from "@opencode-ai/ui/dropdown-menu";
import { Icon } from "@opencode-ai/ui/icon";
import { IconButton } from "@opencode-ai/ui/icon-button";
import { Tag } from "@opencode-ai/ui/tag";
import { For, Show, createMemo } from "solid-js";
import { createStore } from "solid-js/store";
import type { RuntimeJob, Worker, WorkerInstance, WorkerStatus } from "@/pages/orchestra/orchestra-types";
import { Sheet } from "@/pages/orchestra/orchestra-sheet";
import { StatusIndicator, RuntimeTag } from "@/pages/orchestra/orchestra-tags";
import { WorkerEditForm } from "@/pages/orchestra/orchestra-worker-edit-form";
import { notifySaveError, notifySaveSuccess, readJsonFile, writeJsonFile } from "@/pages/orchestra/orchestra-utils";
import { buildJobRows } from "@/pages/orchestra/orchestra-workers-tab-helpers";
import { useGlobalSDK } from "@/context/global-sdk";

export function WorkersTab(props: {
  workers: Worker[];
  instances: WorkerInstance[];
  jobs: RuntimeJob[];
  onRefresh: () => void;
  onEditingChange: (editing: boolean) => void;
  defaultDirectory: string;
}) {
  const sdk = useGlobalSDK();
  const [state, setState] = createStore({
    editingWorker: null as Worker | null,
    isCreating: false,
  });

  const openEdit = (worker: Worker) => {
    setState({ editingWorker: worker, isCreating: false });
    props.onEditingChange(true);
  };

  const openCreate = () => {
    setState({
      editingWorker: {
        id: "",
        name: "",
        runtime: "subagent",
        model: "anthropic/claude-sonnet-4",
        directory: props.defaultDirectory,
      } as Worker,
      isCreating: true,
    });
    props.onEditingChange(true);
  };

  const closeSheet = () => {
    setState({ editingWorker: null, isCreating: false });
    props.onEditingChange(false);
  };

  const getInstanceStatus = (workerId: string): WorkerStatus | undefined => {
    const instance = props.instances.find((item) => item.workerId === workerId);
    return instance?.status;
  };

  const jobRows = createMemo(() => buildJobRows(props.jobs));

  return (
    <div class="space-y-6">
      <div class="flex items-center justify-between">
        <div class="text-14-regular text-text-weak">
          {props.workers.length} worker{props.workers.length !== 1 ? "s" : ""} configured
        </div>
        <Button variant="primary" size="small" onClick={openCreate}>
          <Icon name="plus" class="size-4" />
          Add Worker
        </Button>
      </div>

      <div class="border border-border-base rounded-lg overflow-hidden">
        <table class="w-full">
          <thead>
            <tr class="bg-surface-raised-base border-b border-border-base">
              <th class="text-left px-4 py-2 text-12-medium text-text-weak font-medium">Name</th>
              <th class="text-left px-4 py-2 text-12-medium text-text-weak font-medium hidden sm:table-cell">Runtime</th>
              <th class="text-left px-4 py-2 text-12-medium text-text-weak font-medium hidden md:table-cell">Model</th>
              <th class="text-left px-4 py-2 text-12-medium text-text-weak font-medium hidden lg:table-cell">Skills</th>
              <th class="text-left px-4 py-2 text-12-medium text-text-weak font-medium">Status</th>
              <th class="w-10 px-2"></th>
            </tr>
          </thead>
          <tbody>
            <For
              each={props.workers}
              fallback={
                <tr>
                  <td colspan="6" class="px-4 py-8 text-center text-text-weak">
                    <div class="flex flex-col items-center gap-2">
                      <Icon name="brain" class="size-8 opacity-50" />
                      <p class="text-14-regular">No workers configured</p>
                      <Button variant="secondary" size="small" onClick={openCreate}>
                        <Icon name="plus" class="size-4" />
                        Add your first worker
                      </Button>
                    </div>
                  </td>
                </tr>
              }
            >
              {(worker) => {
                const status = () => getInstanceStatus(worker.id);
                return (
                  <tr
                    class="border-b border-border-base last:border-b-0 hover:bg-surface-raised-base-hover cursor-pointer transition-colors"
                    onClick={() => openEdit(worker)}
                  >
                    <td class="px-4 py-3">
                      <div class="flex flex-col gap-0.5">
                        <span class="text-14-medium text-text-strong">{worker.name}</span>
                        <span class="text-12-regular text-text-weak">{worker.id}</span>
                      </div>
                    </td>
                    <td class="px-4 py-3 hidden sm:table-cell">
                      <RuntimeTag runtime={worker.runtime} />
                    </td>
                    <td class="px-4 py-3 hidden md:table-cell">
                      <span class="text-13-regular text-text-base font-mono truncate max-w-[200px] block">
                        {worker.model || "—"}
                      </span>
                    </td>
                    <td class="px-4 py-3 hidden lg:table-cell">
                      <div class="flex flex-wrap gap-1">
                        <Show when={worker.skills?.length} fallback={<span class="text-12-regular text-text-weaker">—</span>}>
                          <For each={worker.skills?.slice(0, 3)}>
                            {(skill) => <Tag size="normal">{skill}</Tag>}
                          </For>
                          <Show when={(worker.skills?.length ?? 0) > 3}>
                            <Tag size="normal">+{(worker.skills?.length ?? 0) - 3}</Tag>
                          </Show>
                        </Show>
                      </div>
                    </td>
                    <td class="px-4 py-3">
                      <StatusIndicator status={status()} />
                    </td>
                    <td class="px-2 py-3" onClick={(event) => event.stopPropagation()}>
                      <DropdownMenu>
                        <DropdownMenu.Trigger as={IconButton} icon="overflow-menu-horizontal" variant="ghost" />
                        <DropdownMenu.Portal>
                          <DropdownMenu.Content>
                            <DropdownMenu.Item onSelect={() => openEdit(worker)}>
                              <Icon name="pencil-line" class="size-4" />
                              <DropdownMenu.ItemLabel>Edit</DropdownMenu.ItemLabel>
                            </DropdownMenu.Item>
                            <DropdownMenu.Item onSelect={() => navigator.clipboard.writeText(JSON.stringify(worker, null, 2))}>
                              <Icon name="copy" class="size-4" />
                              <DropdownMenu.ItemLabel>Copy JSON</DropdownMenu.ItemLabel>
                            </DropdownMenu.Item>
                            <DropdownMenu.Separator />
                            <DropdownMenu.Item class="text-text-critical-base" onSelect={() => console.log("Delete", worker.id)}>
                              <Icon name="circle-x" class="size-4" />
                              <DropdownMenu.ItemLabel>Delete</DropdownMenu.ItemLabel>
                            </DropdownMenu.Item>
                          </DropdownMenu.Content>
                        </DropdownMenu.Portal>
                      </DropdownMenu>
                    </td>
                  </tr>
                );
              }}
            </For>
          </tbody>
        </table>
      </div>

      <Show when={props.instances.length > 0}>
        <div class="space-y-3">
          <h3 class="text-14-medium text-text-base">Running Instances ({props.instances.length})</h3>
          <div class="border border-border-base rounded-lg overflow-hidden">
            <table class="w-full">
              <thead>
                <tr class="bg-surface-raised-base border-b border-border-base">
                  <th class="text-left px-4 py-2 text-12-medium text-text-weak font-medium">Worker</th>
                  <th class="text-left px-4 py-2 text-12-medium text-text-weak font-medium hidden sm:table-cell">Instance ID</th>
                  <th class="text-left px-4 py-2 text-12-medium text-text-weak font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                <For each={props.instances}>
                  {(instance) => (
                    <tr class="border-b border-border-base last:border-b-0">
                      <td class="px-4 py-3 text-14-medium text-text-strong">{instance.workerId}</td>
                      <td class="px-4 py-3 text-12-regular text-text-weak font-mono hidden sm:table-cell">{instance.instanceId.slice(0, 12)}...</td>
                      <td class="px-4 py-3"><StatusIndicator status={instance.status} /></td>
                    </tr>
                  )}
                </For>
              </tbody>
            </table>
          </div>
        </div>
      </Show>

      <Show when={jobRows().length > 0}>
        <div class="space-y-3">
          <h3 class="text-14-medium text-text-base">Running Jobs ({jobRows().length})</h3>
          <div class="border border-border-base rounded-lg overflow-hidden">
            <table class="w-full">
              <thead>
                <tr class="bg-surface-raised-base border-b border-border-base">
                  <th class="text-left px-4 py-2 text-12-medium text-text-weak font-medium">Job ID</th>
                  <th class="text-left px-4 py-2 text-12-medium text-text-weak font-medium hidden sm:table-cell">Worker</th>
                  <th class="text-left px-4 py-2 text-12-medium text-text-weak font-medium hidden md:table-cell">Instance</th>
                  <th class="text-left px-4 py-2 text-12-medium text-text-weak font-medium">Status</th>
                  <th class="text-left px-4 py-2 text-12-medium text-text-weak font-medium hidden lg:table-cell">Created</th>
                </tr>
              </thead>
              <tbody>
                <For each={jobRows()}>
                  {(job) => (
                    <tr class="border-b border-border-base last:border-b-0">
                      <td class="px-4 py-3 text-12-regular text-text-weak font-mono">
                        {job.sessionHref ? (
                          <a class="text-text-weak underline" href={job.sessionHref}>
                            {job.jobId}
                          </a>
                        ) : (
                          job.jobId
                        )}
                      </td>
                      <td class="px-4 py-3 text-12-regular text-text-weak hidden sm:table-cell">{job.workerId ?? "—"}</td>
                      <td class="px-4 py-3 text-12-regular text-text-weak font-mono hidden md:table-cell">{job.workerInstanceId ?? "—"}</td>
                      <td class="px-4 py-3"><Tag size="normal">{job.statusLabel}</Tag></td>
                      <td class="px-4 py-3 text-12-regular text-text-weak hidden lg:table-cell">{job.createdAt}</td>
                    </tr>
                  )}
                </For>
              </tbody>
            </table>
          </div>
        </div>
      </Show>

      <Sheet
        open={!!state.editingWorker}
        onClose={closeSheet}
        title={state.isCreating ? "New Worker" : `Edit ${state.editingWorker?.name || "Worker"}`}
      >
        <Show when={state.editingWorker}>
          {(worker) => (
            <WorkerEditForm
              worker={worker()}
              isNew={state.isCreating}
              onSave={async (updated) => {
                const directory = updated.directory ?? props.defaultDirectory;
                const { directory: _directory, ...payload } = updated;

                try {
                  const data = await readJsonFile<{ workers: Worker[] }>(sdk.client, directory, ".opencode/workforce/workers.json", { workers: [] });
                  const workers = data.workers ?? [];
                  const index = workers.findIndex((entry) => entry.id === payload.id);
                  if (index >= 0) {
                    workers[index] = payload;
                  } else {
                    workers.push(payload);
                  }
                  await writeJsonFile(sdk.client, directory, ".opencode/workforce/workers.json", { workers });
                  notifySaveSuccess(state.isCreating ? "create" : "update", `worker ${payload.name}`);
                  closeSheet();
                  props.onRefresh();
                } catch (err) {
                  notifySaveError(`worker ${payload.name}`, err);
                }
              }}
              onDelete={async () => {
                const directory = worker().directory ?? props.defaultDirectory;

                try {
                  const data = await readJsonFile<{ workers: Worker[] }>(sdk.client, directory, ".opencode/workforce/workers.json", { workers: [] });
                  const workers = (data.workers ?? []).filter((entry) => entry.id !== worker().id);
                  await writeJsonFile(sdk.client, directory, ".opencode/workforce/workers.json", { workers });
                  notifySaveSuccess("delete", `worker ${worker().name}`);
                  closeSheet();
                  props.onRefresh();
                } catch (err) {
                  notifySaveError(`worker ${worker().name}`, err);
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
