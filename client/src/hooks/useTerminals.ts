import { useCallback, useEffect, useRef, useState } from "react";
import type { TerminalClientMessage, TerminalInfo, TerminalServerMessage, TerminalStart } from "@shared/terminal";
import { chunkInput, neighbourAfterClose } from "@/app/terminal/terminalState";

export type CreateResult = { ok: true; id: string } | { ok: false; error: string };
/** Output for one terminal; `replay` marks the scrollback sent on attach (the view resets first). */
export type OutputListener = (data: string, replay: boolean) => void;

interface Options {
  onTerminal: (fn: (msg: TerminalServerMessage) => void) => () => void;
  sendTerminal: (msg: TerminalClientMessage) => boolean;
}

/**
 * Managed terminals (PowerShell started by Ai Gramam in a project folder) over
 * the app's socket: the list, which one is shown, and per-terminal output
 * listeners for the xterm views. Nothing here ever sends input on its own;
 * `input` is only called with the person's keystrokes and pastes.
 */
export function useTerminals({ onTerminal, sendTerminal }: Options) {
  const [terminals, setTerminals] = useState<TerminalInfo[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  /** The last error from the server (a failed create, a closed terminal). */
  const [error, setError] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const outputs = useRef(new Map<string, Set<OutputListener>>());
  const pending = useRef(new Map<string, (r: CreateResult) => void>());
  const listRef = useRef<TerminalInfo[]>([]);

  useEffect(
    () =>
      onTerminal((msg) => {
        switch (msg.type) {
          case "term-list":
            listRef.current = msg.payload.terminals;
            setTerminals(msg.payload.terminals);
            return;
          case "term-created": {
            const { requestId, ok, id, error } = msg.payload;
            const done = pending.current.get(requestId);
            pending.current.delete(requestId);
            done?.(ok && id ? { ok: true, id } : { ok: false, error: error ?? "Couldn't start the terminal." });
            return;
          }
          case "term-output":
            for (const fn of outputs.current.get(msg.payload.id) ?? []) fn(msg.payload.data, !!msg.payload.replay);
            return;
          case "term-error": {
            const { id, error } = msg.payload;
            if (id) setErrors((e) => ({ ...e, [id]: error }));
            else setError(error);
            return;
          }
        }
      }),
    [onTerminal],
  );

  /**
   * Start PowerShell in a project's folder (only from an explicit click); with
   * start "claude" it runs Claude Code there and stays open after it exits.
   */
  const create = useCallback(
    (projectId: string, start?: TerminalStart, cols = 100, rows = 30): Promise<CreateResult> => {
      const requestId = Math.random().toString(36).slice(2) + Date.now().toString(36);
      setError(null);
      return new Promise((resolve) => {
        const timer = setTimeout(() => {
          pending.current.delete(requestId);
          finish({ ok: false, error: "No answer from the server." });
        }, 10_000);
        const finish = (r: CreateResult) => {
          clearTimeout(timer);
          if (r.ok) setActiveId(r.id);
          else setError(r.error);
          resolve(r);
        };
        pending.current.set(requestId, finish);
        if (!sendTerminal({ type: "term-create", payload: { requestId, projectId, cols, rows, ...(start ? { start } : {}) } })) {
          pending.current.delete(requestId);
          finish({ ok: false, error: "Not connected to Ai Gramam." });
        }
      });
    },
    [sendTerminal],
  );

  const attach = useCallback((id: string) => sendTerminal({ type: "term-attach", payload: { id } }), [sendTerminal]);
  const detach = useCallback((id: string) => sendTerminal({ type: "term-detach", payload: { id } }), [sendTerminal]);
  const input = useCallback(
    (id: string, data: string) => {
      for (const piece of chunkInput(data)) sendTerminal({ type: "term-input", payload: { id, data: piece } });
    },
    [sendTerminal],
  );
  const resize = useCallback((id: string, cols: number, rows: number) => sendTerminal({ type: "term-resize", payload: { id, cols, rows } }), [sendTerminal]);
  /** Stop the shell (if running) and forget the terminal. */
  const close = useCallback(
    (id: string) => {
      setActiveId((cur) => (cur === id ? neighbourAfterClose(listRef.current, id) : cur));
      setErrors(({ [id]: _, ...rest }) => rest);
      return sendTerminal({ type: "term-close", payload: { id } });
    },
    [sendTerminal],
  );

  /** Receive a terminal's output; returns the unsubscribe function. */
  const onOutput = useCallback((id: string, fn: OutputListener) => {
    const set = outputs.current.get(id) ?? new Set<OutputListener>();
    set.add(fn);
    outputs.current.set(id, set);
    return () => {
      set.delete(fn);
      if (!set.size) outputs.current.delete(id);
    };
  }, []);

  const clearError = useCallback(() => setError(null), []);

  return { terminals, activeId, setActiveId, error, clearError, errors, create, attach, detach, input, resize, close, onOutput };
}

export type TerminalsApi = ReturnType<typeof useTerminals>;
