# status

**File:** `src/lib/status.ts`

## What it is

Maps object **status/phase → colors and CSS classes**, giving the whole app one consistent status color
language (running/pending/failed/terminated).

## Key exports

| Function | Purpose |
|---|---|
| `phaseDotClass(phase)` | Tailwind class for the status dot |
| `phaseBorderClass(phase)` | Border color class for cards |
| `phaseTextClass(phase)` | Text color class |

## How to use

```ts
import { phaseDotClass, phaseTextClass } from "@/lib/status";
<span className={phaseDotClass(pod.status.phase)} />
```

Used by [`PodCard`](../components/canvas.md), the [Detail Drawer](../components/drawer.md), and the
[Workloads panel](../components/workloads.md) rows. Centralizing this keeps status colors identical
everywhere.
</content>
