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
  CronJob,
  DaemonSet,
  Deployment,
  EventType,
  HorizontalPodAutoscaler,
  HPATargetKind,
  Ingress,
  IngressRule,
  Job,
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
  StatefulSet,
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
  selectorMatches,
  uid,
} from "@/lib/workloads";
import { findBindablePV } from "@/lib/storage";
import { nextCronRun } from "@/lib/cron";
import { echoCommand } from "@/lib/echo";

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

export interface CreateStatefulSetInput {
  name?: string;
  image: string;
  replicas: number;
  storage?: number;
  storageClassName?: string;
}

export interface CreateDaemonSetInput {
  name?: string;
  image: string;
  nodeSelector?: Record<string, string>;
}

export interface CreateJobInput {
  name?: string;
  image: string;
  completions: number;
  parallelism: number;
  backoffLimit: number;
}

export interface CreateCronJobInput {
  name?: string;
  image: string;
  schedule: string;
  completions: number;
  parallelism: number;
  backoffLimit: number;
}

export interface CreateHPAInput {
  targetKind: HPATargetKind;
  targetName: string;
  targetUid: string;
  minReplicas: number;
  maxReplicas: number;
  targetCPUUtilizationPercentage: number;
}

export interface ClusterState {
  /* --- Simulated etcd --- */
  nodes: WorkerNode[];
  pods: Pod[];
  replicaSets: ReplicaSet[];
  deployments: Deployment[];
  statefulSets: StatefulSet[];
  daemonSets: DaemonSet[];
  jobs: Job[];
  cronJobs: CronJob[];
  hpas: HorizontalPodAutoscaler[];
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
  /** Simulated wall clock (ms) — drives CronJob scheduling. */
  simClock: number;
  /** Time-acceleration factor for the simulated clock (1 / 10 / 60). */
  timeScale: number;

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

  /* Advanced workloads */
  createStatefulSet: (input: CreateStatefulSetInput) => void;
  scaleStatefulSet: (id: string, replicas: number) => void;
  deleteStatefulSet: (id: string) => void;
  createDaemonSet: (input: CreateDaemonSetInput) => void;
  deleteDaemonSet: (id: string) => void;
  createJob: (input: CreateJobInput) => void;
  forceFailJob: (id: string) => void;
  deleteJob: (id: string) => void;
  createCronJob: (input: CreateCronJobInput) => void;
  deleteCronJob: (id: string) => void;
  createHPA: (input: CreateHPAInput) => void;
  setHpaLoad: (id: string, load: number) => void;
  deleteHPA: (id: string) => void;
  setTimeScale: (scale: number) => void;

