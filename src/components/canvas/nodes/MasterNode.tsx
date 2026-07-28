"use client";

import { Handle, Position } from "@xyflow/react";
import { Cpu, Database, GitBranch, Server } from "lucide-react";
import { useClusterStore } from "@/store/useClusterStore";
import {
  CONTROL_PLANE,
  type ControlPlaneKind,
} from "@/lib/controlPlane";

/**
 * MasterNode — the fixed control-plane box (reference doc §1).
 *
 * Renders the four control-plane sub-components. Each is an independently
 * clickable button that opens the detail drawer with its description and
 * mini activity panel. Worker nodes connect their kubelet heartbeat edge to
 * the hidden target handle on the right.
 */

const ICONS: Record<ControlPlaneKind, typeof Server> = {
  APIServer: Server,
  Etcd: Database,
  Scheduler: GitBranch,
  ControllerManager: Cpu,
};

const TONES: Record<ControlPlaneKind, string> = {
  APIServer: "text-kube-400",
  Etcd: "text-emerald-400",
  Scheduler: "text-amber-400",
  ControllerManager: "text-fuchsia-400",
};

export function MasterNode() {
  const openDrawer = useClusterStore((s) => s.openDrawer);

  return (
    <div className="w-64 rounded-xl border border-kube-500/40 bg-panel-850/90 p-3 shadow-glow backdrop-blur">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-bold uppercase tracking-widest text-kube-400">
          Control Plane
        </span>
        <span className="flex items-center gap-1 text-[10px] text-status-running">
          <span className="h-1.5 w-1.5 animate-pulseDot rounded-full bg-status-running" />
          Ready
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2">
        {CONTROL_PLANE.map((comp) => {
          const Icon = ICONS[comp.kind];
          return (
            <button
              key={comp.id}
              onClick={(e) => {
                e.stopPropagation();
                openDrawer({ kind: comp.kind, name: comp.name, id: comp.id });
              }}
              className="group flex flex-col items-center gap-1 rounded-lg border border-panel-700 bg-panel-900 px-2 py-2.5 text-center transition hover:border-kube-500/60 hover:bg-panel-800"
            >
              <Icon
                className={`h-4 w-4 ${TONES[comp.kind]} transition group-hover:scale-110`}
              />
              <span className="text-[9px] leading-tight text-slate-400 group-hover:text-slate-200">
                {comp.name}
              </span>
            </button>
          );
        })}
      </div>

      {/* Hidden target handle: kubelet heartbeat edges terminate here. */}
      <Handle
        type="target"
        position={Position.Right}
        id="cp"
        style={{ opacity: 0, right: -2 }}
      />
    </div>
  );
}
