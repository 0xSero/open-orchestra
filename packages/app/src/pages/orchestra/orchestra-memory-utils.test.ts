import { describe, expect, test } from "bun:test";
import { filterMemoryEntries } from "./orchestra-memory-utils";

const entries = [
  {
    id: "mem-1",
    content: "Remember to run bun test",
    tags: ["testing"],
    source: "memory-agent",
    createdAt: "2024-01-01T00:00:00.000Z",
  },
  {
    id: "mem-2",
    content: "Workflow run succeeded",
    tags: ["workflow"],
    source: "orchestrator",
    createdAt: "2024-01-02T00:00:00.000Z",
  },
];

describe("filterMemoryEntries", () => {
  test("returns all entries when query is empty", () => {
    expect(filterMemoryEntries(entries, "")).toHaveLength(2);
  });

  test("filters by content, tags, and source", () => {
    expect(filterMemoryEntries(entries, "workflow")).toHaveLength(1);
    expect(filterMemoryEntries(entries, "testing")).toHaveLength(1);
    expect(filterMemoryEntries(entries, "memory-agent")).toHaveLength(1);
  });
});
