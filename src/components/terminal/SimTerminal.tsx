"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, TerminalSquare, X } from "lucide-react";
import { useClusterStore } from "@/store/useClusterStore";
import { useTerminalStore } from "@/store/useTerminalStore";
import { useSettingsStore } from "@/store/useSettingsStore";
import { runKubectl, getCompletions, applyManifests } from "@/lib/cli";

const PROMPT = "user@kubesim:~$";

/**
 * SimTerminal — store-backed kubectl-style shell (Phase 6).
 *
 * Reads scrollback from useTerminalStore (shared with GUI echo), supports
 * command history (↑/↓), Tab completion, `clear`/`help`, and multi-line YAML
 * paste that opens an apply dialog.
 */
export function SimTerminal() {
  const open = useClusterStore((s) => s.ui.terminalOpen);
  const toggleTerminal = useClusterStore((s) => s.toggleTerminal);
  const fontSize = useSettingsStore((s) => s.terminalFontSize);
  const lines = useTerminalStore((s) => s.lines);
  const history = useTerminalStore((s) => s.history);
  const pushInput = useTerminalStore((s) => s.pushInput);
  const pushOutput = useTerminalStore((s) => s.pushOutput);
  const addHistory = useTerminalStore((s) => s.addHistory);
  const clearLines = useTerminalStore((s) => s.clear);

  const [input, setInput] = useState("");
  const [histIndex, setHistIndex] = useState(-1);
  const [applyText, setApplyText] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
      if (applyText === null) inputRef.current?.focus();
    }
  }, [open, lines, applyText]);

  const submit = () => {
    const value = input;
    setInput("");
    setHistIndex(-1);
    if (value.trim().length === 0) {
      pushInput("");
      return;
    }
    pushInput(value);
    addHistory(value.trim());
    const result = runKubectl(value);
    if (result.clear) clearLines();
    else if (result.lines.length) pushOutput(result.lines);
  };

  const complete = () => {
    const options = getCompletions(input);
    if (options.length === 0) return;
    if (options.length === 1) {
      const parts = input.split(/\s+/);
      const trailing = input.endsWith(" ");
      if (trailing) setInput(input + options[0] + " ");
      else {
        parts[parts.length - 1] = options[0];
        setInput(parts.join(" ") + " ");
      }
      return;
    }
    // Multiple: complete to common prefix and list options.
    const common = commonPrefix(options);
    if (common) {
      const parts = input.split(/\s+/);
      if (input.endsWith(" ")) setInput(input + common);
      else {
        parts[parts.length - 1] = common;
        setInput(parts.join(" "));
      }
    }
    pushOutput([options.join("   ")]);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      submit();
    } else if (e.key === "Tab") {
      e.preventDefault();
      complete();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (history.length === 0) return;
      const next = histIndex < 0 ? history.length - 1 : Math.max(0, histIndex - 1);
      setHistIndex(next);
      setInput(history[next]);
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      if (histIndex < 0) return;
      const next = histIndex + 1;
      if (next >= history.length) {
        setHistIndex(-1);
        setInput("");
      } else {
        setHistIndex(next);
        setInput(history[next]);
      }
    }
  };

  const onPaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    const text = e.clipboardData.getData("text");
    if (text.includes("\n")) {
      e.preventDefault();
      setApplyText(text.trim());
    }
  };

  if (!open) return null;

  return (
    <div className="glass flex h-48 shrink-0 flex-col border-t border-panel-700 md:h-56">
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

      <div
        ref={scrollRef}
        onClick={() => inputRef.current?.focus()}
        style={{ fontSize }}
        className="flex-1 cursor-text overflow-y-auto px-3 py-2 leading-relaxed"
      >
        {lines.map((line) => (
          <div key={line.id} className="whitespace-pre-wrap break-all">
            {line.kind === "input" && (
              <>
                <span className="mr-2 text-status-running">{PROMPT}</span>
                <span className="text-slate-200">{line.text}</span>
              </>
            )}
            {line.kind === "output" && (
              <span className="text-slate-400">{line.text}</span>
            )}
            {line.kind === "info" && (
              <span className="text-slate-500">{line.text}</span>
            )}
            {line.kind === "echo" && (
              <span className="text-kube-400">
                <span className="mr-1 text-slate-600">GUI ›</span>
                {line.text}
              </span>
            )}
          </div>
        ))}

        <div className="flex items-center">
          <span className="mr-2 text-status-running">{PROMPT}</span>
          <input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKeyDown}
            onPaste={onPaste}
            spellCheck={false}
            autoComplete="off"
            className="flex-1 bg-transparent text-slate-200 caret-kube-400 outline-none"
            aria-label="Terminal input"
          />
        </div>
      </div>

      {applyText !== null && (
        <ApplyDialog
          text={applyText}
          onChange={setApplyText}
          onClose={() => setApplyText(null)}
          onApply={() => {
            const result = applyManifests(applyText);
            pushInput("kubectl apply -f -");
            pushOutput(result.lines);
            setApplyText(null);
          }}
        />
      )}
    </div>
  );
}

function ApplyDialog({
  text,
  onChange,
  onClose,
  onApply,
}: {
  text: string;
  onChange: (v: string) => void;
  onClose: () => void;
  onApply: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-6">
      <div className="glass flex max-h-[80vh] w-[36rem] max-w-full flex-col rounded-xl border border-panel-700 shadow-2xl">
        <div className="flex items-center justify-between border-b border-panel-700 px-4 py-2">
          <span className="text-sm font-bold text-white">
            kubectl apply -f
          </span>
          <button
            onClick={onClose}
            className="rounded p-1 text-slate-400 hover:bg-panel-700 hover:text-slate-200"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <textarea
          value={text}
          onChange={(e) => onChange(e.target.value)}
          spellCheck={false}
          className="min-h-64 flex-1 resize-none bg-panel-900 p-3 font-mono text-xs text-slate-200 outline-none"
        />
        <div className="flex justify-end gap-2 border-t border-panel-700 px-4 py-2">
          <button
            onClick={onClose}
            className="rounded-md border border-panel-700 bg-panel-850 px-3 py-1.5 text-xs text-slate-300 hover:bg-panel-700"
          >
            Cancel
          </button>
          <button
            onClick={onApply}
            className="rounded-md bg-kube-500 px-3 py-1.5 text-xs font-semibold text-white shadow-glow hover:bg-kube-400"
          >
            Apply
          </button>
        </div>
      </div>
    </div>
  );
}

function commonPrefix(strings: string[]): string {
  if (strings.length === 0) return "";
  let prefix = strings[0];
  for (const s of strings) {
    while (!s.startsWith(prefix)) prefix = prefix.slice(0, -1);
    if (!prefix) break;
  }
  return prefix;
}
