"use client";

import { ScanSearch, X } from "lucide-react";
import { useClusterStore } from "@/store/useClusterStore";

/**
 * SelectorInspector — global label-query tool (reference doc §6.2).
 *
 * Typing a query like `app=frontend,tier=web` highlights matching Pods and
 * Services on the canvas and dims everything else.
 */
export function SelectorInspector() {
  const query = useClusterStore((s) => s.ui.selectorQuery);
  const setSelectorQuery = useClusterStore((s) => s.setSelectorQuery);

  return (
    <div className="absolute left-1/2 top-4 z-10 -translate-x-1/2">
      <div
        className={`flex items-center gap-1.5 rounded-lg border bg-panel-850/95 px-2 py-1 shadow-lg backdrop-blur ${
          query ? "border-kube-500/60 shadow-glow" : "border-panel-700"
        }`}
      >
        <ScanSearch className="h-3.5 w-3.5 text-kube-400" />
        <input
          value={query}
          onChange={(e) => setSelectorQuery(e.target.value)}
          placeholder="selector inspector: app=frontend"
          className="w-36 bg-transparent text-[11px] text-slate-200 outline-none placeholder:text-slate-600 sm:w-52"
        />
        {query && (
          <button
            onClick={() => setSelectorQuery("")}
            className="rounded p-0.5 text-slate-400 hover:text-slate-200"
            aria-label="Clear selector"
          >
            <X className="h-3 w-3" />
          </button>
        )}
      </div>
    </div>
  );
}
