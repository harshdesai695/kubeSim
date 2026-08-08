# Workloads Panel

**Folder:** `src/components/workloads/` — `WorkloadsPanel.tsx`

## What it is

The left dock to **create and manage every object type**, scoped to the active namespace. It has a
create form (the **New** button) and grouped lists of existing objects with inline actions.

## Create form (New)

A single form whose fields adapt to the selected **kind**:

- **Workloads:** Deployment, ReplicaSet, Pod, StatefulSet, DaemonSet, Job, CronJob — image, replicas,
  schedule, refs (ConfigMaps/Secrets/PVCs), and a **Scheduling** block for Pods (CPU/mem requests,
  nodeSelector, toleration, priorityClass).
- **Networking:** Service, Ingress, NetworkPolicy.
- **Config/Storage:** ConfigMap, Secret, PVC, PV.
- **RBAC:** ServiceAccount, Role, RoleBinding, ResourceQuota, LimitRange (with cluster-scope toggles).
- **Scheduling policy:** PriorityClass, PodDisruptionBudget.

## Sections (existing objects)

Rows for each workload/type with quick actions (scale, delete, edit image, resize/snapshot PVCs, etc.),
plus dedicated sections:

- **RBAC & Security** — rows + an **"Inspect as"** subject picker that drives the canvas permission overlay.
- **Scheduling Policy** — PriorityClass & PodDisruptionBudget rows.
- **Extensibility (CRDs)** — register the sample operator, browse CRDs, and a **dynamic create form**
  generated from each CRD's schema, plus its Custom Resource rows.
- **Storage & Autoscaling** — create VPAs, and manage volume snapshots (with Restore).

## How to use

Rendered in the workspace (toggle via the top bar). It reads the store and calls the same actions the CLI
uses. On mobile it becomes an overlay with a backdrop.
</content>
