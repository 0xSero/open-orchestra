import type { RuntimeJob } from "@/pages/orchestra/orchestra-types";

export type JobRow = {
  jobId: string;
  workerId?: string;
  workerInstanceId?: string;
  statusLabel: string;
  createdAt: string;
  sessionHref?: string;
};

export function formatJobStatus(status: RuntimeJob["status"]): string {
  return status.replace(/_/g, " ");
}

export function sortJobsByCreatedAt(jobs: RuntimeJob[]): RuntimeJob[] {
  return [...jobs].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

function normalizeCreatedAt(value: string | undefined): string {
  if (!value) return "—";
  return value;
}

export function buildJobRows(jobs: RuntimeJob[]): JobRow[] {
  return sortJobsByCreatedAt(jobs).map((job) => ({
    jobId: job.jobId,
    workerId: job.workerId,
    workerInstanceId: job.workerInstanceId,
    statusLabel: formatJobStatus(job.status),
    createdAt: normalizeCreatedAt(job.createdAt),
    sessionHref: job.workerSessionId ? `/sessions/${job.workerSessionId}` : undefined,
  }));
}
