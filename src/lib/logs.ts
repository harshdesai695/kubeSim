/**
 * Fake log + exec generators for pods (reference doc §3.1).
 *
 * Deterministic-ish plausible output so `kubectl logs` / `kubectl exec` and
 * the drawer log panel have realistic content without any real container.
 */

import type { Pod } from "@/store/types";

const LOG_TEMPLATES = [
  "Listening on :8080",
  'GET /healthz 200 1ms',
  'GET / 200 3ms',
  'GET /api/v1/items 200 12ms',
  "level=info msg=\"request completed\" status=200",
  "cache hit ratio 0.94",
  'POST /api/v1/items 201 21ms',
  "level=warn msg=\"slow query\" duration=142ms",
  "reconcile loop tick",
  'GET /metrics 200 2ms',
  "worker pool size=8 queued=0",
  "level=info msg=\"connection established\" peer=10.244.0.7",
];

function pad2(n: number): string {
  return n.toString().padStart(2, "0");
}

function stamp(offsetSec: number): string {
  const d = new Date(Date.now() - offsetSec * 1000);
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
}

/** Generate a batch of plausible log lines for a pod. */
export function generateLogs(pod: Pod, count = 14): string[] {
  const container = pod.spec.containers[0]?.name ?? "app";
  const lines: string[] = [];
  for (let i = count - 1; i >= 0; i--) {
    const template = LOG_TEMPLATES[Math.floor(Math.random() * LOG_TEMPLATES.length)];
    lines.push(`${stamp(i * 2)} ${container} | ${template}`);
  }
  if (pod.status.restartCount > 0) {
    lines.unshift(
      `${stamp(count * 2)} ${container} | (previous instance terminated — restart #${pod.status.restartCount})`,
    );
  }
  return lines;
}

/** Simulated `kubectl exec <pod> -- <cmd>` response. */
export function simulateExec(pod: Pod, command: string): string[] {
  const cmd = command.trim();
  const arg0 = cmd.split(/\s+/)[0];

  switch (arg0) {
    case "ls":
      return ["bin", "dev", "etc", "home", "proc", "sys", "tmp", "usr", "var", "app"];
    case "pwd":
      return ["/app"];
    case "whoami":
      return ["root"];
    case "hostname":
      return [pod.metadata.name];
    case "env":
      return [
        `HOSTNAME=${pod.metadata.name}`,
        "PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin",
        `POD_IP=${pod.status.podIP ?? "<pending>"}`,
        "KUBERNETES_SERVICE_HOST=10.96.0.1",
      ];
    case "cat":
      return [`(simulated) contents of ${cmd.split(/\s+/)[1] ?? "file"} — not a real file`];
    case "ps":
      return [
        "PID   USER     TIME  COMMAND",
        "1     root     0:00  /app/server",
        "12    root     0:00  ps",
      ];
    default:
      return [`(simulated shell) command not found: ${arg0}`];
  }
}
