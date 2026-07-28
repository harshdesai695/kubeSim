/**
 * Workload helpers — scheduling, IP allocation, and object factories.
 *
 * These back the Phase 2 controllers (ReplicaSet / Deployment) and the
 * simulated Scheduler (reference doc §1.3, §3.1–3.3).
 */

import type {
  Container,
  Namespace,
  ObjectMeta,
  OwnerReference,
  Pod,
  WorkerNode,
} from "@/store/types";

/** Simulated per-pod resource footprint used for node gauges. */
export const POD_CPU = 0.25; // cores
export const POD_MEM = 0.5; // GB

/** Accent palette shared between a ReplicaSet/Deployment and its pods. */
export const WORKLOAD_COLORS = [
  "#326ce5",
  "#22c55e",
  "#a855f7",
  "#f59e0b",
  "#06b6d4",
  "#ec4899",
  "#14b8a6",
  "#f43f5e",
];

let colorCursor = 0;
export function nextColor(): string {
  const c = WORKLOAD_COLORS[colorCursor % WORKLOAD_COLORS.length];
  colorCursor += 1;
  return c;
}

let ipCursor = 1;
export function allocatePodIP(): string {
  const n = ipCursor++;
  const third = Math.floor(n / 254) % 254;
  const fourth = (n % 254) + 1;
  return `10.244.${third}.${fourth}`;
}

let clusterIpCursor = 1;
/** Allocate a virtual Service ClusterIP from the 10.96.0.0/16 range. */
export function allocateClusterIP(): string {
  const n = clusterIpCursor++;
  const third = Math.floor(n / 254) % 254;
  const fourth = (n % 254) + 1;
  return `10.96.${third}.${fourth}`;
}

let externalIpCursor = 1;
/** Allocate a fake external LoadBalancer IP. */
export function allocateExternalIP(): string {
  const n = externalIpCursor++;
  return `203.0.113.${(n % 254) + 1}`;
}

let uidCursor = 0;
export function uid(prefix = "uid"): string {
  uidCursor += 1;
  return `${prefix}-${Date.now().toString(36)}-${uidCursor}`;
}

/** Short random suffix for controller-generated pod names (like real k8s). */
export function randomSuffix(len = 5): string {
  const alphabet = "abcdefghijklmnopqrstuvwxyz0123456789";
  let s = "";
  for (let i = 0; i < len; i++) {
    s += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return s;
}

/** True when every key/value in `selector` is present in `labels`. */
export function selectorMatches(
  labels: Record<string, string> | undefined,
  selector: Record<string, string>,
): boolean {
  if (!labels) return false;
  return Object.entries(selector).every(([k, v]) => labels[k] === v);
}

/**
 * Least-loaded placement (simulated kube-scheduler).
 *
 * Chooses the Ready, non-draining node running the fewest active pods, with
 * remaining CPU capacity as a tie-breaker. Returns undefined if nothing is
 * schedulable (the pod then stays Pending in the queue).
 */
export function pickNode(
  nodes: WorkerNode[],
  pods: Pod[],
): WorkerNode | undefined {
  const eligible = nodes.filter((n) => n.status === "Ready" && !n.draining);
  if (eligible.length === 0) return undefined;

  const activePhases = new Set(["Pending", "ContainerCreating", "Running"]);
  const countByNode = new Map<string, number>();
  for (const p of pods) {
    if (p.spec.nodeName && activePhases.has(p.status.phase)) {
      countByNode.set(
        p.spec.nodeName,
        (countByNode.get(p.spec.nodeName) ?? 0) + 1,
      );
    }
  }

  return eligible.slice().sort((a, b) => {
    const ca = countByNode.get(a.name) ?? 0;
    const cb = countByNode.get(b.name) ?? 0;
    if (ca !== cb) return ca - cb;
    return b.cpuCapacity - a.cpuCapacity;
  })[0];
}

export interface MakePodInput {
  name: string;
  namespace: Namespace;
  labels: Record<string, string>;
  containers: Container[];
  owner?: OwnerReference;
  ownerColor?: string;
  configMaps?: string[];
  secrets?: string[];
  pvcs?: string[];
  ordinal?: number;
}

/** Create a fresh Pending pod (no node assigned yet). */
export function makePod(input: MakePodInput): Pod {
  const now = Date.now();
  const meta: ObjectMeta = {
    name: input.name,
    namespace: input.namespace,
    uid: uid("pod"),
    labels: input.labels,
    creationTimestamp: new Date(now).toISOString(),
    ownerReferences: input.owner ? [input.owner] : undefined,
  };
  return {
    metadata: meta,
    spec: {
      containers: input.containers.map((c) => ({ ...c, state: "Waiting" })),
      nodeName: undefined,
      configMaps: input.configMaps?.length ? input.configMaps : undefined,
      secrets: input.secrets?.length ? input.secrets : undefined,
      pvcs: input.pvcs?.length ? input.pvcs : undefined,
      ordinal: input.ordinal,
    },
    status: {
      phase: "Pending",
      podIP: undefined,
      restartCount: 0,
    },
    ownerColor: input.ownerColor,
    createdAt: now,
    phaseSince: now,
  };
}

/** Build a single-container template from an image string. */
export function containerFromImage(image: string): Container {
  const name = image.split("/").pop()?.split(":")[0] ?? "app";
  return { name, image, state: "Waiting", ports: [80] };
}
