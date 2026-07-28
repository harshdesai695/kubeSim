/**
 * Minimal hardcoded kubectl handler for Phase 1.
 *
 * Only `kubectl get nodes` and `kubectl describe node <name>` are supported
 * (plus `help` / `clear`). The full command grammar/parser arrives in Phase 6.
 * Output is formatted to resemble real kubectl.
 */

import { useClusterStore } from "@/store/useClusterStore";
import { useFlowStore } from "@/store/useFlowStore";
import type {
  ConfigMap,
  Deployment,
  Ingress,
  NetworkPolicy,
  PersistentVolume,
  PersistentVolumeClaim,
  Pod,
  ReplicaSet,
  Secret,
  Service,
  WorkerNode,
} from "@/store/types";
import { formatAge } from "./time";
import { generateLogs, simulateExec } from "./logs";
import { computeEndpoints } from "./network";

/** kubeSim boots with a single control-plane node (shown in `get nodes`). */
const CLUSTER_STARTED_AT = Date.now();
const CONTROL_PLANE_NODE_NAME = "kubesim-control-plane";

export interface CliResult {
  /** Lines to print below the echoed command. */
  lines: string[];
  /** When true, the terminal should clear its scrollback. */
  clear?: boolean;
}

function pad(text: string, width: number): string {
  return text.length >= width ? text : text + " ".repeat(width - text.length);
}

function getNodesTable(nodes: WorkerNode[]): string[] {
  const header = pad("NAME", 24) + pad("STATUS", 12) + pad("ROLES", 18) + "AGE";
  const rows: string[] = [header];

  // Control-plane node first (fixed, always Ready).
  rows.push(
    pad(CONTROL_PLANE_NODE_NAME, 24) +
      pad("Ready", 12) +
      pad("control-plane", 18) +
      formatAge(CLUSTER_STARTED_AT),
  );

  for (const n of nodes) {
    rows.push(
      pad(n.name, 24) +
        pad(n.status, 12) +
        pad("<none>", 18) +
        formatAge(n.createdAt),
    );
  }
  return rows;
}

function describeControlPlane(): string[] {
  return [
    `Name:               ${CONTROL_PLANE_NODE_NAME}`,
    `Roles:              control-plane`,
    `Labels:             kubernetes.io/hostname=${CONTROL_PLANE_NODE_NAME}`,
    `                    node-role.kubernetes.io/control-plane=`,
    `Taints:             node-role.kubernetes.io/control-plane:NoSchedule`,
    `Unschedulable:      false`,
    `Status:             Ready`,
    `Capacity:`,
    `  cpu:                4`,
    `  memory:             8Gi`,
    `Allocatable:`,
    `  cpu:                4`,
    `  memory:             8Gi`,
    `Non-terminated Pods: (0 in total)`,
    `Events:              <none>`,
  ];
}

function describeNode(node: WorkerNode): string[] {
  const labelEntries = Object.entries(node.labels);
  const labelLines =
    labelEntries.length === 0
      ? [`Labels:             <none>`]
      : labelEntries.map(([k, v], i) => {
          const text = v ? `${k}=${v}` : `${k}=`;
          return i === 0
            ? `Labels:             ${text}`
            : `                    ${text}`;
        });

  const taintLines =
    node.taints.length === 0
      ? [`Taints:             <none>`]
      : node.taints.map((t, i) => {
          const text = `${t.key}${t.value ? "=" + t.value : ""}:${t.effect}`;
          return i === 0
            ? `Taints:             ${text}`
            : `                    ${text}`;
        });

  const cpuPct = node.cpuCapacity
    ? Math.round((node.cpuUsed / node.cpuCapacity) * 100)
    : 0;
  const memPct = node.memCapacity
    ? Math.round((node.memUsed / node.memCapacity) * 100)
    : 0;

  return [
    `Name:               ${node.name}`,
    `Roles:              <none>`,
    ...labelLines,
    ...taintLines,
    `Unschedulable:      ${node.draining ? "true" : "false"}`,
    `Status:             ${node.status}`,
    `Capacity:`,
    `  cpu:                ${node.cpuCapacity}`,
    `  memory:             ${node.memCapacity}Gi`,
    `Allocatable:`,
    `  cpu:                ${node.cpuCapacity}`,
    `  memory:             ${node.memCapacity}Gi`,
    `Allocated resources:`,
    `  cpu:                ${node.cpuUsed} (${cpuPct}%)`,
    `  memory:             ${node.memUsed}Gi (${memPct}%)`,
    `Non-terminated Pods: (${node.podIds.length} in total)`,
    `Age:                ${formatAge(node.createdAt)}`,
    `Events:              <none>`,
  ];
}

