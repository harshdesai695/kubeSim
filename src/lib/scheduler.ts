/**
 * Scheduler pipeline (Phase 9) — a simplified kube-scheduler.
 *
 * Models the real filter → score → bind flow: filter nodes by resource fit,
 * taints/tolerations, nodeSelector/affinity and anti-affinity, then score the
 * feasible nodes (least-requested + topology spread) and bind to the best.
 * When nothing fits and the pod has priority, preemption evicts lower-priority
 * victims (respecting PodDisruptionBudgets) to make room.
 */

import type {
  Pod,
  PodDisruptionBudget,
  QoSClass,
  ResourceAmounts,
  WorkerNode,
} from "@/store/types";
import { selectorMatches } from "./workloads";

const ON_NODE = new Set(["ContainerCreating", "Running"]);

/** Sum a pod's container requests (cpu cores, memory GiB). */
export function podRequests(pod: Pod): Required<ResourceAmounts> {
  let cpu = 0;
  let memory = 0;
  for (const c of pod.spec.containers) {
    cpu += c.requests?.cpu ?? 0;
    memory += c.requests?.memory ?? 0;
  }
  return { cpu, memory };
}

/** Derive a pod's QoS class from its requests/limits (reference doc §9). */
export function computeQoS(pod: Pod): QoSClass {
  const cs = pod.spec.containers;
  if (cs.length === 0) return "BestEffort";
  let anyReq = false;
  let allGuaranteed = true;
  for (const c of cs) {
    const rc = c.requests?.cpu ?? 0;
    const rm = c.requests?.memory ?? 0;
    const lc = c.limits?.cpu ?? 0;
    const lm = c.limits?.memory ?? 0;
    if (rc > 0 || rm > 0 || lc > 0 || lm > 0) anyReq = true;
    if (!(rc > 0 && rm > 0 && rc === lc && rm === lm)) allGuaranteed = false;
  }
  if (!anyReq) return "BestEffort";
  return allGuaranteed ? "Guaranteed" : "Burstable";
}

/** CPU/memory already requested by active pods bound to a node. */
export function nodeRequested(
  node: WorkerNode,
  pods: Pod[],
  exclude?: Set<string>,
): Required<ResourceAmounts> {
  let cpu = 0;
  let memory = 0;
  for (const p of pods) {
    if (p.spec.nodeName !== node.name) continue;
    if (!ON_NODE.has(p.status.phase)) continue;
    if (exclude?.has(p.metadata.uid)) continue;
    const r = podRequests(p);
    cpu += r.cpu;
    memory += r.memory;
  }
  return { cpu, memory };
}

/** True when a pod tolerates every scheduling-blocking taint on a node. */
export function toleratesNode(pod: Pod, node: WorkerNode): boolean {
  const tols = pod.spec.tolerations ?? [];
  return node.taints.every((taint) => {
    if (taint.effect === "PreferNoSchedule") return true; // soft, never blocks
    return tols.some(
      (t) =>
        t.key === taint.key &&
        (t.operator === "Exists" ||
          t.value === undefined ||
          t.value === taint.value) &&
        (!t.effect || t.effect === taint.effect),
    );
  });
}

function nodeSelectorFits(pod: Pod, node: WorkerNode): boolean {
  const sel = pod.spec.nodeSelector;
  if (!sel || Object.keys(sel).length === 0) return true;
  return selectorMatches(node.labels, sel);
}

function antiAffinityFits(pod: Pod, node: WorkerNode, pods: Pod[]): boolean {
  const label = pod.spec.antiAffinityLabel;
  if (!label) return true;
  const mine = pod.metadata.labels?.[label];
  if (mine === undefined) return true;
  // Reject a node that already runs an active pod with the same label value.
  return !pods.some(
    (p) =>
      p.spec.nodeName === node.name &&
      ON_NODE.has(p.status.phase) &&
      p.metadata.uid !== pod.metadata.uid &&
      p.metadata.labels?.[label] === mine,
  );
}

export type InfeasibleReason =
  | "Insufficient cpu"
  | "Insufficient memory"
  | "node(s) had untolerated taint"
  | "node(s) didn't match nodeSelector"
  | "node(s) didn't satisfy anti-affinity"
  | "node not ready";

export interface FilterResult {
  feasible: WorkerNode[];
  reasons: Set<InfeasibleReason>;
}

/** Filter phase: keep only nodes on which the pod could run right now. */
export function filterNodes(
  pod: Pod,
  nodes: WorkerNode[],
  pods: Pod[],
): FilterResult {
  const req = podRequests(pod);
  const feasible: WorkerNode[] = [];
  const reasons = new Set<InfeasibleReason>();
  for (const node of nodes) {
    if (node.status !== "Ready" || node.draining || node.unschedulable) {
      reasons.add("node not ready");
      continue;
    }
    if (!toleratesNode(pod, node)) {
      reasons.add("node(s) had untolerated taint");
      continue;
    }
    if (!nodeSelectorFits(pod, node)) {
      reasons.add("node(s) didn't match nodeSelector");
      continue;
    }
    if (!antiAffinityFits(pod, node, pods)) {
      reasons.add("node(s) didn't satisfy anti-affinity");
      continue;
    }
    const used = nodeRequested(node, pods);
    if (used.cpu + req.cpu > node.cpuCapacity) {
      reasons.add("Insufficient cpu");
      continue;
    }
    if (used.memory + req.memory > node.memCapacity) {
      reasons.add("Insufficient memory");
      continue;
    }
    feasible.push(node);
  }
  return { feasible, reasons };
}

