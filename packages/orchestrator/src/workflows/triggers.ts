import type { MemoryTaskPayload, MemoryTaskTurn } from "../memory/tasks";
import { randomUUID } from "node:crypto";

export type WorkflowRunner = (input: { workflowId: string; task: string }) => Promise<void>;

export type WorkflowTriggers = {
  handleMemoryTurnEnd(input: { turn: MemoryTaskTurn; taskId?: string }): Promise<MemoryTaskPayload>;
};

export function createWorkflowTriggers(params: {
  runWorkflow: WorkflowRunner;
}): WorkflowTriggers {
  return {
    async handleMemoryTurnEnd(input) {
      const payload: MemoryTaskPayload = {
        taskId: input.taskId ?? randomUUID(),
        turn: input.turn,
      };

      await params.runWorkflow({
        workflowId: "memory",
        task: JSON.stringify(payload),
      });

      return payload;
    },
  };
}
