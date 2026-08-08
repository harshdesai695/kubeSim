# workloads

**File:** `src/lib/workloads.ts`

## What it is

Foundational **factories and helpers** for creating simulated objects — pod construction, identity/IP/
color allocation, and label matching.

## Key exports

| Export | Purpose |
|---|---|
| `makePod(input)` | Build a fresh Pending pod (containers set to Waiting, no node yet) |
| `containerFromImage(image)` | Derive a `Container` from an image string |
| `uid(prefix)` | Generate a unique object id |
| `randomSuffix(len?)` | Random name suffix (e.g. `web-6d8f`) |
| `nextColor()` | Cycle accent colors for grouping |
| `allocatePodIP / allocateClusterIP / allocateExternalIP` | IP allocation |
| `selectorMatches(labels, selector)` | True when labels satisfy a selector |
| `pickNode(nodes, pods)` | Legacy least-loaded placement (superseded by [`scheduler`](./scheduler.md)) |
| `POD_CPU / POD_MEM` | Default per-pod resource footprint for node gauges |

## How to use

```ts
import { makePod, containerFromImage, selectorMatches } from "@/lib/workloads";
const pod = makePod({ name, namespace, labels, containers: [containerFromImage("nginx:1.25")] });
```

Used throughout [`useClusterStore`](../stores/useClusterStore.md) and
[`lib/operator.ts`](./operator.md). Scheduling of the pods that `makePod` creates is handled by the
[scheduler](./scheduler.md) during reconcile.
</content>
