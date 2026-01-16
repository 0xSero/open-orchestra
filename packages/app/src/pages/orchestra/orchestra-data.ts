import type {
  Integration,
  IntegrationInstance,
  LinearData,
  MemoryEntry,
  OrchestraData,
  RuntimeJob,
  SkillInfo,
  SkillRoots,
  Ticket,
  Worker,
  WorkerInstance,
  WorkerStatus,
  Workflow,
  WorkflowRunState,
} from "@/pages/orchestra/orchestra-types";

const emptyLinearData: LinearData = {
  apiConfigured: false,
  teams: [],
  states: [],
  projects: [],
  labels: [],
  users: [],
  issues: [],
};

type ReadJsonFile = <T>(directory: string, path: string, fallback: T) => Promise<T>;
type ListWorkflowFiles = (directory: string) => Promise<Workflow[]>;

export type OrchestraDataLoader = {
  readJsonFile: ReadJsonFile;
  listWorkflowFiles: ListWorkflowFiles;
};

type TimestampProvider<T> = (item: T) => string | undefined;
type KeyProvider<T> = (item: T) => string;

function timestampValue(value?: string): number {
  if (!value) return 0;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function dedupeByKey<T>(items: T[], key: KeyProvider<T>, timestamp?: TimestampProvider<T>): T[] {
  const map = new Map<string, T>();
  for (const item of items) {
    const itemKey = key(item);
    const existing = map.get(itemKey);
    if (!existing || !timestamp) {
      map.set(itemKey, item);
      continue;
    }
    const currentValue = timestampValue(timestamp(existing));
    const nextValue = timestampValue(timestamp(item));
    if (nextValue >= currentValue) {
      map.set(itemKey, item);
    }
  }
  return Array.from(map.values());
}

type NumericTimestampProvider<T> = (item: T) => number | undefined;

function dedupeByKeyNumeric<T>(items: T[], key: KeyProvider<T>, timestamp?: NumericTimestampProvider<T>): T[] {
  const map = new Map<string, T>();
  for (const item of items) {
    const itemKey = key(item);
    const existing = map.get(itemKey);
    if (!existing || !timestamp) {
      map.set(itemKey, item);
      continue;
    }
    const currentValue = timestamp(existing) ?? 0;
    const nextValue = timestamp(item) ?? 0;
    if (nextValue >= currentValue) {
      map.set(itemKey, item);
    }
  }
  return Array.from(map.values());
}

export async function loadOrchestraDataFromDirectory(
  loader: OrchestraDataLoader,
  directory: string,
): Promise<OrchestraData> {
  const workers: Worker[] = [];
  const workflows: Workflow[] = [];
  const integrations: Integration[] = [];
  const instances: WorkerInstance[] = [];
  const jobs: RuntimeJob[] = [];
  const workflowRuns: WorkflowRunState[] = [];
  const integrationInstances: IntegrationInstance[] = [];
  let skills: SkillInfo[] = [];
  let memoryEntries: MemoryEntry[] = [];
  let skillRoots: SkillRoots = { project: [] };
  let tickets: Ticket[] = [];
  let linear: LinearData = emptyLinearData;

  try {
    const workersData = await loader.readJsonFile<{ workers: Worker[] }>(
      directory,
      ".opencode/workforce/workers.json",
      { workers: [] },
    );
    const scopedWorkers = (workersData.workers || []).map((worker) => ({ ...worker, directory }));
    workers.push(...scopedWorkers);
    const runtimeByWorkerId = new Map(scopedWorkers.map((worker) => [worker.id, worker.runtime]));

    const workflowFiles = await loader.listWorkflowFiles(directory);
    workflows.push(...workflowFiles.map((workflow) => ({ ...workflow, directory })));

    const integrationsData = await loader.readJsonFile<{ integrations: Integration[] }>(
      directory,
      ".opencode/workforce/integrations.json",
      { integrations: [] },
    );
    integrations.push(...(integrationsData.integrations || []).map((integration) => ({ ...integration, directory })));

    const skillData = await loader.readJsonFile<{
      roots?: { project?: string; global?: string; config?: string };
      skills?: SkillInfo[];
    }>(
      directory,
      ".opencode/workforce/skills.json",
      { roots: { project: "" }, skills: [] },
    );
    skills = skillData.skills ?? [];
    skillRoots = {
      project: skillData.roots?.project ? [skillData.roots.project] : [],
      global: skillData.roots?.global,
      config: skillData.roots?.config,
    };

    const runtimeData = await loader.readJsonFile<{
      instances?: Array<{
        id: string;
        workerId: string;
        sessionId: string;
        status: WorkerStatus;
        createdAt: string;
        lastSeenAt?: string;
      }>;
      jobs?: RuntimeJob[];
      workflowRuns?: WorkflowRunState[];
      integrationInstances?: IntegrationInstance[];
      memoryEntries?: MemoryEntry[];
    }>(directory, ".opencode/workforce/runtime.json", { instances: [] });

    for (const instance of runtimeData.instances || []) {
      instances.push({
        instanceId: instance.id,
        workerId: instance.workerId,
        runtime: runtimeByWorkerId.get(instance.workerId) ?? "agent",
        status: instance.status,
        sessionId: instance.sessionId,
        createdAt: instance.createdAt,
        lastSeenAt: instance.lastSeenAt || instance.createdAt,
        directory,
      });
    }

    jobs.push(...(runtimeData.jobs ?? []).map((job) => ({ ...job, directory })));
    workflowRuns.push(...(runtimeData.workflowRuns ?? []).map((run) => ({ ...run, directory })));
    integrationInstances.push(...(runtimeData.integrationInstances ?? []).map((instance) => ({ ...instance, directory })));
    memoryEntries.push(...(runtimeData.memoryEntries ?? []).map((entry) => ({ ...entry, directory })));

    const memoryData = await loader.readJsonFile<{ entries?: MemoryEntry[] }>(
      directory,
      ".opencode/workforce/memories.json",
      { entries: [] },
    );
    if (memoryData.entries?.length) {
      memoryEntries.push(...memoryData.entries.map((entry) => ({ ...entry, directory })));
    }

    const ticketsData = await loader.readJsonFile<{ tickets?: Ticket[] }>(
      directory,
      ".opencode/workforce/tickets.json",
      { tickets: [] },
    );
    if (ticketsData.tickets?.length) {
      tickets.push(...ticketsData.tickets.map((ticket) => ({ ...ticket, directory })));
    }

    // Load Linear data
    const linearData = await loader.readJsonFile<LinearData>(
      directory,
      ".opencode/workforce/linear.json",
      emptyLinearData,
    );
    linear = linearData;
  } catch (err) {
    console.log(`Failed to load orchestra data from ${directory || "server root"}:`, err);
  }

  return {
    workers,
    workflows,
    integrations,
    instances,
    jobs,
    workflowRuns,
    integrationInstances,
    skills,
    memoryEntries,
    skillRoots,
    tickets,
    linear,
  };
}

export function mergeOrchestraDataSets(dataSets: OrchestraData[]): OrchestraData {
  const allWorkers: Worker[] = [];
  const allWorkflows: Workflow[] = [];
  const allIntegrations: Integration[] = [];
  const allInstances: WorkerInstance[] = [];
  const allJobs: RuntimeJob[] = [];
  const allWorkflowRuns: WorkflowRunState[] = [];
  const allIntegrationInstances: IntegrationInstance[] = [];
  const allSkills: SkillInfo[] = [];
  const allMemoryEntries: MemoryEntry[] = [];
  const allTickets: Ticket[] = [];
  const projectSkillRoots: string[] = [];
  let globalSkillRoot: string | undefined;
  let configSkillRoot: string | undefined;
  let linear: LinearData = emptyLinearData;

  for (const data of dataSets) {
    allWorkers.push(...data.workers);
    allWorkflows.push(...data.workflows);
    allIntegrations.push(...data.integrations);
    allInstances.push(...data.instances);
    allJobs.push(...data.jobs);
    allWorkflowRuns.push(...data.workflowRuns);
    allIntegrationInstances.push(...data.integrationInstances);
    allSkills.push(...data.skills);
    allMemoryEntries.push(...data.memoryEntries);
    allTickets.push(...data.tickets);
    projectSkillRoots.push(...data.skillRoots.project);
    globalSkillRoot ??= data.skillRoots.global;
    configSkillRoot ??= data.skillRoots.config;
    // Take the most recently synced linear data
    if (data.linear.apiConfigured && (data.linear.lastSyncedAt ?? 0) > (linear.lastSyncedAt ?? 0)) {
      linear = data.linear;
    }
  }

  const uniqueWorkers = dedupeByKey(allWorkers, (worker) => `${worker.id}:${worker.directory ?? ""}`);
  const uniqueWorkflows = dedupeByKey(allWorkflows, (workflow) => `${workflow.id}:${workflow.directory ?? ""}`);
  const uniqueIntegrations = dedupeByKey(allIntegrations, (integration) => `${integration.id}:${integration.directory ?? ""}`);
  const uniqueInstances = dedupeByKey(
    allInstances,
    (instance) => `${instance.instanceId}:${instance.directory ?? ""}`,
    (instance) => instance.lastSeenAt ?? instance.createdAt,
  );
  const uniqueJobs = dedupeByKey(
    allJobs,
    (job) => `${job.id ?? job.jobId}:${job.directory ?? ""}`,
    (job) => job.completedAt ?? job.createdAt,
  );
  const uniqueWorkflowRuns = dedupeByKey(
    allWorkflowRuns,
    (run) => `${run.runId}:${run.directory ?? ""}`,
    (run) => run.completedAt ?? run.startedAt,
  );
  const uniqueIntegrationInstances = dedupeByKey(
    allIntegrationInstances,
    (instance) => `${instance.integrationId}:${instance.directory ?? ""}`,
    (instance) => instance.startedAt,
  );
  const uniqueSkills = dedupeByKey(allSkills, (skill) => skill.path);
  const uniqueMemoryEntries = dedupeByKey(
    allMemoryEntries,
    (entry) => `${entry.id}:${entry.directory ?? ""}`,
    (entry) => entry.createdAt,
  );
  const uniqueTickets = dedupeByKeyNumeric(
    allTickets,
    (ticket) => `${ticket.id}:${ticket.directory ?? ""}`,
    (ticket) => ticket.updatedAt,
  );

  return {
    workers: uniqueWorkers,
    instances: uniqueInstances,
    jobs: uniqueJobs,
    workflowRuns: uniqueWorkflowRuns,
    workflows: uniqueWorkflows,
    integrations: uniqueIntegrations,
    integrationInstances: uniqueIntegrationInstances,
    skills: uniqueSkills,
    memoryEntries: uniqueMemoryEntries,
    skillRoots: {
      project: projectSkillRoots.filter(Boolean),
      global: globalSkillRoot,
      config: configSkillRoot,
    },
    tickets: uniqueTickets,
    linear,
  };
}
