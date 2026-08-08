# Scenarios

**Folder:** `src/components/scenarios/`

## What it is

The **guided demos** feature: a menu of one-click scenario presets and a step-by-step walkthrough that
narrates what to watch.

## Components

| File | What it is |
|---|---|
| `ScenariosMenu.tsx` | The menu (opened from the top bar) listing presets from [`lib/scenarios`](../libraries/scenarios.md). Selecting one resets the cluster and builds the scenario. |
| `Walkthrough.tsx` | The overlay that steps through a scenario's narrated stages, highlighting what's happening. |

## How to use

Open **Scenarios** in the top bar and pick, e.g., *Full Stack* or *Self-Healing*. The preset creates the
objects and the walkthrough guides you (e.g. "kill a pod and watch the ReplicaSet controller replace it").

State: the open/closed menu and the active walkthrough live in [`useUIStore`](../stores/useUIStore.md);
the presets themselves are data in [`lib/scenarios`](../libraries/scenarios.md).
</content>
