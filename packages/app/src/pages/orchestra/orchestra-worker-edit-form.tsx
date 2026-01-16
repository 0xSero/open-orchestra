import { Button } from "@opencode-ai/ui/button";
import { Icon } from "@opencode-ai/ui/icon";
import { Select } from "@opencode-ai/ui/select";
import { TextField } from "@opencode-ai/ui/text-field";
import { Show, createMemo } from "solid-js";
import { createStore } from "solid-js/store";
import type { Worker, WorkerRuntime } from "@/pages/orchestra/orchestra-types";
import { ModelSelector } from "@/pages/orchestra/orchestra-model-selector";
import { slugify } from "@/pages/orchestra/orchestra-utils";

export function WorkerEditForm(props: {
  worker: Worker;
  isNew: boolean;
  onSave: (worker: Worker) => void;
  onDelete: () => void;
  onCancel: () => void;
}) {
  const [store, setStore] = createStore({
    id: props.worker.id,
    name: props.worker.name,
    runtime: props.worker.runtime,
    model: props.worker.model || "",
    description: props.worker.description || "",
    prompt: props.worker.prompt || "",
    skills: props.worker.skills?.join(", ") || "",
  });

  createMemo(() => {
    if (props.isNew && store.name && !store.id) {
      setStore("id", slugify(store.name));
    }
  });

  const handleSubmit = (e: SubmitEvent) => {
    e.preventDefault();
    const worker: Worker = {
      id: store.id || slugify(store.name),
      name: store.name,
      runtime: store.runtime,
      model: store.model || undefined,
      description: store.description || undefined,
      prompt: store.prompt || undefined,
      skills: store.skills ? store.skills.split(",").map((skill) => skill.trim()).filter(Boolean) : undefined,
    };
    props.onSave(worker);
  };

  const copyToClipboard = () => {
    const worker: Worker = {
      id: store.id || slugify(store.name),
      name: store.name,
      runtime: store.runtime,
      model: store.model || undefined,
      description: store.description || undefined,
      prompt: store.prompt || undefined,
      skills: store.skills ? store.skills.split(",").map((skill) => skill.trim()).filter(Boolean) : undefined,
    };
    navigator.clipboard.writeText(JSON.stringify(worker, null, 2));
  };

  return (
    <form onSubmit={handleSubmit} class="flex flex-col h-full">
      <div class="flex-1 p-4 space-y-4 overflow-y-auto">
        <TextField
          label="Name"
          placeholder="Worker name"
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

        <div class="space-y-1.5">
          <label class="text-12-medium text-text-weak">Runtime</label>
          <Select
            options={["subagent", "agent", "server"] as WorkerRuntime[]}
            current={store.runtime}
            value={(value) => value}
            label={(value) => value.charAt(0).toUpperCase() + value.slice(1)}
            onSelect={(value) => value && setStore("runtime", value)}
            variant="secondary"
            class="w-full"
          />
        </div>

        <div class="space-y-1.5">
          <label class="text-12-medium text-text-weak">Model</label>
          <ModelSelector
            value={store.model}
            onChange={(value) => setStore("model", value)}
          />
        </div>

        <TextField
          label="Description"
          placeholder="What this worker does..."
          value={store.description}
          onChange={(value) => setStore("description", value)}
          multiline
        />

        <TextField
          label="Skills"
          placeholder="skill1, skill2, skill3"
          value={store.skills}
          onChange={(value) => setStore("skills", value)}
        />

        <TextField
          label="System Prompt"
          placeholder="Instructions for this worker..."
          value={store.prompt}
          onChange={(value) => setStore("prompt", value)}
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
            Delete Worker
          </Button>
        </Show>
      </div>
    </form>
  );
}
