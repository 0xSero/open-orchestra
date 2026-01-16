import { Button } from "@opencode-ai/ui/button";
import { Icon } from "@opencode-ai/ui/icon";
import { Select } from "@opencode-ai/ui/select";
import { Tag } from "@opencode-ai/ui/tag";
import { TextField } from "@opencode-ai/ui/text-field";
import { For, Show } from "solid-js";
import { createStore } from "solid-js/store";
import type { Workflow } from "@/pages/orchestra/orchestra-types";
import { slugify } from "@/pages/orchestra/orchestra-utils";

export function WorkflowEditForm(props: {
  workflow: Workflow;
  isNew: boolean;
  onSave: (workflow: Workflow) => void;
  onDelete: () => void;
  onCancel: () => void;
}) {
  const [store, setStore] = createStore({
    id: props.workflow.id,
    name: props.workflow.name,
    description: props.workflow.description || "",
    maxIterations: props.workflow.iterations?.max || 1,
    iterationMode: props.workflow.iterations?.mode || "fixed" as const,
  });

  const handleSubmit = (e: SubmitEvent) => {
    e.preventDefault();
    const workflow: Workflow = {
      id: store.id || slugify(store.name),
      name: store.name,
      description: store.description || undefined,
      iterations: { max: store.maxIterations, mode: store.iterationMode },
      steps: props.workflow.steps || [],
    };
    props.onSave(workflow);
  };

  const copyToClipboard = () => {
    const workflow: Workflow = {
      id: store.id || slugify(store.name),
      name: store.name,
      description: store.description || undefined,
      iterations: { max: store.maxIterations, mode: store.iterationMode },
      steps: props.workflow.steps || [],
    };
    navigator.clipboard.writeText(JSON.stringify(workflow, null, 2));
  };

  return (
    <form onSubmit={handleSubmit} class="flex flex-col h-full">
      <div class="flex-1 p-4 space-y-4 overflow-y-auto">
        <TextField
          label="Name"
          placeholder="Workflow name"
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
          placeholder="What this workflow does..."
          value={store.description}
          onChange={(value) => setStore("description", value)}
          multiline
        />

        <div class="grid grid-cols-2 gap-4">
          <TextField
            type="number"
            label="Max Iterations"
            value={String(store.maxIterations)}
            onChange={(value) => setStore("maxIterations", parseInt(value) || 1)}
          />
          <div class="space-y-1.5">
            <label class="text-12-medium text-text-weak">Iteration Mode</label>
            <Select
              options={["fixed", "until_verified"] as const}
              current={store.iterationMode}
              value={(value) => value}
              label={(value) => value === "fixed" ? "Fixed" : "Until Verified"}
              onSelect={(value) => value && setStore("iterationMode", value)}
              variant="secondary"
              class="w-full"
            />
          </div>
        </div>

        <div class="space-y-2">
          <label class="text-12-medium text-text-weak">Steps ({props.workflow.steps?.length || 0})</label>
          <div class="border border-border-base rounded-lg p-3 bg-surface-raised-base">
            <Show
              when={props.workflow.steps?.length}
              fallback={<p class="text-12-regular text-text-weaker text-center py-4">No steps defined yet</p>}
            >
              <For each={props.workflow.steps}>
                {(step, index) => (
                  <div class="flex items-center gap-2 py-1.5 border-b border-border-base last:border-b-0">
                    <span class="text-12-medium text-text-weak w-6">{index() + 1}.</span>
                    <span class="text-13-regular text-text-base flex-1">{step.name}</span>
                    <Tag size="normal">{step.worker}</Tag>
                  </div>
                )}
              </For>
            </Show>
          </div>
        </div>
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
            Delete Workflow
          </Button>
        </Show>
      </div>
    </form>
  );
}
