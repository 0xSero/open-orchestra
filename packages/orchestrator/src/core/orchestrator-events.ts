import type { Ticket } from "../tickets/types";

export type OrchestratorEventDataMap = {
  "orchestra.ticket.created": {
    ticketId: string;
    ticket: Ticket;
  };
  "orchestra.ticket.updated": {
    ticketId: string;
    ticket: Ticket;
  };
  "orchestra.ticket.deleted": {
    ticketId: string;
  };
  "orchestra.ticket.linear.synced": {
    ticketId: string;
    issueId: string;
    identifier?: string;
    url?: string;
  };
  "orchestra.ticket.linear.failed": {
    ticketId: string;
    error: string;
  };
};

export type OrchestratorEventType = keyof OrchestratorEventDataMap;

export type OrchestratorEvent<T extends OrchestratorEventType = OrchestratorEventType> = {
  type: T;
  createdAt: number;
  data: OrchestratorEventDataMap[T];
};

export function createOrchestratorEvent<T extends OrchestratorEventType>(
  type: T,
  data: OrchestratorEventDataMap[T],
): OrchestratorEvent<T> {
  return {
    type,
    createdAt: Date.now(),
    data,
  };
}
