/**
 * GUI ↔ CLI feedback loop (Phase 6, Core Product Pillar #3).
 *
 * GUI actions call `echoCommand` with the equivalent kubectl command so it
 * appears in the terminal. When a command is actually typed in the terminal,
 * the CLI wraps execution in `setCliActive(true)` so the store actions it calls
 * don't double-echo the command the user already sees.
 */

import { useTerminalStore } from "@/store/useTerminalStore";

let cliActive = false;

export function setCliActive(active: boolean): void {
  cliActive = active;
}

export function echoCommand(command: string): void {
  if (cliActive) return;
  useTerminalStore.getState().pushEcho(command);
}