const HELP_LINES = [
  "kubeSim terminal — supported commands:",
  "  kubectl get nodes|pods|deployments|replicasets|services|ingress|netpol",
  "  kubectl get configmaps|secrets|pv|pvc|namespaces",
  "  kubectl describe node <name>",
  "  kubectl scale deployment|rs <name> --replicas=N",
  "  kubectl rollout undo deployment <name>",
  "  kubectl logs <pod>   |   kubectl exec <pod> -- <cmd>",
  "  kubectl delete pod <name>",
  "  kubesim curl svc/<name>   |   kubesim curl <host><path>",
  "  clear | help",
];

function padCols(cols: string[], widths: number[]): string {
  return cols.map((c, i) => (i === cols.length - 1 ? c : pad(c, widths[i]))).join("");
}

function getPodsTable(pods: Pod[]): string[] {
  if (pods.length === 0) return ["No resources found."];
  const w = [34, 8, 20, 11, 10];
  const rows = [padCols(["NAME", "READY", "STATUS", "RESTARTS", "AGE"], w)];
  for (const p of pods) {
    const running = p.spec.containers.filter((c) => c.state === "Running").length;
    rows.push(
      padCols(
        [
          p.metadata.name,
          `${running}/${p.spec.containers.length}`,
          p.status.phase,
          String(p.status.restartCount),
          formatAge(p.createdAt),
        ],
        w,
      ),
    );
  }
  return rows;
}

function getDeploymentsTable(deployments: Deployment[]): string[] {
  if (deployments.length === 0) return ["No resources found."];
  const w = [28, 10, 12, 12, 10];
  const rows = [padCols(["NAME", "READY", "UP-TO-DATE", "AVAILABLE", "AGE"], w)];
  for (const d of deployments) {
    rows.push(
      padCols(
        [
          d.metadata.name,
          `${d.status.readyReplicas}/${d.spec.replicas}`,
          String(d.rollout ? d.status.readyReplicas : d.spec.replicas),
          String(d.status.readyReplicas),
          formatAge(d.createdAt),
        ],
        w,
      ),
    );
  }
  return rows;
}

function getReplicaSetsTable(replicaSets: ReplicaSet[]): string[] {
  if (replicaSets.length === 0) return ["No resources found."];
  const w = [30, 10, 10, 10, 10];
  const rows = [padCols(["NAME", "DESIRED", "CURRENT", "READY", "AGE"], w)];
  for (const rs of replicaSets) {
    rows.push(
      padCols(
        [
          rs.metadata.name,
          String(rs.spec.replicas),
          String(rs.status.replicas),
          String(rs.status.readyReplicas),
          formatAge(rs.createdAt),
        ],
        w,
      ),
    );
  }
  return rows;
}

function parseReplicasFlag(tokens: string[]): number | undefined {
  const flag = tokens.find((t) => t.startsWith("--replicas"));
  if (!flag) return undefined;
  const eq = flag.includes("=") ? flag.split("=")[1] : undefined;
  const n = Number(eq);
  return Number.isFinite(n) ? n : undefined;
}

function getServicesTable(services: Service[], pods: Pod[]): string[] {
  if (services.length === 0) return ["No resources found."];
  const w = [22, 14, 16, 16, 12];
  const rows = [
    padCols(["NAME", "TYPE", "CLUSTER-IP", "EXTERNAL-IP", "PORT(S)"], w),
  ];
  for (const s of services) {
    const ext =
      s.spec.type === "LoadBalancer"
        ? s.status.externalIP ?? "<pending>"
        : s.spec.type === "ExternalName"
          ? s.spec.externalName ?? "-"
          : "<none>";
    const eps = computeEndpoints(s, pods).length;
    rows.push(
      padCols(
        [
          s.metadata.name,
          s.spec.type,
          s.status.clusterIP ?? "<none>",
          ext,
          `${s.spec.ports[0]?.port}/TCP (${eps} eps)`,
        ],
        w,
      ),
    );
  }
  return rows;
}

