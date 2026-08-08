# types

**File:** `src/store/types.ts`

## What it is

The **type dictionary** for the whole simulator — TypeScript interfaces that mirror (a simplified subset
of) real Kubernetes object shapes. Every store array, CLI table, drawer YAML, and library function is
typed against these.

## What's inside

- **Core meta:** `ObjectMeta` (name, namespace, uid, labels, ownerReferences, `finalizers`,
  `deletionTimestamp`), `OwnerReference`, `Taint`, `Toleration`.
- **Nodes & pods:** `WorkerNode` (capacity/usage, taints, `unschedulable`), `Pod` (spec containers with
  `requests`/`limits`, scheduling controls, probe intents; status with `qos`/`ready`/`schedulingReason`),
  `Container`, `PodTemplate`, `PodPhase`, `QoSClass`.
- **Workloads:** `ReplicaSet, Deployment, StatefulSet, DaemonSet, Job, CronJob, HorizontalPodAutoscaler`.
- **Scheduling policy:** `PriorityClass, PodDisruptionBudget`.
- **Networking:** `Service, Ingress, NetworkPolicy` + ports/rules.
- **Config & storage:** `ConfigMap, Secret, PersistentVolume` (with `reclaimPolicy`),
  `PersistentVolumeClaim, VolumeSnapshot, VerticalPodAutoscaler`.
- **RBAC:** `ServiceAccount, Role, ClusterRole, RoleBinding, ClusterRoleBinding, ResourceQuota,
  LimitRange`, plus `Subject`/`RoleRef`/`PolicyRule`.
- **Extensibility:** `CustomResourceDefinition, CustomResource, CRDField, OperatorPreset`.
- **Multi-cluster:** `ClusterContext`.
- **Events:** `ClusterEvent`, `EventType`.
- **Constants:** `DEFAULT_NAMESPACES`.

## How to use

Import the shapes you need anywhere:

```ts
import type { Pod, Deployment, CustomResourceDefinition } from "@/store/types";
```

Units are simplified and consistent: **CPU in cores** (fractional), **memory/storage in GiB**. When you
add a new object kind, define it here first, then thread it through the store, CLI registry, and drawer
resolver.
</content>
