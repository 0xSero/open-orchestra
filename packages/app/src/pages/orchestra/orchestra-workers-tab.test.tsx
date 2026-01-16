import { describe, expect, test } from "bun:test";
import { buildJobRows } from "./orchestra-workers-tab-helpers";

describe("WorkersTab", () => {
  test("renders job rows with session link and status label", () => {
    const rows = buildJobRows([
      {
        id: "job-1",
        jobId: "job-1",
        status: "running",
        workerId: "worker-1",
        workerInstanceId: "inst-1",
        workerSessionId: "sess-1",
        createdAt: "2024-01-01T00:00:00.000Z",
      },
    ]);

    expect(rows).toHaveLength(1);
    expect(rows[0]?.sessionHref).toBe("/sessions/sess-1");
    expect(rows[0]?.statusLabel).toBe("running");
  });

  test("formats job status and handles missing createdAt", () => {
    const rows = buildJobRows([
      {
        id: "job-2",
        jobId: "job-2",
        status: "completed",
        workerInstanceId: "inst-2",
        createdAt: "",
      },
    ]);

    expect(rows[0]?.statusLabel).toBe("completed");
    expect(rows[0]?.createdAt).toBe("—");
  });
});
