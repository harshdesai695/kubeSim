# System

**Folder:** `src/components/system/`

## What it is

Invisible, mount-once **system components** that keep the simulation alive and the app consistent. They
render nothing (or only side effects).

## Components

| File | What it is | How to use |
|---|---|---|
| `ReconcileEngine.tsx` | Drives the simulation. On a fixed interval (scaled by the speed setting) it calls `reconcile()`, `operatorTick()`, `autoscaleStorageTick()`, and `garbageCollect()`. | Mount once near the app root. This is what makes the cluster "feel alive". |
| `ThemeApplier.tsx` | Applies the current theme by toggling `html.light`/dark and CSS variables. | Reads `theme` from [`useSettingsStore`](../stores/useSettingsStore.md). |
| `OnboardingTour.tsx` | The first-run guided tour introducing Canvas, Terminal, Drawer, and Scenarios; dismissed state persists. | Shows until `tourDone` is set. |

## Notes

The reconcile cadence is `max(120ms, 500ms / simSpeed)`. Because each tick only writes when something
changed, the engine is cheap even at 60x. See the [Architecture Overview](../architecture.md) for the
full tick order.
</content>
