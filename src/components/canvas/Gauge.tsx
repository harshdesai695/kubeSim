"use client";

/**
 * Gauge — a compact horizontal resource meter (CPU / memory).
 *
 * Renders correctly at 0% (empty bar) and color-codes by utilization:
 * green < 70%, amber < 90%, red otherwise.
 */
interface GaugeProps {
  label: string;
  used: number;
  capacity: number;
  unit: string;
}

export function Gauge({ label, used, capacity, unit }: GaugeProps) {
  const pct =
    capacity > 0 ? Math.min(100, Math.round((used / capacity) * 100)) : 0;

  const color =
    pct >= 90
      ? "bg-status-failed"
      : pct >= 70
        ? "bg-status-pending"
        : "bg-status-running";

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-[10px] text-slate-400">
        <span className="font-semibold uppercase tracking-wider">{label}</span>
        <span className="tabular-nums text-slate-500">
          {used}/{capacity}
          {unit} · {pct}%
        </span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-panel-700">
        <div
          className={`h-full rounded-full transition-all duration-500 ${color}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