  /** Generic label/annotation patch used by CLI `label`/`annotate`. */
  applyMetaPatch: (
    kind: string,
    id: string,
    labels?: Record<string, string>,
    annotations?: Record<string, string>,
  ) => void;

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
  | "statefulSets"
  | "daemonSets"
  | "jobs"
  | "cronJobs"
  | "hpas"
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
  statefulSets: [],
  daemonSets: [],
  jobs: [],
  cronJobs: [],
  hpas: [],
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
/** Real timestamp of the previous reconcile tick (for sim-clock delta). */
let lastReconcileWall = Date.now();

/* Reconcile timing (ms) — tuned so lifecycle transitions read clearly. */
const SCHEDULE_DELAY = 700;
const CREATE_DELAY = 700;
const TERM_DELAY = 500;
const CRASH_DELAY = 900;
const ROLLOUT_STEP = 1000;
const HPA_COOLDOWN = 1500;

const ACTIVE_PHASES = new Set(["Pending", "ContainerCreating", "Running"]);
const NODE_PHASES = new Set(["ContainerCreating", "Running"]);

function ownedByRs(pod: Pod, rsUid: string): boolean {
  return !!pod.metadata.ownerReferences?.some((o) => o.uid === rsUid);
}

function ownedByUid(pod: Pod, ownerUid: string): boolean {
  return !!pod.metadata.ownerReferences?.some((o) => o.uid === ownerUid);
}

export const useClusterStore = create<ClusterState>()(
  devtools(
    (set, get) => ({
      ...initialData(),
      namespace: "default",
      namespaces: [...DEFAULT_NAMESPACES],
      simClock: Date.now(),
      timeScale: 1,
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
        echoCommand(`kubectl run ${name} --image=${input.image}`);
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
        echoCommand(`kubectl delete pod ${pod.metadata.name}`);
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
        echoCommand(`kubectl scale rs ${rs.metadata.name} --replicas=${next}`);
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
        echoCommand(
          `kubectl create deployment ${name} --image=${input.image} --replicas=${deployment.spec.replicas}`,
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
        echoCommand(
          `kubectl scale deployment ${d.metadata.name} --replicas=${next}`,
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
        echoCommand(
          `kubectl set image deployment/${d.metadata.name} ${d.spec.template.containers[0]?.name}=${image.trim()}`,
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
        echoCommand(`kubectl rollout undo deployment/${d.metadata.name}`);
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
        echoCommand(`kubectl delete deployment ${d.metadata.name}`);
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

      /* ---------------- Advanced workloads ---------------- */

      setTimeScale: (scale) =>
        set({ timeScale: scale }, false, "setTimeScale"),

      applyMetaPatch: (kind, id, labels, annotations) => {
        const mergeMeta = <T extends { metadata: import("./types").ObjectMeta }>(
          arr: T[],
        ): T[] =>
          arr.map((o) =>
            o.metadata.uid === id
              ? {
                  ...o,
                  metadata: {
                    ...o.metadata,
                    labels: labels
                      ? { ...o.metadata.labels, ...labels }
                      : o.metadata.labels,
                    annotations: annotations
                      ? { ...o.metadata.annotations, ...annotations }
                      : o.metadata.annotations,
                  },
                }
              : o,
          );

        set(
          (s) => {
            switch (kind) {
              case "Node":
                return {
                  nodes: s.nodes.map((n) =>
                    n.id === id && labels
                      ? { ...n, labels: { ...n.labels, ...labels } }
                      : n,
                  ),
                };
              case "Pod":
                return { pods: mergeMeta(s.pods) };
              case "ReplicaSet":
                return { replicaSets: mergeMeta(s.replicaSets) };
              case "Deployment":
                return { deployments: mergeMeta(s.deployments) };
              case "StatefulSet":
                return { statefulSets: mergeMeta(s.statefulSets) };
              case "DaemonSet":
                return { daemonSets: mergeMeta(s.daemonSets) };
              case "Job":
                return { jobs: mergeMeta(s.jobs) };
              case "CronJob":
                return { cronJobs: mergeMeta(s.cronJobs) };
              case "HorizontalPodAutoscaler":
                return { hpas: mergeMeta(s.hpas) };
              case "Service":
                return { services: mergeMeta(s.services) };
              case "Ingress":
                return { ingresses: mergeMeta(s.ingresses) };
              case "NetworkPolicy":
                return { networkPolicies: mergeMeta(s.networkPolicies) };
              case "ConfigMap":
                return { configMaps: mergeMeta(s.configMaps) };
              case "Secret":
                return { secrets: mergeMeta(s.secrets) };
              case "PersistentVolume":
                return { persistentVolumes: mergeMeta(s.persistentVolumes) };
              case "PersistentVolumeClaim":
                return {
                  persistentVolumeClaims: mergeMeta(s.persistentVolumeClaims),
                };
              default:
                return {};
            }
          },
          false,
          "applyMetaPatch",
        );
      },

      createStatefulSet: (input) => {
        const ns = get().namespace;
        const name = input.name?.trim() || `sts-${randomSuffix()}`;
        const selector = { app: name };
        const ss: StatefulSet = {
          metadata: {
            name,
            namespace: ns,
            uid: uid("sts"),
            labels: selector,
            creationTimestamp: new Date().toISOString(),
          },
          spec: {
            serviceName: name,
            replicas: Math.max(0, input.replicas),
            selector,
            template: {
              labels: selector,
              containers: [containerFromImage(input.image)],
            },
            volumeClaimTemplate: input.storage
              ? {
                  name: "data",
                  storage: input.storage,
                  storageClassName: input.storageClassName,
                }
              : undefined,
          },
          status: { replicas: 0, readyReplicas: 0 },
          image: input.image,
          color: nextColor(),
          createdAt: Date.now(),
        };
        set((s) => ({ statefulSets: [...s.statefulSets, ss] }), false, "createStatefulSet");
        get().pushEvent({
          type: "Normal",
          reason: "SuccessfulCreate",
          message: `Created StatefulSet ${name} (replicas: ${ss.spec.replicas}).`,
          involvedObject: { kind: "StatefulSet", name },
        });
      },

      scaleStatefulSet: (id, replicas) => {
        const ss = get().statefulSets.find((x) => x.metadata.uid === id);
        if (!ss) return;
        const next = Math.max(0, Math.round(replicas));
        if (next === ss.spec.replicas) return;
        set(
          (s) => ({
            statefulSets: s.statefulSets.map((x) =>
              x.metadata.uid === id
                ? { ...x, spec: { ...x.spec, replicas: next } }
                : x,
            ),
          }),
          false,
          "scaleStatefulSet",
        );
        echoCommand(
          `kubectl scale statefulset ${ss.metadata.name} --replicas=${next}`,
        );
        get().pushEvent({
          type: "Normal",
          reason: "ScalingStatefulSet",
          message: `Scaled StatefulSet ${ss.metadata.name} to ${next} replicas.`,
          involvedObject: { kind: "StatefulSet", name: ss.metadata.name },
        });
      },

      deleteStatefulSet: (id) => {
        const ss = get().statefulSets.find((x) => x.metadata.uid === id);
        if (!ss) return;
        set(
          (s) => ({
            statefulSets: s.statefulSets.filter((x) => x.metadata.uid !== id),
            pods: s.pods.map((p) =>
              ownedByUid(p, id)
                ? { ...p, status: { ...p.status, phase: "Terminating" }, phaseSince: Date.now() }
                : p,
            ),
            hpas: s.hpas.filter((h) => h.spec.scaleTargetRef.uid !== id),
          }),
          false,
          "deleteStatefulSet",
        );
        get().pushEvent({
          type: "Normal",
          reason: "SuccessfulDelete",
          message: `Deleted StatefulSet ${ss.metadata.name} (PVCs retained).`,
          involvedObject: { kind: "StatefulSet", name: ss.metadata.name },
        });
      },

      createDaemonSet: (input) => {
        const ns = get().namespace;
        const name = input.name?.trim() || `ds-${randomSuffix()}`;
        const selector = { app: name };
        const ds: DaemonSet = {
          metadata: {
            name,
            namespace: ns,
            uid: uid("ds"),
            labels: selector,
            creationTimestamp: new Date().toISOString(),
          },
          spec: {
            selector,
            template: {
              labels: selector,
              containers: [containerFromImage(input.image)],
            },
            nodeSelector: input.nodeSelector,
          },
          status: { desiredNumberScheduled: 0, numberReady: 0 },
          image: input.image,
          color: nextColor(),
          createdAt: Date.now(),
        };
        set((s) => ({ daemonSets: [...s.daemonSets, ds] }), false, "createDaemonSet");
        get().pushEvent({
          type: "Normal",
          reason: "SuccessfulCreate",
          message: `Created DaemonSet ${name} (one pod per eligible node).`,
          involvedObject: { kind: "DaemonSet", name },
        });
      },

      deleteDaemonSet: (id) => {
        const ds = get().daemonSets.find((x) => x.metadata.uid === id);
        if (!ds) return;
        set(
          (s) => ({
            daemonSets: s.daemonSets.filter((x) => x.metadata.uid !== id),
            pods: s.pods.map((p) =>
              ownedByUid(p, id)
                ? { ...p, status: { ...p.status, phase: "Terminating" }, phaseSince: Date.now() }
                : p,
            ),
          }),
          false,
          "deleteDaemonSet",
        );
        get().pushEvent({
          type: "Normal",
          reason: "SuccessfulDelete",
          message: `Deleted DaemonSet ${ds.metadata.name}.`,
          involvedObject: { kind: "DaemonSet", name: ds.metadata.name },
        });
      },

      createJob: (input) => {
        const ns = get().namespace;
        const name = input.name?.trim() || `job-${randomSuffix()}`;
        const job: Job = {
          metadata: {
            name,
            namespace: ns,
            uid: uid("job"),
            labels: { "job-name": name },
            creationTimestamp: new Date().toISOString(),
          },
          spec: {
            completions: Math.max(1, input.completions),
            parallelism: Math.max(1, input.parallelism),
            backoffLimit: Math.max(0, input.backoffLimit),
            image: input.image,
            labels: { "job-name": name },
          },
          status: { succeeded: 0, failed: 0, active: 0, phase: "Running" },
          color: nextColor(),
          createdAt: Date.now(),
        };
        set((s) => ({ jobs: [...s.jobs, job] }), false, "createJob");
        get().pushEvent({
          type: "Normal",
          reason: "SuccessfulCreate",
          message: `Created Job ${name} (completions: ${job.spec.completions}).`,
          involvedObject: { kind: "Job", name },
        });
      },

      forceFailJob: (id) => {
        const job = get().jobs.find((x) => x.metadata.uid === id);
        if (!job) return;
        set(
          (s) => ({
            jobs: s.jobs.map((x) =>
              x.metadata.uid === id ? { ...x, forceFail: !x.forceFail } : x,
            ),
          }),
          false,
          "forceFailJob",
        );
        get().pushEvent({
          type: "Warning",
          reason: "JobFailureMode",
          message: `Job ${job.metadata.name}: ${job.forceFail ? "cleared" : "enabled"} forced-failure mode.`,
          involvedObject: { kind: "Job", name: job.metadata.name },
        });
      },

      deleteJob: (id) => {
        const job = get().jobs.find((x) => x.metadata.uid === id);
        if (!job) return;
        set(
          (s) => ({
            jobs: s.jobs.filter((x) => x.metadata.uid !== id),
            pods: s.pods.map((p) =>
              ownedByUid(p, id)
                ? { ...p, status: { ...p.status, phase: "Terminating" }, phaseSince: Date.now() }
                : p,
            ),
          }),
          false,
          "deleteJob",
        );
        get().pushEvent({
          type: "Normal",
          reason: "SuccessfulDelete",
          message: `Deleted Job ${job.metadata.name}.`,
          involvedObject: { kind: "Job", name: job.metadata.name },
        });
      },

      createCronJob: (input) => {
        const ns = get().namespace;
        const name = input.name?.trim() || `cronjob-${randomSuffix()}`;
        const cj: CronJob = {
          metadata: {
            name,
            namespace: ns,
            uid: uid("cronjob"),
            labels: {},
            creationTimestamp: new Date().toISOString(),
          },
          spec: {
            schedule: input.schedule.trim() || "*/1 * * * *",
            completions: Math.max(1, input.completions),
            parallelism: Math.max(1, input.parallelism),
            backoffLimit: Math.max(0, input.backoffLimit),
            image: input.image,
          },
          status: {},
          nextRunAt: nextCronRun(input.schedule || "*/1 * * * *", get().simClock),
          history: [],
          color: nextColor(),
          createdAt: Date.now(),
        };
        set((s) => ({ cronJobs: [...s.cronJobs, cj] }), false, "createCronJob");
        get().pushEvent({
          type: "Normal",
          reason: "SuccessfulCreate",
          message: `Created CronJob ${name} (schedule: ${cj.spec.schedule}).`,
          involvedObject: { kind: "CronJob", name },
        });
      },

      deleteCronJob: (id) => {
        const cj = get().cronJobs.find((x) => x.metadata.uid === id);
        if (!cj) return;
        const jobIds = new Set(
          get()
            .jobs.filter((j) =>
              j.metadata.ownerReferences?.some((o) => o.uid === id),
            )
            .map((j) => j.metadata.uid),
        );
        set(
          (s) => ({
            cronJobs: s.cronJobs.filter((x) => x.metadata.uid !== id),
            jobs: s.jobs.filter((j) => !jobIds.has(j.metadata.uid)),
            pods: s.pods.map((p) =>
              p.metadata.ownerReferences?.some((o) => jobIds.has(o.uid))
                ? { ...p, status: { ...p.status, phase: "Terminating" }, phaseSince: Date.now() }
                : p,
            ),
          }),
          false,
          "deleteCronJob",
        );
        get().pushEvent({
          type: "Normal",
          reason: "SuccessfulDelete",
          message: `Deleted CronJob ${cj.metadata.name}.`,
          involvedObject: { kind: "CronJob", name: cj.metadata.name },
        });
      },

      createHPA: (input) => {
        const ns = get().namespace;
        const name = `hpa-${input.targetName}`;
        if (
          get().hpas.some((h) => h.spec.scaleTargetRef.uid === input.targetUid)
        )
          return;
        const hpa: HorizontalPodAutoscaler = {
          metadata: {
            name,
            namespace: ns,
            uid: uid("hpa"),
            labels: {},
            creationTimestamp: new Date().toISOString(),
          },
          spec: {
            scaleTargetRef: {
              kind: input.targetKind,
              name: input.targetName,
              uid: input.targetUid,
            },
            minReplicas: Math.max(1, input.minReplicas),
            maxReplicas: Math.max(input.minReplicas, input.maxReplicas),
            targetCPUUtilizationPercentage: input.targetCPUUtilizationPercentage,
          },
          status: { currentReplicas: 0, currentCPUUtilizationPercentage: 0 },
          load: 20,
          lastScaleAt: 0,
          createdAt: Date.now(),
        };
        set((s) => ({ hpas: [...s.hpas, hpa] }), false, "createHPA");
        echoCommand(
          `kubectl autoscale ${input.targetKind.toLowerCase()} ${input.targetName} --min=${input.minReplicas} --max=${input.maxReplicas} --cpu-percent=${input.targetCPUUtilizationPercentage}`,
        );
        get().pushEvent({
          type: "Normal",
          reason: "SuccessfulCreate",
          message: `Created HPA for ${input.targetKind}/${input.targetName} (target CPU ${input.targetCPUUtilizationPercentage}%).`,
          involvedObject: { kind: "HorizontalPodAutoscaler", name },
        });
      },

      setHpaLoad: (id, load) =>
        set(
          (s) => ({
            hpas: s.hpas.map((h) =>
              h.metadata.uid === id
                ? { ...h, load: Math.max(0, Math.min(100, Math.round(load))) }
                : h,
            ),
          }),
          false,
          "setHpaLoad",
        ),

      deleteHPA: (id) => {
        const hpa = get().hpas.find((x) => x.metadata.uid === id);
        if (!hpa) return;
        set(
          (s) => ({ hpas: s.hpas.filter((x) => x.metadata.uid !== id) }),
          false,
          "deleteHPA",
        );
        get().pushEvent({
          type: "Normal",
          reason: "SuccessfulDelete",
          message: `Deleted HPA ${hpa.metadata.name}.`,
          involvedObject: { kind: "HorizontalPodAutoscaler", name: hpa.metadata.name },
        });
      },

      reconcile: () => {
        const state = get();
        const now = Date.now();
        const events: Parameters<ClusterState["pushEvent"]>[0][] = [];
        let dirty = false;

        /* --- Simulated clock advance (drives CronJobs) --- */
        const realDelta = Math.min(2000, now - lastReconcileWall);
        lastReconcileWall = now;
        const simClock = state.simClock + realDelta * state.timeScale;
        if (state.timeScale !== 1 || state.cronJobs.length > 0) dirty = true;

        // Working copies for controllers that touch storage.
        let pvcs = state.persistentVolumeClaims.slice();
        let pvs = state.persistentVolumes.slice();

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

        /* --- StatefulSet / DaemonSet / Job / CronJob controllers --- */

        /** Ensure a StatefulSet ordinal's dedicated PVC exists (stable identity). */
        const ensurePVC = (
          pvcName: string,
          ns: string,
          storage: number,
          sc: string | undefined,
        ) => {
          if (
            pvcs.some(
              (c) => c.metadata.name === pvcName && c.metadata.namespace === ns,
            )
          )
            return;
          const claimUid = uid("pvc");
          let pv: PersistentVolume | undefined = pvs.find(
            (p) =>
              p.status.phase === "Available" &&
              p.spec.capacity >= storage &&
              (!sc || p.spec.storageClassName === sc),
          );
          let provisioned = false;
          if (!pv) {
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
                capacity: storage,
                accessModes: ["ReadWriteOnce"],
                storageClassName: sc,
              },
              status: { phase: "Available" },
              dynamic: true,
              createdAt: now,
            };
          }
          const boundPV: PersistentVolume = {
            ...pv,
            status: {
              phase: "Bound",
              boundClaim: { name: pvcName, uid: claimUid },
            },
          };
          const claim: PersistentVolumeClaim = {
            metadata: {
              name: pvcName,
              namespace: ns,
              uid: claimUid,
              labels: {},
              creationTimestamp: new Date(now).toISOString(),
            },
            spec: {
              storage,
              accessModes: ["ReadWriteOnce"],
              storageClassName: sc,
            },
            status: { phase: "Bound", volumeName: boundPV.metadata.name },
            boundPVUid: boundPV.metadata.uid,
            createdAt: now,
          };
          pvcs = [...pvcs, claim];
          pvs = provisioned
            ? [...pvs, boundPV]
            : pvs.map((p) =>
                p.metadata.uid === boundPV.metadata.uid ? boundPV : p,
              );
          dirty = true;
          events.push({
            type: "Normal",
            reason: "Provisioning",
            message: `PVC ${pvcName} bound to PV ${boundPV.metadata.name} (${storage}Gi).`,
            involvedObject: { kind: "PersistentVolumeClaim", name: pvcName },
          });
        };

        // StatefulSet: ordered create (0→N) / reverse delete, stable PVCs.
        const statefulSets: StatefulSet[] = state.statefulSets.map((ss) => {
          const owned = pods.filter((p) => ownedByUid(p, ss.metadata.uid));
          const activeOwned = owned.filter((p) =>
            ACTIVE_PHASES.has(p.status.phase),
          );
          const byOrdinal = new Map(
            activeOwned.map((p) => [p.spec.ordinal ?? 0, p]),
          );
          const desired = ss.spec.replicas;
          let mutated = false;

          // Scale up: fill the lowest missing ordinal, but only once all lower
          // ordinals are Running (strict ordering).
          for (let i = 0; i < desired; i++) {
            if (!byOrdinal.has(i)) {
              const lowerReady = Array.from({ length: i }).every((_, j) =>
                activeOwned.some(
                  (p) => p.spec.ordinal === j && p.status.phase === "Running",
                ),
              );
              if (i === 0 || lowerReady) {
                const podName = `${ss.metadata.name}-${i}`;
                const refs: string[] = [];
                const vct = ss.spec.volumeClaimTemplate;
                if (vct) {
                  const pvcName = `${vct.name}-${ss.metadata.name}-${i}`;
                  refs.push(pvcName);
                  ensurePVC(
                    pvcName,
                    ss.metadata.namespace,
                    vct.storage,
                    vct.storageClassName,
                  );
                }
                pods.push(
                  makePod({
                    name: podName,
                    namespace: ss.metadata.namespace,
                    labels: ss.spec.template.labels,
                    containers: ss.spec.template.containers,
                    owner: {
                      kind: "StatefulSet",
                      name: ss.metadata.name,
                      uid: ss.metadata.uid,
                    },
                    ownerColor: ss.color,
                    ordinal: i,
                    pvcs: refs,
                  }),
                );
                mutated = true;
                dirty = true;
                events.push({
                  type: "Normal",
                  reason: "SuccessfulCreate",
                  message: `StatefulSet ${ss.metadata.name}: created pod ${podName} in order.`,
                  involvedObject: { kind: "StatefulSet", name: ss.metadata.name },
                });
              }
              break; // one ordinal per tick
            }
          }

          // Scale down: remove the highest ordinal ≥ desired (reverse order).
          if (!mutated) {
            const overflow = activeOwned
              .filter((p) => (p.spec.ordinal ?? 0) >= desired)
              .sort((a, b) => (b.spec.ordinal ?? 0) - (a.spec.ordinal ?? 0));
            if (overflow.length > 0) {
              const victim = overflow[0];
              pods = pods.map((p) =>
                p.metadata.uid === victim.metadata.uid
                  ? { ...p, status: { ...p.status, phase: "Terminating" }, phaseSince: now }
                  : p,
              );
              dirty = true;
              events.push({
                type: "Normal",
                reason: "SuccessfulDelete",
                message: `StatefulSet ${ss.metadata.name}: removed ${victim.metadata.name} (reverse order).`,
                involvedObject: { kind: "StatefulSet", name: ss.metadata.name },
              });
            }
          }

          const nowActive = pods.filter(
            (p) =>
              ownedByUid(p, ss.metadata.uid) && ACTIVE_PHASES.has(p.status.phase),
          );
          const running = nowActive.filter(
            (p) => p.status.phase === "Running",
          ).length;
          if (
            ss.status.replicas !== nowActive.length ||
            ss.status.readyReplicas !== running
          ) {
            dirty = true;
            return {
              ...ss,
              status: { replicas: nowActive.length, readyReplicas: running },
            };
          }
          return ss;
        });

        // DaemonSet: one pod per eligible node (auto add/remove).
        const daemonSets: DaemonSet[] = state.daemonSets.map((ds) => {
          const eligible = eligibleNodes.filter(
            (n) =>
              !ds.spec.nodeSelector ||
              selectorMatches(n.labels, ds.spec.nodeSelector),
          );
          const eligibleNames = new Set(eligible.map((n) => n.name));
          const owned = pods.filter((p) => ownedByUid(p, ds.metadata.uid));
          const nodesWithPod = new Set(
            owned
              .filter((p) => p.status.phase !== "Terminating" && p.spec.nodeName)
              .map((p) => p.spec.nodeName),
          );

          for (const node of eligible) {
            if (!nodesWithPod.has(node.name)) {
              const podName = `${ds.metadata.name}-${randomSuffix()}`;
              const pod = makePod({
                name: podName,
                namespace: ds.metadata.namespace,
                labels: ds.spec.template.labels,
                containers: ds.spec.template.containers,
                owner: {
                  kind: "DaemonSet",
                  name: ds.metadata.name,
                  uid: ds.metadata.uid,
                },
                ownerColor: ds.color,
              });
              // DaemonSet pods bypass the scheduler → placed on their node.
              pod.spec.nodeName = node.name;
              pod.status.phase = "ContainerCreating";
              pod.status.podIP = allocatePodIP();
              pod.phaseSince = now;
              pods.push(pod);
              dirty = true;
              events.push({
                type: "Normal",
                reason: "SuccessfulCreate",
                message: `DaemonSet ${ds.metadata.name}: pod scheduled onto ${node.name}.`,
                involvedObject: { kind: "DaemonSet", name: ds.metadata.name },
              });
            }
          }

          // Clean up pods on nodes that are gone / no longer eligible.
          for (const p of owned) {
            if (
              p.spec.nodeName &&
              !eligibleNames.has(p.spec.nodeName) &&
              p.status.phase !== "Terminating"
            ) {
              pods = pods.map((x) =>
                x.metadata.uid === p.metadata.uid
                  ? { ...x, status: { ...x.status, phase: "Terminating" }, phaseSince: now }
                  : x,
              );
              dirty = true;
            }
          }

          const active = pods.filter(
            (p) =>
              ownedByUid(p, ds.metadata.uid) && ACTIVE_PHASES.has(p.status.phase),
          );
          const ready = active.filter(
            (p) => p.status.phase === "Running",
          ).length;
          if (
            ds.status.desiredNumberScheduled !== eligible.length ||
            ds.status.numberReady !== ready
          ) {
            dirty = true;
            return {
              ...ds,
              status: {
                desiredNumberScheduled: eligible.length,
                numberReady: ready,
              },
            };
          }
          return ds;
        });

        // Job: run pods to completion with parallelism + backoff retries.
        const jobs: Job[] = state.jobs.map((job) => {
          if (job.status.phase !== "Running") return job;
          let succeeded = job.status.succeeded;
          let failed = job.status.failed;

          for (const p of pods.filter((x) =>
            ownedByUid(x, job.metadata.uid),
          )) {
            if (p.status.phase === "Running") {
              if (!p.completeAt) {
                pods = pods.map((x) =>
                  x.metadata.uid === p.metadata.uid
                    ? { ...x, completeAt: now + 1500 + Math.random() * 2000 }
                    : x,
                );
              } else if (now >= p.completeAt) {
                pods = pods.filter((x) => x.metadata.uid !== p.metadata.uid);
                dirty = true;
                if (job.forceFail) {
                  failed += 1;
                  events.push({
                    type: "Warning",
                    reason: "BackoffLimitRetry",
                    message: `Job ${job.metadata.name}: pod failed (${failed}/${job.spec.backoffLimit + 1}).`,
                    involvedObject: { kind: "Job", name: job.metadata.name },
                  });
                } else {
                  succeeded += 1;
                  events.push({
                    type: "Normal",
                    reason: "Completed",
                    message: `Job ${job.metadata.name}: completion ${succeeded}/${job.spec.completions}.`,
                    involvedObject: { kind: "Job", name: job.metadata.name },
                  });
                }
              }
            }
          }

          let phase: "Running" | "Complete" | "Failed" = job.status.phase;
          if (succeeded >= job.spec.completions) phase = "Complete";
          else if (failed > job.spec.backoffLimit) phase = "Failed";

          if (phase === "Running") {
            const active = pods.filter(
              (p) =>
                ownedByUid(p, job.metadata.uid) &&
                ACTIVE_PHASES.has(p.status.phase),
            );
            const remaining = job.spec.completions - succeeded;
            const want =
              Math.min(job.spec.parallelism, remaining) - active.length;
            for (let i = 0; i < want; i++) {
              pods.push(
                makePod({
                  name: `${job.metadata.name}-${randomSuffix()}`,
                  namespace: job.metadata.namespace,
                  labels: job.spec.labels,
                  containers: [containerFromImage(job.spec.image)],
                  owner: {
                    kind: "Job",
                    name: job.metadata.name,
                    uid: job.metadata.uid,
                  },
                  ownerColor: job.color,
                }),
              );
              dirty = true;
            }
          }

          const active = pods.filter(
            (p) =>
              ownedByUid(p, job.metadata.uid) &&
              ACTIVE_PHASES.has(p.status.phase),
          ).length;

          if (
            phase !== job.status.phase ||
            succeeded !== job.status.succeeded ||
            failed !== job.status.failed ||
            active !== job.status.active
          ) {
            dirty = true;
            if (phase === "Complete") {
              events.push({
                type: "Normal",
                reason: "Completed",
                message: `Job ${job.metadata.name} completed successfully.`,
                involvedObject: { kind: "Job", name: job.metadata.name },
              });
            }
            if (phase === "Failed") {
              events.push({
                type: "Warning",
                reason: "BackoffLimitExceeded",
                message: `Job ${job.metadata.name} failed (backoffLimit ${job.spec.backoffLimit} exceeded).`,
                involvedObject: { kind: "Job", name: job.metadata.name },
              });
            }
            return { ...job, status: { succeeded, failed, active, phase } };
          }
          return job;
        });

        // CronJob: fire on the simulated clock, spawning Jobs.
        const newCronJobs: Job[] = [];
        const cronJobs: CronJob[] = state.cronJobs.map((cj) => {
          if (simClock >= cj.nextRunAt) {
            const jobName = `${cj.metadata.name}-${Math.floor(simClock / 1000) % 100000}`;
            newCronJobs.push({
              metadata: {
                name: jobName,
                namespace: cj.metadata.namespace,
                uid: uid("job"),
                labels: { "job-name": jobName },
                creationTimestamp: new Date().toISOString(),
                ownerReferences: [
                  {
                    kind: "CronJob",
                    name: cj.metadata.name,
                    uid: cj.metadata.uid,
                  },
                ],
              },
              spec: {
                completions: cj.spec.completions,
                parallelism: cj.spec.parallelism,
                backoffLimit: cj.spec.backoffLimit,
                image: cj.spec.image,
                labels: { "job-name": jobName },
              },
              status: { succeeded: 0, failed: 0, active: 0, phase: "Running" },
              color: cj.color,
              createdAt: now,
            });
            dirty = true;
            events.push({
              type: "Normal",
              reason: "SuccessfulCreate",
              message: `CronJob ${cj.metadata.name}: triggered Job ${jobName}.`,
              involvedObject: { kind: "CronJob", name: cj.metadata.name },
            });
            return {
              ...cj,
              status: { lastScheduleTime: simClock },
              nextRunAt: nextCronRun(cj.spec.schedule, simClock),
              history: [
                { jobName, time: simClock, result: "Created" as const },
                ...cj.history,
              ].slice(0, 10),
            };
          }
          return cj;
        });
        const jobsFinal = [...jobs, ...newCronJobs];

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

        /* --- HPA controller (load-driven autoscaling) --- */
        const dOverride = new Map<string, number>();
        const rsOverride2 = new Map<string, number>();
        const ssOverride = new Map<string, number>();
        const hpas: HorizontalPodAutoscaler[] = state.hpas.map((hpa) => {
          const ref = hpa.spec.scaleTargetRef;
          let currentReplicas = 0;
          if (ref.kind === "Deployment") {
            currentReplicas =
              deployments.find((x) => x.metadata.uid === ref.uid)?.spec
                .replicas ?? 0;
          } else if (ref.kind === "ReplicaSet") {
            currentReplicas =
              replicaSetsFinal.find((x) => x.metadata.uid === ref.uid)?.spec
                .replicas ?? 0;
          } else {
            currentReplicas =
              statefulSets.find((x) => x.metadata.uid === ref.uid)?.spec
                .replicas ?? 0;
          }

          const util = hpa.load;
          const target = hpa.spec.targetCPUUtilizationPercentage;
          let desired =
            currentReplicas > 0
              ? Math.ceil((currentReplicas * util) / target)
              : hpa.spec.minReplicas;
          desired = Math.max(
            hpa.spec.minReplicas,
            Math.min(hpa.spec.maxReplicas, desired),
          );

          let changed = false;
          if (desired !== currentReplicas && now - hpa.lastScaleAt > HPA_COOLDOWN) {
            changed = true;
            if (ref.kind === "Deployment") {
              dOverride.set(ref.uid, desired);
              const d = deployments.find((x) => x.metadata.uid === ref.uid);
              if (d) rsOverride2.set(d.activeReplicaSetId, desired);
            } else if (ref.kind === "ReplicaSet") {
              rsOverride2.set(ref.uid, desired);
            } else {
              ssOverride.set(ref.uid, desired);
            }
            dirty = true;
            events.push({
              type: "Normal",
              reason: "SuccessfulRescale",
              message: `HPA scaled ${ref.kind}/${ref.name} from ${currentReplicas} to ${desired} replicas: CPU ${util}% ${
                util > target ? ">" : "≤"
              } target ${target}%.`,
              involvedObject: {
                kind: "HorizontalPodAutoscaler",
                name: hpa.metadata.name,
              },
            });
          }

          const nextCurrent = changed ? desired : currentReplicas;
          if (
            hpa.status.currentReplicas !== nextCurrent ||
            hpa.status.currentCPUUtilizationPercentage !== util ||
            changed
          ) {
            dirty = true;
            return {
              ...hpa,
              status: {
                currentReplicas: nextCurrent,
                currentCPUUtilizationPercentage: util,
              },
              lastScaleAt: changed ? now : hpa.lastScaleAt,
            };
          }
          return hpa;
        });

        const deploymentsFinal = deployments.map((d) =>
          dOverride.has(d.metadata.uid)
            ? { ...d, spec: { ...d.spec, replicas: dOverride.get(d.metadata.uid) as number } }
            : d,
        );
        const replicaSetsFinal2 = replicaSetsFinal.map((r) =>
          rsOverride2.has(r.metadata.uid)
            ? { ...r, spec: { ...r.spec, replicas: rsOverride2.get(r.metadata.uid) as number } }
            : r,
        );
        const statefulSetsFinal = statefulSets.map((s) =>
          ssOverride.has(s.metadata.uid)
            ? { ...s, spec: { ...s.spec, replicas: ssOverride.get(s.metadata.uid) as number } }
            : s,
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
            {
              pods,
              replicaSets: replicaSetsFinal2,
              deployments: deploymentsFinal,
              statefulSets: statefulSetsFinal,
              daemonSets,
              jobs: jobsFinal,
              cronJobs,
              hpas,
              nodes,
              persistentVolumeClaims: pvcs,
              persistentVolumes: pvs,
              simClock,
            },
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
            simClock: Date.now(),
            timeScale: 1,
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
