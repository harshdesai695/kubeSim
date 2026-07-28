"use client";

/**
 * useFlowStore — transient state for the API-flow visualization.
 *
 * Kept separate from the main cluster store so the frequent, animation-driven
 * updates (packet position, per-pod hit counters, flashes) don't churn every
 * cluster subscriber. Holds a queue of planned requests, the currently
 * animating request, a recent-requests log, and per-pod hit counters.
 */

import { create } from "zustand";
import { useClusterStore } from "./useClusterStore";
import {
  computeEndpoints,
  evaluatePolicies,
  roundRobinPick,
  simulateLatency,
} from "@/lib/network";

export interface RequestPlan {
  id: string;
  serviceId: string;
  serviceName: string;
  ingressId?: string;
  matchedRuleLabel?: string;
  routeLabel: string;
  hostingNodeName?: string;
  hostingNodeId?: string;
  chosenPodUid?: string;
  chosenPodName?: string;
  blocked: boolean;
  blockReason?: string;
  latencyMs: number;
}

export interface RequestRecord {
  id: string;
  target: string;
  podName?: string;
  latencyMs: number;
  blocked: boolean;
  blockReason?: string;
  timestamp: number;
}

interface FlowState {
  queue: RequestPlan[];
  active: RequestPlan | null;
  recent: RequestRecord[];
  hitCounts: Record<string, number>;
  flashPodUid: string | null;

  requestService: (
    serviceId: string,
    opts?: { ingressId?: string; matchedRuleLabel?: string },
  ) => void;
  requestIngressRule: (ingressId: string, ruleIndex: number) => void;
  bulkRequestService: (serviceId: string, count: number) => void;

  startNext: () => void;
  hitPod: (podUid: string) => void;
  finishActive: (record: RequestRecord) => void;
  clear: () => void;
}

let reqCounter = 0;
function newId(): string {
  reqCounter += 1;
  return `req-${Date.now().toString(36)}-${reqCounter}`;
}

export const useFlowStore = create<FlowState>((set, get) => ({
  queue: [],
  active: null,
  recent: [],
  hitCounts: {},
  flashPodUid: null,

  requestService: (serviceId, opts) => {
    const cs = useClusterStore.getState();
    const svc = cs.services.find((s) => s.metadata.uid === serviceId);
    if (!svc) return;

    const target = opts?.ingressId
      ? `${svc.metadata.name}`
      : `svc/${svc.metadata.name}`;

    const plan: RequestPlan = {
      id: newId(),
      serviceId,
      serviceName: svc.metadata.name,
      ingressId: opts?.ingressId,
      matchedRuleLabel: opts?.matchedRuleLabel,
      routeLabel: "",
      blocked: false,
      latencyMs: 0,
    };

    const endpoints = computeEndpoints(svc, cs.pods);
    if (endpoints.length === 0) {
      plan.blocked = true;
      plan.blockReason = "503 — no ready endpoints";
      plan.routeLabel = "kube-proxy: no endpoints";
      plan.latencyMs = simulateLatency(opts?.ingressId ? 2 : 1);
      cs.pushEvent({
        type: "Warning",
        reason: "RequestFailed",
        message: `Request to ${target} failed: no ready endpoints (503).`,
        involvedObject: { kind: "Service", name: svc.metadata.name },
      });
      set((st) => ({ queue: [...st.queue, plan] }));
      return;
    }

    const pod = roundRobinPick(serviceId, endpoints)!;
    const node = cs.nodes.find((n) => n.name === pod.spec.nodeName);
    plan.chosenPodUid = pod.metadata.uid;
    plan.chosenPodName = pod.metadata.name;
    plan.hostingNodeName = pod.spec.nodeName;
    plan.hostingNodeId = node?.id;
    plan.routeLabel = `kube-proxy → ${pod.metadata.name} (round-robin)`;

    const decision = evaluatePolicies(pod, cs.networkPolicies);
    if (decision.blocked) {
      plan.blocked = true;
      plan.blockReason = `Blocked by NetworkPolicy: ${decision.policyName}`;
    }

    plan.latencyMs = simulateLatency(opts?.ingressId ? 3 : 2);

    cs.pushEvent({
      type: plan.blocked ? "Warning" : "Normal",
      reason: plan.blocked ? "RequestBlocked" : "RequestRouted",
      message: plan.blocked
        ? `Request to ${target} blocked by NetworkPolicy (${decision.policyName}).`
        : `Request to ${target} → ${pod.metadata.name} on ${pod.spec.nodeName} (${plan.latencyMs}ms).`,
      involvedObject: { kind: "Service", name: svc.metadata.name },
    });

    set((st) => ({ queue: [...st.queue, plan] }));
  },

  requestIngressRule: (ingressId, ruleIndex) => {
    const cs = useClusterStore.getState();
    const ing = cs.ingresses.find((i) => i.metadata.uid === ingressId);
    const rule = ing?.spec.rules[ruleIndex];
    if (!ing || !rule) return;
    const svc = cs.services.find((s) => s.metadata.name === rule.serviceName);
    if (!svc) {
      cs.pushEvent({
        type: "Warning",
        reason: "RequestFailed",
        message: `Ingress ${ing.metadata.name}: no Service "${rule.serviceName}" for ${rule.host}${rule.path}.`,
        involvedObject: { kind: "Ingress", name: ing.metadata.name },
      });
      return;
    }
    get().requestService(svc.metadata.uid, {
      ingressId,
      matchedRuleLabel: `Matched rule: ${rule.host}${rule.path} → ${rule.serviceName}:${rule.servicePort}`,
    });
  },

  bulkRequestService: (serviceId, count) => {
    for (let i = 0; i < count; i++) get().requestService(serviceId);
  },

  startNext: () => {
    const { active, queue } = get();
    if (active || queue.length === 0) return;
    set({ active: queue[0], queue: queue.slice(1) });
  },

  hitPod: (podUid) =>
    set((st) => ({
      flashPodUid: podUid,
      hitCounts: {
        ...st.hitCounts,
        [podUid]: (st.hitCounts[podUid] ?? 0) + 1,
      },
    })),

  finishActive: (record) =>
    set((st) => ({
      active: null,
      flashPodUid: null,
      recent: [record, ...st.recent].slice(0, 8),
    })),

  clear: () =>
    set({
      queue: [],
      active: null,
      recent: [],
      hitCounts: {},
      flashPodUid: null,
    }),
}));
