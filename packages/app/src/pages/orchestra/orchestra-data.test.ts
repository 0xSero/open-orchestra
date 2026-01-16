import { describe, expect, test } from "bun:test";
import { loadOrchestraDataFromDirectory, mergeOrchestraDataSets } from "./orchestra-data";
import { buildRuntimeSummaryLabels, getRuntimeSummaryCounts } from "./orchestra-summary";
import type { OrchestraData } from "./orchestra-types";

function emptyData(overrides: Partial<OrchestraData> = {}): OrchestraData {
  return {
    workers: [],
    instances: [],
    jobs: [],
    workflowRuns: [],
    workflows: [],
    integrations: [],
    integrationInstances: [],
    skills: [],
    memoryEntries: [],
    skillRoots: { project: [] },
    tickets: [],
    linear: {
      apiConfigured: false,
      teams: [],
      states: [],
      projects: [],
      labels: [],
      users: [],
      issues: [],
    },
    ...overrides,
  };
}

describe("orchestra data loader", () => {
  test("loadOrchestraDataFromDirectory returns empty data on missing files", async () => {
    const data = await loadOrchestraDataFromDirectory(
      {
        readJsonFile: async (_directory, _path, fallback) => fallback,
        listWorkflowFiles: async () => [],
      },
      "/repo",
    );

    expect(data.workers).toEqual([]);
    expect(data.instances).toEqual([]);
    expect(data.jobs).toEqual([]);
    expect(data.workflowRuns).toEqual([]);
    expect(data.integrationInstances).toEqual([]);
    expect(data.memoryEntries).toEqual([]);
    expect(data.skillRoots.project).toEqual([]);
  });
});

describe("mergeOrchestraDataSets", () => {
  test("dedupes by directory and keeps newest timestamps", () => {
    const base = emptyData({
      jobs: [
        {
          id: "job-1",
          jobId: "job-1",
          status: "running",
          workerInstanceId: "wkr-1",
          createdAt: "2024-01-01T00:00:00.000Z",
          directory: "/repo-a",
        },
      ],
      memoryEntries: [
        {
          id: "mem-1",
          content: "Old memory",
          createdAt: "2024-01-01T00:00:00.000Z",
          directory: "/repo-a",
        },
      ],
    });

    const newer = emptyData({
      jobs: [
        {
          id: "job-1",
          jobId: "job-1",
          status: "completed",
          workerInstanceId: "wkr-1",
          createdAt: "2024-01-01T00:00:00.000Z",
          completedAt: "2024-01-02T00:00:00.000Z",
          directory: "/repo-a",
        },
      ],
      memoryEntries: [
        {
          id: "mem-1",
          content: "New memory",
          createdAt: "2024-01-02T00:00:00.000Z",
          directory: "/repo-a",
        },
      ],
    });

    const otherDir = emptyData({
      memoryEntries: [
        {
          id: "mem-1",
          content: "Other project",
          createdAt: "2024-01-03T00:00:00.000Z",
          directory: "/repo-b",
        },
      ],
    });

    const merged = mergeOrchestraDataSets([base, newer, otherDir]);

    expect(merged.jobs).toHaveLength(1);
    expect(merged.jobs[0]?.status).toBe("completed");
    expect(merged.memoryEntries).toHaveLength(2);
    const repoAEntry = merged.memoryEntries.find((entry) => entry.directory === "/repo-a");
    const repoBEntry = merged.memoryEntries.find((entry) => entry.directory === "/repo-b");
    expect(repoAEntry?.content).toBe("New memory");
    expect(repoBEntry?.content).toBe("Other project");
  });
});

describe("runtime summary counts", () => {
  test("derives counts and labels from data", () => {
    const data = emptyData({
      instances: [
        {
          instanceId: "inst-1",
          workerId: "worker-1",
          runtime: "subagent",
          status: "busy",
          createdAt: "2024-01-01T00:00:00.000Z",
          lastSeenAt: "2024-01-01T00:00:00.000Z",
        },
      ],
      jobs: [
        {
          id: "job-1",
          jobId: "job-1",
          status: "running",
          workerInstanceId: "inst-1",
          createdAt: "2024-01-01T00:00:00.000Z",
        },
      ],
      workflowRuns: [
        {
          runId: "run-1",
          workflowId: "wf-1",
          status: "running",
          startedAt: "2024-01-01T00:00:00.000Z",
          steps: [],
        },
      ],
      integrationInstances: [
        {
          integrationId: "int-1",
          status: "ready",
          startedAt: "2024-01-01T00:00:00.000Z",
        },
      ],
      memoryEntries: [
        {
          id: "mem-1",
          content: "Remember this",
          createdAt: "2024-01-01T00:00:00.000Z",
        },
      ],
    });

    const counts = getRuntimeSummaryCounts(data);
    const labels = buildRuntimeSummaryLabels(counts);

    expect(counts.runningWorkers).toBe(1);
    expect(counts.runningJobs).toBe(1);
    expect(counts.runningWorkflows).toBe(1);
    expect(counts.runningIntegrations).toBe(1);
    expect(counts.memoryEntries).toBe(1);
    expect(labels.map((label) => `${label.label} ${label.value}`)).toEqual([
      "Workers 1",
      "Jobs 1",
      "Workflows 1",
      "Integrations 1",
      "Memories 1",
    ]);
  });

  test("uses placeholder for missing data", () => {
    const counts = getRuntimeSummaryCounts(undefined);
    const labels = buildRuntimeSummaryLabels(counts);
    expect(labels.map((label) => label.value)).toEqual(["—", "—", "—", "—", "—"]);
  });
});
