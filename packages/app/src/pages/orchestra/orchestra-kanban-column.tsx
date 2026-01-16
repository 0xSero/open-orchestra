import { createDroppable } from "@thisbeyond/solid-dnd";
import type { JSX } from "solid-js";
import type { LinearWorkflowState } from "@/pages/orchestra/orchestra-types";

export function KanbanColumn(props: {
  state: LinearWorkflowState;
  count: number;
  children: JSX.Element;
}) {
  const droppable = createDroppable(props.state.id);

  return (
    <div
      ref={(el) => droppable(el)}
      class="w-72 shrink-0 flex flex-col bg-surface-raised-base rounded-lg h-full transition-all"
      classList={{
        "ring-2 ring-text-accent ring-offset-2 ring-offset-background-base": droppable.isActiveDroppable,
      }}
    >
      <div class="flex items-center gap-2 p-3 border-b border-border-base">
        <div
          class="size-3 rounded-full shrink-0"
          style={{ background: props.state.color }}
        />
        <span class="text-14-medium text-text-base truncate">{props.state.name}</span>
        <span class="text-12-regular text-text-weak ml-auto shrink-0">
          {props.count}
        </span>
      </div>

      <div class="flex-1 overflow-y-auto p-2 space-y-2 min-h-0">
        {props.children}
      </div>
    </div>
  );
}
