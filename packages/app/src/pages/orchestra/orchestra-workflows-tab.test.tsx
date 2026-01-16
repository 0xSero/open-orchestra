import { describe, expect, test } from "bun:test";
import { buildWorkflowRunRows } from "./orchestra-workflows-tab-helpers";

describe("WorkflowsTab helpers", () => {
  test("builds run rows with last step and status", () => {
    const rows = buildWorkflowRunRows([
      {
        runId: "run-1",
        workflowId: "wf-1",
        status: "running",
        startedAt: "2024-01-02T00:00:00.000Z",
        steps: [
          {
            step: 1,
            name: "Step One",
            status: "completed",
          },
          {
            step: 2,
            name: "Step Two",
            status: "failed",
          },
        ],
      },
    ]);

    expect(rows).toHaveLength(1);
    expect(rows[0]?.lastStepName).toBe("Step Two");
    expect(rows[0]?.statusLabel).toBe("running");
    expect(rows[0]?.stepCount).toBe(2);
  });

  test("formats missing completedAt and failed status", () => {
    const rows = buildWorkflowRunRows([
      {
        runId: "run-2",
        workflowId: "wf-2",
        status: "failed",
        startedAt: "2024-01-03T00:00:00.000Z",
        steps: [],
      },
    ]);

    expect(rows[0]?.completedAt).toBe("—");
    expect(rows[0]?.statusLabel).toBe("failed");
    expect(rows[0]?.lastStepName).toBe("—");
  });
});
