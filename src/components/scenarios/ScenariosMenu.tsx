"use client";

import { AnimatePresence, motion } from "framer-motion";
import { GraduationCap, Play, X } from "lucide-react";
import { useUIStore } from "@/store/useUIStore";
import { SCENARIOS } from "@/lib/scenarios";

/**
 * ScenariosMenu — one-click preset clusters with a narrated walkthrough
 * (reference doc §9 teaching goals; Phase 7 §7.1).
 */
export function ScenariosMenu() {
  const open = useUIStore((s) => s.scenariosOpen);
  const closeScenarios = useUIStore((s) => s.closeScenarios);
  const startWalkthrough = useUIStore((s) => s.startWalkthrough);

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={closeScenarios}
            className="absolute inset-0 z-30 bg-black/40"
          />
          <motion.aside
            initial={{ x: "-100%" }}
            animate={{ x: 0 }}
            exit={{ x: "-100%" }}
            transition={{ type: "spring", stiffness: 320, damping: 34 }}
            className="glass absolute inset-y-0 left-0 z-40 flex w-96 max-w-[92vw] flex-col border-r border-panel-700 shadow-2xl"
          >
            <div className="flex h-12 shrink-0 items-center justify-between border-b border-panel-700 px-4">
              <div className="flex items-center gap-2 text-sm font-bold text-white">
                <GraduationCap className="h-4 w-4 text-kube-400" />
                Guided Scenarios
              </div>
              <button
                onClick={closeScenarios}
                className="rounded p-1 text-slate-400 transition hover:bg-panel-700 hover:text-slate-200"
                aria-label="Close scenarios"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
              <p className="text-[11px] text-slate-500">
                Load a preset cluster and follow the step-by-step walkthrough.
                This replaces your current cluster.
              </p>
              {SCENARIOS.map((scenario) => (
                <div
                  key={scenario.id}
                  className="rounded-lg border border-panel-700 bg-panel-850 p-3"
                >
                  <p className="text-sm font-bold text-white">{scenario.name}</p>
                  <p className="mt-1 text-[11px] leading-relaxed text-slate-400">
                    {scenario.description}
                  </p>
                  <button
                    onClick={() => {
                      scenario.build();
                      startWalkthrough(scenario.id);
                    }}
                    className="mt-2 flex items-center gap-1.5 rounded-md bg-kube-500 px-3 py-1.5 text-xs font-semibold text-white shadow-glow transition hover:bg-kube-400"
                  >
                    <Play className="h-3.5 w-3.5" />
                    Load scenario
                  </button>
                </div>
              ))}
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}
