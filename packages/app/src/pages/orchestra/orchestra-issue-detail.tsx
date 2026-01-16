import { Button } from "@opencode-ai/ui/button";
import { Icon } from "@opencode-ai/ui/icon";
import { Select } from "@opencode-ai/ui/select";
import { Tag } from "@opencode-ai/ui/tag";
import { For, Show, createMemo, createSignal } from "solid-js";
import type { Session } from "@opencode-ai/sdk/v2/client";
import type { LinearIssue, LinearIssueAssignment, LinearWorkflowState, Worker, Workflow } from "@/pages/orchestra/orchestra-types";
import { Sheet } from "@/pages/orchestra/orchestra-sheet";
import { StateTag, PriorityIndicator } from "@/pages/orchestra/orchestra-linear-tags";
import { ModelSelector } from "@/pages/orchestra/orchestra-model-selector";

export function IssueDetailSheet(props: {
  issue: LinearIssue | null;
  states: LinearWorkflowState[];
  workers: Worker[];
  workflows: Workflow[];
  sessions?: Session[];
  onClose: () => void;
  onChangeState?: (stateId: string) => void;
  onUpdateOrchestra?: (update: {
    assignment?: LinearIssueAssignment | null;
    model?: string | null;
    context?: string[] | null;
    linkedSessionIds?: string[] | null;
  }) => void;
  onOpenSession?: (sessionId: string) => void;
  onDelete?: () => void;
}) {
  const [isDeleting, setIsDeleting] = createSignal(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = createSignal(false);

  async function handleDelete() {
    setIsDeleting(true);
    try {
      await props.onDelete?.();
    } finally {
      setIsDeleting(false);
      setShowDeleteConfirm(false);
    }
  }
  // Find sessions linked to this issue (by checking if issue identifier is in session title or metadata)
  const linkedSessions = createMemo(() => {
    if (!props.issue || !props.sessions) return [];
    const issueId = props.issue.identifier;
    const linkedIds = props.issue.orchestraLinkedSessions || [];

    // Find sessions that match linked IDs or contain issue identifier in title
    return props.sessions.filter((session) =>
      linkedIds.includes(session.id) ||
      session.title?.toLowerCase().includes(issueId.toLowerCase())
    );
  });
  function handleOpenInLinear() {
    if (props.issue) {
      window.open(props.issue.url, "_blank");
    }
  }

  return (
    <Sheet
      open={!!props.issue}
      onClose={props.onClose}
      title={props.issue?.identifier || "Issue"}
    >
      <Show when={props.issue}>
        {(issue) => (
          <div class="p-4 space-y-6">
            {/* Actions */}
            <div class="flex gap-2">
              <Button variant="secondary" size="small" onClick={handleOpenInLinear}>
                <Icon name="square-arrow-top-right" class="size-4" />
                Open in Linear
              </Button>
              <Show when={props.onDelete}>
                <Show
                  when={!showDeleteConfirm()}
                  fallback={
                    <div class="flex gap-2">
                      <Button
                        variant="danger"
                        size="small"
                        onClick={handleDelete}
                        disabled={isDeleting()}
                      >
                        {isDeleting() ? "Deleting..." : "Confirm Delete"}
                      </Button>
                      <Button
                        variant="secondary"
                        size="small"
                        onClick={() => setShowDeleteConfirm(false)}
                        disabled={isDeleting()}
                      >
                        Cancel
                      </Button>
                    </div>
                  }
                >
                  <Button
                    variant="secondary"
                    size="small"
                    onClick={() => setShowDeleteConfirm(true)}
                  >
                    <Icon name="trash" class="size-4" />
                    Delete
                  </Button>
                </Show>
              </Show>
            </div>

            {/* Title */}
            <div>
              <h2 class="text-16-semibold text-text-strong">{issue().title}</h2>
            </div>

            {/* Properties table */}
            <div class="border border-border-base rounded-lg overflow-hidden">
              <table class="w-full">
                <tbody>
                  <tr class="border-b border-border-base">
                    <td class="px-4 py-3 text-12-medium text-text-weak w-28">Status</td>
                    <td class="px-4 py-3">
                      <StateTag state={issue().state} />
                    </td>
                  </tr>
                  <tr class="border-b border-border-base">
                    <td class="px-4 py-3 text-12-medium text-text-weak">Priority</td>
                    <td class="px-4 py-3">
                      <PriorityIndicator priority={issue().priority} />
                    </td>
                  </tr>
                  <Show when={issue().assignee}>
                    <tr class="border-b border-border-base">
                      <td class="px-4 py-3 text-12-medium text-text-weak">Assignee</td>
                      <td class="px-4 py-3">
                        <div class="flex items-center gap-2">
                          <Show
                            when={issue().assignee?.avatarUrl}
                            fallback={
                              <div class="size-5 rounded-full bg-surface-raised-base flex items-center justify-center text-10-medium text-text-weak">
                                {issue().assignee?.name?.charAt(0).toUpperCase()}
                              </div>
                            }
                          >
                            <img
                              src={issue().assignee?.avatarUrl}
                              alt={issue().assignee?.name}
                              class="size-5 rounded-full"
                            />
                          </Show>
                          <span class="text-13-regular text-text-base">{issue().assignee?.name}</span>
                        </div>
                      </td>
                    </tr>
                  </Show>
                  <Show when={issue().project}>
                    <tr class="border-b border-border-base">
                      <td class="px-4 py-3 text-12-medium text-text-weak">Project</td>
                      <td class="px-4 py-3">
                        <div class="flex items-center gap-2">
                          <Icon name="folder" class="size-4 text-text-weak" />
                          <span class="text-13-regular text-text-base">{issue().project?.name}</span>
                        </div>
                      </td>
                    </tr>
                  </Show>
                  <Show when={issue().labels.length > 0}>
                    <tr class="border-b border-border-base last:border-b-0">
                      <td class="px-4 py-3 text-12-medium text-text-weak align-top">Labels</td>
                      <td class="px-4 py-3">
                        <div class="flex flex-wrap gap-1">
                          <For each={issue().labels}>
                            {(label) => (
                              <Tag size="normal" style={{ background: label.color, color: "white" }}>
                                {label.name}
                              </Tag>
                            )}
                          </For>
                        </div>
                      </td>
                    </tr>
                  </Show>
                </tbody>
              </table>
            </div>

            {/* Description */}
            <Show when={issue().description}>
              <div class="space-y-2">
                <h3 class="text-14-medium text-text-base">Description</h3>
                <div class="text-13-regular text-text-base whitespace-pre-wrap bg-surface-raised-base rounded-lg p-3 border border-border-base">
                  {issue().description}
                </div>
              </div>
            </Show>

            {/* Move to state */}
            <Show when={props.onChangeState}>
              <div class="space-y-2">
                <h3 class="text-14-medium text-text-base">Move to</h3>
                <div class="flex flex-wrap gap-2">
                  <For each={props.states.filter((s) => s.id !== issue().stateId)}>
                    {(state) => (
                      <button
                        class="px-3 py-1.5 rounded-lg border border-border-base hover:bg-surface-raised-base-hover transition-colors flex items-center gap-2 text-13-regular text-text-base"
                        onClick={() => props.onChangeState?.(state.id)}
                      >
                        <span
                          class="size-2 rounded-full"
                          style={{ background: state.color }}
                        />
                        {state.name}
                      </button>
                    )}
                  </For>
                </div>
              </div>
            </Show>

            {/* Orchestra Assignment */}
            <Show when={props.onUpdateOrchestra}>
              <div class="space-y-4 pt-4 border-t border-border-base">
                <h3 class="text-14-semibold text-text-base flex items-center gap-2">
                  <Icon name="brain" class="size-4" />
                  Orchestra Assignment
                </h3>

                {/* Model Selection - using dynamic models from providers */}
                <div class="space-y-2">
                  <label class="text-12-medium text-text-weak">Model</label>
                  <ModelSelector
                    value={issue().orchestraModel || ""}
                    onChange={(value) => props.onUpdateOrchestra?.({ model: value || null })}
                  />
                </div>

                {/* Worker/Workflow Assignment */}
                <div class="space-y-2">
                  <label class="text-12-medium text-text-weak">Assign to</label>
                  <Select
                    options={[
                      { type: "none" as const, id: "", name: "None" },
                      ...props.workers.map((w) => ({ type: "worker" as const, id: w.id, name: `Worker: ${w.name}` })),
                      ...props.workflows.map((w) => ({ type: "workflow" as const, id: w.id, name: `Workflow: ${w.name}` })),
                    ]}
                    current={(() => {
                      const assignment = issue().orchestraAssignment;
                      if (!assignment) return { type: "none" as const, id: "", name: "None" };
                      if (assignment.kind === "worker") {
                        const worker = props.workers.find((w) => w.id === assignment.workerId);
                        return worker ? { type: "worker" as const, id: worker.id, name: `Worker: ${worker.name}` } : { type: "none" as const, id: "", name: "None" };
                      }
                      if (assignment.kind === "workflow") {
                        const workflow = props.workflows.find((w) => w.id === assignment.workflowId);
                        return workflow ? { type: "workflow" as const, id: workflow.id, name: `Workflow: ${workflow.name}` } : { type: "none" as const, id: "", name: "None" };
                      }
                      return { type: "none" as const, id: "", name: "None" };
                    })()}
                    value={(item) => `${item.type}:${item.id}`}
                    label={(item) => item.name}
                    onSelect={(item) => {
                      if (!item || item.type === "none") {
                        props.onUpdateOrchestra?.({ assignment: null });
                      } else if (item.type === "worker") {
                        props.onUpdateOrchestra?.({ assignment: { kind: "worker", workerId: item.id } });
                      } else if (item.type === "workflow") {
                        props.onUpdateOrchestra?.({ assignment: { kind: "workflow", workflowId: item.id } });
                      }
                    }}
                    variant="secondary"
                    class="w-full"
                    placeholder="Select worker or workflow..."
                  />
                </div>
              </div>
            </Show>

            {/* Linked Sessions */}
            <Show when={linkedSessions().length > 0}>
              <div class="space-y-3 pt-4 border-t border-border-base">
                <h3 class="text-14-semibold text-text-base flex items-center gap-2">
                  <Icon name="bubble-5" class="size-4" />
                  Linked Sessions ({linkedSessions().length})
                </h3>
                <div class="space-y-2">
                  <For each={linkedSessions()}>
                    {(session) => (
                      <button
                        class="w-full p-3 bg-surface-raised-base rounded-lg border border-border-base hover:bg-surface-raised-base-hover transition-colors text-left"
                        onClick={() => props.onOpenSession?.(session.id)}
                      >
                        <div class="flex items-center justify-between gap-2">
                          <div class="flex-1 min-w-0">
                            <div class="text-13-medium text-text-base truncate">
                              {session.title || "Untitled Session"}
                            </div>
                            <div class="text-12-regular text-text-weak">
                              {new Date(session.time.updated).toLocaleDateString()}
                            </div>
                          </div>
                          <Icon name="chevron-right" class="size-4 text-icon-weak shrink-0" />
                        </div>
                      </button>
                    )}
                  </For>
                </div>
              </div>
            </Show>

            {/* Metadata */}
            <div class="pt-4 border-t border-border-base text-12-regular text-text-weak space-y-1">
              <div>Created: {new Date(issue().createdAt).toLocaleString()}</div>
              <div>Updated: {new Date(issue().updatedAt).toLocaleString()}</div>
            </div>
          </div>
        )}
      </Show>
    </Sheet>
  );
}
