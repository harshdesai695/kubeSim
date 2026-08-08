/**
 * kubeSim CLI — generalized kubectl-style command parser (Phase 6).
 *
 * Every command runs against real store data and calls the SAME store actions
 * the GUI uses (no divergent code paths). Commands are wrapped in
 * `setCliActive` so store actions don't double-echo the command the user typed.
 */

import { useClusterStore, type ClusterState } from "@/store/useClusterStore";
import { useFlowStore } from "@/store/useFlowStore";
import { formatAge } from "./time";
import { generateLogs, simulateExec } from "./logs";
import { toYaml, toJson } from "./manifest";
import { parseYamlDocuments, type YamlValue } from "./yaml";
import { setCliActive } from "./echo";
import { canI, type SubjectRef } from "./rbac";
import {
  computeEndpoints,
  computeEndpointSlice,
  evaluatePodToPod,
  resolveServiceDns,
} from "./network";

export interface CliResult {
  lines: string[];
  clear?: boolean;
}

type OutputFormat = "table" | "yaml" | "json" | "wide";

const CONTROL_PLANE_NODE_NAME = "kubesim-control-plane";
const CLUSTER_STARTED_AT = Date.now();

/* ------------------------------------------------------------------ */
/* Resource registry (aliases → canonical type)                        */
/* ------------------------------------------------------------------ */

interface ResourceDef {
  canonical: string;
  kind: string; // manifest Kind
  namespaced: boolean;
  aliases: string[];
  list: (s: ClusterState) => { metadata: { uid: string; name: string; namespace?: string } }[];
}

/** Objects with a metadata.uid identity. */
const RESOURCES: ResourceDef[] = [
  { canonical: "pods", kind: "Pod", namespaced: true, aliases: ["pods", "pod", "po"], list: (s) => s.pods },
  { canonical: "deployments", kind: "Deployment", namespaced: true, aliases: ["deployments", "deployment", "deploy"], list: (s) => s.deployments },
  { canonical: "replicasets", kind: "ReplicaSet", namespaced: true, aliases: ["replicasets", "replicaset", "rs"], list: (s) => s.replicaSets },
  { canonical: "statefulsets", kind: "StatefulSet", namespaced: true, aliases: ["statefulsets", "statefulset", "sts"], list: (s) => s.statefulSets },
  { canonical: "daemonsets", kind: "DaemonSet", namespaced: true, aliases: ["daemonsets", "daemonset", "ds"], list: (s) => s.daemonSets },
  { canonical: "jobs", kind: "Job", namespaced: true, aliases: ["jobs", "job"], list: (s) => s.jobs },
  { canonical: "cronjobs", kind: "CronJob", namespaced: true, aliases: ["cronjobs", "cronjob", "cj"], list: (s) => s.cronJobs },
  { canonical: "hpa", kind: "HorizontalPodAutoscaler", namespaced: true, aliases: ["hpa", "horizontalpodautoscalers", "horizontalpodautoscaler"], list: (s) => s.hpas },
  { canonical: "services", kind: "Service", namespaced: true, aliases: ["services", "service", "svc"], list: (s) => s.services },
  { canonical: "ingresses", kind: "Ingress", namespaced: true, aliases: ["ingresses", "ingress", "ing"], list: (s) => s.ingresses },
  { canonical: "networkpolicies", kind: "NetworkPolicy", namespaced: true, aliases: ["networkpolicies", "networkpolicy", "netpol"], list: (s) => s.networkPolicies },
  { canonical: "configmaps", kind: "ConfigMap", namespaced: true, aliases: ["configmaps", "configmap", "cm"], list: (s) => s.configMaps },
  { canonical: "secrets", kind: "Secret", namespaced: true, aliases: ["secrets", "secret"], list: (s) => s.secrets },
  { canonical: "pvc", kind: "PersistentVolumeClaim", namespaced: true, aliases: ["persistentvolumeclaims", "persistentvolumeclaim", "pvc", "pvcs"], list: (s) => s.persistentVolumeClaims },
  { canonical: "pv", kind: "PersistentVolume", namespaced: false, aliases: ["persistentvolumes", "persistentvolume", "pv", "pvs"], list: (s) => s.persistentVolumes },
  { canonical: "serviceaccounts", kind: "ServiceAccount", namespaced: true, aliases: ["serviceaccounts", "serviceaccount", "sa"], list: (s) => s.serviceAccounts },
  { canonical: "roles", kind: "Role", namespaced: true, aliases: ["roles", "role"], list: (s) => s.roles },
  { canonical: "clusterroles", kind: "ClusterRole", namespaced: false, aliases: ["clusterroles", "clusterrole"], list: (s) => s.clusterRoles },
  { canonical: "rolebindings", kind: "RoleBinding", namespaced: true, aliases: ["rolebindings", "rolebinding"], list: (s) => s.roleBindings },
  { canonical: "clusterrolebindings", kind: "ClusterRoleBinding", namespaced: false, aliases: ["clusterrolebindings", "clusterrolebinding"], list: (s) => s.clusterRoleBindings },
  { canonical: "resourcequotas", kind: "ResourceQuota", namespaced: true, aliases: ["resourcequotas", "resourcequota", "quota", "quotas"], list: (s) => s.resourceQuotas },
  { canonical: "limitranges", kind: "LimitRange", namespaced: true, aliases: ["limitranges", "limitrange", "limits"], list: (s) => s.limitRanges },
  { canonical: "priorityclasses", kind: "PriorityClass", namespaced: false, aliases: ["priorityclasses", "priorityclass", "pc"], list: (s) => s.priorityClasses },
  { canonical: "poddisruptionbudgets", kind: "PodDisruptionBudget", namespaced: true, aliases: ["poddisruptionbudgets", "poddisruptionbudget", "pdb"], list: (s) => s.podDisruptionBudgets },
  { canonical: "volumesnapshots", kind: "VolumeSnapshot", namespaced: true, aliases: ["volumesnapshots", "volumesnapshot", "vs"], list: (s) => s.volumeSnapshots },
  { canonical: "verticalpodautoscalers", kind: "VerticalPodAutoscaler", namespaced: true, aliases: ["verticalpodautoscalers", "verticalpodautoscaler", "vpa"], list: (s) => s.vpas },
];

const SPECIAL_TYPES = new Set(["nodes", "namespaces", "events"]);

/** Match a token against a registered CRD's plural/singular/kind/shortNames. */
function resolveCRD(token: string | undefined, s: ClusterState) {
  if (!token) return undefined;
  const t = token.toLowerCase();
  return s.crds.find(
    (c) =>
      c.spec.names.plural === t ||
      c.spec.names.singular === t ||
      c.spec.names.kind.toLowerCase() === t ||
      (c.spec.names.shortNames ?? []).map((x) => x.toLowerCase()).includes(t),
  );
}

const CRD_ALIASES = new Set([
  "crd",
  "crds",
  "customresourcedefinition",
  "customresourcedefinitions",
]);

function resolveType(token?: string): ResourceDef | "nodes" | "namespaces" | "events" | null {
  if (!token) return null;
  const t = token.toLowerCase();
  if (["nodes", "node", "no"].includes(t)) return "nodes";
  if (["namespaces", "namespace", "ns"].includes(t)) return "namespaces";
  if (["events", "event", "ev"].includes(t)) return "events";
  return RESOURCES.find((r) => r.aliases.includes(t)) ?? null;
}

/* ------------------------------------------------------------------ */
/* Table formatting                                                    */
/* ------------------------------------------------------------------ */

function pad(text: string, width: number): string {
  return text.length >= width ? text + "  " : text + " ".repeat(width - text.length);
}

