# scenarios

**File:** `src/lib/scenarios.ts`

## What it is

Definitions for the **guided scenario presets** — one-click demos that build a cluster and narrate what
to watch.

## Key exports

| Export | Purpose |
|---|---|
| `SCENARIOS` | Array of scenario presets (id, title, description, setup steps, walkthrough) |

Included scenarios: **Self-Healing**, **Rolling Update**, **Load Balancing**, **Autoscaling**, and
**Full Stack**.

## How to use

Each scenario resets the cluster and then calls store actions to build its objects:

```ts
import { SCENARIOS } from "@/lib/scenarios";
const scenario = SCENARIOS.find((s) => s.id === "self-healing");
scenario?.run(useClusterStore.getState());
```

Rendered by the [Scenarios menu](../components/scenarios.md); the accompanying `Walkthrough` steps guide
the user. Add a new preset by appending to `SCENARIOS`.
</content>
