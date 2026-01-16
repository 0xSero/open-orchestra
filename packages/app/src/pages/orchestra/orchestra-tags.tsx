import type { WorkerRuntime, WorkerStatus } from "@/pages/orchestra/orchestra-types";

export function RuntimeTag(props: { runtime: WorkerRuntime }) {
  const colors: Record<WorkerRuntime, string> = {
    subagent: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
    agent: "bg-green-500/10 text-green-600 dark:text-green-400",
    server: "bg-purple-500/10 text-purple-600 dark:text-purple-400",
  };
  return (
    <span class={`inline-flex px-2 py-0.5 rounded text-12-medium ${colors[props.runtime]}`}>
      {props.runtime}
    </span>
  );
}

export function StatusIndicator(props: { status?: WorkerStatus }) {
  const colors: Record<WorkerStatus, string> = {
    available: "bg-green-500",
    busy: "bg-amber-500",
    off: "bg-gray-400",
    error: "bg-red-500",
  };
  if (!props.status) {
    return <span class="text-12-regular text-text-weaker">—</span>;
  }
  return (
    <div class="flex items-center gap-2">
      <span class={`size-2 rounded-full ${colors[props.status]}`} />
      <span class="text-12-regular text-text-base">{props.status}</span>
    </div>
  );
}

export function IntegrationTypeTag(props: { type: string }) {
  const colors: Record<string, string> = {
    mcp: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
    http: "bg-green-500/10 text-green-600 dark:text-green-400",
    stdio: "bg-purple-500/10 text-purple-600 dark:text-purple-400",
  };
  return (
    <span class={`inline-flex px-2 py-0.5 rounded text-12-medium ${colors[props.type] || "bg-gray-500/10 text-gray-600"}`}>
      {props.type.toUpperCase()}
    </span>
  );
}

export function IntegrationStatusIndicator(props: { status?: string }) {
  const colors: Record<string, string> = {
    ready: "bg-green-500",
    starting: "bg-amber-500",
    stopped: "bg-gray-400",
    error: "bg-red-500",
  };
  if (!props.status) {
    return <span class="text-12-regular text-text-weaker">—</span>;
  }
  return (
    <div class="flex items-center gap-2">
      <span class={`size-2 rounded-full ${colors[props.status] || "bg-gray-400"}`} />
      <span class="text-12-regular text-text-base">{props.status}</span>
    </div>
  );
}
