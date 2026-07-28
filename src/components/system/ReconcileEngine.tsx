"use client";

import { useEffect } from "react";
import { useClusterStore } from "@/store/useClusterStore";

/** Interval between reconciliation ticks (ms). */
const TICK = 500;

/**
 * ReconcileEngine — drives the simulated control loops.
 *
 * Mounted once; it calls the store's `reconcile()` on a fixed interval so the
 * cluster "feels alive" (scheduling, container startup, self-healing, rolling
 * updates) even without user interaction. Renders nothing.
 */
export function ReconcileEngine() {
  const reconcile = useClusterStore((s) => s.reconcile);

  useEffect(() => {
    const id = setInterval(reconcile, TICK);
    return () => clearInterval(id);
  }, [reconcile]);

  return null;
}
