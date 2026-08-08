# Architecture Overview

kubeSim is a **100% client-side** Kubernetes simulator. There is no backend, no container runtime, and
no network — every node, pod, and controller is simulated in-memory JavaScript state. The guiding
principle is **visual fidelity over literal accuracy**.

## The big picture

```
                    ┌─────────────────────────────────────────────┐
                    │              React UI (components/)           │
                    │  Canvas · Drawer · Workloads · Terminal · …   │
                    └───────────────┬─────────────────▲────────────┘
                        read (hooks)│                 │ actions
                                    ▼                 │
                    ┌─────────────────────────────────────────────┐
                    │        Zustand store = simulated etcd         │
                    │            store/useClusterStore.ts           │
                    │  objects[]  +  actions  +  reconcile()        │
                    └───────────────▲─────────────────┬────────────┘
                        pure logic  │                 │ ticks
                                    │                 ▼
                    ┌─────────────────────────────────────────────┐
                    │   Domain libraries (lib/)  ·  ReconcileEngine │
                    │  scheduler · network · operator · rbac · …    │
                    └─────────────────────────────────────────────┘
```

- **The store is the single source of truth** (the "etcd"). Everything else reads from it.
- **The GUI and the CLI call the exact same store actions** — there is no divergent code path. A button
  click and `kubectl scale …` both call `scaleDeployment(...)`.
- **Domain libraries** (`lib/`) are pure, React-free logic reused by the store, the CLI, and components.

## The reconcile loop

[`ReconcileEngine`](./components/system.md) mounts once and drives the simulation on a fixed interval
(scaled by the user's speed setting). Each tick calls, in order:

1. `reconcile()` — pod lifecycle, scheduler (filter → score → bind + preemption), probes, all controllers
   (ReplicaSet, Deployment rollout, StatefulSet, DaemonSet, Job, CronJob, HPA), node usage recompute.
2. `operatorTick()` — the sample Database operator reconciles Custom Resource children.
3. `autoscaleStorageTick()` — VPA recommendations + volume-snapshot readiness.
4. `garbageCollect()` — cascade GC of orphaned ReplicaSets/pods.

A tick only writes to the store when something actually changed (a `dirty` flag), keeping React
re-renders minimal.

## Data flow of a single action

```
user clicks "Scale +1"  ──►  store.scaleDeployment(uid)  ──►  set({ deployments })
        │                                                          │
        └── (or) kubectl scale deploy/x --replicas=N ──────────────┘
                                                                   ▼
                          reconcile() tick notices desired≠actual ──► spawns/removes pods
                                                                   ▼
                          React components re-render from new store state (animated)
```

## Simulated control plane

The four control-plane boxes (kube-apiserver, etcd, kube-scheduler, kube-controller-manager) are
metadata-only visual components ([`lib/controlPlane.ts`](./libraries/controlPlane.md)); the "work" they
represent is actually performed by the reconcile loop and store actions.

## Feature phases

kubeSim was built in phases; the stretch phases (8–13) added the advanced layers:

| Phase | Area |
|---|---|
| 0–7 | Core: nodes, workloads, networking, config/storage, advanced workloads, CLI, polish |
| 8 | RBAC & Security (ServiceAccounts, Roles, Bindings, ResourceQuota, LimitRange) |
| 9 | Scheduling realism & pod health (requests/limits, taints, affinity, priority, PDB, probes) |
| 10 | Extensibility: CRDs & a sample operator |
| 11 | Networking depth (DNS, EndpointSlices, pod-to-pod NetworkPolicy) |
| 12 | Storage & autoscaling depth (reclaim policies, snapshots, VPA, richer HPA) |
| 13 | Control-plane realism & multi-cluster (GC, finalizers, cordon/drain, contexts) |

## Persistence

Nothing is stored server-side. User settings persist to `localStorage`
([`useSettingsStore`](./stores/useSettingsStore.md)); a whole cluster can be exported/imported as a JSON
**snapshot** (see [Settings](./components/settings.md) and [Sample scenarios](./samples.md)).

