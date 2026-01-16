import { Button } from "@opencode-ai/ui/button";
import { Icon } from "@opencode-ai/ui/icon";
import { Select } from "@opencode-ai/ui/select";
import { Show, createSignal } from "solid-js";
import type { LinearWorkflowState, LinearProject, LinearUser } from "@/pages/orchestra/orchestra-types";
import { Sheet } from "@/pages/orchestra/orchestra-sheet";

const PRIORITIES = [
  { value: 0, label: "No priority", icon: "minus" as const },
  { value: 1, label: "Urgent", icon: "alert-triangle" as const },
  { value: 2, label: "High", icon: "chevron-up" as const },
  { value: 3, label: "Medium", icon: "minus" as const },
  { value: 4, label: "Low", icon: "chevron-down" as const },
];

export function IssueCreateSheet(props: {
  open: boolean;
  states: LinearWorkflowState[];
  projects: LinearProject[];
  users: LinearUser[];
  onClose: () => void;
  onCreate: (input: {
    title: string;
    description?: string;
    priority?: number;
    stateId?: string;
    assigneeId?: string;
    projectId?: string;
  }) => Promise<void>;
}) {
  const [title, setTitle] = createSignal("");
  const [description, setDescription] = createSignal("");
  const [priority, setPriority] = createSignal(0);
  const [stateId, setStateId] = createSignal<string | undefined>(undefined);
  const [assigneeId, setAssigneeId] = createSignal<string | undefined>(undefined);
  const [projectId, setProjectId] = createSignal<string | undefined>(undefined);
  const [isCreating, setIsCreating] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);

  // Get default state (first "unstarted" or "backlog" state)
  const defaultState = () => {
    const backlog = props.states.find((s) => s.type === "backlog");
    const unstarted = props.states.find((s) => s.type === "unstarted");
    return backlog || unstarted || props.states[0];
  };

  function resetForm() {
    setTitle("");
    setDescription("");
    setPriority(0);
    setStateId(undefined);
    setAssigneeId(undefined);
    setProjectId(undefined);
    setError(null);
  }

  async function handleSubmit() {
    if (!title().trim()) {
      setError("Title is required");
      return;
    }

    setIsCreating(true);
    setError(null);

    try {
      await props.onCreate({
        title: title().trim(),
        description: description().trim() || undefined,
        priority: priority() || undefined,
        stateId: stateId() || defaultState()?.id,
        assigneeId: assigneeId() || undefined,
        projectId: projectId() || undefined,
      });
      resetForm();
      props.onClose();
    } catch (err: any) {
      setError(err?.message || "Failed to create issue");
    } finally {
      setIsCreating(false);
    }
  }

  function handleClose() {
    resetForm();
    props.onClose();
  }

  return (
    <Sheet open={props.open} onClose={handleClose} title="Create Issue">
      <div class="p-4 space-y-4">
        {/* Error */}
        <Show when={error()}>
          <div class="p-3 bg-surface-critical-base rounded-lg text-14-regular text-text-critical-base">
            {error()}
          </div>
        </Show>

        {/* Title */}
        <div class="space-y-2">
          <label class="text-12-medium text-text-weak">Title *</label>
          <input
            type="text"
            value={title()}
            onInput={(e) => setTitle(e.currentTarget.value)}
            placeholder="Issue title..."
            class="w-full px-3 py-2 bg-surface-base border border-border-base rounded-lg text-14-regular text-text-base focus:outline-none focus:ring-2 focus:ring-text-accent"
            autofocus
          />
        </div>

        {/* Description */}
        <div class="space-y-2">
          <label class="text-12-medium text-text-weak">Description</label>
          <textarea
            value={description()}
            onInput={(e) => setDescription(e.currentTarget.value)}
            placeholder="Add a description..."
            rows={4}
            class="w-full px-3 py-2 bg-surface-base border border-border-base rounded-lg text-14-regular text-text-base focus:outline-none focus:ring-2 focus:ring-text-accent resize-none"
          />
        </div>

        {/* Status */}
        <div class="space-y-2">
          <label class="text-12-medium text-text-weak">Status</label>
          <Select
            options={props.states}
            current={props.states.find((s) => s.id === stateId()) || defaultState()}
            value={(state) => state.id}
            label={(state) => state.name}
            onSelect={(state) => setStateId(state?.id)}
            variant="secondary"
            class="w-full"
          />
        </div>

        {/* Priority */}
        <div class="space-y-2">
          <label class="text-12-medium text-text-weak">Priority</label>
          <Select
            options={PRIORITIES}
            current={PRIORITIES.find((p) => p.value === priority()) || PRIORITIES[0]}
            value={(p) => String(p.value)}
            label={(p) => p.label}
            onSelect={(p) => setPriority(p?.value || 0)}
            variant="secondary"
            class="w-full"
          />
        </div>

        {/* Assignee */}
        <Show when={props.users.length > 0}>
          <div class="space-y-2">
            <label class="text-12-medium text-text-weak">Assignee</label>
            <Select
              options={[{ id: "", name: "Unassigned", email: "" }, ...props.users]}
              current={props.users.find((u) => u.id === assigneeId()) || { id: "", name: "Unassigned", email: "" }}
              value={(user) => user.id}
              label={(user) => user.name}
              onSelect={(user) => setAssigneeId(user?.id || undefined)}
              variant="secondary"
              class="w-full"
            />
          </div>
        </Show>

        {/* Project */}
        <Show when={props.projects.length > 0}>
          <div class="space-y-2">
            <label class="text-12-medium text-text-weak">Project</label>
            <Select
              options={[{ id: "", name: "No project", state: "" }, ...props.projects]}
              current={props.projects.find((p) => p.id === projectId()) || { id: "", name: "No project", state: "" }}
              value={(project) => project.id}
              label={(project) => project.name}
              onSelect={(project) => setProjectId(project?.id || undefined)}
              variant="secondary"
              class="w-full"
            />
          </div>
        </Show>

        {/* Actions */}
        <div class="flex gap-2 pt-4 border-t border-border-base">
          <Button
            type="button"
            variant="primary"
            size="small"
            onClick={() => {
              console.log("[IssueCreateSheet] Create button clicked");
              handleSubmit();
            }}
            disabled={isCreating() || !title().trim()}
            class="flex-1"
          >
            <Show when={isCreating()} fallback={<Icon name="plus" class="size-4" />}>
              <div class="size-4 animate-spin border-2 border-current border-t-transparent rounded-full" />
            </Show>
            {isCreating() ? "Creating..." : "Create Issue"}
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="small"
            onClick={handleClose}
            disabled={isCreating()}
          >
            Cancel
          </Button>
        </div>
      </div>
    </Sheet>
  );
}
