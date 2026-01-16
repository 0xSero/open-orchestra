export type MemoryTaskTurn = {
  summary?: string;
  todos?: string[];
  sessionId?: string;
  projectId?: string;
};

export type MemoryTaskPayload = {
  taskId: string;
  turn: MemoryTaskTurn;
};
