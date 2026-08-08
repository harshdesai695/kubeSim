# useFlowStore

**File:** `src/store/useFlowStore.ts`

## What it is

A **separate** Zustand store for the transient, animation-heavy state of the API-request-flow
visualization. It's kept out of `useClusterStore` so the frequent packet-position and hit-counter
updates don't churn every cluster subscriber.

## Key state

- `queue: RequestPlan[]` — pending requests waiting to animate.
- `active: RequestPlan | null` — the request currently animating.
- `recent: RequestRecord[]` — last few completed requests (for the panel log).
- `hitCounts: Record<uid, number>` — per-pod request counters.
- `flashPodUid` — the pod currently flashing.

## Key actions

| Action | Purpose |
|---|---|
| `requestService(serviceId, opts?)` | Plan a request to a Service (computes endpoints, kube-proxy pick, policy decision, latency) |
| `requestIngressRule(ingressId, ruleIndex)` | Route through an Ingress rule to its Service |
| `bulkRequestService(serviceId, count)` | Queue N requests (load distribution) |
| `startNext / hitPod / finishActive / clear` | Animation lifecycle used by `RequestFlowLayer` |

## How to use

Trigger a request from anywhere (Service node, drawer, Traffic Simulator, or CLI `kubesim curl`):

```ts
import { useFlowStore } from "@/store/useFlowStore";
useFlowStore.getState().requestService(serviceUid);
```

The [`RequestFlowLayer`](../components/canvas.md) consumes `active`/`queue` and animates the packet along
`client → ingress → service → node → pod → back`. Blocked requests (NetworkPolicy / 503) stop early.

## Notes

- Cleared on cluster reset/switch via the store's flow-clear paths; `RequestFlowLayer` also hides itself
  whenever `active` is null.
</content>
