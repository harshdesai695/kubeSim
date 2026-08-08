# echo

**File:** `src/lib/echo.ts`

## What it is

A small **GUI → CLI echo bridge**. When a GUI action runs, it can "echo" the equivalent `kubectl` command
into the terminal so users learn the command-line form — unless the CLI itself triggered the action
(avoiding double-echo) or the user disabled the toast.

## Key exports

| Function | Purpose |
|---|---|
| `echoCommand(cmd)` | Push a GUI-triggered command into the terminal scrollback (respects the setting) |
| `setCliActive(bool)` | Mark that the CLI is currently executing (suppresses echo) |

## How to use

Inside a store action:

```ts
import { echoCommand } from "@/lib/echo";
echoCommand(`kubectl scale deployment/${name} --replicas=${n}`);
```

`echoCommand` checks `useSettingsStore.showCliToast` and the `setCliActive` flag before writing to
[`useTerminalStore`](../stores/useTerminalStore.md). The CLI wraps its dispatch in
`setCliActive(true/false)`.
</content>
