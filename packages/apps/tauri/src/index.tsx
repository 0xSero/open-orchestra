// @refresh reload
import { render } from "solid-js/web"
import { AppBaseProviders, AppInterface, PlatformProvider, Platform } from "@opencode-ai/app"
import { open, save } from "@tauri-apps/plugin-dialog"
import { open as shellOpen } from "@tauri-apps/plugin-shell"
import { type as ostype } from "@tauri-apps/plugin-os"

const root = document.getElementById("root")
if (import.meta.env.DEV && !(root instanceof HTMLElement)) {
  throw new Error(
    "Root element not found. Did you forget to add it to your index.html? Or maybe the id attribute got misspelled?",
  )
}

// Get port from Rust's initialization script or env
const getServerUrl = () => {
  const port = window.__OPENCODE__?.port ?? 4096
  return `http://localhost:${port}`
}

const platform: Platform = {
  platform: "desktop",

  async openDirectoryPickerDialog(opts) {
    const result = await open({
      directory: true,
      multiple: opts?.multiple ?? false,
      title: opts?.title ?? "Choose a folder",
    })
    return result
  },

  async openFilePickerDialog(opts) {
    const result = await open({
      directory: false,
      multiple: opts?.multiple ?? false,
      title: opts?.title ?? "Choose a file",
    })
    return result
  },

  async saveFilePickerDialog(opts) {
    const result = await save({
      title: opts?.title ?? "Save file",
      defaultPath: opts?.defaultPath,
    })
    return result
  },

  openLink(url: string) {
    void shellOpen(url).catch(() => undefined)
  },
}

// Stops mousewheel events from reaching Tauri's pinch-to-zoom handler
root?.addEventListener("mousewheel", (e) => {
  e.stopPropagation()
})

render(() => {
  return (
    <PlatformProvider value={platform}>
      <AppBaseProviders>
        {ostype() === "macos" && (
          <div class="mx-px bg-background-base border-b border-border-weak-base h-8" data-tauri-drag-region />
        )}
        <AppInterface defaultUrl={getServerUrl()} />
      </AppBaseProviders>
    </PlatformProvider>
  )
}, root!)
