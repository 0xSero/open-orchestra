import { describe, expect, test } from "bun:test";
import { buildMemoryRows } from "./orchestra-memories-tab-helpers";

describe("MemoriesTab helpers", () => {
  test("builds rows with fallback labels", () => {
    const rows = buildMemoryRows(
      [
        {
          id: "mem-1",
          content: "Remember this",
          createdAt: "2024-01-01T00:00:00.000Z",
        },
        {
          id: "mem-2",
          content: "Another",
          createdAt: "",
          source: "",
        },
      ],
      ""
    );

    expect(rows).toHaveLength(2);
    expect(rows[0]?.sourceLabel).toBe("—");
    expect(rows[0]?.createdAtLabel).toBe("2024-01-01T00:00:00.000Z");
    expect(rows[1]?.createdAtLabel).toBe("—");
  });

  test("returns empty rows when no entries", () => {
    const rows = buildMemoryRows([], "");
    expect(rows).toHaveLength(0);
  });
});
