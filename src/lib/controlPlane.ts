/**
 * Control-plane component metadata (reference doc §1.1–1.4).
 *
 * These are the four master-box sub-components. They are static in Phase 1
 * (no pods to schedule / reconcile yet) but each is clickable and surfaces a
 * description + a mini activity panel in the detail drawer.
 */

export type ControlPlaneKind =
  | "APIServer"
  | "Etcd"
  | "Scheduler"
  | "ControllerManager";

export type MiniPanel = "requestLog" | "keyBrowser" | "idle";

export interface ControlPlaneComponent {
  id: string;
  kind: ControlPlaneKind;
  /** Real Kubernetes component name, e.g. kube-apiserver. */
  name: string;
  description: string;
  miniPanel: MiniPanel;
  /** Empty-state copy for the mini panel. */
  emptyState: string;
}

export const CONTROL_PLANE: ControlPlaneComponent[] = [
  {
    id: "kube-apiserver",
    kind: "APIServer",
    name: "kube-apiserver",
    description:
      "Front door of the cluster. All CLI commands and inter-component communication flow through it. In kubeSim it acts as the central request router / event bus that mutates the simulated etcd store.",
    miniPanel: "requestLog",
    emptyState: "No API requests logged yet.",
  },
  {
    id: "etcd",
    kind: "Etcd",
    name: "etcd",
    description:
      "Consistent key-value store holding the entire cluster's desired and current state. In kubeSim this is the in-memory Zustand store, conceptually represented as etcd keys like /registry/nodes/node-1.",
    miniPanel: "keyBrowser",
    emptyState: "No object keys stored yet.",
  },
  {
    id: "kube-scheduler",
    kind: "Scheduler",
    name: "kube-scheduler",
    description:
      "Watches for unscheduled Pods (no nodeName) and assigns them to an eligible node based on resource availability. Currently idle — no workloads exist yet (arrives in Phase 2).",
    miniPanel: "idle",
    emptyState: "Scheduler idle — scheduling queue empty.",
  },
  {
    id: "kube-controller-manager",
    kind: "ControllerManager",
    name: "kube-controller-manager",
    description:
      "Runs reconciliation control loops (ReplicaSet, Deployment, Node controllers) that continuously drive actual state toward desired state. Currently idle — reconciliation targets arrive with workloads in later phases.",
    miniPanel: "idle",
    emptyState: "Controller loops idle — nothing to reconcile.",
  },
];

export function getControlPlaneComponent(
  key: string,
): ControlPlaneComponent | undefined {
  return CONTROL_PLANE.find((c) => c.kind === key || c.id === key);
}

export const CONTROL_PLANE_KINDS = CONTROL_PLANE.map((c) => c.kind);
