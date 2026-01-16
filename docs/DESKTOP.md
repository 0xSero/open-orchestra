# Desktop Module (packages/apps/tauri)

## Overview

The Tauri-based desktop application that wraps the shared app with native capabilities.

## State Machine

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    TAURI APP STATE MACHINE                               │
└─────────────────────────────────────────────────────────────────────────┘

                    ┌───────────────┐
                    │  APP LAUNCH   │
                    └───────┬───────┘
                            │
                            ▼
                    ┌───────────────┐
                    │  RUST INIT    │──────► Tauri runtime initialization
                    │  (lib.rs)     │        Window creation
                    └───────┬───────┘
                            │
                            ▼
                    ┌───────────────┐
                    │  VITE DEV     │──────► Frontend dev server
                    │  SERVER       │        (port 1420)
                    └───────┬───────┘
                            │
                            ▼
                    ┌───────────────┐
                    │  WEBVIEW      │──────► Loads index.tsx
                    │  RENDER       │
                    └───────┬───────┘
                            │
        ┌───────────────────┼───────────────────┐
        │                   │                   │
        ▼                   ▼                   ▼
┌───────────────┐   ┌───────────────┐   ┌───────────────┐
│   isTauri()   │   │  Platform     │   │   OS Type     │
│   detection   │   │  Provider     │   │   Detection   │
└───────────────┘   └───────────────┘   └───────────────┘
        │                   │                   │
        └───────────────────┼───────────────────┘
                            │
                            ▼
                    ┌───────────────┐
                    │   APP READY   │──────► Render AppInterface
                    └───────────────┘
```

## Directory Structure

```
packages/apps/tauri/
├── src/
│   └── index.tsx           # Tauri-specific entry point
├── src-tauri/
│   ├── src/
│   │   ├── lib.rs          # Rust library (main logic)
│   │   └── main.rs         # Rust entry point
│   ├── Cargo.toml          # Rust dependencies
│   ├── tauri.conf.json     # Tauri configuration
│   └── capabilities/       # Tauri capabilities
├── index.html              # HTML entry
├── vite.config.ts          # Vite configuration
├── package.json            # Node dependencies
└── tsconfig.json           # TypeScript config
```

## Platform Detection Flow

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    PLATFORM DETECTION FLOW                               │
└─────────────────────────────────────────────────────────────────────────┘

                    ┌───────────────┐
                    │  index.tsx    │
                    └───────┬───────┘
                            │
                            ▼
                    ┌───────────────┐
                    │  isTauri()    │
                    │  checks for   │
                    │ __TAURI_      │
                    │ INTERNALS__   │
                    └───────┬───────┘
                            │
            ┌───────────────┴───────────────┐
            │                               │
            ▼                               ▼
    ┌───────────────┐               ┌───────────────┐
    │   IN TAURI    │               │   IN BROWSER  │
    │   WEBVIEW     │               │   (fallback)  │
    └───────┬───────┘               └───────┬───────┘
            │                               │
            ▼                               ▼
    ┌───────────────┐               ┌───────────────┐
    │ Dynamic import│               │  window.open  │
    │ @tauri-apps/  │               │  for links    │
    │ plugin-*      │               │  null returns │
    └───────────────┘               └───────────────┘
```

## Native Capabilities

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    NATIVE CAPABILITIES                                   │
└─────────────────────────────────────────────────────────────────────────┘

  ┌──────────────────┐    ┌──────────────────┐    ┌──────────────────┐
  │  plugin-dialog   │    │  plugin-shell    │    │   plugin-os      │
  │                  │    │                  │    │                  │
  │  • open()        │    │  • open(url)     │    │  • type()        │
  │  • save()        │    │    External      │    │    Detect macOS  │
  │  File/Directory  │    │    links         │    │    /Windows/     │
  │  pickers         │    │                  │    │    Linux         │
  └──────────────────┘    └──────────────────┘    └──────────────────┘
```

## Key Features

### Platform Provider
Creates a platform abstraction for:
- `openDirectoryPickerDialog()` - Native directory picker
- `openFilePickerDialog()` - Native file picker
- `saveFilePickerDialog()` - Native save dialog
- `openLink()` - Open URLs in default browser

### OS Detection
- Detects macOS for custom title bar styling
- Uses `@tauri-apps/plugin-os` for OS type

### Graceful Fallbacks
- All Tauri plugins use dynamic imports
- Falls back to browser APIs when not in Tauri

## Connections

| Source | Target | Protocol |
|--------|--------|----------|
| Rust Backend | Vite Dev Server | HTTP (port 1420) |
| index.tsx | packages/app | Solid.js imports |
| Tauri Plugins | Native OS | FFI |
| Webview | OpenCode Server | HTTP (port 4096) |

## Configuration

### tauri.conf.json
- Window size: 1000x800
- Title bar style: macOS transparent
- Dev server URL: http://localhost:1420

### vite.config.ts
- Port: 1420 (strict)
- Alias: `@` -> `../../app/src`
- HMR support
