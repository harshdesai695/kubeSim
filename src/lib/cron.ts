/**
 * Minimal cron helper for CronJob scheduling on the simulated clock
 * (reference doc §3.7). Supports the common minute-field forms; anything
 * else falls back to "every minute".
 */

const MINUTE_MS = 60 * 1000;

/** Interval (in real ms of *simulated* time) implied by a cron expression. */
export function cronIntervalMs(schedule: string): number {
  const minute = schedule.trim().split(/\s+/)[0] ?? "*";
  if (minute === "*") return MINUTE_MS;
  if (minute.startsWith("*/")) {
    const n = parseInt(minute.slice(2), 10);
    return (Number.isFinite(n) && n > 0 ? n : 1) * MINUTE_MS;
  }
  // A fixed minute (e.g. "0 * * * *") → hourly.
  return 60 * MINUTE_MS;
}

/** Next fire time on the simulated clock. */
export function nextCronRun(schedule: string, fromSimMs: number): number {
  return fromSimMs + cronIntervalMs(schedule);
}

export function describeSchedule(schedule: string): string {
  const mins = cronIntervalMs(schedule) / MINUTE_MS;
  if (mins < 60) return `every ${mins}m`;
  return `every ${mins / 60}h`;
}
