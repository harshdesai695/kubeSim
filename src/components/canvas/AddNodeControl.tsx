"use client";

import { useState } from "react";
import { Plus, X } from "lucide-react";
import { useClusterStore } from "@/store/useClusterStore";

/**
 * AddNodeControl — floating "+ Add Node" button + popover form.
 *
 * Collects name, CPU cores, memory (GB) and optional labels, then spawns a
 * worker Node in the store (which animates onto the canvas).
 */
export function AddNodeControl() {
  const addNode = useClusterStore((s) => s.addNode);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [cpu, setCpu] = useState(4);
  const [mem, setMem] = useState(8);
  const [labels, setLabels] = useState("");

  const submit = () => {
    const parsedLabels: Record<string, string> = {};
    labels
      .split(",")
      .map((pair) => pair.trim())
      .filter(Boolean)
      .forEach((pair) => {
        const [k, ...rest] = pair.split("=");
        if (k) parsedLabels[k.trim()] = rest.join("=").trim();
      });

    addNode({
      name: name.trim() || undefined,
      cpuCapacity: Math.max(1, Math.round(cpu)),
      memCapacity: Math.max(1, Math.round(mem)),
      labels: Object.keys(parsedLabels).length ? parsedLabels : undefined,
    });

    setName("");
    setCpu(4);
    setMem(8);
    setLabels("");
    setOpen(false);
  };

  return (
    <div className="absolute right-4 top-4 z-10">
      {open ? (
        <div className="w-72 rounded-xl border border-panel-700 bg-panel-850/95 p-3 shadow-2xl backdrop-blur">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-widest text-kube-400">
              Add Worker Node
            </span>
            <button
              onClick={() => setOpen(false)}
              className="rounded p-0.5 text-slate-400 hover:bg-panel-700 hover:text-slate-200"
              aria-label="Close form"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="space-y-2.5">
            <Field label="Name (optional)">
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="auto: node-N"
                className="w-full rounded-md border border-panel-700 bg-panel-900 px-2 py-1.5 text-xs text-slate-200 outline-none focus:border-kube-500"
              />
            </Field>

            <div className="grid grid-cols-2 gap-2">
              <Field label="CPU (cores)">
                <input
                  type="number"
                  min={1}
                  value={cpu}
                  onChange={(e) => setCpu(Number(e.target.value))}
                  className="w-full rounded-md border border-panel-700 bg-panel-900 px-2 py-1.5 text-xs text-slate-200 outline-none focus:border-kube-500"
                />
              </Field>
              <Field label="Memory (GB)">
                <input
                  type="number"
                  min={1}
                  value={mem}
                  onChange={(e) => setMem(Number(e.target.value))}
                  className="w-full rounded-md border border-panel-700 bg-panel-900 px-2 py-1.5 text-xs text-slate-200 outline-none focus:border-kube-500"
                />
              </Field>
            </div>

            <Field label="Labels (k=v, comma-separated)">
              <input
                value={labels}
                onChange={(e) => setLabels(e.target.value)}
                placeholder="disktype=ssd, zone=a"
                className="w-full rounded-md border border-panel-700 bg-panel-900 px-2 py-1.5 text-xs text-slate-200 outline-none focus:border-kube-500"
              />
            </Field>

            <button
              onClick={submit}
              className="mt-1 flex w-full items-center justify-center gap-1.5 rounded-md bg-kube-500 px-3 py-2 text-xs font-semibold text-white shadow-glow transition hover:bg-kube-400"
            >
              <Plus className="h-4 w-4" />
              Add Node
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setOpen(true)}
          className="flex items-center gap-1.5 rounded-lg border border-kube-500/50 bg-kube-500/15 px-3 py-2 text-xs font-semibold text-kube-400 shadow-glow transition hover:bg-kube-500/25"
        >
          <Plus className="h-4 w-4" />
          Add Node
        </button>
      )}
    </div>
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
    <label className="block">
      <span className="mb-1 block text-[10px] uppercase tracking-wider text-slate-500">
        {label}
      </span>
      {children}
    </label>
  );
}
