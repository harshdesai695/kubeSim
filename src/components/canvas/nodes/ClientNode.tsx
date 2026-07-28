"use client";

import { Handle, Position } from "@xyflow/react";
import { Globe } from "lucide-react";

/**
 * ClientNode — the external client outside the cluster boundary. The origin of
 * simulated API-flow requests (reference doc §4.4 visualization).
 */
export function ClientNode() {
  return (
    <div className="flex w-40 items-center gap-2 rounded-xl border border-slate-500/40 bg-panel-850/95 px-3 py-2 shadow-lg backdrop-blur">
      <Globe className="h-4 w-4 text-slate-300" />
      <div className="leading-tight">
        <p className="text-xs font-bold text-white">External Client</p>
        <p className="text-[9px] text-slate-500">outside the cluster</p>
      </div>
      <Handle
        type="source"
        position={Position.Bottom}
        id="client-out"
        style={{ opacity: 0, bottom: -2 }}
      />
    </div>
  );
}
