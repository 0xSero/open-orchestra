import { Icon } from "@opencode-ai/ui/icon";
import { IconButton } from "@opencode-ai/ui/icon-button";
import { Tag } from "@opencode-ai/ui/tag";
import { createDraggable } from "@thisbeyond/solid-dnd";
import { For, Show } from "solid-js";
import type { LinearIssue } from "@/pages/orchestra/orchestra-types";
import { PriorityIndicator } from "@/pages/orchestra/orchestra-linear-tags";

export function KanbanCard(props: {
  issue: LinearIssue;
  onSelect?: (issue: LinearIssue) => void;
}) {
  const draggable = createDraggable(props.issue.id);

  function handleClick(e: MouseEvent) {
    if (draggable.isActiveDraggable) return;
    if (e.defaultPrevented) return;
    props.onSelect?.(props.issue);
  }

  function handleOpenExternal(e: MouseEvent) {
    e.stopPropagation();
    window.open(props.issue.url, "_blank");
  }

  return (
    <div
      ref={(el) => draggable(el)}
      class="p-3 bg-surface-base rounded-lg border border-border-base shadow-sm cursor-grab active:cursor-grabbing hover:bg-surface-raised-base-hover transition-colors"
      classList={{ "opacity-25": draggable.isActiveDraggable }}
      onClick={handleClick}
    >
      {/* Header: ID + Priority + External link */}
      <div class="flex items-center gap-2">
        <span class="text-12-medium text-text-weak font-mono">{props.issue.identifier}</span>
        <Show when={props.issue.priority > 0}>
          <PriorityIndicator priority={props.issue.priority} />
        </Show>
        <div class="ml-auto">
          <IconButton
            icon="square-arrow-top-right"
            variant="ghost"
            onClick={handleOpenExternal}
            title="Open in Linear"
          />
        </div>
      </div>

      {/* Title */}
      <div class="text-14-medium text-text-strong mt-2 line-clamp-2">
        {props.issue.title}
      </div>

      {/* Labels */}
      <Show when={props.issue.labels.length > 0}>
        <div class="flex items-center gap-1 mt-2 flex-wrap">
          <For each={props.issue.labels.slice(0, 2)}>
            {(label) => (
              <Tag size="normal" style={{ background: label.color, color: "white" }}>
                {label.name}
              </Tag>
            )}
          </For>
          <Show when={props.issue.labels.length > 2}>
            <Tag size="normal">+{props.issue.labels.length - 2}</Tag>
          </Show>
        </div>
      </Show>

      {/* Footer: Project + Assignee */}
      <div class="flex items-center justify-between mt-2">
        <Show when={props.issue.project}>
          <div class="flex items-center gap-1 text-12-regular text-text-weak">
            <Icon name="folder" class="size-3" />
            <span class="truncate max-w-[120px]">{props.issue.project?.name}</span>
          </div>
        </Show>

        <Show when={props.issue.assignee}>
          <div class="flex items-center gap-1 ml-auto">
            <Show
              when={props.issue.assignee?.avatarUrl}
              fallback={
                <div class="size-5 rounded-full bg-surface-raised-base flex items-center justify-center text-10-medium text-text-weak border border-border-base">
                  {props.issue.assignee?.name?.charAt(0).toUpperCase()}
                </div>
              }
            >
              <img
                src={props.issue.assignee?.avatarUrl}
                alt={props.issue.assignee?.name}
                class="size-5 rounded-full"
              />
            </Show>
          </div>
        </Show>
      </div>
    </div>
  );
}
