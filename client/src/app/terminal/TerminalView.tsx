import { useEffect, useRef } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";
import { Eraser, FolderOpen, Power, TerminalSquare } from "lucide-react";
import { TERMINAL_LIMITS as L, type TerminalInfo } from "@shared/terminal";
import type { TerminalsApi } from "@/hooks/useTerminals";
import { terminalStatusText } from "./terminalState";

interface Props {
  info: TerminalInfo;
  api: TerminalsApi;
  /** The app's socket is open (re-attach when it comes back). */
  connected: boolean;
  /** The inline "Close terminal?" confirm is showing (also opened by a tab's ×). */
  confirmClose: boolean;
  onConfirmClose: (show: boolean) => void;
}

const THEME = {
  background: "#0b1411",
  foreground: "#fff8e7",
  cursor: "#e3b04b",
  cursorAccent: "#0b1411",
  selectionBackground: "rgba(227, 176, 75, 0.35)",
  black: "#0c1714",
  brightBlack: "#5d6b66",
  white: "#e8e1cf",
  brightWhite: "#fff8e7",
  yellow: "#e3b04b",
  brightYellow: "#f5c76a",
  green: "#8ee59a",
  brightGreen: "#b4f0bc",
  cyan: "#5eead4",
  brightCyan: "#99f6e4",
  red: "#ff5a4f",
  brightRed: "#ff8a80",
};
const FONT = '"Cascadia Code", "Cascadia Mono", Consolas, ui-monospace, monospace';

/**
 * One managed terminal in xterm.js. Only the person's keystrokes and pastes
 * are sent to the shell; output (including the scrollback replayed on attach)
 * is written as it arrives.
 */
export default function TerminalView({ info, api, connected, confirmClose, onConfirmClose }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const running = info.status === "running";
  const runningRef = useRef(running);
  runningRef.current = running;
  const { attach, detach, input, resize, onOutput, close } = api;
  const id = info.id;

  // The xterm instance, its output and keyboard input, and fitting to the container.
  useEffect(() => {
    if (!host.current) return;
    const term = new Terminal({
      theme: THEME,
      fontFamily: FONT,
      fontSize: 13,
      lineHeight: 1.15,
      cursorBlink: true,
      scrollback: 5000,
      allowProposedApi: false,
      disableStdin: !runningRef.current,
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(host.current);
    termRef.current = term;
    fitRef.current = fit;

    // Ctrl+V / Ctrl+Shift+V paste and Ctrl+C with a selection copy go to the browser
    // (xterm then reads the paste event and sends it through onData).
    term.attachCustomKeyEventHandler((e) => {
      if (e.type !== "keydown" || !e.ctrlKey || e.altKey) return true;
      const k = e.key.toLowerCase();
      if (k === "v") return false;
      if (k === "c" && (e.shiftKey || term.hasSelection())) return false;
      return true;
    });
    const dataSub = term.onData((data) => {
      if (runningRef.current) input(id, data);
    });
    const offOutput = onOutput(id, (data, replay) => {
      // The replay is the whole kept scrollback, so start from a clean screen.
      if (replay) term.reset();
      term.write(data);
    });

    let last = "";
    const refit = () => {
      if (!host.current || host.current.clientWidth < 20 || host.current.clientHeight < 20) return;
      try {
        fit.fit();
      } catch {
        return;
      }
      const cols = Math.min(L.maxCols, Math.max(L.minCols, term.cols));
      const rows = Math.min(L.maxRows, Math.max(L.minRows, term.rows));
      const key = `${cols}x${rows}`;
      if (key !== last && runningRef.current) {
        last = key;
        resize(id, cols, rows);
      }
    };
    let raf = 0;
    const ro = new ResizeObserver(() => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(refit);
    });
    ro.observe(host.current);
    refit();
    if (runningRef.current) term.focus();

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      dataSub.dispose();
      offOutput();
      term.dispose();
      termRef.current = null;
      fitRef.current = null;
    };
  }, [id, input, onOutput, resize]);

  // Attach while shown (and again after a reconnect: the server forgets subscriptions).
  useEffect(() => {
    if (!connected) return;
    attach(id);
    return () => void detach(id);
  }, [id, connected, attach, detach]);

  // When the shell exits: block input, keep the output.
  useEffect(() => {
    const term = termRef.current;
    if (!term) return;
    term.options.disableStdin = !running;
    term.options.cursorBlink = running;
    // No cursor once the shell has exited (nothing can be typed).
    term.options.cursorInactiveStyle = running ? "outline" : "none";
    if (!running) term.blur();
  }, [running]);

  const error = api.errors[id];

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#0b1411]">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-white/8 bg-black/25 px-3 py-1.5 text-[12px]">
        <span className="flex items-center gap-1.5 font-semibold text-cream">
          <TerminalSquare size={14} className="text-brass" /> {info.projectName}
        </span>
        <span className="flex min-w-0 max-w-[45%] items-center gap-1 font-mono text-[11px] text-cream/55" title={`Runs in ${info.cwd}`}>
          <FolderOpen size={12} className="shrink-0" />
          <span className="truncate">{info.cwd}</span>
        </span>
        <span className="text-cream/45">{info.shell}</span>
        <span className={`flex items-center gap-1 ${running ? "text-work" : info.exitCode ? "text-urgent" : "text-cream/60"}`}>
          <span className={`h-2 w-2 rounded-full ${running ? "bg-work" : info.exitCode ? "bg-urgent" : "bg-idle"}`} />
          {terminalStatusText(info)}
        </span>
        <span className="ml-auto flex items-center gap-1">
          <button onClick={() => termRef.current?.clear()} className="flex items-center gap-1 rounded-lg px-2 py-1 text-cream/70 hover:bg-white/10 hover:text-cream" title="Clear the screen here (the shell isn't affected)">
            <Eraser size={13} /> Clear
          </button>
          {confirmClose ? (
            <span className="flex items-center gap-1 rounded-lg bg-urgent/15 px-2 py-0.5 text-cream" role="alertdialog" aria-label="Confirm closing the terminal">
              {running ? "Stop PowerShell and close?" : "Close this terminal?"}
              <button onClick={() => close(id)} className="rounded-md bg-urgent px-2 py-0.5 font-semibold text-white hover:bg-urgent/85" autoFocus>
                Close
              </button>
              <button onClick={() => onConfirmClose(false)} className="rounded-md px-2 py-0.5 text-cream/75 hover:bg-white/10">
                Cancel
              </button>
            </span>
          ) : (
            <button onClick={() => onConfirmClose(true)} className="flex items-center gap-1 rounded-lg px-2 py-1 text-cream/70 hover:bg-urgent/15 hover:text-cream" title={running ? "Stops the shell and closes the terminal" : "Closes the terminal"}>
              <Power size={13} /> Close terminal
            </button>
          )}
        </span>
      </div>
      <div className="relative min-h-0 flex-1 px-2 pt-1.5">
        <div ref={host} className="h-full w-full" onClick={() => termRef.current?.focus()} />
      </div>
      {(!running || error || !connected) && (
        <div className={`border-t border-white/8 px-3 py-1.5 text-[12px] ${!running && info.exitCode ? "text-urgent" : "text-cream/70"}`}>
          {!running
            ? `Process exited with code ${info.exitCode ?? "unknown"}. The output stays here until you close the terminal.`
            : !connected
              ? "Not connected to Ai Gramam. The terminal keeps running; it reconnects automatically."
              : error}
        </div>
      )}
    </div>
  );
}
