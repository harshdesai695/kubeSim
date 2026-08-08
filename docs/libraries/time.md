# time

**File:** `src/lib/time.ts`

## What it is

Formatting helpers for **ages and durations** — the `AGE` column and timestamps shown across the UI and
CLI.

## Key exports

| Function | Purpose |
|---|---|
| `formatAge(createdAtMs)` | Compact age like `2m`, `3h`, `5d` from an epoch-ms timestamp |
| `formatDuration(ms)` | Human duration for intervals |

## How to use

```ts
import { formatAge } from "@/lib/time";
<span>age {formatAge(pod.createdAt)}</span>
```

Used by `kubectl get` tables in [`lib/cli.ts`](./cli.md), the [Detail Drawer](../components/drawer.md),
and [Workloads panel](../components/workloads.md) rows.
</content>
