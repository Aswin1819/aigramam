/**
 * Workspace → Focus: the village in a strip on top, then a queue of every
 * session (what needs you first) and the chosen session's conversation and
 * controls beside it, so you can work through them without leaving the page.
 * ↑/↓ or j/k move, Ctrl+K finds any session or project. Only live data; in
 * the demo nothing is sent.
 */
import { useEffect, useMemo, useState } from "react";
import { Link2, PanelRightOpen, Search, Unplug, Zap } from "lucide-react";
import type { ChatItem, ProjectView, SessionView } from "@shared/model";
import type { AppMode, CommandOutcome } from "@/hooks/useLiveSessions";
import ChatPanel from "../ChatPanel";
import RequestCard from "../RequestCard";
import SessionControls from "../SessionControls";
import SetupChecks from "../SetupChecks";
import { GROUP_TITLE, byAttention, controlOf, paletteMatches, plainStatus, step } from "./focus";
import VillageStrip, { Face, StatusLine, TONE_TEXT, characterOf, type Cast } from "./VillageStrip";

type Command = (type: "session-message" | "session-stop" | "approval-decide", payload: Record<string, unknown>) => Promise<CommandOutcome>;

interface Props {
  sessions: SessionView[];
  projects: ProjectView[];
  now: number;
  mode: AppMode;
  connected: boolean;
  hooksInstalled: boolean;
  cast: Cast;
  command: Command;
  /** The conversation the server is streaming (for the focused session). */
  chat: { sessionId: string; items: ChatItem[] } | null;
  focusId: string | null;
  onFocus: (id: string | null) => void;
  /** Open the full drawer (changes, subagents, character, terminal). */
  onOpenDetails: (id: string) => void;
  onOpenProject: (projectId: string) => void;
  onDecide: (approvalId: string, decision: "allow" | "deny") => void;
  onSettings: (tab?: string) => void;
}

