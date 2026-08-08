# Canvas Nodes

**Folder:** `src/components/canvas/nodes/`

## What it is

The **custom React Flow node renderers** — one component per node type registered in
`ClusterCanvas`'s `nodeTypes` map. Each reads what it needs from the store and renders a styled box with
connection handles.

## Components

| File | Node type | What it renders |
|---|---|---|
| `MasterNode.tsx` | `master` | The control-plane box with the four components (apiserver, etcd, scheduler, controller-manager); clickable to open each in the drawer. |
| `WorkerNodeCard.tsx` | `worker` | A worker node with CPU/memory gauges, kubelet/kube-proxy indicators, nested `PodCard`s, Ready/SchedulingDisabled status, and drain/delete. |
| `ServiceNode.tsx` | `service` | A Service box: type, ClusterIP/external IP, live endpoint count, and Send / x10 request buttons. |
| `IngressNode.tsx` | `ingress` | An Ingress with its host/path rules; each rule has a Send button that routes through to its Service. |
| `ClientNode.tsx` | `client` | The external client (request origin) shown when Services/Ingresses exist. |
| `ConfigNodes.tsx` | `configmap`, `secret` | ConfigMap and Secret boxes in the config zone; dashed edges show which pods consume them. |
| `StorageNodes.tsx` | `pv`, `pvc` | PersistentVolume and PersistentVolumeClaim boxes in the storage zone, with bind status. |

## How to use

These are not used directly — `ClusterCanvas` maps store objects into React Flow nodes with a `type` and
`data` payload, and React Flow instantiates the matching renderer. To add a new node type: create the
renderer, register it in `nodeTypes`, and emit nodes of that `type` from `ClusterCanvas`.
</content>