function table(headers: string[], rows: string[][]): string[] {
  const widths = headers.map((h, i) =>
    Math.max(h.length, ...rows.map((r) => (r[i] ?? "").length)) + 2,
  );
  const render = (cols: string[]) =>
    cols.map((c, i) => (i === cols.length - 1 ? c : pad(c, widths[i]))).join("");
  return [render(headers), ...rows.map(render)];
}

/* ------------------------------------------------------------------ */
/* get — table rendering per type                                      */
/* ------------------------------------------------------------------ */

function getTable(canonical: string, s: ClusterState, ns: string, wide: boolean): string[] {
  switch (canonical) {
    case "nodes": {
      const headers = ["NAME", "STATUS", "ROLES", "AGE"];
      if (wide) headers.push("CPU", "MEMORY");
      const rows: string[][] = [
        [CONTROL_PLANE_NODE_NAME, "Ready", "control-plane", formatAge(CLUSTER_STARTED_AT), ...(wide ? ["4", "8Gi"] : [])],
        ...s.nodes.map((n) => [
          n.name,
          n.status,
          "<none>",
          formatAge(n.createdAt),
          ...(wide ? [`${n.cpuUsed}/${n.cpuCapacity}`, `${n.memUsed}/${n.memCapacity}Gi`] : []),
        ]),
      ];
      return table(headers, rows);
    }
    case "namespaces":
      return table(["NAME", "STATUS"], s.namespaces.map((n) => [n, "Active"]));
    case "events": {
      const evts = s.events.slice(0, 30);
      if (evts.length === 0) return ["No events."];
      return table(
        ["TYPE", "REASON", "OBJECT", "MESSAGE"],
        evts.map((e) => [
          e.type,
          e.reason,
          e.involvedObject ? `${e.involvedObject.kind}/${e.involvedObject.name}` : "-",
          e.message,
        ]),
      );
    }
    case "pods": {
      const items = s.pods.filter((p) => p.metadata.namespace === ns);
      if (items.length === 0) return ["No resources found in " + ns + " namespace."];
      const headers = ["NAME", "READY", "STATUS", "RESTARTS", "AGE"];
      if (wide) headers.push("IP", "NODE");
      return table(
        headers,
        items.map((p) => {
          const running = p.spec.containers.filter((c) => c.state === "Running").length;
          return [
            p.metadata.name,
            `${running}/${p.spec.containers.length}`,
            p.status.phase,
            String(p.status.restartCount),
            formatAge(p.createdAt),
            ...(wide ? [p.status.podIP ?? "<none>", p.spec.nodeName ?? "<none>"] : []),
          ];
        }),
      );
    }
    case "deployments": {
      const items = s.deployments.filter((d) => d.metadata.namespace === ns);
      if (items.length === 0) return ["No resources found in " + ns + " namespace."];
      return table(
        ["NAME", "READY", "UP-TO-DATE", "AVAILABLE", "AGE"],
        items.map((d) => [
          d.metadata.name,
          `${d.status.readyReplicas}/${d.spec.replicas}`,
          String(d.rollout ? d.status.readyReplicas : d.spec.replicas),
          String(d.status.readyReplicas),
          formatAge(d.createdAt),
        ]),
      );
    }
    case "replicasets": {
      const items = s.replicaSets.filter((r) => r.metadata.namespace === ns);
      if (items.length === 0) return ["No resources found in " + ns + " namespace."];
      return table(
        ["NAME", "DESIRED", "CURRENT", "READY", "AGE"],
        items.map((r) => [
          r.metadata.name,
          String(r.spec.replicas),
          String(r.status.replicas),
          String(r.status.readyReplicas),
          formatAge(r.createdAt),
        ]),
      );
    }
    case "statefulsets": {
      const items = s.statefulSets.filter((x) => x.metadata.namespace === ns);
      if (items.length === 0) return ["No resources found in " + ns + " namespace."];
      return table(
        ["NAME", "READY", "AGE"],
        items.map((x) => [x.metadata.name, `${x.status.readyReplicas}/${x.spec.replicas}`, formatAge(x.createdAt)]),
      );
    }
    case "daemonsets": {
      const items = s.daemonSets.filter((x) => x.metadata.namespace === ns);
      if (items.length === 0) return ["No resources found in " + ns + " namespace."];
      return table(
        ["NAME", "DESIRED", "READY", "AGE"],
        items.map((x) => [x.metadata.name, String(x.status.desiredNumberScheduled), String(x.status.numberReady), formatAge(x.createdAt)]),
      );
    }
    case "jobs": {
      const items = s.jobs.filter((x) => x.metadata.namespace === ns);
      if (items.length === 0) return ["No resources found in " + ns + " namespace."];
      return table(
        ["NAME", "COMPLETIONS", "STATUS", "AGE"],
        items.map((x) => [x.metadata.name, `${x.status.succeeded}/${x.spec.completions}`, x.status.phase, formatAge(x.createdAt)]),
      );
    }
    case "cronjobs": {
      const items = s.cronJobs.filter((x) => x.metadata.namespace === ns);
      if (items.length === 0) return ["No resources found in " + ns + " namespace."];
      return table(
        ["NAME", "SCHEDULE", "AGE"],
        items.map((x) => [x.metadata.name, x.spec.schedule, formatAge(x.createdAt)]),
      );
    }
    case "hpa": {
      const items = s.hpas.filter((x) => x.metadata.namespace === ns);
      if (items.length === 0) return ["No resources found in " + ns + " namespace."];
      return table(
        ["NAME", "REFERENCE", "TARGETS", "MINPODS", "MAXPODS", "REPLICAS"],
        items.map((x) => [
          x.metadata.name,
          `${x.spec.scaleTargetRef.kind}/${x.spec.scaleTargetRef.name}`,
          `${x.status.currentCPUUtilizationPercentage}%/${x.spec.targetCPUUtilizationPercentage}%`,
          String(x.spec.minReplicas),
          String(x.spec.maxReplicas),
          String(x.status.currentReplicas),
        ]),
      );
    }
    case "services": {
      const items = s.services.filter((x) => x.metadata.namespace === ns);
      if (items.length === 0) return ["No resources found in " + ns + " namespace."];
      return table(
        ["NAME", "TYPE", "CLUSTER-IP", "EXTERNAL-IP", "PORT(S)"],
        items.map((x) => [
          x.metadata.name,
          x.spec.type,
          x.status.clusterIP ?? "<none>",
          x.spec.type === "LoadBalancer" ? x.status.externalIP ?? "<pending>" : "<none>",
          `${x.spec.ports[0]?.port}/TCP`,
        ]),
      );
    }
    case "ingresses": {
      const items = s.ingresses.filter((x) => x.metadata.namespace === ns);
      if (items.length === 0) return ["No resources found in " + ns + " namespace."];
      const rows: string[][] = [];
      for (const ing of items)
        for (const r of ing.spec.rules)
          rows.push([ing.metadata.name, r.host, r.path, `${r.serviceName}:${r.servicePort}`]);
      return table(["NAME", "HOST", "PATH", "SERVICE"], rows);
    }
    case "networkpolicies": {
      const items = s.networkPolicies.filter((x) => x.metadata.namespace === ns);
      if (items.length === 0) return ["No resources found in " + ns + " namespace."];
      return table(
        ["NAME", "POD-SELECTOR", "POLICY"],
        items.map((x) => [
          x.metadata.name,
          Object.entries(x.spec.podSelector).map(([k, v]) => `${k}=${v}`).join(",") || "<all>",
          x.spec.allowAll ? "allow-all" : "deny",
        ]),
      );
    }
    case "configmaps": {
      const items = s.configMaps.filter((x) => x.metadata.namespace === ns);
      if (items.length === 0) return ["No resources found in " + ns + " namespace."];
      return table(
        ["NAME", "DATA", "AGE"],
        items.map((x) => [x.metadata.name, String(Object.keys(x.data).length), formatAge(x.createdAt)]),
      );
    }
    case "secrets": {
      const items = s.secrets.filter((x) => x.metadata.namespace === ns);
      if (items.length === 0) return ["No resources found in " + ns + " namespace."];
      return table(
        ["NAME", "TYPE", "DATA", "AGE"],
        items.map((x) => [x.metadata.name, x.type, String(Object.keys(x.data).length), formatAge(x.createdAt)]),
      );
    }
    case "pvc": {
      const items = s.persistentVolumeClaims.filter((x) => x.metadata.namespace === ns);
      if (items.length === 0) return ["No resources found in " + ns + " namespace."];
      return table(
        ["NAME", "STATUS", "VOLUME", "CAPACITY"],
        items.map((x) => [x.metadata.name, x.status.phase, x.status.volumeName ?? "-", `${x.spec.storage}Gi`]),
      );
    }
    case "pv":
      if (s.persistentVolumes.length === 0) return ["No resources found."];
      return table(
        ["NAME", "CAPACITY", "STATUS", "STORAGECLASS"],
        s.persistentVolumes.map((x) => [x.metadata.name, `${x.spec.capacity}Gi`, x.status.phase, x.spec.storageClassName ?? "-"]),
      );
    case "serviceaccounts": {
      const items = s.serviceAccounts.filter((x) => x.metadata.namespace === ns);
      if (items.length === 0) return ["No resources found in " + ns + " namespace."];
      return table(["NAME", "AGE"], items.map((x) => [x.metadata.name, formatAge(x.createdAt)]));
    }
    case "roles": {
      const items = s.roles.filter((x) => x.metadata.namespace === ns);
      if (items.length === 0) return ["No resources found in " + ns + " namespace."];
      return table(["NAME", "RULES", "AGE"], items.map((x) => [x.metadata.name, String(x.rules.length), formatAge(x.createdAt)]));
    }
    case "clusterroles":
      if (s.clusterRoles.length === 0) return ["No resources found."];
      return table(["NAME", "RULES", "AGE"], s.clusterRoles.map((x) => [x.metadata.name, String(x.rules.length), formatAge(x.createdAt)]));
    case "rolebindings": {
      const items = s.roleBindings.filter((x) => x.metadata.namespace === ns);
      if (items.length === 0) return ["No resources found in " + ns + " namespace."];
      return table(["NAME", "ROLE", "AGE"], items.map((x) => [x.metadata.name, `${x.roleRef.kind}/${x.roleRef.name}`, formatAge(x.createdAt)]));
    }
    case "clusterrolebindings":
      if (s.clusterRoleBindings.length === 0) return ["No resources found."];
      return table(["NAME", "ROLE", "AGE"], s.clusterRoleBindings.map((x) => [x.metadata.name, `ClusterRole/${x.roleRef.name}`, formatAge(x.createdAt)]));
    case "resourcequotas": {
      const items = s.resourceQuotas.filter((x) => x.metadata.namespace === ns);
      if (items.length === 0) return ["No resources found in " + ns + " namespace."];
      return table(
        ["NAME", "HARD", "AGE"],
        items.map((x) => [
          x.metadata.name,
          Object.entries(x.spec.hard).map(([k, v]) => `${k}=${v}`).join(","),
          formatAge(x.createdAt),
        ]),
      );
    }
    case "limitranges": {
      const items = s.limitRanges.filter((x) => x.metadata.namespace === ns);
      if (items.length === 0) return ["No resources found in " + ns + " namespace."];
      return table(["NAME", "AGE"], items.map((x) => [x.metadata.name, formatAge(x.createdAt)]));
    }
    case "priorityclasses": {
      if (s.priorityClasses.length === 0) return ["No resources found."];
      return table(
        ["NAME", "VALUE", "GLOBAL-DEFAULT", "AGE"],
        s.priorityClasses.map((x) => [
          x.metadata.name,
          String(x.value),
          x.globalDefault ? "true" : "false",
          formatAge(x.createdAt),
        ]),
      );
    }
    case "poddisruptionbudgets": {
      const items = s.podDisruptionBudgets.filter((x) => x.metadata.namespace === ns);
      if (items.length === 0) return ["No resources found in " + ns + " namespace."];
      return table(
        ["NAME", "MIN-AVAILABLE", "SELECTOR", "AGE"],
        items.map((x) => [
          x.metadata.name,
          String(x.spec.minAvailable),
          Object.entries(x.spec.selector).map(([k, v]) => `${k}=${v}`).join(",") || "<none>",
          formatAge(x.createdAt),
        ]),
      );
    }
    case "volumesnapshots": {
      const items = s.volumeSnapshots.filter((x) => x.metadata.namespace === ns);
      if (items.length === 0) return ["No resources found in " + ns + " namespace."];
      return table(
        ["NAME", "SOURCE-PVC", "READY", "RESTORE-SIZE", "AGE"],
        items.map((x) => [
          x.metadata.name,
          x.spec.sourcePVC,
          x.status.readyToUse ? "true" : "false",
          `${x.status.restoreSize}Gi`,
          formatAge(x.createdAt),
        ]),
      );
    }
    case "verticalpodautoscalers": {
      const items = s.vpas.filter((x) => x.metadata.namespace === ns);
      if (items.length === 0) return ["No resources found in " + ns + " namespace."];
      return table(
        ["NAME", "TARGET", "MODE", "CPU", "MEM", "AGE"],
        items.map((x) => [
          x.metadata.name,
          `${x.spec.targetRef.kind}/${x.spec.targetRef.name}`,
          x.spec.mode,
          String(x.status.recommendedCpu),
          `${x.status.recommendedMemory}Gi`,
          formatAge(x.createdAt),
        ]),
      );
    }
    default:
      return [`error: unsupported resource "${canonical}".`];
  }
}

