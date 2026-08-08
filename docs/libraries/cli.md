# cli

**File:** `src/lib/cli.ts`

## What it is

The **`kubectl`-style command parser and dispatcher**. It turns a raw terminal string into an action
against the store — using the **same store actions the GUI uses**, so behavior never diverges. Wrapped in
`setCliActive()` so store actions don't double-echo the command being typed.

## Main entry point

```ts
import { runKubectl } from "@/lib/cli";
const result = runKubectl("kubectl get pods -o wide"); // → { lines: string[], clear?: boolean }
```

## Supported commands

- **Read:** `get` / `describe` (with `-o yaml|json|wide`, `-n <ns>`), including CRDs
  (`get crds`, `get <plural>`), `endpointslices`, `pc`, `pdb`, `vs`, `vpa`.
- **Write:** `create` / `apply -f` (paste a manifest), `delete`, `scale`, `set image`, `rollout
  status|undo|history|restart`, `expose`, `label`, `annotate`, `patch`.
- **Nodes:** `cordon` / `uncordon` / `drain`, `top nodes|pods`.
- **Debug:** `logs [-f]`, `exec <pod> -- <cmd>`, `wait --for=…`, `explain`, `api-resources`, `get events`.
- **Security:** `auth can-i <verb> <resource> [--as=<subject>]`.
- **Context (multi-cluster):** `config get-contexts | use-context | current-context`.
- **Flow:** `kubesim curl [--from=<pod>] <svc>.<ns>.svc.cluster.local | svc/<name> | <host><path>`.

## How it works

- A `RESOURCES` registry maps aliases (`po`, `deploy`, `svc`, …) → canonical type + store list.
- `resolveType()` handles built-ins; `resolveCRD()` resolves dynamic CRD kinds by plural/singular/
  shortName.
- `getTable()` renders each type's `kubectl get` columns; `describe` renders the object's YAML.
- `handleCurl()` resolves DNS, triggers the flow animation, and (with `--from`) evaluates pod-to-pod
  NetworkPolicy.

## Extending

To add a new resource to the CLI: add a `RESOURCES` entry (or CRD handling), a `getTable` case, and a
`deleters` map entry. Keep GUI ↔ CLI parity by calling the same store action the panel uses.
</content>
