"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, TerminalSquare } from "lucide-react";
import { useClusterStore } from "@/store/useClusterStore";
import { runKubectl } from "@/lib/cli";

interface Line {
  id: number;
  prompt: boolean;
  text: string;
}

const PROMPT = "user@kubesim:~$";

const WELCOME: Line[] = [
  { id: 0, prompt: false, text: "kubeSim shell — Phase 4." },
  {
    id: 1,
    prompt: false,
    text: "Try: kubectl get configmaps · kubectl get pvc · kubectl get namespaces · help",
  },
];

/**
 * SimTerminal — collapsible, shell-styled panel.
 *
 * Phase 1 wires two hardcoded commands (`kubectl get nodes`,
 * `kubectl describe node <name>`) plus `help`/`clear` via runKubectl. The
 * full command grammar/parser arrives in Phase 6.
 */
export function SimTerminal() {
  const open = useClusterStore((s) => s.ui.terminalOpen);
  const toggleTerminal = useClusterStore((s) => s.toggleTerminal);

  const [lines, setLines] = useState<Line[]>(WELCOME);
  const [input, setInput] = useState("");
  const nextId = useRef(WELCOME.length);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
      inputRef.current?.focus();
    }
  }, [open, lines]);

  const submit = () => {
    const value = input;
    setInput("");

    if (value.trim().length === 0) {
      setLines((prev) => [
        ...prev,
        { id: nextId.current++, prompt: true, text: "" },
      ]);
      return;
    }

    const result = runKubectl(value);
    if (result.clear) {
      setLines([]);
      return;
    }

    setLines((prev) => [
      ...prev,
      { id: nextId.current++, prompt: true, text: value },
      ...result.lines.map((text) => ({
        id: nextId.current++,
        prompt: false,
        text,
      })),
    ]);
  };

  if (!open) return null;

  return (
    <div className="glass flex h-56 shrink-0 flex-col border-t border-panel-700">
      {/* Terminal header */}
      <div className="flex h-9 shrink-0 items-center justify-between border-b border-panel-700 px-3">
        <div className="flex items-center gap-2 text-xs font-semibold text-slate-300">
          <TerminalSquare className="h-4 w-4 text-kube-400" />
          <span>Simulated Terminal</span>
          <span className="rounded bg-panel-700 px-1.5 py-0.5 text-[10px] text-slate-400">
            kubectl
          </span>
        </div>
        <button
          onClick={toggleTerminal}
          className="rounded p-1 text-slate-400 transition hover:bg-panel-700 hover:text-slate-200"
          aria-label="Collapse terminal"
        >
          <ChevronDown className="h-4 w-4" />
        </button>
      </div>

      {/* Terminal body */}
      <div
        ref={scrollRef}
        onClick={() => inputRef.current?.focus()}
        className="flex-1 cursor-text overflow-y-auto px-3 py-2 text-[13px] leading-relaxed"
      >
        {lines.map((line) => (
          <div key={line.id} className="whitespace-pre-wrap break-all">
            {line.prompt && (
              <span className="mr-2 text-status-running">{PROMPT}</span>
            )}
            <span className={line.prompt ? "text-slate-200" : "text-slate-500"}>
              {line.text}
            </span>
          </div>
        ))}

        {/* Active input line */}
        <div className="flex items-center">
          <span className="mr-2 text-status-running">{PROMPT}</span>
          <input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") submit();
            }}
            spellCheck={false}
            autoComplete="off"
            className="flex-1 bg-transparent text-slate-200 caret-kube-400 outline-none"
            aria-label="Terminal input"
          />
        </div>
      </div>
    </div>
  );
}