/* ------------------------------------------------------------------ */
/* Object lookup + generic mutations                                   */
/* ------------------------------------------------------------------ */

function findObject(
  def: ResourceDef,
  s: ClusterState,
  ns: string,
  name: string,
): { uid: string; obj: Record<string, unknown> } | undefined {
  const list = def.list(s).filter(
    (o) => !def.namespaced || o.metadata.namespace === ns,
  );
  const found = list.find((o) => o.metadata.name === name);
  return found ? { uid: found.metadata.uid, obj: found as unknown as Record<string, unknown> } : undefined;
}

function notFound(kind: string, name: string): string {
  return `Error from server (NotFound): ${kind.toLowerCase()}s "${name}" not found`;
}

/* ------------------------------------------------------------------ */
/* Flag parsing                                                        */
/* ------------------------------------------------------------------ */

interface Parsed {
  positional: string[];
  namespace?: string;
  output?: OutputFormat;
  flags: Record<string, string | boolean>;
  execArgs?: string[];
}

function parseArgs(tokens: string[]): Parsed {
  const positional: string[] = [];
  const flags: Record<string, string | boolean> = {};
  let namespace: string | undefined;
  let output: OutputFormat | undefined;
  let execArgs: string[] | undefined;

  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t === "--") {
      execArgs = tokens.slice(i + 1);
      break;
    }
    if (t === "-n" || t === "--namespace") {
      namespace = tokens[++i];
    } else if (t.startsWith("--namespace=")) {
      namespace = t.split("=")[1];
    } else if (t === "-o" || t === "--output") {
      output = tokens[++i] as OutputFormat;
    } else if (t.startsWith("-o")) {
      output = t.slice(2) as OutputFormat;
    } else if (t.startsWith("--")) {
      const [k, v] = t.slice(2).split("=");
      flags[k] = v ?? true;
    } else if (t.startsWith("-") && t.length > 1 && !/^-\d/.test(t)) {
      flags[t.slice(1)] = true;
    } else {
      positional.push(t);
    }
  }
  return { positional, namespace, output, flags, execArgs };
}

