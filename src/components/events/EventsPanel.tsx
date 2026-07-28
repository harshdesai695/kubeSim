"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Bell, X } from "lucide-react";
import { useClusterStore } from "@/store/useClusterStore";

/**
 * EventsPanel — right-hand slide-in feed mirroring `kubectl get events`.
 *
 * Phase 0 ships the panel shell with an (initially empty) list. Objects and
 * their lifecycle events populate this in later phases; the "Restart Cluster"
 * action already emits an event here.
 */
export function EventsPanel() {
  const open = useClusterStore((s) => s.ui.eventsOpen);
  const events = useClusterStore((s) => s.events);
  const toggleEvents = useClusterStore((s) => s.toggleEvents);

  return (
    <AnimatePresence>
      {open && (
        <motion.aside
          key="events-panel"
          initial={{ x: "100%" }}
          animate={{ x: 0 }}
          exit={{ x: "100%" }}
          transition={{ type: "spring", stiffness: 320, damping: 34 }}
          className="glass absolute inset-y-0 right-0 z-20 flex w-80 max-w-[85vw] flex-col border-l border-panel-700 shadow-2xl"
        >
          <div className="flex h-12 shrink-0 items-center justify-between border-b border-panel-700 px-4">
            <div className="flex items-center gap-2 text-sm font-bold text-white">
              <Bell className="h-4 w-4 text-kube-400" />
              Events
            </div>
            <button
              onClick={toggleEvents}
              className="rounded p-1 text-slate-400 transition hover:bg-panel-700 hover:text-slate-200"
              aria-label="Close events"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-3">
            {events.length === 0 ? (
              <div className="mt-16 flex flex-col items-center gap-2 text-center text-slate-600">
                <Bell className="h-6 w-6" />
                <p className="text-xs">No events yet.</p>
                <p className="max-w-[14rem] text-[11px] text-slate-700">
                  Cluster changes (create, scale, crash, heal) will stream here.
                </p>
              </div>
            ) : (
              <ul className="space-y-1.5">
                {events.map((evt) => (
                  <li
                    key={evt.id}
                    className="rounded-md border border-panel-700 bg-panel-900 p-2.5 text-xs"
                  >
                    <div className="flex items-center justify-between">
                      <span
                        className={`font-semibold ${
                          evt.type === "Warning"
                            ? "text-status-pending"
                            : "text-status-running"
                        }`}
                      >
                        {evt.reason}
                      </span>
                      <span className="text-[10px] text-slate-600">
                        {new Date(evt.timestamp).toLocaleTimeString()}
                      </span>
                    </div>
                    <p className="mt-0.5 text-slate-400">{evt.message}</p>
                    {evt.involvedObject && (
                      <p className="mt-1 text-[10px] text-slate-600">
                        {evt.involvedObject.kind}/{evt.involvedObject.name}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </motion.aside>
      )}
    </AnimatePresence>
  );
}
