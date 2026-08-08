/**
 * Sample "Database" operator (Phase 10).
 *
 * A built-in preset controller that watches Custom Resources of a CRD marked
 * with `operator: "Database"` and reconciles a set of managed children — a
 * StatefulSet, a headless Service and a credentials Secret — each carrying an
 * ownerReference back to the CR. Deleting the CR garbage-collects the children.
 */

import type {
  CustomResource,
  CustomResourceDefinition,
  OwnerReference,
  Secret,
  Service,
  StatefulSet,
  Pod,
} from "@/store/types";
import { nextColor, randomSuffix, uid } from "./workloads";

export interface OperatorEvent {
  type: "Normal" | "Warning";
  reason: string;
  message: string;
  involvedObject?: { kind: string; name: string };
}

export interface OperatorResult {
  statefulSets: StatefulSet[];
  services: Service[];
  secrets: Secret[];
  pods: Pod[];
  events: OperatorEvent[];
  changed: boolean;
}

function ownerRef(cr: CustomResource): OwnerReference {
  return { kind: cr.kind, name: cr.metadata.name, uid: cr.metadata.uid };
}

/** Reconcile all operator-managed CRs → returns the next child object sets. */
export function reconcileOperators(state: {
  crds: CustomResourceDefinition[];
  customResources: CustomResource[];
  statefulSets: StatefulSet[];
  services: Service[];
  secrets: Secret[];
  pods: Pod[];
}): OperatorResult {
  const events: OperatorEvent[] = [];
  let changed = false;

  const dbKinds = new Set(
    state.crds.filter((c) => c.operator === "Database").map((c) => c.spec.names.kind),
  );

  const dbCRs = state.customResources.filter((cr) => dbKinds.has(cr.kind));
  const liveCrUids = new Set(dbCRs.map((cr) => cr.metadata.uid));

  // Identify children managed by ANY database CR (for GC of orphans).
  const managedOwner = (obj: {
    metadata: { ownerReferences?: OwnerReference[] };
  }): OwnerReference | undefined =>
    obj.metadata.ownerReferences?.find((o) => dbKinds.has(o.kind));

  // --- Garbage-collect children whose owning CR no longer exists ---
  const removedStsUids = new Set<string>();
  let statefulSets = state.statefulSets.filter((sts) => {
    const owner = managedOwner(sts);
    if (owner && !liveCrUids.has(owner.uid)) {
      removedStsUids.add(sts.metadata.uid);
      changed = true;
      return false;
    }
    return true;
  });
  let services = state.services.filter((svc) => {
    const owner = managedOwner(svc);
    if (owner && !liveCrUids.has(owner.uid)) {
      changed = true;
      return false;
    }
    return true;
  });
  let secrets = state.secrets.filter((sec) => {
    const owner = managedOwner(sec);
    if (owner && !liveCrUids.has(owner.uid)) {
      changed = true;
      return false;
    }
    return true;
  });
  // Cascade: drop pods owned by a garbage-collected StatefulSet.
  let pods = state.pods;
  if (removedStsUids.size > 0) {
    pods = state.pods.filter(
      (p) =>
        !p.metadata.ownerReferences?.some((o) => removedStsUids.has(o.uid)),
    );
  }

  // --- Ensure children for each live database CR ---
  for (const cr of dbCRs) {
    const owner = ownerRef(cr);
    const ns = cr.metadata.namespace;
    const base = cr.metadata.name;
    const engine = String(cr.spec.engine ?? "postgres");
    const replicas = Math.max(1, Number(cr.spec.replicas ?? 1) || 1);
    const storage = Math.max(1, Number(cr.spec.storage ?? 5) || 5);
    const port = engine.includes("mysql") ? 3306 : 5432;
    const now = Date.now();
    const labels = { app: base, "app.kubernetes.io/managed-by": cr.kind };

    // Secret
    const secretName = `${base}-credentials`;
    if (!secrets.some((s) => s.metadata.name === secretName && s.metadata.namespace === ns)) {
      secrets = [
        ...secrets,
        {
          metadata: {
            name: secretName,
            namespace: ns,
            uid: uid("secret"),
            labels,
            creationTimestamp: new Date(now).toISOString(),
            ownerReferences: [owner],
          },
          type: "Opaque",
          data: { username: base, password: `pw-${randomSuffix(8)}` },
          createdAt: now,
        },
      ];
      changed = true;
      events.push({
        type: "Normal",
        reason: "OperatorReconcile",
        message: `${cr.kind}/${base}: created Secret ${secretName}.`,
        involvedObject: { kind: cr.kind, name: base },
      });
    }

    // Service (headless)
    if (!services.some((s) => s.metadata.name === base && s.metadata.namespace === ns)) {
      services = [
        ...services,
        {
          metadata: {
            name: base,
            namespace: ns,
            uid: uid("svc"),
            labels,
            creationTimestamp: new Date(now).toISOString(),
            ownerReferences: [owner],
          },
          spec: {
            type: "ClusterIP",
            selector: { app: base },
            ports: [{ port, targetPort: port }],
          },
          status: { clusterIP: "None" },
          color: nextColor(),
          createdAt: now,
        },
      ];
      changed = true;
      events.push({
        type: "Normal",
        reason: "OperatorReconcile",
        message: `${cr.kind}/${base}: created headless Service ${base}.`,
        involvedObject: { kind: cr.kind, name: base },
      });
    }

    // StatefulSet
    const existing = statefulSets.find(
      (s) => s.metadata.name === base && s.metadata.namespace === ns,
    );
    if (!existing) {
      statefulSets = [
        ...statefulSets,
        {
          metadata: {
            name: base,
            namespace: ns,
            uid: uid("sts"),
            labels,
            creationTimestamp: new Date(now).toISOString(),
            ownerReferences: [owner],
          },
          spec: {
            serviceName: base,
            replicas,
            selector: { app: base },
            template: {
              labels: { app: base },
              containers: [
                {
                  name: engine,
                  image: `${engine}:latest`,
                  ports: [port],
                  state: "Waiting",
                },
              ],
              secrets: [secretName],
            },
            volumeClaimTemplate: {
              name: "data",
              storage,
              storageClassName: "standard",
            },
          },
          status: { replicas: 0, readyReplicas: 0 },
          image: `${engine}:latest`,
          color: nextColor(),
          createdAt: now,
        },
      ];
      changed = true;
      events.push({
        type: "Normal",
        reason: "OperatorReconcile",
        message: `${cr.kind}/${base}: created StatefulSet ${base} (${replicas} replica${replicas > 1 ? "s" : ""}).`,
        involvedObject: { kind: cr.kind, name: base },
      });
    } else if (existing.spec.replicas !== replicas) {
      // Reconcile spec drift (e.g. CR replicas edited).
      statefulSets = statefulSets.map((s) =>
        s.metadata.uid === existing.metadata.uid
          ? { ...s, spec: { ...s.spec, replicas } }
          : s,
      );
      changed = true;
      events.push({
        type: "Normal",
        reason: "OperatorReconcile",
        message: `${cr.kind}/${base}: scaled StatefulSet ${base} to ${replicas} replica${replicas > 1 ? "s" : ""}.`,
        involvedObject: { kind: cr.kind, name: base },
      });
    }
  }

  return { statefulSets, services, secrets, pods, events, changed };
}

/** The built-in Database CRD preset (group/version/kind + schema). */
export function databaseCRD(): CustomResourceDefinition {
  const now = Date.now();
  return {
    metadata: {
      name: "databases.example.com",
      namespace: "",
      uid: uid("crd"),
      labels: {},
      creationTimestamp: new Date(now).toISOString(),
    },
    spec: {
      group: "example.com",
      version: "v1",
      names: {
        kind: "Database",
        plural: "databases",
        singular: "database",
        shortNames: ["db"],
      },
      scope: "Namespaced",
      schema: [
        { name: "engine", type: "string", required: true, default: "postgres" },
        { name: "replicas", type: "number", required: true, default: "1" },
        { name: "storage", type: "number", default: "5" },
      ],
    },
    operator: "Database",
    createdAt: now,
  };
}
