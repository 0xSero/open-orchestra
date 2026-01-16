import { Button } from "@opencode-ai/ui/button";
import { Icon } from "@opencode-ai/ui/icon";
import { Select } from "@opencode-ai/ui/select";
import { TextField } from "@opencode-ai/ui/text-field";
import { Show } from "solid-js";
import { createStore } from "solid-js/store";
import type { Ticket, TicketStatus, TicketAssignment, Worker, Workflow } from "@/pages/orchestra/orchestra-types";
import { generateTicketId } from "@/pages/orchestra/orchestra-tickets-tab-helpers";

const TICKET_STATUSES: TicketStatus[] = ["open", "in_progress", "blocked", "done", "canceled"];

const STATUS_LABELS: Record<TicketStatus, string> = {
  open: "Open",
  in_progress: "In Progress",
  blocked: "Blocked",
  done: "Done",
  canceled: "Canceled",
};

export function TicketEditForm(props: {
  ticket: Ticket;
  isNew: boolean;
  workers: Worker[];
  workflows: Workflow[];
  onSave: (ticket: Ticket) => void;
  onDelete: () => void;
  onCancel: () => void;
}) {
  const [store, setStore] = createStore({
    id: props.ticket.id,
    title: props.ticket.title,
    description: props.ticket.description || "",
    status: props.ticket.status,
    assignmentKind: props.ticket.assignment?.kind || ("none" as "none" | "worker" | "workflow"),
    assignmentId: props.ticket.assignment
      ? props.ticket.assignment.kind === "worker"
        ? props.ticket.assignment.workerId
        : props.ticket.assignment.workflowId
      : "",
    tags: props.ticket.tags?.join(", ") || "",
  });

  const assignmentOptions = () => {
    if (store.assignmentKind === "worker") {
      return props.workers.map((w) => ({ id: w.id, name: w.name }));
    }
    if (store.assignmentKind === "workflow") {
      return props.workflows.map((w) => ({ id: w.id, name: w.name }));
    }
    return [];
  };

  const handleSubmit = (e: SubmitEvent) => {
    e.preventDefault();
    const now = Date.now();

    let assignment: TicketAssignment | undefined;
    if (store.assignmentKind === "worker" && store.assignmentId) {
      assignment = { kind: "worker", workerId: store.assignmentId };
    } else if (store.assignmentKind === "workflow" && store.assignmentId) {
      assignment = { kind: "workflow", workflowId: store.assignmentId };
    }

    const ticket: Ticket = {
      id: store.id || generateTicketId(),
      title: store.title,
      description: store.description || undefined,
      status: store.status,
      assignment,
      tags: store.tags ? store.tags.split(",").map((tag) => tag.trim()).filter(Boolean) : undefined,
      createdAt: props.ticket.createdAt || now,
      updatedAt: now,
      linear: props.ticket.linear,
      directory: props.ticket.directory,
    };
    props.onSave(ticket);
  };

  const copyToClipboard = () => {
    let assignment: TicketAssignment | undefined;
    if (store.assignmentKind === "worker" && store.assignmentId) {
      assignment = { kind: "worker", workerId: store.assignmentId };
    } else if (store.assignmentKind === "workflow" && store.assignmentId) {
      assignment = { kind: "workflow", workflowId: store.assignmentId };
    }

    const ticket: Partial<Ticket> = {
      id: store.id,
      title: store.title,
      description: store.description || undefined,
      status: store.status,
      assignment,
      tags: store.tags ? store.tags.split(",").map((tag) => tag.trim()).filter(Boolean) : undefined,
    };
    navigator.clipboard.writeText(JSON.stringify(ticket, null, 2));
  };

  return (
    <form onSubmit={handleSubmit} class="flex flex-col h-full">
      <div class="flex-1 p-4 space-y-4 overflow-y-auto">
        <TextField
          label="Title"
          placeholder="Ticket title"
          value={store.title}
          onChange={(value) => setStore("title", value)}
          autofocus
        />

        <Show when={!props.isNew}>
          <TextField
            label="ID"
            value={store.id}
            disabled
          />
        </Show>

        <div class="space-y-1.5">
          <label class="text-12-medium text-text-weak">Status</label>
          <Select
            options={TICKET_STATUSES}
            current={store.status}
            value={(value) => value}
            label={(value) => STATUS_LABELS[value]}
            onSelect={(value) => value && setStore("status", value)}
            variant="secondary"
            class="w-full"
          />
        </div>

        <TextField
          label="Description"
          placeholder="Ticket description..."
          value={store.description}
          onChange={(value) => setStore("description", value)}
          multiline
        />

        <div class="space-y-1.5">
          <label class="text-12-medium text-text-weak">Assignment Type</label>
          <Select
            options={["none", "worker", "workflow"] as const}
            current={store.assignmentKind}
            value={(value) => value}
            label={(value) => value === "none" ? "None" : value.charAt(0).toUpperCase() + value.slice(1)}
            onSelect={(value) => {
              if (value) {
                setStore("assignmentKind", value);
                setStore("assignmentId", "");
              }
            }}
            variant="secondary"
            class="w-full"
          />
        </div>

        <Show when={store.assignmentKind !== "none" && assignmentOptions().length > 0}>
          <div class="space-y-1.5">
            <label class="text-12-medium text-text-weak">
              Assign to {store.assignmentKind === "worker" ? "Worker" : "Workflow"}
            </label>
            <Select
              options={assignmentOptions()}
              current={assignmentOptions().find((o) => o.id === store.assignmentId)}
              value={(item) => item.id}
              label={(item) => item.name}
              onSelect={(item) => item && setStore("assignmentId", item.id)}
              variant="secondary"
              class="w-full"
              placeholder={`Select ${store.assignmentKind}...`}
            />
          </div>
        </Show>

        <TextField
          label="Tags"
          placeholder="tag1, tag2, tag3"
          value={store.tags}
          onChange={(value) => setStore("tags", value)}
        />

        <Show when={props.ticket.linear}>
          <div class="p-3 bg-surface-raised-base rounded-lg space-y-2">
            <div class="flex items-center gap-2 text-12-medium text-text-weak">
              <Icon name="branch" class="size-4" />
              Linear Integration
            </div>
            <Show when={props.ticket.linear?.url}>
              <a
                href={props.ticket.linear?.url}
                target="_blank"
                rel="noopener noreferrer"
                class="text-13-regular text-text-accent hover:underline"
              >
                {props.ticket.linear?.identifier || props.ticket.linear?.issueId}
              </a>
            </Show>
            <Show when={props.ticket.linear?.lastSyncError}>
              <div class="text-12-regular text-text-critical-base">
                Sync error: {props.ticket.linear?.lastSyncError}
              </div>
            </Show>
          </div>
        </Show>
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
            Delete Ticket
          </Button>
        </Show>
      </div>
    </form>
  );
}
