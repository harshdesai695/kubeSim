# useClusterStore

**File:** `src/store/useClusterStore.ts`

## What it is

The heart of kubeSim — a single [Zustand](https://github.com/pmndrs/zustand) store that acts as the
cluster's **etcd**. It holds every object array (nodes, pods, deployments, services, RBAC, CRDs, storage,
autoscalers, …), the global context (namespace, clusters, sim clock), UI flags, and **all mutation
actions**. It also contains the `reconcile()` control loop and the operator/GC/autoscale ticks.

Every action here is called identically by the GUI and the CLI, guaranteeing GUI ↔ CLI parity.

## Key state

- **Objects:** `nodes, pods, replicaSets, deployments, statefulSets, daemonSets, jobs, cronJobs, hpas,
  services, ingresses, networkPolicies, configMaps, secrets, persistentVolumes, persistentVolumeClaims`
- **RBAC (Phase 8):** `serviceAccounts, roles, clusterRoles, roleBindings, clusterRoleBindings,
  resourceQuotas, limitRanges`
- **Scheduling (Phase 9):** `priorityClasses, podDisruptionBudgets`
- **Extensibility (Phase 10):** `crds, customResources`
- **Storage/autoscale (Phase 12):** `volumeSnapshots, vpas`
- **Context:** `namespace, namespaces, clusters, activeClusterId, simClock, timeScale`, `ui`, `events`

## Key actions (grouped)

| Group | Examples |
|---|---|
| Workloads | `createPod, createDeployment, scaleDeployment, updateDeploymentImage, rollbackDeployment, killPod, deletePod` |
| Networking | `createService, createIngress, createNetworkPolicy` |
| Config/Storage | `createConfigMap, updateConfigMap` (hot-reload), `createSecret, createPVC, resizePVC, createVolumeSnapshot, restoreVolumeSnapshot` |
| RBAC | `createServiceAccount, createRole, createRoleBinding, createResourceQuota, createLimitRange, setRbacSubject` |
| Scheduling | `createPriorityClass, createPodDisruptionBudget, setPodProbe, cordonNode, drainNode` |
| Extensibility | `createCRD, registerSampleOperator, createCustomResource, updateCustomResource` |
| Autoscaling | `createHPA, createVPA` |
| Multi-cluster | `createCluster, switchCluster, deleteCluster` |
| Lifecycle | `reconcile, operatorTick, autoscaleStorageTick, garbageCollect, resetCluster, exportSnapshot, importSnapshot` |

## How to use

**In a component** — subscribe with a selector (return primitives or use `useShallow` for derived arrays
to avoid render loops):

```ts
import { useClusterStore } from "@/store/useClusterStore";

const pods = useClusterStore((s) => s.pods);
const createDeployment = useClusterStore((s) => s.createDeployment);
createDeployment({ image: "nginx:1.25", replicas: 3 });
```

**Outside React** (CLI, engines) — read/mutate imperatively:

```ts
const s = useClusterStore.getState();
s.scaleDeployment(uid, 5);
```

## Gotchas

- **Never return a freshly-built array/object from a selector** (e.g. `s.pods.filter(...)`) without
  `useShallow` — it causes an infinite render loop. Prefer selecting raw arrays and deriving with
  `useMemo`.
- The reconcile loop only writes when a `dirty` flag flips, so most ticks are no-ops.
- `exportSnapshot()` intentionally **excludes** `clusters`/`activeClusterId` so multi-cluster switching
  (which stores snapshots per cluster) doesn't recurse.
</content>
