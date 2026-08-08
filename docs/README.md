# kubeSim — Component Documentation

This folder documents **every component and module** in kubeSim: what it is and how to use it.
Start with the [Architecture Overview](./architecture.md), then dive into any area below.

## Architecture

- [Architecture Overview](./architecture.md) — how the pieces fit together, the reconcile loop, and data flow.

## State stores (`src/store/`)

The store layer is the simulated **etcd** — the single source of truth. All UI reads from it; all
mutations go through store actions (used identically by the GUI and the CLI).

| Doc | Module | Purpose |
|---|---|---|
| [useClusterStore](./stores/useClusterStore.md) | `store/useClusterStore.ts` | The cluster "etcd" + every object action + the reconcile loop |
| [useFlowStore](./stores/useFlowStore.md) | `store/useFlowStore.ts` | Transient API-request-flow state (packets, hit counters) |
| [useTerminalStore](./stores/useTerminalStore.md) | `store/useTerminalStore.ts` | Terminal scrollback + command history |
| [useSettingsStore](./stores/useSettingsStore.md) | `store/useSettingsStore.ts` | Persisted user settings (theme, speed, font) |
| [useUIStore](./stores/useUIStore.md) | `store/useUIStore.ts` | Ephemeral UI flags (menus, walkthrough) |
| [types](./stores/types.md) | `store/types.ts` | All Kubernetes object TypeScript shapes |

## Domain libraries (`src/lib/`)

Pure logic modules with no React — reused by the store, the CLI, and components.

| Doc | Module | Purpose |
|---|---|---|
| [cli](./libraries/cli.md) | `lib/cli.ts` | `kubectl`-style command parser & dispatcher |
| [scheduler](./libraries/scheduler.md) | `lib/scheduler.ts` | Filter → score → bind scheduling + preemption |
| [network](./libraries/network.md) | `lib/network.ts` | Endpoints, kube-proxy, DNS, NetworkPolicy, latency |
| [operator](./libraries/operator.md) | `lib/operator.ts` | Sample Database operator reconcile loop |
| [rbac](./libraries/rbac.md) | `lib/rbac.ts` | `can-i` permission evaluation |
| [storage](./libraries/storage.md) | `lib/storage.ts` | PV binding, dynamic provisioning, base64 |
| [cron](./libraries/cron.md) | `lib/cron.ts` | Cron expression parsing & next-run |
| [manifest](./libraries/manifest.md) | `lib/manifest.ts` | Object → YAML/JSON manifest rendering |
| [yaml](./libraries/yaml.md) | `lib/yaml.ts` | Minimal YAML parser for `apply -f` |
| [workloads](./libraries/workloads.md) | `lib/workloads.ts` | Pod factory, IP/color/uid helpers |
| [scenarios](./libraries/scenarios.md) | `lib/scenarios.ts` | Guided scenario presets |
| [controlPlane](./libraries/controlPlane.md) | `lib/controlPlane.ts` | Control-plane component metadata |
| [selector](./libraries/selector.md) | `lib/selector.ts` | Label-selector matching |
| [status](./libraries/status.md) | `lib/status.ts` | Status → color/CSS mapping |
| [logs](./libraries/logs.md) | `lib/logs.ts` | Synthetic pod logs + `exec` simulation |
| [echo](./libraries/echo.md) | `lib/echo.ts` | GUI→CLI command echo bridge |
| [time](./libraries/time.md) | `lib/time.ts` | Age / duration formatting |

## UI components (`src/components/`)

| Doc | Folder | Purpose |
|---|---|---|
| [Canvas](./components/canvas.md) | `components/canvas/` | Interactive cluster topology + overlays |
| [Canvas Nodes](./components/canvas-nodes.md) | `components/canvas/nodes/` | Custom React Flow node renderers |
| [Detail Drawer](./components/drawer.md) | `components/drawer/` | Per-object inspector (YAML/logs/exec) |
| [Workloads Panel](./components/workloads.md) | `components/workloads/` | Create & manage every object type |
| [Terminal](./components/terminal.md) | `components/terminal/` | `kubectl`-style shell |
| [Scenarios](./components/scenarios.md) | `components/scenarios/` | Guided demos menu + walkthrough |
| [Settings](./components/settings.md) | `components/settings/` | Theme, speed, snapshot import/export |
| [Events](./components/events.md) | `components/events/` | Cluster event feed |
| [Layout](./components/layout.md) | `components/layout/` | Top navigation + workspace shell |
| [System](./components/system.md) | `components/system/` | Reconcile engine, theme, onboarding |

## Data files

| Doc | Path | Purpose |
|---|---|---|
| [Sample scenarios](./samples.md) | `samples/*.json` | Importable cluster snapshots |

