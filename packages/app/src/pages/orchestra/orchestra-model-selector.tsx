import type { ProviderListResponse } from "@opencode-ai/sdk/v2/client";
import { Popover as Kobalte } from "@kobalte/core/popover";
import { Icon } from "@opencode-ai/ui/icon";
import { List } from "@opencode-ai/ui/list";
import { Tag } from "@opencode-ai/ui/tag";
import { Show, createMemo, createSignal } from "solid-js";
import { useProviders } from "@/hooks/use-providers";

type ProviderItem = ProviderListResponse["all"][number];
type ProviderModel = ProviderItem["models"][string];
type GlobalModel = ProviderModel & { provider: ProviderItem };

export function ModelSelector(props: { value: string; onChange: (value: string) => void }) {
  const providers = useProviders();
  const [open, setOpen] = createSignal(false);

  const models = createMemo(() => {
    return providers
      .connected()
      .flatMap((provider) =>
        Object.values(provider.models || {}).map((model) => ({
          ...model,
          provider,
        }))
      ) as GlobalModel[];
  });

  const currentModel = createMemo(() => {
    if (!props.value) return undefined;
    const modelList = models();
    if (!modelList.length) return undefined;
    const parts = props.value.split("/");
    if (parts.length >= 2) {
      const providerId = parts[0];
      const modelId = parts.slice(1).join("/");
      return modelList.find((model) => model.provider.id === providerId && model.id === modelId);
    }
    return modelList.find((model) => model.id === props.value || `${model.provider.id}/${model.id}` === props.value);
  });

  const displayValue = createMemo(() => {
    const model = currentModel();
    if (model) return `${model.provider.name} / ${model.name}`;
    return props.value || "Select a model...";
  });

  return (
    <Kobalte open={open()} onOpenChange={setOpen} placement="bottom-start" gutter={4}>
      <Kobalte.Trigger
        class="w-full flex items-center justify-between px-3 py-2 border border-border-base rounded-lg bg-background-base hover:bg-surface-raised-base-hover transition-colors text-left"
      >
        <span class="text-14-regular text-text-base truncate">{displayValue()}</span>
        <Icon name="chevron-grabber-vertical" class="size-4 text-icon-weak shrink-0" />
      </Kobalte.Trigger>
      <Kobalte.Portal>
        <Kobalte.Content class="w-80 max-h-80 flex flex-col rounded-lg border border-border-base bg-surface-raised-stronger-non-alpha shadow-lg z-50 outline-none overflow-hidden">
          <Kobalte.Title class="sr-only">Select model</Kobalte.Title>
          <List
            class="flex-1 min-h-0 p-1 [&_[data-slot=list-scroll]]:flex-1 [&_[data-slot=list-scroll]]:min-h-0"
            search={{ placeholder: "Search models", autofocus: true }}
            emptyMessage="No models available"
            key={(model: GlobalModel) => `${model.provider.id}:${model.id}`}
            items={models}
            current={currentModel()}
            filterKeys={["provider.name", "name", "id"]}
            sortBy={(a, b) => a.name.localeCompare(b.name)}
            groupBy={(model: GlobalModel) => model.provider.name}
            onSelect={(model) => {
              if (model) {
                props.onChange(`${model.provider.id}/${model.id}`);
              }
              setOpen(false);
            }}
          >
            {(model: GlobalModel) => (
              <div class="w-full flex items-center gap-x-2 text-13-regular">
                <span class="truncate">{model.name}</span>
                <Show when={model.provider.id === "opencode" && (!model.cost || model.cost?.input === 0)}>
                  <Tag>Free</Tag>
                </Show>
                <Show when={model.name.includes("(latest)")}>
                  <Tag>Latest</Tag>
                </Show>
              </div>
            )}
          </List>
        </Kobalte.Content>
      </Kobalte.Portal>
    </Kobalte>
  );
}
