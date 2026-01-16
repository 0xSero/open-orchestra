import type { LinearWorkflowState } from "@/pages/orchestra/orchestra-types";

export function StateTag(props: { state: { name: string; type: string; color?: string } }) {
  return (
    <div class="flex items-center gap-2">
      <span
        class="size-2 rounded-full"
        style={{ background: props.state.color || "#888" }}
      />
      <span class="text-12-regular text-text-base">{props.state.name}</span>
    </div>
  );
}

export function PriorityIndicator(props: { priority: number }) {
  const config: Record<number, { label: string; color: string }> = {
    0: { label: "No priority", color: "bg-gray-400" },
    1: { label: "Urgent", color: "bg-red-500" },
    2: { label: "High", color: "bg-orange-500" },
    3: { label: "Medium", color: "bg-amber-500" },
    4: { label: "Low", color: "bg-blue-500" },
  };
  const { label, color } = config[props.priority] ?? config[0];

  if (props.priority === 0) {
    return <span class="text-12-regular text-text-weaker">—</span>;
  }

  return (
    <div class="flex items-center gap-2">
      <span class={`size-2 rounded-full ${color}`} />
      <span class="text-12-regular text-text-base">{label}</span>
    </div>
  );
}

export function StateTypeTag(props: { type: string }) {
  const colors: Record<string, string> = {
    backlog: "bg-gray-500/10 text-gray-600 dark:text-gray-400",
    triage: "bg-purple-500/10 text-purple-600 dark:text-purple-400",
    unstarted: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
    started: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
    completed: "bg-green-500/10 text-green-600 dark:text-green-400",
    canceled: "bg-red-500/10 text-red-600 dark:text-red-400",
  };
  return (
    <span class={`inline-flex px-2 py-0.5 rounded text-12-medium ${colors[props.type] || colors.backlog}`}>
      {props.type}
    </span>
  );
}
