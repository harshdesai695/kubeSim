"use client";

import { useEffect } from "react";
import { useClusterStore } from "@/store/useClusterStore";
import { useSettingsStore } from "@/store/useSettingsStore";

/** Base interval between reconciliation ticks (ms). */
const BASE_TICK = 500;

/**
 * ReconcileEngine — drives the simulated control loops.
 *
 * Mounted once; it calls the store's `reconcile()` on a fixed interval so the
 * cluster "feels alive" (scheduling, container startup, self-healing, rolling
 * updates). The cadence scales with the user's simulation-speed setting.
 */
export function ReconcileEngine() {
  const reconcile = useClusterStore((s) => s.reconcile);
  const simSpeed = useSettingsStore((s) => s.simSpeed);

  useEffect(() => {
    const interval = Math.max(120, BASE_TICK / simSpeed);
    const id = setInterval(reconcile, interval);
    return () => clearInterval(id);
  }, [reconcile, simSpeed]);

  return null;
}
