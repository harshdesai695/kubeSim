/**
 * kubeSim core object type definitions.
 *
 * These shapes mirror the field names described in
 * `prompts/00-kubernetes-objects-reference.md`. They are intentionally
 * simplified (a subset of real Kubernetes) and will be expanded in later
 * phases. Phase 0 only needs correctly-typed, empty placeholders.
 */

export type Namespace = string;

/** Default namespaces present at boot. */
export const DEFAULT_NAMESPACES = [
  "default",
  "kube-system",
  "kube-public",
] as const;

/** Consistent status color language (reference doc, Section 9). */
export type StatusColor = "running" | "pending" | "failed" | "terminated";

export interface OwnerReference {
  kind: string;
  name: string;
  uid: string;
}

export interface ObjectMeta {
  name: string;
  namespace: Namespace;
  uid: string;
  labels?: Record<string, string>;
  annotations?: Record<string, string>;
  creationTimestamp: string;
  ownerReferences?: OwnerReference[];
  /** Blocks deletion until cleared (Phase 13 GC/finalizers). */
  finalizers?: string[];
  /** Set when deletion begins under a finalizer (foreground GC). */
  deletionTimestamp?: string;
}

/** A named simulated cluster / kube context (Phase 13 multi-cluster). */
export interface ClusterContext {
  id: string;
  name: string;
}

/* ------------------------------------------------------------------ */
/* Node (worker) — reference doc 2.1                                   */
/* ------------------------------------------------------------------ */

export interface NodeCapacity {
  cpu: string; // e.g. "4"
  memory: string; // e.g. "8Gi"
}

export interface Taint {
  key: string;
  value?: string;
  effect: "NoSchedule" | "PreferNoSchedule" | "NoExecute";
}

/**
 * WorkerNode — Phase 1 store shape (reference doc §2.1).
 *
 * Capacity/usage are flattened into numeric fields (cores / GB) so the
 * resource gauges can render directly. `podIds` is present for later phases
 * but stays empty until workloads land.
 */
export interface WorkerNode {
  id: string;
  name: string;
  role: "worker";
  status: "Ready" | "NotReady";
  cpuCapacity: number; // cores
  cpuUsed: number; // cores
  memCapacity: number; // GB
  memUsed: number; // GB
  labels: Record<string, string>;
  taints: Taint[];
  podIds: string[];
  createdAt: number; // epoch ms — drives AGE column
  draining?: boolean; // transient state during drain & delete
  unschedulable?: boolean; // cordoned — no new pods scheduled
}

/* ------------------------------------------------------------------ */
/* Pod — reference doc 3.1                                             */
/* ------------------------------------------------------------------ */

export type PodPhase =
  | "Pending"
  | "ContainerCreating"
  | "Running"
  | "Succeeded"
  | "Failed"
  | "CrashLoopBackOff"
  | "Terminating";

export type ContainerState = "Running" | "Waiting" | "Terminated";

/** Simulated resource amounts: cpu in cores (fractional), memory in GiB. */
export interface ResourceAmounts {
  cpu?: number;
  memory?: number;
}

/** Scheduling QoS class derived from requests vs limits (reference doc §9). */
export type QoSClass = "Guaranteed" | "Burstable" | "BestEffort";

export type TaintEffect = "NoSchedule" | "PreferNoSchedule" | "NoExecute";

/** Pod toleration for node taints (Phase 9). */
export interface Toleration {
  key: string;
  operator?: "Equal" | "Exists";
  value?: string;
  effect?: TaintEffect;
}

export interface Container {
  name: string;
  image: string;
  ports?: number[];
  env?: Record<string, string>;
  state: ContainerState;
  /** Scheduling requests / limits (Phase 9). */
  requests?: ResourceAmounts;
  limits?: ResourceAmounts;
  /** Ordered init container (runs before app containers). */
  init?: boolean;
  /** Long-running sidecar (shown distinctly on the pod card). */
  sidecar?: boolean;
}

