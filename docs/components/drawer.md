# Detail Drawer

**Folder:** `src/components/drawer/` — `DetailDrawer.tsx`

## What it is

The right-side **object inspector**. Clicking any object (canvas or panel) opens the drawer with its
details: a read-only **YAML manifest** (Monaco editor), and — depending on kind — logs, exec, status,
endpoints, relationships, and action buttons.

## What it shows per kind

- **Pod:** status, node, IP, restarts, **QoS/readiness/priority**, scheduling reason, tabs for
  YAML / Logs / Exec, and **probe + finalizer** controls (fail liveness/readiness, add/remove finalizer).
- **Node:** CPU/memory gauges, labels, **Cordon/Uncordon + Drain** buttons, SchedulingDisabled badge.
- **Service:** type, address, selector, live **Endpoints** and the derived **EndpointSlice**, Send / x10.
- **Ingress:** the routing table with per-rule Send.
- **Deployment/ReplicaSet/StatefulSet/…:** status, replicas, revisions, relationships.
- **Control-plane component:** description + a small activity panel.
- **RBAC / scheduling / extensibility / storage kinds** (Role, PriorityClass, PDB, CRD, CustomResource,
  VolumeSnapshot, VPA, …): rendered as read-only YAML via a generic manifest view.

## How to use

Open it with the store's `openDrawer` action:

```ts
useClusterStore.getState().openDrawer({ kind: "Pod", name, id: uid });
```

It reads `ui.selected` from [`useClusterStore`](../stores/useClusterStore.md), resolves the object from
the matching array (built-ins plus a dynamic resolver for CRD kinds), and renders YAML via
[`lib/manifest`](../libraries/manifest.md). Logs/exec come from [`lib/logs`](../libraries/logs.md).
</content>