/* ------------------------------------------------------------------ */
/* Manifest creation (create/apply -f)                                 */
/* ------------------------------------------------------------------ */

function asRecord(v: YamlValue | undefined): Record<string, YamlValue> {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, YamlValue>) : {};
}

function dig(obj: YamlValue, path: string[]): YamlValue {
  let cur: YamlValue = obj;
  for (const key of path) {
    cur = asRecord(cur)[key];
    if (cur === undefined) return undefined as unknown as YamlValue;
  }
  return cur;
}

function imageOf(spec: YamlValue): string {
  const containers =
    (dig(spec, ["template", "spec", "containers"]) as YamlValue[]) ??
    (dig(spec, ["containers"]) as YamlValue[]);
  const img = Array.isArray(containers) ? asRecord(containers[0]).image : undefined;
  return typeof img === "string" ? img : "nginx:1.25";
}

function numOf(v: YamlValue, fallback: number): number {
  if (typeof v === "number") return v;
  if (typeof v === "string") {
    const n = parseInt(v, 10);
    return Number.isFinite(n) ? n : fallback;
  }
  return fallback;
}

export function applyManifests(text: string): CliResult {
  const store = useClusterStore.getState();
  const docs = parseYamlDocuments(text);
  if (docs.length === 0) return { lines: ["error: no manifests found in input."] };
  const out: string[] = [];
  setCliActive(true);
  try {
    for (const raw of docs) {
      const doc = asRecord(raw);
      const kind = String(doc.kind ?? "");
      const meta = asRecord(doc.metadata);
      const name = typeof meta.name === "string" ? meta.name : undefined;
      const spec = doc.spec;
      switch (kind) {
        case "Namespace":
          if (name) store.createNamespace(name);
          out.push(`namespace/${name} created`);
          break;
        case "Pod":
          store.createPod({ name, image: imageOf(spec) });
          out.push(`pod/${name ?? "generated"} created`);
          break;
        case "Deployment":
          store.createDeployment({ name, image: imageOf(spec), replicas: numOf(dig(spec, ["replicas"]), 1) });
          out.push(`deployment.apps/${name ?? "generated"} created`);
          break;
        case "ReplicaSet":
          store.createReplicaSet({ name, image: imageOf(spec), replicas: numOf(dig(spec, ["replicas"]), 1) });
          out.push(`replicaset.apps/${name ?? "generated"} created`);
          break;
        case "StatefulSet":
          store.createStatefulSet({ name, image: imageOf(spec), replicas: numOf(dig(spec, ["replicas"]), 1) });
          out.push(`statefulset.apps/${name ?? "generated"} created`);
          break;
        case "DaemonSet":
          store.createDaemonSet({ name, image: imageOf(spec) });
          out.push(`daemonset.apps/${name ?? "generated"} created`);
          break;
        case "Job":
          store.createJob({ name, image: imageOf(spec), completions: numOf(dig(spec, ["completions"]), 1), parallelism: numOf(dig(spec, ["parallelism"]), 1), backoffLimit: numOf(dig(spec, ["backoffLimit"]), 2) });
          out.push(`job.batch/${name ?? "generated"} created`);
          break;
        case "CronJob":
          store.createCronJob({ name, image: imageOf(dig(spec, ["jobTemplate", "spec"])), schedule: String(dig(spec, ["schedule"]) ?? "*/5 * * * *"), completions: 1, parallelism: 1, backoffLimit: 2 });
          out.push(`cronjob.batch/${name ?? "generated"} created`);
          break;
        case "Service": {
          const ports = dig(spec, ["ports"]) as YamlValue[];
          const p0 = asRecord(Array.isArray(ports) ? ports[0] : undefined);
          const selector = asRecord(dig(spec, ["selector"]));
          store.createService({
            name,
            type: (dig(spec, ["type"]) as "ClusterIP") ?? "ClusterIP",
            selector: Object.fromEntries(Object.entries(selector).map(([k, v]) => [k, String(v)])),
            port: numOf(p0.port, 80),
            targetPort: numOf(p0.targetPort, 80),
          });
          out.push(`service/${name ?? "generated"} created`);
          break;
        }
        case "ConfigMap":
          store.createConfigMap({ name, data: Object.fromEntries(Object.entries(asRecord(doc.data)).map(([k, v]) => [k, String(v)])) });
          out.push(`configmap/${name ?? "generated"} created`);
          break;
        case "Secret":
          store.createSecret({ name, data: Object.fromEntries(Object.entries(asRecord(doc.data)).map(([k, v]) => [k, String(v)])) });
          out.push(`secret/${name ?? "generated"} created`);
          break;
        case "PersistentVolumeClaim":
          store.createPVC({ name, storage: numOf(dig(spec, ["resources", "requests", "storage"]), 5) });
          out.push(`persistentvolumeclaim/${name ?? "generated"} created`);
          break;
        case "PersistentVolume":
          store.createPV({ name, capacity: numOf(dig(spec, ["capacity", "storage"]), 10) });
          out.push(`persistentvolume/${name ?? "generated"} created`);
          break;
        default:
          out.push(`error: unsupported kind "${kind}" for apply.`);
      }
    }
  } finally {
    setCliActive(false);
  }
  return { lines: out };
}

/* ------------------------------------------------------------------ */
/* Verb handlers                                                       */
/* ------------------------------------------------------------------ */

