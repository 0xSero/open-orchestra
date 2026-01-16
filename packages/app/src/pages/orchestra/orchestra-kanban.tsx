import { closestCenter, DragDropProvider, DragDropSensors, DragOverlay } from "@thisbeyond/solid-dnd";
import { createMemo, createSignal, For, Show } from "solid-js";
import type { LinearData, LinearIssue, LinearWorkflowState } from "@/pages/orchestra/orchestra-types";
import { KanbanCard } from "@/pages/orchestra/orchestra-kanban-card";
import { KanbanColumn } from "@/pages/orchestra/orchestra-kanban-column";

// Order workflow states by type for consistent Kanban layout
const STATE_TYPE_ORDER: Record<string, number> = {
  backlog: 0,
  triage: 1,
  unstarted: 2,
  started: 3,
  completed: 4,
  canceled: 5,
};

function getStateOrder(type: string): number {
  return STATE_TYPE_ORDER[type.toLowerCase()] ?? 3;
}

export function KanbanBoard(props: {
  linear: LinearData;
  onMoveIssue?: (issueId: string, stateId: string) => void;
  onSelectIssue?: (issue: LinearIssue) => void;
}) {
  const [draggingIssue, setDraggingIssue] = createSignal<LinearIssue | null>(null);

  // Sort states by type order, then by position
  const sortedStates = createMemo(() => {
    return [...props.linear.states].sort((a, b) => {
      const typeOrderA = getStateOrder(a.type);
      const typeOrderB = getStateOrder(b.type);
      if (typeOrderA !== typeOrderB) return typeOrderA - typeOrderB;
      return a.position - b.position;
    });
  });

  // Group issues by state ID
  const issuesByState = createMemo(() => {
    const map = new Map<string, LinearIssue[]>();
    for (const state of props.linear.states) {
      map.set(state.id, []);
    }
    for (const issue of props.linear.issues) {
      const list = map.get(issue.stateId);
      if (list) {
        list.push(issue);
      }
    }
    // Sort issues by updated date (most recent first)
    for (const [, issues] of map) {
      issues.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
    }
    return map;
  });

  const issuesInState = (stateId: string): LinearIssue[] => {
    return issuesByState().get(stateId) ?? [];
  };

  function handleDragStart(event: any) {
    const issueId = event?.draggable?.id;
    if (!issueId) return;
    const issue = props.linear.issues.find((i) => i.id === issueId);
    if (issue) {
      setDraggingIssue(issue);
    }
  }

  function handleDragEnd(event: any) {
    const issueId = event?.draggable?.id;
    const newStateId = event?.droppable?.id;
    setDraggingIssue(null);

    if (!issueId || !newStateId) return;

    const issue = props.linear.issues.find((i) => i.id === issueId);
    if (!issue) return;

    // Only trigger move if state actually changed
    if (issue.stateId !== newStateId && props.onMoveIssue) {
      props.onMoveIssue(issueId, newStateId);
    }
  }

  return (
    <DragDropProvider
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      collisionDetector={closestCenter}
    >
      <DragDropSensors />
      <div class="flex gap-4 overflow-x-auto h-full pb-4">
        <For each={sortedStates()}>
          {(state) => (
            <KanbanColumn state={state} count={issuesInState(state.id).length}>
              <For each={issuesInState(state.id)}>
                {(issue) => (
                  <KanbanCard
                    issue={issue}
                    onSelect={props.onSelectIssue}
                  />
                )}
              </For>
            </KanbanColumn>
          )}
        </For>
      </div>

      <DragOverlay>
        <Show when={draggingIssue()}>
          {(issue) => (
            <div class="w-72">
              <KanbanCard issue={issue()} />
            </div>
          )}
        </Show>
      </DragOverlay>
    </DragDropProvider>
  );
}
