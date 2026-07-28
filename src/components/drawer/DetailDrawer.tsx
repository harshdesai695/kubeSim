"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import Editor from "@monaco-editor/react";
import { Eye, EyeOff, RefreshCw, Send, Terminal, X, Zap } from "lucide-react";
import { useShallow } from "zustand/react/shallow";
import { useClusterStore } from "@/store/useClusterStore";
import { useFlowStore } from "@/store/useFlowStore";
import type {
  ConfigMap,
  CronJob,
  DaemonSet,
  Deployment,
  HorizontalPodAutoscaler,
  Ingress,
  Job,
  NetworkPolicy,
  ObjectMeta,
  PersistentVolume,
  PersistentVolumeClaim,
  Pod,
  ReplicaSet,
  Secret,
  Service,
  StatefulSet,
  WorkerNode,
} from "@/store/types";
import { getControlPlaneComponent } from "@/lib/controlPlane";
import { formatAge } from "@/lib/time";
import { generateLogs, simulateExec } from "@/lib/logs";
import { computeEndpoints } from "@/lib/network";
import { toBase64 } from "@/lib/storage";
import { describeSchedule } from "@/lib/cron";
import { phaseDotClass, phaseTextClass } from "@/lib/status";
import { Gauge } from "@/components/canvas/Gauge";

/**
 * DetailDrawer — right-hand slide-in inspector.
 *
 * Renders real content per selected kind: Worker Node, control-plane
 * component, Pod (with logs + exec), ReplicaSet, and Deployment (with revision
 * history). Everything is inspectable (reference doc §9).
 */
export function DetailDrawer() {
  const open = useClusterStore((s) => s.ui.drawerOpen);
  const selected = useClusterStore((s) => s.ui.selected);
  const nodes = useClusterStore((s) => s.nodes);
  const pods = useClusterStore((s) => s.pods);
  const replicaSets = useClusterStore((s) => s.replicaSets);
  const deployments = useClusterStore((s) => s.deployments);
  const services = useClusterStore((s) => s.services);
  const ingresses = useClusterStore((s) => s.ingresses);
  const networkPolicies = useClusterStore((s) => s.networkPolicies);
  const configMaps = useClusterStore((s) => s.configMaps);
  const secrets = useClusterStore((s) => s.secrets);
  const persistentVolumes = useClusterStore((s) => s.persistentVolumes);
  const persistentVolumeClaims = useClusterStore(
    (s) => s.persistentVolumeClaims,
  );
  const statefulSets = useClusterStore((s) => s.statefulSets);
  const daemonSets = useClusterStore((s) => s.daemonSets);
  const jobs = useClusterStore((s) => s.jobs);
  const cronJobs = useClusterStore((s) => s.cronJobs);
  const hpas = useClusterStore((s) => s.hpas);
  const closeDrawer = useClusterStore((s) => s.closeDrawer);

  const node =
    selected?.kind === "Node"
      ? nodes.find((n) => n.id === selected.id || n.name === selected.name)
      : undefined;
  const pod =
    selected?.kind === "Pod"
      ? pods.find((p) => p.metadata.uid === selected.id)
      : undefined;
  const rs =
    selected?.kind === "ReplicaSet"
      ? replicaSets.find((r) => r.metadata.uid === selected.id)
      : undefined;
  const deployment =
    selected?.kind === "Deployment"
      ? deployments.find((d) => d.metadata.uid === selected.id)
      : undefined;
  const service =
    selected?.kind === "Service"
      ? services.find((s) => s.metadata.uid === selected.id)
      : undefined;
  const ingress =
    selected?.kind === "Ingress"
      ? ingresses.find((i) => i.metadata.uid === selected.id)
      : undefined;
  const networkPolicy =
    selected?.kind === "NetworkPolicy"
      ? networkPolicies.find((n) => n.metadata.uid === selected.id)
      : undefined;
  const configMap =
    selected?.kind === "ConfigMap"
      ? configMaps.find((c) => c.metadata.uid === selected.id)
      : undefined;
  const secret =
    selected?.kind === "Secret"
      ? secrets.find((c) => c.metadata.uid === selected.id)
      : undefined;
  const pv =
    selected?.kind === "PersistentVolume"
      ? persistentVolumes.find((p) => p.metadata.uid === selected.id)
      : undefined;
  const pvc =
    selected?.kind === "PersistentVolumeClaim"
      ? persistentVolumeClaims.find((p) => p.metadata.uid === selected.id)
      : undefined;
  const statefulSet =
    selected?.kind === "StatefulSet"
      ? statefulSets.find((x) => x.metadata.uid === selected.id)
      : undefined;
  const daemonSet =
    selected?.kind === "DaemonSet"
      ? daemonSets.find((x) => x.metadata.uid === selected.id)
      : undefined;
  const job =
    selected?.kind === "Job"
      ? jobs.find((x) => x.metadata.uid === selected.id)
      : undefined;
  const cronJob =
    selected?.kind === "CronJob"
      ? cronJobs.find((x) => x.metadata.uid === selected.id)
      : undefined;
  const hpa =
    selected?.kind === "HorizontalPodAutoscaler"
      ? hpas.find((x) => x.metadata.uid === selected.id)
      : undefined;
  const cp = selected ? getControlPlaneComponent(selected.kind) : undefined;

  const activeMeta: ObjectMeta | undefined =
    pod?.metadata ??
    rs?.metadata ??
    deployment?.metadata ??
    statefulSet?.metadata ??
    daemonSet?.metadata ??
    job?.metadata ??
    cronJob?.metadata ??
    hpa?.metadata ??
    service?.metadata ??
    ingress?.metadata ??
    networkPolicy?.metadata ??
    configMap?.metadata ??
    secret?.metadata ??
    pv?.metadata ??
    pvc?.metadata;

  const kindLabel = node
    ? "Node"
    : pod
      ? "Pod"
      : rs
        ? "ReplicaSet"
        : deployment
          ? "Deployment"
          : statefulSet
            ? "StatefulSet"
            : daemonSet
              ? "DaemonSet"
              : job
                ? "Job"
                : cronJob
                  ? "CronJob"
                  : hpa
                    ? "HorizontalPodAutoscaler"
                    : service
                      ? "Service"
                      : ingress
                        ? "Ingress"
                        : networkPolicy
                          ? "NetworkPolicy"
                          : configMap
                            ? "ConfigMap"
                            : secret
                              ? "Secret"
                              : pv
                                ? "PersistentVolume"
                                : pvc
                                  ? "PersistentVolumeClaim"
                                  : cp
                                    ? "Control Plane"
                                    : selected?.kind ?? "Object";

  return (
    <AnimatePresence>
      {open && selected && (
        <motion.aside
          key="detail-drawer"
          initial={{ x: "100%" }}
          animate={{ x: 0 }}
          exit={{ x: "100%" }}
          transition={{ type: "spring", stiffness: 320, damping: 34 }}
          className="glass absolute inset-y-0 right-0 z-30 flex w-[26rem] max-w-[90vw] flex-col border-l border-panel-700 shadow-2xl"
        >
          {/* Header */}
          <div className="flex h-12 shrink-0 items-center justify-between border-b border-panel-700 px-4">
            <div className="min-w-0">
              <p className="text-[10px] uppercase tracking-widest text-slate-500">
                {kindLabel}
              </p>
              <p className="truncate text-sm font-bold text-white">
                {selected.name}
              </p>
            </div>
            <button
              onClick={closeDrawer}
              className="rounded p-1 text-slate-400 transition hover:bg-panel-700 hover:text-slate-200"
              aria-label="Close drawer"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Body */}
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <div className="min-h-0 flex-1 overflow-y-auto">
              {node ? (
                <NodeDetail node={node} />
              ) : pod ? (
                <PodDetail pod={pod} />
              ) : rs ? (
                <ReplicaSetDetail rs={rs} />
              ) : deployment ? (
                <DeploymentDetail deployment={deployment} />
              ) : statefulSet ? (
                <StatefulSetDetail ss={statefulSet} />
              ) : daemonSet ? (
                <DaemonSetDetail ds={daemonSet} />
              ) : job ? (
                <JobDetail job={job} />
              ) : cronJob ? (
                <CronJobDetail cronJob={cronJob} />
              ) : hpa ? (
                <HPADetail hpa={hpa} />
              ) : service ? (
                <ServiceDetail service={service} />
              ) : ingress ? (
                <IngressDetail ingress={ingress} />
              ) : networkPolicy ? (
                <NetworkPolicyDetail np={networkPolicy} />
              ) : configMap ? (
                <ConfigMapDetail cm={configMap} />
              ) : secret ? (
                <SecretDetail secret={secret} />
              ) : pv ? (
                <PVDetail pv={pv} />
              ) : pvc ? (
                <PVCDetail pvc={pvc} />
              ) : cp ? (
                <ControlPlaneDetail
                  description={cp.description}
                  emptyState={cp.emptyState}
                  miniPanel={cp.miniPanel}
                />
              ) : (
                <GenericDetail kind={selected.kind} name={selected.name} />
              )}
            </div>
            {activeMeta && <AnnotationsFooter meta={activeMeta} />}
          </div>
        </motion.aside>
      )}
    </AnimatePresence>
  );
}

