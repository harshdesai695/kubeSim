"use client";

import { Handle, Position, type NodeProps } from "@xyflow/react";
import { Database, HardDrive } from "lucide-react";
import { useClusterStore } from "@/store/useClusterStore";
import type { PersistentVolume, PersistentVolumeClaim } from "@/store/types";

const PV_PHASE_COLOR: Record<string, string> = {
  Available: "border-status-running/50 text-status-running",
  Bound: "border-kube-500/50 text-kube-400",
  Released: "border-status-pending/50 text-status-pending",
};

const PVC_PHASE_COLOR: Record<string, string> = {
  Pending: "border-status-pending/50 text-status-pending",
  Bound: "border-status-running/50 text-status-running",
  Lost: "border-status-failed/50 text-status-failed",
};

/**
 * PVNode / PVCNode — the storage zone (reference doc §5.3–5.4). Phase is
 * color-coded; PVCs connect up to consuming Nodes and down to their bound PV.
 */
export function PVNode({ data }: NodeProps) {
  const pv = (data as { pv: PersistentVolume }).pv;
  const openDrawer = useClusterStore((s) => s.openDrawer);
  return (
    <div
      className={`w-40 cursor-pointer rounded-lg border bg-panel-850/95 px-2.5 py-1.5 shadow-lg backdrop-blur ${
        PV_PHASE_COLOR[pv.status.phase] ?? "border-panel-700"
      }`}
      onClick={() =>
        openDrawer({
          kind: "PersistentVolume",
          name: pv.metadata.name,
          id: pv.metadata.uid,
        })
      }
    >
      <Handle
        type="target"
        position={Position.Top}
        id="pv-in"
        style={{ opacity: 0, top: -2 }}
      />
      <div className="flex items-center gap-1.5">
        <HardDrive className="h-3.5 w-3.5" />
        <span className="min-w-0 flex-1 truncate text-xs font-bold text-white">
          {pv.metadata.name}
        </span>
      </div>
      <p className="mt-0.5 text-[9px] text-slate-500">
        {pv.spec.capacity}Gi · {pv.status.phase}
        {pv.dynamic ? " · dynamic" : ""}
      </p>
    </div>
  );
}

export function PVCNode({ data }: NodeProps) {
  const pvc = (data as { pvc: PersistentVolumeClaim }).pvc;
  const openDrawer = useClusterStore((s) => s.openDrawer);
  return (
    <div
      className={`w-40 cursor-pointer rounded-lg border bg-panel-850/95 px-2.5 py-1.5 shadow-lg backdrop-blur ${
        PVC_PHASE_COLOR[pvc.status.phase] ?? "border-panel-700"
      }`}
      onClick={() =>
        openDrawer({
          kind: "PersistentVolumeClaim",
          name: pvc.metadata.name,
          id: pvc.metadata.uid,
        })
      }
    >
      <Handle
        type="source"
        position={Position.Top}
        id="pvc-up"
        style={{ opacity: 0, top: -2 }}
      />
      <div className="flex items-center gap-1.5">
        <Database className="h-3.5 w-3.5" />
        <span className="min-w-0 flex-1 truncate text-xs font-bold text-white">
          {pvc.metadata.name}
        </span>
      </div>
      <p className="mt-0.5 text-[9px] text-slate-500">
        {pvc.spec.storage}Gi · {pvc.status.phase}
      </p>
      <Handle
        type="source"
        position={Position.Bottom}
        id="pvc-pv"
        style={{ opacity: 0, bottom: -2 }}
      />
    </div>
  );
}
