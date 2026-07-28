"use client";

import { Bell, Boxes, Layers, RotateCcw, TerminalSquare } from "lucide-react";
import { useClusterStore } from "@/store/useClusterStore";
import { useFlowStore } from "@/store/useFlowStore";
import { useTerminalStore } from "@/store/useTerminalStore";
import { resetRouting } from "@/lib/network";

export function TopNav() {
  const namespace = useClusterStore((s) => s.namespace);
  const namespaces = useClusterStore((s) => s.namespaces);
  const setNamespace = useClusterStore((s) => s.setNamespace);
  const createNamespace = useClusterStore((s) => s.createNamespace);
  const timeScale = useClusterStore((s) => s.timeScale);
  const setTimeScale = useClusterStore((s) => s.setTimeScale);
  const eventCount = useClusterStore((s) => s.events.length);
  const eventsOpen = useClusterStore((s) => s.ui.eventsOpen);
  const terminalOpen = useClusterStore((s) => s.ui.terminalOpen);
  const workloadsOpen = useClusterStore((s) => s.ui.workloadsOpen);
  const toggleEvents = useClusterStore((s) => s.toggleEvents);
  const toggleTerminal = useClusterStore((s) => s.toggleTerminal);
  const toggleWorkloads = useClusterStore((s) => s.toggleWorkloads);
  const resetCluster = useClusterStore((s) => s.resetCluster);
  const pushEvent = useClusterStore((s) => s.pushEvent);

  const handleNamespaceChange = (value: string) => {
    if (value === "__new__") {
      const name = window.prompt("New namespace name:")?.trim();
      if (name) {
        createNamespace(name);
        setNamespace(name);
      }
      return;
    }
    setNamespace(value);
  };

  const handleReset = () => {
    resetCluster();
    useFlowStore.getState().clear();
    useTerminalStore.getState().reset();
    resetRouting();
    pushEvent({
      type: "Normal",
      reason: "ClusterReset",
      message: "Cluster state cleared — all objects removed.",
    });
  };

  return (
    <header className="glass z-20 flex h-14 shrink-0 items-center justify-between border-b border-panel-700 px-4">
      {/* Brand */}
      <div className="flex items-center gap-2.5">
        <div className="grid h-8 w-8 place-items-center rounded-md bg-kube-500 shadow-glow">
          <Boxes className="h-5 w-5 text-white" />
        </div>
        <div className="leading-none">
          <span className="text-lg font-bold tracking-tight text-white">
            kube<span className="text-kube-400">Sim</span>
          </span>
          <p className="mt-0.5 text-[10px] uppercase tracking-widest text-slate-500">
            Kubernetes Simulator
          </p>
        </div>
      </div>

      {/* Controls */}
      <div className="flex items-center gap-2">
        {/* Namespace selector (stub) */}
        <label className="flex items-center gap-2 rounded-md border border-panel-700 bg-panel-850 px-2.5 py-1.5 text-xs">
          <span className="text-slate-500">namespace</span>
          <select
            value={namespace}
            onChange={(e) => handleNamespaceChange(e.target.value)}
            className="cursor-pointer bg-transparent font-semibold text-kube-400 outline-none"
          >
            {namespaces.map((ns) => (
              <option key={ns} value={ns} className="bg-panel-850 text-slate-200">
                {ns}
              </option>
            ))}
            <option value="__new__" className="bg-panel-850 text-kube-400">
              + new namespace…
            </option>
          </select>
        </label>

        {/* Simulated clock speed (drives CronJobs) */}
        <div className="flex items-center gap-0.5 rounded-md border border-panel-700 bg-panel-850 p-0.5 text-[10px]">
          {[1, 10, 60].map((s) => (
            <button
              key={s}
              onClick={() => setTimeScale(s)}
              title="Simulated clock speed"
              className={`rounded px-1.5 py-1 font-semibold transition ${
                timeScale === s
                  ? "bg-kube-500/20 text-kube-400"
                  : "text-slate-400 hover:bg-panel-700"
              }`}
            >
              {s}x
            </button>
          ))}
        </div>

        <NavButton
          active={workloadsOpen}
          onClick={toggleWorkloads}
          icon={<Layers className="h-4 w-4" />}
          label="Workloads"
        />

        <NavButton
          active={terminalOpen}
          onClick={toggleTerminal}
          icon={<TerminalSquare className="h-4 w-4" />}
          label="Terminal"
        />

        <NavButton
          active={eventsOpen}
          onClick={toggleEvents}
          icon={<Bell className="h-4 w-4" />}
          label="Events"
          badge={eventCount}
        />

        <button
          onClick={handleReset}
          className="flex items-center gap-1.5 rounded-md border border-status-failed/40 bg-status-failed/10 px-2.5 py-1.5 text-xs font-semibold text-status-failed transition hover:bg-status-failed/20"
        >
          <RotateCcw className="h-4 w-4" />
          Restart Cluster
        </button>
      </div>
    </header>
  );
}

interface NavButtonProps {
  active?: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  badge?: number;
}

function NavButton({ active, onClick, icon, label, badge }: NavButtonProps) {
  return (
    <button
      onClick={onClick}
      className={`relative flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-semibold transition ${
        active
          ? "border-kube-500/60 bg-kube-500/15 text-kube-400 shadow-glow"
          : "border-panel-700 bg-panel-850 text-slate-300 hover:bg-panel-700"
      }`}
    >
      {icon}
      {label}
      {badge !== undefined && badge > 0 && (
        <span className="ml-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-kube-500 px-1 text-[10px] text-white">
          {badge > 99 ? "99+" : badge}
        </span>
      )}
    </button>
  );
}
