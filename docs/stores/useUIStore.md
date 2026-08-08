# useUIStore

**File:** `src/store/useUIStore.ts`

## What it is

A tiny store for **ephemeral, cross-component UI flags** that don't belong in the cluster state and don't
need persistence — mainly which overlay/menu is open.

## Key state

- `scenariosOpen` — the Scenarios menu.
- `settingsOpen` — the Settings panel.
- `walkthrough` — the active guided-walkthrough state (or null).

## Key actions

`openScenarios / closeScenarios`, `openSettings / closeSettings`, and walkthrough controls.

## How to use

```ts
import { useUIStore } from "@/store/useUIStore";
const openSettings = useUIStore((s) => s.openSettings);
```

Note: panel toggles that are conceptually part of the workspace (Terminal, Events, Workloads, Drawer)
live in `useClusterStore.ui`, while purely presentational menus live here.
</content>
