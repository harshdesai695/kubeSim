# useTerminalStore

**File:** `src/store/useTerminalStore.ts`

## What it is

Holds the **terminal scrollback and command history** shared between the on-screen terminal and any
programmatic output (e.g. GUI actions that echo their `kubectl` equivalent).

## Key state

- `lines: { id, kind, text }[]` — the rendered scrollback. `kind` is one of `input | output | echo | info`.
- `history: string[]` — past commands for ↑/↓ recall.

## Key actions

| Action | Purpose |
|---|---|
| `pushInput(text)` | Record a typed command line |
| `pushOutput(lines)` | Append command output |
| `pushEcho(cmd)` | Append a GUI→CLI echoed command (styled differently) |
| `pushInfo(text)` | Append an info/system line |
| `clear()` | Clear the scrollback |
| `reset()` | Reset scrollback + history (used on cluster reset) |

## How to use

```ts
import { useTerminalStore } from "@/store/useTerminalStore";
useTerminalStore.getState().pushEcho("kubectl scale deployment/web --replicas=5");
```

The [`SimTerminal`](../components/terminal.md) component renders `lines` and feeds typed commands to
[`lib/cli.ts`](../libraries/cli.md). The [`echo`](../libraries/echo.md) bridge calls `pushEcho` when GUI
actions run (subject to the CLI-echo setting).
</content>
