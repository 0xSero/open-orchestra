import type { Ticket, TicketStoreFile } from "./types";
import { writeJsonAtomic } from "../helpers/fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

const STORE_VERSION = 1 as const;

function createEmptyStore(): TicketStoreFile {
  return { version: STORE_VERSION, tickets: [] };
}

function isTicketStore(value: unknown): value is TicketStoreFile {
  if (!value || typeof value !== "object") return false;
  const record = value as TicketStoreFile;
  return record.version === STORE_VERSION && Array.isArray(record.tickets);
}

function sortTickets(tickets: Ticket[]): Ticket[] {
  return [...tickets].sort((a, b) => {
    const updatedDiff = b.updatedAt - a.updatedAt;
    if (updatedDiff !== 0) return updatedDiff;
    const createdDiff = b.createdAt - a.createdAt;
    if (createdDiff !== 0) return createdDiff;
    return a.id.localeCompare(b.id);
  });
}

function normalizeStore(store: TicketStoreFile): TicketStoreFile {
  return { version: STORE_VERSION, tickets: sortTickets(store.tickets) };
}

export function getTicketStorePath(baseDir: string): string {
  return join(baseDir, ".opencode", "orchestrator", "tickets.json");
}

export async function readTicketStore(path: string): Promise<TicketStoreFile> {
  try {
    const content = await readFile(path, "utf-8");
    const parsed = JSON.parse(content) as TicketStoreFile;
    if (!isTicketStore(parsed)) {
      return createEmptyStore();
    }
    return normalizeStore(parsed);
  } catch (err: any) {
    return createEmptyStore();
  }
}

export async function writeTicketStore(path: string, store: TicketStoreFile): Promise<void> {
  const normalized = normalizeStore(store);
  await writeJsonAtomic(path, normalized);
}

export async function listTickets(path: string): Promise<Ticket[]> {
  const store = await readTicketStore(path);
  return sortTickets(store.tickets);
}

export async function getTicketById(path: string, id: string): Promise<Ticket | undefined> {
  const store = await readTicketStore(path);
  return store.tickets.find(ticket => ticket.id === id);
}

export async function upsertTicket(path: string, ticket: Ticket): Promise<Ticket> {
  const store = await readTicketStore(path);
  const now = Date.now();
  const index = store.tickets.findIndex(existing => existing.id === ticket.id);
  const existing = index >= 0 ? store.tickets[index] : undefined;
  const nextTicket: Ticket = {
    ...existing,
    ...ticket,
    id: ticket.id,
    createdAt: existing?.createdAt ?? ticket.createdAt ?? now,
    updatedAt: now,
    runs: ticket.runs ?? existing?.runs ?? [],
  };

  if (index >= 0) {
    store.tickets[index] = nextTicket;
  } else {
    store.tickets.push(nextTicket);
  }

  await writeTicketStore(path, store);
  return nextTicket;
}

export async function updateTicket(
  path: string,
  id: string,
  patch: Partial<Ticket>
): Promise<Ticket | undefined> {
  const store = await readTicketStore(path);
  const index = store.tickets.findIndex(ticket => ticket.id === id);
  if (index < 0) {
    return undefined;
  }

  const existing = store.tickets[index];
  const updated: Ticket = {
    ...existing,
    ...patch,
    id: existing.id,
    createdAt: existing.createdAt,
    updatedAt: Date.now(),
    runs: patch.runs ?? existing.runs,
  };

  store.tickets[index] = updated;
  await writeTicketStore(path, store);
  return updated;
}

export async function deleteTicket(path: string, id: string): Promise<boolean> {
  const store = await readTicketStore(path);
  const nextTickets = store.tickets.filter(ticket => ticket.id !== id);
  if (nextTickets.length === store.tickets.length) {
    return false;
  }
  await writeTicketStore(path, { version: STORE_VERSION, tickets: nextTickets, });
  return true;
}
