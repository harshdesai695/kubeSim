# rbac

**File:** `src/lib/rbac.ts`

## What it is

The **authorization engine** — evaluates whether a subject may perform a verb on a resource, given the
cluster's Roles and Bindings. Powers `kubectl auth can-i` and the permission overlay.

## Key exports

| Export | Purpose |
|---|---|
| `SubjectRef` | A selected identity (`User`/`Group`/`ServiceAccount` + name/namespace) |
| `subjectId(s)` | Stable string id for a subject |
| `ruleMatches(rule, verb, resource)` | Match a `PolicyRule` (supports `*` wildcards) |
| `gatherRules(tables, subject, namespace)` | Collect all rules bound to a subject |
| `canI(tables, subject, verb, resource, namespace)` | Final allow/deny decision |

## How resolution works

- **ClusterRoleBindings** apply cluster-wide; **RoleBindings** apply within their namespace.
- Each binding resolves its `roleRef` to a `Role`/`ClusterRole`; the union of matching rules is checked.
- Wildcards (`*`) in `apiGroups`/`resources`/`verbs` match anything.

## How to use

```ts
import { canI } from "@/lib/rbac";
const tables = { roles, clusterRoles, roleBindings, clusterRoleBindings };
const allowed = canI(tables, { kind: "User", name: "alice" }, "get", "pods", "default");
```

Used by [`lib/cli.ts`](./cli.md) (`auth can-i`) and by the canvas permission overlay (dimming objects a
selected "Inspect as" subject cannot `get`).
</content>
