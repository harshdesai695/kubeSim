# manifest

**File:** `src/lib/manifest.ts`

## What it is

Renders store objects into **YAML/JSON manifests** for the detail drawer and `kubectl get -o yaml|json` /
`describe`.

## Key exports

| Function | Purpose |
|---|---|
| `buildManifest(kind, obj)` | Normalize a store object into a manifest-shaped record (includes `rules`, `subjects`, `roleRef`, etc.) |
| `toYaml(kind, obj)` | Render as YAML text |
| `toJson(kind, obj)` | Render as pretty JSON |
| `dumpYaml(value)` | Low-level YAML serializer |

## How to use

```ts
import { toYaml } from "@/lib/manifest";
const yaml = toYaml("Deployment", deployment);
```

Used by the [Detail Drawer](../components/drawer.md) (read-only Monaco editor) and by
[`lib/cli.ts`](./cli.md). When you add a new object kind, extend `buildManifest` so its distinctive spec
fields appear in the rendered YAML.
</content>