/* ------------------------------------------------------------------ */
/* Worker node detail                                                  */
/* ------------------------------------------------------------------ */

function nodeToYaml(node: WorkerNode): string {
  const labels = Object.entries(node.labels)
    .map(([k, v]) => `    ${k}: "${v}"`)
    .join("\n");
  return [
    "apiVersion: v1",
    "kind: Node",
    "metadata:",
    `  name: ${node.name}`,
    "  labels:",
    labels || "    {}",
    "spec:",
    `  unschedulable: ${node.draining ? "true" : "false"}`,
    "status:",
    "  conditions:",
    "    - type: Ready",
    `      status: "${node.status === "Ready" ? "True" : "False"}"`,
    "  capacity:",
    `    cpu: "${node.cpuCapacity}"`,
    `    memory: ${node.memCapacity}Gi`,
    "  allocatable:",
    `    cpu: "${node.cpuCapacity}"`,
    `    memory: ${node.memCapacity}Gi`,
  ].join("\n");
}

function NodeDetail({ node }: { node: WorkerNode }) {
  const ready = node.status === "Ready";
  return (
    <div className="flex h-full flex-col">
      <div className="space-y-3 border-b border-panel-700 p-4">
        <div className="flex items-center gap-2">
          <span
            className={`flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold ${
              ready
                ? "border-status-running/50 bg-status-running/10 text-status-running"
                : "border-status-failed/50 bg-status-failed/10 text-status-failed"
            }`}
          >
            <span
              className={`h-1.5 w-1.5 rounded-full ${
                ready ? "bg-status-running" : "bg-status-failed"
              }`}
            />
            {node.status}
          </span>
          <span className="text-[11px] text-slate-500">role: worker</span>
          <span className="ml-auto text-[11px] text-slate-500">
            age {formatAge(node.createdAt)}
          </span>
        </div>

        <Gauge
          label="CPU"
          used={node.cpuUsed}
          capacity={node.cpuCapacity}
          unit=""
        />
        <Gauge
          label="Memory"
          used={node.memUsed}
          capacity={node.memCapacity}
          unit="Gi"
        />

        <div>
          <p className="mb-1 text-[10px] uppercase tracking-wider text-slate-500">
            Labels
          </p>
          <div className="flex flex-wrap gap-1">
            {Object.entries(node.labels).map(([k, v]) => (
              <span
                key={k}
                className="rounded bg-panel-700 px-1.5 py-0.5 text-[10px] text-slate-300"
              >
                {k}
                {v ? `=${v}` : ""}
              </span>
            ))}
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between px-4 pb-1 pt-2">
        <span className="text-[10px] uppercase tracking-wider text-slate-500">
          Manifest (read-only)
        </span>
      </div>
      <div className="min-h-0 flex-1">
        <Editor
          height="100%"
          defaultLanguage="yaml"
          theme="vs-dark"
          value={nodeToYaml(node)}
          options={{
            readOnly: true,
            minimap: { enabled: false },
            fontSize: 12,
            lineNumbers: "off",
            scrollBeyondLastLine: false,
            fontFamily: "var(--font-mono)",
            padding: { top: 8 },
          }}
        />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Control-plane component detail                                      */
/* ------------------------------------------------------------------ */

function ControlPlaneDetail({
  description,
  emptyState,
  miniPanel,
}: {
  description: string;
  emptyState: string;
  miniPanel: "requestLog" | "keyBrowser" | "idle";
}) {
  const panelTitle =
    miniPanel === "requestLog"
      ? "Request Log"
      : miniPanel === "keyBrowser"
        ? "etcd Keys"
        : "Activity";

  return (
    <div className="space-y-4 p-4">
      <p className="text-xs leading-relaxed text-slate-400">{description}</p>

      <div>
        <p className="mb-1.5 flex items-center gap-2 text-[10px] uppercase tracking-wider text-slate-500">
          {panelTitle}
          <span className="h-1.5 w-1.5 animate-pulseDot rounded-full bg-status-running" />
        </p>
        <div className="rounded-lg border border-panel-700 bg-panel-900 p-3">
          <p className="text-[11px] text-slate-600">{emptyState}</p>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Pod detail (logs + exec)                                            */
/* ------------------------------------------------------------------ */

function podToYaml(pod: Pod): string {
  const labels = Object.entries(pod.metadata.labels ?? {})
    .map(([k, v]) => `    ${k}: "${v}"`)
    .join("\n");
  const owner = pod.metadata.ownerReferences?.[0];
  return [
    "apiVersion: v1",
    "kind: Pod",
    "metadata:",
    `  name: ${pod.metadata.name}`,
    `  namespace: ${pod.metadata.namespace}`,
    "  labels:",
    labels || "    {}",
    owner ? "  ownerReferences:" : "",
    owner ? `    - kind: ${owner.kind}` : "",
    owner ? `      name: ${owner.name}` : "",
    "spec:",
    `  nodeName: ${pod.spec.nodeName ?? "<pending>"}`,
    "  containers:",
    ...pod.spec.containers.flatMap((c) => [
      `    - name: ${c.name}`,
      `      image: ${c.image}`,
    ]),
    "status:",
    `  phase: ${pod.status.phase}`,
    `  podIP: ${pod.status.podIP ?? "<none>"}`,
    `  restartCount: ${pod.status.restartCount}`,
  ]
    .filter((l) => l !== "")
    .join("\n");
}

function PodDetail({ pod }: { pod: Pod }) {
  const [tab, setTab] = useState<"yaml" | "logs" | "exec">("yaml");
  const [logs, setLogs] = useState<string[]>([]);
  const [execCmd, setExecCmd] = useState("ls");
  const [execOut, setExecOut] = useState<string[]>([]);

  useEffect(() => {
    setLogs(generateLogs(pod));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pod.metadata.uid]);

  return (
    <div className="flex h-full flex-col">
      <div className="space-y-2 border-b border-panel-700 p-4">
        <div className="flex items-center gap-2">
          <span
            className={`flex items-center gap-1.5 text-xs font-semibold ${phaseTextClass(
              pod.status.phase,
            )}`}
          >
            <span
              className={`h-1.5 w-1.5 rounded-full ${phaseDotClass(
                pod.status.phase,
              )}`}
            />
            {pod.status.phase}
          </span>
          <span className="ml-auto text-[11px] text-slate-500">
            age {formatAge(pod.createdAt)}
          </span>
        </div>
        <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px]">
          <Field label="Node" value={pod.spec.nodeName ?? "<pending>"} />
          <Field label="Pod IP" value={pod.status.podIP ?? "<none>"} />
          <Field label="Restarts" value={String(pod.status.restartCount)} />
          <Field
            label="Containers"
            value={String(pod.spec.containers.length)}
          />
        </div>
      </div>

      {/* Tabs */}
      <div className="flex shrink-0 gap-4 border-b border-panel-700 px-4 text-xs">
        {(["yaml", "logs", "exec"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`-mb-px border-b-2 py-2 font-semibold uppercase ${
              tab === t
                ? "border-kube-500 text-kube-400"
                : "border-transparent text-slate-500 hover:text-slate-300"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      <div className="min-h-0 flex-1">
        {tab === "yaml" && (
          <Editor
            height="100%"
            defaultLanguage="yaml"
            theme="vs-dark"
            value={podToYaml(pod)}
            options={READONLY_EDITOR}
          />
        )}

        {tab === "logs" && (
          <div className="flex h-full flex-col">
            <div className="flex items-center justify-between px-4 py-2">
              <span className="text-[10px] uppercase tracking-wider text-slate-500">
                {pod.metadata.name}
              </span>
              <button
                onClick={() => setLogs(generateLogs(pod))}
                className="flex items-center gap-1 rounded bg-panel-700 px-1.5 py-0.5 text-[10px] text-slate-300 hover:bg-panel-600"
              >
                <RefreshCw className="h-3 w-3" />
                Refresh
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4 font-mono text-[11px] leading-relaxed text-slate-400">
              {logs.map((line, i) => (
                <div key={i} className="whitespace-pre-wrap break-all">
                  {line}
                </div>
              ))}
            </div>
          </div>
        )}

        {tab === "exec" && (
          <div className="flex h-full flex-col p-4">
            <div className="flex items-center gap-1.5">
              <Terminal className="h-3.5 w-3.5 text-kube-400" />
              <span className="text-[10px] text-slate-500">
                kubectl exec {pod.metadata.name} --
              </span>
            </div>
            <div className="mt-2 flex gap-1">
              <input
                value={execCmd}
                onChange={(e) => setExecCmd(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter")
                    setExecOut(simulateExec(pod, execCmd));
                }}
                className="min-w-0 flex-1 rounded border border-panel-700 bg-panel-900 px-2 py-1.5 text-xs text-slate-200 outline-none focus:border-kube-500"
                placeholder="ls"
              />
              <button
                onClick={() => setExecOut(simulateExec(pod, execCmd))}
                className="rounded bg-kube-500/15 px-2 py-1.5 text-xs font-semibold text-kube-400 hover:bg-kube-500/25"
              >
                Run
              </button>
            </div>
            <div className="mt-2 min-h-0 flex-1 overflow-y-auto rounded border border-panel-700 bg-panel-900 p-2 font-mono text-[11px] text-slate-400">
              {execOut.length === 0 ? (
                <span className="text-slate-600">
                  Try: ls · pwd · env · ps · whoami
                </span>
              ) : (
                execOut.map((line, i) => (
                  <div key={i} className="whitespace-pre-wrap break-all">
                    {line}
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* ReplicaSet detail                                                   */
/* ------------------------------------------------------------------ */

function ReplicaSetDetail({ rs }: { rs: ReplicaSet }) {
  const pods = useClusterStore(
    useShallow((s) =>
      s.pods.filter((p) =>
        p.metadata.ownerReferences?.some((o) => o.uid === rs.metadata.uid),
      ),
    ),
  );
  return (
    <div className="space-y-4 p-4">
      <div className="flex items-center gap-2 text-xs">
        <span
          className="h-2.5 w-2.5 rounded-sm"
          style={{ backgroundColor: rs.color }}
        />
        <span className="text-slate-400">image {rs.image}</span>
        <span className="ml-auto text-[11px] text-slate-500">
          rev {rs.revision}
        </span>
      </div>
      <div className="rounded-lg border border-panel-700 bg-panel-900 p-3 text-center">
        <p className="text-2xl font-bold text-white">
          {rs.status.replicas}
          <span className="text-sm text-slate-500"> / {rs.spec.replicas}</span>
        </p>
        <p className="text-[10px] uppercase tracking-wider text-slate-500">
          Current / Desired
        </p>
      </div>
      <div>
        <p className="mb-1.5 text-[10px] uppercase tracking-wider text-slate-500">
          Owned Pods ({pods.length})
        </p>
        <div className="space-y-1">
          {pods.map((p) => (
            <PodMiniRow key={p.metadata.uid} pod={p} />
          ))}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Deployment detail (revision history)                                */
/* ------------------------------------------------------------------ */

function DeploymentDetail({ deployment: d }: { deployment: Deployment }) {
  return (
    <div className="space-y-4 p-4">
      <div className="flex items-center gap-2 text-xs">
        <span
          className="h-2.5 w-2.5 rounded-sm"
          style={{ backgroundColor: d.color }}
        />
        <span className="text-slate-400">
          image {d.spec.template.containers[0]?.image}
        </span>
        <span className="ml-auto text-[11px] text-slate-500">
          strategy {d.spec.strategy.type}
        </span>
      </div>

      <div className="rounded-lg border border-panel-700 bg-panel-900 p-3 text-center">
        <p className="text-2xl font-bold text-white">
          {d.status.readyReplicas}
          <span className="text-sm text-slate-500"> / {d.spec.replicas}</span>
        </p>
        <p className="text-[10px] uppercase tracking-wider text-slate-500">
          Ready / Desired
        </p>
        {d.rollout && (
          <p className="mt-1 text-[10px] text-status-pending">
            rollout progressing…
          </p>
        )}
      </div>

      <div>
        <p className="mb-1.5 text-[10px] uppercase tracking-wider text-slate-500">
          Revision History
        </p>
        <div className="space-y-1">
          {d.revisions
            .slice()
            .sort((a, b) => b.revision - a.revision)
            .map((rev) => {
              const active = rev.replicaSetId === d.activeReplicaSetId;
              return (
                <div
                  key={rev.revision}
                  className="flex items-center gap-2 rounded-md border border-panel-700 bg-panel-900 px-2 py-1.5 text-[11px]"
                >
                  <span className="font-bold text-slate-300">
                    #{rev.revision}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-slate-400">
                    {rev.image}
                  </span>
                  <span className="text-[10px] text-slate-600">
                    {new Date(rev.timestamp).toLocaleTimeString()}
                  </span>
                  {active && (
                    <span className="text-status-running">active</span>
                  )}
                </div>
              );
            })}
        </div>
      </div>
    </div>
  );
}

function PodMiniRow({ pod }: { pod: Pod }) {
  return (
    <div className="flex items-center gap-2 rounded border border-panel-700 bg-panel-900 px-2 py-1 text-[10px]">
      <span className={`h-1.5 w-1.5 rounded-full ${phaseDotClass(pod.status.phase)}`} />
      <span className="min-w-0 flex-1 truncate text-slate-400">
        {pod.metadata.name}
      </span>
      <span className="text-slate-600">{pod.spec.nodeName ?? "-"}</span>
      <span className={phaseTextClass(pod.status.phase)}>
        {pod.status.phase}
      </span>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span className="text-slate-600">{label}: </span>
      <span className="text-slate-300">{value}</span>
    </div>
  );
}

const READONLY_EDITOR = {
  readOnly: true,
  minimap: { enabled: false },
  fontSize: 12,
  lineNumbers: "off" as const,
  scrollBeyondLastLine: false,
  fontFamily: "var(--font-mono)",
  padding: { top: 8 },
};

/* ------------------------------------------------------------------ */
/* Service detail (endpoints + send request)                           */
/* ------------------------------------------------------------------ */

function ServiceDetail({ service }: { service: Service }) {
  const pods = useClusterStore((s) => s.pods);
  const requestService = useFlowStore((s) => s.requestService);
  const bulkRequestService = useFlowStore((s) => s.bulkRequestService);
  const endpoints = computeEndpoints(service, pods);

  const address =
    service.spec.type === "LoadBalancer"
      ? service.status.externalIP ?? "<pending>"
      : service.spec.type === "ExternalName"
        ? service.spec.externalName ?? "-"
        : service.status.clusterIP ?? "-";

  return (
    <div className="space-y-4 p-4">
      <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px]">
        <Field label="Type" value={service.spec.type} />
        <Field label="Address" value={address} />
        <Field
          label="Port"
          value={`${service.spec.ports[0]?.port} → ${service.spec.ports[0]?.targetPort}`}
        />
        <Field label="Age" value={formatAge(service.createdAt)} />
      </div>

      <div>
        <p className="mb-1 text-[10px] uppercase tracking-wider text-slate-500">
          Selector
        </p>
        <div className="flex flex-wrap gap-1">
          {Object.entries(service.spec.selector).map(([k, v]) => (
            <span
              key={k}
              className="rounded bg-panel-700 px-1.5 py-0.5 text-[10px] text-slate-300"
            >
              {k}={v}
            </span>
          ))}
          {Object.keys(service.spec.selector).length === 0 && (
            <span className="text-[11px] text-slate-600">&lt;none&gt;</span>
          )}
        </div>
      </div>

      <div>
        <p className="mb-1 text-[10px] uppercase tracking-wider text-slate-500">
          Endpoints ({endpoints.length})
        </p>
        <div className="space-y-1">
          {endpoints.length === 0 ? (
            <p className="text-[11px] text-slate-600">No ready endpoints.</p>
          ) : (
            endpoints.map((p) => (
              <div
                key={p.metadata.uid}
                className="flex items-center gap-2 rounded border border-panel-700 bg-panel-900 px-2 py-1 text-[10px]"
              >
                <span className="h-1.5 w-1.5 rounded-full bg-status-running" />
                <span className="text-slate-400">{p.status.podIP}</span>
                <span className="ml-auto truncate text-slate-600">
                  {p.metadata.name}
                </span>
              </div>
            ))
          )}
        </div>
      </div>

      <div className="flex gap-2">
        <button
          onClick={() => requestService(service.metadata.uid)}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-md bg-kube-500 px-3 py-2 text-xs font-semibold text-white shadow-glow transition hover:bg-kube-400"
        >
          <Send className="h-4 w-4" />
          Send Request
        </button>
        <button
          onClick={() => bulkRequestService(service.metadata.uid, 10)}
          className="flex items-center justify-center gap-1.5 rounded-md border border-panel-700 bg-panel-850 px-3 py-2 text-xs font-semibold text-slate-300 transition hover:bg-panel-700"
        >
          <Zap className="h-4 w-4" />
          x10
        </button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Ingress detail (routing table)                                      */
/* ------------------------------------------------------------------ */

function IngressDetail({ ingress }: { ingress: Ingress }) {
  const requestIngressRule = useFlowStore((s) => s.requestIngressRule);
  return (
    <div className="space-y-4 p-4">
      <p className="text-[10px] uppercase tracking-wider text-slate-500">
        Routing Table
      </p>
      <div className="space-y-1.5">
        {ingress.spec.rules.map((rule, i) => (
          <div
            key={i}
            className="rounded-md border border-panel-700 bg-panel-900 p-2"
          >
            <div className="flex items-center gap-2 text-[11px]">
              <span className="font-semibold text-amber-400">
                {rule.host}
                {rule.path}
              </span>
              <span className="text-slate-500">→</span>
              <span className="text-slate-300">
                {rule.serviceName}:{rule.servicePort}
              </span>
              <button
                onClick={() => requestIngressRule(ingress.metadata.uid, i)}
                className="ml-auto flex items-center gap-1 rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-amber-400 hover:bg-amber-500/25"
              >
                <Send className="h-3 w-3" />
                Send
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* NetworkPolicy detail                                                */
/* ------------------------------------------------------------------ */

function NetworkPolicyDetail({ np }: { np: NetworkPolicy }) {
  return (
    <div className="space-y-4 p-4">
      <div
        className={`rounded-lg border p-3 text-center ${
          np.spec.allowAll
            ? "border-status-running/40 bg-status-running/5"
            : "border-status-failed/40 bg-status-failed/5"
        }`}
      >
        <p
          className={`text-sm font-bold ${
            np.spec.allowAll ? "text-status-running" : "text-status-failed"
          }`}
        >
          {np.spec.allowAll ? "Allow all ingress" : "Default deny ingress"}
        </p>
        <p className="mt-0.5 text-[10px] text-slate-500">
          {np.spec.allowAll
            ? "Selected pods accept traffic from any source."
            : "Selected pods reject external traffic (blocked with a red X)."}
        </p>
      </div>

      <div>
        <p className="mb-1 text-[10px] uppercase tracking-wider text-slate-500">
          Applies to pods
        </p>
        <div className="flex flex-wrap gap-1">
          {Object.entries(np.spec.podSelector).map(([k, v]) => (
            <span
              key={k}
              className="rounded bg-panel-700 px-1.5 py-0.5 text-[10px] text-slate-300"
            >
              {k}={v}
            </span>
          ))}
          {Object.keys(np.spec.podSelector).length === 0 && (
            <span className="text-[11px] text-slate-600">
              &lt;all pods in namespace&gt;
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* ConfigMap detail (editable key/value table)                         */
/* ------------------------------------------------------------------ */

function ConfigMapDetail({ cm }: { cm: ConfigMap }) {
  const updateConfigMap = useClusterStore((s) => s.updateConfigMap);
  const [rows, setRows] = useState<[string, string][]>(
    Object.entries(cm.data),
  );

  useEffect(() => {
    setRows(Object.entries(cm.data));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cm.metadata.uid]);

  const commit = (next: [string, string][]) => {
    setRows(next);
    const data: Record<string, string> = {};
    for (const [k, v] of next) if (k.trim()) data[k.trim()] = v;
    updateConfigMap(cm.metadata.uid, data);
  };

  return (
    <div className="space-y-3 p-4">
      <p className="text-[10px] uppercase tracking-wider text-slate-500">
        Data ({rows.length} keys)
      </p>
      <div className="space-y-1.5">
        {rows.map(([k, v], i) => (
          <div key={i} className="flex items-center gap-1">
            <input
              value={k}
              onChange={(e) => {
                const next = [...rows];
                next[i] = [e.target.value, v];
                commit(next);
              }}
              placeholder="key"
              className="w-24 rounded border border-panel-700 bg-panel-900 px-1.5 py-1 text-[11px] text-slate-200 outline-none focus:border-kube-500"
            />
            <input
              value={v}
              onChange={(e) => {
                const next = [...rows];
                next[i] = [k, e.target.value];
                commit(next);
              }}
              placeholder="value"
              className="min-w-0 flex-1 rounded border border-panel-700 bg-panel-900 px-1.5 py-1 text-[11px] text-slate-200 outline-none focus:border-kube-500"
            />
            <button
              onClick={() => commit(rows.filter((_, idx) => idx !== i))}
              className="rounded p-1 text-slate-600 hover:text-status-failed"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        ))}
      </div>
      <button
        onClick={() => commit([...rows, ["", ""]])}
        className="w-full rounded border border-dashed border-panel-700 py-1.5 text-[11px] text-slate-500 hover:border-kube-500 hover:text-kube-400"
      >
        + add key
      </button>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Secret detail (masked + reveal + base64)                            */
/* ------------------------------------------------------------------ */

function SecretDetail({ secret }: { secret: Secret }) {
  const [revealed, setRevealed] = useState<Record<string, boolean>>({});
  const toggle = (k: string) =>
    setRevealed((r) => ({ ...r, [k]: !r[k] }));

  return (
    <div className="space-y-3 p-4">
      <div className="flex items-center gap-2 text-[11px]">
        <span className="rounded bg-panel-700 px-1.5 py-0.5 text-slate-400">
          {secret.type}
        </span>
        <span className="text-slate-500">values shown base64-encoded</span>
      </div>
      <div className="space-y-2">
        {Object.entries(secret.data).map(([k, v]) => (
          <div
            key={k}
            className="rounded-md border border-amber-500/30 bg-panel-900 p-2"
          >
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-semibold text-amber-300">
                {k}
              </span>
              <button
                onClick={() => toggle(k)}
                className="ml-auto rounded p-0.5 text-slate-500 hover:text-slate-200"
                title={revealed[k] ? "Hide" : "Reveal"}
              >
                {revealed[k] ? (
                  <EyeOff className="h-3.5 w-3.5" />
                ) : (
                  <Eye className="h-3.5 w-3.5" />
                )}
              </button>
            </div>
            <p className="mt-1 break-all font-mono text-[11px] text-slate-300">
              {revealed[k] ? v : "••••••••"}
            </p>
            <p className="mt-0.5 break-all font-mono text-[9px] text-slate-600">
              base64: {toBase64(v)}
            </p>
          </div>
        ))}
        {Object.keys(secret.data).length === 0 && (
          <p className="text-[11px] text-slate-600">No data.</p>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* PV / PVC detail                                                     */
/* ------------------------------------------------------------------ */

function PVDetail({ pv }: { pv: PersistentVolume }) {
  return (
    <div className="space-y-3 p-4">
      <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px]">
        <Field label="Capacity" value={`${pv.spec.capacity}Gi`} />
        <Field label="Phase" value={pv.status.phase} />
        <Field
          label="StorageClass"
          value={pv.spec.storageClassName ?? "-"}
        />
        <Field label="Provisioned" value={pv.dynamic ? "dynamic" : "manual"} />
        <Field label="Access" value={pv.spec.accessModes.join(", ")} />
        <Field label="Age" value={formatAge(pv.createdAt)} />
      </div>
      {pv.status.boundClaim && (
        <p className="text-[11px] text-slate-500">
          Bound to PVC{" "}
          <span className="text-slate-300">{pv.status.boundClaim.name}</span>
        </p>
      )}
    </div>
  );
}

function PVCDetail({ pvc }: { pvc: PersistentVolumeClaim }) {
  return (
    <div className="space-y-3 p-4">
      <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px]">
        <Field label="Request" value={`${pvc.spec.storage}Gi`} />
        <Field label="Phase" value={pvc.status.phase} />
        <Field
          label="StorageClass"
          value={pvc.spec.storageClassName ?? "-"}
        />
        <Field label="Access" value={pvc.spec.accessModes.join(", ")} />
        <Field label="Volume" value={pvc.status.volumeName ?? "-"} />
        <Field label="Age" value={formatAge(pvc.createdAt)} />
      </div>
      <p className="text-[10px] text-slate-600">
        Persistent storage survives pod deletion — the bound PV is retained.
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Annotations (reference doc §6.3)                                    */
/* ------------------------------------------------------------------ */

function AnnotationsFooter({ meta }: { meta: ObjectMeta }) {
  const entries = Object.entries(meta.annotations ?? {});
  return (
    <div className="shrink-0 border-t border-panel-700 bg-panel-900/40 px-4 py-2">
      <p className="mb-1 text-[10px] uppercase tracking-wider text-slate-500">
        Annotations
      </p>
      {entries.length === 0 ? (
        <p className="text-[10px] text-slate-600">No annotations.</p>
      ) : (
        <div className="space-y-0.5">
          {entries.map(([k, v]) => (
            <p key={k} className="truncate text-[10px] text-slate-400">
              <span className="text-slate-500">{k}:</span> {v}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Advanced workload details                                           */
/* ------------------------------------------------------------------ */

function StatefulSetDetail({ ss }: { ss: StatefulSet }) {
  const pods = useClusterStore(
    useShallow((s) =>
      s.pods
        .filter((p) => p.metadata.ownerReferences?.[0]?.uid === ss.metadata.uid)
        .sort((a, b) => (a.spec.ordinal ?? 0) - (b.spec.ordinal ?? 0)),
    ),
  );
  return (
    <div className="space-y-4 p-4">
      <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px]">
        <Field label="Ready" value={`${ss.status.readyReplicas}/${ss.spec.replicas}`} />
        <Field label="Service" value={ss.spec.serviceName ?? "-"} />
        <Field label="Image" value={ss.image} />
        <Field
          label="Storage"
          value={
            ss.spec.volumeClaimTemplate
              ? `${ss.spec.volumeClaimTemplate.storage}Gi/pod`
              : "none"
          }
        />
      </div>
      <div>
        <p className="mb-1.5 text-[10px] uppercase tracking-wider text-slate-500">
          Ordered Pods (stable identity)
        </p>
        <div className="space-y-1">
          {pods.map((p) => (
            <div
              key={p.metadata.uid}
              className="flex items-center gap-2 rounded border border-panel-700 bg-panel-900 px-2 py-1 text-[10px]"
            >
              <span className="font-bold text-slate-300">
                {p.spec.ordinal}
              </span>
              <span
                className={`h-1.5 w-1.5 rounded-full ${phaseDotClass(p.status.phase)}`}
              />
              <span className="min-w-0 flex-1 truncate text-slate-400">
                {p.metadata.name}
              </span>
              {p.spec.pvcs?.[0] && (
                <span className="truncate text-slate-600">
                  {p.spec.pvcs[0]}
                </span>
              )}
            </div>
          ))}
          {pods.length === 0 && (
            <p className="text-[11px] text-slate-600">No pods.</p>
          )}
        </div>
      </div>
    </div>
  );
}

function DaemonSetDetail({ ds }: { ds: DaemonSet }) {
  const pods = useClusterStore(
    useShallow((s) =>
      s.pods.filter((p) => p.metadata.ownerReferences?.[0]?.uid === ds.metadata.uid),
    ),
  );
  return (
    <div className="space-y-4 p-4">
      <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px]">
        <Field
          label="Scheduled"
          value={`${ds.status.numberReady}/${ds.status.desiredNumberScheduled}`}
        />
        <Field label="Image" value={ds.image} />
      </div>
      <p className="text-[10px] text-slate-600">
        One pod runs on every eligible node. Adding a node auto-spawns a pod;
        removing a node cleans it up.
      </p>
      <div>
        <p className="mb-1.5 text-[10px] uppercase tracking-wider text-slate-500">
          Pods per node
        </p>
        <div className="space-y-1">
          {pods.map((p) => (
            <div
              key={p.metadata.uid}
              className="flex items-center gap-2 rounded border border-panel-700 bg-panel-900 px-2 py-1 text-[10px]"
            >
              <span className={`h-1.5 w-1.5 rounded-full ${phaseDotClass(p.status.phase)}`} />
              <span className="min-w-0 flex-1 truncate text-slate-400">
                {p.spec.nodeName ?? "-"}
              </span>
              <span className="text-slate-600">{p.status.phase}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function JobDetail({ job }: { job: Job }) {
  const forceFailJob = useClusterStore((s) => s.forceFailJob);
  const pct = Math.min(
    100,
    Math.round((job.status.succeeded / job.spec.completions) * 100),
  );
  return (
    <div className="space-y-4 p-4">
      <div className="rounded-lg border border-panel-700 bg-panel-900 p-3 text-center">
        <p className="text-2xl font-bold text-white">
          {job.status.succeeded}
          <span className="text-sm text-slate-500"> / {job.spec.completions}</span>
        </p>
        <p className="text-[10px] uppercase tracking-wider text-slate-500">
          completions · {job.status.phase}
        </p>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-panel-700">
          <div
            className="h-full rounded-full bg-status-running transition-all"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>
      <div className="grid grid-cols-3 gap-x-3 text-[11px]">
        <Field label="Parallelism" value={String(job.spec.parallelism)} />
        <Field label="Active" value={String(job.status.active)} />
        <Field label="Failed" value={String(job.status.failed)} />
      </div>
      <button
        onClick={() => forceFailJob(job.metadata.uid)}
        className={`w-full rounded-md border px-3 py-2 text-xs font-semibold transition ${
          job.forceFail
            ? "border-status-failed/50 bg-status-failed/15 text-status-failed"
            : "border-panel-700 bg-panel-850 text-slate-300 hover:bg-panel-700"
        }`}
      >
        {job.forceFail ? "Forced-failure ON (retrying)" : "Force failure (test backoffLimit)"}
      </button>
      <p className="text-[10px] text-slate-600">
        backoffLimit {job.spec.backoffLimit}: retries until failures exceed the
        limit, then the Job is marked Failed.
      </p>
    </div>
  );
}

function CronJobDetail({ cronJob: cj }: { cronJob: CronJob }) {
  const simClock = useClusterStore((s) => s.simClock);
  const countdown = Math.max(0, Math.round((cj.nextRunAt - simClock) / 1000));
  return (
    <div className="space-y-4 p-4">
      <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px]">
        <Field label="Schedule" value={cj.spec.schedule} />
        <Field label="Cadence" value={describeSchedule(cj.spec.schedule)} />
        <Field label="Image" value={cj.spec.image} />
        <Field label="Next run" value={`${countdown}s (sim)`} />
      </div>
      <div>
        <p className="mb-1.5 text-[10px] uppercase tracking-wider text-slate-500">
          Run History
        </p>
        <div className="space-y-1">
          {cj.history.length === 0 ? (
            <p className="text-[11px] text-slate-600">
              No runs yet — increase the clock speed (top bar) to accelerate.
            </p>
          ) : (
            cj.history.map((run, i) => (
              <div
                key={i}
                className="flex items-center gap-2 rounded border border-panel-700 bg-panel-900 px-2 py-1 text-[10px]"
              >
                <span className="min-w-0 flex-1 truncate text-slate-400">
                  {run.jobName}
                </span>
                <span className="text-slate-600">
                  {new Date(run.time).toLocaleTimeString()}
                </span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

function HPADetail({ hpa }: { hpa: HorizontalPodAutoscaler }) {
  const setHpaLoad = useClusterStore((s) => s.setHpaLoad);
  const over =
    hpa.status.currentCPUUtilizationPercentage >
    hpa.spec.targetCPUUtilizationPercentage;
  return (
    <div className="space-y-4 p-4">
      <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px]">
        <Field
          label="Target"
          value={`${hpa.spec.scaleTargetRef.kind}/${hpa.spec.scaleTargetRef.name}`}
        />
        <Field
          label="Replicas"
          value={`${hpa.status.currentReplicas} (${hpa.spec.minReplicas}-${hpa.spec.maxReplicas})`}
        />
      </div>

      <div className="rounded-lg border border-panel-700 bg-panel-900 p-3 text-center">
        <p
          className={`text-2xl font-bold ${
            over ? "text-status-failed" : "text-status-running"
          }`}
        >
          {hpa.status.currentCPUUtilizationPercentage}%
          <span className="text-sm text-slate-500">
            {" "}
            / {hpa.spec.targetCPUUtilizationPercentage}%
          </span>
        </p>
        <p className="text-[10px] uppercase tracking-wider text-slate-500">
          current CPU / target
        </p>
      </div>

      <div>
        <p className="mb-1 text-[10px] uppercase tracking-wider text-slate-500">
          Load Simulator
        </p>
        <input
          type="range"
          min={0}
          max={100}
          value={hpa.load}
          onChange={(e) => setHpaLoad(hpa.metadata.uid, Number(e.target.value))}
          className="w-full accent-kube-500"
        />
        <p className="mt-1 text-[10px] text-slate-600">
          Drag to simulate CPU load. When it crosses the target, the HPA scales
          the workload (respecting min/max).
        </p>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Generic fallback                                                    */
/* ------------------------------------------------------------------ */

function GenericDetail({ kind, name }: { kind: string; name: string }) {
  const yaml = `# ${kind}/${name}\n# YAML manifest will render here in later phases.`;
  return (
    <Editor
      height="100%"
      defaultLanguage="yaml"
      theme="vs-dark"
      value={yaml}
      options={{
        readOnly: true,
        minimap: { enabled: false },
        fontSize: 12,
        lineNumbers: "off",
        scrollBeyondLastLine: false,
        fontFamily: "var(--font-mono)",
        padding: { top: 12 },
      }}
    />
  );
}
