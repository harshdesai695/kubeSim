# yaml

**File:** `src/lib/yaml.ts`

## What it is

A **minimal YAML parser** used by `kubectl apply -f` / `create -f` to turn a pasted manifest into an
object the store can create. It supports the subset of YAML kubeSim manifests use (maps, lists, scalars,
multi-document `---`).

## Key exports

| Export | Purpose |
|---|---|
| `parseYamlDocuments(text)` | Parse one or more `---`-separated documents into `YamlValue[]` |
| `YamlValue` | Recursive value type (`string \| number \| boolean \| object \| array`) |

## How to use

```ts
import { parseYamlDocuments } from "@/lib/yaml";
const docs = parseYamlDocuments(pastedManifest);
for (const doc of docs) createFromManifest(doc);
```

Consumed by [`lib/cli.ts`](./cli.md) when a multi-line manifest is pasted into the terminal. It is
intentionally lightweight — not a full YAML implementation — matching the simulator's needs.
</content>
