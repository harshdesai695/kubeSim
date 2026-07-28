"use client";

import { useMemo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { Network, Send, Zap } from "lucide-react";
import { useClusterStore } from "@/store/useClusterStore";
import { useFlowStore } from "@/store/useFlowStore";
import type { Service } from "@/store/types";
import { computeEndpoints } from "@/lib/network";

/**
 * ServiceNode — a Service on the canvas (reference doc §4.1).
 *
 * Shows type, ClusterIP/External IP, live endpoint count, and "Send request" /
 * bulk buttons that drive the API-flow visualization. Connects downward to the
 * Nodes hosting its endpoint pods.
 */
export function ServiceNode({ data }: NodeProps) {
  const service = (data as { service: Service }).service;
  const pods = useClusterStore((s) => s.pods);
  const openDrawer = useClusterStore((s) => s.openDrawer);
  const requestService = useFlowStore((s) => s.requestService);
  const bulkRequestService = useFlowStore((s) => s.bulkRequestService);

  const endpoints = useMemo(
    () => computeEndpoints(service, pods),
    [service, pods],
  );

  const externalLine =
    service.spec.type === "LoadBalancer"
      ? service.status.externalIP
        ? `ext ${service.status.externalIP}`
        : "ext <pending>"
      : service.spec.type === "ExternalName"
        ? service.spec.externalName
        : service.status.clusterIP;

  return (
    <div
      className="w-52 rounded-xl border bg-panel-850/95 shadow-lg backdrop-blur"
      style={{ borderColor: `${service.color}66` }}
    >
      <Handle
        type="target"
        position={Position.Top}
        id="svc-in"
        style={{ opacity: 0, top: -2 }}
      />

      <div
        className="cursor-pointer border-b border-panel-700 px-2.5 py-1.5"
        onClick={() =>
          openDrawer({
            kind: "Service",
            name: service.metadata.name,
            id: service.metadata.uid,
          })
        }
      >
        <div className="flex items-center gap-1.5">
          <Network className="h-3.5 w-3.5" style={{ color: service.color }} />
          <span className="truncate text-xs font-bold text-white">
            {service.metadata.name}
          </span>
          <span className="ml-auto rounded bg-panel-700 px-1 text-[9px] text-slate-400">
            {service.spec.type}
          </span>
        </div>
        <div className="mt-0.5 flex items-center gap-2 text-[9px] text-slate-500">
          <span>{externalLine}</span>
          <span className="ml-auto">
            :{service.spec.ports[0]?.port}→{service.spec.ports[0]?.targetPort}
          </span>
        </div>
      </div>

      <div className="flex items-center justify-between px-2.5 py-1.5">
        <span className="text-[10px] text-slate-500">
          <span
            className={`font-bold ${
              endpoints.length > 0 ? "text-status-running" : "text-status-failed"
            }`}
          >
            {endpoints.length}
          </span>{" "}
          endpoints
        </span>
        <div className="flex gap-1">
          <button
            onClick={(e) => {
              e.stopPropagation();
              requestService(service.metadata.uid);
            }}
            title="Simulate direct request"
            className="flex items-center gap-0.5 rounded bg-kube-500/15 px-1.5 py-0.5 text-[9px] font-semibold text-kube-400 hover:bg-kube-500/25"
          >
            <Send className="h-2.5 w-2.5" />
            Send
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              bulkRequestService(service.metadata.uid, 10);
            }}
            title="Simulate 10 requests (load distribution)"
            className="flex items-center gap-0.5 rounded bg-panel-700 px-1.5 py-0.5 text-[9px] font-semibold text-slate-300 hover:bg-panel-600"
          >
            <Zap className="h-2.5 w-2.5" />
            x10
          </button>
        </div>
      </div>

      <Handle
        type="source"
        position={Position.Bottom}
        id="svc-out"
        style={{ opacity: 0, bottom: -2 }}
      />
    </div>
  );
}
