// @refresh reload
import { render } from "solid-js/web"
import { createSignal, onMount, Show } from "solid-js"
import { AppBaseProviders, AppInterface, PlatformProvider, Platform } from "@opencode-ai/app"

// Check if we're running inside Tauri
const isTauri = () => typeof window !== "undefined" && "__TAURI_INTERNALS__" in window

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

// Create platform with fallbacks for browser mode
const createPlatform = (): Platform => ({
  platform: isTauri() ? "desktop" : "web",

  async openDirectoryPickerDialog(opts) {
    if (!isTauri()) return null
    const { open } = await import("@tauri-apps/plugin-dialog")
    const result = await open({
      directory: true,
      multiple: opts?.multiple ?? false,
      title: opts?.title ?? "Choose a folder",
    })
    return result
  },

  async openFilePickerDialog(opts) {
    if (!isTauri()) return null
    const { open } = await import("@tauri-apps/plugin-dialog")
    const result = await open({
      directory: false,
      multiple: opts?.multiple ?? false,
      title: opts?.title ?? "Choose a file",
    })
    return result
  },

  async saveFilePickerDialog(opts) {
    if (!isTauri()) return null
    const { save } = await import("@tauri-apps/plugin-dialog")
    const result = await save({
      title: opts?.title ?? "Save file",
      defaultPath: opts?.defaultPath,
    })
    return result
  },

  openLink(url: string) {
    if (isTauri()) {
      import("@tauri-apps/plugin-shell").then(({ open }) => {
        void open(url).catch(() => undefined)
      })
    } else {
      window.open(url, "_blank")
    }
  },
})

// Stops mousewheel events from reaching Tauri's pinch-to-zoom handler
root?.addEventListener("mousewheel", (e) => {
  e.stopPropagation()
})

render(() => {
  const [isMacOS, setIsMacOS] = createSignal(false)
  const platform = createPlatform()

  onMount(async () => {
    if (isTauri()) {
      try {
        const { type: ostype } = await import("@tauri-apps/plugin-os")
        setIsMacOS(ostype() === "macos")
      } catch {
        // Not in Tauri environment
      }
    }
  })

  return (
    <PlatformProvider value={platform}>
      <AppBaseProviders>
        <Show when={isMacOS()}>
          <div class="mx-px bg-background-base border-b border-border-weak-base h-8" data-tauri-drag-region />
        </Show>
        <AppInterface defaultUrl={getServerUrl()} />
      </AppBaseProviders>
    </PlatformProvider>
  )
}, root!)