function handleGet(p: Parsed, s: ClusterState): CliResult {
  const [typeToken, name] = p.positional;
  const type = resolveType(typeToken);
  if (!type) {
    // EndpointSlices — derived from Services + live pods (Phase 11).
    if (
      typeToken &&
      ["endpointslices", "endpointslice", "eps"].includes(typeToken.toLowerCase())
    ) {
      const ns = p.namespace ?? s.namespace;
      const slices = s.services
        .filter((svc) => svc.metadata.namespace === ns)
        .map((svc) => computeEndpointSlice(svc, s.pods))
        .filter((sl) => sl.endpoints.length > 0);
      if (slices.length === 0) return { lines: ["No resources found."] };
      return {
        lines: table(
          ["NAME", "SERVICE", "PORTS", "ENDPOINTS", "AGE"],
          slices.map((sl) => [
            sl.name,
            sl.service,
            sl.ports.join(",") || "<none>",
            sl.endpoints.map((e) => e.ip).join(",") || "<none>",
            "—",
          ]),
        ),
      };
    }
    // CRDs and Custom Resources (Phase 10).
    if (typeToken && CRD_ALIASES.has(typeToken.toLowerCase())) {
      if (s.crds.length === 0) return { lines: ["No resources found."] };
      return {
        lines: table(
          ["NAME", "GROUP", "KIND", "SCOPE", "AGE"],
          s.crds.map((c) => [
            c.metadata.name,
            c.spec.group,
            c.spec.names.kind,
            c.spec.scope,
            formatAge(c.createdAt),
          ]),
        ),
      };
    }
    const crd = resolveCRD(typeToken, s);
    if (crd) {
      const ns = p.namespace ?? s.namespace;
      const items = s.customResources.filter(
        (cr) =>
          cr.kind === crd.spec.names.kind &&
          (crd.spec.scope === "Cluster" || cr.metadata.namespace === ns),
      );
      if (name && (p.output === "yaml" || p.output === "json")) {
        const found = items.find((cr) => cr.metadata.name === name);
        if (!found) return { lines: [notFound(crd.spec.names.kind, name)] };
        return {
          lines: (p.output === "yaml" ? toYaml : toJson)(
            crd.spec.names.kind,
            found as unknown as Record<string, unknown>,
          ).split("\n"),
        };
      }
      if (items.length === 0) return { lines: ["No resources found."] };
      const fields = crd.spec.schema.slice(0, 3).map((f) => f.name.toUpperCase());
      return {
        lines: table(
          ["NAME", ...fields, "AGE"],
          items.map((cr) => [
            cr.metadata.name,
            ...crd.spec.schema
              .slice(0, 3)
              .map((f) => String(cr.spec[f.name] ?? "")),
            formatAge(cr.createdAt),
          ]),
        ),
      };
    }
    return { lines: [`error: the server doesn't have a resource type "${typeToken ?? ""}"`] };
  }
  const ns = p.namespace ?? s.namespace;
  const wide = p.output === "wide";

  const canonical = typeof type === "string" ? type : type.canonical;

  // Single object with -o yaml/json.
  if (name && (p.output === "yaml" || p.output === "json")) {
    if (typeof type === "string") {
      if (type === "nodes") {
        const node = s.nodes.find((n) => n.name === name);
        if (!node) return { lines: [notFound("node", name)] };
        return { lines: (p.output === "yaml" ? toYaml : toJson)("Node", node as unknown as Record<string, unknown>).split("\n") };
      }
      if (type === "namespaces") {
        if (!s.namespaces.includes(name)) return { lines: [notFound("namespace", name)] };
        return { lines: (p.output === "yaml" ? toYaml : toJson)("Namespace", { name }).split("\n") };
      }
      return { lines: ["error: -o yaml not supported for events."] };
    }
    const found = findObject(type, s, ns, name);
    if (!found) return { lines: [notFound(type.kind, name)] };
    return { lines: (p.output === "yaml" ? toYaml : toJson)(type.kind, found.obj).split("\n") };
  }

  return { lines: getTable(canonical, s, ns, wide) };
}

function handleDescribe(p: Parsed, s: ClusterState): CliResult {
  const [typeToken, name] = p.positional;
  const type = resolveType(typeToken);
  if (!type) {
    const crd = resolveCRD(typeToken, s);
    if (crd && name) {
      const cr = s.customResources.find(
        (c) => c.kind === crd.spec.names.kind && c.metadata.name === name,
      );
      if (!cr) return { lines: [notFound(crd.spec.names.kind, name)] };
      return {
        lines: toYaml(
          crd.spec.names.kind,
          cr as unknown as Record<string, unknown>,
        ).split("\n"),
      };
    }
    return { lines: [`error: the server doesn't have a resource type "${typeToken ?? ""}"`] };
  }
  if (!name) return { lines: [`error: you must specify a resource name`] };
  const ns = p.namespace ?? s.namespace;

  if (type === "nodes") {
    if (name === CONTROL_PLANE_NODE_NAME)
      return { lines: ["Name:    " + name, "Roles:   control-plane", "Status:  Ready"] };
    const node = s.nodes.find((n) => n.name === name);
    if (!node) return { lines: [notFound("node", name)] };
    return {
      lines: [
        `Name:               ${node.name}`,
        `Roles:              <none>`,
        `Status:             ${node.status}`,
        `Capacity:  cpu ${node.cpuCapacity}, memory ${node.memCapacity}Gi`,
        `Allocated: cpu ${node.cpuUsed}, memory ${node.memUsed}Gi`,
        `Non-terminated Pods: ${node.podIds.length}`,
      ],
    };
  }
  if (typeof type === "string") return { lines: [`error: cannot describe ${type}.`] };

  const found = findObject(type, s, ns, name);
  if (!found) return { lines: [notFound(type.kind, name)] };
  // Describe = YAML manifest for simplicity/consistency with the drawer.
  return { lines: toYaml(type.kind, found.obj).split("\n") };
}

function handleDelete(p: Parsed, s: ClusterState): CliResult {
  const [typeToken, name] = p.positional;
  const type = resolveType(typeToken);
  if (!type) {
    // CRDs and Custom Resources (Phase 10).
    if (typeToken && CRD_ALIASES.has(typeToken.toLowerCase()) && name) {
      const crd = s.crds.find(
        (c) => c.metadata.name === name || c.spec.names.plural === name,
      );
      if (!crd) return { lines: [notFound("CustomResourceDefinition", name)] };
      s.deleteCRD(crd.metadata.uid);
      return { lines: [`customresourcedefinition.apiextensions.k8s.io "${crd.metadata.name}" deleted`] };
    }
    const crd = resolveCRD(typeToken, s);
    if (crd && name) {
      const cr = s.customResources.find(
        (c) => c.kind === crd.spec.names.kind && c.metadata.name === name,
      );
      if (!cr) return { lines: [notFound(crd.spec.names.kind, name)] };
      s.deleteCustomResource(cr.metadata.uid);
      return { lines: [`${crd.spec.names.singular} "${name}" deleted`] };
    }
    return { lines: [`error: the server doesn't have a resource type "${typeToken ?? ""}"`] };
  }
  if (!name) return { lines: [`error: resource(s) were provided, but no name was specified`] };
  const ns = p.namespace ?? s.namespace;

  if (type === "nodes") {
    const node = s.nodes.find((n) => n.name === name);
    if (!node) return { lines: [notFound("node", name)] };
    s.removeNode(node.id);
    return { lines: [`node "${name}" deleted`] };
  }
  if (typeof type === "string") return { lines: [`error: cannot delete ${type} via CLI.`] };

  const found = findObject(type, s, ns, name);
  if (!found) return { lines: [notFound(type.kind, name)] };

  // RBAC deletes carry a cluster flag.
  if (type.canonical === "roles" || type.canonical === "clusterroles") {
    s.deleteRole(found.uid, type.canonical === "clusterroles");
    return { lines: [`${type.kind.toLowerCase()} "${name}" deleted`] };
  }
  if (type.canonical === "rolebindings" || type.canonical === "clusterrolebindings") {
    s.deleteRoleBinding(found.uid, type.canonical === "clusterrolebindings");
    return { lines: [`${type.kind.toLowerCase()} "${name}" deleted`] };
  }

  const deleters: Record<string, (id: string) => void> = {
    pods: s.deletePod,
    deployments: s.deleteDeployment,
    replicasets: s.deleteReplicaSet,
    statefulsets: s.deleteStatefulSet,
    daemonsets: s.deleteDaemonSet,
    jobs: s.deleteJob,
    cronjobs: s.deleteCronJob,
    hpa: s.deleteHPA,
    services: s.deleteService,
    ingresses: s.deleteIngress,
    networkpolicies: s.deleteNetworkPolicy,
    configmaps: s.deleteConfigMap,
    secrets: s.deleteSecret,
    pvc: s.deletePVC,
    pv: s.deletePV,
    serviceaccounts: s.deleteServiceAccount,
    resourcequotas: s.deleteResourceQuota,
    limitranges: s.deleteLimitRange,
    priorityclasses: s.deletePriorityClass,
    poddisruptionbudgets: s.deletePodDisruptionBudget,
    volumesnapshots: s.deleteVolumeSnapshot,
    verticalpodautoscalers: s.deleteVPA,
  };
  deleters[type.canonical]?.(found.uid);
  return { lines: [`${type.kind.toLowerCase()} "${name}" deleted`] };
}

