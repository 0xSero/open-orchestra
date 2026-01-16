import { Button } from "@opencode-ai/ui/button";
import { Icon } from "@opencode-ai/ui/icon";
import { Select } from "@opencode-ai/ui/select";
import { TextField } from "@opencode-ai/ui/text-field";
import { Show } from "solid-js";
import { createStore } from "solid-js/store";
import type { Integration } from "@/pages/orchestra/orchestra-types";
import { slugify } from "@/pages/orchestra/orchestra-utils";

export function IntegrationEditForm(props: {
  integration: Integration;
  isNew: boolean;
  onSave: (integration: Integration) => void;
  onDelete: () => void;
  onCancel: () => void;
}) {
  const [store, setStore] = createStore({
    id: props.integration.id,
    name: props.integration.name,
    description: props.integration.description || "",
    processType: props.integration.process?.type || "mcp" as const,
    command: props.integration.process?.command || "",
    instructions: props.integration.instructions || "",
  });

  const handleSubmit = (e: SubmitEvent) => {
    e.preventDefault();
    const integration: Integration = {
      id: store.id || slugify(store.name),
      name: store.name,
      description: store.description || undefined,
      process: store.command ? {
        type: store.processType,
        command: store.command,
      } : undefined,
      instructions: store.instructions || undefined,
    };
    props.onSave(integration);
  };

  const copyToClipboard = () => {
    const integration: Integration = {
      id: store.id || slugify(store.name),
      name: store.name,
      description: store.description || undefined,
      process: store.command ? {
        type: store.processType,
        command: store.command,
      } : undefined,
      instructions: store.instructions || undefined,
    };
    navigator.clipboard.writeText(JSON.stringify(integration, null, 2));
  };

  return (
    <form onSubmit={handleSubmit} class="flex flex-col h-full">
      <div class="flex-1 p-4 space-y-4 overflow-y-auto">
        <TextField
          label="Name"
          placeholder="Integration name"
          value={store.name}
          onChange={(value) => setStore("name", value)}
          autofocus
        />

        <TextField
          label="ID"
          placeholder="Auto-generated from name"
          value={store.id}
          onChange={(value) => setStore("id", value)}
          disabled={!props.isNew}
        />

        <TextField
          label="Description"
          placeholder="What this integration provides..."
          value={store.description}
          onChange={(value) => setStore("description", value)}
          multiline
        />

        <div class="space-y-1.5">
          <label class="text-12-medium text-text-weak">Type</label>
          <Select
            options={["mcp", "http", "stdio"] as const}
            current={store.processType}
            value={(value) => value}
            label={(value) => value.toUpperCase()}
            onSelect={(value) => value && setStore("processType", value)}
            variant="secondary"
            class="w-full"
          />
        </div>

        <TextField
          label="Command"
          placeholder="e.g., npx -y @modelcontextprotocol/server-everything"
          value={store.command}
          onChange={(value) => setStore("command", value)}
        />

        <TextField
          label="Instructions"
          placeholder="Usage instructions for workers..."
          value={store.instructions}
          onChange={(value) => setStore("instructions", value)}
          multiline
        />
      </div>

      <div class="border-t border-border-base p-4 space-y-3 shrink-0">
        <div class="flex gap-2">
          <Button type="button" variant="ghost" class="flex-1" onClick={props.onCancel}>
            Cancel
          </Button>
          <Button type="button" variant="secondary" onClick={copyToClipboard}>
            <Icon name="copy" class="size-4" />
            Copy JSON
          </Button>
          <Button type="submit" variant="primary" class="flex-1">
            {props.isNew ? "Create" : "Save"}
          </Button>
        </div>

        <Show when={!props.isNew}>
          <Button type="button" variant="ghost" class="w-full text-text-critical-base" onClick={props.onDelete}>
            <Icon name="circle-x" class="size-4" />
            Delete Integration
          </Button>
        </Show>
      </div>
    </form>
  );
}
