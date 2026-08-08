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
  ClusterRole,
  ClusterRoleBinding,
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
  LimitRange,
  LimitRangeItem,
  Namespace,
  ObjectMeta,
  NetworkPolicy,
  PersistentVolume,
  PersistentVolumeClaim,
  Pod,
  PolicyRule,
  ReplicaSet,
  ResourceQuota,
  Role,
  RoleBinding,
  RoleRef,
  Secret,
  SecretType,
  Service,
  ServiceAccount,
  ServiceType,
  StatefulSet,
  Subject,
  Taint,
  Toleration,
  PodDisruptionBudget,
  PriorityClass,
  CustomResourceDefinition,
  CustomResource,
  CRDField,
  OperatorPreset,
  VolumeSnapshot,
  VerticalPodAutoscaler,
  ClusterContext,
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
import {
  computeQoS,
  findPreemption,
  podRequests,
  schedulePod,
} from "@/lib/scheduler";
import { databaseCRD, reconcileOperators } from "@/lib/operator";
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
  taints?: Taint[];
}

export interface PodRefs {
  configMaps?: string[];
  secrets?: string[];
  pvcs?: string[];
}

export interface PodScheduling {
  requests?: { cpu?: number; memory?: number };
  limits?: { cpu?: number; memory?: number };
  nodeSelector?: Record<string, string>;
  tolerations?: Toleration[];
  antiAffinityLabel?: string;
  topologyKey?: string;
  priorityClassName?: string;
}

export interface CreatePodInput {
  name?: string;
  image: string;
  labels?: Record<string, string>;
  refs?: PodRefs;
  scheduling?: PodScheduling;
}

export interface CreatePriorityClassInput {
  name?: string;
  value: number;
  globalDefault?: boolean;
  description?: string;
}

export interface CreatePodDisruptionBudgetInput {
  name?: string;
  selector: Record<string, string>;
  minAvailable: number;
}

export interface CreateCRDInput {
  group: string;
  version?: string;
  kind: string;
  plural?: string;
  singular?: string;
  shortNames?: string[];
  scope?: "Namespaced" | "Cluster";
  schema: CRDField[];
  operator?: OperatorPreset;
}

export interface CreateCustomResourceInput {
  crdId: string;
  name?: string;
  spec: Record<string, string | number | boolean>;
}

export interface CreateVPAInput {
  name?: string;
  targetKind: "Deployment" | "ReplicaSet" | "StatefulSet";
  targetName: string;
  mode?: "Auto" | "Off";
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
  reclaimPolicy?: "Retain" | "Delete" | "Recycle";
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

export interface CreateRoleInput {
  name?: string;
  cluster?: boolean; // true → ClusterRole
  rules: PolicyRule[];
}

export interface CreateRoleBindingInput {
  name?: string;
  cluster?: boolean; // true → ClusterRoleBinding
  subjects: Subject[];
  roleRef: RoleRef;
}

export interface CreateResourceQuotaInput {
  name?: string;
  hard: Record<string, number>;
}

export interface CreateLimitRangeInput {
  name?: string;
  limits: LimitRangeItem[];
}

/** Selected identity for the RBAC permission overlay. */
export interface RbacSubjectSelection {
  kind: Subject["kind"];
  name: string;
  namespace?: string;
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
  serviceAccounts: ServiceAccount[];
  roles: Role[];
  clusterRoles: ClusterRole[];
  roleBindings: RoleBinding[];
  clusterRoleBindings: ClusterRoleBinding[];
  resourceQuotas: ResourceQuota[];
  limitRanges: LimitRange[];
  priorityClasses: PriorityClass[];
  podDisruptionBudgets: PodDisruptionBudget[];
  crds: CustomResourceDefinition[];
  customResources: CustomResource[];
  volumeSnapshots: VolumeSnapshot[];
  vpas: VerticalPodAutoscaler[];
  events: ClusterEvent[];

  /* --- Global context --- */
  namespace: Namespace;
  namespaces: string[];
  /** Multi-cluster contexts (Phase 13). */
  clusters: ClusterContext[];
  activeClusterId: string;
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
    /** RBAC "inspect as" subject (permission overlay). */
    rbacSubject: RbacSubjectSelection | null;
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

  /* RBAC & admission (Phase 8) */
  createServiceAccount: (name: string) => void;
  deleteServiceAccount: (id: string) => void;
  createRole: (input: CreateRoleInput) => void;
  deleteRole: (id: string, cluster: boolean) => void;
  createRoleBinding: (input: CreateRoleBindingInput) => void;
  deleteRoleBinding: (id: string, cluster: boolean) => void;
  createResourceQuota: (input: CreateResourceQuotaInput) => void;
  deleteResourceQuota: (id: string) => void;
  createLimitRange: (input: CreateLimitRangeInput) => void;
  deleteLimitRange: (id: string) => void;
  createPriorityClass: (input: CreatePriorityClassInput) => void;
  deletePriorityClass: (id: string) => void;
  createPodDisruptionBudget: (input: CreatePodDisruptionBudgetInput) => void;
  deletePodDisruptionBudget: (id: string) => void;
  /** Toggle a pod's simulated liveness/readiness probe failure. */
  setPodProbe: (id: string, kind: "liveness" | "readiness", failing: boolean) => void;
  /* CRDs & Custom Resources (Phase 10) */
  createCRD: (input: CreateCRDInput) => void;
  deleteCRD: (id: string) => void;
  registerSampleOperator: () => void;
  createCustomResource: (input: CreateCustomResourceInput) => void;
  updateCustomResource: (id: string, spec: Record<string, string | number | boolean>) => void;
  deleteCustomResource: (id: string) => void;
  /** One operator reconcile tick (managed-children reconciliation). */
  operatorTick: () => void;
  /* Storage & autoscaling depth (Phase 12) */
  resizePVC: (id: string, storage: number) => void;
  createVolumeSnapshot: (pvcId: string) => void;
  restoreVolumeSnapshot: (snapshotId: string, name?: string) => void;
  deleteVolumeSnapshot: (id: string) => void;
  createVPA: (input: CreateVPAInput) => void;
  deleteVPA: (id: string) => void;
  /** VPA recommendation + volume-snapshot readiness tick. */
  autoscaleStorageTick: () => void;
  /* Control-plane realism & multi-cluster (Phase 13) */
  rolloutRestart: (deploymentId: string) => void;
  cordonNode: (id: string, unschedulable: boolean) => void;
  drainNode: (id: string) => void;
  setFinalizer: (kind: string, id: string, present: boolean) => void;
  createCluster: (name: string) => void;
  switchCluster: (id: string) => void;
  deleteCluster: (id: string) => void;
  /** Cascade GC: remove orphaned ReplicaSets and terminate orphaned pods. */
  garbageCollect: () => void;
  setRbacSubject: (subject: RbacSubjectSelection | null) => void;

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
  /** Serialize the whole simulated cluster for download. */
  exportSnapshot: () => Record<string, unknown>;
  /** Replace the whole cluster from a previously-exported snapshot. */
  importSnapshot: (data: Record<string, unknown>) => boolean;
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
  | "serviceAccounts"
  | "roles"
  | "clusterRoles"
  | "roleBindings"
  | "clusterRoleBindings"
  | "resourceQuotas"
  | "limitRanges"
  | "priorityClasses"
  | "podDisruptionBudgets"
  | "crds"
  | "customResources"
  | "volumeSnapshots"
  | "vpas"
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
  serviceAccounts: seedServiceAccounts([...DEFAULT_NAMESPACES]),
  roles: [],
  clusterRoles: [],
  roleBindings: [],
  clusterRoleBindings: [],
  resourceQuotas: [],
  limitRanges: [],
  priorityClasses: [],
  podDisruptionBudgets: [],
  crds: [],
  customResources: [],
  volumeSnapshots: [],
  vpas: [],
  events: [],
});