/** Count active pods on a node sharing the pod's topology-spread label value. */
function topologyCount(pod: Pod, node: WorkerNode, pods: Pod[]): number {
  const key = pod.spec.topologyKey;
  if (!key) return 0;
  const mine = pod.metadata.labels?.[key];
  if (mine === undefined) return 0;
  return pods.filter(
    (p) =>
      p.spec.nodeName === node.name &&
      ON_NODE.has(p.status.phase) &&
      p.metadata.labels?.[key] === mine,
  ).length;
}

/**
 * Score phase: prefer the node with the most free capacity, breaking ties by
 * fewest same-topology pods (spread) then larger CPU capacity.
 */
export function scoreNodes(
  pod: Pod,
  feasible: WorkerNode[],
  pods: Pod[],
): WorkerNode | undefined {
  if (feasible.length === 0) return undefined;
  return feasible
    .slice()
    .sort((a, b) => {
      const ta = topologyCount(pod, a, pods);
      const tb = topologyCount(pod, b, pods);
      if (ta !== tb) return ta - tb;
      const ra = nodeRequested(a, pods);
      const rb = nodeRequested(b, pods);
      const freeA = a.cpuCapacity - ra.cpu;
      const freeB = b.cpuCapacity - rb.cpu;
      if (freeA !== freeB) return freeB - freeA;
      return b.cpuCapacity - a.cpuCapacity;
    })[0];
}

export interface ScheduleResult {
  nodeName?: string;
  reason?: string;
}

/** Full filter → score for one pod. */
export function schedulePod(
  pod: Pod,
  nodes: WorkerNode[],
  pods: Pod[],
): ScheduleResult {
  if (nodes.filter((n) => n.status === "Ready" && !n.draining).length === 0) {
    return { reason: "0/0 nodes are available: no Ready nodes." };
  }
  const { feasible, reasons } = filterNodes(pod, nodes, pods);
  const best = scoreNodes(pod, feasible, pods);
  if (best) return { nodeName: best.name };
  const total = nodes.length;
  const detail = Array.from(reasons).join(", ") || "no nodes fit";
  return { reason: `0/${total} nodes are available: ${detail}.` };
}

/* ------------------------------------------------------------------ */
/* Preemption (respecting PodDisruptionBudgets)                        */
/* ------------------------------------------------------------------ */

/** Healthy (Running+ready) active pods matching a PDB selector, in a namespace. */
function pdbHealthy(pdb: PodDisruptionBudget, pods: Pod[]): number {
  return pods.filter(
    (p) =>
      p.metadata.namespace === pdb.metadata.namespace &&
      p.status.phase === "Running" &&
      p.status.ready !== false &&
      selectorMatches(p.metadata.labels, pdb.spec.selector),
  ).length;
}

/** True when evicting `victim` would drop a matching PDB below minAvailable. */
export function violatesPDB(
  victim: Pod,
  pods: Pod[],
  pdbs: PodDisruptionBudget[],
): boolean {
  for (const pdb of pdbs) {
    if (pdb.metadata.namespace !== victim.metadata.namespace) continue;
    if (!selectorMatches(victim.metadata.labels, pdb.spec.selector)) continue;
    if (pdbHealthy(pdb, pods) - 1 < pdb.spec.minAvailable) return true;
  }
  return false;
}

export interface PreemptionPlan {
  nodeName: string;
  victims: Pod[];
}

/**
 * Try to free room for a higher-priority pending pod by evicting lower-priority
 * pods on a single node. Skips victims protected by a PDB.
 */
export function findPreemption(
  pod: Pod,
  nodes: WorkerNode[],
  pods: Pod[],
  pdbs: PodDisruptionBudget[],
): PreemptionPlan | undefined {
  const req = podRequests(pod);
  const myPrio = pod.spec.priority ?? 0;

  for (const node of nodes) {
    if (node.status !== "Ready" || node.draining) continue;
    if (!toleratesNode(pod, node) || !nodeSelectorFits(pod, node)) continue;

    const candidates = pods
      .filter(
        (p) =>
          p.spec.nodeName === node.name &&
          ON_NODE.has(p.status.phase) &&
          (p.spec.priority ?? 0) < myPrio,
      )
      .sort((a, b) => (a.spec.priority ?? 0) - (b.spec.priority ?? 0));

    let freedCpu = node.cpuCapacity - nodeRequested(node, pods).cpu;
    let freedMem = node.memCapacity - nodeRequested(node, pods).memory;
    const victims: Pod[] = [];
    const evicted = new Set<string>();

    for (const cand of candidates) {
      if (freedCpu >= req.cpu && freedMem >= req.memory) break;
      // Simulate the running set after prior evictions for the PDB check.
      const remaining = pods.filter((p) => !evicted.has(p.metadata.uid));
      if (violatesPDB(cand, remaining, pdbs)) continue;
      const r = podRequests(cand);
      freedCpu += r.cpu;
      freedMem += r.memory;
      victims.push(cand);
      evicted.add(cand.metadata.uid);
    }

    if (freedCpu >= req.cpu && freedMem >= req.memory && victims.length > 0) {
      return { nodeName: node.name, victims };
    }
  }
  return undefined;
}
