# scheduler

**File:** `src/lib/scheduler.ts`

## What it is

A simplified **kube-scheduler** implementing the real `filter → score → bind` pipeline, plus
**preemption**. Used by `useClusterStore.reconcile()` to place Pending pods.

## Key exports

| Function | Purpose |
|---|---|
| `podRequests(pod)` | Sum a pod's container CPU/memory requests |
| `computeQoS(pod)` | Derive `Guaranteed \| Burstable \| BestEffort` |
| `nodeRequested(node, pods)` | CPU/memory already requested on a node |
| `toleratesNode(pod, node)` | Whether the pod tolerates the node's taints |
| `filterNodes(pod, nodes, pods)` | **Filter**: feasible nodes + infeasibility reasons |
| `scoreNodes(pod, feasible, pods)` | **Score**: least-requested + topology spread |
| `schedulePod(pod, nodes, pods)` | Full pipeline → `{ nodeName }` or `{ reason }` |
| `violatesPDB(victim, pods, pdbs)` | Whether evicting a pod breaks a PodDisruptionBudget |
| `findPreemption(pod, nodes, pods, pdbs)` | Find lower-priority victims to make room |

## Filter predicates

Resource fit, taints/tolerations, `nodeSelector`, pod anti-affinity, and node readiness
(`Ready`, not draining, not `unschedulable`/cordoned).

## How to use

Consumed inside the reconcile loop; you generally don't call it directly:

```ts
import { schedulePod, findPreemption } from "@/lib/scheduler";
const res = schedulePod(pod, nodes, pods);
if (res.nodeName) bind(pod, res.nodeName);
else if ((pod.spec.priority ?? 0) > 0) findPreemption(pod, nodes, pods, pdbs);
```

Unschedulable pods stay Pending and get a `FailedScheduling` event with `res.reason`.
</content>
