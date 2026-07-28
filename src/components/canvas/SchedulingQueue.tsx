"use client";

import { AnimatePresence, motion } from "framer-motion";
import { GitBranch } from "lucide-react";
import { useShallow } from "zustand/react/shallow";
import { useClusterStore } from "@/store/useClusterStore";

/**
 * SchedulingQueue — overlay tray showing Pending pods awaiting a node.
 *
 * Represents the kube-scheduler queue (reference doc §1.3): pods appear here
 * while Pending, then animate away as the scheduler assigns them to a node.
 */
export function SchedulingQueue() {
  const pending = useClusterStore(
    useShallow((s) =>
      s.pods.filter((p) => p.status.phase === "Pending" && !p.spec.nodeName),
    ),
  );

  return (
    <div className="pointer-events-none absolute bottom-4 left-1/2 z-10 -translate-x-1/2">
      <AnimatePresence>
        {pending.length > 0 && (
          <motion.div
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 20, opacity: 0 }}
            className="flex items-center gap-2 rounded-xl border border-amber-500/40 bg-panel-850/95 px-3 py-2 shadow-2xl backdrop-blur"
          >
            <div className="flex items-center gap-1.5 border-r border-panel-700 pr-2 text-[10px] font-semibold uppercase tracking-wider text-amber-400">
              <GitBranch className="h-3.5 w-3.5" />
              Scheduling
            </div>
            <div className="flex flex-wrap gap-1.5">
              <AnimatePresence mode="popLayout">
                {pending.map((pod) => (
                  <motion.span
                    key={pod.metadata.uid}
                    layout
                    initial={{ scale: 0.6, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0.6, opacity: 0 }}
                    className="flex items-center gap-1 rounded-md border border-amber-500/40 bg-amber-500/10 px-1.5 py-0.5 text-[10px] text-amber-300"
                  >
                    <span className="h-1.5 w-1.5 animate-pulseDot rounded-full bg-status-pending" />
                    {pod.metadata.name}
                  </motion.span>
                ))}
              </AnimatePresence>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
