# Terminal

**Folder:** `src/components/terminal/` — `SimTerminal.tsx`

## What it is

The **`kubectl`-style shell**. It renders the terminal scrollback, captures typed commands, and dispatches
them to the CLI parser — driving the same store actions as the GUI.

## Features

- Command execution via [`runKubectl`](../libraries/cli.md).
- **History** recall with ↑/↓, and **Tab completion** for verbs/resource types/names.
- **Multi-line manifest paste** → opens the `apply` dialog.
- Adjustable font size (from Settings) and a CLI-echo stream (GUI actions appear as echoed commands).

## How to use

Toggle the terminal from the top bar. Try:

```bash
kubectl get pods -o wide
kubectl scale deployment web --replicas=5
kubectl rollout restart deployment/web
kubectl auth can-i get pods --as=alice
kubectl config use-context <cluster>
kubesim curl web.default.svc.cluster.local
help          # list commands   ·   clear
```

## Wiring

Reads/writes scrollback via [`useTerminalStore`](../stores/useTerminalStore.md); parses & executes via
[`lib/cli.ts`](../libraries/cli.md). Because the CLI calls store actions directly, terminal and GUI stay
perfectly in sync.
</content>