function handleScale(p: Parsed, s: ClusterState): CliResult {
  // supports "scale deployment <name>" or "scale deployment/<name>"
  let typeToken = p.positional[0];
  let name = p.positional[1];
  if (typeToken?.includes("/")) [typeToken, name] = typeToken.split("/");
  const replicas = Number(p.flags["replicas"]);
  const type = resolveType(typeToken);
  if (!type || typeof type === "string" || !name || !Number.isFinite(replicas))
    return { lines: ["error: usage: kubectl scale <deployment|rs|statefulset> <name> --replicas=N"] };
  const ns = p.namespace ?? s.namespace;
  const found = findObject(type, s, ns, name);
  if (!found) return { lines: [notFound(type.kind, name)] };
  if (type.canonical === "deployments") s.scaleDeployment(found.uid, replicas);
  else if (type.canonical === "replicasets") s.scaleReplicaSet(found.uid, replicas);
  else if (type.canonical === "statefulsets") s.scaleStatefulSet(found.uid, replicas);
  else return { lines: [`error: cannot scale ${type.canonical}.`] };
  return { lines: [`${type.kind.toLowerCase()}.apps/${name} scaled`] };
}

function refName(token: string | undefined): string | undefined {
  return token?.includes("/") ? token.split("/")[1] : token;
}

function handleRollout(p: Parsed, s: ClusterState): CliResult {
  const sub = p.positional[0]?.toLowerCase();
  const name = refName(p.positional[1]);
  if (!name) return { lines: ["error: usage: kubectl rollout <status|undo|history|restart> deployment/<name>"] };
  const ns = p.namespace ?? s.namespace;
  const d = s.deployments.find((x) => x.metadata.namespace === ns && x.metadata.name === name);
  if (!d) return { lines: [notFound("deployment", name)] };
  if (sub === "restart") {
    s.rolloutRestart(d.metadata.uid);
    return { lines: [`deployment.apps/${name} restarted`] };
  }
  if (sub === "undo") {
    s.rollbackDeployment(d.metadata.uid);
    return { lines: [`deployment.apps/${name} rolled back`] };
  }
  if (sub === "status")
    return { lines: [d.rollout ? `Waiting for deployment "${name}" rollout to finish...` : `deployment "${name}" successfully rolled out`] };
  if (sub === "history")
    return {
      lines: [
        `deployment.apps/${name}`,
        "REVISION  IMAGE",
        ...d.revisions.map((r) => `${r.revision}         ${r.image}`),
      ],
    };
  return { lines: ["error: usage: kubectl rollout <status|undo|history|restart> deployment/<name>"] };
}

/** cordon / uncordon / drain <node> (Phase 13). */
function handleNodeSchedule(verb: string, p: Parsed, s: ClusterState): CliResult {
  const name = p.positional[0];
  if (!name) return { lines: [`error: usage: kubectl ${verb} <node>`] };
  const node = s.nodes.find((n) => n.name === name);
  if (!node) return { lines: [notFound("node", name)] };
  if (verb === "cordon") {
    s.cordonNode(node.id, true);
    return { lines: [`node/${name} cordoned`] };
  }
  if (verb === "uncordon") {
    s.cordonNode(node.id, false);
    return { lines: [`node/${name} uncordoned`] };
  }
  s.drainNode(node.id);
  return {
    lines: [`node/${name} cordoned`, `evicting pods from node/${name}`, `node/${name} drained`],
  };
}

/** kubectl wait --for=condition=<cond> <type>/<name> (Phase 13). */
function handleWait(p: Parsed, s: ClusterState): CliResult {
  const forArg = p.flags["for"];
  const target = p.positional[0];
  if (!target) return { lines: ["error: usage: kubectl wait --for=condition=Ready pod/<name>"] };
  const [kind, name] = target.includes("/") ? target.split("/") : ["pod", target];
  const ns = p.namespace ?? s.namespace;
  if (kind.startsWith("pod")) {
    const pod = s.pods.find((x) => x.metadata.name === name && x.metadata.namespace === ns);
    if (!pod) return { lines: [notFound("pod", name)] };
    const ready = pod.status.phase === "Running" && pod.status.ready !== false;
    return {
      lines: [
        ready
          ? `pod/${name} condition met (${forArg ?? "condition=Ready"})`
          : `timed out waiting for the condition on pods/${name} (phase ${pod.status.phase})`,
      ],
    };
  }
  return { lines: [`error: waiting on ${kind} not supported`] };
}

function handleApiResources(s: ClusterState): CliResult {
  const rows = RESOURCES.map((r) => [
    r.canonical,
    r.aliases.filter((a) => a !== r.canonical).slice(0, 2).join(",") || "",
    r.kind,
    r.namespaced ? "true" : "false",
  ]);
  const crdRows = s.crds.map((c) => [
    c.spec.names.plural,
    (c.spec.names.shortNames ?? []).join(","),
    c.spec.names.kind,
    String(c.spec.scope === "Namespaced"),
  ]);
  return {
    lines: table(["NAME", "SHORTNAMES", "KIND", "NAMESPACED"], [...rows, ...crdRows]),
  };
}

function handleExplain(p: Parsed): CliResult {
  const token = p.positional[0];
  const type = resolveType(token);
  if (!type || typeof type === "string")
    return { lines: [`error: could not explain "${token ?? ""}"`] };
  return {
    lines: [
      `KIND:     ${type.kind}`,
      `VERSION:  v1`,
      "",
      "DESCRIPTION:",
      `     A ${type.kind} is a ${type.namespaced ? "namespaced" : "cluster-scoped"} kubeSim object.`,
      `     Use 'kubectl get ${type.canonical}' to list, 'describe' for YAML.`,
    ],
  };
}

function handleSet(p: Parsed, s: ClusterState): CliResult {
  // set image deployment/<name> <container>=<image>
  if (p.positional[0]?.toLowerCase() !== "image")
    return { lines: ["error: usage: kubectl set image deployment/<name> <container>=<image>"] };
  const name = refName(p.positional[1]);
  const assignment = p.positional[2] ?? "";
  const image = assignment.includes("=") ? assignment.split("=")[1] : assignment;
  const ns = p.namespace ?? s.namespace;
  const d = s.deployments.find((x) => x.metadata.namespace === ns && x.metadata.name === name);
  if (!d) return { lines: [notFound("deployment", name ?? "")] };
  if (!image) return { lines: ["error: you must specify <container>=<image>"] };
  s.updateDeploymentImage(d.metadata.uid, image);
  return { lines: [`deployment.apps/${name} image updated`] };
}

function handleExpose(p: Parsed, s: ClusterState): CliResult {
  const name = refName(p.positional[0]);
  const ns = p.namespace ?? s.namespace;
  const d = s.deployments.find((x) => x.metadata.namespace === ns && x.metadata.name === name);
  if (!d) return { lines: [notFound("deployment", name ?? "")] };
  const port = Number(p.flags["port"]) || 80;
  const targetPort = Number(p.flags["target-port"]) || port;
  const type = (p.flags["type"] as "ClusterIP") || "ClusterIP";
  s.createService({ name, type, selector: { app: name as string }, port, targetPort });
  return { lines: [`service/${name} exposed`] };
}

