import { useEffect, useMemo, useRef, useState } from "react";
import { Bot, ChevronDown, Plus, TerminalSquare, X } from "lucide-react";
import type { ProjectView, SessionView } from "@shared/model";
import { TERMINAL_LIMITS, type TerminalStart } from "@shared/terminal";
import type { AppMode } from "@/hooks/useLiveSessions";
import type { TerminalsApi } from "@/hooks/useTerminals";
import TerminalView from "../terminal/TerminalView";
import { resolveActive, terminalBlockedReason, terminalStatusText } from "../terminal/terminalState";
import { projectSummaries } from "./attention";

interface Props {
  api: TerminalsApi;
  sessions: SessionView[];
  projects: ProjectView[];
  mode: AppMode;
  connected: boolean;
  /** The session open in the drawer, and how to open one (from a terminal's "Claude: …" link). */
  selectedSessionId?: string | null;
  onSelectSession?: (id: string) => void;
}

/**
 * Terminals: a shell (PowerShell on Windows, your own shell elsewhere) that Ai Gramam starts in a project folder when the
 * person clicks (optionally running Claude Code), shown here. Terminals the
 * person opened themselves are not (and can't be) shown.
 */
export default function TerminalsPage({ api, sessions, projects, mode, connected, selectedSessionId, onSelectSession }: Props) {
  const [picker, setPicker] = useState(false);
  const [busy, setBusy] = useState(false);
  /** The terminal whose "Close terminal" confirm is showing. */
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const pickerRef = useRef<HTMLDivElement>(null);
  const withSessions = useMemo(() => projectSummaries(projects, sessions).map((s) => s.project), [projects, sessions]);
  // Demo tabs never see the live terminal list.
  const terminals = mode === "demo" ? [] : api.terminals;
  const active = resolveActive(terminals, api.activeId);
  const blocked = terminalBlockedReason(mode, connected, terminals.length) ?? (withSessions.length ? null : "No project has an open Claude Code session, so there's no folder to start in.");

  useEffect(() => {
    if (!picker) return;
    const onDown = (e: MouseEvent) => !pickerRef.current?.contains(e.target as Node) && setPicker(false);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setPicker(false);
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [picker]);
  useEffect(() => {
    if (blocked) setPicker(false);
  }, [blocked]);

  const start = async (projectId: string, what?: TerminalStart) => {
    setPicker(false);
    setBusy(true);
    await api.create(projectId, what);
    setBusy(false);
  };
  const openSession = onSelectSession ? (id: string) => id !== selectedSessionId && onSelectSession(id) : undefined;

  return (
    <div className="flex min-h-[360px] flex-col gap-2" style={{ height: "calc(100vh - 152px)" }}>
      <div className="flex flex-wrap items-center gap-1.5">
        <div className="flex min-w-0 flex-1 flex-wrap gap-1" role="tablist" aria-label="Open terminals">
          {terminals.map((t) => {
            const on = t.id === active?.id;
            const dot = t.status === "running" ? "bg-work" : t.exitCode ? "bg-urgent" : "bg-idle";
            return (
              <div key={t.id} className={`flex items-center rounded-xl border text-[12.5px] ${on ? "border-brass/60 bg-brass/10" : "border-white/8 bg-black/20 hover:bg-white/5"}`}>
                <button role="tab" aria-selected={on} onClick={() => api.setActiveId(t.id)} className="flex max-w-[220px] items-center gap-1.5 py-1 pl-2.5 pr-1" title={`${t.projectName} · ${t.cwd} · ${terminalStatusText(t)}`}>
                  <span className={`h-2 w-2 shrink-0 rounded-full ${dot}`} aria-hidden />
                  <span className={`truncate ${on ? "font-semibold text-cream" : "text-cream/75"}`}>{t.projectName}</span>
                  {(t.started === "claude" || t.sessionIds?.length > 0) && (
                    <span className="flex shrink-0 items-center gap-0.5 text-[11px] text-brass/90" title={t.sessionIds?.length ? "Claude Code is running in this terminal" : "Started with Claude Code"}>
                      <Bot size={11} /> Claude
                    </span>
                  )}
                  <span className="sr-only">{terminalStatusText(t)}</span>
                  {t.status === "exited" && <span className="shrink-0 text-[11px] text-cream/45">exited</span>}
                </button>
                <button
                  onClick={() => {
                    api.setActiveId(t.id);
                    setConfirmId(t.id);
                  }}
                  className="mr-1 grid h-5 w-5 place-items-center rounded-md text-cream/45 hover:bg-white/10 hover:text-cream"
                  aria-label={`Close the ${t.projectName} terminal`}
                  title="Close (asks first)"
                >
                  <X size={12} />
                </button>
              </div>
            );
          })}
        </div>

        <span className="text-[11px] text-cream/45">{terminals.length} of {TERMINAL_LIMITS.maxOpen} open</span>
        <div ref={pickerRef} className="relative">
          <button
            onClick={() => setPicker((v) => !v)}
            disabled={!!blocked || busy}
            aria-haspopup="menu"
            aria-expanded={picker}
            title={blocked ?? `Start ${api.shellName} (or Claude Code) in a project's folder`}
            className="flex items-center gap-1.5 rounded-xl bg-brass px-3 py-1.5 text-[12.5px] font-semibold text-ink hover:bg-brass/90 disabled:cursor-not-allowed disabled:bg-white/10 disabled:text-cream/40"
          >
            <Plus size={14} /> {busy ? "Starting…" : "New terminal"} <ChevronDown size={13} />
          </button>
          {picker && (
            <div role="menu" aria-label="Choose a project folder" className="glass-strong absolute right-0 top-[calc(100%+6px)] z-30 w-[380px] max-w-[calc(100vw-32px)] rounded-xl p-1.5">
              <p className="px-2 pb-1 pt-0.5 text-[11px] text-cream/50">Start in the folder of:</p>
              <div className="max-h-[300px] overflow-y-auto">
                {withSessions.map((pr) => (
                  <div key={pr.id} className="rounded-lg px-2 py-1.5 hover:bg-white/5">
                    <div className="truncate text-[13px] font-semibold text-cream">{pr.name}</div>
                    <div className="truncate font-mono text-[11px] text-cream/50">{pr.root}</div>
                    <div className="mt-1 flex flex-wrap gap-1">
                      <button role="menuitem" onClick={() => start(pr.id)} title={`Start ${api.shellName} in ${pr.root}`} className="flex items-center gap-1 rounded-md border border-white/10 bg-black/20 px-2 py-0.5 text-[12px] text-cream/85 hover:bg-white/10">
                        <TerminalSquare size={12} className="text-brass" /> {api.shellName}
                      </button>
                      <button role="menuitem" onClick={() => start(pr.id, "claude")} title={`Start ${api.shellName} in ${pr.root} and run Claude Code (claude) in it`} className="flex items-center gap-1 rounded-md border border-brass/40 bg-brass/10 px-2 py-0.5 text-[12px] font-semibold text-cream hover:bg-brass/20">
                        <Bot size={12} className="text-brass" /> Start Claude Code
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {blocked && <p className="text-[12px] text-cream/55">{blocked}</p>}
      {api.error && (
        <div className="flex items-start gap-2 rounded-xl border border-urgent/40 bg-urgent/10 px-3 py-1.5 text-[12.5px] text-cream" role="alert">
          <span className="flex-1">Couldn't start the terminal: {api.error}</span>
          <button onClick={api.clearError} className="text-cream/60 hover:text-cream" aria-label="Dismiss">
            <X size={14} />
          </button>
        </div>
      )}

      <div className="min-h-0 flex-1">
        {active ? (
          <TerminalView
            key={active.id}
            info={active}
            api={api}
            connected={connected}
            confirmClose={confirmId === active.id}
            onConfirmClose={(v) => setConfirmId(v ? active.id : null)}
            sessions={sessions}
            onOpenSession={openSession}
          />
        ) : (
          <div className="glass grid h-full place-items-center rounded-2xl p-6 text-center">
            <div className="max-w-[460px]">
              <TerminalSquare size={26} className="mx-auto mb-2 text-brass/80" />
              <div className="font-display text-[16px] font-semibold text-cream">No terminals open</div>
              <p className="mt-1.5 text-[13px] text-cream/65">
                {api.shellName} started by Ai Gramam in a project folder, optionally running Claude Code. It runs on this computer with your permissions. Terminals you opened yourself aren't shown here.
              </p>
              <p className="mt-2 text-[12px] text-cream/45">
                Choose <b className="text-cream/70">New terminal</b>, a project, then <b className="text-cream/70">{api.shellName}</b> or <b className="text-cream/70">Start Claude Code</b>. Up to {TERMINAL_LIMITS.maxOpen} can be open; each keeps its recent output until you close it.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
