# UI Module (packages/apps/ui)

## Overview

A reusable Solid.js UI component library providing design system components used throughout the Orchestra apps.

## Component Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    UI COMPONENT HIERARCHY                                │
└─────────────────────────────────────────────────────────────────────────┘

                        ┌───────────────┐
                        │  ThemeProvider │
                        │  (root)        │
                        └───────┬───────┘
                                │
        ┌───────────────────────┼───────────────────────┐
        │                       │                       │
        ▼                       ▼                       ▼
┌───────────────┐       ┌───────────────┐       ┌───────────────┐
│   Primitives  │       │   Composite   │       │   Context     │
│               │       │   Components  │       │   Providers   │
│ • Button      │       │ • Dialog      │       │ • DialogCtx   │
│ • Icon        │       │ • Toast       │       │ • ThemeCtx    │
│ • Input       │       │ • DropdownMenu│       │ • MarkedCtx   │
│ • Avatar      │       │ • Collapsible │       │ • CodeCtx     │
│ • Spinner     │       │ • Tooltip     │       │ • DiffCtx     │
└───────────────┘       └───────────────┘       └───────────────┘
```

## Directory Structure

```
packages/apps/ui/
├── src/
│   ├── avatar.tsx
│   ├── button.tsx
│   ├── code.tsx
│   ├── collapsible.tsx
│   ├── diff.tsx
│   ├── diff-changes.tsx
│   ├── dialog.tsx
│   ├── dropdown-menu.tsx
│   ├── font.tsx
│   ├── icon.tsx
│   ├── icon-button.tsx
│   ├── logo.tsx
│   ├── resize-handle.tsx
│   ├── spinner.tsx
│   ├── toast.tsx
│   ├── tooltip.tsx
│   ├── theme.tsx
│   ├── context/
│   │   ├── dialog.tsx
│   │   ├── code.tsx
│   │   ├── diff.tsx
│   │   └── marked.tsx
│   └── index.ts           # Public exports
├── package.json
└── tsconfig.json
```

## Component State Patterns

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    BUTTON COMPONENT STATES                               │
└─────────────────────────────────────────────────────────────────────────┘

  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐
  │   DEFAULT   │───►│    HOVER    │───►│   ACTIVE    │───►│  DISABLED   │
  │             │    │             │    │  (pressed)  │    │             │
  └─────────────┘    └─────────────┘    └─────────────┘    └─────────────┘

  Variants:
  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐
  │   primary   │    │  secondary  │    │    ghost    │
  │  (accent)   │    │  (neutral)  │    │(transparent)│
  └─────────────┘    └─────────────┘    └─────────────┘

  Sizes:
  ┌─────────────┐    ┌─────────────┐
  │    small    │    │    large    │
  │   (text)    │    │  (icon+txt) │
  └─────────────┘    └─────────────┘
```

## Icon System

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        ICON SYSTEM                                       │
└─────────────────────────────────────────────────────────────────────────┘

  Icon Names (Lucide-based):
  ┌─────────────────────────────────────────────────────────────────────┐
  │  brain       │  branch      │  server      │  task        │  plus  │
  │  pencil-line │  archive     │  folder-add  │  chevron-*   │  ...   │
  └─────────────────────────────────────────────────────────────────────┘

  Usage:
  <Icon name="brain" class="size-4" />
  <Icon name="plus" size="small" />
```

## Theme System

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        THEME SYSTEM                                      │
└─────────────────────────────────────────────────────────────────────────┘

                    ┌───────────────┐
                    │ ThemeProvider │
                    └───────┬───────┘
                            │
        ┌───────────────────┼───────────────────┐
        │                   │                   │
        ▼                   ▼                   ▼
┌───────────────┐   ┌───────────────┐   ┌───────────────┐
│  Color Scheme │   │    Themes     │   │    Fonts      │
│               │   │               │   │               │
│ • system      │   │ (configurable)│   │ • Sans        │
│ • light       │   │               │   │ • Mono        │
│ • dark        │   │               │   │               │
└───────────────┘   └───────────────┘   └───────────────┘
```

## CSS Custom Properties

```css
/* Background colors */
--background-base
--background-elevated
--background-stronger

/* Text colors */
--text-base
--text-strong
--text-weak
--text-accent

/* Border colors */
--border-base
--border-weak-base

/* Surface colors */
--surface-raised-base-hover
--surface-warning-strong
```

## Key Components

### Button
- Variants: `primary`, `secondary`, `ghost`
- Sizes: `small`, `large`
- Supports icons and loading states

### Icon
- Lucide icon set
- Size variants: `small`, `normal`
- Custom classes support

### Dialog (Modal)
- Overlay backdrop
- Focus trap
- Escape key handling

### Toast
- Auto-dismiss with timer
- Multiple placement options
- Action buttons support

## Connections

| Source | Target | Protocol |
|--------|--------|----------|
| Components | Solid.js | JSX |
| Theme | CSS Variables | CSS-in-JS |
| Icons | Lucide Icons | SVG imports |

## Usage Example

```tsx
import { Button } from "@opencode-ai/ui/button"
import { Icon } from "@opencode-ai/ui/icon"

<Button variant="primary" size="small">
  <Icon name="plus" class="size-4" />
  Add Worker
</Button>
```
