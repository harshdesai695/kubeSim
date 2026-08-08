"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Radio, Send, Waypoints, X, Zap } from "lucide-react";
import { useClusterStore } from "@/store/useClusterStore";
import { useFlowStore } from "@/store/useFlowStore";

/**
 * TrafficControl — always-visible launcher to simulate request flow for any
 * loaded scenario. Lists the current namespace's entry points (Ingress rules
 * and Services) with one-click "Send", a bulk burst, and a continuous
 * "auto traffic" toggle that fires requests on an interval.
 */
export function TrafficControl() {
  const namespace = useClusterStore((s) => s.namespace);
  const allServices = useClusterStore((s) => s.services);
  const allIngresses = useClusterStore((s) => s.ingresses);

  // Derive stable, primitive-only view models (avoids useShallow pitfalls
  // with nested objects that would break referential equality every render).
  const services = useMemo(
    () =>
      allServices
        .filter((x) => x.metadata.namespace === namespace)
        .map((x) => ({
          uid: x.metadata.uid,
          name: x.metadata.name,
          type: x.spec.type,
        })),
    [allServices, namespace],
  );
  const ingressRules = useMemo(
    () =>
      allIngresses
        .filter((i) => i.metadata.namespace === namespace)
        .flatMap((i) =>
          i.spec.rules.map((r, idx) => ({
            ingressId: i.metadata.uid,
            idx,
            label: `${r.host}${r.path} → ${r.serviceName}`,
          })),
        ),
    [allIngresses, namespace],
  );

  const requestService = useFlowStore((s) => s.requestService);
  const requestIngressRule = useFlowStore((s) => s.requestIngressRule);
  const bulkRequestService = useFlowStore((s) => s.bulkRequestService);

  const [open, setOpen] = useState(false);
  const [auto, setAuto] = useState(false);
  const rr = useRef(0);

  const hasEntries = ingressRules.length > 0 || services.length > 0;

  // Continuous traffic: cycle through entry points (ingress first) on a timer.
  useEffect(() => {
    if (!auto || !hasEntries) return;
    const fire = () => {
      const senders =
        ingressRules.length > 0
          ? ingressRules.map(
              (r) => () => requestIngressRule(r.ingressId, r.idx),
            )
          : services.map((s) => () => requestService(s.uid));
      if (senders.length === 0) return;
      senders[rr.current % senders.length]();
      rr.current += 1;
    };
    fire();
    const id = setInterval(fire, 2200);
    return () => clearInterval(id);
  }, [
    auto,
    hasEntries,
    ingressRules,
    services,
    requestIngressRule,
    requestService,
  ]);

  // Stop auto traffic if the namespace loses all entry points.
  useEffect(() => {
    if (!hasEntries && auto) setAuto(false);
  }, [hasEntries, auto]);

  if (!open) {
    return (
      <div className="absolute bottom-4 left-1/2 z-10 -translate-x-1/2">
        <button
          onClick={() => setOpen(true)}
          className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[11px] font-semibold shadow-lg backdrop-blur transition ${
            auto
              ? "border-kube-500/60 bg-kube-500/20 text-kube-300 shadow-glow"
              : "border-panel-700 bg-panel-850/95 text-slate-200 hover:bg-panel-800"
          }`}
        >
          <Waypoints className="h-3.5 w-3.5 text-kube-400" />
          Simulate Traffic
          {auto && (
            <span className="flex items-center gap-1 rounded-full bg-kube-500/25 px-1.5 text-[9px] text-kube-200">
              <Radio className="h-2.5 w-2.5 animate-pulse" />
              live
            </span>
          )}
        </button>
      </div>
    );
  }

  return (
    <div className="absolute bottom-4 left-1/2 z-10 w-80 max-w-[85vw] -translate-x-1/2">
      <div className="rounded-xl border border-panel-700 bg-panel-850/95 p-3 shadow-2xl backdrop-blur">
        <div className="mb-2 flex items-center justify-between">
          <span className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-widest text-kube-400">
            <Waypoints className="h-3.5 w-3.5" />
            Traffic Simulator
          </span>
          <button
            onClick={() => setOpen(false)}
            className="rounded p-0.5 text-slate-400 hover:bg-panel-700 hover:text-slate-200"
            aria-label="Close traffic simulator"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <button
          onClick={() => setAuto((v) => !v)}
          disabled={!hasEntries}
          className={`mb-2 flex w-full items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-[11px] font-semibold transition disabled:cursor-not-allowed disabled:opacity-40 ${
            auto
              ? "bg-status-failed/20 text-status-failed hover:bg-status-failed/30"
              : "bg-kube-500 text-white shadow-glow hover:bg-kube-400"
          }`}
        >
          <Radio className={`h-3.5 w-3.5 ${auto ? "animate-pulse" : ""}`} />
          {auto ? "Stop auto traffic" : "Start auto traffic"}
        </button>

        <div className="max-h-56 space-y-2 overflow-y-auto">
          {ingressRules.length > 0 && (
            <div>
              <p className="mb-1 text-[9px] uppercase tracking-wider text-slate-500">
                Ingress routes
              </p>
              <div className="space-y-1">
                {ingressRules.map((r) => (
                  <div
                    key={`${r.ingressId}-${r.idx}`}
                    className="flex items-center gap-2 rounded-md border border-panel-700 bg-panel-900 px-2 py-1"
                  >
                    <span className="min-w-0 flex-1 truncate text-[10px] text-slate-300">
                      {r.label}
                    </span>
                    <button
                      onClick={() => requestIngressRule(r.ingressId, r.idx)}
                      className="flex items-center gap-0.5 rounded bg-kube-500/15 px-1.5 py-0.5 text-[9px] font-semibold text-kube-400 hover:bg-kube-500/25"
                    >
                      <Send className="h-2.5 w-2.5" />
                      Send
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {services.length > 0 && (
            <div>
              <p className="mb-1 text-[9px] uppercase tracking-wider text-slate-500">
                Services
              </p>
              <div className="space-y-1">
                {services.map((s) => (
                  <div
                    key={s.uid}
                    className="flex items-center gap-2 rounded-md border border-panel-700 bg-panel-900 px-2 py-1"
                  >
                    <span className="min-w-0 flex-1 truncate text-[10px] text-slate-300">
                      {s.name}
                      <span className="ml-1 text-[9px] text-slate-600">
                        {s.type}
                      </span>
                    </span>
                    <button
                      onClick={() => requestService(s.uid)}
                      className="flex items-center gap-0.5 rounded bg-kube-500/15 px-1.5 py-0.5 text-[9px] font-semibold text-kube-400 hover:bg-kube-500/25"
                    >
                      <Send className="h-2.5 w-2.5" />
                      Send
                    </button>
                    <button
                      onClick={() => bulkRequestService(s.uid, 10)}
                      title="Send 10 requests (load distribution)"
                      className="flex items-center gap-0.5 rounded bg-panel-700 px-1.5 py-0.5 text-[9px] font-semibold text-slate-300 hover:bg-panel-600"
                    >
                      <Zap className="h-2.5 w-2.5" />
                      x10
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {!hasEntries && (
            <p className="py-4 text-center text-[11px] text-slate-600">
              No Services or Ingress routes in{" "}
              <span className="text-slate-400">{namespace}</span> yet. Create one
              to simulate request flow.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