/** Every namespace has a `default` ServiceAccount at boot. */
function seedServiceAccounts(namespaces: string[]): ServiceAccount[] {
  return namespaces.map((ns) => ({
    metadata: {
      name: "default",
      namespace: ns,
      uid: uid("sa"),
      labels: {},
      creationTimestamp: new Date().toISOString(),
    },
    createdAt: Date.now(),
  }));
}

let eventCounter = 0;
let nodeCounter = 0;
/** Real timestamp of the previous reconcile tick (for sim-clock delta). */
let lastReconcileWall = Date.now();

/** Per-cluster serialized state for multi-cluster context switching (Phase 13). */
const clusterSnapshots = new Map<string, Record<string, unknown>>();

/* Reconcile timing (ms) — tuned so lifecycle transitions read clearly. */
const SCHEDULE_DELAY = 700;
const CREATE_DELAY = 700;
const TERM_DELAY = 500;
const CRASH_DELAY = 900;
const ROLLOUT_STEP = 1000;
const HPA_COOLDOWN = 1500;
/** How long a Running pod with a failing liveness probe waits before restart. */
const LIVENESS_PERIOD = 1600;

const ACTIVE_PHASES = new Set(["Pending", "ContainerCreating", "Running"]);
const NODE_PHASES = new Set(["ContainerCreating", "Running"]);

function ownedByRs(pod: Pod, rsUid: string): boolean {
  return !!pod.metadata.ownerReferences?.some((o) => o.uid === rsUid);
}

function ownedByUid(pod: Pod, ownerUid: string): boolean {
  return !!pod.metadata.ownerReferences?.some((o) => o.uid === ownerUid);
}

/** Count existing objects of a resource type in a namespace (for ResourceQuota). */
function countInNamespace(
  state: ClusterState,
  resource: string,
  ns: string,
): number {
  const lists: Record<string, { metadata: { namespace: string } }[]> = {
    pods: state.pods,
    services: state.services,
    configmaps: state.configMaps,
    secrets: state.secrets,
    deployments: state.deployments,
    persistentvolumeclaims: state.persistentVolumeClaims,
  };
  const arr = lists[resource];
  return arr ? arr.filter((o) => o.metadata.namespace === ns).length : 0;
}

/** Returns an admission-denied message if creating `resource` would exceed a quota. */
function quotaDenial(
  state: ClusterState,
  resource: string,
  ns: string,
): string | null {
  for (const q of state.resourceQuotas) {
    if (q.metadata.namespace !== ns) continue;
    const hard = q.spec.hard[resource];
    if (hard === undefined) continue;
    const used = countInNamespace(state, resource, ns);
    if (used + 1 > hard) {
      return `exceeded quota: ${q.metadata.name}, requested: ${resource}=1, used: ${resource}=${used}, limited: ${resource}=${hard}`;
    }
  }
  return null;
}

/** Mutates a pod in place with Phase 9 scheduling controls. */
function applyScheduling(
  pod: Pod,
  sched: PodScheduling | undefined,
  priorityClasses: PriorityClass[],
): void {
  if (!sched) return;
  if (sched.requests || sched.limits) {
    pod.spec.containers = pod.spec.containers.map((c) => ({
      ...c,
      requests: sched.requests ?? c.requests,
      limits: sched.limits ?? c.limits,
    }));
  }
  if (sched.nodeSelector && Object.keys(sched.nodeSelector).length > 0)
    pod.spec.nodeSelector = sched.nodeSelector;
  if (sched.tolerations?.length) pod.spec.tolerations = sched.tolerations;
  if (sched.antiAffinityLabel)
    pod.spec.antiAffinityLabel = sched.antiAffinityLabel;
  if (sched.topologyKey) pod.spec.topologyKey = sched.topologyKey;
  if (sched.priorityClassName) {
    pod.spec.priorityClassName = sched.priorityClassName;
    const pc = priorityClasses.find(
      (p) => p.metadata.name === sched.priorityClassName,
    );
    if (pc) pod.spec.priority = pc.value;
  }
}

