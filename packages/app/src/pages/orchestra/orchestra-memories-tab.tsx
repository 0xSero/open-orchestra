import { Icon } from "@opencode-ai/ui/icon";
import { Tag } from "@opencode-ai/ui/tag";
import { TextField } from "@opencode-ai/ui/text-field";
import { For, Show, createMemo } from "solid-js";
import { createStore } from "solid-js/store";
import type { MemoryEntry } from "@/pages/orchestra/orchestra-types";
import { buildMemoryRows } from "@/pages/orchestra/orchestra-memories-tab-helpers";

export function MemoriesTab(props: { entries: MemoryEntry[] }) {
  const [state, setState] = createStore({ query: "" });

  const rows = createMemo(() => buildMemoryRows(props.entries, state.query));

  return (
    <div class="space-y-6">
      <div class="flex items-center justify-between gap-4">
        <div class="text-14-regular text-text-weak">
          {props.entries.length} memor{props.entries.length === 1 ? "y" : "ies"} recorded
        </div>
        <div class="w-full max-w-xs">
          <TextField
            label="Filter"
            placeholder="Search memories"
            value={state.query}
            onChange={(value) => setState("query", value)}
          />
        </div>
      </div>

      <div class="border border-border-base rounded-lg overflow-hidden">
        <table class="w-full">
          <thead>
            <tr class="bg-surface-raised-base border-b border-border-base">
              <th class="text-left px-4 py-2 text-12-medium text-text-weak font-medium">Content</th>
              <th class="text-left px-4 py-2 text-12-medium text-text-weak font-medium hidden sm:table-cell">Tags</th>
              <th class="text-left px-4 py-2 text-12-medium text-text-weak font-medium hidden md:table-cell">Source</th>
              <th class="text-left px-4 py-2 text-12-medium text-text-weak font-medium hidden md:table-cell">Created</th>
            </tr>
          </thead>
          <tbody>
            <For
              each={rows()}
              fallback={
                <tr>
                  <td colspan="4" class="px-4 py-8 text-center text-text-weak">
                    <div class="flex flex-col items-center gap-2">
                      <Icon name="task" class="size-8 opacity-50" />
                      <p class="text-14-regular">No memories recorded</p>
                    </div>
                  </td>
                </tr>
              }
            >
              {(entry) => (
                <tr class="border-b border-border-base last:border-b-0">
                  <td class="px-4 py-3 text-13-regular text-text-base">{entry.content}</td>
                  <td class="px-4 py-3 hidden sm:table-cell">
                    <Show when={entry.tags?.length} fallback={<span class="text-12-regular text-text-weaker">—</span>}>
                      <div class="flex flex-wrap gap-1">
                        <For each={entry.tags ?? []}>{(tag) => <Tag size="normal">{tag}</Tag>}</For>
                      </div>
                    </Show>
                  </td>
                  <td class="px-4 py-3 text-12-regular text-text-weak hidden md:table-cell">{entry.sourceLabel}</td>
                  <td class="px-4 py-3 text-12-regular text-text-weak hidden md:table-cell">{entry.createdAtLabel}</td>
                </tr>
              )}
            </For>
          </tbody>
        </table>
      </div>
    </div>
  );
}
