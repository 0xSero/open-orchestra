import type { TaskContext, TicketOpResult } from "./tasks";
import { taskStart } from "./tasks";

export type TaskTools = {
  ticket_create(input: {
    title: string;
    description?: string;
    sessionId?: string;
    projectId?: string;
    tags?: string[];
  }): Promise<TicketOpResult<unknown>>;
  ticket_linear_sync(input: { ticketId: string; teamId?: string }): Promise<TicketOpResult<unknown>>;
  memory_done(input: { taskId: string }): Promise<{ ok: true } | { ok: false; error: string }>;
};

export function createTaskTools(context: TaskContext): TaskTools {
  return {
    ticket_create(input) {
      return taskStart(context, { kind: "op", op: "ticket.create", payload: input });
    },
    ticket_linear_sync(input) {
      return taskStart(context, { kind: "op", op: "ticket.linear.sync", payload: input });
    },
    async memory_done() {
      return { ok: true };
    },
  };
}
