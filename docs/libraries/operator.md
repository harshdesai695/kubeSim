# operator

**File:** `src/lib/operator.ts`

## What it is

A built-in **sample "Database" operator** that demonstrates the Kubernetes extension pattern. It watches
Custom Resources of a CRD marked `operator: "Database"` and reconciles their managed children.

## Key exports

| Function | Purpose |
|---|---|
| `reconcileOperators(state)` | Reconcile all Database CRs → next `{ statefulSets, services, secrets, pods, events, changed }` |
| `databaseCRD()` | The preset `Database` CRD (group/version/kind + schema) |

## What the operator does

For each `Database` CR it ensures three children, each with an `ownerReference` back to the CR:

1. a credentials **Secret** (`<name>-credentials`),
2. a headless **Service** (`<name>`),
3. a **StatefulSet** (`<name>`, replicas/engine/storage from the CR spec).

It reconciles spec drift (e.g. changing `replicas`) and **garbage-collects** all children (cascading to
StatefulSet pods) when the CR is deleted.

## How to use

Driven each tick by `useClusterStore.operatorTick()` (called from
[`ReconcileEngine`](../components/system.md)). To try it in the UI: Workloads panel →
**Extensibility → Register sample Database operator**, then create a `Database` custom resource.

```ts
import { reconcileOperators, databaseCRD } from "@/lib/operator";
const next = reconcileOperators(store.getState());
```
</content>
