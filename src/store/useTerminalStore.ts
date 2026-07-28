"use client";

/**
 * useTerminalStore — shared terminal scrollback + command history (Phase 6).
 *
 * Both the terminal itself and GUI actions write here: GUI actions push the
 * equivalent `kubectl` command (the CLI-first feedback loop), while typed
 * commands push their input + output. Kept separate from the cluster store so
 * terminal churn doesn't re-render the whole app.
 */

import { create } from "zustand";

export type TerminalLineKind = "input" | "output" | "echo" | "info";

export interface TerminalLine {
  id: number;
  kind: TerminalLineKind;
  text: string;
}

interface TerminalState {
  lines: TerminalLine[];
  history: string[];
  pushInput: (text: string) => void;
  pushOutput: (lines: string[]) => void;
  pushEcho: (command: string) => void;
  addHistory: (command: string) => void;
  clear: () => void;
  reset: () => void;
}

let lineId = 0;

const WELCOME: TerminalLine[] = [
  { id: lineId++, kind: "info", text: "kubeSim shell — Phase 6 (full kubectl parser)." },
  {
    id: lineId++,
    kind: "info",
    text: "Type 'help' for commands · ↑/↓ history · Tab completes · paste multi-line YAML for apply -f.",
  },
];

export const useTerminalStore = create<TerminalState>((set) => ({
  lines: WELCOME,
  history: [],

  pushInput: (text) =>
    set((s) => ({
      lines: [...s.lines, { id: lineId++, kind: "input" as const, text }],
    })),

  pushOutput: (lines) =>
    set((s) => ({
      lines: [
        ...s.lines,
        ...lines.map((text) => ({ id: lineId++, kind: "output" as const, text })),
      ].slice(-500),
    })),

  pushEcho: (command) =>
    set((s) => ({
      lines: [
        ...s.lines,
        { id: lineId++, kind: "echo" as const, text: `${command}` },
      ].slice(-500),
    })),

  addHistory: (command) =>
    set((s) => ({
      history: [...s.history.filter((c) => c !== command), command].slice(-100),
    })),

  clear: () => set({ lines: [] }),

  reset: () => set({ lines: WELCOME, history: [] }),
}));
