# selector

**File:** `src/lib/selector.ts`

## What it is

Label-selector utilities used by the global **Selector Inspector** and anywhere labels are matched
against a query string.

## Key exports

| Function | Purpose |
|---|---|
| `parseSelectorQuery(str)` | Parse `app=web,tier=frontend` into a label map |
| `labelsMatchQuery(labels, query)` | True when labels satisfy the parsed query |

## How to use

```ts
import { labelsMatchQuery } from "@/lib/selector";
const highlighted = labelsMatchQuery(pod.metadata.labels, "app=frontend");
```

Drives the [Selector Inspector](../components/canvas.md) (dimming non-matching pods/services) and is
distinct from `selectorMatches` in [`workloads`](./workloads.md), which matches an object selector map.
</content>
