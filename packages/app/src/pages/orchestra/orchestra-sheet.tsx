import type { JSX } from "solid-js";
import { Show } from "solid-js";
import { Portal } from "solid-js/web";
import { IconButton } from "@opencode-ai/ui/icon-button";

interface SheetProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: JSX.Element;
}

export function Sheet(props: SheetProps) {
  return (
    <Portal>
      <Show when={props.open}>
        <div
          class="fixed inset-0 z-40 bg-black/20"
          onClick={props.onClose}
        />
        <div class="fixed inset-y-0 right-0 z-50 w-full max-w-md bg-background-base border-l border-border-base shadow-xl flex flex-col">
          <div class="flex items-center justify-between px-4 py-3 border-b border-border-base shrink-0">
            <h2 class="text-16-semibold text-text-strong">{props.title}</h2>
            <IconButton icon="close" variant="ghost" onClick={props.onClose} />
          </div>
          <div class="flex-1 overflow-y-auto">
            {props.children}
          </div>
        </div>
      </Show>
    </Portal>
  );
}
