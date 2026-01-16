import type { TicketRunRef } from "../tickets/types";

export type JobStatus = "running" | "succeeded" | "failed" | "canceled";
export type JobKind = "worker" | "workflow";

export type JobRecord = {
  taskId: string;
  kind: JobKind;
  workerId?: string;
  workflowId?: string;
  status: JobStatus;
  startedAt: number;
  finishedAt?: number;
};

export function createJobRecord(params: {
  taskId: string;
  kind: JobKind;
  workerId?: string;
  workflowId?: string;
  startedAt: number;
}): JobRecord {
  return {
    taskId: params.taskId,
    kind: params.kind,
    workerId: params.workerId,
    workflowId: params.workflowId,
    status: "running",
    startedAt: params.startedAt,
  };
}

export function finalizeJobRecord(
  job: JobRecord,
  status: JobStatus,
  finishedAt: number,
): JobRecord {
  return {
    ...job,
    status,
    finishedAt,
  };
}

export function jobToTicketRun(job: JobRecord): TicketRunRef {
  return {
    taskId: job.taskId,
    kind: job.kind,
    workerId: job.workerId,
    workflowId: job.workflowId,
    startedAt: job.startedAt,
    finishedAt: job.finishedAt,
    status: job.status,
  };
}
