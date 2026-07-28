"use client";

import { useState } from "react";
import {
  Activity,
  Boxes,
  Database,
  FileText,
  HardDrive,
  Layers,
  Lock,
  Minus,
  Network,
  Plus,
  RefreshCw,
  Rocket,
  Send,
  ShieldBan,
  Skull,
  Trash2,
  Undo2,
  Waypoints,
  X,
  Zap,
} from "lucide-react";
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
  SecretType,
  Service,
  ServiceType,
} from "@/store/types";
import { phaseTextClass } from "@/lib/status";
import { ACCESS_MODES, STORAGE_CLASSES } from "@/lib/storage";

type CreateKind =
  | "Deployment"
  | "ReplicaSet"
  | "Pod"
  | "Service"
  | "Ingress"
  | "NetworkPolicy"
  | "ConfigMap"
  | "Secret"
  | "PVC"
  | "PV";

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

/**
 * WorkloadsPanel — left dock to create/manage workloads, networking, config and
 * storage objects (reference doc §3–6), scoped to the active namespace.
 */
export function WorkloadsPanel() {
  const open = useClusterStore((s) => s.ui.workloadsOpen);
  const namespace = useClusterStore((s) => s.namespace);
  const deployments = useClusterStore((s) => s.deployments);
  const replicaSets = useClusterStore((s) => s.replicaSets);
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
  const toggleWorkloads = useClusterStore((s) => s.toggleWorkloads);

  const [formOpen, setFormOpen] = useState(false);

  if (!open) return null;

  const nsDeployments = deployments.filter((d) => inNs(d, namespace));
  const nsServices = services.filter((s) => inNs(s, namespace));
  const nsIngresses = ingresses.filter((i) => inNs(i, namespace));
  const nsNetpol = networkPolicies.filter((n) => inNs(n, namespace));
  const nsConfigMaps = configMaps.filter((c) => inNs(c, namespace));
  const nsSecrets = secrets.filter((c) => inNs(c, namespace));
  const nsPVCs = persistentVolumeClaims.filter((c) => inNs(c, namespace));
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
    nsServices.length === 0 &&
    nsIngresses.length === 0 &&
    nsNetpol.length === 0 &&
    nsConfigMaps.length === 0 &&
    nsSecrets.length === 0 &&
    nsPVCs.length === 0 &&
    persistentVolumes.length === 0 &&
    standalonePods.length === 0;

  return (
    <aside className="glass z-10 flex w-80 shrink-0 flex-col border-r border-panel-700">
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
              rs.metadata.ownerReferences?.some((o) => o.uid === d.metadata.uid),
            )}
          />
        ))}

        {standaloneRs.map((rs) => (
          <ReplicaSetRow key={rs.metadata.uid} rs={rs} />
        ))}

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
      </div>

      <RecentRequests />
    </aside>
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
    "Service",
    "Ingress",
    "NetworkPolicy",
    "ConfigMap",
    "Secret",
    "PVC",
    "PV",
  ];

  const workloadKind =
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

      {(kind === "Deployment" || kind === "ReplicaSet") && (
        <Labeled label="replicas">
          <Stepper value={replicas} onChange={setReplicas} min={0} max={12} />
        </Labeled>
      )}

      {/* Workload consumption refs */}
      {workloadKind &&
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
