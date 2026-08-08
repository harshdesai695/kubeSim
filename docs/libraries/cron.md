# cron

**File:** `src/lib/cron.ts`

## What it is

A minimal **cron-expression** helper for CronJobs — parses standard `* * * * *` fields and computes the
next fire time on the simulated clock.

## Key exports

| Function | Purpose |
|---|---|
| `nextCronRun(expr, fromMs)` | Next scheduled time (sim-clock ms) at or after `fromMs` |
| `describeSchedule(expr)` | Human-readable summary (e.g. "every 5 minutes") |

## How to use

```ts
import { nextCronRun, describeSchedule } from "@/lib/cron";
const next = nextCronRun("*/5 * * * *", store.simClock);
const label = describeSchedule("0 * * * *"); // "every hour"
```

The CronJob controller in the reconcile loop uses `nextCronRun` against `simClock`, which advances faster
when the user raises the simulation speed (1x / 10x / 60x).
</content>
