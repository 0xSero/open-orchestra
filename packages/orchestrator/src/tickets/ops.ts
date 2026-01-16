import type { Ticket, TicketAssignment, TicketStatus } from "./types";
import {
  deleteTicket as deleteFromStore,
  getTicketById,
  listTickets as listFromStore,
  updateTicket as updateInStore,
  upsertTicket,
} from "./store";
import { randomUUID } from "node:crypto";

export type CreateTicketInput = {
  title: string;
  description?: string;
  assignment?: TicketAssignment;
  sessionId?: string;
  projectId?: string;
  tags?: string[];
};

export type UpdateTicketInput = {
  ticketId: string;
  patch: Partial<Ticket>;
};

export type SetTicketStatusInput = {
  ticketId: string;
  status: TicketStatus;
};

export type AssignTicketInput = {
  ticketId: string;
  assignment: TicketAssignment;
};

export type ListTicketsInput = {
  status?: TicketStatus;
  sessionId?: string;
  projectId?: string;
  limit?: number;
};

export type DeleteTicketInput = {
  ticketId: string;
};

export type TicketOps = {
  createTicket(input: CreateTicketInput): Promise<Ticket>;
  updateTicket(input: UpdateTicketInput): Promise<Ticket | undefined>;
  setTicketStatus(input: SetTicketStatusInput): Promise<Ticket | undefined>;
  assignTicket(input: AssignTicketInput): Promise<Ticket | undefined>;
  listTickets(input: ListTicketsInput): Promise<Ticket[]>;
  getTicket(ticketId: string): Promise<Ticket | undefined>;
  deleteTicket(input: DeleteTicketInput): Promise<boolean>;
};

export function createTicketOps(storePath: string): TicketOps {
  return {
    async createTicket(input) {
      const now = Date.now();
      const ticket: Ticket = {
        id: randomUUID(),
        title: input.title,
        description: input.description,
        status: "open",
        assignment: input.assignment,
        sessionId: input.sessionId,
        projectId: input.projectId,
        createdAt: now,
        updatedAt: now,
        tags: input.tags,
        runs: [],
      };
      return await upsertTicket(storePath, ticket);
    },

    async updateTicket(input) {
      return await updateInStore(storePath, input.ticketId, input.patch);
    },

    async setTicketStatus(input) {
      return await updateInStore(storePath, input.ticketId, { status: input.status });
    },

    async assignTicket(input) {
      return await updateInStore(storePath, input.ticketId, { assignment: input.assignment });
    },

    async listTickets(input) {
      let tickets = await listFromStore(storePath);
      if (input.status) {
        tickets = tickets.filter(ticket => ticket.status === input.status);
      }
      if (input.sessionId) {
        tickets = tickets.filter(ticket => ticket.sessionId === input.sessionId);
      }
      if (input.projectId) {
        tickets = tickets.filter(ticket => ticket.projectId === input.projectId);
      }
      if (input.limit !== undefined) {
        tickets = tickets.slice(0, input.limit);
      }
      return tickets;
    },

    async getTicket(ticketId) {
      return await getTicketById(storePath, ticketId);
    },

    async deleteTicket(input) {
      return await deleteFromStore(storePath, input.ticketId);
    },
  };
}