export default function FocusPage(p: Props) {
  const demo = p.mode === "demo";
  const queue = useMemo(() => [...p.sessions].sort(byAttention(p.now)), [p.sessions, p.now]);
  const current = queue.find((s) => s.id === p.focusId) ?? queue[0] ?? null;
  const [palette, setPalette] = useState(false);
  const { onFocus } = p;

  // Keep the focus on a real session (the first in the queue when none is chosen or it ended).
  useEffect(() => {
    if ((current?.id ?? null) !== p.focusId) onFocus(current?.id ?? null);
  }, [current?.id, p.focusId, onFocus]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPalette(true);
        return;
      }
      const t = e.target;
      const typing = t instanceof HTMLElement && (/input|textarea|select/i.test(t.tagName) || t.isContentEditable);
      if (typing || palette || e.altKey || e.ctrlKey || e.metaKey) return;
      if (e.key === "ArrowDown" || e.key === "j") { e.preventDefault(); onFocus(step(queue, current?.id ?? null, 1)); }
      if (e.key === "ArrowUp" || e.key === "k") { e.preventDefault(); onFocus(step(queue, current?.id ?? null, -1)); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [queue, current?.id, palette, onFocus]);

  // Keep the focused row in view when moving with the keyboard.
  useEffect(() => {
    if (current) document.getElementById(`focus-row-${current.id}`)?.scrollIntoView({ block: "nearest" });
  }, [current?.id]);

  const projectName = (s: SessionView) => p.projects.find((x) => x.id === s.projectId)?.name ?? (s.cwd.split(/[\\/]/).filter(Boolean).pop() || "Project");
  const linked = p.sessions.filter((s) => s.link?.connected).length;
  const emptyText = demo ? "The demo village is empty." : !p.connected ? "Can't reach the Ai Gramam server. Reconnecting…" : "The village is quiet: no Claude Code sessions are running.";

  let lastGroup = "";
  return (
    <div className="space-y-3">
      {/* Where the data comes from, and whether it's flowing at all. */}
      <div className="flex flex-wrap items-center gap-2 text-[12px]">
        {!p.connected && !demo ? (
          <span className="chip bg-urgent/20 text-urgent"><Unplug size={13} /> Not connected to the Ai Gramam server. Is it still running?</span>
        ) : demo ? (
          <span className="chip bg-brass/20 text-brass">Demo village: simulated sessions, nothing here is real or sent</span>
        ) : (
          <span className="chip bg-work/15 text-work"><Zap size={13} /> Live · {p.hooksInstalled ? "transcripts + hooks" : "transcripts only"}</span>
        )}
        {!demo && p.sessions.length > 0 && (
          <button onClick={() => p.onSettings("link")} className="chip bg-white/5 text-cream/70 hover:bg-white/10" title="Linked sessions can be messaged, stopped, approved and answered from here">
            <Link2 size={13} /> {linked} of {p.sessions.length} sessions linked to the mod
          </button>
        )}
      </div>

      <VillageStrip c={p.cast} sessions={p.sessions} projects={p.projects} now={p.now} selectedId={current?.id ?? null} onSelect={(id) => p.onFocus(id)} onProject={p.onOpenProject} empty={emptyText} />

      {p.sessions.length === 0 ? (
        <div className="glass rounded-2xl p-6 text-center">
          <div className="font-display text-lg font-semibold">{emptyText}</div>
          <p className="mx-auto mt-1 max-w-md text-[13px] text-cream/60">
            {!demo && !p.connected
              ? "Sessions can't be shown until this page reconnects; this doesn't mean none are running."
              : "Start Claude Code in any project folder and it shows up here within a few seconds. Sessions are read from your local Claude Code files; nothing leaves this computer."}
          </p>
          {!demo && <div className="mx-auto mt-4 max-w-lg"><SetupChecks connected={p.connected} compact /></div>}
        </div>
      ) : (
        <div className="grid h-[calc(100vh-290px)] min-h-[460px] gap-3 lg:grid-cols-[340px_minmax(0,1fr)]">
          <div className="glass flex min-h-0 flex-col rounded-2xl">
            <button onClick={() => setPalette(true)} className="m-2 flex items-center gap-2 rounded-xl border border-white/10 bg-black/25 px-3 py-2 text-left text-[13px] text-cream/55 hover:bg-white/5">
              <Search size={14} /> Find a session or project <kbd className="ml-auto rounded bg-white/10 px-1.5 text-[11px]">Ctrl K</kbd>
            </button>
            <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2" role="listbox" aria-label="Sessions, most in need of you first">
              {queue.map((s) => {
                const tone = plainStatus(s, p.now).tone;
                const head = GROUP_TITLE[tone];
                const showHead = head !== lastGroup;
                lastGroup = head;
                const on = current?.id === s.id;
                const ask = s.link?.approval;
                return (
                  <div key={s.id}>
                    {showHead && <div className={`px-2 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-[0.12em] ${TONE_TEXT[tone]}`}>{head}</div>}
                    <div
                      id={`focus-row-${s.id}`}
                      role="option"
                      aria-selected={on}
                      tabIndex={-1}
                      onClick={() => p.onFocus(s.id)}
                      className={`flex w-full cursor-pointer items-center gap-2.5 rounded-xl p-2 text-left ${on ? "bg-brass/15 ring-1 ring-brass/60" : "hover:bg-white/5"}`}
                    >
                      <Face c={p.cast} s={s} now={p.now} size={38} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13px] font-semibold text-cream">{s.title}</span>
                        <span className="block truncate text-[11.5px] text-cream/55">{projectName(s)} · {plainStatus(s, p.now).detail}</span>
                      </span>
                      {ask && !ask.questions && !demo && (
                        <span className="flex shrink-0 flex-col gap-1" onClick={(e) => e.stopPropagation()}>
                          <button onClick={() => p.onDecide(ask.id, "allow")} className="rounded-md bg-work px-2 py-0.5 text-[11px] font-semibold text-ink hover:brightness-110">Approve</button>
                          <button onClick={() => p.onDecide(ask.id, "deny")} className="rounded-md border border-white/20 px-2 py-0.5 text-[11px] text-cream hover:bg-white/10">Deny</button>
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
            <p className="border-t border-white/8 px-3 py-1.5 text-[11px] text-cream/45">↑ ↓ or j k to move · Ctrl K to find</p>
          </div>

          <div className="glass flex min-h-0 flex-col overflow-hidden rounded-2xl">
            {!current ? (
              <p className="m-auto text-[13px] text-cream/60">Pick a session.</p>
            ) : (
              <>
                <header className="flex items-center gap-3 border-b border-white/8 p-3">
                  <Face c={p.cast} s={current} now={p.now} size={52} />
                  <div className="min-w-0 flex-1">
                    <h2 className="truncate font-display text-[17px] font-bold text-cream">{current.title}</h2>
                    <div className="truncate text-[12px] text-cream/55" title={current.cwd}>{projectName(current)}{current.gitBranch ? ` · ${current.gitBranch}` : ""}</div>
                    <StatusLine s={current} now={p.now} />
                  </div>
                  <button onClick={() => p.onOpenDetails(current.id)} className="flex shrink-0 items-center gap-1.5 rounded-xl border border-white/15 px-2.5 py-1.5 text-[12px] text-cream/80 hover:bg-white/10" title="Changes, subagents, character and terminal">
                    <PanelRightOpen size={14} /> Details
                  </button>
                </header>
                <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
                  <ChatPanel
                    session={current}
                    character={characterOf(p.cast, current)}
                    items={p.chat?.sessionId === current.id ? p.chat.items : null}
                    request={current.link?.approval && !demo ? { id: current.link.approval.id, node: <RequestCard approval={current.link.approval} now={p.now} command={p.command} /> } : null}
                    footer={
                      controlOf(current, demo).canAct ? (
                        <SessionControls session={current} demo={demo} command={p.command} onSetupLink={() => p.onSettings("link")} />
                      ) : (
                        <p className="px-3 py-2 text-[12px] text-cream/55">
                          {controlOf(current, demo).why}{" "}
                          {!demo && <button onClick={() => p.onSettings("link")} className="text-brass underline underline-offset-2">How to link it</button>}
                        </p>
                      )
                    }
                  />
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {palette && <Palette sessions={p.sessions} projects={p.projects} projectName={projectName} onFocus={p.onFocus} onProject={p.onOpenProject} onClose={() => setPalette(false)} />}
    </div>
  );
}

function Palette({ sessions, projects, projectName, onFocus, onProject, onClose }: { sessions: SessionView[]; projects: ProjectView[]; projectName: (s: SessionView) => string; onFocus: (id: string) => void; onProject: (id: string) => void; onClose: () => void }) {
  const [q, setQ] = useState("");
  const [i, setI] = useState(0);
  const items = useMemo(() => {
    const all = [
      ...sessions.map((s) => ({ key: `s-${s.id}`, kind: "Session", label: s.title, sub: projectName(s), go: () => onFocus(s.id) })),
      ...projects.map((pr) => ({ key: `p-${pr.id}`, kind: "Project", label: pr.name, sub: pr.root, go: () => onProject(pr.id) })),
    ];
    return paletteMatches(all, q);
  }, [q, sessions, projects, projectName, onFocus, onProject]);
  const pick = (k: number) => {
    items[k]?.go();
    onClose();
  };
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/55 pt-[12vh]" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-label="Find a session or project" className="w-[min(560px,92vw)] overflow-hidden rounded-2xl border border-white/15 bg-[#13221e] shadow-2xl">
        <input
          autoFocus
          value={q}
          onChange={(e) => { setQ(e.target.value); setI(0); }}
          onKeyDown={(e) => {
            if (e.key === "Escape") { e.stopPropagation(); onClose(); }
            if (e.key === "ArrowDown") { e.preventDefault(); setI((x) => Math.min(items.length - 1, x + 1)); }
            if (e.key === "ArrowUp") { e.preventDefault(); setI((x) => Math.max(0, x - 1)); }
            if (e.key === "Enter") pick(i);
          }}
          placeholder="Find a session or project…"
          className="w-full border-b border-white/10 bg-transparent px-4 py-3 text-[14px] text-cream outline-none placeholder:text-cream/40"
        />
        <ul className="max-h-[50vh] overflow-y-auto p-1.5">
          {items.length === 0 && <li className="px-3 py-2 text-[13px] text-cream/55">Nothing matches.</li>}
          {items.map((x, k) => (
            <li key={x.key}>
              <button onMouseEnter={() => setI(k)} onClick={() => pick(k)} className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left ${k === i ? "bg-brass/15" : ""}`}>
                <span className="w-14 shrink-0 text-[10.5px] uppercase tracking-wider text-brass">{x.kind}</span>
                <span className="min-w-0">
                  <span className="block truncate text-[13px] text-cream">{x.label}</span>
                  <span className="block truncate text-[11.5px] text-cream/50">{x.sub}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
