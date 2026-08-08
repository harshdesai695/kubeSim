"use client";

import { useState } from "react";
import {
  Activity,
  ArrowUpNarrowWide,
  Blocks,
  Boxes,
  Camera,
  Clock,
  Database,
  Eye,
  FileText,
  Gauge as GaugeIcon,
  HardDrive,
  KeyRound,
  Layers,
  Link2,
  Lock,
  Minus,
  Network,
  Plus,
  RefreshCw,
  Repeat,
  Rocket,
  Scale,
  Send,
  Shield,
  ShieldAlert,
  ShieldBan,
  ShieldCheck,
  Skull,
  SlidersHorizontal,
  Trash2,
  Undo2,
  UserCog,
  Waypoints,
  X,
  Zap,
} from "lucide-react";
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
  RoleBinding,
  Secret,
  SecretType,
  Service,
  ServiceAccount,
  ServiceType,
  StatefulSet,
  SubjectKind,
} from "@/store/types";
import type { RbacSubjectSelection } from "@/store/useClusterStore";
import { phaseTextClass } from "@/lib/status";
import { ACCESS_MODES, STORAGE_CLASSES } from "@/lib/storage";
import { describeSchedule } from "@/lib/cron";

type CreateKind =
  | "Deployment"
  | "ReplicaSet"
  | "Pod"
  | "StatefulSet"
  | "DaemonSet"
  | "Job"
  | "CronJob"
  | "Service"
  | "Ingress"
  | "NetworkPolicy"
  | "ConfigMap"
  | "Secret"
  | "PVC"
  | "PV"
  | "ServiceAccount"
  | "Role"
  | "RoleBinding"
  | "ResourceQuota"
  | "LimitRange"
  | "PriorityClass"
  | "PodDisruptionBudget";

function parseSelector(str: string): Record<string, string> {
  const out: Record<string, string> = {};
  str
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean)
    .forEach((p) => {
      const [k, ...rest] = p.split("=");
      if (k) out[k.trim()] = rest.join("=").trim();
    });
  return out;
}

function parseKeyValues(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .forEach((l) => {
      const [k, ...rest] = l.split("=");
      if (k) out[k.trim()] = rest.join("=").trim();
    });
  return out;
}

const inNs = (obj: { metadata: { namespace: string } }, ns: string) =>
  obj.metadata.namespace === ns;

function parseCsv(str: string): string[] {
  return str
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function parseNumberMap(str: string): Record<string, number> {
  const out: Record<string, number> = {};
  str
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean)
    .forEach((p) => {
      const [k, v] = p.split("=");
      const n = Number(v);
      if (k && Number.isFinite(n)) out[k.trim()] = n;
    });
  return out;
}

/**
 * WorkloadsPanel — left dock to create/manage workloads, networking, config and
 * storage objects (reference doc §3–6), scoped to the active namespace.
 */
export function WorkloadsPanel() {
  const open = useClusterStore((s) => s.ui.workloadsOpen);
  const namespace = useClusterStore((s) => s.namespace);
  const deployments = useClusterStore((s) => s.deployments);
  const replicaSets = useClusterStore((s) => s.replicaSets);
  const statefulSets = useClusterStore((s) => s.statefulSets);
  const daemonSets = useClusterStore((s) => s.daemonSets);
  const jobs = useClusterStore((s) => s.jobs);
  const cronJobs = useClusterStore((s) => s.cronJobs);
  const hpas = useClusterStore((s) => s.hpas);
  const services = useClusterStore((s) => s.services);
  const ingresses = useClusterStore((s) => s.ingresses);
  const networkPolicies = useClusterStore((s) => s.networkPolicies);
  const configMaps = useClusterStore((s) => s.configMaps);
  const secrets = useClusterStore((s) => s.secrets);
  const persistentVolumeClaims = useClusterStore(
    (s) => s.persistentVolumeClaims,
  );
  const persistentVolumes = useClusterStore((s) => s.persistentVolumes);
  const pods = useClusterStore((s) => s.pods);
  const serviceAccounts = useClusterStore((s) => s.serviceAccounts);
  const roles = useClusterStore((s) => s.roles);
  const clusterRoles = useClusterStore((s) => s.clusterRoles);
  const roleBindings = useClusterStore((s) => s.roleBindings);
  const clusterRoleBindings = useClusterStore((s) => s.clusterRoleBindings);
  const resourceQuotas = useClusterStore((s) => s.resourceQuotas);
  const limitRanges = useClusterStore((s) => s.limitRanges);
  const priorityClasses = useClusterStore((s) => s.priorityClasses);
  const podDisruptionBudgets = useClusterStore((s) => s.podDisruptionBudgets);
  const rbacSubject = useClusterStore((s) => s.ui.rbacSubject);
  const setRbacSubject = useClusterStore((s) => s.setRbacSubject);
  const toggleWorkloads = useClusterStore((s) => s.toggleWorkloads);

  const [formOpen, setFormOpen] = useState(false);

  if (!open) return null;

  const nsDeployments = deployments.filter((d) => inNs(d, namespace));
  const nsStatefulSets = statefulSets.filter((s) => inNs(s, namespace));
  const nsDaemonSets = daemonSets.filter((d) => inNs(d, namespace));
  const nsJobs = jobs.filter(
    (j) => inNs(j, namespace) && !j.metadata.ownerReferences?.length,
  );
  const nsCronJobs = cronJobs.filter((c) => inNs(c, namespace));
  const nsHpas = hpas.filter((h) => inNs(h, namespace));
  const nsServices = services.filter((s) => inNs(s, namespace));
  const nsIngresses = ingresses.filter((i) => inNs(i, namespace));
  const nsNetpol = networkPolicies.filter((n) => inNs(n, namespace));
  const nsConfigMaps = configMaps.filter((c) => inNs(c, namespace));
  const nsSecrets = secrets.filter((c) => inNs(c, namespace));
  const nsPVCs = persistentVolumeClaims.filter((c) => inNs(c, namespace));
  const nsServiceAccounts = serviceAccounts.filter((c) => inNs(c, namespace));
  const nsRoles = roles.filter((c) => inNs(c, namespace));
  const nsRoleBindings = roleBindings.filter((c) => inNs(c, namespace));
  const nsResourceQuotas = resourceQuotas.filter((c) => inNs(c, namespace));
  const nsLimitRanges = limitRanges.filter((c) => inNs(c, namespace));
  const nsPDBs = podDisruptionBudgets.filter((c) => inNs(c, namespace));
  const standaloneRs = replicaSets.filter(
    (rs) =>
      inNs(rs, namespace) &&
      !rs.metadata.ownerReferences?.some((o) => o.kind === "Deployment"),
  );
  const standalonePods = pods.filter(
    (p) => inNs(p, namespace) && !p.metadata.ownerReferences?.length,
  );

  const empty =
    nsDeployments.length === 0 &&
    standaloneRs.length === 0 &&
    nsStatefulSets.length === 0 &&
    nsDaemonSets.length === 0 &&
    nsJobs.length === 0 &&
    nsCronJobs.length === 0 &&
    nsHpas.length === 0 &&
    nsServices.length === 0 &&
    nsIngresses.length === 0 &&
    nsNetpol.length === 0 &&
    nsConfigMaps.length === 0 &&
    nsSecrets.length === 0 &&
    nsPVCs.length === 0 &&
    persistentVolumes.length === 0 &&
    standalonePods.length === 0;

  return (
    <>
      {/* Mobile backdrop (docked panel becomes an overlay on small screens) */}
      <div
        className="absolute inset-0 z-20 bg-black/40 md:hidden"
        onClick={toggleWorkloads}
      />
      <aside className="glass absolute inset-y-0 left-0 z-30 flex w-80 max-w-[85vw] shrink-0 flex-col border-r border-panel-700 md:relative md:z-10 md:max-w-none">
        <div className="flex h-11 shrink-0 items-center justify-between border-b border-panel-700 px-3">
          <div className="flex items-center gap-2 text-sm font-bold text-white">
            <Layers className="h-4 w-4 text-kube-400" />
            Workloads
            <span className="rounded bg-panel-700 px-1 text-[9px] font-normal text-slate-400">
              {namespace}
            </span>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setFormOpen((v) => !v)}
              className="flex items-center gap-1 rounded-md border border-kube-500/50 bg-kube-500/15 px-2 py-1 text-[11px] font-semibold text-kube-400 transition hover:bg-kube-500/25"
            >
              <Plus className="h-3.5 w-3.5" />
              New
            </button>
            <button
              onClick={toggleWorkloads}
              className="rounded p-1 text-slate-400 transition hover:bg-panel-700 hover:text-slate-200"
              aria-label="Collapse workloads"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {formOpen && <CreateForm onDone={() => setFormOpen(false)} />}

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
          {empty && !formOpen && (
            <div className="mt-12 flex flex-col items-center gap-2 text-center text-slate-600">
              <Boxes className="h-6 w-6" />
              <p className="text-xs">No objects in {namespace}.</p>
              <p className="max-w-[14rem] text-[11px] text-slate-700">
                Click <span className="text-kube-400">New</span> to create objects
                in this namespace.
              </p>
            </div>
          )}

          {nsDeployments.map((d) => (
            <DeploymentRow
              key={d.metadata.uid}
              deployment={d}
              replicaSets={replicaSets.filter((rs) =>
                rs.metadata.ownerReferences?.some(
                  (o) => o.uid === d.metadata.uid,
                ),
              )}
            />
          ))}

          {standaloneRs.map((rs) => (
            <ReplicaSetRow key={rs.metadata.uid} rs={rs} />
          ))}

          {nsStatefulSets.length > 0 && (
            <Section label="StatefulSets">
              {nsStatefulSets.map((ss) => (
                <StatefulSetRow key={ss.metadata.uid} ss={ss} />
              ))}
            </Section>
          )}

          {nsDaemonSets.length > 0 && (
            <Section label="DaemonSets">
              {nsDaemonSets.map((ds) => (
                <DaemonSetRow key={ds.metadata.uid} ds={ds} />
              ))}
            </Section>
          )}

          {nsJobs.length > 0 && (
            <Section label="Jobs">
              {nsJobs.map((j) => (
                <JobRow key={j.metadata.uid} job={j} />
              ))}
            </Section>
          )}

          {nsCronJobs.length > 0 && (
            <Section label="CronJobs">
              {nsCronJobs.map((c) => (
                <CronJobRow key={c.metadata.uid} cronJob={c} />
              ))}
            </Section>
          )}

          {nsHpas.length > 0 && (
            <Section label="Autoscalers">
              {nsHpas.map((h) => (
                <HPARow key={h.metadata.uid} hpa={h} />
              ))}
            </Section>
          )}

          {nsServices.length > 0 && (
            <Section label="Services">
              {nsServices.map((svc) => (
                <ServiceRow key={svc.metadata.uid} service={svc} />
              ))}
            </Section>
          )}

          {nsIngresses.length > 0 && (
            <Section label="Ingresses">
              {nsIngresses.map((ing) => (
                <IngressRow key={ing.metadata.uid} ingress={ing} />
              ))}
            </Section>
          )}

          {nsNetpol.length > 0 && (
            <Section label="Network Policies">
              {nsNetpol.map((np) => (
                <NetworkPolicyRow key={np.metadata.uid} np={np} />
              ))}
            </Section>
          )}

          {nsConfigMaps.length > 0 && (
            <Section label="ConfigMaps">
              {nsConfigMaps.map((cm) => (
                <ConfigMapRow key={cm.metadata.uid} cm={cm} />
              ))}
            </Section>
          )}

          {nsSecrets.length > 0 && (
            <Section label="Secrets">
              {nsSecrets.map((sec) => (
                <SecretRow key={sec.metadata.uid} secret={sec} />
              ))}
            </Section>
          )}

          {(nsPVCs.length > 0 || persistentVolumes.length > 0) && (
            <Section label="Storage">
              {nsPVCs.map((pvc) => (
                <PVCRow key={pvc.metadata.uid} pvc={pvc} />
              ))}
              {persistentVolumes.map((pv) => (
                <PVRow key={pv.metadata.uid} pv={pv} />
              ))}
            </Section>
          )}

          {standalonePods.length > 0 && (
            <Section label="Standalone Pods">
              {standalonePods.map((p) => (
                <PodRow key={p.metadata.uid} pod={p} />
              ))}
            </Section>
          )}

          {(nsServiceAccounts.length > 0 ||
            nsRoles.length > 0 ||
            clusterRoles.length > 0 ||
            nsRoleBindings.length > 0 ||
            clusterRoleBindings.length > 0 ||
            nsResourceQuotas.length > 0 ||
            nsLimitRanges.length > 0) && (
            <Section label="RBAC & Security">
              <InspectAsPicker
                serviceAccounts={nsServiceAccounts}
                roleBindings={[...nsRoleBindings, ...clusterRoleBindings]}
                subject={rbacSubject}
                onSelect={setRbacSubject}
                namespace={namespace}
              />
              {nsServiceAccounts.map((sa) => (
                <RbacRow
                  key={sa.metadata.uid}
                  kind="ServiceAccount"
                  meta={sa.metadata}
                  onDelete={() =>
                    useClusterStore
                      .getState()
                      .deleteServiceAccount(sa.metadata.uid)
                  }
                />
              ))}
              {nsRoles.map((r) => (
                <RbacRow
                  key={r.metadata.uid}
                  kind="Role"
                  meta={r.metadata}
                  onDelete={() =>
                    useClusterStore.getState().deleteRole(r.metadata.uid, false)
                  }
                />
              ))}
              {clusterRoles.map((r) => (
                <RbacRow
                  key={r.metadata.uid}
                  kind="ClusterRole"
                  meta={r.metadata}
                  onDelete={() =>
                    useClusterStore.getState().deleteRole(r.metadata.uid, true)
                  }
                />
              ))}
              {nsRoleBindings.map((rb) => (
                <RbacRow
                  key={rb.metadata.uid}
                  kind="RoleBinding"
                  meta={rb.metadata}
                  onDelete={() =>
                    useClusterStore
                      .getState()
                      .deleteRoleBinding(rb.metadata.uid, false)
                  }
                />
              ))}
              {clusterRoleBindings.map((rb) => (
                <RbacRow
                  key={rb.metadata.uid}
                  kind="ClusterRoleBinding"
                  meta={rb.metadata}
                  onDelete={() =>
                    useClusterStore
                      .getState()
                      .deleteRoleBinding(rb.metadata.uid, true)
                  }
                />
              ))}
              {nsResourceQuotas.map((q) => (
                <RbacRow
                  key={q.metadata.uid}
                  kind="ResourceQuota"
                  meta={q.metadata}
                  onDelete={() =>
                    useClusterStore
                      .getState()
                      .deleteResourceQuota(q.metadata.uid)
                  }
                />
              ))}
              {nsLimitRanges.map((l) => (
                <RbacRow
                  key={l.metadata.uid}
                  kind="LimitRange"
                  meta={l.metadata}
                  onDelete={() =>
                    useClusterStore.getState().deleteLimitRange(l.metadata.uid)
                  }
                />
              ))}
            </Section>
          )}

          {(priorityClasses.length > 0 || nsPDBs.length > 0) && (
            <Section label="Scheduling Policy">
              {priorityClasses.map((pc) => (
                <RbacRow
                  key={pc.metadata.uid}
                  kind="PriorityClass"
                  meta={pc.metadata}
                  onDelete={() =>
                    useClusterStore
                      .getState()
                      .deletePriorityClass(pc.metadata.uid)
                  }
                />
              ))}
              {nsPDBs.map((pdb) => (
                <RbacRow
                  key={pdb.metadata.uid}
                  kind="PodDisruptionBudget"
                  meta={pdb.metadata}
                  onDelete={() =>
                    useClusterStore
                      .getState()
                      .deletePodDisruptionBudget(pdb.metadata.uid)
                  }
                />
              ))}
            </Section>
          )}

          <ExtensibilitySection namespace={namespace} />
          <StorageAutoscaleSection namespace={namespace} />
        </div>

        <RecentRequests />
      </aside>
    </>
  );
}