function handleLabelAnnotate(p: Parsed, s: ClusterState, annotate: boolean): CliResult {
  const [typeToken, name, ...pairs] = p.positional;
  const type = resolveType(typeToken);
  if (!type || typeof type === "string")
    return { lines: [`error: cannot ${annotate ? "annotate" : "label"} ${typeToken ?? ""}`] };
  if (!name) return { lines: ["error: you must specify a resource name"] };
  const ns = p.namespace ?? s.namespace;
  const found = findObject(type, s, ns, name);
  if (!found) return { lines: [notFound(type.kind, name)] };
  const kv: Record<string, string> = {};
  for (const pair of pairs) {
    const [k, ...rest] = pair.split("=");
    if (k) kv[k] = rest.join("=");
  }
  if (Object.keys(kv).length === 0)
    return { lines: [`error: at least one ${annotate ? "annotation" : "label"} (key=value) required`] };
  s.applyMetaPatch(type.kind, found.uid, annotate ? undefined : kv, annotate ? kv : undefined);
  return { lines: [`${type.kind.toLowerCase()}/${name} ${annotate ? "annotated" : "labeled"}`] };
}

function handleTop(p: Parsed, s: ClusterState): CliResult {
  const what = p.positional[0]?.toLowerCase();
  if (what === "nodes" || what === "node") {
    return {
      lines: table(
        ["NAME", "CPU(cores)", "CPU%", "MEMORY(Gi)", "MEMORY%"],
        [
          [CONTROL_PLANE_NODE_NAME, "0", "0%", "0", "0%"],
          ...s.nodes.map((n) => [
            n.name,
            String(n.cpuUsed),
            `${n.cpuCapacity ? Math.round((n.cpuUsed / n.cpuCapacity) * 100) : 0}%`,
            String(n.memUsed),
            `${n.memCapacity ? Math.round((n.memUsed / n.memCapacity) * 100) : 0}%`,
          ]),
        ],
      ),
    };
  }
  if (what === "pods" || what === "pod") {
    const ns = p.namespace ?? s.namespace;
    const items = s.pods.filter((x) => x.metadata.namespace === ns);
    return {
      lines: table(
        ["NAME", "CPU(cores)", "MEMORY(Mi)"],
        items.map((x) => [x.metadata.name, `${x.status.cpu ?? 5}m`, "32Mi"]),
      ),
    };
  }
  return { lines: ["error: usage: kubectl top nodes | kubectl top pods"] };
}

function handleAuth(p: Parsed, s: ClusterState): CliResult {
  if (p.positional[0]?.toLowerCase() !== "can-i")
    return {
      lines: [
        "error: usage: kubectl auth can-i <verb> <resource> [--as=<user>|--as=system:serviceaccount:<ns>:<sa>]",
      ],
    };
  const verb = p.positional[1];
  const resourceToken = p.positional[2];
  if (!verb || !resourceToken)
    return { lines: ["error: usage: kubectl auth can-i <verb> <resource>"] };
  const resolved = resolveType(resourceToken);
  const resource =
    typeof resolved === "string"
      ? resolved
      : resolved?.canonical ?? resourceToken.toLowerCase();
  const ns = p.namespace ?? s.namespace;

  let subject: SubjectRef | null = null;
  const as = typeof p.flags["as"] === "string" ? (p.flags["as"] as string) : undefined;
  if (as) {
    if (as.startsWith("system:serviceaccount:")) {
      const parts = as.split(":");
      subject = { kind: "ServiceAccount", name: parts[3] ?? "default", namespace: parts[2] ?? ns };
    } else {
      subject = { kind: "User", name: as };
    }
  } else if (s.ui.rbacSubject) {
    subject = s.ui.rbacSubject;
  }
  if (!subject)
    return {
      lines: ["no", "(specify --as=<subject> or pick an 'Inspect as' subject in the UI)"],
    };

  const allowed = canI(
    {
      roles: s.roles,
      clusterRoles: s.clusterRoles,
      roleBindings: s.roleBindings,
      clusterRoleBindings: s.clusterRoleBindings,
    },
    subject,
    verb.toLowerCase(),
    resource,
    ns,
  );
  return { lines: [allowed ? "yes" : "no"] };
}

function handleConfig(p: Parsed): CliResult {
  const sub = p.positional[0]?.toLowerCase();
  const store = useClusterStore.getState();
  if (sub === "get-contexts")
    return {
      lines: table(
        ["CURRENT", "NAME", "CLUSTER", "AUTHINFO"],
        store.clusters.map((c) => [
          c.id === store.activeClusterId ? "*" : "",
          c.name,
          c.name,
          "kubesim-admin",
        ]),
      ),
    };
  if (sub === "use-context") {
    const name = p.positional[1];
    const target = store.clusters.find((c) => c.name === name);
    if (!target) return { lines: [`error: no context exists with the name: "${name ?? ""}"`] };
    store.switchCluster(target.id);
    return { lines: [`Switched to context "${name}".`] };
  }
  if (sub === "current-context") {
    const cur = store.clusters.find((c) => c.id === store.activeClusterId);
    return { lines: [cur?.name ?? "kubesim"] };
  }
  return { lines: ["error: usage: kubectl config <get-contexts|use-context|current-context>"] };
}

/* ------------------------------------------------------------------ */
/* kubesim curl (Phase 3 API-flow trigger)                             */
/* ------------------------------------------------------------------ */

