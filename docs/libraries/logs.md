# logs

**File:** `src/lib/logs.ts`

## What it is

Generates **synthetic pod logs** and simulates `kubectl exec` output, so the drawer's Logs/Exec tabs and
the terminal feel realistic.

## Key exports

| Function | Purpose |
|---|---|
| `generateLogs(pod)` | Produce plausible log lines for a pod (varies by phase/image) |
| `simulateExec(pod, command)` | Return canned output for common commands (`ls`, `env`, `cat`, …) |

## How to use

```ts
import { generateLogs, simulateExec } from "@/lib/logs";
const lines = generateLogs(pod);
const out = simulateExec(pod, "env");
```

Consumed by the [Detail Drawer](../components/drawer.md) (Logs/Exec tabs) and
[`lib/cli.ts`](./cli.md) (`kubectl logs` / `exec`).
</content>
