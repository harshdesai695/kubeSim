# useSettingsStore

**File:** `src/store/useSettingsStore.ts`

## What it is

The only **persisted** store (via Zustand's `persist` middleware → `localStorage`). It holds user
preferences that should survive reloads.

## Key state

| Field | Purpose |
|---|---|
| `theme` | `"dark" \| "light"` — applied by [`ThemeApplier`](../components/system.md) |
| `simSpeed` | Reconcile cadence multiplier (drives [`ReconcileEngine`](../components/system.md)) |
| `terminalFontSize` | Terminal text size |
| `showCliToast` | Whether GUI actions echo their CLI command |
| `tourDone` | Whether the onboarding tour has been dismissed |

## How to use

```ts
import { useSettingsStore } from "@/store/useSettingsStore";
const theme = useSettingsStore((s) => s.theme);
useSettingsStore.getState().setTheme("light");
```

Most of these are edited from the [Settings panel](../components/settings.md). Because it persists,
avoid storing large or cluster-specific data here — that belongs in `useClusterStore` / snapshots.
</content>