function handleCurl(tokens: string[]): CliResult {
  const args = tokens.slice(2);
  const fromArg = args.find((a) => a.startsWith("--from="));
  const fromPod = fromArg ? fromArg.slice(7) : undefined;
  const target = args.find((a) => !a.startsWith("--"));
  if (!target)
    return {
      lines: [
        "usage: kubesim curl [--from=<pod>] svc/<name> | <svc>.<ns>.svc.cluster.local | <host><path>",
      ],
    };
  const store = useClusterStore.getState();
  const flow = useFlowStore.getState();
  const ns = store.namespace;

  // Pod-to-pod traffic: evaluate NetworkPolicies in both directions (Phase 11).
  if (fromPod) {
    const src = store.pods.find(
      (p) => p.metadata.name === fromPod && p.metadata.namespace === ns,
    );
    if (!src) return { lines: [`Error: source pod "${fromPod}" not found in ${ns}`] };
    const host = target.replace(/^svc\//, "").replace(/\/.*$/, "");
    const dns = resolveServiceDns(host, store.services, ns);
    if (!dns) return { lines: [`curl: (6) could not resolve host: ${host}`] };
    const eps = computeEndpoints(dns.service, store.pods);
    if (eps.length === 0)
      return { lines: [`> ${host} resolved to ${dns.fqdn} — 503 (no ready endpoints)`] };
    const dst = eps[0];
    const decision = evaluatePodToPod(src, dst, store.networkPolicies);
    store.pushEvent({
      type: decision.blocked ? "Warning" : "Normal",
      reason: decision.blocked ? "PodTrafficBlocked" : "PodTrafficAllowed",
      message: decision.blocked
        ? `Pod ${src.metadata.name} → ${dst.metadata.name} blocked by NetworkPolicy ${decision.policyName}.`
        : `Pod ${src.metadata.name} → ${dst.metadata.name} allowed.`,
      involvedObject: { kind: "Pod", name: src.metadata.name },
    });
    return {
      lines: decision.blocked
        ? [
            `> DNS: ${host} → ${dns.fqdn} (${dns.service.status.clusterIP})`,
            `curl: (28) connection timed out — blocked by NetworkPolicy "${decision.policyName}"`,
          ]
        : [
            `> DNS: ${host} → ${dns.fqdn} (${dns.service.status.clusterIP})`,
            `> ${src.metadata.name} → ${dst.metadata.name} (${dst.status.podIP}) — 200 OK`,
          ],
    };
  }

  if (target.startsWith("svc/")) {
    const name = target.slice(4);
    const svc = store.services.find((sv) => sv.metadata.name === name);
    if (!svc) return { lines: [`Error: service "${name}" not found`] };
    flow.requestService(svc.metadata.uid);
    return { lines: [`> curl svc/${name} — routing (watch the canvas)…`] };
  }
  const stripped = target.replace(/^https?:\/\//, "");
  const slash = stripped.indexOf("/");
  const host = slash >= 0 ? stripped.slice(0, slash) : stripped;
  const path = slash >= 0 ? stripped.slice(slash) : "/";
  for (const ing of store.ingresses) {
    const idx = ing.spec.rules.findIndex((r) => r.host === host && path.startsWith(r.path));
    if (idx >= 0) {
      flow.requestIngressRule(ing.metadata.uid, idx);
      return { lines: [`> curl http://${host}${path} — via Ingress ${ing.metadata.name} (watch the canvas)…`] };
    }
  }
  // Cluster-DNS service resolution (Phase 11).
  const dnsHost = host.replace(/:\d+$/, "");
  const dns = resolveServiceDns(dnsHost, store.services, ns);
  if (dns) {
    flow.requestService(dns.service.metadata.uid);
    return {
      lines: [
        `> DNS: ${dnsHost} → ${dns.fqdn} (${dns.service.status.clusterIP ?? "ClusterIP"})`,
        `> curl ${host}${path} — routing via svc/${dns.service.metadata.name} (watch the canvas)…`,
      ],
    };
  }
  return { lines: [`curl: (6) could not resolve host: ${host}`] };
}

/* ------------------------------------------------------------------ */
/* Help + main dispatch                                                */
/* ------------------------------------------------------------------ */

const HELP_LINES = [
  "kubeSim terminal — kubectl-style commands:",
  "  kubectl get <type> [name] [-n ns] [-o yaml|json|wide]",
  "  kubectl describe <type> <name> [-n ns]",
  "  kubectl create|apply -f   (then paste a YAML manifest)",
  "  kubectl delete <type> <name>",
  "  kubectl scale <deploy|rs|sts> <name> --replicas=N",
  "  kubectl set image deployment/<name> <container>=<image>",
  "  kubectl rollout status|undo|history deployment/<name>",
  "  kubectl expose deployment/<name> --port=P --target-port=TP --type=T",
  "  kubectl label|annotate <type> <name> key=value",
  "  kubectl logs <pod> [-f]   ·   kubectl exec <pod> -- <cmd>",
  "  kubectl top nodes|pods   ·   kubectl get events",
  "  kubectl auth can-i <verb> <resource> [--as=<subject>]",
  "  kubectl config get-contexts|use-context",
  "  kubectl get crds|<crd-plural>   ·   kubectl get endpointslices",
  "  kubesim curl [--from=<pod>] <svc>.<ns>.svc.cluster.local | svc/<name> | <host><path>",
  "  clear · help",
];

export function runKubectl(rawInput: string): CliResult {
  const input = rawInput.trim();
  if (input.length === 0) return { lines: [] };
  const tokens = input.split(/\s+/);
  const cmd = tokens[0].toLowerCase();

  if (cmd === "clear" || cmd === "cls") return { lines: [], clear: true };
  if (cmd === "help") return { lines: HELP_LINES };
  if (cmd === "kubesim") {
    if (tokens[1]?.toLowerCase() === "curl") return handleCurl(tokens);
    return { lines: ["usage: kubesim curl svc/<name> | kubesim curl <host><path>"] };
  }
  if (cmd !== "kubectl")
    return { lines: [`kubesim: command not found: ${cmd}. Type 'help'.`] };

  const verb = tokens[1]?.toLowerCase();
  const p = parseArgs(tokens.slice(2));
  const s = useClusterStore.getState();

  setCliActive(true);
  try {
    switch (verb) {
      case "get":
        return handleGet(p, s);
      case "describe":
        return handleDescribe(p, s);
      case "delete":
        return handleDelete(p, s);
      case "scale":
        return handleScale(p, s);
      case "set":
        return handleSet(p, s);
      case "rollout":
        return handleRollout(p, s);
      case "cordon":
        return handleNodeSchedule("cordon", p, s);
      case "uncordon":
        return handleNodeSchedule("uncordon", p, s);
      case "drain":
        return handleNodeSchedule("drain", p, s);
      case "wait":
        return handleWait(p, s);
      case "api-resources":
        return handleApiResources(s);
      case "explain":
        return handleExplain(p);
      case "expose":
        return handleExpose(p, s);
      case "label":
        return handleLabelAnnotate(p, s, false);
      case "annotate":
        return handleLabelAnnotate(p, s, true);
      case "top":
        return handleTop(p, s);
      case "config":
        return handleConfig(p);
      case "auth":
        return handleAuth(p, s);
      case "logs": {
        const name = p.positional[0];
        const pod = s.pods.find((x) => x.metadata.name === name);
        if (!pod) return { lines: [notFound("pod", name ?? "")] };
        return { lines: generateLogs(pod) };
      }
      case "exec": {
        const name = p.positional[0];
        const pod = s.pods.find((x) => x.metadata.name === name);
        if (!pod) return { lines: [notFound("pod", name ?? "")] };
        const command = p.execArgs?.join(" ") ?? "";
        if (!command) return { lines: ["error: usage: kubectl exec <pod> -- <cmd>"] };
        return { lines: simulateExec(pod, command) };
      }
      case "create":
      case "apply":
        if (p.flags["f"] || p.positional.includes("-f"))
          return {
            lines: [
              "Paste a YAML manifest to apply — press Ctrl/⌘+V in the terminal to open the apply dialog.",
            ],
          };
        return { lines: [`error: unknown ${verb} usage. Try: kubectl ${verb} -f`] };
      default:
        return { lines: [`error: unknown command "kubectl ${verb ?? ""}". Type 'help'.`] };
    }
  } finally {
    setCliActive(false);
  }
}

/* ------------------------------------------------------------------ */
/* Tab-completion                                                      */
/* ------------------------------------------------------------------ */

const VERBS = [
  "get", "describe", "delete", "scale", "set", "rollout", "expose", "label",
  "annotate", "logs", "exec", "top", "config", "auth", "create", "apply",
];

export function getCompletions(input: string): string[] {
  const trailingSpace = input.endsWith(" ");
  const tokens = input.trim().split(/\s+/).filter(Boolean);
  const s = useClusterStore.getState();

  // Completing the very first token.
  if (tokens.length <= 1 && !trailingSpace) {
    const prefix = tokens[0] ?? "";
    return ["kubectl", "kubesim", "help", "clear"].filter((c) => c.startsWith(prefix));
  }

  if (tokens[0] !== "kubectl") return [];

  const idx = trailingSpace ? tokens.length : tokens.length - 1;
  const current = trailingSpace ? "" : tokens[tokens.length - 1];

  // Completing the verb.
  if (idx === 1) return VERBS.filter((v) => v.startsWith(current));

  // Completing the resource type.
  if (idx === 2) {
    const typeAliases = [
      ...RESOURCES.flatMap((r) => r.aliases),
      "nodes", "namespaces", "events",
    ];
    return Array.from(new Set(typeAliases)).filter((a) => a.startsWith(current)).sort();
  }

  // Completing an object name.
  if (idx === 3) {
    const type = resolveType(tokens[2]);
    if (!type) return [];
    const ns = s.namespace;
    let names: string[] = [];
    if (type === "nodes") names = [CONTROL_PLANE_NODE_NAME, ...s.nodes.map((n) => n.name)];
    else if (type === "namespaces") names = s.namespaces;
    else if (type !== "events")
      names = type.list(s).filter((o) => !type.namespaced || o.metadata.namespace === ns).map((o) => o.metadata.name);
    return names.filter((n) => n.startsWith(current));
  }

  return [];
}

export { SPECIAL_TYPES };
