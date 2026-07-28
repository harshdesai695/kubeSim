import type { PodPhase } from "@/store/types";

/** Status color language (reference doc §9) mapped to pod phases. */
export function phaseDotClass(phase: PodPhase): string {
  switch (phase) {
    case "Running":
      return "bg-status-running";
    case "Pending":
    case "ContainerCreating":
      return "bg-status-pending";
    case "Failed":
    case "CrashLoopBackOff":
      return "bg-status-failed";
    case "Succeeded":
    case "Terminating":
    default:
      return "bg-status-terminated";
  }
}

export function phaseTextClass(phase: PodPhase): string {
  switch (phase) {
    case "Running":
      return "text-status-running";
    case "Pending":
    case "ContainerCreating":
      return "text-status-pending";
    case "Failed":
    case "CrashLoopBackOff":
      return "text-status-failed";
    case "Succeeded":
    case "Terminating":
    default:
      return "text-slate-500";
  }
}

export function phaseBorderClass(phase: PodPhase): string {
  switch (phase) {
    case "Running":
      return "border-status-running/40";
    case "Pending":
    case "ContainerCreating":
      return "border-status-pending/40";
    case "Failed":
    case "CrashLoopBackOff":
      return "border-status-failed/50";
    default:
      return "border-panel-700";
  }
}
