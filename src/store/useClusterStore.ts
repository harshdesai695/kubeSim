"use client";

/**
 * useClusterStore — the single client-side source of truth for kubeSim.
 *
 * Conceptually this store *is* "etcd": every simulated cluster object lives
 * here. Phase 0 ships an empty, correctly-typed skeleton plus the UI state
 * needed to drive the workspace shell (drawer, terminal, events panel).
 * Real object lifecycle / reconciliation logic arrives in later phases.
 */

import { create } from "zustand";
import { devtools } from "zustand/middleware";
import type {
  ClusterEvent,
  ConfigMap,
  Deployment,
  EventType,
  Ingress,
  IngressRule,
  Namespace,
  NetworkPolicy,
  PersistentVolume,
  PersistentVolumeClaim,
  Pod,
  ReplicaSet,
  Secret,
  SecretType,
  Service,
  ServiceType,
  WorkerNode,
} from "./types";
import { DEFAULT_NAMESPACES } from "./types";
import {
  allocateClusterIP,
  allocateExternalIP,
  allocatePodIP,
  containerFromImage,
  makePod,
  nextColor,
  POD_CPU,
  POD_MEM,
  randomSuffix,
  uid,
} from "@/lib/workloads";
import { findBindablePV } from "@/lib/storage";

/** A reference to whatever object is currently open in the detail drawer. */
export interface SelectedObject {
  kind: string;
  name: string;
  id?: string;
}

export interface AddNodeInput {
  name?: string;
  cpuCapacity: number; // cores
  memCapacity: number; // GB
  labels?: Record<string, string>;
}

export interface PodRefs {
  configMaps?: string[];
  secrets?: string[];
  pvcs?: string[];
}

export interface CreatePodInput {
  name?: string;
  image: string;
  labels?: Record<string, string>;
  refs?: PodRefs;
}

export interface CreateReplicaSetInput {
  name?: string;
  image: string;
  replicas: number;
  labels?: Record<string, string>;
  refs?: PodRefs;
}

export interface CreateDeploymentInput {
  name?: string;
  image: string;
  replicas: number;
  labels?: Record<string, string>;
  refs?: PodRefs;
}

export interface CreateServiceInput {
  name?: string;
  type: ServiceType;
  selector: Record<string, string>;
  port: number;
  targetPort: number;
  externalName?: string;
}

export interface CreateIngressInput {
  name?: string;
  rules: IngressRule[];
}

export interface CreateNetworkPolicyInput {
  name?: string;
  podSelector: Record<string, string>;
  allowAll: boolean;
  fromLabels?: Record<string, string>;
}

export interface CreateConfigMapInput {
  name?: string;
  data: Record<string, string>;
}

export interface CreateSecretInput {
  name?: string;
  type?: SecretType;
  data: Record<string, string>;
}

export interface CreatePVInput {
  name?: string;
  capacity: number;
  accessModes?: string[];
  storageClassName?: string;
}

export interface CreatePVCInput {
  name?: string;
  storage: number;
  accessModes?: string[];
  storageClassName?: string;
}

export interface ClusterState {
  /* --- Simulated etcd --- */
  nodes: WorkerNode[];
  pods: Pod[];
  replicaSets: ReplicaSet[];
  deployments: Deployment[];
  services: Service[];
  ingresses: Ingress[];
  networkPolicies: NetworkPolicy[];
  configMaps: ConfigMap[];
  secrets: Secret[];
  persistentVolumes: PersistentVolume[];
  persistentVolumeClaims: PersistentVolumeClaim[];
  events: ClusterEvent[];

  /* --- Global context --- */
  namespace: Namespace;
  namespaces: string[];

  /* --- Workspace UI state --- */
  ui: {
    terminalOpen: boolean;
    eventsOpen: boolean;
    workloadsOpen: boolean;
    drawerOpen: boolean;
    selected: SelectedObject | null;
    selectorQuery: string;
  };

  /* --- Actions --- */
  setNamespace: (ns: Namespace) => void;
  createNamespace: (name: string) => void;
  setSelectorQuery: (query: string) => void;
  pushEvent: (event: {
    type: EventType;
    reason: string;
    message: string;
    involvedObject?: ClusterEvent["involvedObject"];
  }) => void;
  addNode: (input: AddNodeInput) => void;
  removeNode: (id: string) => void;
  toggleNodeStatus: (id: string) => void;

  /* Workloads */
  createPod: (input: CreatePodInput) => void;
  killPod: (id: string) => void;
  deletePod: (id: string) => void;
  createReplicaSet: (input: CreateReplicaSetInput) => void;
  scaleReplicaSet: (id: string, replicas: number) => void;
  deleteReplicaSet: (id: string) => void;
  createDeployment: (input: CreateDeploymentInput) => void;
  scaleDeployment: (id: string, replicas: number) => void;
  updateDeploymentImage: (id: string, image: string) => void;
  rollbackDeployment: (id: string) => void;
  deleteDeployment: (id: string) => void;

  /* Networking */
  createService: (input: CreateServiceInput) => void;
  deleteService: (id: string) => void;
  createIngress: (input: CreateIngressInput) => void;
  deleteIngress: (id: string) => void;
  createNetworkPolicy: (input: CreateNetworkPolicyInput) => void;
  deleteNetworkPolicy: (id: string) => void;

  /* Config & Storage */
  createConfigMap: (input: CreateConfigMapInput) => void;
  updateConfigMap: (id: string, data: Record<string, string>) => void;
  deleteConfigMap: (id: string) => void;
  createSecret: (input: CreateSecretInput) => void;
  updateSecret: (id: string, data: Record<string, string>) => void;
  deleteSecret: (id: string) => void;
  createPV: (input: CreatePVInput) => void;
  deletePV: (id: string) => void;
  createPVC: (input: CreatePVCInput) => void;
  deletePVC: (id: string) => void;

  /** One reconciliation tick (scheduler + controllers). */
  reconcile: () => void;

  toggleTerminal: () => void;
  toggleEvents: () => void;
  toggleWorkloads: () => void;
  openDrawer: (selected: SelectedObject) => void;
  closeDrawer: () => void;
  resetCluster: () => void;
}

const initialData = (): Pick<
  ClusterState,
  | "nodes"
  | "pods"
  | "replicaSets"
  | "deployments"
  | "services"
  | "ingresses"
  | "networkPolicies"
  | "configMaps"
  | "secrets"
  | "persistentVolumes"
  | "persistentVolumeClaims"
  | "events"
