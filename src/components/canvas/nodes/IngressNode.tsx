"use client";

import { Handle, Position, type NodeProps } from "@xyflow/react";
import { Send, Waypoints } from "lucide-react";
import { useClusterStore } from "@/store/useClusterStore";
import { useFlowStore } from "@/store/useFlowStore";
import type { Ingress } from "@/store/types";

/**
 * IngressNode — an "Ingress Gateway" above the cluster (reference doc §4.2).
 *
 * Displays its host/path → Service routing table; each rule can trigger a
 * simulated request that travels Ingress → Service → Pod.
 */
export function IngressNode({ data }: NodeProps) {
  const ingress = (data as { ingress: Ingress }).ingress;
  const openDrawer = useClusterStore((s) => s.openDrawer);
  const requestIngressRule = useFlowStore((s) => s.requestIngressRule);

  return (
    <div className="w-60 rounded-xl border border-amber-500/40 bg-panel-850/95 shadow-lg backdrop-blur">
      <Handle
        type="target"
        position={Position.Top}
        id="ing-in"
        style={{ opacity: 0, top: -2 }}
      />

      <div
        className="flex cursor-pointer items-center gap-1.5 border-b border-panel-700 px-2.5 py-1.5"
        onClick={() =>
          openDrawer({
            kind: "Ingress",
            name: ingress.metadata.name,
            id: ingress.metadata.uid,
          })
        }
      >
        <Waypoints className="h-3.5 w-3.5 text-amber-400" />
        <span className="truncate text-xs font-bold text-white">
          {ingress.metadata.name}
        </span>
        <span className="ml-auto text-[9px] uppercase tracking-wider text-amber-400/70">
          Ingress
        </span>
      </div>

      <div className="space-y-1 px-2.5 py-1.5">
        {ingress.spec.rules.map((rule, i) => (
          <div
            key={i}
            className="flex items-center gap-1.5 rounded bg-panel-900 px-1.5 py-1 text-[9px]"
          >
            <span className="min-w-0 flex-1 truncate text-slate-400">
              {rule.host}
              {rule.path} → {rule.serviceName}:{rule.servicePort}
            </span>
            <button
              onClick={(e) => {
                e.stopPropagation();
                requestIngressRule(ingress.metadata.uid, i);
              }}
              title="Simulate request to this path"
              className="flex shrink-0 items-center gap-0.5 rounded bg-amber-500/15 px-1 py-0.5 font-semibold text-amber-400 hover:bg-amber-500/25"
            >
              <Send className="h-2.5 w-2.5" />
            </button>
          </div>
        ))}
      </div>

      <Handle
        type="source"
        position={Position.Bottom}
        id="ing-out"
        style={{ opacity: 0, bottom: -2 }}
      />
    </div>
  );
}