export interface Pod {
  metadata: ObjectMeta;
  spec: {
    containers: Container[];
    nodeName?: string;
    /** Names of consumed ConfigMaps / Secrets / PVCs (connector cues). */
    configMaps?: string[];
    secrets?: string[];
    pvcs?: string[];
    /** StatefulSet ordinal index (stable identity). */
    ordinal?: number;
    /** Bound ServiceAccount (RBAC identity). */
    serviceAccountName?: string;
    /* --- Scheduling controls (Phase 9) --- */
    nodeSelector?: Record<string, string>;
    tolerations?: Toleration[];
    /** Anti-affinity: spread pods sharing this label value across nodes. */
    antiAffinityLabel?: string;
    /** Topology spread: even distribution across this node label key. */
    topologyKey?: string;
    priorityClassName?: string;
    priority?: number;
    /* --- Probe intents (Phase 9) --- */
    livenessFailing?: boolean;
    readinessFailing?: boolean;
  };
  status: {
    phase: PodPhase;
    podIP?: string;
    restartCount: number;
    /** Simulated CPU utilization % (driven by HPA load slider). */
    cpu?: number;
    /** Derived QoS class (Guaranteed/Burstable/BestEffort). */
    qos?: QoSClass;
    /** Readiness gate for Service endpoints (default true when Running). */
    ready?: boolean;
    /** Human-readable reason a pod is unschedulable / evicted. */
    schedulingReason?: string;
  };
  /** Accent color inherited from an owning ReplicaSet (grouping cue). */
  ownerColor?: string;
  /** Job pods: epoch ms at which simulated work completes. */
  completeAt?: number;
  createdAt: number; // epoch ms — drives AGE
  phaseSince: number; // epoch ms the pod entered its current phase
}

/** Shared pod-template shape used by ReplicaSets and Deployments. */
export interface PodTemplate {
  labels: Record<string, string>;
  containers: Container[];
  configMaps?: string[];
  secrets?: string[];
  pvcs?: string[];
}

/* ------------------------------------------------------------------ */
/* ReplicaSet — reference doc 3.2                                      */
/* ------------------------------------------------------------------ */

export interface ReplicaSet {
  metadata: ObjectMeta; // ownerReferences → Deployment when managed
  spec: {
    replicas: number;
    selector: Record<string, string>;
    template: PodTemplate;
  };
  status: {
    replicas: number; // current owned+active pods
    readyReplicas: number;
  };
  /** Deployment revision this RS represents (1-based). */
  revision: number;
  /** Convenience: primary container image. */
  image: string;
  /** Accent color shared with its pods. */
  color: string;
  createdAt: number;
}

/* ------------------------------------------------------------------ */
/* Deployment — reference doc 3.3                                      */
/* ------------------------------------------------------------------ */

export interface DeploymentRevision {
  revision: number;
  image: string;
  timestamp: string;
  replicaSetId: string;
}

export interface DeploymentRollout {
  status: "Progressing" | "Complete";
  newReplicaSetId: string;
  oldReplicaSetId: string;
  lastStepAt: number;
}

export interface Deployment {
  metadata: ObjectMeta;
  spec: {
    replicas: number;
    selector: Record<string, string>;
    strategy: {
      type: "RollingUpdate" | "Recreate";
      maxSurge?: number;
      maxUnavailable?: number;
    };
    template: PodTemplate;
  };
  status: {
    replicas: number;
    readyReplicas: number;
  };
  /** Id of the ReplicaSet currently considered the desired revision. */
  activeReplicaSetId: string;
  revisions: DeploymentRevision[];
  rollout?: DeploymentRollout;
  color: string;
  createdAt: number;
}

/* ------------------------------------------------------------------ */
/* Advanced workloads — reference doc 3.4–3.7, 7.1                     */
/* ------------------------------------------------------------------ */

export interface StatefulSet {
  metadata: ObjectMeta;
  spec: {
    serviceName?: string;
    replicas: number;
    selector: Record<string, string>;
    template: PodTemplate;
    volumeClaimTemplate?: {
      name: string;
      storage: number; // GiB
      storageClassName?: string;
    };
  };
  status: { replicas: number; readyReplicas: number };
  image: string;
  color: string;
  createdAt: number;
}

export interface DaemonSet {
  metadata: ObjectMeta;
  spec: {
    selector: Record<string, string>;
    template: PodTemplate;
    nodeSelector?: Record<string, string>;
  };
  status: { desiredNumberScheduled: number; numberReady: number };
  image: string;
  color: string;
  createdAt: number;
}

export type JobPhase = "Running" | "Complete" | "Failed";

export interface Job {
  metadata: ObjectMeta; // ownerReferences → CronJob when scheduled
  spec: {
    completions: number;
    parallelism: number;
    backoffLimit: number;
    image: string;
    labels: Record<string, string>;
  };
  status: {
    succeeded: number;
    failed: number;
    active: number;
    phase: JobPhase;
  };
  /** When true, completing pods count as failures (retry demo). */
  forceFail?: boolean;
  color: string;
  createdAt: number;
}

export interface CronJobRun {
  jobName: string;
  time: number; // sim clock ms
  result: "Created" | "Complete" | "Failed";
}

