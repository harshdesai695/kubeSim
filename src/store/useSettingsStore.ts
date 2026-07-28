"use client";

/**
 * useSettingsStore — user-facing configurability (Phase 7), persisted to
 * localStorage so preferences survive reloads. No backend.
 */

import { create } from "zustand";
import { persist } from "zustand/middleware";

export type Theme = "dark" | "light";

interface SettingsState {
  theme: Theme;
  /** Simulation/animation speed multiplier (reconcile cadence). */
  simSpeed: number;
  terminalFontSize: number;
  showCliToast: boolean;
  tourDone: boolean;

  setTheme: (t: Theme) => void;
  setSimSpeed: (v: number) => void;
  setTerminalFontSize: (v: number) => void;
  setShowCliToast: (v: boolean) => void;
  setTourDone: (v: boolean) => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      theme: "dark",
      simSpeed: 1,
      terminalFontSize: 13,
      showCliToast: true,
      tourDone: false,

      setTheme: (theme) => set({ theme }),
      setSimSpeed: (simSpeed) => set({ simSpeed }),
      setTerminalFontSize: (terminalFontSize) => set({ terminalFontSize }),
      setShowCliToast: (showCliToast) => set({ showCliToast }),
      setTourDone: (tourDone) => set({ tourDone }),
    }),
    { name: "kubesim/settings" },
  ),
);
