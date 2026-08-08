# Layout

**Folder:** `src/components/layout/`

## What it is

The **application shell** — the top navigation bar, the overall workspace layout, and the logo.

## Components

| File | What it is |
|---|---|
| `TopNav.tsx` | The top bar: brand + GitHub link, **cluster context selector** (multi-cluster), **namespace selector**, simulation-speed (1x/10x/60x), and toggles for Scenarios, Workloads, Terminal, Events, Settings, and **Restart Cluster**. |
| `Workspace.tsx` | The responsive layout that arranges the Workloads panel, Canvas, Terminal, Events, and Drawer, handling mobile collapse behavior. |
| `KubeLogo.tsx` | The helm-wheel SVG logo used in the top bar (and as the favicon). |

## How to use

`Workspace` is rendered by the app page and composes everything. `TopNav` reads/writes context via
[`useClusterStore`](../stores/useClusterStore.md) (namespace, clusters) and opens menus via
[`useUIStore`](../stores/useUIStore.md). Restart Cluster clears the store, terminal, and request-flow
state.
</content>
