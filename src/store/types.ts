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

export interface Container {
  name: string;
  image: string;
  ports?: number[];
  env?: Record<string, string>;
  state: ContainerState;
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
  };
  status: {
    phase: PodPhase;
    podIP?: string;
    restartCount: number;
  };
  /** Accent color inherited from an owning ReplicaSet (grouping cue). */
  ownerColor?: string;
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

export interface PersistentVolume {
  metadata: ObjectMeta; // cluster-scoped (not namespace-filtered)
  spec: {
    capacity: number; // GiB
    accessModes: string[];
    storageClassName?: string;
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
