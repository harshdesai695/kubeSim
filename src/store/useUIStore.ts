"use client";

/**
 * useUIStore — Phase 7 chrome: scenarios menu, settings panel and the active
 * guided walkthrough. Kept out of the cluster store so opening panels doesn't
 * touch simulation state.
 */

import { create } from "zustand";
import { SCENARIOS } from "@/lib/scenarios";

interface Walkthrough {
  scenarioId: string;
  step: number;
}

interface UIStore {
  scenariosOpen: boolean;
  settingsOpen: boolean;
  walkthrough: Walkthrough | null;

  openScenarios: () => void;
  closeScenarios: () => void;
  openSettings: () => void;
  closeSettings: () => void;
  startWalkthrough: (scenarioId: string) => void;
  nextStep: () => void;
  prevStep: () => void;
  endWalkthrough: () => void;
}

export const useUIStore = create<UIStore>((set, get) => ({
  scenariosOpen: false,
  settingsOpen: false,
  walkthrough: null,

  openScenarios: () => set({ scenariosOpen: true }),
  closeScenarios: () => set({ scenariosOpen: false }),
  openSettings: () => set({ settingsOpen: true }),
  closeSettings: () => set({ settingsOpen: false }),

  startWalkthrough: (scenarioId) =>
    set({ walkthrough: { scenarioId, step: 0 }, scenariosOpen: false }),

  nextStep: () => {
    const w = get().walkthrough;
    if (!w) return;
    const scenario = SCENARIOS.find((s) => s.id === w.scenarioId);
    if (!scenario) return;
    if (w.step >= scenario.steps.length - 1) set({ walkthrough: null });
    else set({ walkthrough: { ...w, step: w.step + 1 } });
  },

  prevStep: () => {
    const w = get().walkthrough;
    if (!w) return;
    set({ walkthrough: { ...w, step: Math.max(0, w.step - 1) } });
  },

  endWalkthrough: () => set({ walkthrough: null }),
}));
