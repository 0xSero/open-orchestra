import { Button } from "@opencode-ai/ui/button";
import { DropdownMenu } from "@opencode-ai/ui/dropdown-menu";
import { Icon } from "@opencode-ai/ui/icon";
import { IconButton } from "@opencode-ai/ui/icon-button";
import { For, Show, createMemo } from "solid-js";
import { createStore } from "solid-js/store";
import type { Integration, IntegrationInstance } from "@/pages/orchestra/orchestra-types";
import { IntegrationEditForm } from "@/pages/orchestra/orchestra-integration-edit-form";
import { Sheet } from "@/pages/orchestra/orchestra-sheet";
import { IntegrationStatusIndicator, IntegrationTypeTag } from "@/pages/orchestra/orchestra-tags";
import { notifySaveError, notifySaveSuccess, readJsonFile, writeJsonFile } from "@/pages/orchestra/orchestra-utils";
import { mapIntegrationInstances } from "@/pages/orchestra/orchestra-servers-tab-helpers";
import { useGlobalSDK } from "@/context/global-sdk";

export function ServersTab(props: {
  integrations: Integration[];
  instances: IntegrationInstance[];
  onRefresh: () => void;
  onEditingChange: (editing: boolean) => void;
  defaultDirectory: string;
}) {
  const sdk = useGlobalSDK();
  const [state, setState] = createStore({
    editingIntegration: null as Integration | null,
    isCreating: false,
  });

  const openEdit = (integration: Integration) => {
    setState({ editingIntegration: integration, isCreating: false });
    props.onEditingChange(true);
  };

  const openCreate = () => {
    setState({
      editingIntegration: { id: "", name: "", directory: props.defaultDirectory },
      isCreating: true,
    });
    props.onEditingChange(true);
  };

  const closeSheet = () => {
    setState({ editingIntegration: null, isCreating: false });
    props.onEditingChange(false);
  };

  const getInstanceStatus = (integrationId: string) => {
    return props.instances.find((item) => item.integrationId === integrationId)?.status;
  };
  const instanceRows = createMemo(() => mapIntegrationInstances(props.instances));

  return (
    <div class="space-y-6">
      <div class="flex items-center justify-between">
        <div class="text-14-regular text-text-weak">
          {props.integrations.length} integration{props.integrations.length !== 1 ? "s" : ""} configured
        </div>
        <Button variant="primary" size="small" onClick={openCreate}>
          <Icon name="plus" class="size-4" />
          Add Integration
        </Button>
      </div>

      <div class="border border-border-base rounded-lg overflow-hidden">
        <table class="w-full">
          <thead>
            <tr class="bg-surface-raised-base border-b border-border-base">
              <th class="text-left px-4 py-2 text-12-medium text-text-weak font-medium">Name</th>
              <th class="text-left px-4 py-2 text-12-medium text-text-weak font-medium hidden sm:table-cell">Type</th>
              <th class="text-left px-4 py-2 text-12-medium text-text-weak font-medium hidden md:table-cell">Command</th>
              <th class="text-left px-4 py-2 text-12-medium text-text-weak font-medium">Status</th>
              <th class="w-10 px-2"></th>
            </tr>
          </thead>
          <tbody>
            <For
              each={props.integrations}
              fallback={
                <tr>
                  <td colspan="5" class="px-4 py-8 text-center text-text-weak">
                    <div class="flex flex-col items-center gap-2">
                      <Icon name="server" class="size-8 opacity-50" />
                      <p class="text-14-regular">No integrations configured</p>
                      <Button variant="secondary" size="small" onClick={openCreate}>
                        <Icon name="plus" class="size-4" />
                        Add your first integration
                      </Button>
                    </div>
                  </td>
                </tr>
              }
            >
              {(integration) => {
                const status = () => getInstanceStatus(integration.id);
                return (
                  <tr
                    class="border-b border-border-base last:border-b-0 hover:bg-surface-raised-base-hover cursor-pointer transition-colors"
                    onClick={() => openEdit(integration)}
                  >
                    <td class="px-4 py-3">
                      <div class="flex flex-col gap-0.5">
                        <span class="text-14-medium text-text-strong">{integration.name}</span>
                        <span class="text-12-regular text-text-weak">{integration.id}</span>
                      </div>
                    </td>
                    <td class="px-4 py-3 hidden sm:table-cell">
                      <IntegrationTypeTag type={integration.process?.type || "mcp"} />
                    </td>
                    <td class="px-4 py-3 hidden md:table-cell">
                      <span class="text-12-regular text-text-weak font-mono truncate max-w-[200px] block">
                        {integration.process?.command || "—"}
                      </span>
                    </td>
                    <td class="px-4 py-3">
                      <IntegrationStatusIndicator status={status()} />
                    </td>
                    <td class="px-2 py-3" onClick={(event) => event.stopPropagation()}>
                      <DropdownMenu>
                        <DropdownMenu.Trigger as={IconButton} icon="overflow-menu-horizontal" variant="ghost" />
                        <DropdownMenu.Portal>
                          <DropdownMenu.Content>
                            <DropdownMenu.Item onSelect={() => openEdit(integration)}>
                              <Icon name="pencil-line" class="size-4" />
                              <DropdownMenu.ItemLabel>Edit</DropdownMenu.ItemLabel>
                            </DropdownMenu.Item>
                            <DropdownMenu.Item onSelect={() => navigator.clipboard.writeText(JSON.stringify(integration, null, 2))}>
                              <Icon name="copy" class="size-4" />
                              <DropdownMenu.ItemLabel>Copy JSON</DropdownMenu.ItemLabel>
                            </DropdownMenu.Item>
                            <DropdownMenu.Separator />
                            <DropdownMenu.Item class="text-text-critical-base" onSelect={() => console.log("Delete", integration.id)}>
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

      <Show when={instanceRows().length > 0}>
        <div class="space-y-3">
          <h3 class="text-14-medium text-text-base">Running Instances ({instanceRows().length})</h3>
          <div class="border border-border-base rounded-lg overflow-hidden">
            <table class="w-full">
              <thead>
                <tr class="bg-surface-raised-base border-b border-border-base">
                  <th class="text-left px-4 py-2 text-12-medium text-text-weak font-medium">Integration</th>
                  <th class="text-left px-4 py-2 text-12-medium text-text-weak font-medium hidden sm:table-cell">PID</th>
                  <th class="text-left px-4 py-2 text-12-medium text-text-weak font-medium hidden md:table-cell">URL</th>
                  <th class="text-left px-4 py-2 text-12-medium text-text-weak font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                <For each={instanceRows()}>
                  {(instance) => (
                    <tr class="border-b border-border-base last:border-b-0">
                      <td class="px-4 py-3 text-14-medium text-text-strong">{instance.integrationId}</td>
                      <td class="px-4 py-3 text-12-regular text-text-weak font-mono hidden sm:table-cell">{instance.pidLabel}</td>
                      <td class="px-4 py-3 text-12-regular text-text-weak font-mono hidden md:table-cell truncate max-w-[200px]">{instance.urlLabel}</td>
                      <td class="px-4 py-3"><IntegrationStatusIndicator status={instance.status} /></td>
                    </tr>
                  )}
                </For>
              </tbody>
            </table>
          </div>
        </div>
      </Show>

      <Sheet
        open={!!state.editingIntegration}
        onClose={closeSheet}
        title={state.isCreating ? "New Integration" : `Edit ${state.editingIntegration?.name || "Integration"}`}
      >
        <Show when={state.editingIntegration}>
          {(integration) => (
            <IntegrationEditForm
              integration={integration()}
              isNew={state.isCreating}
              onSave={async (updated) => {
                const directory = updated.directory ?? props.defaultDirectory;
                const { directory: _directory, ...payload } = updated;

                try {
                  const data = await readJsonFile<{ integrations: Integration[] }>(sdk.client, directory, ".opencode/workforce/integrations.json", { integrations: [] });
                  const integrations = data.integrations ?? [];
                  const index = integrations.findIndex((entry) => entry.id === payload.id);
                  if (index >= 0) {
                    integrations[index] = payload;
                  } else {
                    integrations.push(payload);
                  }
                  await writeJsonFile(sdk.client, directory, ".opencode/workforce/integrations.json", { integrations });
                  notifySaveSuccess(state.isCreating ? "create" : "update", `integration ${payload.name}`);
                  closeSheet();
                  props.onRefresh();
                } catch (err) {
                  notifySaveError(`integration ${payload.name}`, err);
                }
              }}
              onDelete={async () => {
                const directory = integration().directory ?? props.defaultDirectory;

                try {
                  const data = await readJsonFile<{ integrations: Integration[] }>(sdk.client, directory, ".opencode/workforce/integrations.json", { integrations: [] });
                  const integrations = (data.integrations ?? []).filter((entry) => entry.id !== integration().id);
                  await writeJsonFile(sdk.client, directory, ".opencode/workforce/integrations.json", { integrations });
                  notifySaveSuccess("delete", `integration ${integration().name}`);
                  closeSheet();
                  props.onRefresh();
                } catch (err) {
                  notifySaveError(`integration ${integration().name}`, err);
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