function Section({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <p className="text-[10px] uppercase tracking-wider text-slate-500">
        {label}
      </p>
      {children}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Create form (all kinds)                                             */
/* ------------------------------------------------------------------ */

function CreateForm({ onDone }: { onDone: () => void }) {
  const store = useClusterStore();
  const namespace = store.namespace;
  const nsConfigMaps = store.configMaps.filter((c) => inNs(c, namespace));
  const nsSecrets = store.secrets.filter((c) => inNs(c, namespace));
  const nsPVCs = store.persistentVolumeClaims.filter((c) => inNs(c, namespace));

  const [kind, setKind] = useState<CreateKind>("Deployment");
  const [name, setName] = useState("");
  const [image, setImage] = useState("nginx:1.25");
  const [replicas, setReplicas] = useState(3);
  const [selector, setSelector] = useState("app=");
  const [svcType, setSvcType] = useState<ServiceType>("ClusterIP");
  const [port, setPort] = useState(80);
  const [targetPort, setTargetPort] = useState(80);
  const [host, setHost] = useState("app.local");
  const [path, setPath] = useState("/");
  const [targetService, setTargetService] = useState("");
  const [allowAll, setAllowAll] = useState(false);
  const [kvText, setKvText] = useState("");
  const [secretType, setSecretType] = useState<SecretType>("Opaque");
  const [size, setSize] = useState(5);
  const [storageClass, setStorageClass] = useState<string>(STORAGE_CLASSES[0]);
  const [accessMode, setAccessMode] = useState<string>(ACCESS_MODES[0]);
  const [refConfigMaps, setRefConfigMaps] = useState<string[]>([]);
  const [refSecrets, setRefSecrets] = useState<string[]>([]);
  const [refPvcs, setRefPvcs] = useState<string[]>([]);
  const [completions, setCompletions] = useState(3);
  const [parallelism, setParallelism] = useState(1);
  const [backoffLimit, setBackoffLimit] = useState(2);
  const [schedule, setSchedule] = useState("*/5 * * * *");
  // RBAC / admission fields
  const [ruleResources, setRuleResources] = useState("pods,services");
  const [ruleVerbs, setRuleVerbs] = useState("get,list,watch");
  const [clusterScope, setClusterScope] = useState(false);
  const [subjectKind, setSubjectKind] = useState<SubjectKind>("User");
  const [subjectName, setSubjectName] = useState("");
  const [roleRefName, setRoleRefName] = useState("");
  const [quotaHard, setQuotaHard] = useState("pods=5,services=3");
  // Phase 9 scheduling fields
  const [reqCpu, setReqCpu] = useState(0);
  const [reqMem, setReqMem] = useState(0);
  const [podNodeSelector, setPodNodeSelector] = useState("");
  const [podPriorityClass, setPodPriorityClass] = useState("");
  const [podToleration, setPodToleration] = useState("");
  const [pcValue, setPcValue] = useState(1000);
  const [pdbSelector, setPdbSelector] = useState("app=");
  const [pdbMinAvailable, setPdbMinAvailable] = useState(1);
  const priorityClasses = store.priorityClasses;

  const toggle = (
    list: string[],
    setList: (v: string[]) => void,
    value: string,
  ) => setList(list.includes(value) ? list.filter((x) => x !== value) : [...list, value]);

  const submit = () => {
    const refs = {
      configMaps: refConfigMaps,
      secrets: refSecrets,
      pvcs: refPvcs,
    };
    switch (kind) {
      case "Deployment":
        store.createDeployment({
          name: name.trim() || undefined,
          image: image.trim() || "nginx:1.25",
          replicas,
          refs,
        });
        break;
      case "ReplicaSet":
        store.createReplicaSet({
          name: name.trim() || undefined,
          image: image.trim() || "nginx:1.25",
          replicas,
          refs,
        });
        break;
      case "Pod":
        store.createPod({
          name: name.trim() || undefined,
          image: image.trim() || "nginx:1.25",
          refs,
          scheduling: {
            requests:
              reqCpu > 0 || reqMem > 0
                ? { cpu: reqCpu || undefined, memory: reqMem || undefined }
                : undefined,
            nodeSelector: podNodeSelector.trim()
              ? parseSelector(podNodeSelector)
              : undefined,
            priorityClassName: podPriorityClass || undefined,
            tolerations: podToleration.trim()
              ? [{ key: podToleration.trim(), operator: "Exists" }]
              : undefined,
          },
        });
        break;
      case "StatefulSet":
        store.createStatefulSet({
          name: name.trim() || undefined,
          image: image.trim() || "nginx:1.25",
          replicas,
          storage: size,
          storageClassName: storageClass,
        });
        break;
      case "DaemonSet":
        store.createDaemonSet({
          name: name.trim() || undefined,
          image: image.trim() || "nginx:1.25",
        });
        break;
      case "Job":
        store.createJob({
          name: name.trim() || undefined,
          image: image.trim() || "busybox:1.36",
          completions,
          parallelism,
          backoffLimit,
        });
        break;
      case "CronJob":
        store.createCronJob({
          name: name.trim() || undefined,
          image: image.trim() || "busybox:1.36",
          schedule,
          completions,
          parallelism,
          backoffLimit,
        });
        break;
      case "Service":
        store.createService({
          name: name.trim() || undefined,
          type: svcType,
          selector: parseSelector(selector),
          port,
          targetPort,
        });
        break;
      case "Ingress": {
        const svc = targetService || store.services[0]?.metadata.name || "";
        if (!svc) return;
        store.createIngress({
          name: name.trim() || undefined,
          rules: [{ host, path, serviceName: svc, servicePort: port }],
        });
        break;
      }
      case "NetworkPolicy":
        store.createNetworkPolicy({
          name: name.trim() || undefined,
          podSelector: parseSelector(selector),
          allowAll,
        });
        break;
      case "ConfigMap":
        store.createConfigMap({
          name: name.trim() || undefined,
          data: parseKeyValues(kvText),
        });
        break;
      case "Secret":
        store.createSecret({
          name: name.trim() || undefined,
          type: secretType,
          data: parseKeyValues(kvText),
        });
        break;
      case "PVC":
        store.createPVC({
          name: name.trim() || undefined,
          storage: size,
          accessModes: [accessMode],
          storageClassName: storageClass,
        });
        break;
      case "PV":
        store.createPV({
          name: name.trim() || undefined,
          capacity: size,
          accessModes: [accessMode],
          storageClassName: storageClass,
        });
        break;
      case "ServiceAccount":
        store.createServiceAccount(name.trim() || `sa-${Date.now()}`);
        break;
      case "Role":
        store.createRole({
          name: name.trim() || undefined,
          cluster: clusterScope,
          rules: [
            {
              apiGroups: [""],
              resources: parseCsv(ruleResources),
              verbs: parseCsv(ruleVerbs),
            },
          ],
        });
        break;
      case "RoleBinding": {
        const sName = subjectName.trim();
        const rName = roleRefName.trim();
        if (!sName || !rName) return;
        store.createRoleBinding({
          name: name.trim() || undefined,
          cluster: clusterScope,
          subjects: [
            {
              kind: subjectKind,
              name: sName,
              namespace:
                subjectKind === "ServiceAccount" ? namespace : undefined,
            },
          ],
          roleRef: {
            kind: clusterScope ? "ClusterRole" : "Role",
            name: rName,
          },
        });
        break;
      }
      case "ResourceQuota":
        store.createResourceQuota({
          name: name.trim() || undefined,
          hard: parseNumberMap(quotaHard),
        });
        break;
      case "LimitRange":
        store.createLimitRange({
          name: name.trim() || undefined,
          limits: [
            {
              type: "Container",
              default: { cpu: "500m", memory: "512Mi" },
              defaultRequest: { cpu: "250m", memory: "256Mi" },
            },
          ],
        });
        break;
      case "PriorityClass":
        store.createPriorityClass({
          name: name.trim() || undefined,
          value: pcValue,
        });
        break;
      case "PodDisruptionBudget":
        store.createPodDisruptionBudget({
          name: name.trim() || undefined,
          selector: parseSelector(pdbSelector),
          minAvailable: pdbMinAvailable,
        });
        break;
    }
    setName("");
    setRefConfigMaps([]);
    setRefSecrets([]);
    setRefPvcs([]);
    onDone();
  };

  const kinds: CreateKind[] = [
    "Deployment",
    "ReplicaSet",
    "Pod",
    "StatefulSet",
    "DaemonSet",
    "Job",
    "CronJob",
    "Service",
    "Ingress",
    "NetworkPolicy",
    "ConfigMap",
    "Secret",
    "PVC",
    "PV",
    "ServiceAccount",
    "Role",
    "RoleBinding",
    "ResourceQuota",
    "LimitRange",
    "PriorityClass",
    "PodDisruptionBudget",
  ];

  const workloadKind =
    kind === "Deployment" ||
    kind === "ReplicaSet" ||
    kind === "Pod" ||
    kind === "StatefulSet" ||
    kind === "DaemonSet" ||
    kind === "Job" ||
    kind === "CronJob";
  const refKind =
    kind === "Deployment" || kind === "ReplicaSet" || kind === "Pod";

  return (
    <div className="space-y-2.5 border-b border-panel-700 bg-panel-900/40 p-3">
      <div className="grid grid-cols-3 gap-1">
        {kinds.map((k) => (
          <button
            key={k}
            onClick={() => setKind(k)}
            className={`rounded-md border px-1 py-1 text-[9px] font-semibold transition ${
              kind === k
                ? "border-kube-500/60 bg-kube-500/15 text-kube-400"
                : "border-panel-700 bg-panel-900 text-slate-400 hover:bg-panel-800"
            }`}
          >
            {k}
          </button>
        ))}
      </div>

      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder={`name (auto: ${kind.toLowerCase()}-xxxxx)`}
        className={inputClass}
      />

      {workloadKind && (
        <input
          value={image}
          onChange={(e) => setImage(e.target.value)}
          placeholder="image (e.g. nginx:1.25)"
          className={inputClass}
        />
      )}

      {(kind === "Deployment" ||
        kind === "ReplicaSet" ||
        kind === "StatefulSet") && (
        <Labeled label="replicas">
          <Stepper value={replicas} onChange={setReplicas} min={0} max={12} />
        </Labeled>
      )}

      {kind === "StatefulSet" && (
        <Labeled label="storage (Gi)">
          <NumberInput value={size} onChange={setSize} />
        </Labeled>
      )}

      {kind === "CronJob" && (
        <input
          value={schedule}
          onChange={(e) => setSchedule(e.target.value)}
          placeholder="schedule (*/5 * * * *)"
          className={inputClass}
        />
      )}

      {(kind === "Job" || kind === "CronJob") && (
        <div className="grid grid-cols-3 gap-2">
          <Labeled label="compl.">
            <NumberInput value={completions} onChange={setCompletions} />
          </Labeled>
          <Labeled label="paral.">
            <NumberInput value={parallelism} onChange={setParallelism} />
          </Labeled>
          <Labeled label="backoff">
            <NumberInput value={backoffLimit} onChange={setBackoffLimit} />
          </Labeled>
        </div>
      )}

      {/* Workload consumption refs */}
      {refKind &&
        (nsConfigMaps.length > 0 ||
          nsSecrets.length > 0 ||
          nsPVCs.length > 0) && (
          <div className="space-y-1.5 rounded-md border border-panel-700 bg-panel-900 p-2">
            {nsConfigMaps.length > 0 && (
              <ChipGroup
                label="ConfigMaps"
                options={nsConfigMaps.map((c) => c.metadata.name)}
                selected={refConfigMaps}
                onToggle={(v) => toggle(refConfigMaps, setRefConfigMaps, v)}
              />
            )}
            {nsSecrets.length > 0 && (
              <ChipGroup
                label="Secrets"
                options={nsSecrets.map((c) => c.metadata.name)}
                selected={refSecrets}
                onToggle={(v) => toggle(refSecrets, setRefSecrets, v)}
              />
            )}
            {nsPVCs.length > 0 && (
              <ChipGroup
                label="PVCs"
                options={nsPVCs.map((c) => c.metadata.name)}
                selected={refPvcs}
                onToggle={(v) => toggle(refPvcs, setRefPvcs, v)}
              />
            )}
          </div>
        )}

      {kind === "Service" && (
        <>
          <select
            value={svcType}
            onChange={(e) => setSvcType(e.target.value as ServiceType)}
            className={inputClass}
          >
            {(
              [
                "ClusterIP",
                "NodePort",
                "LoadBalancer",
                "ExternalName",
              ] as ServiceType[]
            ).map((t) => (
              <option key={t} value={t} className="bg-panel-850">
                {t}
              </option>
            ))}
          </select>
          <input
            value={selector}
            onChange={(e) => setSelector(e.target.value)}
            placeholder="selector (app=my-deploy)"
            className={inputClass}
          />
          <div className="grid grid-cols-2 gap-2">
            <Labeled label="port">
              <NumberInput value={port} onChange={setPort} />
            </Labeled>
            <Labeled label="targetPort">
              <NumberInput value={targetPort} onChange={setTargetPort} />
            </Labeled>
          </div>
        </>
      )}

      {kind === "Ingress" && (
        <>
          <div className="grid grid-cols-2 gap-2">
            <input
              value={host}
              onChange={(e) => setHost(e.target.value)}
              placeholder="host"
              className={inputClass}
            />
            <input
              value={path}
              onChange={(e) => setPath(e.target.value)}
              placeholder="/path"
              className={inputClass}
            />
          </div>
          <select
            value={targetService}
            onChange={(e) => setTargetService(e.target.value)}
            className={inputClass}
          >
            <option value="">
              {store.services.length ? "select service…" : "no services yet"}
            </option>
            {store.services.map((s) => (
              <option
                key={s.metadata.uid}
                value={s.metadata.name}
                className="bg-panel-850"
              >
                {s.metadata.name}
              </option>
            ))}
          </select>
          <Labeled label="service port">
            <NumberInput value={port} onChange={setPort} />
          </Labeled>
        </>
      )}

      {kind === "NetworkPolicy" && (
        <>
          <input
            value={selector}
            onChange={(e) => setSelector(e.target.value)}
            placeholder="target pods (app=my-deploy)"
            className={inputClass}
          />
          <label className="flex items-center gap-2 text-[11px] text-slate-400">
            <input
              type="checkbox"
              checked={allowAll}
              onChange={(e) => setAllowAll(e.target.checked)}
              className="accent-kube-500"
            />
            allow all ingress (unchecked = default deny)
          </label>
        </>
      )}

      {(kind === "ConfigMap" || kind === "Secret") && (
        <>
          {kind === "Secret" && (
            <select
              value={secretType}
              onChange={(e) => setSecretType(e.target.value as SecretType)}
              className={inputClass}
            >
              {(
                [
                  "Opaque",
                  "kubernetes.io/tls",
                  "kubernetes.io/dockerconfigjson",
                ] as SecretType[]
              ).map((t) => (
                <option key={t} value={t} className="bg-panel-850">
                  {t}
                </option>
              ))}
            </select>
          )}
          <textarea
            value={kvText}
            onChange={(e) => setKvText(e.target.value)}
            rows={3}
            placeholder={"data (one per line):\nAPP_ENV=production\nLOG_LEVEL=info"}
            className={`${inputClass} resize-none font-mono`}
          />
        </>
      )}

      {(kind === "PVC" || kind === "PV") && (
        <>
          <Labeled label={kind === "PVC" ? "request (Gi)" : "capacity (Gi)"}>
            <NumberInput value={size} onChange={setSize} />
          </Labeled>
          <select
            value={storageClass}
            onChange={(e) => setStorageClass(e.target.value)}
            className={inputClass}
          >
            {STORAGE_CLASSES.map((sc) => (
              <option key={sc} value={sc} className="bg-panel-850">
                {sc}
              </option>
            ))}
          </select>
          <select
            value={accessMode}
            onChange={(e) => setAccessMode(e.target.value)}
            className={inputClass}
          >
            {ACCESS_MODES.map((am) => (
              <option key={am} value={am} className="bg-panel-850">
                {am}
              </option>
            ))}
          </select>
        </>
      )}

      {(kind === "Role" || kind === "RoleBinding") && (
        <label className="flex items-center gap-2 text-[11px] text-slate-400">
          <input
            type="checkbox"
            checked={clusterScope}
            onChange={(e) => setClusterScope(e.target.checked)}
            className="accent-kube-500"
          />
          cluster-scoped ({kind === "Role" ? "ClusterRole" : "ClusterRoleBinding"})
        </label>
      )}

      {kind === "Role" && (
        <>
          <input
            value={ruleResources}
            onChange={(e) => setRuleResources(e.target.value)}
            placeholder="resources (pods,services)"
            className={inputClass}
          />
          <input
            value={ruleVerbs}
            onChange={(e) => setRuleVerbs(e.target.value)}
            placeholder="verbs (get,list,watch)"
            className={inputClass}
          />
        </>
      )}

      {kind === "RoleBinding" && (
        <>
          <select
            value={subjectKind}
            onChange={(e) => setSubjectKind(e.target.value as SubjectKind)}
            className={inputClass}
          >
            {(["User", "Group", "ServiceAccount"] as SubjectKind[]).map((k) => (
              <option key={k} value={k} className="bg-panel-850">
                {k}
              </option>
            ))}
          </select>
          <input
            value={subjectName}
            onChange={(e) => setSubjectName(e.target.value)}
            placeholder="subject name (e.g. alice)"
            className={inputClass}
          />
          <input
            value={roleRefName}
            onChange={(e) => setRoleRefName(e.target.value)}
            placeholder={`${clusterScope ? "ClusterRole" : "Role"} name`}
            className={inputClass}
          />
        </>
      )}

      {kind === "ResourceQuota" && (
        <input
          value={quotaHard}
          onChange={(e) => setQuotaHard(e.target.value)}
          placeholder="hard (pods=5,services=3)"
          className={inputClass}
        />
      )}

      {kind === "LimitRange" && (
        <p className="rounded-md border border-panel-700 bg-panel-900 p-2 text-[10px] text-slate-500">
          Creates a container LimitRange with default request 250m/256Mi and
          limit 500m/512Mi.
        </p>
      )}

      {kind === "Pod" && (
        <div className="space-y-2 rounded-md border border-panel-700 bg-panel-900 p-2">
          <p className="text-[9px] uppercase tracking-wider text-slate-500">
            Scheduling (Phase 9)
          </p>
          <div className="grid grid-cols-2 gap-2">
            <Labeled label="cpu req">
              <input
                type="number"
                step={0.25}
                min={0}
                value={reqCpu}
                onChange={(e) => setReqCpu(Number(e.target.value))}
                className="w-16 rounded-md border border-panel-700 bg-panel-900 px-2 py-1 text-xs text-slate-200 outline-none focus:border-kube-500"
              />
            </Labeled>
            <Labeled label="mem req (Gi)">
              <input
                type="number"
                step={0.25}
                min={0}
                value={reqMem}
                onChange={(e) => setReqMem(Number(e.target.value))}
                className="w-16 rounded-md border border-panel-700 bg-panel-900 px-2 py-1 text-xs text-slate-200 outline-none focus:border-kube-500"
              />
            </Labeled>
          </div>
          <input
            value={podNodeSelector}
            onChange={(e) => setPodNodeSelector(e.target.value)}
            placeholder="nodeSelector (disktype=ssd)"
            className={inputClass}
          />
          <input
            value={podToleration}
            onChange={(e) => setPodToleration(e.target.value)}
            placeholder="tolerate taint key (e.g. gpu)"
            className={inputClass}
          />
          <select
            value={podPriorityClass}
            onChange={(e) => setPodPriorityClass(e.target.value)}
            className={inputClass}
          >
            <option value="" className="bg-panel-850">
              priorityClass: none
            </option>
            {priorityClasses.map((pc) => (
              <option
                key={pc.metadata.uid}
                value={pc.metadata.name}
                className="bg-panel-850"
              >
                {pc.metadata.name} ({pc.value})
              </option>
            ))}
          </select>
        </div>
      )}

      {kind === "PriorityClass" && (
        <Labeled label="value">
          <NumberInput value={pcValue} onChange={setPcValue} />
        </Labeled>
      )}

      {kind === "PodDisruptionBudget" && (
        <>
          <input
            value={pdbSelector}
            onChange={(e) => setPdbSelector(e.target.value)}
            placeholder="selector (app=web)"
            className={inputClass}
          />
          <Labeled label="minAvailable">
            <NumberInput value={pdbMinAvailable} onChange={setPdbMinAvailable} />
          </Labeled>
        </>
      )}

      <button
        onClick={submit}
        className="flex w-full items-center justify-center gap-1.5 rounded-md bg-kube-500 px-3 py-2 text-xs font-semibold text-white shadow-glow transition hover:bg-kube-400"
      >
        <Rocket className="h-4 w-4" />
        Create {kind}
      </button>
    </div>
  );
}

const inputClass =
  "w-full rounded-md border border-panel-700 bg-panel-900 px-2 py-1.5 text-xs text-slate-200 outline-none focus:border-kube-500";

function ChipGroup({
  label,
  options,
  selected,
  onToggle,
}: {
  label: string;
  options: string[];
  selected: string[];
  onToggle: (v: string) => void;
}) {
  return (
    <div>
      <p className="mb-1 text-[9px] uppercase tracking-wider text-slate-500">
        {label}
      </p>
      <div className="flex flex-wrap gap-1">
        {options.map((o) => (
          <button
            key={o}
            onClick={() => onToggle(o)}
            className={`rounded px-1.5 py-0.5 text-[9px] transition ${
              selected.includes(o)
                ? "bg-kube-500/25 text-kube-300"
                : "bg-panel-800 text-slate-400 hover:bg-panel-700"
            }`}
          >
            {o}
          </button>
        ))}
      </div>
    </div>
  );
}

function Labeled({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-[10px] uppercase tracking-wider text-slate-500">
        {label}
      </span>
      {children}
    </div>
  );
}

function NumberInput({
  value,
  onChange,
}: {
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <input
      type="number"
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      className="w-16 rounded-md border border-panel-700 bg-panel-900 px-2 py-1 text-xs text-slate-200 outline-none focus:border-kube-500"
    />
  );
}

/* ------------------------------------------------------------------ */
/* Rows                                                                */
/* ------------------------------------------------------------------ */

const RBAC_ICONS: Record<string, typeof Shield> = {
  ServiceAccount: UserCog,
  Role: KeyRound,
  ClusterRole: KeyRound,
  RoleBinding: Link2,
  ClusterRoleBinding: Link2,
  ResourceQuota: Scale,
  LimitRange: SlidersHorizontal,
  PriorityClass: ArrowUpNarrowWide,
  PodDisruptionBudget: ShieldAlert,
};

function RbacRow({
  kind,
  meta,
  onDelete,
}: {
  kind: string;
  meta: ObjectMeta;
  onDelete: () => void;
}) {
  const openDrawer = useClusterStore((s) => s.openDrawer);
  const Icon = RBAC_ICONS[kind] ?? ShieldCheck;
  return (
    <div className="group flex items-center gap-2 rounded-md border border-panel-700 bg-panel-900 px-2 py-1.5">
      <Icon className="h-3.5 w-3.5 shrink-0 text-kube-400" />
      <button
        onClick={() => openDrawer({ kind, name: meta.name, id: meta.uid })}
        className="min-w-0 flex-1 text-left"
      >
        <p className="truncate text-[11px] font-semibold text-slate-200">
          {meta.name}
        </p>
        <p className="text-[9px] uppercase tracking-wider text-slate-500">
          {kind}
        </p>
      </button>
      <button
        onClick={onDelete}
        className="rounded p-1 text-slate-600 opacity-0 transition hover:text-status-failed group-hover:opacity-100"
        aria-label={`Delete ${kind}`}
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

function InspectAsPicker({
  serviceAccounts,
  roleBindings,
  subject,
  onSelect,
  namespace,
}: {
  serviceAccounts: ServiceAccount[];
  roleBindings: RoleBinding[];
  subject: RbacSubjectSelection | null;
  onSelect: (s: RbacSubjectSelection | null) => void;
  namespace: string;
}) {
  // Build a list of selectable subjects: bound users/groups + service accounts.
  const options: RbacSubjectSelection[] = [];
  const seen = new Set<string>();
  const add = (s: RbacSubjectSelection) => {
    const id = `${s.kind}:${s.namespace ?? ""}:${s.name}`;
    if (!seen.has(id)) {
      seen.add(id);
      options.push(s);
    }
  };
  roleBindings.forEach((rb) =>
    rb.subjects.forEach((s) =>
      add({ kind: s.kind, name: s.name, namespace: s.namespace }),
    ),
  );
  serviceAccounts.forEach((sa) =>
    add({
      kind: "ServiceAccount",
      name: sa.metadata.name,
      namespace: namespace,
    }),
  );

  const value = subject
    ? `${subject.kind}:${subject.namespace ?? ""}:${subject.name}`
    : "";

  return (
    <div className="mb-1 rounded-md border border-kube-500/30 bg-kube-500/5 p-2">
      <p className="mb-1 flex items-center gap-1 text-[9px] uppercase tracking-wider text-kube-300">
        <Eye className="h-3 w-3" />
        Inspect as (permission overlay)
      </p>
      <select
        value={value}
        onChange={(e) => {
          const opt = options.find(
            (o) => `${o.kind}:${o.namespace ?? ""}:${o.name}` === e.target.value,
          );
          onSelect(opt ?? null);
        }}
        className={inputClass}
      >
        <option value="" className="bg-panel-850">
          — cluster-admin (no overlay) —
        </option>
        {options.map((o) => (
          <option
            key={`${o.kind}:${o.namespace ?? ""}:${o.name}`}
            value={`${o.kind}:${o.namespace ?? ""}:${o.name}`}
            className="bg-panel-850"
          >
            {o.kind === "ServiceAccount"
              ? `sa: ${o.namespace}/${o.name}`
              : `${o.kind.toLowerCase()}: ${o.name}`}
          </option>
        ))}
      </select>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Extensibility — CRDs, Custom Resources & sample operator (Phase 10) */
/* ------------------------------------------------------------------ */

function StorageAutoscaleSection({ namespace }: { namespace: string }) {
  const vpas = useClusterStore((s) => s.vpas);
  const volumeSnapshots = useClusterStore((s) => s.volumeSnapshots);
  const deployments = useClusterStore((s) => s.deployments);
  const statefulSets = useClusterStore((s) => s.statefulSets);
  const createVPA = useClusterStore((s) => s.createVPA);
  const deleteVPA = useClusterStore((s) => s.deleteVPA);
  const restoreVolumeSnapshot = useClusterStore((s) => s.restoreVolumeSnapshot);
  const deleteVolumeSnapshot = useClusterStore((s) => s.deleteVolumeSnapshot);

  const nsVpas = vpas.filter((v) => v.metadata.namespace === namespace);
  const nsSnaps = volumeSnapshots.filter((v) => v.metadata.namespace === namespace);
  const targets = [
    ...deployments
      .filter((d) => d.metadata.namespace === namespace)
      .map((d) => ({ kind: "Deployment" as const, name: d.metadata.name })),
    ...statefulSets
      .filter((s) => s.metadata.namespace === namespace)
      .map((s) => ({ kind: "StatefulSet" as const, name: s.metadata.name })),
  ];
  const [target, setTarget] = useState("");

  if (nsVpas.length === 0 && nsSnaps.length === 0 && targets.length === 0)
    return null;

  return (
    <Section label="Storage & Autoscaling">
      {targets.length > 0 && (
        <div className="flex items-center gap-1.5">
          <select
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            className={inputClass}
          >
            <option value="" className="bg-panel-850">
              VPA target…
            </option>
            {targets.map((t) => (
              <option
                key={`${t.kind}/${t.name}`}
                value={`${t.kind}/${t.name}`}
                className="bg-panel-850"
              >
                {t.kind}/{t.name}
              </option>
            ))}
          </select>
          <button
            onClick={() => {
              if (!target) return;
              const [kind, name] = target.split("/");
              createVPA({
                targetKind: kind as "Deployment" | "StatefulSet",
                targetName: name,
                mode: "Auto",
              });
              setTarget("");
            }}
            disabled={!target}
            className="shrink-0 rounded-md border border-kube-500/50 bg-kube-500/15 px-2 py-1.5 text-[10px] font-semibold text-kube-400 transition hover:bg-kube-500/25 disabled:opacity-40"
          >
            + VPA
          </button>
        </div>
      )}

      {nsVpas.map((vpa) => (
        <div
          key={vpa.metadata.uid}
          className="flex items-center gap-2 rounded-md border border-panel-700 bg-panel-900 px-2 py-1.5"
        >
          <ArrowUpNarrowWide className="h-3.5 w-3.5 shrink-0 text-kube-400" />
          <button
            onClick={() =>
              useClusterStore.getState().openDrawer({
                kind: "VerticalPodAutoscaler",
                name: vpa.metadata.name,
                id: vpa.metadata.uid,
              })
            }
            className="min-w-0 flex-1 text-left"
          >
            <p className="truncate text-[11px] font-semibold text-slate-200">
              {vpa.spec.targetRef.kind}/{vpa.spec.targetRef.name}
            </p>
            <p className="text-[9px] text-slate-500">
              rec cpu={vpa.status.recommendedCpu} mem=
              {vpa.status.recommendedMemory}Gi · {vpa.spec.mode}
            </p>
          </button>
          <button
            onClick={() => deleteVPA(vpa.metadata.uid)}
            className="rounded p-1 text-slate-600 transition hover:text-status-failed"
            aria-label="Delete VPA"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}

      {nsSnaps.map((snap) => (
        <div
          key={snap.metadata.uid}
          className="flex items-center gap-2 rounded-md border border-panel-700 bg-panel-900 px-2 py-1.5"
        >
          <Camera className="h-3.5 w-3.5 shrink-0 text-emerald-400" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-[11px] font-semibold text-slate-200">
              {snap.metadata.name}
            </p>
            <p className="text-[9px] text-slate-500">
              {snap.spec.sourcePVC} ·{" "}
              {snap.status.readyToUse ? "ready" : "provisioning…"}
            </p>
          </div>
          <button
            onClick={() => restoreVolumeSnapshot(snap.metadata.uid)}
            disabled={!snap.status.readyToUse}
            className="rounded bg-kube-500/15 px-1.5 py-0.5 text-[9px] font-semibold text-kube-400 transition hover:bg-kube-500/25 disabled:opacity-40"
          >
            Restore
          </button>
          <button
            onClick={() => deleteVolumeSnapshot(snap.metadata.uid)}
            className="rounded p-0.5 text-slate-600 transition hover:text-status-failed"
            aria-label="Delete snapshot"
          >
            <Trash2 className="h-3 w-3" />
          </button>
        </div>
      ))}
    </Section>
  );
}

function ExtensibilitySection({ namespace }: { namespace: string }) {
  const crds = useClusterStore((s) => s.crds);
  const customResources = useClusterStore((s) => s.customResources);
  const registerSampleOperator = useClusterStore((s) => s.registerSampleOperator);
  const deleteCRD = useClusterStore((s) => s.deleteCRD);
  const deleteCustomResource = useClusterStore((s) => s.deleteCustomResource);

  const hasOperator = crds.some((c) => c.operator === "Database");

  return (
    <Section label="Extensibility (CRDs)">
      {!hasOperator && (
        <button
          onClick={registerSampleOperator}
          className="flex w-full items-center justify-center gap-1.5 rounded-md border border-kube-500/50 bg-kube-500/15 px-2 py-1.5 text-[11px] font-semibold text-kube-400 transition hover:bg-kube-500/25"
        >
          <Boxes className="h-3.5 w-3.5" />
          Register sample Database operator
        </button>
      )}

      {crds.map((crd) => {
        const crs = customResources.filter(
          (cr) =>
            cr.kind === crd.spec.names.kind &&
            (crd.spec.scope === "Cluster" || cr.metadata.namespace === namespace),
        );
        return (
          <div
            key={crd.metadata.uid}
            className="space-y-1.5 rounded-md border border-panel-700 bg-panel-900 p-2"
          >
            <div className="flex items-center gap-2">
              <Blocks className="h-3.5 w-3.5 shrink-0 text-kube-400" />
              <button
                onClick={() =>
                  useClusterStore.getState().openDrawer({
                    kind: "CustomResourceDefinition",
                    name: crd.metadata.name,
                    id: crd.metadata.uid,
                  })
                }
                className="min-w-0 flex-1 text-left"
              >
                <p className="truncate text-[11px] font-semibold text-slate-200">
                  {crd.spec.names.kind}
                  {crd.operator && (
                    <span className="ml-1 rounded bg-kube-500/20 px-1 text-[8px] text-kube-300">
                      operator
                    </span>
                  )}
                </p>
                <p className="truncate text-[9px] text-slate-500">
                  {crd.metadata.name}
                </p>
              </button>
              <button
                onClick={() => deleteCRD(crd.metadata.uid)}
                className="rounded p-1 text-slate-600 transition hover:text-status-failed"
                aria-label="Delete CRD"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>

            <CustomResourceForm crd={crd} />

            {crs.map((cr) => (
              <div
                key={cr.metadata.uid}
                className="flex items-center gap-2 rounded border border-panel-700 bg-panel-850 px-2 py-1"
              >
                <span className="min-w-0 flex-1 truncate text-[10px] text-slate-300">
                  <button
                    onClick={() =>
                      useClusterStore.getState().openDrawer({
                        kind: cr.kind,
                        name: cr.metadata.name,
                        id: cr.metadata.uid,
                      })
                    }
                    className="truncate hover:text-kube-300"
                  >
                    {cr.metadata.name}
                  </button>
                  <span className="ml-1 text-[9px] text-slate-600">
                    {Object.entries(cr.spec)
                      .slice(0, 2)
                      .map(([k, v]) => `${k}=${v}`)
                      .join(" ")}
                  </span>
                </span>
                <button
                  onClick={() => deleteCustomResource(cr.metadata.uid)}
                  className="rounded p-0.5 text-slate-600 transition hover:text-status-failed"
                  aria-label="Delete custom resource"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        );
      })}
    </Section>
  );
}

function CustomResourceForm({ crd }: { crd: import("@/store/types").CustomResourceDefinition }) {
  const createCustomResource = useClusterStore((s) => s.createCustomResource);
  const [name, setName] = useState("");
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(crd.spec.schema.map((f) => [f.name, f.default ?? ""])),
  );

  const submit = () => {
    const spec: Record<string, string | number | boolean> = {};
    for (const f of crd.spec.schema) {
      const raw = values[f.name] ?? "";
      spec[f.name] =
        f.type === "number"
          ? Number(raw) || 0
          : f.type === "boolean"
            ? raw === "true"
            : raw;
    }
    createCustomResource({ crdId: crd.metadata.uid, name: name.trim() || undefined, spec });
    setName("");
    setValues(
      Object.fromEntries(crd.spec.schema.map((f) => [f.name, f.default ?? ""])),
    );
  };

  return (
    <div className="space-y-1.5 border-t border-panel-700 pt-1.5">
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder={`${crd.spec.names.singular} name (auto)`}
        className={inputClass}
      />
      {crd.spec.schema.map((f) => (
        <div key={f.name} className="flex items-center justify-between gap-2">
          <span className="text-[10px] text-slate-500">{f.name}</span>
          {f.type === "boolean" ? (
            <select
              value={values[f.name]}
              onChange={(e) =>
                setValues((v) => ({ ...v, [f.name]: e.target.value }))
              }
              className="w-28 rounded-md border border-panel-700 bg-panel-900 px-2 py-1 text-xs text-slate-200 outline-none focus:border-kube-500"
            >
              <option value="false">false</option>
              <option value="true">true</option>
            </select>
          ) : (
            <input
              type={f.type === "number" ? "number" : "text"}
              value={values[f.name]}
              onChange={(e) =>
                setValues((v) => ({ ...v, [f.name]: e.target.value }))
              }
              className="w-28 rounded-md border border-panel-700 bg-panel-900 px-2 py-1 text-xs text-slate-200 outline-none focus:border-kube-500"
            />
          )}
        </div>
      ))}
      <button
        onClick={submit}
        className="flex w-full items-center justify-center gap-1 rounded-md bg-kube-500 px-2 py-1 text-[10px] font-semibold text-white transition hover:bg-kube-400"
      >
        <Plus className="h-3 w-3" />
        Create {crd.spec.names.kind}
      </button>
    </div>
  );
}

function DeploymentRow({
  deployment: d,
  replicaSets,
}: {
  deployment: Deployment;
  replicaSets: ReplicaSet[];
}) {
  const scaleDeployment = useClusterStore((s) => s.scaleDeployment);
  const updateDeploymentImage = useClusterStore((s) => s.updateDeploymentImage);
  const rollbackDeployment = useClusterStore((s) => s.rollbackDeployment);
  const deleteDeployment = useClusterStore((s) => s.deleteDeployment);
  const openDrawer = useClusterStore((s) => s.openDrawer);

  const currentImage = d.spec.template.containers[0]?.image ?? "";
  const [imageInput, setImageInput] = useState(currentImage);

  return (
    <div className="rounded-lg border border-panel-700 bg-panel-850">
      <div
        className="flex cursor-pointer items-center justify-between gap-2 border-b border-panel-700 px-2.5 py-2"
        onClick={() =>
          openDrawer({
            kind: "Deployment",
            name: d.metadata.name,
            id: d.metadata.uid,
          })
        }
      >
        <div className="flex min-w-0 items-center gap-1.5">
          <span
            className="h-2.5 w-2.5 shrink-0 rounded-sm"
            style={{ backgroundColor: d.color }}
          />
          <span className="truncate text-xs font-bold text-white">
            {d.metadata.name}
          </span>
          {d.rollout && (
            <span className="shrink-0 rounded bg-status-pending/15 px-1 text-[9px] text-status-pending">
              rolling
            </span>
          )}
        </div>
        <AttachHPAButton kind="Deployment" name={d.metadata.name} uid={d.metadata.uid} />
        <button
          onClick={(e) => {
            e.stopPropagation();
            deleteDeployment(d.metadata.uid);
          }}
          className="shrink-0 rounded p-0.5 text-slate-600 transition hover:text-status-failed"
          title="Delete deployment"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="space-y-2 px-2.5 py-2">
        <div className="flex items-center justify-between text-[11px]">
          <span className="text-slate-500">
            Desired{" "}
            <span className="font-semibold text-slate-300">
              {d.spec.replicas}
            </span>{" "}
            · Ready{" "}
            <span className="font-semibold text-status-running">
              {d.status.readyReplicas}
            </span>
          </span>
          <Stepper
            value={d.spec.replicas}
            onChange={(v) => scaleDeployment(d.metadata.uid, v)}
            min={0}
            max={12}
          />
        </div>

        {replicaSets
          .filter((rs) => rs.spec.replicas > 0 || rs.status.replicas > 0)
          .sort((a, b) => b.revision - a.revision)
          .map((rs) => (
            <div
              key={rs.metadata.uid}
              className="flex items-center gap-1.5 rounded bg-panel-900 px-1.5 py-1 text-[10px]"
            >
              <span
                className="h-1.5 w-1.5 rounded-full"
                style={{ backgroundColor: rs.color }}
              />
              <span className="truncate text-slate-400">
                rev{rs.revision} · {rs.image}
              </span>
              <span className="ml-auto shrink-0 tabular-nums text-slate-500">
                {rs.status.readyReplicas}/{rs.spec.replicas}
              </span>
              {rs.metadata.uid === d.activeReplicaSetId && !d.rollout && (
                <span className="shrink-0 text-status-running">active</span>
              )}
            </div>
          ))}

        <div className="flex items-center gap-1">
          <input
            value={imageInput}
            onChange={(e) => setImageInput(e.target.value)}
            className="min-w-0 flex-1 rounded border border-panel-700 bg-panel-900 px-1.5 py-1 text-[10px] text-slate-200 outline-none focus:border-kube-500"
          />
          <button
            onClick={() => updateDeploymentImage(d.metadata.uid, imageInput)}
            title="Update image (rolling update)"
            className="flex shrink-0 items-center gap-0.5 rounded bg-kube-500/15 px-1.5 py-1 text-[10px] font-semibold text-kube-400 hover:bg-kube-500/25"
          >
            <RefreshCw className="h-3 w-3" />
            Update
          </button>
          <button
            onClick={() => rollbackDeployment(d.metadata.uid)}
            title="Rollback to previous revision"
            className="flex shrink-0 items-center gap-0.5 rounded bg-panel-700 px-1.5 py-1 text-[10px] text-slate-300 hover:bg-panel-600"
          >
            <Undo2 className="h-3 w-3" />
          </button>
        </div>
      </div>
    </div>
  );
}

function ReplicaSetRow({ rs }: { rs: ReplicaSet }) {
  const scaleReplicaSet = useClusterStore((s) => s.scaleReplicaSet);
  const deleteReplicaSet = useClusterStore((s) => s.deleteReplicaSet);
  const openDrawer = useClusterStore((s) => s.openDrawer);

  return (
    <div className="rounded-lg border border-panel-700 bg-panel-850">
      <div
        className="flex cursor-pointer items-center justify-between gap-2 border-b border-panel-700 px-2.5 py-2"
        onClick={() =>
          openDrawer({
            kind: "ReplicaSet",
            name: rs.metadata.name,
            id: rs.metadata.uid,
          })
        }
      >
        <div className="flex min-w-0 items-center gap-1.5">
          <span
            className="h-2.5 w-2.5 shrink-0 rounded-sm"
            style={{ backgroundColor: rs.color }}
          />
          <span className="truncate text-xs font-bold text-white">
            {rs.metadata.name}
          </span>
        </div>
        <button
          onClick={(e) => {
            e.stopPropagation();
            deleteReplicaSet(rs.metadata.uid);
          }}
          className="shrink-0 rounded p-0.5 text-slate-600 transition hover:text-status-failed"
          title="Delete ReplicaSet"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="flex items-center justify-between px-2.5 py-2 text-[11px]">
        <span className="text-slate-500">
          Desired{" "}
          <span className="font-semibold text-slate-300">
            {rs.spec.replicas}
          </span>{" "}
          · Current{" "}
          <span className="font-semibold text-status-running">
            {rs.status.replicas}
          </span>
        </span>
        <Stepper
          value={rs.spec.replicas}
          onChange={(v) => scaleReplicaSet(rs.metadata.uid, v)}
          min={0}
          max={12}
        />
      </div>
    </div>
  );
}

function PodRow({ pod }: { pod: Pod }) {
  const killPod = useClusterStore((s) => s.killPod);
  const deletePod = useClusterStore((s) => s.deletePod);
  const openDrawer = useClusterStore((s) => s.openDrawer);

  return (
    <div
      className="flex cursor-pointer items-center gap-2 rounded-md border border-panel-700 bg-panel-850 px-2 py-1.5"
      onClick={() =>
        openDrawer({ kind: "Pod", name: pod.metadata.name, id: pod.metadata.uid })
      }
    >
      <span className="min-w-0 flex-1 truncate text-[11px] text-slate-300">
        {pod.metadata.name}
      </span>
      <span className={`text-[10px] ${phaseTextClass(pod.status.phase)}`}>
        {pod.status.phase}
      </span>
      <button
        onClick={(e) => {
          e.stopPropagation();
          killPod(pod.metadata.uid);
        }}
        className="shrink-0 rounded p-0.5 text-slate-600 hover:text-status-failed"
        title="Kill pod"
      >
        <Skull className="h-3 w-3" />
      </button>
      <button
        onClick={(e) => {
          e.stopPropagation();
          deletePod(pod.metadata.uid);
        }}
        className="shrink-0 rounded p-0.5 text-slate-600 hover:text-status-failed"
        title="Delete pod"
      >
        <Trash2 className="h-3 w-3" />
      </button>
    </div>
  );
}

function ServiceRow({ service }: { service: Service }) {
  const deleteService = useClusterStore((s) => s.deleteService);
  const openDrawer = useClusterStore((s) => s.openDrawer);
  const requestService = useFlowStore((s) => s.requestService);
  const bulkRequestService = useFlowStore((s) => s.bulkRequestService);

  return (
    <div className="rounded-md border border-panel-700 bg-panel-850 px-2 py-1.5">
      <div className="flex items-center gap-1.5">
        <Network className="h-3.5 w-3.5" style={{ color: service.color }} />
        <span
          className="min-w-0 flex-1 cursor-pointer truncate text-xs font-semibold text-white"
          onClick={() =>
            openDrawer({
              kind: "Service",
              name: service.metadata.name,
              id: service.metadata.uid,
            })
          }
        >
          {service.metadata.name}
        </span>
        <span className="rounded bg-panel-700 px-1 text-[9px] text-slate-400">
          {service.spec.type}
        </span>
        <button
          onClick={() => deleteService(service.metadata.uid)}
          className="rounded p-0.5 text-slate-600 hover:text-status-failed"
          title="Delete service"
        >
          <Trash2 className="h-3 w-3" />
        </button>
      </div>
      <div className="mt-1 flex items-center gap-1">
        <button
          onClick={() => requestService(service.metadata.uid)}
          className="flex items-center gap-0.5 rounded bg-kube-500/15 px-1.5 py-0.5 text-[9px] font-semibold text-kube-400 hover:bg-kube-500/25"
        >
          <Send className="h-2.5 w-2.5" />
          Send
        </button>
        <button
          onClick={() => bulkRequestService(service.metadata.uid, 10)}
          className="flex items-center gap-0.5 rounded bg-panel-700 px-1.5 py-0.5 text-[9px] font-semibold text-slate-300 hover:bg-panel-600"
        >
          <Zap className="h-2.5 w-2.5" />
          x10
        </button>
      </div>
    </div>
  );
}

function IngressRow({ ingress }: { ingress: Ingress }) {
  const deleteIngress = useClusterStore((s) => s.deleteIngress);
  const openDrawer = useClusterStore((s) => s.openDrawer);
  const requestIngressRule = useFlowStore((s) => s.requestIngressRule);

  return (
    <div className="rounded-md border border-panel-700 bg-panel-850 px-2 py-1.5">
      <div className="flex items-center gap-1.5">
        <Waypoints className="h-3.5 w-3.5 text-amber-400" />
        <span
          className="min-w-0 flex-1 cursor-pointer truncate text-xs font-semibold text-white"
          onClick={() =>
            openDrawer({
              kind: "Ingress",
              name: ingress.metadata.name,
              id: ingress.metadata.uid,
            })
          }
        >
          {ingress.metadata.name}
        </span>
        <button
          onClick={() => deleteIngress(ingress.metadata.uid)}
          className="rounded p-0.5 text-slate-600 hover:text-status-failed"
          title="Delete ingress"
        >
          <Trash2 className="h-3 w-3" />
        </button>
      </div>
      {ingress.spec.rules.map((rule, i) => (
        <div key={i} className="mt-1 flex items-center gap-1.5 text-[9px]">
          <span className="min-w-0 flex-1 truncate text-slate-400">
            {rule.host}
            {rule.path} → {rule.serviceName}
          </span>
          <button
            onClick={() => requestIngressRule(ingress.metadata.uid, i)}
            className="flex items-center gap-0.5 rounded bg-amber-500/15 px-1.5 py-0.5 font-semibold text-amber-400 hover:bg-amber-500/25"
          >
            <Send className="h-2.5 w-2.5" />
            Send
          </button>
        </div>
      ))}
    </div>
  );
}

function NetworkPolicyRow({ np }: { np: NetworkPolicy }) {
  const deleteNetworkPolicy = useClusterStore((s) => s.deleteNetworkPolicy);
  const openDrawer = useClusterStore((s) => s.openDrawer);
  const selectorText = Object.entries(np.spec.podSelector)
    .map(([k, v]) => `${k}=${v}`)
    .join(",");

  return (
    <div className="flex items-center gap-1.5 rounded-md border border-panel-700 bg-panel-850 px-2 py-1.5">
      <ShieldBan
        className={`h-3.5 w-3.5 ${
          np.spec.allowAll ? "text-status-running" : "text-status-failed"
        }`}
      />
      <span
        className="min-w-0 flex-1 cursor-pointer truncate text-xs font-semibold text-white"
        onClick={() =>
          openDrawer({
            kind: "NetworkPolicy",
            name: np.metadata.name,
            id: np.metadata.uid,
          })
        }
      >
        {np.metadata.name}
      </span>
      <span className="truncate text-[9px] text-slate-500">{selectorText}</span>
      <button
        onClick={() => deleteNetworkPolicy(np.metadata.uid)}
        className="rounded p-0.5 text-slate-600 hover:text-status-failed"
        title="Delete network policy"
      >
        <Trash2 className="h-3 w-3" />
      </button>
    </div>
  );
}

function ConfigMapRow({ cm }: { cm: ConfigMap }) {
  const deleteConfigMap = useClusterStore((s) => s.deleteConfigMap);
  const openDrawer = useClusterStore((s) => s.openDrawer);
  return (
    <div className="flex items-center gap-1.5 rounded-md border border-panel-700 bg-panel-850 px-2 py-1.5">
      <FileText className="h-3.5 w-3.5 text-sky-400" />
      <span
        className="min-w-0 flex-1 cursor-pointer truncate text-xs font-semibold text-white"
        onClick={() =>
          openDrawer({ kind: "ConfigMap", name: cm.metadata.name, id: cm.metadata.uid })
        }
      >
        {cm.metadata.name}
      </span>
      <span className="text-[9px] text-slate-500">
        {Object.keys(cm.data).length} keys
      </span>
      <button
        onClick={() => deleteConfigMap(cm.metadata.uid)}
        className="rounded p-0.5 text-slate-600 hover:text-status-failed"
        title="Delete ConfigMap"
      >
        <Trash2 className="h-3 w-3" />
      </button>
    </div>
  );
}

function SecretRow({ secret }: { secret: Secret }) {
  const deleteSecret = useClusterStore((s) => s.deleteSecret);
  const openDrawer = useClusterStore((s) => s.openDrawer);
  return (
    <div className="flex items-center gap-1.5 rounded-md border border-panel-700 bg-panel-850 px-2 py-1.5">
      <Lock className="h-3.5 w-3.5 text-amber-400" />
      <span
        className="min-w-0 flex-1 cursor-pointer truncate text-xs font-semibold text-white"
        onClick={() =>
          openDrawer({ kind: "Secret", name: secret.metadata.name, id: secret.metadata.uid })
        }
      >
        {secret.metadata.name}
      </span>
      <span className="text-[9px] text-slate-500">
        {Object.keys(secret.data).length} keys
      </span>
      <button
        onClick={() => deleteSecret(secret.metadata.uid)}
        className="rounded p-0.5 text-slate-600 hover:text-status-failed"
        title="Delete Secret"
      >
        <Trash2 className="h-3 w-3" />
      </button>
    </div>
  );
}

function PVCRow({ pvc }: { pvc: PersistentVolumeClaim }) {
  const deletePVC = useClusterStore((s) => s.deletePVC);
  const resizePVC = useClusterStore((s) => s.resizePVC);
  const createVolumeSnapshot = useClusterStore((s) => s.createVolumeSnapshot);
  const openDrawer = useClusterStore((s) => s.openDrawer);
  return (
    <div className="flex items-center gap-1.5 rounded-md border border-panel-700 bg-panel-850 px-2 py-1.5">
      <Database className="h-3.5 w-3.5 text-emerald-400" />
      <span
        className="min-w-0 flex-1 cursor-pointer truncate text-xs font-semibold text-white"
        onClick={() =>
          openDrawer({
            kind: "PersistentVolumeClaim",
            name: pvc.metadata.name,
            id: pvc.metadata.uid,
          })
        }
      >
        {pvc.metadata.name}
      </span>
      <span className="text-[9px] text-slate-500">
        {pvc.spec.storage}Gi · {pvc.status.phase}
      </span>
      <button
        onClick={() => resizePVC(pvc.metadata.uid, pvc.spec.storage + 5)}
        className="rounded p-0.5 text-slate-500 hover:text-kube-400"
        title="Expand +5Gi"
      >
        <Plus className="h-3 w-3" />
      </button>
      <button
        onClick={() => createVolumeSnapshot(pvc.metadata.uid)}
        className="rounded p-0.5 text-slate-500 hover:text-kube-400"
        title="Snapshot PVC"
      >
        <Camera className="h-3 w-3" />
      </button>
      <button
        onClick={() => deletePVC(pvc.metadata.uid)}
        className="rounded p-0.5 text-slate-600 hover:text-status-failed"
        title="Delete PVC"
      >
        <Trash2 className="h-3 w-3" />
      </button>
    </div>
  );
}

function PVRow({ pv }: { pv: PersistentVolume }) {
  const deletePV = useClusterStore((s) => s.deletePV);
  const openDrawer = useClusterStore((s) => s.openDrawer);
  return (
    <div className="flex items-center gap-1.5 rounded-md border border-panel-700 bg-panel-850 px-2 py-1.5">
      <HardDrive className="h-3.5 w-3.5 text-slate-400" />
      <span
        className="min-w-0 flex-1 cursor-pointer truncate text-xs font-semibold text-white"
        onClick={() =>
          openDrawer({
            kind: "PersistentVolume",
            name: pv.metadata.name,
            id: pv.metadata.uid,
          })
        }
      >
        {pv.metadata.name}
      </span>
      <span className="text-[9px] text-slate-500">
        {pv.spec.capacity}Gi · {pv.status.phase}
      </span>
      <button
        onClick={() => deletePV(pv.metadata.uid)}
        className="rounded p-0.5 text-slate-600 hover:text-status-failed"
        title="Delete PV"
      >
        <Trash2 className="h-3 w-3" />
      </button>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Advanced workload rows                                              */
/* ------------------------------------------------------------------ */

function AttachHPAButton({
  kind,
  name,
  uid,
}: {
  kind: "Deployment" | "ReplicaSet" | "StatefulSet";
  name: string;
  uid: string;
}) {
  const createHPA = useClusterStore((s) => s.createHPA);
  const hasHpa = useClusterStore((s) =>
    s.hpas.some((h) => h.spec.scaleTargetRef.uid === uid),
  );
  if (hasHpa) return null;
  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        createHPA({
          targetKind: kind,
          targetName: name,
          targetUid: uid,
          minReplicas: 2,
          maxReplicas: 8,
          targetCPUUtilizationPercentage: 70,
        });
      }}
      title="Attach HorizontalPodAutoscaler"
      className="shrink-0 rounded p-0.5 text-slate-600 transition hover:text-kube-400"
    >
      <GaugeIcon className="h-3.5 w-3.5" />
    </button>
  );
}

function StatefulSetRow({ ss }: { ss: StatefulSet }) {
  const scaleStatefulSet = useClusterStore((s) => s.scaleStatefulSet);
  const deleteStatefulSet = useClusterStore((s) => s.deleteStatefulSet);
  const openDrawer = useClusterStore((s) => s.openDrawer);

  return (
    <div className="rounded-lg border border-panel-700 bg-panel-850">
      <div
        className="flex cursor-pointer items-center gap-2 border-b border-panel-700 px-2.5 py-2"
        onClick={() =>
          openDrawer({ kind: "StatefulSet", name: ss.metadata.name, id: ss.metadata.uid })
        }
      >
        <Blocks className="h-3.5 w-3.5" style={{ color: ss.color }} />
        <span className="min-w-0 flex-1 truncate text-xs font-bold text-white">
          {ss.metadata.name}
        </span>
        <AttachHPAButton kind="StatefulSet" name={ss.metadata.name} uid={ss.metadata.uid} />
        <button
          onClick={(e) => {
            e.stopPropagation();
            deleteStatefulSet(ss.metadata.uid);
          }}
          className="shrink-0 rounded p-0.5 text-slate-600 hover:text-status-failed"
          title="Delete StatefulSet"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="flex items-center justify-between px-2.5 py-2 text-[11px]">
        <span className="text-slate-500">
          Ready{" "}
          <span className="font-semibold text-status-running">
            {ss.status.readyReplicas}
          </span>
          /{ss.spec.replicas}
          {ss.spec.volumeClaimTemplate && (
            <span className="ml-1 text-slate-600">· PVC/pod</span>
          )}
        </span>
        <Stepper
          value={ss.spec.replicas}
          onChange={(v) => scaleStatefulSet(ss.metadata.uid, v)}
          min={0}
          max={10}
        />
      </div>
    </div>
  );
}

function DaemonSetRow({ ds }: { ds: DaemonSet }) {
  const deleteDaemonSet = useClusterStore((s) => s.deleteDaemonSet);
  const openDrawer = useClusterStore((s) => s.openDrawer);
  return (
    <div className="flex items-center gap-1.5 rounded-md border border-panel-700 bg-panel-850 px-2 py-1.5">
      <Shield className="h-3.5 w-3.5 text-fuchsia-400" />
      <span
        className="min-w-0 flex-1 cursor-pointer truncate text-xs font-semibold text-white"
        onClick={() =>
          openDrawer({ kind: "DaemonSet", name: ds.metadata.name, id: ds.metadata.uid })
        }
      >
        {ds.metadata.name}
      </span>
      <span className="text-[9px] text-slate-500">
        {ds.status.numberReady}/{ds.status.desiredNumberScheduled} nodes
      </span>
      <button
        onClick={() => deleteDaemonSet(ds.metadata.uid)}
        className="rounded p-0.5 text-slate-600 hover:text-status-failed"
        title="Delete DaemonSet"
      >
        <Trash2 className="h-3 w-3" />
      </button>
    </div>
  );
}

function JobRow({ job }: { job: Job }) {
  const forceFailJob = useClusterStore((s) => s.forceFailJob);
  const deleteJob = useClusterStore((s) => s.deleteJob);
  const openDrawer = useClusterStore((s) => s.openDrawer);
  const pct = Math.min(
    100,
    Math.round((job.status.succeeded / job.spec.completions) * 100),
  );
  const badge =
    job.status.phase === "Complete"
      ? "text-status-running"
      : job.status.phase === "Failed"
        ? "text-status-failed"
        : "text-status-pending";

  return (
    <div className="rounded-md border border-panel-700 bg-panel-850 px-2 py-1.5">
      <div className="flex items-center gap-1.5">
        <Repeat className="h-3.5 w-3.5 text-emerald-400" />
        <span
          className="min-w-0 flex-1 cursor-pointer truncate text-xs font-semibold text-white"
          onClick={() =>
            openDrawer({ kind: "Job", name: job.metadata.name, id: job.metadata.uid })
          }
        >
          {job.metadata.name}
        </span>
        <span className={`text-[9px] font-semibold ${badge}`}>
          {job.status.phase}
        </span>
        <button
          onClick={() => forceFailJob(job.metadata.uid)}
          title="Toggle forced-failure mode"
          className={`rounded p-0.5 ${
            job.forceFail ? "text-status-failed" : "text-slate-600 hover:text-status-failed"
          }`}
        >
          <Skull className="h-3 w-3" />
        </button>
        <button
          onClick={() => deleteJob(job.metadata.uid)}
          className="rounded p-0.5 text-slate-600 hover:text-status-failed"
          title="Delete Job"
        >
          <Trash2 className="h-3 w-3" />
        </button>
      </div>
      <div className="mt-1 flex items-center gap-1.5">
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-panel-700">
          <div
            className={`h-full rounded-full ${
              job.status.phase === "Failed"
                ? "bg-status-failed"
                : "bg-status-running"
            } transition-all`}
            style={{ width: `${pct}%` }}
          />
        </div>
        <span className="text-[9px] tabular-nums text-slate-500">
          {job.status.succeeded}/{job.spec.completions}
        </span>
      </div>
    </div>
  );
}

function CronJobRow({ cronJob: cj }: { cronJob: CronJob }) {
  const deleteCronJob = useClusterStore((s) => s.deleteCronJob);
  const openDrawer = useClusterStore((s) => s.openDrawer);
  const simClock = useClusterStore((s) => s.simClock);
  const countdown = Math.max(0, Math.round((cj.nextRunAt - simClock) / 1000));

  return (
    <div className="rounded-md border border-panel-700 bg-panel-850 px-2 py-1.5">
      <div className="flex items-center gap-1.5">
        <Clock className="h-3.5 w-3.5 text-amber-400" />
        <span
          className="min-w-0 flex-1 cursor-pointer truncate text-xs font-semibold text-white"
          onClick={() =>
            openDrawer({ kind: "CronJob", name: cj.metadata.name, id: cj.metadata.uid })
          }
        >
          {cj.metadata.name}
        </span>
        <button
          onClick={() => deleteCronJob(cj.metadata.uid)}
          className="rounded p-0.5 text-slate-600 hover:text-status-failed"
          title="Delete CronJob"
        >
          <Trash2 className="h-3 w-3" />
        </button>
      </div>
      <div className="mt-0.5 flex items-center justify-between text-[9px] text-slate-500">
        <span>
          {cj.spec.schedule} ({describeSchedule(cj.spec.schedule)})
        </span>
        <span>next in {countdown}s (sim)</span>
      </div>
    </div>
  );
}

function HPARow({ hpa }: { hpa: HorizontalPodAutoscaler }) {
  const setHpaLoad = useClusterStore((s) => s.setHpaLoad);
  const deleteHPA = useClusterStore((s) => s.deleteHPA);
  const openDrawer = useClusterStore((s) => s.openDrawer);
  const over =
    hpa.status.currentCPUUtilizationPercentage >
    hpa.spec.targetCPUUtilizationPercentage;

  return (
    <div className="rounded-md border border-panel-700 bg-panel-850 px-2 py-1.5">
      <div className="flex items-center gap-1.5">
        <GaugeIcon className="h-3.5 w-3.5 text-kube-400" />
        <span
          className="min-w-0 flex-1 cursor-pointer truncate text-xs font-semibold text-white"
          onClick={() =>
            openDrawer({
              kind: "HorizontalPodAutoscaler",
              name: hpa.metadata.name,
              id: hpa.metadata.uid,
            })
          }
        >
          {hpa.spec.scaleTargetRef.name}
        </span>
        <span
          className={`text-[9px] font-semibold tabular-nums ${
            over ? "text-status-failed" : "text-status-running"
          }`}
        >
          {hpa.status.currentCPUUtilizationPercentage}%/
          {hpa.spec.targetCPUUtilizationPercentage}%
        </span>
        <button
          onClick={() => deleteHPA(hpa.metadata.uid)}
          className="rounded p-0.5 text-slate-600 hover:text-status-failed"
          title="Delete HPA"
        >
          <Trash2 className="h-3 w-3" />
        </button>
      </div>
      <div className="mt-1 flex items-center gap-1.5">
        <span className="text-[9px] text-slate-500">load</span>
        <input
          type="range"
          min={0}
          max={100}
          value={hpa.load}
          onChange={(e) => setHpaLoad(hpa.metadata.uid, Number(e.target.value))}
          className="h-1 flex-1 accent-kube-500"
        />
        <span className="w-14 text-right text-[9px] tabular-nums text-slate-500">
          {hpa.status.currentReplicas} ({hpa.spec.minReplicas}-
          {hpa.spec.maxReplicas})
        </span>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Recent requests                                                     */
/* ------------------------------------------------------------------ */

function RecentRequests() {
  const recent = useFlowStore((s) => s.recent);
  if (recent.length === 0) return null;

  return (
    <div className="max-h-40 shrink-0 overflow-y-auto border-t border-panel-700 p-2">
      <p className="mb-1 flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-slate-500">
        <Activity className="h-3 w-3" />
        Recent Requests
      </p>
      <div className="space-y-1">
        {recent.map((r) => (
          <div
            key={r.id}
            className="flex items-center gap-2 rounded bg-panel-900 px-1.5 py-1 text-[10px]"
          >
            <span className="min-w-0 flex-1 truncate text-slate-400">
              {r.target}
            </span>
            {r.blocked ? (
              <span className="text-status-failed">blocked</span>
            ) : (
              <>
                <span className="truncate text-slate-500">{r.podName}</span>
                <span className="shrink-0 text-status-running">
                  {r.latencyMs}ms
                </span>
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Stepper                                                             */
/* ------------------------------------------------------------------ */

function Stepper({
  value,
  onChange,
  min,
  max,
}: {
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
}) {
  return (
    <div className="flex items-center gap-1">
      <button
        onClick={() => onChange(Math.max(min, value - 1))}
        className="grid h-5 w-5 place-items-center rounded border border-panel-700 bg-panel-900 text-slate-300 hover:bg-panel-700"
        aria-label="decrease"
      >
        <Minus className="h-3 w-3" />
      </button>
      <span className="w-5 text-center text-xs font-bold tabular-nums text-white">
        {value}
      </span>
      <button
        onClick={() => onChange(Math.min(max, value + 1))}
        className="grid h-5 w-5 place-items-center rounded border border-panel-700 bg-panel-900 text-slate-300 hover:bg-panel-700"
        aria-label="increase"
      >
        <Plus className="h-3 w-3" />
      </button>
    </div>
  );
}