export const useClusterStore = create<ClusterState>()(
  devtools(
    (set, get) => ({
      ...initialData(),
      namespace: "default",
      namespaces: [...DEFAULT_NAMESPACES],
      clusters: [{ id: "cluster-default", name: "kubesim" }],
      activeClusterId: "cluster-default",
      simClock: Date.now(),
      timeScale: 1,
      ui: {
        terminalOpen: true,
        eventsOpen: false,
        workloadsOpen: true,
        drawerOpen: false,
        selected: null,
        selectorQuery: "",
        rbacSubject: null,
      },

      setNamespace: (ns) => set({ namespace: ns }, false, "setNamespace"),

      createNamespace: (name) => {
        const trimmed = name.trim();
        if (!trimmed || get().namespaces.includes(trimmed)) return;
        set(
          (state) => ({
            namespaces: [...state.namespaces, trimmed],
            serviceAccounts: [
              ...state.serviceAccounts,
              {
                metadata: {
                  name: "default",
                  namespace: trimmed,
                  uid: uid("sa"),
                  labels: {},
                  creationTimestamp: new Date().toISOString(),
                },
                createdAt: Date.now(),
              },
            ],
          }),
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

      setRbacSubject: (subject) =>
        set(
          (state) => ({ ui: { ...state.ui, rbacSubject: subject } }),
          false,
          "setRbacSubject",
        ),

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
          taints: input.taints ?? [],
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
        const denied = quotaDenial(get(), "pods", ns);
        if (denied) {
          get().pushEvent({
            type: "Warning",
            reason: "FailedCreate",
            message: `Error creating pod: ${denied}`,
            involvedObject: { kind: "Pod", name },
          });
          return;
        }
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
        applyScheduling(pod, input.scheduling, get().priorityClasses);
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
        // Finalizers block deletion: mark Terminating with a deletionTimestamp
        // but do not remove until the finalizer is cleared (Phase 13).
        const now = Date.now();
        set(
          (s) => ({
            pods: s.pods.map((p) =>
              p.metadata.uid === id
                ? {
                    ...p,
                    metadata: p.metadata.finalizers?.length
                      ? { ...p.metadata, deletionTimestamp: new Date(now).toISOString() }
                      : p.metadata,
                    status: { ...p.status, phase: "Terminating" },
                    phaseSince: now,
                  }
                : p,
            ),
          }),
          false,
          "deletePod",
        );
        echoCommand(`kubectl delete pod ${pod.metadata.name}`);
        get().pushEvent({
          type: "Normal",
          reason: pod.metadata.finalizers?.length ? "FinalizerBlocked" : "Killing",
          message: pod.metadata.finalizers?.length
            ? `Deleting pod ${pod.metadata.name} — blocked by finalizer (Terminating until cleared).`
            : `Deleting pod ${pod.metadata.name}.`,
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
        const denied = quotaDenial(get(), "deployments", ns);
        if (denied) {
          get().pushEvent({
            type: "Warning",
            reason: "FailedCreate",
            message: `Error creating deployment: ${denied}`,
            involvedObject: { kind: "Deployment", name },
          });
          return;
        }
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
        const denied = quotaDenial(get(), "services", ns);
        if (denied) {
          get().pushEvent({
            type: "Warning",
            reason: "FailedCreate",
            message: `Error creating service: ${denied}`,
            involvedObject: { kind: "Service", name },
          });
          return;
        }
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
        const denied = quotaDenial(get(), "configmaps", ns);
        if (denied) {
          get().pushEvent({
            type: "Warning",
            reason: "FailedCreate",
            message: `Error creating configmap: ${denied}`,
            involvedObject: { kind: "ConfigMap", name },
          });
          return;
        }
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

      updateConfigMap: (id, data) => {
        const cm = get().configMaps.find((c) => c.metadata.uid === id);
        if (!cm) return;
        const name = cm.metadata.name;
        const ns = cm.metadata.namespace;
        // Hot-reload: restart pods consuming this ConfigMap (Phase 12).
        const now = Date.now();
        set(
          (s) => ({
            configMaps: s.configMaps.map((c) =>
              c.metadata.uid === id ? { ...c, data } : c,
            ),
            pods: s.pods.map((p) =>
              p.metadata.namespace === ns &&
              (p.spec.configMaps ?? []).includes(name) &&
              p.status.phase === "Running"
                ? {
                    ...p,
                    spec: {
                      ...p.spec,
                      containers: p.spec.containers.map((c) => ({
                        ...c,
                        state: "Waiting" as const,
                      })),
                    },
                    status: {
                      ...p.status,
                      phase: "ContainerCreating" as const,
                      ready: false,
                      restartCount: p.status.restartCount + 1,
                    },
                    phaseSince: now,
                  }
                : p,
            ),
          }),
          false,
          "updateConfigMap",
        );
        const consumers = get().pods.filter(
          (p) =>
            p.metadata.namespace === ns &&
            (p.spec.configMaps ?? []).includes(name),
        ).length;
        get().pushEvent({
          type: "Normal",
          reason: "ConfigReloaded",
          message: `ConfigMap ${name} updated; rolled ${consumers} consuming pod${consumers === 1 ? "" : "s"}.`,
          involvedObject: { kind: "ConfigMap", name },
        });
      },

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
        const denied = quotaDenial(get(), "secrets", ns);
        if (denied) {
          get().pushEvent({
            type: "Warning",
            reason: "FailedCreate",
            message: `Error creating secret: ${denied}`,
            involvedObject: { kind: "Secret", name },
          });
          return;
        }
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
            reclaimPolicy: input.reclaimPolicy ?? "Retain",
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
        const denied = quotaDenial(get(), "persistentvolumeclaims", ns);
        if (denied) {
          get().pushEvent({
            type: "Warning",
            reason: "FailedCreate",
            message: `Error creating persistentvolumeclaim: ${denied}`,
            involvedObject: { kind: "PersistentVolumeClaim", name },
          });
          return;
        }
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
        const boundPV = get().persistentVolumes.find(
          (pv) => pv.metadata.uid === pvc.boundPVUid,
        );
        // Apply the PV's reclaim policy (Phase 12): Delete removes the PV,
        // Recycle wipes+reuses it (→ Available), Retain keeps it (→ Released).
        const policy = boundPV?.spec.reclaimPolicy ?? "Retain";
        set(
          (s) => ({
            persistentVolumeClaims: s.persistentVolumeClaims.filter(
              (c) => c.metadata.uid !== id,
            ),
            persistentVolumes:
              policy === "Delete"
                ? s.persistentVolumes.filter(
                    (pv) => pv.metadata.uid !== pvc.boundPVUid,
                  )
                : s.persistentVolumes.map((pv) =>
                    pv.metadata.uid === pvc.boundPVUid
                      ? {
                          ...pv,
                          status:
                            policy === "Recycle"
                              ? { phase: "Available" as const }
                              : { phase: "Released" as const },
                        }
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
        const fate =
          policy === "Delete"
            ? "bound PV deleted"
            : policy === "Recycle"
              ? "bound PV recycled (Available)"
              : "bound PV released";
        get().pushEvent({
          type: "Normal",
          reason: "SuccessfulDelete",
          message: `Deleted PVC ${pvc.metadata.name}; ${fate} (${policy}).`,
          involvedObject: { kind: "PersistentVolumeClaim", name: pvc.metadata.name },
        });
      },

      resizePVC: (id, storage) => {
        const pvc = get().persistentVolumeClaims.find(
          (c) => c.metadata.uid === id,
        );
        if (!pvc) return;
        const next = Math.max(pvc.spec.storage, Math.round(storage));
        set(
          (s) => ({
            persistentVolumeClaims: s.persistentVolumeClaims.map((c) =>
              c.metadata.uid === id
                ? { ...c, spec: { ...c.spec, storage: next } }
                : c,
            ),
            // Grow the bound PV to match if it's now smaller.
            persistentVolumes: s.persistentVolumes.map((pv) =>
              pv.metadata.uid === pvc.boundPVUid && pv.spec.capacity < next
                ? { ...pv, spec: { ...pv.spec, capacity: next } }
                : pv,
            ),
          }),
          false,
          "resizePVC",
        );
        get().pushEvent({
          type: "Normal",
          reason: "FileSystemResizeSuccessful",
          message: `Resized PVC ${pvc.metadata.name} to ${next}Gi.`,
          involvedObject: { kind: "PersistentVolumeClaim", name: pvc.metadata.name },
        });
      },

      createVolumeSnapshot: (pvcId) => {
        const pvc = get().persistentVolumeClaims.find(
          (c) => c.metadata.uid === pvcId,
        );
        if (!pvc) return;
        const name = `snap-${pvc.metadata.name}-${randomSuffix(4)}`;
        const snap: VolumeSnapshot = {
          metadata: {
            name,
            namespace: pvc.metadata.namespace,
            uid: uid("vs"),
            labels: {},
            creationTimestamp: new Date().toISOString(),
          },
          spec: { sourcePVC: pvc.metadata.name },
          status: { readyToUse: false, restoreSize: pvc.spec.storage },
          createdAt: Date.now(),
        };
        set((s) => ({ volumeSnapshots: [...s.volumeSnapshots, snap] }), false, "createVolumeSnapshot");
        get().pushEvent({
          type: "Normal",
          reason: "SnapshotCreated",
          message: `Created VolumeSnapshot ${name} from PVC ${pvc.metadata.name}.`,
          involvedObject: { kind: "VolumeSnapshot", name },
        });
      },

      restoreVolumeSnapshot: (snapshotId, name) => {
        const snap = get().volumeSnapshots.find(
          (v) => v.metadata.uid === snapshotId,
        );
        if (!snap || !snap.status.readyToUse) return;
        get().createPVC({
          name: name?.trim() || `restored-${randomSuffix(4)}`,
          storage: snap.status.restoreSize,
          accessModes: ["ReadWriteOnce"],
          storageClassName: "standard",
        });
        get().pushEvent({
          type: "Normal",
          reason: "SnapshotRestored",
          message: `Restored PVC from VolumeSnapshot ${snap.metadata.name} (${snap.status.restoreSize}Gi).`,
          involvedObject: { kind: "VolumeSnapshot", name: snap.metadata.name },
        });
      },

      deleteVolumeSnapshot: (id) => {
        const snap = get().volumeSnapshots.find((v) => v.metadata.uid === id);
        if (!snap) return;
        set((s) => ({ volumeSnapshots: s.volumeSnapshots.filter((v) => v.metadata.uid !== id) }), false, "deleteVolumeSnapshot");
        get().pushEvent({ type: "Normal", reason: "SuccessfulDelete", message: `Deleted VolumeSnapshot ${snap.metadata.name}.`, involvedObject: { kind: "VolumeSnapshot", name: snap.metadata.name } });
      },

      createVPA: (input) => {
        const ns = get().namespace;
        const name = input.name?.trim() || `vpa-${randomSuffix()}`;
        const vpa: VerticalPodAutoscaler = {
          metadata: {
            name,
            namespace: ns,
            uid: uid("vpa"),
            labels: {},
            creationTimestamp: new Date().toISOString(),
          },
          spec: {
            targetRef: { kind: input.targetKind, name: input.targetName },
            mode: input.mode ?? "Auto",
          },
          status: { recommendedCpu: 0, recommendedMemory: 0 },
          createdAt: Date.now(),
        };
        set((s) => ({ vpas: [...s.vpas, vpa] }), false, "createVPA");
        get().pushEvent({
          type: "Normal",
          reason: "CreatedVPA",
          message: `Created VerticalPodAutoscaler ${name} → ${input.targetKind}/${input.targetName}.`,
          involvedObject: { kind: "VerticalPodAutoscaler", name },
        });
      },

      deleteVPA: (id) => {
        const vpa = get().vpas.find((v) => v.metadata.uid === id);
        if (!vpa) return;
        set((s) => ({ vpas: s.vpas.filter((v) => v.metadata.uid !== id) }), false, "deleteVPA");
        get().pushEvent({ type: "Normal", reason: "SuccessfulDelete", message: `Deleted VerticalPodAutoscaler ${vpa.metadata.name}.`, involvedObject: { kind: "VerticalPodAutoscaler", name: vpa.metadata.name } });
      },

      autoscaleStorageTick: () => {
        const state = get();
        const now = Date.now();
        let changed = false;

        // 1) VolumeSnapshot readiness (short provisioning delay).
        let volumeSnapshots = state.volumeSnapshots;
        if (state.volumeSnapshots.some((v) => !v.status.readyToUse)) {
          volumeSnapshots = state.volumeSnapshots.map((v) =>
            !v.status.readyToUse && now - v.createdAt > 800
              ? { ...v, status: { ...v.status, readyToUse: true } }
              : v,
          );
          if (volumeSnapshots !== state.volumeSnapshots) changed = true;
        }

        // 2) VPA: recommend from observed usage; apply to the target template.
        let deployments = state.deployments;
        let statefulSets = state.statefulSets;
        let replicaSets = state.replicaSets;
        const events: Parameters<ClusterState["pushEvent"]>[0][] = [];

        const vpas = state.vpas.map((vpa) => {
          const { kind, name } = vpa.spec.targetRef;
          const targetPods = state.pods.filter((p) => {
            const owner = p.metadata.ownerReferences?.[0]?.name ?? "";
            return owner.startsWith(name) || p.metadata.name.startsWith(name);
          });
          const loads = targetPods
            .map((p) => p.status.cpu)
            .filter((c): c is number => typeof c === "number");
          const avgLoad = loads.length
            ? loads.reduce((a, b) => a + b, 0) / loads.length
            : 50;
          // Map 0–100% observed load → 0.25–1.5 cores / 0.25–1.5 GiB.
          const recCpu = Math.round((0.25 + (avgLoad / 100) * 1.25) * 100) / 100;
          const recMem = Math.round((0.25 + (avgLoad / 100) * 1.25) * 100) / 100;

          if (
            vpa.spec.mode === "Auto" &&
            (vpa.status.recommendedCpu !== recCpu ||
              vpa.status.recommendedMemory !== recMem)
          ) {
            const applyReq = <
              T extends { metadata: { name: string }; spec: { template: { containers: { requests?: { cpu?: number; memory?: number } }[] } } },
            >(
              obj: T,
            ): T =>
              obj.metadata.name === name
                ? {
                    ...obj,
                    spec: {
                      ...obj.spec,
                      template: {
                        ...obj.spec.template,
                        containers: obj.spec.template.containers.map((c) => ({
                          ...c,
                          requests: { cpu: recCpu, memory: recMem },
                        })),
                      },
                    },
                  }
                : obj;
            if (kind === "Deployment") deployments = deployments.map(applyReq);
            else if (kind === "StatefulSet")
              statefulSets = statefulSets.map(applyReq);
            else replicaSets = replicaSets.map(applyReq);
            changed = true;
            events.push({
              type: "Normal",
              reason: "VPARecommendation",
              message: `VPA ${vpa.metadata.name}: recommend cpu=${recCpu}, memory=${recMem}Gi for ${kind}/${name} (applied).`,
              involvedObject: { kind: "VerticalPodAutoscaler", name: vpa.metadata.name },
            });
          }

          if (
            vpa.status.recommendedCpu !== recCpu ||
            vpa.status.recommendedMemory !== recMem
          ) {
            changed = true;
            return {
              ...vpa,
              status: { recommendedCpu: recCpu, recommendedMemory: recMem },
            };
          }
          return vpa;
        });

        if (!changed) return;
        set(
          { volumeSnapshots, vpas, deployments, statefulSets, replicaSets },
          false,
          "autoscaleStorageTick",
        );
        for (const e of events) get().pushEvent(e);
      },

      /* ---------------- Control-plane realism & multi-cluster (Phase 13) --- */

      rolloutRestart: (deploymentId) => {
        const dep = get().deployments.find((d) => d.metadata.uid === deploymentId);
        if (!dep) return;
        const now = Date.now();
        // Restart all pods owned by the deployment's ReplicaSets in place.
        const rsUids = new Set(
          get()
            .replicaSets.filter((rs) =>
              rs.metadata.ownerReferences?.some((o) => o.uid === deploymentId),
            )
            .map((rs) => rs.metadata.uid),
        );
        set(
          (s) => ({
            pods: s.pods.map((p) =>
              p.metadata.ownerReferences?.some((o) => rsUids.has(o.uid)) &&
              p.status.phase === "Running"
                ? {
                    ...p,
                    spec: {
                      ...p.spec,
                      containers: p.spec.containers.map((c) => ({
                        ...c,
                        state: "Waiting" as const,
                      })),
                    },
                    status: {
                      ...p.status,
                      phase: "ContainerCreating" as const,
                      ready: false,
                      restartCount: p.status.restartCount + 1,
                    },
                    phaseSince: now,
                  }
                : p,
            ),
          }),
          false,
          "rolloutRestart",
        );
        get().pushEvent({
          type: "Normal",
          reason: "RolloutRestart",
          message: `Restarted deployment ${dep.metadata.name} (rolling restart).`,
          involvedObject: { kind: "Deployment", name: dep.metadata.name },
        });
      },

      cordonNode: (id, unschedulable) => {
        const node = get().nodes.find((n) => n.id === id);
        if (!node) return;
        set(
          (s) => ({
            nodes: s.nodes.map((n) =>
              n.id === id ? { ...n, unschedulable } : n,
            ),
          }),
          false,
          "cordonNode",
        );
        get().pushEvent({
          type: "Normal",
          reason: unschedulable ? "NodeCordoned" : "NodeUncordoned",
          message: `Node ${node.name} ${unschedulable ? "cordoned (unschedulable)" : "uncordoned"}.`,
          involvedObject: { kind: "Node", name: node.name },
        });
      },

      drainNode: (id) => {
        const node = get().nodes.find((n) => n.id === id);
        if (!node) return;
        const now = Date.now();
        // Cordon + evict all non-DaemonSet pods (they reschedule elsewhere).
        set(
          (s) => ({
            nodes: s.nodes.map((n) =>
              n.id === id ? { ...n, unschedulable: true } : n,
            ),
            pods: s.pods.map((p) =>
              p.spec.nodeName === node.name &&
              ACTIVE_PHASES.has(p.status.phase) &&
              !p.metadata.ownerReferences?.some((o) => o.kind === "DaemonSet")
                ? {
                    ...p,
                    status: { ...p.status, phase: "Terminating" as const },
                    phaseSince: now,
                  }
                : p,
            ),
          }),
          false,
          "drainNode",
        );
        get().pushEvent({
          type: "Warning",
          reason: "NodeDrained",
          message: `Drained node ${node.name}: evicting pods (cordoned).`,
          involvedObject: { kind: "Node", name: node.name },
        });
      },

      setFinalizer: (kind, id, present) => {
        const applyMeta = <T extends { metadata: ObjectMeta }>(arr: T[]): T[] =>
          arr.map((o) =>
            o.metadata.uid === id
              ? {
                  ...o,
                  metadata: {
                    ...o.metadata,
                    finalizers: present ? ["kubesim.io/protect"] : [],
                  },
                }
              : o,
          );
        set(
          (s) => ({
            pods: kind === "Pod" ? applyMeta(s.pods) : s.pods,
            services: kind === "Service" ? applyMeta(s.services) : s.services,
            configMaps:
              kind === "ConfigMap" ? applyMeta(s.configMaps) : s.configMaps,
          }),
          false,
          "setFinalizer",
        );
        get().pushEvent({
          type: "Normal",
          reason: present ? "FinalizerAdded" : "FinalizerRemoved",
          message: `${present ? "Added" : "Removed"} finalizer on ${kind}.`,
        });
      },

      createCluster: (name) => {
        const st = get();
        clusterSnapshots.set(st.activeClusterId, st.exportSnapshot());
        const id = uid("cluster");
        st.resetCluster();
        set(
          (s) => ({
            clusters: [...s.clusters, { id, name: name.trim() || `cluster-${s.clusters.length + 1}` }],
            activeClusterId: id,
          }),
          false,
          "createCluster",
        );
        get().pushEvent({
          type: "Normal",
          reason: "ContextCreated",
          message: `Created cluster context "${name}".`,
        });
      },

      switchCluster: (id) => {
        const st = get();
        if (id === st.activeClusterId) return;
        if (!st.clusters.some((c) => c.id === id)) return;
        clusterSnapshots.set(st.activeClusterId, st.exportSnapshot());
        const target = clusterSnapshots.get(id);
        if (target) st.importSnapshot(target);
        else st.resetCluster();
        set({ activeClusterId: id }, false, "switchCluster");
        const name = st.clusters.find((c) => c.id === id)?.name ?? id;
        get().pushEvent({
          type: "Normal",
          reason: "ContextSwitched",
          message: `Switched to cluster context "${name}".`,
        });
      },

      deleteCluster: (id) => {
        const st = get();
        if (st.clusters.length <= 1) return;
        clusterSnapshots.delete(id);
        const remaining = st.clusters.filter((c) => c.id !== id);
        if (id === st.activeClusterId) {
          const next = remaining[0];
          const snap = clusterSnapshots.get(next.id);
          if (snap) st.importSnapshot(snap);
          else st.resetCluster();
          set({ clusters: remaining, activeClusterId: next.id }, false, "deleteCluster");
        } else {
          set({ clusters: remaining }, false, "deleteCluster");
        }
      },

      garbageCollect: () => {
        const s = get();
        const depUids = new Set(s.deployments.map((d) => d.metadata.uid));
        // ReplicaSets owned by a Deployment that no longer exists.
        const orphanRs = s.replicaSets.filter((rs) => {
          const depOwner = rs.metadata.ownerReferences?.find(
            (o) => o.kind === "Deployment",
          );
          return depOwner && !depUids.has(depOwner.uid);
        });
        const removeRsUids = new Set(orphanRs.map((r) => r.metadata.uid));
        const ctrlUids = new Set<string>([
          ...s.replicaSets
            .filter((r) => !removeRsUids.has(r.metadata.uid))
            .map((r) => r.metadata.uid),
          ...s.jobs.map((j) => j.metadata.uid),
          ...s.daemonSets.map((d) => d.metadata.uid),
          ...s.statefulSets.map((st) => st.metadata.uid),
        ]);
        const now = Date.now();
        let podsChanged = false;
        const pods = s.pods.map((p) => {
          const owner = p.metadata.ownerReferences?.[0];
          if (
            owner &&
            ["ReplicaSet", "Job", "DaemonSet", "StatefulSet"].includes(
              owner.kind,
            ) &&
            !ctrlUids.has(owner.uid) &&
            p.status.phase !== "Terminating"
          ) {
            podsChanged = true;
            return {
              ...p,
              status: { ...p.status, phase: "Terminating" as const },
              phaseSince: now,
            };
          }
          return p;
        });
        if (orphanRs.length === 0 && !podsChanged) return;
        set(
          (st) => ({
            replicaSets: st.replicaSets.filter(
              (r) => !removeRsUids.has(r.metadata.uid),
            ),
            pods,
          }),
          false,
          "garbageCollect",
        );
        if (orphanRs.length > 0)
          get().pushEvent({
            type: "Normal",
            reason: "GarbageCollected",
            message: `Cascade GC: removed ${orphanRs.length} orphaned ReplicaSet${orphanRs.length === 1 ? "" : "s"}.`,
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

      /* ---------------- RBAC & admission (Phase 8) ---------------- */

      createServiceAccount: (name) => {
        const ns = get().namespace;
        const n = name.trim() || `sa-${randomSuffix()}`;
        const sa: ServiceAccount = {
          metadata: {
            name: n,
            namespace: ns,
            uid: uid("sa"),
            labels: {},
            creationTimestamp: new Date().toISOString(),
          },
          createdAt: Date.now(),
        };
        set(
          (s) => ({ serviceAccounts: [...s.serviceAccounts, sa] }),
          false,
          "createServiceAccount",
        );
        get().pushEvent({
          type: "Normal",
          reason: "CreatedServiceAccount",
          message: `Created ServiceAccount ${n}.`,
          involvedObject: { kind: "ServiceAccount", name: n },
        });
      },

      deleteServiceAccount: (id) => {
        const sa = get().serviceAccounts.find((x) => x.metadata.uid === id);
        if (!sa) return;
        set(
          (s) => ({
            serviceAccounts: s.serviceAccounts.filter((x) => x.metadata.uid !== id),
            ui:
              s.ui.selected?.id === id
                ? { ...s.ui, drawerOpen: false, selected: null }
                : s.ui,
          }),
          false,
          "deleteServiceAccount",
        );
        get().pushEvent({
          type: "Normal",
          reason: "SuccessfulDelete",
          message: `Deleted ServiceAccount ${sa.metadata.name}.`,
          involvedObject: { kind: "ServiceAccount", name: sa.metadata.name },
        });
      },

      createRole: (input) => {
        const ns = get().namespace;
        const cluster = !!input.cluster;
        const name =
          input.name?.trim() || `${cluster ? "clusterrole" : "role"}-${randomSuffix()}`;
        const meta = {
          name,
          namespace: cluster ? "" : ns,
          uid: uid("role"),
          labels: {},
          creationTimestamp: new Date().toISOString(),
        };
        if (cluster) {
          const cr: ClusterRole = { metadata: meta, rules: input.rules, createdAt: Date.now() };
          set((s) => ({ clusterRoles: [...s.clusterRoles, cr] }), false, "createClusterRole");
        } else {
          const role: Role = { metadata: meta, rules: input.rules, createdAt: Date.now() };
          set((s) => ({ roles: [...s.roles, role] }), false, "createRole");
        }
        get().pushEvent({
          type: "Normal",
          reason: "CreatedRole",
          message: `Created ${cluster ? "ClusterRole" : "Role"} ${name}.`,
          involvedObject: { kind: cluster ? "ClusterRole" : "Role", name },
        });
      },

      deleteRole: (id, cluster) => {
        if (cluster) {
          const r = get().clusterRoles.find((x) => x.metadata.uid === id);
          set((s) => ({ clusterRoles: s.clusterRoles.filter((x) => x.metadata.uid !== id) }), false, "deleteClusterRole");
          if (r)
            get().pushEvent({ type: "Normal", reason: "SuccessfulDelete", message: `Deleted ClusterRole ${r.metadata.name}.`, involvedObject: { kind: "ClusterRole", name: r.metadata.name } });
        } else {
          const r = get().roles.find((x) => x.metadata.uid === id);
          set((s) => ({ roles: s.roles.filter((x) => x.metadata.uid !== id) }), false, "deleteRole");
          if (r)
            get().pushEvent({ type: "Normal", reason: "SuccessfulDelete", message: `Deleted Role ${r.metadata.name}.`, involvedObject: { kind: "Role", name: r.metadata.name } });
        }
      },

      createRoleBinding: (input) => {
        const ns = get().namespace;
        const cluster = !!input.cluster;
        const name =
          input.name?.trim() ||
          `${cluster ? "clusterrolebinding" : "rolebinding"}-${randomSuffix()}`;
        const meta = {
          name,
          namespace: cluster ? "" : ns,
          uid: uid("rb"),
          labels: {},
          creationTimestamp: new Date().toISOString(),
        };
        if (cluster) {
          const crb: ClusterRoleBinding = { metadata: meta, subjects: input.subjects, roleRef: input.roleRef, createdAt: Date.now() };
          set((s) => ({ clusterRoleBindings: [...s.clusterRoleBindings, crb] }), false, "createClusterRoleBinding");
        } else {
          const rb: RoleBinding = { metadata: meta, subjects: input.subjects, roleRef: input.roleRef, createdAt: Date.now() };
          set((s) => ({ roleBindings: [...s.roleBindings, rb] }), false, "createRoleBinding");
        }
        get().pushEvent({
          type: "Normal",
          reason: "CreatedRoleBinding",
          message: `Created ${cluster ? "ClusterRoleBinding" : "RoleBinding"} ${name} → ${input.roleRef.kind}/${input.roleRef.name}.`,
          involvedObject: { kind: cluster ? "ClusterRoleBinding" : "RoleBinding", name },
        });
      },

      deleteRoleBinding: (id, cluster) => {
        if (cluster) {
          const r = get().clusterRoleBindings.find((x) => x.metadata.uid === id);
          set((s) => ({ clusterRoleBindings: s.clusterRoleBindings.filter((x) => x.metadata.uid !== id) }), false, "deleteClusterRoleBinding");
          if (r)
            get().pushEvent({ type: "Normal", reason: "SuccessfulDelete", message: `Deleted ClusterRoleBinding ${r.metadata.name}.`, involvedObject: { kind: "ClusterRoleBinding", name: r.metadata.name } });
        } else {
          const r = get().roleBindings.find((x) => x.metadata.uid === id);
          set((s) => ({ roleBindings: s.roleBindings.filter((x) => x.metadata.uid !== id) }), false, "deleteRoleBinding");
          if (r)
            get().pushEvent({ type: "Normal", reason: "SuccessfulDelete", message: `Deleted RoleBinding ${r.metadata.name}.`, involvedObject: { kind: "RoleBinding", name: r.metadata.name } });
        }
      },

      createResourceQuota: (input) => {
        const ns = get().namespace;
        const name = input.name?.trim() || `quota-${randomSuffix()}`;
        const rq: ResourceQuota = {
          metadata: {
            name,
            namespace: ns,
            uid: uid("rq"),
            labels: {},
            creationTimestamp: new Date().toISOString(),
          },
          spec: { hard: input.hard },
          status: { used: {} },
          createdAt: Date.now(),
        };
        set((s) => ({ resourceQuotas: [...s.resourceQuotas, rq] }), false, "createResourceQuota");
        get().pushEvent({
          type: "Normal",
          reason: "CreatedResourceQuota",
          message: `Created ResourceQuota ${name} (${Object.entries(input.hard).map(([k, v]) => `${k}=${v}`).join(", ")}).`,
          involvedObject: { kind: "ResourceQuota", name },
        });
      },

      deleteResourceQuota: (id) => {
        const rq = get().resourceQuotas.find((x) => x.metadata.uid === id);
        if (!rq) return;
        set((s) => ({ resourceQuotas: s.resourceQuotas.filter((x) => x.metadata.uid !== id) }), false, "deleteResourceQuota");
        get().pushEvent({ type: "Normal", reason: "SuccessfulDelete", message: `Deleted ResourceQuota ${rq.metadata.name}.`, involvedObject: { kind: "ResourceQuota", name: rq.metadata.name } });
      },

      createLimitRange: (input) => {
        const ns = get().namespace;
        const name = input.name?.trim() || `limits-${randomSuffix()}`;
        const lr: LimitRange = {
          metadata: {
            name,
            namespace: ns,
            uid: uid("lr"),
            labels: {},
            creationTimestamp: new Date().toISOString(),
          },
          spec: { limits: input.limits },
          createdAt: Date.now(),
        };
        set((s) => ({ limitRanges: [...s.limitRanges, lr] }), false, "createLimitRange");
        get().pushEvent({ type: "Normal", reason: "CreatedLimitRange", message: `Created LimitRange ${name}.`, involvedObject: { kind: "LimitRange", name } });
      },

      deleteLimitRange: (id) => {
        const lr = get().limitRanges.find((x) => x.metadata.uid === id);
        if (!lr) return;
        set((s) => ({ limitRanges: s.limitRanges.filter((x) => x.metadata.uid !== id) }), false, "deleteLimitRange");
        get().pushEvent({ type: "Normal", reason: "SuccessfulDelete", message: `Deleted LimitRange ${lr.metadata.name}.`, involvedObject: { kind: "LimitRange", name: lr.metadata.name } });
      },

      createPriorityClass: (input) => {
        const name = input.name?.trim() || `priority-${randomSuffix()}`;
        const pc: PriorityClass = {
          metadata: {
            name,
            namespace: "",
            uid: uid("pc"),
            labels: {},
            creationTimestamp: new Date().toISOString(),
          },
          value: Math.round(input.value),
          globalDefault: input.globalDefault,
          description: input.description,
          createdAt: Date.now(),
        };
        set((s) => ({ priorityClasses: [...s.priorityClasses, pc] }), false, "createPriorityClass");
        get().pushEvent({
          type: "Normal",
          reason: "CreatedPriorityClass",
          message: `Created PriorityClass ${name} (value ${pc.value}).`,
          involvedObject: { kind: "PriorityClass", name },
        });
      },

      deletePriorityClass: (id) => {
        const pc = get().priorityClasses.find((x) => x.metadata.uid === id);
        if (!pc) return;
        set((s) => ({ priorityClasses: s.priorityClasses.filter((x) => x.metadata.uid !== id) }), false, "deletePriorityClass");
        get().pushEvent({ type: "Normal", reason: "SuccessfulDelete", message: `Deleted PriorityClass ${pc.metadata.name}.`, involvedObject: { kind: "PriorityClass", name: pc.metadata.name } });
      },

      createPodDisruptionBudget: (input) => {
        const ns = get().namespace;
        const name = input.name?.trim() || `pdb-${randomSuffix()}`;
        const pdb: PodDisruptionBudget = {
          metadata: {
            name,
            namespace: ns,
            uid: uid("pdb"),
            labels: {},
            creationTimestamp: new Date().toISOString(),
          },
          spec: {
            selector: input.selector,
            minAvailable: Math.max(0, Math.round(input.minAvailable)),
          },
          status: { currentHealthy: 0, desiredHealthy: 0, disruptionsAllowed: 0 },
          createdAt: Date.now(),
        };
        set((s) => ({ podDisruptionBudgets: [...s.podDisruptionBudgets, pdb] }), false, "createPodDisruptionBudget");
        get().pushEvent({
          type: "Normal",
          reason: "CreatedPodDisruptionBudget",
          message: `Created PodDisruptionBudget ${name} (minAvailable ${pdb.spec.minAvailable}).`,
          involvedObject: { kind: "PodDisruptionBudget", name },
        });
      },

      deletePodDisruptionBudget: (id) => {
        const pdb = get().podDisruptionBudgets.find((x) => x.metadata.uid === id);
        if (!pdb) return;
        set((s) => ({ podDisruptionBudgets: s.podDisruptionBudgets.filter((x) => x.metadata.uid !== id) }), false, "deletePodDisruptionBudget");
        get().pushEvent({ type: "Normal", reason: "SuccessfulDelete", message: `Deleted PodDisruptionBudget ${pdb.metadata.name}.`, involvedObject: { kind: "PodDisruptionBudget", name: pdb.metadata.name } });
      },

      setPodProbe: (id, kind, failing) => {
        const pod = get().pods.find((p) => p.metadata.uid === id);
        if (!pod) return;
        set(
          (s) => ({
            pods: s.pods.map((p) =>
              p.metadata.uid === id
                ? {
                    ...p,
                    spec: {
                      ...p.spec,
                      ...(kind === "liveness"
                        ? { livenessFailing: failing }
                        : { readinessFailing: failing }),
                    },
                  }
                : p,
            ),
          }),
          false,
          "setPodProbe",
        );
        get().pushEvent({
          type: failing ? "Warning" : "Normal",
          reason: failing ? "ProbeFailing" : "ProbeRecovered",
          message: `${kind} probe for ${pod.metadata.name} set to ${failing ? "failing" : "passing"}.`,
          involvedObject: { kind: "Pod", name: pod.metadata.name },
        });
      },

      /* ---------------- CRDs & Custom Resources (Phase 10) ---------------- */

      createCRD: (input) => {
        const kind = input.kind.trim();
        if (!kind) return;
        const plural =
          input.plural?.trim() || `${kind.toLowerCase()}s`;
        const singular = input.singular?.trim() || kind.toLowerCase();
        const group = input.group.trim() || "example.com";
        const version = input.version?.trim() || "v1";
        const crd: CustomResourceDefinition = {
          metadata: {
            name: `${plural}.${group}`,
            namespace: "",
            uid: uid("crd"),
            labels: {},
            creationTimestamp: new Date().toISOString(),
          },
          spec: {
            group,
            version,
            names: { kind, plural, singular, shortNames: input.shortNames },
            scope: input.scope ?? "Namespaced",
            schema: input.schema,
          },
          operator: input.operator,
          createdAt: Date.now(),
        };
        set((s) => ({ crds: [...s.crds, crd] }), false, "createCRD");
        get().pushEvent({
          type: "Normal",
          reason: "CustomResourceDefinitionCreated",
          message: `Registered CRD ${crd.metadata.name} (kind ${kind}).`,
          involvedObject: { kind: "CustomResourceDefinition", name: crd.metadata.name },
        });
      },

      registerSampleOperator: () => {
        if (get().crds.some((c) => c.operator === "Database")) return;
        const crd = databaseCRD();
        set((s) => ({ crds: [...s.crds, crd] }), false, "registerSampleOperator");
        get().pushEvent({
          type: "Normal",
          reason: "CustomResourceDefinitionCreated",
          message: `Registered CRD ${crd.metadata.name} with sample Database operator.`,
          involvedObject: { kind: "CustomResourceDefinition", name: crd.metadata.name },
        });
      },

      deleteCRD: (id) => {
        const crd = get().crds.find((c) => c.metadata.uid === id);
        if (!crd) return;
        const kind = crd.spec.names.kind;
        // Deleting a CRD garbage-collects its Custom Resources (operator GCs children next tick).
        set(
          (s) => ({
            crds: s.crds.filter((c) => c.metadata.uid !== id),
            customResources: s.customResources.filter((cr) => cr.kind !== kind),
          }),
          false,
          "deleteCRD",
        );
        get().pushEvent({
          type: "Normal",
          reason: "SuccessfulDelete",
          message: `Deleted CRD ${crd.metadata.name} and its ${kind} resources.`,
          involvedObject: { kind: "CustomResourceDefinition", name: crd.metadata.name },
        });
        get().operatorTick();
      },

      createCustomResource: (input) => {
        const crd = get().crds.find((c) => c.metadata.uid === input.crdId);
        if (!crd) return;
        const ns = crd.spec.scope === "Namespaced" ? get().namespace : "";
        const name =
          input.name?.trim() || `${crd.spec.names.singular}-${randomSuffix()}`;
        const cr: CustomResource = {
          metadata: {
            name,
            namespace: ns,
            uid: uid("cr"),
            labels: {},
            creationTimestamp: new Date().toISOString(),
          },
          apiVersion: `${crd.spec.group}/${crd.spec.version}`,
          kind: crd.spec.names.kind,
          spec: input.spec,
          createdAt: Date.now(),
        };
        set((s) => ({ customResources: [...s.customResources, cr] }), false, "createCustomResource");
        get().pushEvent({
          type: "Normal",
          reason: "Created",
          message: `Created ${cr.kind} ${name}.`,
          involvedObject: { kind: cr.kind, name },
        });
        get().operatorTick();
      },

      updateCustomResource: (id, spec) => {
        const cr = get().customResources.find((c) => c.metadata.uid === id);
        if (!cr) return;
        set(
          (s) => ({
            customResources: s.customResources.map((c) =>
              c.metadata.uid === id ? { ...c, spec: { ...c.spec, ...spec } } : c,
            ),
          }),
          false,
          "updateCustomResource",
        );
        get().pushEvent({
          type: "Normal",
          reason: "Updated",
          message: `Updated ${cr.kind} ${cr.metadata.name} spec.`,
          involvedObject: { kind: cr.kind, name: cr.metadata.name },
        });
        get().operatorTick();
      },

      deleteCustomResource: (id) => {
        const cr = get().customResources.find((c) => c.metadata.uid === id);
        if (!cr) return;
        set((s) => ({ customResources: s.customResources.filter((c) => c.metadata.uid !== id) }), false, "deleteCustomResource");
        get().pushEvent({
          type: "Normal",
          reason: "SuccessfulDelete",
          message: `Deleted ${cr.kind} ${cr.metadata.name}.`,
          involvedObject: { kind: cr.kind, name: cr.metadata.name },
        });
        get().operatorTick();
      },

      operatorTick: () => {
        const state = get();
        if (state.crds.every((c) => c.operator !== "Database")) {
          // Nothing to reconcile, but still GC orphaned children if any CR was removed.
          if (
            !state.statefulSets.some((s) =>
              s.metadata.ownerReferences?.some((o) => o.kind === "Database"),
            )
          )
            return;
        }
        const res = reconcileOperators(state);
        if (!res.changed) return;
        set(
          {
            statefulSets: res.statefulSets,
            services: res.services,
            secrets: res.secrets,
            pods: res.pods,
          },
          false,
          "operatorTick",
        );
        for (const e of res.events) get().pushEvent(e);
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

        // Ready, non-draining nodes (DaemonSet placement helper).
        const eligibleNodes = state.nodes.filter(
          (n) => n.status === "Ready" && !n.draining,
        );

        /* --- 1) Pod lifecycle transitions --- */
        let pods: Pod[] = [];
        for (const p of state.pods) {
          const age = now - p.phaseSince;
          if (p.status.phase === "Terminating") {
            // A finalizer keeps the pod in Terminating until it is cleared.
            if (p.metadata.finalizers?.length) {
              pods.push(p);
            } else if (age >= TERM_DELAY) {
              dirty = true;
              continue;
            } else {
              pods.push(p);
            }
          } else if (p.status.phase === "CrashLoopBackOff") {
            if (age >= CRASH_DELAY) {
              dirty = true;
              continue;
            }
            pods.push(p);
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
                status: {
                  ...p.status,
                  phase: "Running",
                  qos: computeQoS(p),
                  ready: !p.spec.readinessFailing,
                  schedulingReason: undefined,
                },
                phaseSince: now,
              });
              continue;
            }
            pods.push(p);
          } else {
            pods.push(p);
          }
        }

        /* --- 1b) Scheduler: filter → score → bind (with preemption) --- */
        const bindPod = (p: Pod, nodeName: string): Pod => ({
          ...p,
          spec: { ...p.spec, nodeName },
          status: {
            ...p.status,
            phase: "ContainerCreating",
            podIP: allocatePodIP(),
            qos: computeQoS(p),
            schedulingReason: undefined,
          },
          phaseSince: now,
        });

        for (let i = 0; i < pods.length; i++) {
          const p = pods[i];
          if (p.status.phase !== "Pending" || p.spec.nodeName) continue;
          if (now - p.phaseSince < SCHEDULE_DELAY) continue;

          const res = schedulePod(p, state.nodes, pods);
          if (res.nodeName) {
            pods[i] = bindPod(p, res.nodeName);
            dirty = true;
            events.push({
              type: "Normal",
              reason: "Scheduled",
              message: `Scheduled pod ${p.metadata.name} to ${res.nodeName}.`,
              involvedObject: { kind: "Pod", name: p.metadata.name },
            });
            continue;
          }

          // Try preemption for a priority pod that couldn't otherwise fit.
          const plan =
            (p.spec.priority ?? 0) > 0
              ? findPreemption(
                  p,
                  state.nodes,
                  pods,
                  state.podDisruptionBudgets,
                )
              : undefined;
          if (plan) {
            const victimIds = new Set(plan.victims.map((v) => v.metadata.uid));
            for (let j = 0; j < pods.length; j++) {
              if (victimIds.has(pods[j].metadata.uid)) {
                pods[j] = {
                  ...pods[j],
                  status: {
                    ...pods[j].status,
                    phase: "Terminating",
                    schedulingReason: `Preempted by ${p.metadata.name}`,
                  },
                  phaseSince: now,
                };
              }
            }
            pods[i] = bindPod(p, plan.nodeName);
            dirty = true;
            for (const v of plan.victims) {
              events.push({
                type: "Warning",
                reason: "Preempting",
                message: `Preempted pod ${v.metadata.name} to make room for higher-priority ${p.metadata.name}.`,
                involvedObject: { kind: "Pod", name: v.metadata.name },
              });
            }
            events.push({
              type: "Normal",
              reason: "Scheduled",
              message: `Scheduled pod ${p.metadata.name} to ${plan.nodeName} after preemption.`,
              involvedObject: { kind: "Pod", name: p.metadata.name },
            });
            continue;
          }

          // Unschedulable → stay Pending with a FailedScheduling reason.
          if (p.status.schedulingReason !== res.reason) {
            pods[i] = {
              ...p,
              status: { ...p.status, schedulingReason: res.reason },
            };
            dirty = true;
            events.push({
              type: "Warning",
              reason: "FailedScheduling",
              message: `${p.metadata.name}: ${res.reason}`,
              involvedObject: { kind: "Pod", name: p.metadata.name },
            });
          }
        }

        /* --- 1c) Probes: liveness restart + readiness gating --- */
        for (let i = 0; i < pods.length; i++) {
          const p = pods[i];
          if (p.status.phase !== "Running") continue;

          if (p.spec.livenessFailing && now - p.phaseSince >= LIVENESS_PERIOD) {
            pods[i] = {
              ...p,
              spec: {
                ...p.spec,
                containers: p.spec.containers.map((c) => ({
                  ...c,
                  state: "Waiting",
                })),
              },
              status: {
                ...p.status,
                phase: "ContainerCreating",
                ready: false,
                restartCount: p.status.restartCount + 1,
              },
              phaseSince: now,
            };
            dirty = true;
            events.push({
              type: "Warning",
              reason: "Unhealthy",
              message: `Liveness probe failed for ${p.metadata.name}; restarting container (restart #${p.status.restartCount + 1}).`,
              involvedObject: { kind: "Pod", name: p.metadata.name },
            });
            continue;
          }

          const ready = !p.spec.readinessFailing;
          if (p.status.ready !== ready) {
            pods[i] = { ...p, status: { ...p.status, ready } };
            dirty = true;
            events.push({
              type: ready ? "Normal" : "Warning",
              reason: ready ? "Ready" : "Unhealthy",
              message: ready
                ? `Readiness probe succeeded for ${p.metadata.name}; added to Service endpoints.`
                : `Readiness probe failed for ${p.metadata.name}; removed from Service endpoints.`,
              involvedObject: { kind: "Pod", name: p.metadata.name },
            });
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
          const stabWindow = hpa.spec.behavior?.stabilizationWindowSeconds;
          const cooldown = stabWindow ? stabWindow * 100 : HPA_COOLDOWN;
          if (desired !== currentReplicas && now - hpa.lastScaleAt > cooldown) {            changed = true;
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

        /* --- 4) Node usage recompute (requested cpu/mem vs allocatable) --- */
        const nodePodIds = new Map<string, string[]>();
        for (const p of pods) {
          if (p.spec.nodeName && NODE_PHASES.has(p.status.phase)) {
            const arr = nodePodIds.get(p.spec.nodeName) ?? [];
            arr.push(p.metadata.uid);
            nodePodIds.set(p.spec.nodeName, arr);
          }
        }
        const nodes = state.nodes.map((n) => {
          const podIds = nodePodIds.get(n.name) ?? [];
          // Requested resources (pods without explicit requests fall back to a
          // small default so gauges stay meaningful for simple scenarios).
          let cpuReq = 0;
          let memReq = 0;
          for (const p of pods) {
            if (p.spec.nodeName !== n.name) continue;
            if (!NODE_PHASES.has(p.status.phase)) continue;
            const r = podRequests(p);
            cpuReq += r.cpu > 0 ? r.cpu : POD_CPU;
            memReq += r.memory > 0 ? r.memory : POD_MEM;
          }
          const cpuUsed = Math.min(n.cpuCapacity, Math.round(cpuReq * 100) / 100);
          const memUsed = Math.min(n.memCapacity, Math.round(memReq * 100) / 100);
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
              rbacSubject: null,
            },
          }),
          false,
          "resetCluster",
        ),

      exportSnapshot: () => {
        const s = get();
        return {
          version: 1,
          exportedAt: new Date().toISOString(),
          namespace: s.namespace,
          namespaces: s.namespaces,
          simClock: s.simClock,
          timeScale: s.timeScale,
          nodes: s.nodes,
          pods: s.pods,
          replicaSets: s.replicaSets,
          deployments: s.deployments,
          statefulSets: s.statefulSets,
          daemonSets: s.daemonSets,
          jobs: s.jobs,
          cronJobs: s.cronJobs,
          hpas: s.hpas,
          services: s.services,
          ingresses: s.ingresses,
          networkPolicies: s.networkPolicies,
          configMaps: s.configMaps,
          secrets: s.secrets,
          persistentVolumes: s.persistentVolumes,
          persistentVolumeClaims: s.persistentVolumeClaims,
          serviceAccounts: s.serviceAccounts,
          roles: s.roles,
          clusterRoles: s.clusterRoles,
          roleBindings: s.roleBindings,
          clusterRoleBindings: s.clusterRoleBindings,
          resourceQuotas: s.resourceQuotas,
          limitRanges: s.limitRanges,
          priorityClasses: s.priorityClasses,
          podDisruptionBudgets: s.podDisruptionBudgets,
          crds: s.crds,
          customResources: s.customResources,
          volumeSnapshots: s.volumeSnapshots,
          vpas: s.vpas,
          events: s.events,
        };
      },

      importSnapshot: (data) => {
        if (!data || typeof data !== "object" || !Array.isArray(data.nodes))
          return false;
        const arr = <T,>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);
        set(
          (state) => ({
            nodes: arr(data.nodes),
            pods: arr(data.pods),
            replicaSets: arr(data.replicaSets),
            deployments: arr(data.deployments),
            statefulSets: arr(data.statefulSets),
            daemonSets: arr(data.daemonSets),
            jobs: arr(data.jobs),
            cronJobs: arr(data.cronJobs),
            hpas: arr(data.hpas),
            services: arr(data.services),
            ingresses: arr(data.ingresses),
            networkPolicies: arr(data.networkPolicies),
            configMaps: arr(data.configMaps),
            secrets: arr(data.secrets),
            persistentVolumes: arr(data.persistentVolumes),
            persistentVolumeClaims: arr(data.persistentVolumeClaims),
            serviceAccounts: arr(data.serviceAccounts),
            roles: arr(data.roles),
            clusterRoles: arr(data.clusterRoles),
            roleBindings: arr(data.roleBindings),
            clusterRoleBindings: arr(data.clusterRoleBindings),
            resourceQuotas: arr(data.resourceQuotas),
            limitRanges: arr(data.limitRanges),
            priorityClasses: arr(data.priorityClasses),
            podDisruptionBudgets: arr(data.podDisruptionBudgets),
            crds: arr(data.crds),
            customResources: arr(data.customResources),
            volumeSnapshots: arr(data.volumeSnapshots),
            vpas: arr(data.vpas),
            events: arr(data.events),
            namespace:
              typeof data.namespace === "string" ? data.namespace : "default",
            namespaces: Array.isArray(data.namespaces)
              ? (data.namespaces as string[])
              : [...DEFAULT_NAMESPACES],
            simClock:
              typeof data.simClock === "number" ? data.simClock : Date.now(),
            timeScale:
              typeof data.timeScale === "number" ? data.timeScale : 1,
            ui: { ...state.ui, drawerOpen: false, selected: null },
          }),
          false,
          "importSnapshot",
        );
        return true;
      },
    }),
    { name: "kubeSim/cluster" },
  ),
);
