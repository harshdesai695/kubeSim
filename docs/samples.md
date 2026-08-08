# Sample Scenarios (snapshots)

**Folder:** `samples/`

## What it is

Importable **cluster snapshots** — JSON files matching the store's snapshot schema. Load them via
**Settings → Import snapshot** to instantly populate a cluster.

## Files

| File | What it contains |
|---|---|
| `ecommerce-platform.snapshot.json` | A full microservices e-commerce platform in an `ecommerce` namespace: 8 Deployments (frontend, api-gateway, catalog, cart, orders, payments, redis, postgres), Services + Ingress, ConfigMaps/Secrets, PVCs/PVs, HPAs, NetworkPolicies, and RBAC (ServiceAccounts, Roles, Bindings, ResourceQuota, LimitRange). |
| `simple-flow-test.snapshot.json` | A minimal cluster (`default` ns): 2 nodes, one `web` Deployment (3 replicas), a ClusterIP Service, and an Ingress — ideal for testing the request-flow animation. |

## How to use

1. Open **Settings** (top bar) → **Import snapshot** and choose a file.
2. Wait a few seconds for pods to reach **Running** (the ReplicaSet controller spawns and the scheduler
   places them on load).
3. Use the **Traffic Simulator** (bottom-center of the canvas) or `kubesim curl` to watch the request flow.

## Schema

A snapshot is the object returned by `useClusterStore.exportSnapshot()` — `version`, `namespace(s)`,
sim clock, and every object array. Deployments reference their ReplicaSets via `activeReplicaSetId`, and
ReplicaSets carry an `ownerReferences` back to the Deployment. Pods are usually omitted so the controllers
spawn them live. To create your own, build a cluster in the UI and **Export snapshot**.
</content>