function getIngressTable(ingresses: Ingress[]): string[] {
  if (ingresses.length === 0) return ["No resources found."];
  const w = [22, 22, 14, 22];
  const rows = [padCols(["NAME", "HOST", "PATH", "SERVICE"], w)];
  for (const ing of ingresses) {
    for (const rule of ing.spec.rules) {
      rows.push(
        padCols(
          [ing.metadata.name, rule.host, rule.path, `${rule.serviceName}:${rule.servicePort}`],
          w,
        ),
      );
    }
  }
  return rows;
}

function getNetpolTable(policies: NetworkPolicy[]): string[] {
  if (policies.length === 0) return ["No resources found."];
  const w = [26, 26, 14];
  const rows = [padCols(["NAME", "POD-SELECTOR", "POLICY"], w)];
  for (const np of policies) {
    const sel =
      Object.entries(np.spec.podSelector)
        .map(([k, v]) => `${k}=${v}`)
        .join(",") || "<all>";
    rows.push(
      padCols(
        [np.metadata.name, sel, np.spec.allowAll ? "allow-all" : "deny"],
        w,
      ),
    );
  }
  return rows;
}

function getConfigMapsTable(configMaps: ConfigMap[]): string[] {
  if (configMaps.length === 0) return ["No resources found."];
  const w = [30, 10, 12];
  const rows = [padCols(["NAME", "DATA", "AGE"], w)];
  for (const cm of configMaps) {
    rows.push(
      padCols(
        [cm.metadata.name, String(Object.keys(cm.data).length), formatAge(cm.createdAt)],
        w,
      ),
    );
  }
  return rows;
}

function getSecretsTable(secrets: Secret[]): string[] {
  if (secrets.length === 0) return ["No resources found."];
  const w = [26, 28, 8];
  const rows = [padCols(["NAME", "TYPE", "DATA"], w)];
  for (const s of secrets) {
    rows.push(
      padCols([s.metadata.name, s.type, String(Object.keys(s.data).length)], w),
    );
  }
  return rows;
}

function getPVTable(pvs: PersistentVolume[]): string[] {
  if (pvs.length === 0) return ["No resources found."];
  const w = [22, 12, 14, 16];
  const rows = [padCols(["NAME", "CAPACITY", "STATUS", "STORAGECLASS"], w)];
  for (const pv of pvs) {
    rows.push(
      padCols(
        [
          pv.metadata.name,
          `${pv.spec.capacity}Gi`,
          pv.status.phase,
          pv.spec.storageClassName ?? "-",
        ],
        w,
      ),
    );
  }
  return rows;
}

function getPVCTable(pvcs: PersistentVolumeClaim[]): string[] {
  if (pvcs.length === 0) return ["No resources found."];
  const w = [22, 12, 12, 18];
  const rows = [padCols(["NAME", "STATUS", "CAPACITY", "VOLUME"], w)];
  for (const c of pvcs) {
    rows.push(
      padCols(
        [
          c.metadata.name,
          c.status.phase,
          `${c.spec.storage}Gi`,
          c.status.volumeName ?? "-",
        ],
        w,
      ),
    );
  }
  return rows;
}

function getNamespacesTable(namespaces: string[]): string[] {
  const w = [28, 10];
  const rows = [padCols(["NAME", "STATUS"], w)];
  for (const n of namespaces) rows.push(padCols([n, "Active"], w));
  return rows;
}

