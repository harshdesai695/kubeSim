"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import {
  Activity,
  Boxes,
  Radio,
  Server,
  Shield,
  Trash2,
} from "lucide-react";
import { useShallow } from "zustand/react/shallow";
import { useClusterStore } from "@/store/useClusterStore";
import type { WorkerNode } from "@/store/types";
import { Gauge } from "@/components/canvas/Gauge";
import { PodCard } from "@/components/canvas/PodCard";

/**
 * WorkerNodeCard — a React Flow custom node for a worker Node (reference doc §2.1).
 *
 * Shows name, Ready/NotReady badge (click to toggle), CPU/memory gauges,
 * kubelet + kube-proxy heartbeat icons, an empty pods placeholder, and a
 * drain-and-delete control with confirmation.
 */
export function WorkerNodeCard({ data }: NodeProps) {
  const node = (data as { node: WorkerNode }).node;
  const toggleNodeStatus = useClusterStore((s) => s.toggleNodeStatus);
  const removeNode = useClusterStore((s) => s.removeNode);
  const namespace = useClusterStore((s) => s.namespace);
  const pods = useClusterStore(
    useShallow((s) =>
      s.pods.filter(
        (p) =>
          p.spec.nodeName === node.name &&
          p.metadata.namespace === namespace &&
          p.status.phase !== "Pending",
      ),
    ),
  );
  const [confirming, setConfirming] = useState(false);

  const daemonPods = pods.filter(
    (p) => p.metadata.ownerReferences?.[0]?.kind === "DaemonSet",
  );
  const regularPods = pods.filter(
    (p) => p.metadata.ownerReferences?.[0]?.kind !== "DaemonSet",
  );

  const ready = node.status === "Ready";
  const labelChips = Object.entries(node.labels).slice(0, 3);

  return (
    <motion.div
      initial={{ scale: 0.85, opacity: 0 }}
      animate={{
        scale: node.draining ? 0.96 : 1,
        opacity: node.draining ? 0.4 : 1,
      }}
      transition={{ type: "spring", stiffness: 260, damping: 22 }}
      className={`w-64 rounded-xl border bg-panel-850/95 shadow-lg backdrop-blur ${
        ready
          ? "border-status-running/40"
          : "border-status-failed/50"
      } ${node.draining ? "pointer-events-none" : ""}`}
    >
      {/* Header */}
      <div className="flex items-center justify-between gap-2 border-b border-panel-700 px-3 py-2">
        <div className="flex min-w-0 items-center gap-1.5">
          <Server className="h-4 w-4 shrink-0 text-slate-400" />
          <span className="truncate text-sm font-bold text-white">
            {node.name}
          </span>
        </div>
        <button
          onClick={(e) => {
            e.stopPropagation();
            toggleNodeStatus(node.id);
          }}
          title="Click to toggle Ready / NotReady"
          className={`flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold transition ${
            ready
              ? "border-status-running/50 bg-status-running/10 text-status-running hover:bg-status-running/20"
              : "border-status-failed/50 bg-status-failed/10 text-status-failed hover:bg-status-failed/20"
          }`}
        >
          <span
            className={`h-1.5 w-1.5 rounded-full ${
              ready ? "bg-status-running" : "bg-status-failed"
            }`}
          />
          {node.status}
        </button>
      </div>

      {/* Body */}
      <div className="space-y-3 px-3 py-2.5">
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

        {/* kubelet + kube-proxy heartbeat */}
        <div className="flex items-center gap-3 text-[10px] text-slate-500">
          <span className="flex items-center gap-1">
            <Activity
              className={`h-3.5 w-3.5 text-emerald-400 ${
                ready ? "animate-heartbeat" : "opacity-30"
              }`}
            />
            kubelet
          </span>
          <span className="flex items-center gap-1">
            <Radio
              className={`h-3.5 w-3.5 text-kube-400 ${
                ready ? "animate-heartbeat" : "opacity-30"
              }`}
              style={{ animationDelay: "1.5s" }}
            />
            kube-proxy
          </span>
        </div>

        {/* DaemonSet pods — pinned badges */}
        {daemonPods.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {daemonPods.map((pod) => (
              <span
                key={pod.metadata.uid}
                title={pod.metadata.name}
                className="flex items-center gap-1 rounded border border-fuchsia-500/40 bg-fuchsia-500/10 px-1.5 py-0.5 text-[9px] text-fuchsia-300"
              >
                <Shield className="h-2.5 w-2.5" />
                {pod.metadata.ownerReferences?.[0]?.name}
              </span>
            ))}
          </div>
        )}

        {/* Pods */}
        <div className="rounded-lg border border-dashed border-panel-700 bg-panel-900/60 p-1.5">
          {regularPods.length === 0 ? (
            <div className="grid place-items-center px-2 py-2 text-center">
              <Boxes className="mb-1 h-4 w-4 text-slate-700" />
              <span className="text-[10px] text-slate-600">
                No pods scheduled
              </span>
            </div>
          ) : (
            <div className="flex flex-col gap-1">
              <AnimatePresence mode="popLayout">
                {regularPods.map((pod) => (
                  <PodCard key={pod.metadata.uid} pod={pod} />
                ))}
              </AnimatePresence>
            </div>
          )}
        </div>

        {/* Labels */}
        {labelChips.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {labelChips.map(([k, v]) => (
              <span
                key={k}
                className="max-w-full truncate rounded bg-panel-700 px-1.5 py-0.5 text-[9px] text-slate-400"
                title={v ? `${k}=${v}` : k}
              >
                {k.split("/").pop()}
                {v ? `=${v}` : ""}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Footer: drain & delete */}
      <div className="border-t border-panel-700 px-3 py-1.5">
        {node.draining ? (
          <span className="text-[10px] text-status-pending">Draining & deleting…</span>
        ) : confirming ? (
          <div className="flex items-center justify-between gap-2">
            <span className="text-[10px] text-slate-400">Drain & delete?</span>
            <div className="flex gap-1">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setConfirming(false);
                  removeNode(node.id);
                }}
                className="rounded bg-status-failed/20 px-2 py-0.5 text-[10px] font-semibold text-status-failed hover:bg-status-failed/30"
              >
                Confirm
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setConfirming(false);
                }}
                className="rounded bg-panel-700 px-2 py-0.5 text-[10px] text-slate-300 hover:bg-panel-600"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={(e) => {
              e.stopPropagation();
              setConfirming(true);
            }}
            className="flex items-center gap-1 text-[10px] text-slate-500 transition hover:text-status-failed"
          >
            <Trash2 className="h-3 w-3" />
            Drain &amp; delete
          </button>
        )}
      </div>

      {/* Hidden source handle: kubelet → API Server heartbeat edge. */}
      <Handle
        type="source"
        position={Position.Left}
        id="kubelet"
        style={{ opacity: 0, left: -2 }}
      />
      {/* Hidden target handle: Service → Node endpoint edges. */}
      <Handle
        type="target"
        position={Position.Top}
        id="svc"
        style={{ opacity: 0, top: -2 }}
      />
      {/* Hidden target handle: ConfigMap/Secret/PVC → Node consumer edges. */}
      <Handle
        type="target"
        position={Position.Bottom}
        id="data"
        style={{ opacity: 0, bottom: -2 }}
      />
    </motion.div>
  );
}
