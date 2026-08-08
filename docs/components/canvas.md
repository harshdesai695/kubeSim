# Canvas

**Folder:** `src/components/canvas/`

## What it is

The interactive **cluster topology** — a pan/zoom graph (built on React Flow) that renders the control
plane, worker nodes, pods, services, ingress, config/secret boxes, the storage zone, and the external
client, plus several overlays. It's the visual centerpiece of kubeSim.

## Components

| File | What it is | How to use |
|---|---|---|
| `ClusterCanvas.tsx` | The React Flow canvas. Reconciles store objects into nodes/edges (preserving dragged positions), filters by namespace, and hosts the overlays. Also computes the **RBAC permission overlay** (dims objects a selected subject can't `get`). | Rendered once inside the workspace; reads the store directly. |
| `PodCard.tsx` | A compact pod chip nested in its node. Shows phase, container dots, restarts, QoS/readiness badges, a scheduling-reason warning, hit counter, and a kill action. Carries `data-pod-uid` so the flow layer can target it. | Rendered by `WorkerNodeCard`. |
| `RequestFlowLayer.tsx` | Animates the **API request flow** — lights up the full route `client → ingress → service → node → pod → back` as a glowing marching-ants path with a comet head (green response, red for blocked). Hides when no request is active. | Mounted inside `ClusterCanvas`; consumes [`useFlowStore`](../stores/useFlowStore.md). |
| `TrafficControl.tsx` | The always-visible **Traffic Simulator** launcher (bottom-center). Lists the namespace's Ingress routes + Services with Send/x10, plus an "auto traffic" toggle that fires requests on a timer. | Trigger flows for any loaded scenario. |
| `SchedulingQueue.tsx` | Shows Pending pods awaiting scheduling. | Visualizes the scheduler backlog. |
| `SelectorInspector.tsx` | Global label-query bar; matching pods/services stay bright, others dim. | Type `app=frontend`; uses [`lib/selector`](../libraries/selector.md). |
| `AddNodeControl.tsx` | Floating "+ Add Node" popover (name, CPU, memory, labels, **taints**). | Add worker nodes to the cluster. |
| `Gauge.tsx` | Reusable CPU/memory usage bar. | Used by node cards and the drawer; reflects **requested vs allocatable**. |

## Notes

- Pods render nested inside their node boxes, so some edges attach to the hosting node; the drawer and
  pod flash convey the exact pod relationship.
- Node positions the user drags are preserved across reconciles via a position-reconcile effect.
</content>
