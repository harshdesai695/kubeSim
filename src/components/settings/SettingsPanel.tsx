"use client";

import { useRef } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Download, RotateCcw, Settings2, Upload, X } from "lucide-react";
import { useUIStore } from "@/store/useUIStore";
import { useSettingsStore } from "@/store/useSettingsStore";
import { useClusterStore } from "@/store/useClusterStore";
import { useFlowStore } from "@/store/useFlowStore";
import { useTerminalStore } from "@/store/useTerminalStore";

/** Settings panel — theme, speed, terminal, CLI toast, snapshot I/O (§7.2). */
export function SettingsPanel() {
  const open = useUIStore((s) => s.settingsOpen);
  const closeSettings = useUIStore((s) => s.closeSettings);

  const theme = useSettingsStore((s) => s.theme);
  const setTheme = useSettingsStore((s) => s.setTheme);
  const simSpeed = useSettingsStore((s) => s.simSpeed);
  const setSimSpeed = useSettingsStore((s) => s.setSimSpeed);
  const terminalFontSize = useSettingsStore((s) => s.terminalFontSize);
  const setTerminalFontSize = useSettingsStore((s) => s.setTerminalFontSize);
  const showCliToast = useSettingsStore((s) => s.showCliToast);
  const setShowCliToast = useSettingsStore((s) => s.setShowCliToast);

  const fileRef = useRef<HTMLInputElement>(null);

  const exportSnapshot = () => {
    const snapshot = useClusterStore.getState().exportSnapshot();
    const blob = new Blob([JSON.stringify(snapshot, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `kubesim-snapshot-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const importSnapshot = async (file: File) => {
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      const ok = useClusterStore.getState().importSnapshot(data);
      useFlowStore.getState().clear();
      useTerminalStore
        .getState()
        .pushOutput([ok ? "Snapshot imported." : "Invalid snapshot file."]);
    } catch {
      useTerminalStore.getState().pushOutput(["Failed to parse snapshot file."]);
    }
  };

  const resetCluster = () => {
    useClusterStore.getState().resetCluster();
    useFlowStore.getState().clear();
    useTerminalStore.getState().reset();
  };

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={closeSettings}
            className="absolute inset-0 z-30 bg-black/40"
          />
          <motion.aside
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", stiffness: 320, damping: 34 }}
            className="glass absolute inset-y-0 right-0 z-40 flex w-80 max-w-[92vw] flex-col border-l border-panel-700 shadow-2xl"
          >
            <div className="flex h-12 shrink-0 items-center justify-between border-b border-panel-700 px-4">
              <div className="flex items-center gap-2 text-sm font-bold text-white">
                <Settings2 className="h-4 w-4 text-kube-400" />
                Settings
              </div>
              <button
                onClick={closeSettings}
                className="rounded p-1 text-slate-400 transition hover:bg-panel-700 hover:text-slate-200"
                aria-label="Close settings"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-4">
              <Field label="Theme">
                <Segmented
                  options={["dark", "light"]}
                  value={theme}
                  onChange={(v) => setTheme(v as "dark" | "light")}
                />
              </Field>

              <Field label="Simulation speed">
                <Segmented
                  options={["0.5", "1", "2"]}
                  value={String(simSpeed)}
                  onChange={(v) => setSimSpeed(Number(v))}
                  suffix="x"
                />
              </Field>

              <Field label={`Terminal font size (${terminalFontSize}px)`}>
                <input
                  type="range"
                  min={10}
                  max={18}
                  value={terminalFontSize}
                  onChange={(e) => setTerminalFontSize(Number(e.target.value))}
                  className="w-full accent-kube-500"
                />
              </Field>

              <label className="flex cursor-pointer items-center justify-between text-xs text-slate-300">
                <span>Show equivalent CLI commands</span>
                <Toggle value={showCliToast} onChange={setShowCliToast} />
              </label>

              <div className="border-t border-panel-700 pt-4">
                <p className="mb-2 text-[10px] uppercase tracking-wider text-slate-500">
                  Cluster snapshot
                </p>
                <div className="flex flex-col gap-2">
                  <button
                    onClick={exportSnapshot}
                    className="flex items-center justify-center gap-1.5 rounded-md border border-panel-700 bg-panel-850 px-3 py-2 text-xs font-semibold text-slate-200 transition hover:bg-panel-700"
                  >
                    <Download className="h-4 w-4" />
                    Export snapshot (.json)
                  </button>
                  <button
                    onClick={() => fileRef.current?.click()}
                    className="flex items-center justify-center gap-1.5 rounded-md border border-panel-700 bg-panel-850 px-3 py-2 text-xs font-semibold text-slate-200 transition hover:bg-panel-700"
                  >
                    <Upload className="h-4 w-4" />
                    Import snapshot
                  </button>
                  <input
                    ref={fileRef}
                    type="file"
                    accept="application/json"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) importSnapshot(file);
                      e.target.value = "";
                    }}
                  />
                </div>
              </div>

              <div className="border-t border-panel-700 pt-4">
                <button
                  onClick={resetCluster}
                  className="flex w-full items-center justify-center gap-1.5 rounded-md border border-status-failed/40 bg-status-failed/10 px-3 py-2 text-xs font-semibold text-status-failed transition hover:bg-status-failed/20"
                >
                  <RotateCcw className="h-4 w-4" />
                  Reset to empty cluster
                </button>
              </div>
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <p className="mb-1.5 text-[10px] uppercase tracking-wider text-slate-500">
        {label}
      </p>
      {children}
    </div>
  );
}

function Segmented({
  options,
  value,
  onChange,
  suffix,
}: {
  options: string[];
  value: string;
  onChange: (v: string) => void;
  suffix?: string;
}) {
  return (
    <div className="flex gap-1 rounded-md border border-panel-700 bg-panel-900 p-0.5">
      {options.map((o) => (
        <button
          key={o}
          onClick={() => onChange(o)}
          className={`flex-1 rounded px-2 py-1 text-xs font-semibold capitalize transition ${
            value === o
              ? "bg-kube-500/20 text-kube-400"
              : "text-slate-400 hover:bg-panel-800"
          }`}
        >
          {o}
          {suffix}
        </button>
      ))}
    </div>
  );
}

function Toggle({
  value,
  onChange,
}: {
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      onClick={() => onChange(!value)}
      className={`relative h-5 w-9 rounded-full transition ${
        value ? "bg-kube-500" : "bg-panel-700"
      }`}
      aria-pressed={value}
    >
      <span
        className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all ${
          value ? "left-4" : "left-0.5"
        }`}
      />
    </button>
  );
}
