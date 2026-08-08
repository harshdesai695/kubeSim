# controlPlane

**File:** `src/lib/controlPlane.ts`

## What it is

Static **metadata for the four control-plane components** shown in the master box: kube-apiserver, etcd,
kube-scheduler, kube-controller-manager. They are visual/educational — the actual work is done by the
reconcile loop and store actions.

## Key exports

| Export | Purpose |
|---|---|
| `CONTROL_PLANE` | Array of component descriptors (id, kind, name, description, mini-panel, empty state) |
| `getControlPlaneComponent(key)` | Look up a component by kind or id |
| `CONTROL_PLANE_KINDS` | List of the component kinds |

## How to use

```ts
import { getControlPlaneComponent } from "@/lib/controlPlane";
const cp = getControlPlaneComponent("Scheduler");
```

Used by the [`MasterNode`](../components/canvas-nodes.md) on the canvas and the
[Detail Drawer](../components/drawer.md), which shows each component's description and a small activity
panel.
</content>
