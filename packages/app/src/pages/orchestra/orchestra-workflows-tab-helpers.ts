import type { WorkflowRunState } from "@/pages/orchestra/orchestra-types";

export type WorkflowRunRow = {
  runId: string;
  statusLabel: string;
  stepCount: number;
  lastStepName: string;
  lastStepStatus?: string;
  startedAt: string;
  completedAt: string;
};

export function formatRunStatus(status: WorkflowRunState["status"]): string {
  return status.replace(/_/g, " ");
}

export function formatVerificationSummary(
  verification?: { type: string; passed: boolean; message?: string },
): string {
  if (!verification) return "—";
  const outcome = verification.passed ? "passed" : "failed";
  return verification.message ? `${verification.type}: ${outcome}` : `${verification.type}: ${outcome}`;
}

export function buildWorkflowRunRows(runs: WorkflowRunState[]): WorkflowRunRow[] {
  return [...runs]
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
    .map((run) => {
      const lastStep = run.steps[run.steps.length - 1];
      return {
        runId: run.runId,
        statusLabel: formatRunStatus(run.status),
        stepCount: run.steps.length,
        lastStepName: lastStep?.name ?? "—",
        lastStepStatus: lastStep?.status,
        startedAt: run.startedAt,
        completedAt: run.completedAt ?? "—",
      };
    });
}
