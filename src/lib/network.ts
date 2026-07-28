/**
 * Networking helpers — Service endpoints, kube-proxy routing, NetworkPolicy
 * evaluation and latency simulation (reference doc §4.1–4.4, §2.3).
 */

import type {
  NetworkPolicy,
  Pod,
  Service,
} from "@/store/types";
import { selectorMatches } from "./workloads";

/**
 * Live Endpoints (reference doc §4.4): pods matching a Service's selector that
 * are Running with an assigned IP. Recomputed on demand so edges/endpoints
 * stay current as pods scale or labels change.
 */
export function computeEndpoints(service: Service, pods: Pod[]): Pod[] {
  if (Object.keys(service.spec.selector).length === 0) return [];
  return pods.filter(
    (p) =>
      p.status.phase === "Running" &&
      !!p.status.podIP &&
      selectorMatches(p.metadata.labels, service.spec.selector),
  );
}

/** Distinct node names currently hosting a Service's endpoints. */
export function endpointNodes(service: Service, pods: Pod[]): string[] {
  const names = new Set<string>();
  for (const p of computeEndpoints(service, pods)) {
    if (p.spec.nodeName) names.add(p.spec.nodeName);
  }
  return Array.from(names);
}

/* --- kube-proxy round-robin (per service) --- */

const rrCursor = new Map<string, number>();

export function roundRobinPick(
  serviceId: string,
  endpoints: Pod[],
): Pod | undefined {
  if (endpoints.length === 0) return undefined;
  const idx = rrCursor.get(serviceId) ?? 0;
  const pod = endpoints[idx % endpoints.length];
  rrCursor.set(serviceId, idx + 1);
  return pod;
}

export function resetRouting(): void {
  rrCursor.clear();
}

/* --- NetworkPolicy evaluation (simplified) --- */

export interface PolicyDecision {
  blocked: boolean;
  policyName?: string;
}

/**
 * Evaluate whether external ingress traffic reaching `pod` is blocked.
 *
 * Simplified model: if any NetworkPolicy selects the pod, the pod becomes
 * isolated. Traffic is allowed only if that policy sets `allowAll`. External
 * clients carry no labels, so `fromLabels` never matches them → blocked.
 */
export function evaluatePolicies(
  pod: Pod,
  policies: NetworkPolicy[],
): PolicyDecision {
  const applicable = policies.filter((np) =>
    selectorMatches(pod.metadata.labels, np.spec.podSelector),
  );
  if (applicable.length === 0) return { blocked: false };
  // Allowed if ANY selecting policy permits all ingress.
  const allowed = applicable.some((np) => np.spec.allowAll);
  if (allowed) return { blocked: false };
  return { blocked: true, policyName: applicable[0].metadata.name };
}

/* --- Latency simulation --- */

/**
 * Fake but realistic latency: a small per-hop base plus jitter. `hops` is the
 * number of forward segments the packet traverses.
 */
export function simulateLatency(hops: number): number {
  const base = hops * 4; // ~4ms per hop
  const jitter = Math.floor(Math.random() * 35) + 6; // 6–40ms
  return base + jitter;
}
