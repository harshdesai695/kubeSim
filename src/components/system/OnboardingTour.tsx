"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Boxes,
  GraduationCap,
  PanelRight,
  TerminalSquare,
} from "lucide-react";
import { useSettingsStore } from "@/store/useSettingsStore";

const STEPS = [
  {
    icon: Boxes,
    title: "Welcome to kubeSim",
    body: "An interactive, fully client-side Kubernetes simulator. The center canvas is your live cluster — pan, zoom, and click any object to inspect it.",
  },
  {
    icon: TerminalSquare,
    title: "The Terminal",
    body: "Drive everything with kubectl-style commands. Try `kubectl get pods`, use ↑/↓ for history and Tab to complete. GUI actions echo their equivalent command here.",
  },
  {
    icon: PanelRight,
    title: "Workloads & Drawer",
    body: "Create and manage objects from the left Workloads panel. Clicking any object opens the right-hand drawer with its YAML, logs, status and relationships.",
  },
  {
    icon: GraduationCap,
    title: "Guided Scenarios",
    body: "New here? Open Scenarios in the top bar for one-click demos (self-healing, rolling updates, autoscaling and more) with step-by-step walkthroughs.",
  },
];

/** First-run onboarding tour (skippable, remembered via settings). */
export function OnboardingTour() {
  const tourDone = useSettingsStore((s) => s.tourDone);
  const setTourDone = useSettingsStore((s) => s.setTourDone);
  const [step, setStep] = useState(0);

  if (tourDone) return null;
  const current = STEPS[step];
  const Icon = current.icon;
  const last = step === STEPS.length - 1;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-6"
      >
        <motion.div
          initial={{ scale: 0.9, y: 20 }}
          animate={{ scale: 1, y: 0 }}
          className="glass w-[28rem] max-w-full rounded-2xl border border-panel-700 p-6 shadow-2xl"
        >
          <div className="mb-3 grid h-12 w-12 place-items-center rounded-xl bg-kube-500/15 text-kube-400">
            <Icon className="h-6 w-6" />
          </div>
          <h2 className="text-lg font-bold text-white">{current.title}</h2>
          <p className="mt-2 text-sm leading-relaxed text-slate-400">
            {current.body}
          </p>

          <div className="mt-5 flex items-center justify-between">
            <div className="flex gap-1.5">
              {STEPS.map((_, i) => (
                <span
                  key={i}
                  className={`h-1.5 w-5 rounded-full ${
                    i === step ? "bg-kube-400" : "bg-panel-700"
                  }`}
                />
              ))}
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setTourDone(true)}
                className="rounded-md px-3 py-1.5 text-xs text-slate-400 transition hover:text-slate-200"
              >
                Skip
              </button>
              <button
                onClick={() => (last ? setTourDone(true) : setStep(step + 1))}
                className="rounded-md bg-kube-500 px-4 py-1.5 text-xs font-semibold text-white shadow-glow transition hover:bg-kube-400"
              >
                {last ? "Get started" : "Next"}
              </button>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
