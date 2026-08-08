/**
 * Central manifest serialization — a single source of truth for the YAML/JSON
 * shown in both the detail drawer and `kubectl get -o yaml|json` (Phase 6).
 */

import type { WorkerNode } from "@/store/types";

/* ------------------------------------------------------------------ */
/* Generic YAML emitter                                                */
/* ------------------------------------------------------------------ */

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function scalar(v: unknown): string {
  if (v === null || v === undefined) return "null";
  if (typeof v === "string") {
    if (v === "" || /[:#{}\[\],&*?|<>=!%@`"]/.test(v) || /^\s|\s$/.test(v)) {
      return JSON.stringify(v);
    }
    return v;
  }
  return String(v);
}

/** Serialize a plain JS value into YAML. */
export function dumpYaml(value: unknown, indent = 0): string {
  const pad = "  ".repeat(indent);

  if (Array.isArray(value)) {
    if (value.length === 0) return `${pad}[]`;
    return value
      .map((item) => {
        if (isPlainObject(item) || Array.isArray(item)) {
          const body = dumpYaml(item, indent + 1).replace(
            /^ {2}/,
            "",
          );
          return `${pad}- ${body.slice(pad.length + 2)}`;
        }
        return `${pad}- ${scalar(item)}`;
      })
      .join("\n");
  }

  if (isPlainObject(value)) {
    const entries = Object.entries(value).filter(([, v]) => v !== undefined);
    if (entries.length === 0) return `${pad}{}`;
    return entries
      .map(([k, v]) => {
        if (Array.isArray(v)) {
          if (v.length === 0) return `${pad}${k}: []`;
          return `${pad}${k}:\n${dumpYaml(v, indent)}`;
        }
        if (isPlainObject(v)) {
          if (Object.keys(v).length === 0) return `${pad}${k}: {}`;
          return `${pad}${k}:\n${dumpYaml(v, indent + 1)}`;
        }
        return `${pad}${k}: ${scalar(v)}`;
      })
      .join("\n");
  }

  return `${pad}${scalar(value)}`;
}

/* ------------------------------------------------------------------ */
/* Per-kind manifest builders                                          */
/* ------------------------------------------------------------------ */

const API_VERSIONS: Record<string, string> = {
  Pod: "v1",
  Service: "v1",
  ConfigMap: "v1",
  Secret: "v1",
  PersistentVolume: "v1",
  PersistentVolumeClaim: "v1",
  Namespace: "v1",
  Node: "v1",
  Deployment: "apps/v1",
  ReplicaSet: "apps/v1",
  StatefulSet: "apps/v1",
  DaemonSet: "apps/v1",
  Job: "batch/v1",
  CronJob: "batch/v1",
  HorizontalPodAutoscaler: "autoscaling/v2",
  Ingress: "networking.k8s.io/v1",
  NetworkPolicy: "networking.k8s.io/v1",
};

/** Build a clean, manifest-shaped object for a store object. */
export function buildManifest(
  kind: string,
  obj: Record<string, unknown>,
): Record<string, unknown> {
  if (kind === "Node") {
    const n = obj as unknown as WorkerNode;
    return {
      apiVersion: "v1",
      kind: "Node",
      metadata: { name: n.name, labels: n.labels },
      spec: { unschedulable: !!n.draining },
      status: {
        conditions: [{ type: "Ready", status: n.status === "Ready" ? "True" : "False" }],
        capacity: { cpu: String(n.cpuCapacity), memory: `${n.memCapacity}Gi` },
      },
    };
  }

  if (kind === "Namespace") {
    return {
      apiVersion: "v1",
      kind: "Namespace",
      metadata: { name: (obj as { name: string }).name ?? String(obj) },
      status: { phase: "Active" },
    };
  }

  const meta = obj.metadata as
    | { name: string; namespace?: string; labels?: unknown; annotations?: unknown }
    | undefined;

  const manifest: Record<string, unknown> = {
    apiVersion: API_VERSIONS[kind] ?? "v1",
    kind,
    metadata: meta
      ? {
          name: meta.name,
          namespace: meta.namespace,
          labels: meta.labels,
          annotations: meta.annotations,
        }
      : undefined,
  };
  if (obj.type !== undefined) manifest.type = obj.type;
  if (obj.rules !== undefined) manifest.rules = obj.rules;
  if (obj.subjects !== undefined) manifest.subjects = obj.subjects;
  if (obj.roleRef !== undefined) manifest.roleRef = obj.roleRef;
  if (obj.spec !== undefined) manifest.spec = obj.spec;
  if (obj.data !== undefined) manifest.data = obj.data;
  if (obj.status !== undefined) manifest.status = obj.status;
  return manifest;
}

export function toYaml(kind: string, obj: Record<string, unknown>): string {
  return dumpYaml(buildManifest(kind, obj));
}

export function toJson(kind: string, obj: Record<string, unknown>): string {
  return JSON.stringify(buildManifest(kind, obj), null, 2);
}
