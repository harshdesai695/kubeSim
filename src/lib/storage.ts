/**
 * Storage helpers — PV binding (smallest-fit), dynamic provisioning and
 * base64 utilities (reference doc §5.3–5.5).
 */

import type { PersistentVolume, PersistentVolumeClaim } from "@/store/types";

export const STORAGE_CLASSES = ["standard", "fast-ssd", "slow-hdd"] as const;
export const ACCESS_MODES = [
  "ReadWriteOnce",
  "ReadOnlyMany",
  "ReadWriteMany",
] as const;

/**
 * Smallest-fit binding: among Available PVs whose capacity satisfies the
 * request and whose StorageClass matches (when specified), pick the one with
 * the least capacity to avoid wasting large volumes.
 */
export function findBindablePV(
  claim: PersistentVolumeClaim,
  pvs: PersistentVolume[],
): PersistentVolume | undefined {
  return pvs
    .filter(
      (pv) =>
        pv.status.phase === "Available" &&
        pv.spec.capacity >= claim.spec.storage &&
        (!claim.spec.storageClassName ||
          pv.spec.storageClassName === claim.spec.storageClassName),
    )
    .sort((a, b) => a.spec.capacity - b.spec.capacity)[0];
}

/** base64 encode/decode that works in the browser. */
export function toBase64(value: string): string {
  try {
    return typeof window !== "undefined"
      ? window.btoa(unescape(encodeURIComponent(value)))
      : Buffer.from(value, "utf-8").toString("base64");
  } catch {
    return value;
  }
}

export function fromBase64(value: string): string {
  try {
    return typeof window !== "undefined"
      ? decodeURIComponent(escape(window.atob(value)))
      : Buffer.from(value, "base64").toString("utf-8");
  } catch {
    return value;
  }
}
