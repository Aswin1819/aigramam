import { useCallback, useMemo, useState } from "react";
import WorldView from "@/world/WorldView";
import WorldsPanel from "@/world/WorldsPanel";
import { useWorldChoice } from "@/world/useWorldChoice";
import SessionSidebar from "@/components/SessionSidebar";
import SessionDetail from "@/components/SessionDetail";
import WaitingBanner from "@/components/WaitingBanner";
import HooksPanel from "@/components/HooksPanel";
import SkillsManager from "@/components/SkillsManager";
import ConfigPanel from "@/components/ConfigPanel";
import { useLiveSessions } from "@/hooks/useLiveSessions";
import { STATUS_META } from "@/lib/status";
import { trpc } from "@/lib/trpc";
import type { SessionStatus } from "@shared/model";

const COUNTED: SessionStatus[] = ["working", "waiting", "idle"];

export default function Home() {
  const { snapshot, worlds, mode, connected, now, startDemo, startLive } = useLiveSessions();
  const { active: world, choose: chooseWorld, fellBack } = useWorldChoice(worlds);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [panel, setPanel] = useState<"hooks" | "skills" | "config" | "worlds" | null>(null);
  const { data: trackedProjects } = trpc.agents.trackedProjects.useQuery(undefined, { enabled: panel === "skills" });

  const { sessions, projects, hooks } = snapshot;
  const selected = useMemo(() => sessions.find((s) => s.id === selectedId) ?? null, [sessions, selectedId]);
  const counts = useMemo(() => {
    const c: Record<SessionStatus, number> = { working: 0, waiting: 0, idle: 0, finished: 0, error: 0 };
    for (const s of sessions) c[s.status]++;
    return c;
  }, [sessions]);
  const select = useCallback((id: string) => setSelectedId((cur) => (cur === id ? null : id)), []);

  const emptyHint = mode === "demo" ? "Loading demo sessions…" : "No Claude Code sessions running.\nStart Claude Code in any folder and it appears here within a few seconds.";

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-[#06060f] font-mono text-white">
      {/* ── Header ── */}
      <header className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b-2 border-[#4B0082] bg-[#0d0a1a] px-3 py-2">
        <div className="flex items-center gap-2">
          <span className="text-lg" aria-hidden>🏰</span>
          <div>
            <h1 className="text-sm font-bold uppercase leading-none tracking-widest text-[#FFD700]">Claude Dungeon</h1>
            <p className="mt-0.5 text-[11px] leading-none text-[#AA88FF]">Live Claude Code sessions</p>
          </div>
        </div>

        <div className="flex items-center gap-1" aria-label="Session counts">
          <span className="rounded border border-[#4B0082] px-2 py-1 text-xs text-gray-300">
            {projects.length} project{projects.length === 1 ? "" : "s"} · {sessions.length} session{sessions.length === 1 ? "" : "s"}
          </span>
          {COUNTED.map((st) => (
            <span key={st} className="rounded px-2 py-1 text-xs font-bold" style={{ color: STATUS_META[st].color, backgroundColor: STATUS_META[st].bg }}>
              <span aria-hidden>{STATUS_META[st].emoji}</span> {counts[st]} {STATUS_META[st].label}
            </span>
          ))}
        </div>

        <div className="flex items-center gap-1.5">
          <label className="flex items-center gap-1 rounded border border-[#4B0082] px-1.5 py-0.5 text-xs text-gray-300">
            <span aria-hidden>🌍</span>
            <span className="sr-only">World</span>
            <select
              value={world?.id ?? ""}
              onChange={(e) => chooseWorld(e.target.value)}
              className="bg-transparent text-xs font-bold text-white outline-none"
              aria-label="World"
            >
              {(worlds?.worlds ?? []).map((w) => (
                <option key={w.id} value={w.id} className="bg-[#0d0a1a]">{w.name}</option>
              ))}
            </select>
          </label>
          <button
            onClick={() => setPanel("worlds")}
            className={`rounded border px-2 py-1 text-xs font-bold ${worlds?.errors.length ? "border-red-500 text-red-300" : "border-[#4B0082] text-gray-300 hover:text-white"}`}
            title="Installed worlds"
          >
            {worlds?.errors.length ? `⚠️ ${worlds.errors.length} broken` : "Worlds"}
          </button>
          <span className={`flex items-center gap-1 rounded border border-gray-700 px-2 py-1 text-xs font-bold ${connected ? "text-green-400" : "text-red-400"}`}>
            <span className={`h-2 w-2 rounded-full ${connected ? "bg-green-400" : "bg-red-500"}`} />
            {connected ? "Online" : "Offline"}
          </span>
          <div className="flex overflow-hidden rounded border border-[#4B0082]" role="group" aria-label="Mode">
            <button onClick={startLive} aria-pressed={mode === "live"} className={`px-2.5 py-1 text-xs font-bold ${mode === "live" ? "bg-[#8B0000] text-white" : "text-gray-400 hover:text-white"}`}>📡 Live</button>
            <button onClick={startDemo} aria-pressed={mode === "demo"} className={`px-2.5 py-1 text-xs font-bold ${mode === "demo" ? "bg-[#4B0082] text-white" : "text-gray-400 hover:text-white"}`}>🎮 Demo</button>
          </div>
          <button onClick={() => setPanel("hooks")} className="rounded border border-[#fbbf24] px-2.5 py-1 text-xs font-bold text-[#fbbf24] hover:bg-[#fbbf24] hover:text-black">
            🔔 Alerts {hooks.installed ? "on" : "setup"}
          </button>
          <button onClick={() => setPanel("config")} className="rounded border border-[#00AAFF] px-2.5 py-1 text-xs font-bold text-[#00AAFF] hover:bg-[#00AAFF] hover:text-black">⚙️ Config</button>
          <button onClick={() => setPanel("skills")} className="rounded border border-[#FFAA00] px-2.5 py-1 text-xs font-bold text-[#FFAA00] hover:bg-[#FFAA00] hover:text-black">✨ Skills</button>
        </div>
      </header>

      <WaitingBanner sessions={sessions} projects={projects} now={now} onSelect={setSelectedId} />

      {/* ── Main ── */}
      <div className="flex min-h-0 flex-1 overflow-hidden">
        <nav className="flex w-72 shrink-0 flex-col overflow-hidden border-r border-[#4B0082] bg-[#0a0a18]" aria-label="Live sessions">
          <div className="border-b border-[#4B0082] bg-[#0d0a1a] px-3 py-2 text-xs font-bold uppercase tracking-widest text-[#AA88FF]">
            Sessions by project
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            <SessionSidebar projects={projects} sessions={sessions} selectedId={selectedId} onSelect={select} now={now} emptyHint={emptyHint} />
          </div>
          <div className="border-t border-[#4B0082] bg-[#0d0a1a] p-2 text-[11px] text-gray-500">
            {mode === "demo" ? (
              <span className="font-bold text-[#a78bfa]">🎮 Demo mode: simulated sessions</span>
            ) : hooks.installed ? (
              <span className="text-green-400">📡 Live · transcripts + hooks</span>
            ) : (
              <span>📡 Live · transcripts only. <button className="text-amber-300 underline" onClick={() => setPanel("hooks")}>Set up exact approval alerts</button></span>
            )}
          </div>
        </nav>

        <main className="relative min-w-0 flex-1">
          {world ? (
            <WorldView key={`${world.id}@${world.version}`} world={world} sessions={sessions} projects={projects} selectedId={selectedId} onSelect={select} now={now} />
          ) : (
            <div className="flex h-full items-center justify-center p-6 text-center text-sm text-gray-400">
              {worlds ? "No valid world is installed. Open Worlds to see what went wrong." : "Loading worlds…"}
            </div>
          )}
          {fellBack && world && (
            <div className="absolute left-3 top-3 rounded border border-amber-500/60 bg-amber-950/80 px-2 py-1 text-xs text-amber-200">
              Your chosen world isn't available right now, showing {world.name}.
            </div>
          )}
          {sessions.length === 0 && (
            <div className="pointer-events-none absolute bottom-4 right-4 max-w-xs rounded-lg border border-[#4B0082] bg-[#06060fe6] px-4 py-3 text-center">
              <div className="text-sm font-bold uppercase tracking-widest text-[#a78bfa]">Waiting for sessions</div>
              <div className="mt-1 whitespace-pre-line text-xs text-gray-400">{emptyHint}</div>
            </div>
          )}
        </main>

        {selected && (
          <div className="w-80 shrink-0 overflow-hidden">
            <SessionDetail session={selected} project={projects.find((p) => p.id === selected.projectId)} now={now} onClose={() => setSelectedId(null)} />
          </div>
        )}
      </div>

      {panel === "worlds" && <WorldsPanel state={worlds} activeId={world?.id} onChoose={(id) => { chooseWorld(id); setPanel(null); }} onClose={() => setPanel(null)} />}
      {panel === "hooks" && <HooksPanel onClose={() => setPanel(null)} lastEventAt={hooks.lastEventAt} />}
      {panel === "skills" && <SkillsManager onClose={() => setPanel(null)} projects={trackedProjects ?? []} />}
      {panel === "config" && <ConfigPanel onClose={() => setPanel(null)} />}
    </div>
  );
}