function handleCurl(tokens: string[]): CliResult {
  const target = tokens[2];
  if (!target)
    return {
      lines: [
        "usage: kubesim curl svc/<name>  |  kubesim curl <host><path>",
      ],
    };
  const store = useClusterStore.getState();
  const flow = useFlowStore.getState();

  if (target.startsWith("svc/")) {
    const name = target.slice(4);
    const svc = store.services.find((s) => s.metadata.name === name);
    if (!svc) return { lines: [`Error: service "${name}" not found`] };
    flow.requestService(svc.metadata.uid);
    return { lines: [`> curl svc/${name} — routing (watch the canvas)…`] };
  }

  const stripped = target.replace(/^https?:\/\//, "");
  const slash = stripped.indexOf("/");
  const host = slash >= 0 ? stripped.slice(0, slash) : stripped;
  const path = slash >= 0 ? stripped.slice(slash) : "/";
  for (const ing of store.ingresses) {
    const idx = ing.spec.rules.findIndex(
      (r) => r.host === host && path.startsWith(r.path),
    );
    if (idx >= 0) {
      flow.requestIngressRule(ing.metadata.uid, idx);
      return {
        lines: [
          `> curl http://${host}${path} — via Ingress ${ing.metadata.name} (watch the canvas)…`,
        ],
      };
    }
  }
  return { lines: [`Error: no Ingress rule matches ${host}${path}`] };
}

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

  if (cmd !== "kubectl") {
    return {
      lines: [`kubesim: command not found: ${cmd}. Type 'help' for options.`],
    };
  }

  const verb = tokens[1]?.toLowerCase();
  const resource = tokens[2]?.toLowerCase();
  const store = useClusterStore.getState();
  const nodes = store.nodes;

  const isNode = (r?: string) => r === "nodes" || r === "node" || r === "no";
  const isPod = (r?: string) => r === "pods" || r === "pod" || r === "po";
  const isDeploy = (r?: string) =>
    r === "deployments" || r === "deployment" || r === "deploy";
  const isRs = (r?: string) =>
    r === "replicasets" || r === "replicaset" || r === "rs";
  const isSvc = (r?: string) =>
    r === "services" || r === "service" || r === "svc";
  const isIng = (r?: string) =>
    r === "ingresses" || r === "ingress" || r === "ing";
  const isNetpol = (r?: string) =>
    r === "networkpolicies" || r === "networkpolicy" || r === "netpol";
  const isCm = (r?: string) =>
    r === "configmaps" || r === "configmap" || r === "cm";
  const isSecret = (r?: string) => r === "secrets" || r === "secret";
  const isPV = (r?: string) =>
    r === "persistentvolumes" || r === "pv" || r === "pvs";
  const isPVC = (r?: string) =>
    r === "persistentvolumeclaims" || r === "pvc" || r === "pvcs";
  const isNs = (r?: string) =>
    r === "namespaces" || r === "namespace" || r === "ns";

  const ns = store.namespace;
  const inNsList = <T extends { metadata: { namespace: string } }>(arr: T[]) =>
    arr.filter((o) => o.metadata.namespace === ns);

  /* ---- get ---- */
  if (verb === "get") {
    if (isNode(resource)) return { lines: getNodesTable(nodes) };
    if (isPod(resource)) return { lines: getPodsTable(inNsList(store.pods)) };
    if (isDeploy(resource))
      return { lines: getDeploymentsTable(inNsList(store.deployments)) };
    if (isRs(resource))
      return { lines: getReplicaSetsTable(inNsList(store.replicaSets)) };
    if (isSvc(resource))
      return { lines: getServicesTable(inNsList(store.services), store.pods) };
    if (isIng(resource))
      return { lines: getIngressTable(inNsList(store.ingresses)) };
    if (isNetpol(resource))
      return { lines: getNetpolTable(inNsList(store.networkPolicies)) };
    if (isCm(resource))
      return { lines: getConfigMapsTable(inNsList(store.configMaps)) };
    if (isSecret(resource))
      return { lines: getSecretsTable(inNsList(store.secrets)) };
    if (isPVC(resource))
      return {
        lines: getPVCTable(inNsList(store.persistentVolumeClaims)),
      };
    if (isPV(resource)) return { lines: getPVTable(store.persistentVolumes) };
    if (isNs(resource)) return { lines: getNamespacesTable(store.namespaces) };
    if (resource === "all")
      return {
        lines: [
          "== Deployments ==",
          ...getDeploymentsTable(inNsList(store.deployments)),
          "",
          "== Services ==",
          ...getServicesTable(inNsList(store.services), store.pods),
          "",
          "== Pods ==",
          ...getPodsTable(inNsList(store.pods)),
        ],
      };
    return { lines: [`error: unknown resource "${resource ?? ""}".`] };
  }

  /* ---- describe node ---- */
  if (verb === "describe" && isNode(resource)) {
    const name = tokens[3];
    if (!name)
      return {
        lines: ["error: you must specify a node name: kubectl describe node <name>"],
      };
    if (name === CONTROL_PLANE_NODE_NAME)
      return { lines: describeControlPlane() };
    const node = nodes.find((n) => n.name === name);
    if (!node)
      return { lines: [`Error from server (NotFound): nodes "${name}" not found`] };
    return { lines: describeNode(node) };
  }

  /* ---- scale ---- */
  if (verb === "scale") {
    const name = tokens[3];
    const replicas = parseReplicasFlag(tokens);
    if (!name || replicas === undefined)
      return {
        lines: [
          "error: usage: kubectl scale deployment|rs <name> --replicas=N",
        ],
      };
    if (isDeploy(resource)) {
      const d = store.deployments.find((x) => x.metadata.name === name);
      if (!d)
        return { lines: [`Error from server (NotFound): deployments "${name}" not found`] };
      store.scaleDeployment(d.metadata.uid, replicas);
      return { lines: [`deployment.apps/${name} scaled`] };
    }
    if (isRs(resource)) {
      const rs = store.replicaSets.find((x) => x.metadata.name === name);
      if (!rs)
        return { lines: [`Error from server (NotFound): replicasets "${name}" not found`] };
      store.scaleReplicaSet(rs.metadata.uid, replicas);
      return { lines: [`replicaset.apps/${name} scaled`] };
    }
    return { lines: [`error: cannot scale resource "${resource ?? ""}".`] };
  }

  /* ---- rollout ---- */
  if (verb === "rollout") {
    const sub = tokens[2]?.toLowerCase();
    const name = tokens[4];
    if (sub === "undo" && isDeploy(tokens[3]?.toLowerCase())) {
      const d = store.deployments.find((x) => x.metadata.name === name);
      if (!d)
        return { lines: [`Error from server (NotFound): deployments "${name}" not found`] };
      store.rollbackDeployment(d.metadata.uid);
      return { lines: [`deployment.apps/${name} rolled back`] };
    }
    if (sub === "status" && isDeploy(tokens[3]?.toLowerCase())) {
      const d = store.deployments.find((x) => x.metadata.name === name);
      if (!d)
        return { lines: [`Error from server (NotFound): deployments "${name}" not found`] };
      return {
        lines: [
          d.rollout
            ? `Waiting for deployment "${name}" rollout to finish...`
            : `deployment "${name}" successfully rolled out`,
        ],
      };
    }
    return { lines: ["error: usage: kubectl rollout undo deployment <name>"] };
  }

  /* ---- logs ---- */
  if (verb === "logs") {
    const name = tokens[2];
    const pod = store.pods.find((p) => p.metadata.name === name);
    if (!pod)
      return { lines: [`Error from server (NotFound): pods "${name ?? ""}" not found`] };
    return { lines: generateLogs(pod) };
  }

  /* ---- exec ---- */
  if (verb === "exec") {
    const name = tokens[2];
    const pod = store.pods.find((p) => p.metadata.name === name);
    if (!pod)
      return { lines: [`Error from server (NotFound): pods "${name ?? ""}" not found`] };
    const dashIdx = tokens.indexOf("--");
    const command =
      dashIdx >= 0 ? tokens.slice(dashIdx + 1).join(" ") : "";
    if (!command)
      return { lines: ["error: usage: kubectl exec <pod> -- <cmd>"] };
    return { lines: simulateExec(pod, command) };
  }

  /* ---- delete pod ---- */
  if (verb === "delete" && isPod(resource)) {
    const name = tokens[3];
    const pod = store.pods.find((p) => p.metadata.name === name);
    if (!pod)
      return { lines: [`Error from server (NotFound): pods "${name ?? ""}" not found`] };
    store.deletePod(pod.metadata.uid);
    return { lines: [`pod "${name}" deleted`] };
  }

  return {
    lines: [
      `error: unsupported command: "${input}". Type 'help' for options.`,
    ],
  };
}
