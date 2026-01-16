import type { MemoryEntry } from "@/pages/orchestra/orchestra-types";
import { filterMemoryEntries } from "@/pages/orchestra/orchestra-memory-utils";

export type MemoryRow = MemoryEntry & {
  sourceLabel: string;
  createdAtLabel: string;
};

function formatLabel(value?: string): string {
  return value && value.trim().length > 0 ? value : "—";
}

export function buildMemoryRows(entries: MemoryEntry[], query: string): MemoryRow[] {
  return filterMemoryEntries(entries, query).map((entry) => ({
    ...entry,
    sourceLabel: formatLabel(entry.source),
    createdAtLabel: formatLabel(entry.createdAt),
  }));
}
