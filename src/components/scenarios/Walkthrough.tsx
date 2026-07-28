"use client";

import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeft, ArrowRight, Check, GraduationCap, X } from "lucide-react";
import { useUIStore } from "@/store/useUIStore";
import { SCENARIOS } from "@/lib/scenarios";

/**
 * Walkthrough — a floating step card that narrates the active guided scenario
 * (Phase 7 §7.1). Non-blocking so the user can interact with the cluster.
 */
export function Walkthrough() {
  const walkthrough = useUIStore((s) => s.walkthrough);
  const nextStep = useUIStore((s) => s.nextStep);
  const prevStep = useUIStore((s) => s.prevStep);
  const endWalkthrough = useUIStore((s) => s.endWalkthrough);

  const scenario = walkthrough
    ? SCENARIOS.find((s) => s.id === walkthrough.scenarioId)
    : undefined;

  return (
    <AnimatePresence>
      {walkthrough && scenario && (
        <motion.div
          initial={{ y: 40, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 40, opacity: 0 }}
          className="glass absolute bottom-4 left-1/2 z-30 w-[30rem] max-w-[92vw] -translate-x-1/2 rounded-xl border border-kube-500/40 p-4 shadow-2xl"
        >
          <div className="mb-2 flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs font-bold text-kube-400">
              <GraduationCap className="h-4 w-4" />
              {scenario.name}
            </div>
            <button
              onClick={endWalkthrough}
              className="rounded p-1 text-slate-400 transition hover:bg-panel-700 hover:text-slate-200"
              aria-label="End walkthrough"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <p className="min-h-[3rem] text-sm leading-relaxed text-slate-200">
            {scenario.steps[walkthrough.step]}
          </p>

          <div className="mt-3 flex items-center justify-between">
            <div className="flex gap-1">
              {scenario.steps.map((_, i) => (
                <span
                  key={i}
                  className={`h-1.5 w-4 rounded-full transition ${
                    i === walkthrough.step
                      ? "bg-kube-400"
                      : i < walkthrough.step
                        ? "bg-kube-500/50"
                        : "bg-panel-700"
                  }`}
                />
              ))}
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={prevStep}
                disabled={walkthrough.step === 0}
                className="flex items-center gap-1 rounded-md border border-panel-700 bg-panel-850 px-2.5 py-1.5 text-xs text-slate-300 transition hover:bg-panel-700 disabled:opacity-40"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                Back
              </button>
              <button
                onClick={nextStep}
                className="flex items-center gap-1 rounded-md bg-kube-500 px-3 py-1.5 text-xs font-semibold text-white shadow-glow transition hover:bg-kube-400"
              >
                {walkthrough.step >= scenario.steps.length - 1 ? (
                  <>
                    <Check className="h-3.5 w-3.5" />
                    Done
                  </>
                ) : (
                  <>
                    Next
                    <ArrowRight className="h-3.5 w-3.5" />
                  </>
                )}
              </button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
