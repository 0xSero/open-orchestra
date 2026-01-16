export type TicketsConfig = {
  enabled?: boolean;
  storePath?: string;
  autoFromMemoryTodos?: boolean;
  linear?: {
    enabled?: boolean;
    teamId?: string;
  };
};

export type OrchestratorConfig = {
  tickets?: TicketsConfig;
};
