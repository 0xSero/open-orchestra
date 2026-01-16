import type { MemoryEntry } from "@/pages/orchestra/orchestra-types";

export function filterMemoryEntries(entries: MemoryEntry[], query: string): MemoryEntry[] {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return entries;

  return entries.filter((entry) => {
    const tags = entry.tags?.join(" ") ?? "";
    return `${entry.content} ${tags} ${entry.source ?? ""}`.toLowerCase().includes(normalized);
  });
}
