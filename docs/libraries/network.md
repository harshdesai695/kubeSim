# network

**File:** `src/lib/network.ts`

## What it is

All **networking logic**: Service endpoints, kube-proxy routing, NetworkPolicy evaluation, cluster DNS,
EndpointSlices, and latency simulation.

## Key exports

| Function | Purpose |
|---|---|
| `computeEndpoints(service, pods)` | Ready pods matching a Service selector (readiness-gated) |
| `endpointNodes(service, pods)` | Distinct nodes hosting a Service's endpoints |
| `roundRobinPick(serviceId, endpoints)` | kube-proxy round-robin selection |
| `evaluatePolicies(pod, policies)` | External-ingress NetworkPolicy decision |
| `evaluatePodToPod(src, dst, policies)` | Pod-to-pod ingress decision (`allowAll` / `fromLabels`) |
| `resolveServiceDns(host, services, ns)` | Resolve `svc` / `svc.ns` / `svc.ns.svc.cluster.local` |
| `computeEndpointSlice(service, pods)` | Derive the Service's EndpointSlice (IPs, ports, ready) |
| `simulateLatency(hops)` | Realistic per-hop latency + jitter |
| `resetRouting()` | Clear kube-proxy round-robin cursors |

## How to use

```ts
import { computeEndpoints, roundRobinPick, resolveServiceDns } from "@/lib/network";

const eps = computeEndpoints(service, pods);
const chosen = roundRobinPick(service.metadata.uid, eps);

const dns = resolveServiceDns("web.default.svc.cluster.local", services, "default");
```

Used by [`useFlowStore`](../stores/useFlowStore.md) to plan request routing and by
[`lib/cli.ts`](./cli.md) for `kubesim curl`. Readiness gating means a pod with a failing readiness probe
is excluded from endpoints.
</content>
