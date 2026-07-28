"use client";

import { motion } from "framer-motion";
import { RotateCw, Skull, Zap } from "lucide-react";
import { useClusterStore } from "@/store/useClusterStore";
import { useFlowStore } from "@/store/useFlowStore";
import type { Pod } from "@/store/types";
import { phaseDotClass, phaseBorderClass } from "@/lib/status";
import { labelsMatchQuery } from "@/lib/selector";

/**
 * PodCard — a compact pod chip nested inside its Node box (reference doc §3.1).
 *
 * Shows status dot, name, per-container status dots, restart count, and a
 * "kill" action (simulated crash). Left accent color reflects the owning
 * ReplicaSet/Deployment. Flashes and shows a request counter when it handles a
 * simulated API request; dims when it doesn't match the Selector Inspector.
 */
export function PodCard({ pod }: { pod: Pod }) {
  const openDrawer = useClusterStore((s) => s.openDrawer);
  const killPod = useClusterStore((s) => s.killPod);
  const selectorQuery = useClusterStore((s) => s.ui.selectorQuery);
  const hits = useFlowStore((s) => s.hitCounts[pod.metadata.uid] ?? 0);
  const flashing = useFlowStore((s) => s.flashPodUid === pod.metadata.uid);

  const matches = labelsMatchQuery(pod.metadata.labels, selectorQuery);

  const shortName =
    pod.metadata.name.length > 22
      ? `…${pod.metadata.name.slice(-21)}`
      : pod.metadata.name;

  return (
    <motion.div
      layout
      initial={{ scale: 0.7, opacity: 0 }}
      animate={{
        scale: flashing ? 1.08 : 1,
        opacity: matches ? 1 : 0.3,
        boxShadow: flashing
          ? "0 0 0 2px rgba(77,157,255,0.9), 0 0 14px 2px rgba(77,157,255,0.6)"
          : "0 0 0 0 rgba(0,0,0,0)",
      }}
      exit={{ scale: 0.7, opacity: 0 }}
      transition={{ type: "spring", stiffness: 320, damping: 24 }}
      onClick={(e) => {
        e.stopPropagation();
        openDrawer({ kind: "Pod", name: pod.metadata.name, id: pod.metadata.uid });
      }}
      className={`group flex cursor-pointer items-center gap-1.5 rounded-md border bg-panel-900/80 px-1.5 py-1 ${phaseBorderClass(
        pod.status.phase,
      )}`}
      style={{ borderLeftColor: pod.ownerColor, borderLeftWidth: 3 }}
    >
      <span
        className={`h-2 w-2 shrink-0 rounded-full ${phaseDotClass(
          pod.status.phase,
        )} ${
          pod.status.phase === "Pending" ||
          pod.status.phase === "ContainerCreating"
            ? "animate-pulseDot"
            : ""
        }`}
      />
      <span className="min-w-0 flex-1 truncate text-[10px] text-slate-300">
        {shortName}
      </span>

      {hits > 0 && (
        <span className="flex items-center gap-0.5 rounded bg-kube-500/15 px-1 text-[9px] text-kube-400">
          <Zap className="h-2.5 w-2.5" />
          {hits}
        </span>
      )}

      {pod.status.restartCount > 0 && (
        <span className="flex items-center gap-0.5 rounded bg-status-failed/15 px-1 text-[9px] text-status-failed">
          <RotateCw className="h-2.5 w-2.5" />
          {pod.status.restartCount}
        </span>
      )}

      <button
        onClick={(e) => {
          e.stopPropagation();
          killPod(pod.metadata.uid);
        }}
        title="Kill pod (simulate crash)"
        className="shrink-0 rounded p-0.5 text-slate-600 opacity-0 transition hover:text-status-failed group-hover:opacity-100"
      >
        <Skull className="h-3 w-3" />
      </button>
    </motion.div>
  );
}