export interface CronJob {
  metadata: ObjectMeta;
  spec: {
    schedule: string; // cron expression
    completions: number;
    parallelism: number;
    backoffLimit: number;
    image: string;
  };
  status: { lastScheduleTime?: number };
  /** Next fire time on the simulated clock (ms). */
  nextRunAt: number;
  history: CronJobRun[];
  color: string;
  createdAt: number;
}

export type HPATargetKind = "Deployment" | "ReplicaSet" | "StatefulSet";

export interface HorizontalPodAutoscaler {
  metadata: ObjectMeta;
  spec: {
    scaleTargetRef: { kind: HPATargetKind; name: string; uid: string };
    minReplicas: number;
    maxReplicas: number;
    targetCPUUtilizationPercentage: number;
    /** Metric source driving the load slider (Phase 12). */
    metric?: "cpu" | "memory";
    /** Scale behavior — stabilization window (seconds) before re-scaling. */
    behavior?: { stabilizationWindowSeconds?: number };
  };
  status: {
    currentReplicas: number;
    currentCPUUtilizationPercentage: number;
  };
  /** Manual load slider (0–100%) simulating pod CPU. */
  load: number;
  lastScaleAt: number;
  createdAt: number;
}

/* ------------------------------------------------------------------ */
/* Scheduling policy — reference doc §7 (Phase 9 stretch)              */
/* ------------------------------------------------------------------ */

export interface PriorityClass {
  metadata: ObjectMeta; // cluster-scoped (namespace = "")
  value: number;
  globalDefault?: boolean;
  description?: string;
  createdAt: number;
}

export interface PodDisruptionBudget {
  metadata: ObjectMeta; // namespaced
  spec: {
    selector: Record<string, string>;
    minAvailable: number;
  };
  status: {
    currentHealthy: number;
    desiredHealthy: number;
    disruptionsAllowed: number;
  };
  createdAt: number;
}

/* ------------------------------------------------------------------ */
/* Extensibility — CRDs & Custom Resources (Phase 10 stretch)          */
/* ------------------------------------------------------------------ */

export type CRDFieldType = "string" | "number" | "boolean";

export interface CRDField {
  name: string;
  type: CRDFieldType;
  required?: boolean;
  default?: string;
}

/** Built-in operator presets that reconcile children for a CR kind. */
export type OperatorPreset = "Database";

export interface CustomResourceDefinition {
  metadata: ObjectMeta; // cluster-scoped (namespace = "")
  spec: {
    group: string;
    version: string;
    names: {
      kind: string;
      plural: string;
      singular: string;
      shortNames?: string[];
    };
    scope: "Namespaced" | "Cluster";
    schema: CRDField[];
  };
  /** When set, the sample operator reconciles managed children. */
  operator?: OperatorPreset;
  createdAt: number;
}

export interface CustomResource {
  metadata: ObjectMeta;
  apiVersion: string; // "<group>/<version>"
  kind: string;
  spec: Record<string, string | number | boolean>;
  createdAt: number;
}


export interface ServiceAccount {
  metadata: ObjectMeta;
  createdAt: number;
}

export interface PolicyRule {
  apiGroups: string[];
  resources: string[];
  verbs: string[];
}

export interface Role {
  metadata: ObjectMeta; // namespaced
  rules: PolicyRule[];
  createdAt: number;
}

export interface ClusterRole {
  metadata: ObjectMeta; // cluster-scoped (namespace = "")
  rules: PolicyRule[];
  createdAt: number;
}

export type SubjectKind = "User" | "Group" | "ServiceAccount";

export interface Subject {
  kind: SubjectKind;
  name: string;
  namespace?: string; // for ServiceAccount
}

export interface RoleRef {
  kind: "Role" | "ClusterRole";
  name: string;
}

export interface RoleBinding {
  metadata: ObjectMeta; // namespaced
  subjects: Subject[];
  roleRef: RoleRef;
  createdAt: number;
}

export interface ClusterRoleBinding {
  metadata: ObjectMeta; // cluster-scoped
  subjects: Subject[];
  roleRef: RoleRef; // → ClusterRole
  createdAt: number;
}

export interface ResourceQuota {
  metadata: ObjectMeta; // namespaced
  spec: { hard: Record<string, number> }; // e.g. { pods: 5, services: 3 }
  status: { used: Record<string, number> };
  createdAt: number;
}

export interface LimitRangeItem {
  type: "Container";
  defaultRequest?: { cpu?: string; memory?: string };
  default?: { cpu?: string; memory?: string };
  max?: { cpu?: string; memory?: string };
  min?: { cpu?: string; memory?: string };
}

