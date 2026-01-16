# Web Module (packages/apps/web)

## Overview

The web application entry point that renders the shared app in a browser environment.

## State Machine

```
┌─────────────────────────────────────────────────────────────────────────┐
│                      WEB APP STATE MACHINE                               │
└─────────────────────────────────────────────────────────────────────────┘

                    ┌───────────────┐
                    │   PAGE LOAD   │
                    └───────┬───────┘
                            │
                            ▼
                    ┌───────────────┐
                    │  VITE BUILD   │──────► Development or production
                    │  / DEV        │        bundling
                    └───────┬───────┘
                            │
                            ▼
                    ┌───────────────┐
                    │  INDEX.HTML   │──────► Root HTML document
                    └───────┬───────┘
                            │
                            ▼
                    ┌───────────────┐
                    │  ENTRY.TSX    │──────► Solid.js render
                    └───────┬───────┘
                            │
                            ▼
                    ┌───────────────┐
                    │ AppInterface  │──────► From packages/app
                    │ Component     │
                    └───────┬───────┘
                            │
                            ▼
                    ┌───────────────┐
                    │   APP READY   │──────► Connected to OpenCode
                    └───────────────┘
```

## Directory Structure

```
packages/apps/web/
├── src/
│   └── entry.tsx           # Web-specific entry point
├── index.html              # HTML entry
├── vite.config.ts          # Vite configuration
├── package.json            # Dependencies
└── tsconfig.json           # TypeScript config
```

## Entry Point Flow

```
┌─────────────────────────────────────────────────────────────────────────┐
│                      ENTRY POINT FLOW                                    │
└─────────────────────────────────────────────────────────────────────────┘

  ┌──────────────────┐
  │   index.html     │
  │   <div id="root">│
  └────────┬─────────┘
           │
           ▼
  ┌──────────────────┐
  │   entry.tsx      │
  │   render()       │
  └────────┬─────────┘
           │
           ▼
  ┌──────────────────┐
  │ PlatformProvider │──────► Web platform (native dialogs = null)
  └────────┬─────────┘
           │
           ▼
  ┌──────────────────┐
  │ AppBaseProviders │──────► Theme, Font, Dialog, etc.
  └────────┬─────────┘
           │
           ▼
  ┌──────────────────┐
  │  AppInterface    │──────► Server URL detection
  └────────┬─────────┘
           │
           ▼
  ┌──────────────────┐
  │     ROUTER       │──────► /orchestra, /session, etc.
  └──────────────────┘
```

## Server URL Resolution

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    SERVER URL RESOLUTION                                 │
└─────────────────────────────────────────────────────────────────────────┘

                    ┌───────────────┐
                    │ getServerUrl()│
                    └───────┬───────┘
                            │
        ┌───────────────────┼───────────────────┐
        │                   │                   │
        ▼                   ▼                   ▼
┌───────────────┐   ┌───────────────┐   ┌───────────────┐
│  PRODUCTION   │   │  DEVELOPMENT  │   │   OPENCODE    │
│  window.      │   │  localhost:   │   │    .AI        │
│  location.    │   │  4096         │   │  localhost:   │
│  origin       │   │  (default)    │   │  4096         │
└───────────────┘   └───────────────┘   └───────────────┘
```

## Platform Implementation

The web platform provides fallback implementations:

```typescript
const webPlatform: Platform = {
  platform: "web",

  // Returns null (no native dialogs)
  openDirectoryPickerDialog: () => null,
  openFilePickerDialog: () => null,
  saveFilePickerDialog: () => null,

  // Uses window.open for external links
  openLink: (url) => window.open(url, "_blank")
}
```

## Key Features

### Browser Compatibility
- Works in all modern browsers
- No native dependencies
- Falls back to browser APIs

### Development Mode
- Vite hot module replacement (HMR)
- Fast refresh for Solid.js
- CSS hot updates

### Production Build
- Optimized Vite bundle
- Tree shaking
- Code splitting

## Connections

| Source | Target | Protocol |
|--------|--------|----------|
| entry.tsx | packages/app | ES imports |
| AppInterface | OpenCode Server | HTTP REST |
| Vite | Browser | HTTP (port 3005/3006) |

## Configuration

### vite.config.ts
```typescript
export default defineConfig({
  plugins: [tailwindcss(), solidPlugin()],
  server: {
    port: 3005  // Falls back to 3006 if in use
  }
})
```

### Environment Variables
- `VITE_OPENCODE_SERVER_HOST` - Server hostname
- `VITE_OPENCODE_SERVER_PORT` - Server port (default 4096)