> => ({
  nodes: [],
  pods: [],
  replicaSets: [],
  deployments: [],
  services: [],
  ingresses: [],
  networkPolicies: [],
  configMaps: [],
  secrets: [],
  persistentVolumes: [],
  persistentVolumeClaims: [],
  events: [],
});

let eventCounter = 0;
let nodeCounter = 0;

/* Reconcile timing (ms) — tuned so lifecycle transitions read clearly. */
const SCHEDULE_DELAY = 700;
const CREATE_DELAY = 700;
const TERM_DELAY = 500;
const CRASH_DELAY = 900;
const ROLLOUT_STEP = 1000;

const ACTIVE_PHASES = new Set(["Pending", "ContainerCreating", "Running"]);
const NODE_PHASES = new Set(["ContainerCreating", "Running"]);

function ownedByRs(pod: Pod, rsUid: string): boolean {
  return !!pod.metadata.ownerReferences?.some((o) => o.uid === rsUid);
}

export const useClusterStore = create<ClusterState>()(
  devtools(
    (set, get) => ({
      ...initialData(),
      namespace: "default",
      namespaces: [...DEFAULT_NAMESPACES],
      ui: {
        terminalOpen: true,
        eventsOpen: false,
        workloadsOpen: true,
        drawerOpen: false,
        selected: null,
        selectorQuery: "",
      },

      setNamespace: (ns) => set({ namespace: ns }, false, "setNamespace"),

      createNamespace: (name) => {
        const trimmed = name.trim();
        if (!trimmed || get().namespaces.includes(trimmed)) return;
        set(
          (state) => ({ namespaces: [...state.namespaces, trimmed] }),
          false,
          "createNamespace",
        );
        get().pushEvent({
          type: "Normal",
          reason: "CreatedNamespace",
          message: `Created namespace ${trimmed}.`,
          involvedObject: { kind: "Namespace", name: trimmed },
        });
      },

      setSelectorQuery: (query) =>
        set(
          (state) => ({ ui: { ...state.ui, selectorQuery: query } }),
          false,
          "setSelectorQuery",
        ),

      pushEvent: (event) =>
        set(
          (state) => ({
            events: [
              {
                id: `evt-${Date.now()}-${eventCounter++}`,
                type: event.type,
                reason: event.reason,
                message: event.message,
                involvedObject: event.involvedObject,
                timestamp: new Date().toISOString(),
              },
              ...state.events,
            ].slice(0, 200),
          }),
          false,
          "pushEvent",
        ),

      addNode: (input) => {
        const existing = get().nodes;
        nodeCounter += 1;
        let name = input.name?.trim() || `node-${existing.length + 1}`;
        // Guarantee uniqueness if a manual name collides.
        while (existing.some((n) => n.name === name)) {
          name = `${name}-${nodeCounter}`;
        }
        const node: WorkerNode = {
          id: `node-${Date.now()}-${nodeCounter}`,
          name,
          role: "worker",
          status: "Ready",
          cpuCapacity: input.cpuCapacity,
          cpuUsed: 0,
          memCapacity: input.memCapacity,
          memUsed: 0,
          labels: {
            "kubernetes.io/hostname": name,
            "node-role.kubernetes.io/worker": "",
            ...(input.labels ?? {}),
          },
          taints: [],
          podIds: [],
          createdAt: Date.now(),
        };
        set((state) => ({ nodes: [...state.nodes, node] }), false, "addNode");
        get().pushEvent({
          type: "Normal",
          reason: "NodeJoined",
          message: `Node ${name} joined the cluster (${node.cpuCapacity} CPU, ${node.memCapacity}Gi).`,
          involvedObject: { kind: "Node", name },
        });
      },

      removeNode: (id) => {
        const node = get().nodes.find((n) => n.id === id);
        if (!node || node.draining) return;
        // Phase 1: "drain & delete" — mark draining, animate, then remove.
        set(
          (state) => ({
            nodes: state.nodes.map((n) =>
              n.id === id ? { ...n, draining: true, status: "NotReady" } : n,
            ),
          }),
          false,
          "drainNode",
        );
        get().pushEvent({
          type: "Normal",
          reason: "NodeDraining",
          message: `Draining node ${node.name}…`,
          involvedObject: { kind: "Node", name: node.name },
        });
        setTimeout(() => {
          set(
            (state) => ({
              nodes: state.nodes.filter((n) => n.id !== id),
              ui:
                state.ui.selected?.id === id
                  ? { ...state.ui, drawerOpen: false, selected: null }
                  : state.ui,
            }),
            false,
            "removeNode",
          );
          get().pushEvent({
            type: "Normal",
            reason: "NodeDeleted",
            message: `Node ${node.name} removed from the cluster.`,
            involvedObject: { kind: "Node", name: node.name },
          });
        }, 700);
      },

      toggleNodeStatus: (id) => {
        const node = get().nodes.find((n) => n.id === id);
        if (!node || node.draining) return;
        const next = node.status === "Ready" ? "NotReady" : "Ready";
        set(
          (state) => ({
            nodes: state.nodes.map((n) =>
              n.id === id ? { ...n, status: next } : n,
            ),
          }),
          false,
          "toggleNodeStatus",
        );
        get().pushEvent({
          type: next === "Ready" ? "Normal" : "Warning",
          reason: next === "Ready" ? "NodeReady" : "NodeNotReady",
          message:
            next === "Ready"
              ? `Node ${node.name} is Ready.`
              : `Node ${node.name} marked NotReady.`,
          involvedObject: { kind: "Node", name: node.name },
        });
      },

      /* ---------------- Workloads ---------------- */

      createPod: (input) => {
        const ns = get().namespace;
        const name = input.name?.trim() || `pod-${randomSuffix()}`;
        const labels = { app: name, ...(input.labels ?? {}) };
        const pod = makePod({
          name,
          namespace: ns,
          labels,
          containers: [containerFromImage(input.image)],
          configMaps: input.refs?.configMaps,
          secrets: input.refs?.secrets,
          pvcs: input.refs?.pvcs,
        });
        set((s) => ({ pods: [...s.pods, pod] }), false, "createPod");
        get().pushEvent({
          type: "Normal",
          reason: "Created",
          message: `Created pod ${name} (image ${input.image}).`,
          involvedObject: { kind: "Pod", name },
        });
      },

      killPod: (id) => {
        const pod = get().pods.find((p) => p.metadata.uid === id);
        if (
          !pod ||
          pod.status.phase === "Terminating" ||
          pod.status.phase === "CrashLoopBackOff"
        )
          return;
        set(
          (s) => ({
            pods: s.pods.map((p) =>
              p.metadata.uid === id
                ? {
                    ...p,
                    status: {
                      ...p.status,
                      phase: "CrashLoopBackOff",
                      restartCount: p.status.restartCount + 1,
                    },
                    spec: {
                      ...p.spec,
                      containers: p.spec.containers.map((c) => ({
                        ...c,
                        state: "Terminated",
                      })),
                    },
                    phaseSince: Date.now(),
                  }
                : p,
            ),
          }),
          false,
          "killPod",
        );
        get().pushEvent({
          type: "Warning",
          reason: "Killing",
          message: `Killed pod ${pod.metadata.name} (simulated crash).`,
          involvedObject: { kind: "Pod", name: pod.metadata.name },
        });
      },

      deletePod: (id) => {
        const pod = get().pods.find((p) => p.metadata.uid === id);
        if (!pod || pod.status.phase === "Terminating") return;
        set(
          (s) => ({
            pods: s.pods.map((p) =>
              p.metadata.uid === id
                ? { ...p, status: { ...p.status, phase: "Terminating" }, phaseSince: Date.now() }
                : p,
            ),
          }),
          false,
          "deletePod",
        );
        get().pushEvent({
          type: "Normal",
          reason: "Killing",
          message: `Deleting pod ${pod.metadata.name}.`,
          involvedObject: { kind: "Pod", name: pod.metadata.name },
        });
        // Persistent storage survives pod deletion (teaching point).
        for (const pvcName of pod.spec.pvcs ?? []) {
          get().pushEvent({
            type: "Normal",
            reason: "VolumeRetained",
            message: `PVC ${pvcName} survived pod ${pod.metadata.name} deletion (persistent storage retained).`,
            involvedObject: { kind: "PersistentVolumeClaim", name: pvcName },
          });
        }
      },

      createReplicaSet: (input) => {
        const ns = get().namespace;
        const name = input.name?.trim() || `rs-${randomSuffix()}`;
        const selector = { app: name, ...(input.labels ?? {}) };
        const rs: ReplicaSet = {
          metadata: {
            name,
            namespace: ns,
            uid: uid("rs"),
            labels: selector,
            creationTimestamp: new Date().toISOString(),
          },
          spec: {
            replicas: Math.max(0, input.replicas),
            selector,
            template: {
              labels: selector,
              containers: [containerFromImage(input.image)],
              configMaps: input.refs?.configMaps,
              secrets: input.refs?.secrets,
              pvcs: input.refs?.pvcs,
            },
          },
          status: { replicas: 0, readyReplicas: 0 },
          revision: 1,
          image: input.image,
          color: nextColor(),
          createdAt: Date.now(),
        };
        set((s) => ({ replicaSets: [...s.replicaSets, rs] }), false, "createReplicaSet");
        get().pushEvent({
          type: "Normal",
          reason: "SuccessfulCreate",
          message: `Created ReplicaSet ${name} (replicas: ${rs.spec.replicas}).`,
          involvedObject: { kind: "ReplicaSet", name },
        });
      },

      scaleReplicaSet: (id, replicas) => {
        const rs = get().replicaSets.find((r) => r.metadata.uid === id);
        if (!rs) return;
        const next = Math.max(0, Math.round(replicas));
        if (next === rs.spec.replicas) return;
        set(
          (s) => ({
            replicaSets: s.replicaSets.map((r) =>
              r.metadata.uid === id
                ? { ...r, spec: { ...r.spec, replicas: next } }
                : r,
            ),
          }),
          false,
          "scaleReplicaSet",
        );
        get().pushEvent({
          type: "Normal",
          reason: "ScalingReplicaSet",
          message: `Scaled ReplicaSet ${rs.metadata.name} to ${next} replicas.`,
          involvedObject: { kind: "ReplicaSet", name: rs.metadata.name },
        });
      },

      deleteReplicaSet: (id) => {
        const rs = get().replicaSets.find((r) => r.metadata.uid === id);
        if (!rs) return;
        set(
          (s) => ({
            replicaSets: s.replicaSets.filter((r) => r.metadata.uid !== id),
            pods: s.pods.map((p) =>
              ownedByRs(p, id)
                ? { ...p, status: { ...p.status, phase: "Terminating" }, phaseSince: Date.now() }
                : p,
            ),
          }),
          false,
          "deleteReplicaSet",
        );
        get().pushEvent({
          type: "Normal",
          reason: "SuccessfulDelete",
          message: `Deleted ReplicaSet ${rs.metadata.name}.`,
          involvedObject: { kind: "ReplicaSet", name: rs.metadata.name },
        });
      },

      createDeployment: (input) => {
        const ns = get().namespace;
        const name = input.name?.trim() || `deploy-${randomSuffix()}`;
        const selector = { app: name, ...(input.labels ?? {}) };
        const color = nextColor();
        const now = Date.now();
        const deployUid = uid("deploy");
        const rsName = `${name}-${randomSuffix()}`;
        const rs: ReplicaSet = {
          metadata: {
            name: rsName,
            namespace: ns,
            uid: uid("rs"),
            labels: { ...selector, "pod-template-hash": randomSuffix() },
            creationTimestamp: new Date(now).toISOString(),
            ownerReferences: [{ kind: "Deployment", name, uid: deployUid }],
          },
          spec: {
            replicas: Math.max(0, input.replicas),
            selector,
            template: {
              labels: selector,
              containers: [containerFromImage(input.image)],
              configMaps: input.refs?.configMaps,
              secrets: input.refs?.secrets,
              pvcs: input.refs?.pvcs,
            },
          },
          status: { replicas: 0, readyReplicas: 0 },
          revision: 1,
          image: input.image,
          color,
          createdAt: now,
        };
        const deployment: Deployment = {
          metadata: {
            name,
            namespace: ns,
            uid: deployUid,
            labels: selector,
            creationTimestamp: new Date(now).toISOString(),
          },
          spec: {
            replicas: Math.max(0, input.replicas),
            selector,
            strategy: { type: "RollingUpdate", maxSurge: 1, maxUnavailable: 0 },
            template: {
              labels: selector,
              containers: [containerFromImage(input.image)],
              configMaps: input.refs?.configMaps,
              secrets: input.refs?.secrets,
              pvcs: input.refs?.pvcs,
            },
          },
          status: { replicas: 0, readyReplicas: 0 },
          activeReplicaSetId: rs.metadata.uid,
          revisions: [
            {
              revision: 1,
              image: input.image,
              timestamp: new Date(now).toISOString(),
              replicaSetId: rs.metadata.uid,
            },
          ],
          color,
          createdAt: now,
        };
        set(
          (s) => ({
            deployments: [...s.deployments, deployment],
            replicaSets: [...s.replicaSets, rs],
          }),
          false,
          "createDeployment",
        );
        get().pushEvent({
          type: "Normal",
          reason: "ScalingReplicaSet",
          message: `Created Deployment ${name} (image ${input.image}, replicas: ${deployment.spec.replicas}).`,
          involvedObject: { kind: "Deployment", name },
        });
      },

      scaleDeployment: (id, replicas) => {
        const d = get().deployments.find((x) => x.metadata.uid === id);
        if (!d) return;
        const next = Math.max(0, Math.round(replicas));
        if (next === d.spec.replicas) return;
        set(
          (s) => ({
            deployments: s.deployments.map((x) =>
              x.metadata.uid === id
                ? { ...x, spec: { ...x.spec, replicas: next } }
                : x,
            ),
            // cascade to the active ReplicaSet (unless mid-rollout)
            replicaSets: s.replicaSets.map((r) =>
              r.metadata.uid === d.activeReplicaSetId && !d.rollout
                ? { ...r, spec: { ...r.spec, replicas: next } }
                : r,
            ),
          }),
          false,
          "scaleDeployment",
        );
        get().pushEvent({
          type: "Normal",
          reason: "ScalingReplicaSet",
          message: `Scaled Deployment ${d.metadata.name} to ${next} replicas.`,
          involvedObject: { kind: "Deployment", name: d.metadata.name },
        });
      },

      updateDeploymentImage: (id, image) => {
        const d = get().deployments.find((x) => x.metadata.uid === id);
        if (!d) return;
        const currentImage = d.spec.template.containers[0]?.image;
        if (image.trim() === currentImage || image.trim() === "") return;
        const now = Date.now();
        const nextRevision =
          Math.max(...d.revisions.map((r) => r.revision), 0) + 1;
        const newRsUid = uid("rs");
        const newRs: ReplicaSet = {
          metadata: {
            name: `${d.metadata.name}-${randomSuffix()}`,
            namespace: d.metadata.namespace,
            uid: newRsUid,
            labels: { ...d.spec.selector, "pod-template-hash": randomSuffix() },
            creationTimestamp: new Date(now).toISOString(),
            ownerReferences: [
              { kind: "Deployment", name: d.metadata.name, uid: d.metadata.uid },
            ],
          },
          spec: {
            replicas: 0,
            selector: d.spec.selector,
            template: {
              labels: d.spec.selector,
              containers: [containerFromImage(image.trim())],
              configMaps: d.spec.template.configMaps,
              secrets: d.spec.template.secrets,
              pvcs: d.spec.template.pvcs,
            },
          },
          status: { replicas: 0, readyReplicas: 0 },
          revision: nextRevision,
          image: image.trim(),
          color: nextColor(),
          createdAt: now,
        };
        set(
          (s) => ({
            replicaSets: [...s.replicaSets, newRs],
            deployments: s.deployments.map((x) =>
              x.metadata.uid === id
                ? {
                    ...x,
                    spec: {
                      ...x.spec,
                      template: {
                        ...x.spec.template,
                        containers: [containerFromImage(image.trim())],
                      },
                    },
                    revisions: [
                      ...x.revisions,
                      {
                        revision: nextRevision,
                        image: image.trim(),
                        timestamp: new Date(now).toISOString(),
                        replicaSetId: newRsUid,
                      },
                    ],
                    rollout: {
                      status: "Progressing",
                      newReplicaSetId: newRsUid,
                      oldReplicaSetId: x.activeReplicaSetId,
                      lastStepAt: now - ROLLOUT_STEP,
                    },
                  }
                : x,
            ),
          }),
          false,
          "updateDeploymentImage",
        );
        get().pushEvent({
          type: "Normal",
          reason: "RollingUpdate",
          message: `Deployment ${d.metadata.name}: rolling update to ${image.trim()} (revision ${nextRevision}).`,
          involvedObject: { kind: "Deployment", name: d.metadata.name },
        });
      },

      rollbackDeployment: (id) => {
        const d = get().deployments.find((x) => x.metadata.uid === id);
        if (!d) return;
        const activeRs = get().replicaSets.find(
          (r) => r.metadata.uid === d.activeReplicaSetId,
        );
        const currentRevision = activeRs?.revision ?? 0;
        const prior = d.revisions
          .filter((r) => r.revision < currentRevision)
          .sort((a, b) => b.revision - a.revision)[0];
        if (!prior) {
          get().pushEvent({
            type: "Warning",
            reason: "RollbackFailed",
            message: `Deployment ${d.metadata.name}: no previous revision to roll back to.`,
            involvedObject: { kind: "Deployment", name: d.metadata.name },
          });
          return;
        }
        const targetRs = get().replicaSets.find(
          (r) => r.metadata.uid === prior.replicaSetId,
        );
        if (!targetRs) return;
        const now = Date.now();
        set(
          (s) => ({
            deployments: s.deployments.map((x) =>
              x.metadata.uid === id
                ? {
                    ...x,
                    spec: {
                      ...x.spec,
                      template: {
                        ...x.spec.template,
                        containers: [containerFromImage(prior.image)],
                      },
                    },
                    rollout: {
                      status: "Progressing",
                      newReplicaSetId: targetRs.metadata.uid,
                      oldReplicaSetId: x.activeReplicaSetId,
                      lastStepAt: now - ROLLOUT_STEP,
                    },
                  }
                : x,
            ),
          }),
          false,
          "rollbackDeployment",
        );
        get().pushEvent({
          type: "Normal",
          reason: "RollingUpdate",
          message: `Deployment ${d.metadata.name}: rolling back to revision ${prior.revision} (${prior.image}).`,
          involvedObject: { kind: "Deployment", name: d.metadata.name },
        });
      },

      deleteDeployment: (id) => {
        const d = get().deployments.find((x) => x.metadata.uid === id);
        if (!d) return;
        const rsIds = new Set(
          get()
            .replicaSets.filter((r) =>
              r.metadata.ownerReferences?.some((o) => o.uid === id),
            )
            .map((r) => r.metadata.uid),
        );
        set(
          (s) => ({
            deployments: s.deployments.filter((x) => x.metadata.uid !== id),
            replicaSets: s.replicaSets.filter((r) => !rsIds.has(r.metadata.uid)),
            pods: s.pods.map((p) =>
              p.metadata.ownerReferences?.some((o) => rsIds.has(o.uid))
                ? { ...p, status: { ...p.status, phase: "Terminating" }, phaseSince: Date.now() }
                : p,
            ),
          }),
          false,
          "deleteDeployment",
        );
        get().pushEvent({
          type: "Normal",
          reason: "SuccessfulDelete",
          message: `Deleted Deployment ${d.metadata.name}.`,
          involvedObject: { kind: "Deployment", name: d.metadata.name },
        });
      },

      /* ---------------- Networking ---------------- */

      createService: (input) => {
        const ns = get().namespace;
        const name = input.name?.trim() || `svc-${randomSuffix()}`;
        const now = Date.now();
        const service: Service = {
          metadata: {
            name,
            namespace: ns,
            uid: uid("svc"),
            labels: { app: name },
            creationTimestamp: new Date(now).toISOString(),
          },
          spec: {
            type: input.type,
            selector: input.selector,
            ports: [{ port: input.port, targetPort: input.targetPort }],
            externalName:
              input.type === "ExternalName" ? input.externalName : undefined,
          },
          status: {
            clusterIP:
              input.type === "ExternalName" ? undefined : allocateClusterIP(),
            externalIPPending: input.type === "LoadBalancer",
          },
          color: nextColor(),
          createdAt: now,
        };
        set((s) => ({ services: [...s.services, service] }), false, "createService");
        get().pushEvent({
          type: "Normal",
          reason: "CreatedService",
          message: `Created Service ${name} (${input.type}${
            service.status.clusterIP ? `, ClusterIP ${service.status.clusterIP}` : ""
          }).`,
          involvedObject: { kind: "Service", name },
        });

        // LoadBalancer: assign an external IP after a short delay.
        if (input.type === "LoadBalancer") {
          setTimeout(() => {
            const externalIP = allocateExternalIP();
            set(
              (s) => ({
                services: s.services.map((sv) =>
                  sv.metadata.uid === service.metadata.uid
                    ? {
                        ...sv,
                        status: {
                          ...sv.status,
                          externalIP,
                          externalIPPending: false,
                        },
                      }
                    : sv,
                ),
              }),
              false,
              "assignExternalIP",
            );
            get().pushEvent({
              type: "Normal",
              reason: "EnsuredLoadBalancer",
              message: `Service ${name}: external IP ${externalIP} assigned.`,
              involvedObject: { kind: "Service", name },
            });
          }, 2000);
        }
      },

      deleteService: (id) => {
        const svc = get().services.find((s) => s.metadata.uid === id);
        if (!svc) return;
        set(
          (s) => ({
            services: s.services.filter((x) => x.metadata.uid !== id),
            ui:
              s.ui.selected?.id === id
                ? { ...s.ui, drawerOpen: false, selected: null }
                : s.ui,
          }),
          false,
          "deleteService",
        );
        get().pushEvent({
          type: "Normal",
          reason: "SuccessfulDelete",
          message: `Deleted Service ${svc.metadata.name}.`,
          involvedObject: { kind: "Service", name: svc.metadata.name },
        });
      },

      createIngress: (input) => {
        const ns = get().namespace;
        const name = input.name?.trim() || `ing-${randomSuffix()}`;
        const now = Date.now();
        const ingress: Ingress = {
          metadata: {
            name,
            namespace: ns,
            uid: uid("ing"),
            labels: {},
            creationTimestamp: new Date(now).toISOString(),
          },
          spec: { rules: input.rules },
          createdAt: now,
        };
        set((s) => ({ ingresses: [...s.ingresses, ingress] }), false, "createIngress");
        get().pushEvent({
          type: "Normal",
          reason: "CreatedIngress",
          message: `Created Ingress ${name} (${input.rules.length} rule${
            input.rules.length === 1 ? "" : "s"
          }).`,
          involvedObject: { kind: "Ingress", name },
        });
      },

      deleteIngress: (id) => {
        const ing = get().ingresses.find((i) => i.metadata.uid === id);
        if (!ing) return;
        set(
          (s) => ({
            ingresses: s.ingresses.filter((x) => x.metadata.uid !== id),
            ui:
              s.ui.selected?.id === id
                ? { ...s.ui, drawerOpen: false, selected: null }
                : s.ui,
          }),
          false,
          "deleteIngress",
        );
        get().pushEvent({
          type: "Normal",
          reason: "SuccessfulDelete",
          message: `Deleted Ingress ${ing.metadata.name}.`,
          involvedObject: { kind: "Ingress", name: ing.metadata.name },
        });
      },

      createNetworkPolicy: (input) => {
        const ns = get().namespace;
        const name = input.name?.trim() || `netpol-${randomSuffix()}`;
        const now = Date.now();
        const np: NetworkPolicy = {
          metadata: {
            name,
            namespace: ns,
            uid: uid("np"),
            labels: {},
            creationTimestamp: new Date(now).toISOString(),
          },
          spec: {
            podSelector: input.podSelector,
            allowAll: input.allowAll,
            fromLabels: input.fromLabels,
          },
          createdAt: now,
        };
        set(
          (s) => ({ networkPolicies: [...s.networkPolicies, np] }),
          false,
          "createNetworkPolicy",
        );
        get().pushEvent({
          type: "Normal",
          reason: "CreatedNetworkPolicy",
          message: `Created NetworkPolicy ${name} (${
            input.allowAll ? "allow all ingress" : "default deny ingress"
          }).`,
          involvedObject: { kind: "NetworkPolicy", name },
        });
      },

      deleteNetworkPolicy: (id) => {
        const np = get().networkPolicies.find((n) => n.metadata.uid === id);
        if (!np) return;
        set(
          (s) => ({
            networkPolicies: s.networkPolicies.filter(
              (x) => x.metadata.uid !== id,
            ),
            ui:
              s.ui.selected?.id === id
                ? { ...s.ui, drawerOpen: false, selected: null }
                : s.ui,
          }),
          false,
          "deleteNetworkPolicy",
        );
        get().pushEvent({
          type: "Normal",
          reason: "SuccessfulDelete",
          message: `Deleted NetworkPolicy ${np.metadata.name}.`,
          involvedObject: { kind: "NetworkPolicy", name: np.metadata.name },
        });
      },

      /* ---------------- Config & Storage ---------------- */

      createConfigMap: (input) => {
        const ns = get().namespace;
        const name = input.name?.trim() || `cm-${randomSuffix()}`;
        const cm: ConfigMap = {
          metadata: {
            name,
            namespace: ns,
            uid: uid("cm"),
            labels: {},
            creationTimestamp: new Date().toISOString(),
          },
          data: input.data,
          createdAt: Date.now(),
        };
        set((s) => ({ configMaps: [...s.configMaps, cm] }), false, "createConfigMap");
        get().pushEvent({
          type: "Normal",
          reason: "CreatedConfigMap",
          message: `Created ConfigMap ${name} (${Object.keys(input.data).length} keys).`,
          involvedObject: { kind: "ConfigMap", name },
        });
      },

      updateConfigMap: (id, data) =>
        set(
          (s) => ({
            configMaps: s.configMaps.map((cm) =>
              cm.metadata.uid === id ? { ...cm, data } : cm,
            ),
          }),
          false,
          "updateConfigMap",
        ),

      deleteConfigMap: (id) => {
        const cm = get().configMaps.find((c) => c.metadata.uid === id);
        if (!cm) return;
        set(
          (s) => ({
            configMaps: s.configMaps.filter((c) => c.metadata.uid !== id),
            ui:
              s.ui.selected?.id === id
                ? { ...s.ui, drawerOpen: false, selected: null }
                : s.ui,
          }),
          false,
          "deleteConfigMap",
        );
        get().pushEvent({
          type: "Normal",
          reason: "SuccessfulDelete",
          message: `Deleted ConfigMap ${cm.metadata.name}.`,
          involvedObject: { kind: "ConfigMap", name: cm.metadata.name },
        });
      },

      createSecret: (input) => {
        const ns = get().namespace;
        const name = input.name?.trim() || `secret-${randomSuffix()}`;
        const secret: Secret = {
          metadata: {
            name,
            namespace: ns,
            uid: uid("secret"),
            labels: {},
            creationTimestamp: new Date().toISOString(),
          },
          type: input.type ?? "Opaque",
          data: input.data,
          createdAt: Date.now(),
        };
        set((s) => ({ secrets: [...s.secrets, secret] }), false, "createSecret");
        get().pushEvent({
          type: "Normal",
          reason: "CreatedSecret",
          message: `Created Secret ${name} (${Object.keys(input.data).length} keys).`,
          involvedObject: { kind: "Secret", name },
        });
      },

      updateSecret: (id, data) =>
        set(
          (s) => ({
            secrets: s.secrets.map((sec) =>
              sec.metadata.uid === id ? { ...sec, data } : sec,
            ),
          }),
          false,
          "updateSecret",
        ),

      deleteSecret: (id) => {
        const sec = get().secrets.find((c) => c.metadata.uid === id);
        if (!sec) return;
        set(
          (s) => ({
            secrets: s.secrets.filter((c) => c.metadata.uid !== id),
            ui:
              s.ui.selected?.id === id
                ? { ...s.ui, drawerOpen: false, selected: null }
                : s.ui,
          }),
          false,
          "deleteSecret",
        );
        get().pushEvent({
          type: "Normal",
          reason: "SuccessfulDelete",
          message: `Deleted Secret ${sec.metadata.name}.`,
          involvedObject: { kind: "Secret", name: sec.metadata.name },
        });
      },

      createPV: (input) => {
        const name = input.name?.trim() || `pv-${randomSuffix()}`;
        const pv: PersistentVolume = {
          metadata: {
            name,
            namespace: "default",
            uid: uid("pv"),
            labels: {},
            creationTimestamp: new Date().toISOString(),
          },
          spec: {
            capacity: input.capacity,
            accessModes: input.accessModes ?? ["ReadWriteOnce"],
            storageClassName: input.storageClassName,
          },
          status: { phase: "Available" },
          createdAt: Date.now(),
        };
        set(
          (s) => ({ persistentVolumes: [...s.persistentVolumes, pv] }),
          false,
          "createPV",
        );
        get().pushEvent({
          type: "Normal",
          reason: "CreatedPV",
          message: `Created PersistentVolume ${name} (${input.capacity}Gi, Available).`,
          involvedObject: { kind: "PersistentVolume", name },
        });
      },

      deletePV: (id) => {
        const pv = get().persistentVolumes.find((p) => p.metadata.uid === id);
        if (!pv) return;
        set(
          (s) => ({
            persistentVolumes: s.persistentVolumes.filter(
              (p) => p.metadata.uid !== id,
            ),
            ui:
              s.ui.selected?.id === id
                ? { ...s.ui, drawerOpen: false, selected: null }
                : s.ui,
          }),
          false,
          "deletePV",
        );
        get().pushEvent({
          type: "Normal",
          reason: "SuccessfulDelete",
          message: `Deleted PersistentVolume ${pv.metadata.name}.`,
          involvedObject: { kind: "PersistentVolume", name: pv.metadata.name },
        });
      },

      createPVC: (input) => {
        const ns = get().namespace;
        const name = input.name?.trim() || `pvc-${randomSuffix()}`;
        const now = Date.now();
        const claim: PersistentVolumeClaim = {
          metadata: {
            name,
            namespace: ns,
            uid: uid("pvc"),
            labels: {},
            creationTimestamp: new Date(now).toISOString(),
          },
          spec: {
            storage: input.storage,
            accessModes: input.accessModes ?? ["ReadWriteOnce"],
            storageClassName: input.storageClassName,
          },
          status: { phase: "Pending" },
          createdAt: now,
        };

        // Smallest-fit binding to an existing Available PV.
        let pv = findBindablePV(claim, get().persistentVolumes);
        let provisioned = false;

        if (!pv) {
          // Dynamic provisioning via StorageClass.
          provisioned = true;
          pv = {
            metadata: {
              name: `pv-${randomSuffix()}`,
              namespace: "default",
              uid: uid("pv"),
              labels: {},
              creationTimestamp: new Date(now).toISOString(),
            },
            spec: {
              capacity: input.storage,
              accessModes: claim.spec.accessModes,
              storageClassName: input.storageClassName,
            },
            status: { phase: "Available" },
            dynamic: true,
            createdAt: now,
          };
        }

        // Bind claim ↔ volume.
        const boundPV: PersistentVolume = {
          ...pv,
          status: {
            phase: "Bound",
            boundClaim: { name, uid: claim.metadata.uid },
          },
        };
        const boundClaim: PersistentVolumeClaim = {
          ...claim,
          status: { phase: "Bound", volumeName: boundPV.metadata.name },
          boundPVUid: boundPV.metadata.uid,
        };

        set(
          (s) => ({
            persistentVolumeClaims: [
              ...s.persistentVolumeClaims,
              boundClaim,
            ],
            persistentVolumes: provisioned
              ? [...s.persistentVolumes, boundPV]
              : s.persistentVolumes.map((p) =>
                  p.metadata.uid === boundPV.metadata.uid ? boundPV : p,
                ),
          }),
          false,
          "createPVC",
        );

        if (provisioned) {
          get().pushEvent({
            type: "Normal",
            reason: "ProvisioningSucceeded",
            message: `StorageClass '${input.storageClassName ?? "standard"}' dynamically provisioned PV ${boundPV.metadata.name} (${boundPV.spec.capacity}Gi).`,
            involvedObject: { kind: "PersistentVolume", name: boundPV.metadata.name },
          });
        }
        get().pushEvent({
          type: "Normal",
          reason: "Bound",
          message: `PVC ${name} bound to PV ${boundPV.metadata.name} (${boundPV.spec.capacity}Gi).`,
          involvedObject: { kind: "PersistentVolumeClaim", name },
        });
      },

      deletePVC: (id) => {
        const pvc = get().persistentVolumeClaims.find(
          (c) => c.metadata.uid === id,
        );
        if (!pvc) return;
        set(
          (s) => ({
            persistentVolumeClaims: s.persistentVolumeClaims.filter(
              (c) => c.metadata.uid !== id,
            ),
            // Bound PV is Released (not deleted) — Retain semantics.
            persistentVolumes: s.persistentVolumes.map((pv) =>
              pv.metadata.uid === pvc.boundPVUid
                ? { ...pv, status: { phase: "Released" } }
                : pv,
            ),
            ui:
              s.ui.selected?.id === id
                ? { ...s.ui, drawerOpen: false, selected: null }
                : s.ui,
          }),
          false,
          "deletePVC",
        );
        get().pushEvent({
          type: "Normal",
          reason: "SuccessfulDelete",
          message: `Deleted PVC ${pvc.metadata.name}; bound PV released.`,
          involvedObject: { kind: "PersistentVolumeClaim", name: pvc.metadata.name },
        });
      },

      reconcile: () => {
        const state = get();
        const now = Date.now();
        const events: Parameters<ClusterState["pushEvent"]>[0][] = [];
        let dirty = false;

        /* --- Placement bookkeeping (simulated scheduler) --- */
        const eligibleNodes = state.nodes.filter(
          (n) => n.status === "Ready" && !n.draining,
        );
        const nodeLoad = new Map<string, number>();
        for (const p of state.pods) {
          if (p.spec.nodeName && ACTIVE_PHASES.has(p.status.phase)) {
            nodeLoad.set(
              p.spec.nodeName,
              (nodeLoad.get(p.spec.nodeName) ?? 0) + 1,
            );
          }
        }
        const placeOnNode = (): string | undefined => {
          if (eligibleNodes.length === 0) return undefined;
          const chosen = eligibleNodes
            .slice()
            .sort((a, b) => {
              const ca = nodeLoad.get(a.name) ?? 0;
              const cb = nodeLoad.get(b.name) ?? 0;
              if (ca !== cb) return ca - cb;
              return b.cpuCapacity - a.cpuCapacity;
            })[0];
          nodeLoad.set(chosen.name, (nodeLoad.get(chosen.name) ?? 0) + 1);
          return chosen.name;
        };

        /* --- 1) Pod lifecycle transitions --- */
        let pods: Pod[] = [];
        for (const p of state.pods) {
          const age = now - p.phaseSince;
          if (p.status.phase === "Terminating") {
            if (age >= TERM_DELAY) {
              dirty = true;
              continue;
            }
            pods.push(p);
          } else if (p.status.phase === "CrashLoopBackOff") {
            if (age >= CRASH_DELAY) {
              dirty = true;
              continue;
            }
            pods.push(p);
          } else if (p.status.phase === "Pending" && !p.spec.nodeName) {
            if (age >= SCHEDULE_DELAY) {
              const nodeName = placeOnNode();
              if (nodeName) {
                dirty = true;
                pods.push({
                  ...p,
                  spec: { ...p.spec, nodeName },
                  status: {
                    ...p.status,
                    phase: "ContainerCreating",
                    podIP: allocatePodIP(),
                  },
                  phaseSince: now,
                });
                events.push({
                  type: "Normal",
                  reason: "Scheduled",
                  message: `Scheduled pod ${p.metadata.name} to ${nodeName}.`,
                  involvedObject: { kind: "Pod", name: p.metadata.name },
                });
                continue;
              }
              pods.push(p);
            } else {
              pods.push(p);
            }
          } else if (p.status.phase === "ContainerCreating") {
            if (age >= CREATE_DELAY) {
              dirty = true;
              pods.push({
                ...p,
                spec: {
                  ...p.spec,
                  containers: p.spec.containers.map((c) => ({
                    ...c,
                    state: "Running",
                  })),
                },
                status: { ...p.status, phase: "Running" },
                phaseSince: now,
              });
              continue;
            }
            pods.push(p);
          } else {
            pods.push(p);
          }
        }

        /* --- 2) ReplicaSet controller (self-heal + scaling) --- */
        const replicaSets: ReplicaSet[] = state.replicaSets.map((rs) => {
          const owned = pods.filter((p) => ownedByRs(p, rs.metadata.uid));
          const active = owned.filter((p) => ACTIVE_PHASES.has(p.status.phase));
          const running = active.filter(
            (p) => p.status.phase === "Running",
          ).length;

          if (active.length < rs.spec.replicas) {
            // Create one pod per tick → staggered spawn / visible self-heal.
            const name = `${rs.metadata.name}-${randomSuffix()}`;
            pods.push(
              makePod({
                name,
                namespace: rs.metadata.namespace,
                labels: rs.spec.template.labels,
                containers: rs.spec.template.containers,
                owner: {
                  kind: "ReplicaSet",
                  name: rs.metadata.name,
                  uid: rs.metadata.uid,
                },
                ownerColor: rs.color,
                configMaps: rs.spec.template.configMaps,
                secrets: rs.spec.template.secrets,
                pvcs: rs.spec.template.pvcs,
              }),
            );
            dirty = true;
            events.push({
              type: "Normal",
              reason: "SuccessfulCreate",
              message: `ReplicaSet ${rs.metadata.name}: created pod ${name} to maintain ${rs.spec.replicas} replicas.`,
              involvedObject: { kind: "ReplicaSet", name: rs.metadata.name },
            });
          } else if (active.length > rs.spec.replicas) {
            const extras = active
              .slice()
              .sort((a, b) => b.createdAt - a.createdAt)
              .slice(0, active.length - rs.spec.replicas);
            const extraIds = new Set(extras.map((p) => p.metadata.uid));
            pods = pods.map((p) =>
              extraIds.has(p.metadata.uid)
                ? {
                    ...p,
                    status: { ...p.status, phase: "Terminating" },
                    phaseSince: now,
                  }
                : p,
            );
            dirty = true;
            events.push({
              type: "Normal",
              reason: "SuccessfulDelete",
              message: `ReplicaSet ${rs.metadata.name}: scaled down to ${rs.spec.replicas} replicas.`,
              involvedObject: { kind: "ReplicaSet", name: rs.metadata.name },
            });
          }

          if (
            rs.status.replicas !== active.length ||
            rs.status.readyReplicas !== running
          ) {
            dirty = true;
            return {
              ...rs,
              status: { replicas: active.length, readyReplicas: running },
            };
          }
          return rs;
        });

        /* --- 3) Deployment controller (rolling update pacing) --- */
        const rsByUid = new Map(replicaSets.map((r) => [r.metadata.uid, r]));
        // Immutable replica overrides produced by rollout stepping.
        const rsReplicaOverride = new Map<string, number>();
        const getRep = (uidKey: string): number =>
          rsReplicaOverride.get(uidKey) ??
          rsByUid.get(uidKey)?.spec.replicas ??
          0;

        const deployments: Deployment[] = state.deployments.map((d) => {
          let next = d;

          if (d.rollout && d.rollout.status === "Progressing") {
            const newRs = rsByUid.get(d.rollout.newReplicaSetId);
            const oldRs = rsByUid.get(d.rollout.oldReplicaSetId);
            const desired = d.spec.replicas;
            const maxSurge = d.spec.strategy.maxSurge ?? 1;

            if (now - d.rollout.lastStepAt >= ROLLOUT_STEP && newRs) {
              const newRep = getRep(newRs.metadata.uid);
              const oldRep = oldRs ? getRep(oldRs.metadata.uid) : 0;
              const total = newRep + oldRep;

              if (newRep < desired && total < desired + maxSurge) {
                rsReplicaOverride.set(newRs.metadata.uid, newRep + 1);
                dirty = true;
              } else if (
                oldRs &&
                oldRep > 0 &&
                newRs.status.readyReplicas >= newRep
              ) {
                rsReplicaOverride.set(oldRs.metadata.uid, oldRep - 1);
                dirty = true;
              }

              const finalNewRep = getRep(newRs.metadata.uid);
              const finalOldRep = oldRs ? getRep(oldRs.metadata.uid) : 0;
              const complete =
                finalNewRep >= desired &&
                finalOldRep <= 0 &&
                newRs.status.readyReplicas >= desired;

              next = {
                ...d,
                activeReplicaSetId: complete
                  ? newRs.metadata.uid
                  : d.activeReplicaSetId,
                rollout: complete
                  ? undefined
                  : { ...d.rollout, lastStepAt: now },
              };
              dirty = true;
              if (complete) {
                events.push({
                  type: "Normal",
                  reason: "RollingUpdate",
                  message: `Deployment ${d.metadata.name}: rollout complete (revision ${newRs.revision}).`,
                  involvedObject: { kind: "Deployment", name: d.metadata.name },
                });
              }
            }
          }

          // Sync deployment status from its ReplicaSets.
          const ownRs = replicaSets.filter((r) =>
            r.metadata.ownerReferences?.some((o) => o.uid === d.metadata.uid),
          );
          const totalReplicas = ownRs.reduce(
            (sum, r) => sum + r.status.replicas,
            0,
          );
          const activeRs = rsByUid.get(next.activeReplicaSetId);
          const ready = activeRs?.status.readyReplicas ?? 0;
          if (
            next.status.replicas !== totalReplicas ||
            next.status.readyReplicas !== ready
          ) {
            dirty = true;
            next = {
              ...next,
              status: { replicas: totalReplicas, readyReplicas: ready },
            };
          }
          return next;
        });

        // Apply rollout replica overrides immutably.
        const replicaSetsFinal = replicaSets.map((r) =>
          rsReplicaOverride.has(r.metadata.uid)
            ? {
                ...r,
                spec: {
                  ...r.spec,
                  replicas: rsReplicaOverride.get(r.metadata.uid) as number,
                },
              }
            : r,
        );

        /* --- 4) Node usage recompute --- */
        const nodePodCount = new Map<string, number>();
        const nodePodIds = new Map<string, string[]>();
        for (const p of pods) {
          if (p.spec.nodeName && NODE_PHASES.has(p.status.phase)) {
            nodePodCount.set(
              p.spec.nodeName,
              (nodePodCount.get(p.spec.nodeName) ?? 0) + 1,
            );
            const arr = nodePodIds.get(p.spec.nodeName) ?? [];
            arr.push(p.metadata.uid);
            nodePodIds.set(p.spec.nodeName, arr);
          }
        }
        const nodes = state.nodes.map((n) => {
          const count = nodePodCount.get(n.name) ?? 0;
          const cpuUsed = Math.min(
            n.cpuCapacity,
            Math.round(count * POD_CPU * 100) / 100,
          );
          const memUsed = Math.min(
            n.memCapacity,
            Math.round(count * POD_MEM * 100) / 100,
          );
          const podIds = nodePodIds.get(n.name) ?? [];
          if (
            n.cpuUsed !== cpuUsed ||
            n.memUsed !== memUsed ||
            n.podIds.length !== podIds.length
          ) {
            dirty = true;
            return { ...n, cpuUsed, memUsed, podIds };
          }
          return n;
        });

        if (dirty) {
          set(
            { pods, replicaSets: replicaSetsFinal, deployments, nodes },
            false,
            "reconcile",
          );
          for (const e of events) get().pushEvent(e);
        }
      },

      toggleTerminal: () =>
        set(
          (state) => ({ ui: { ...state.ui, terminalOpen: !state.ui.terminalOpen } }),
          false,
          "toggleTerminal",
        ),

      toggleEvents: () =>
        set(
          (state) => ({ ui: { ...state.ui, eventsOpen: !state.ui.eventsOpen } }),
          false,
          "toggleEvents",
        ),

      toggleWorkloads: () =>
        set(
          (state) => ({
            ui: { ...state.ui, workloadsOpen: !state.ui.workloadsOpen },
          }),
          false,
          "toggleWorkloads",
        ),

      openDrawer: (selected) =>
        set(
          (state) => ({ ui: { ...state.ui, drawerOpen: true, selected } }),
          false,
          "openDrawer",
        ),

      closeDrawer: () =>
        set(
          (state) => ({ ui: { ...state.ui, drawerOpen: false, selected: null } }),
          false,
          "closeDrawer",
        ),

      resetCluster: () =>
        set(
          (state) => ({
            ...initialData(),
            namespace: "default",
            namespaces: [...DEFAULT_NAMESPACES],
            ui: {
              ...state.ui,
              drawerOpen: false,
              selected: null,
              selectorQuery: "",
            },
          }),
          false,
          "resetCluster",
        ),
    }),
    { name: "kubeSim/cluster" },
  ),
);
