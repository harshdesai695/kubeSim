/**
 * Time helpers for kubeSim.
 */

/** Format an elapsed duration like kubectl's AGE column (e.g. 5s, 2m, 1h, 3d). */
export function formatAge(createdAt: number, now: number = Date.now()): string {
  const seconds = Math.max(0, Math.floor((now - createdAt) / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}