export interface LimitRange {
  metadata: ObjectMeta; // namespaced
  spec: { limits: LimitRangeItem[] };
  createdAt: number;
}

/* ------------------------------------------------------------------ */
/* Service — reference doc 4.1                                         */
/* ------------------------------------------------------------------ */

export type ServiceType =
  | "ClusterIP"
  | "NodePort"
  | "LoadBalancer"
  | "ExternalName";

export interface ServicePort {
  port: number;
  targetPort: number;
  nodePort?: number;
}

export interface Service {
  metadata: ObjectMeta;
  spec: {
    type: ServiceType;
    selector: Record<string, string>;
    ports: ServicePort[];
    /** For ExternalName services. */
    externalName?: string;
  };
  status: {
    clusterIP?: string;
    externalIP?: string; // assigned to LoadBalancer after a delay
    externalIPPending?: boolean;
  };
  color: string;
  createdAt: number;
}

/* ------------------------------------------------------------------ */
/* Ingress — reference doc 4.2                                         */
/* ------------------------------------------------------------------ */

export interface IngressRule {
  host: string;
  path: string;
  serviceName: string;
  servicePort: number;
}

export interface Ingress {
  metadata: ObjectMeta;
  spec: {
    rules: IngressRule[];
  };
  createdAt: number;
}

/* ------------------------------------------------------------------ */
/* NetworkPolicy — reference doc 4.3 (simplified)                      */
/* ------------------------------------------------------------------ */

export interface NetworkPolicy {
  metadata: ObjectMeta;
  spec: {
    /** Pods this policy applies to. */
    podSelector: Record<string, string>;
    /** When true, ingress traffic from anywhere is allowed. */
    allowAll: boolean;
    /** Otherwise, only sources carrying these labels are allowed. */
    fromLabels?: Record<string, string>;
  };
  createdAt: number;
}

/* ------------------------------------------------------------------ */
/* Configuration & Storage — reference doc 5                           */
/* ------------------------------------------------------------------ */

export interface ConfigMap {
  metadata: ObjectMeta;
  data: Record<string, string>;
  createdAt: number;
}

export type SecretType =
  | "Opaque"
  | "kubernetes.io/tls"
  | "kubernetes.io/dockerconfigjson";

export interface Secret {
  metadata: ObjectMeta;
  type: SecretType;
  /** Stored as plaintext in the simulator; displayed base64/masked. */
  data: Record<string, string>;
  createdAt: number;
}

export type PVPhase = "Available" | "Bound" | "Released";

export type ReclaimPolicy = "Retain" | "Delete" | "Recycle";

export interface PersistentVolume {
  metadata: ObjectMeta; // cluster-scoped (not namespace-filtered)
  spec: {
    capacity: number; // GiB
    accessModes: string[];
    storageClassName?: string;
    /** Fate of the volume when its PVC is deleted (Phase 12). */
    reclaimPolicy?: ReclaimPolicy;
  };
  status: {
    phase: PVPhase;
    boundClaim?: { name: string; uid: string };
  };
  dynamic?: boolean;
  createdAt: number;
}

export type PVCPhase = "Pending" | "Bound" | "Lost";

export interface PersistentVolumeClaim {
  metadata: ObjectMeta;
  spec: {
    storage: number; // GiB requested
    accessModes: string[];
    storageClassName?: string;
  };
  status: {
    phase: PVCPhase;
    volumeName?: string;
  };
  boundPVUid?: string;
  createdAt: number;
}

/* ------------------------------------------------------------------ */
/* Volume snapshots & autoscaling depth (Phase 12 stretch)             */
/* ------------------------------------------------------------------ */

export interface VolumeSnapshot {
  metadata: ObjectMeta; // namespaced
  spec: { sourcePVC: string };
  status: { readyToUse: boolean; restoreSize: number };
  createdAt: number;
}

export type VPAMode = "Auto" | "Off";

export interface VerticalPodAutoscaler {
  metadata: ObjectMeta; // namespaced
  spec: {
    targetRef: { kind: "Deployment" | "ReplicaSet" | "StatefulSet"; name: string };
    mode: VPAMode;
  };
  status: {
    recommendedCpu: number; // cores
    recommendedMemory: number; // GiB
  };
  createdAt: number;
}

/* ------------------------------------------------------------------ */
/* Events — reference doc Section 9                                    */
/* ------------------------------------------------------------------ */

export type EventType = "Normal" | "Warning";

export interface ClusterEvent {
  id: string;
  type: EventType;
  reason: string;
  message: string;
  involvedObject?: {
    kind: string;
    name: string;
  };
  timestamp: string;
}
