# storage

**File:** `src/lib/storage.ts`

## What it is

Persistent-storage helpers: **PV binding** (smallest-fit), storage-class/access-mode constants, and
base64 utilities for Secret display.

## Key exports

| Export | Purpose |
|---|---|
| `STORAGE_CLASSES` | `["standard", "fast-ssd", "slow-hdd"]` |
| `ACCESS_MODES` | `["ReadWriteOnce", "ReadOnlyMany", "ReadWriteMany"]` |
| `findBindablePV(claim, pvs)` | Smallest Available PV that satisfies the claim's size + class |
| `toBase64(v)` / `fromBase64(v)` | Browser-safe base64 (Secret masking) |

## How to use

```ts
import { findBindablePV, toBase64 } from "@/lib/storage";
const pv = findBindablePV(pvc, availablePVs); // undefined → dynamic provisioning kicks in
```

Binding, dynamic provisioning, reclaim policies (Retain/Delete/Recycle), PVC resize, and volume
snapshots are orchestrated by [`useClusterStore`](../stores/useClusterStore.md) using these helpers.
</content>
