import type { OrchestraData } from "@/pages/orchestra/orchestra-types";

export type RuntimeSummaryCounts = {
  runningWorkers: number | null;
  runningJobs: number | null;
  runningWorkflows: number | null;
  runningIntegrations: number | null;
  memoryEntries: number | null;
  openTickets: number | null;
};

export type RuntimeSummaryLabel = {
  label: string;
  value: string;
};

export function getRuntimeSummaryCounts(data?: OrchestraData): RuntimeSummaryCounts {
  if (!data) {
    return {
      runningWorkers: null,
      runningJobs: null,
      runningWorkflows: null,
      runningIntegrations: null,
      memoryEntries: null,
      openTickets: null,
    };
  }

  return {
    runningWorkers: data.instances.filter((instance) => instance.status === "busy").length,
    runningJobs: data.jobs.filter((job) => job.status === "running").length,
    runningWorkflows: data.workflowRuns.filter((run) => run.status === "running").length,
    runningIntegrations: data.integrationInstances.filter(
      (instance) => instance.status === "ready" || instance.status === "starting",
    ).length,
    memoryEntries: data.memoryEntries.length,
    openTickets: data.tickets.filter((ticket) => ticket.status === "open" || ticket.status === "in_progress").length,
  };
}

export function formatSummaryCount(value: number | null | undefined): string {
  return typeof value === "number" ? String(value) : "—";
}

export function buildRuntimeSummaryLabels(counts: RuntimeSummaryCounts): RuntimeSummaryLabel[] {
  return [
    { label: "Workers", value: formatSummaryCount(counts.runningWorkers) },
    { label: "Jobs", value: formatSummaryCount(counts.runningJobs) },
    { label: "Workflows", value: formatSummaryCount(counts.runningWorkflows) },
    { label: "Integrations", value: formatSummaryCount(counts.runningIntegrations) },
    { label: "Memories", value: formatSummaryCount(counts.memoryEntries) },
  ];
}
