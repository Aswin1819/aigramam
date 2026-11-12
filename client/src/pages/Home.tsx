import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { toast, Toaster } from "sonner";
import WorldView, { type WorldHandle } from "@/world/WorldView";
import { useWorldChoice } from "@/world/useWorldChoice";
import { pickCharacter } from "@/world/characters";
import SkillsManager from "@/components/SkillsManager";
import { useLiveSessions } from "@/hooks/useLiveSessions";
import { isUrgent, statusText } from "@/lib/status";
import { trpc } from "@/lib/trpc";
import TopBar from "@/app/TopBar";
import SessionDock from "@/app/SessionDock";
import DetailDrawer from "@/app/DetailDrawer";
import SettingsSheet, { type SettingsTab } from "@/app/SettingsSheet";
import BrandMark from "@/app/BrandMark";
import { useDisplayPrefs } from "@/app/useDisplayPrefs";

export default function Home() {
  const { snapshot, worlds, characters, mode, connected, now, startDemo, startLive } = useLiveSessions();
  const { active: world, choose: chooseWorld, fellBack } = useWorldChoice(worlds);
  const { prefs, update, hourOverride } = useDisplayPrefs();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [settings, setSettings] = useState<SettingsTab | null>(null);
  const [skillsOpen, setSkillsOpen] = useState(false);
  const worldRef = useRef<WorldHandle>(null);
  const { data: trackedProjects } = trpc.agents.trackedProjects.useQuery(undefined, { enabled: skillsOpen });

  const { sessions, projects, hooks } = snapshot;
  const cast = characters?.characters ?? [];
  const selected = useMemo(() => sessions.find((s) => s.id === selectedId) ?? null, [sessions, selectedId]);

  const select = useCallback((id: string) => {
    setSelectedId((cur) => (cur === id ? null : id));
    worldRef.current?.focus(id);
  }, []);
  const close = useCallback(() => {
    setSelectedId(null);
    worldRef.current?.resetView();
  }, []);

  // Esc closes the drawer / resets the camera.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !settings && !skillsOpen) close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [close, settings, skillsOpen]);

  // A toast the moment a session newly needs approval or asks a question.
  const seenUrgent = useRef<Set<string> | null>(null);
  useEffect(() => {
    const urgentNow = new Set(sessions.filter(isUrgent).map((s) => `${s.id}:${s.statusSince}`));
    if (seenUrgent.current && mode === "live") {
      for (const s of sessions.filter(isUrgent)) {
        if (seenUrgent.current.has(`${s.id}:${s.statusSince}`)) continue;
        toast(`${s.title}`, {
          description: `${statusText(s)}${s.action ? ` · ${s.action.label}` : ""}`,
          action: { label: "Show me", onClick: () => select(s.id) },
          duration: 8000,
        });
      }
    }
    seenUrgent.current = urgentNow;
  }, [sessions, mode, select]);

  const worldKey = world ? `${world.id}@${world.version}|${cast.map((c) => c.version).join(",")}` : "none";
  const brokenPacks = (worlds?.errors.length ?? 0) + (characters?.errors.length ?? 0);
  const emptyHint = mode === "demo" ? "Loading the demo village…" : "No Claude Code sessions are running.\nStart Claude Code in any folder and a villager walks in within seconds.";

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-ink text-cream">
      {/* The world */}
      {world && characters ? (
        <WorldView
          key={worldKey}
          ref={worldRef}
          world={world}
          characters={cast}
          sessions={sessions}
          projects={projects}
          selectedId={selectedId}
          hoveredId={hoveredId}
          onSelect={select}
          now={now}
          hourOverride={hourOverride}
          reducedMotion={prefs.reducedMotion}
        />
      ) : (
        <div className="absolute inset-0 grid place-items-center bg-[radial-gradient(ellipse_at_center,#173129,#0c1714)]">
          <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="flex flex-col items-center gap-3">
            <BrandMark size={72} />
            <div className="font-display text-2xl font-bold">Ai <span className="text-brass">Gramam</span></div>
            <div className="text-sm text-cream/60">{worlds && worlds.worlds.length === 0 ? "No valid world is installed. Open settings to see why." : "Waking up the village…"}</div>
          </motion.div>
        </div>
      )}

      {/* Soft vignette so the glass UI reads over any scene */}
      <div className="pointer-events-none absolute inset-0 z-10 bg-[radial-gradient(ellipse_at_center,transparent_55%,rgba(0,0,0,0.35))]" />

      <TopBar
        sessions={sessions}
        projects={projects}
        worlds={worlds?.worlds ?? []}
        world={world}
        brokenPacks={brokenPacks}
        onWorld={chooseWorld}
        mode={mode}
        connected={connected}
        onLive={startLive}
        onDemo={startDemo}
        time={prefs.time}
        onTime={(time) => update({ time })}
        onSelect={select}
        onSettings={(tab) => setSettings((tab as SettingsTab) ?? "alerts")}
        now={now}
      />

      <SessionDock
        sessions={sessions}
        projects={projects}
        world={world}
        characters={cast}
        selectedId={selectedId}
        open={prefs.dockOpen}
        onToggle={() => update({ dockOpen: !prefs.dockOpen })}
        onSelect={select}
        onHover={setHoveredId}
        now={now}
        emptyHint={emptyHint}
      />

      <AnimatePresence>
        {selected && (
          <DetailDrawer
            key={selected.id}
            session={selected}
            project={projects.find((x) => x.id === selected.projectId)}
            character={pickCharacter(selected.id, world, cast)}
            now={now}
            onClose={close}
            onFocus={() => worldRef.current?.focus(selected.id)}
            onSetupAlerts={() => setSettings("alerts")}
          />
        )}
      </AnimatePresence>

      {/* Empty state */}
      <AnimatePresence>
        {sessions.length === 0 && mode === "live" && world && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="glass pointer-events-auto absolute bottom-6 left-1/2 z-20 w-[min(440px,90vw)] -translate-x-1/2 rounded-2xl p-4 text-center"
          >
            <div className="font-display text-base font-semibold">The village is quiet</div>
            <p className="mt-1 text-sm text-cream/65">Start Claude Code in any folder and a villager walks in within a few seconds.</p>
            <button onClick={startDemo} className="mt-3 rounded-xl bg-brass px-4 py-1.5 text-sm font-semibold text-ink hover:bg-brass/90">Try the demo village</button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Footer status */}
      <div className="pointer-events-none absolute bottom-3 right-3 z-10 flex items-center gap-2 text-[11px] text-cream/55">
        {fellBack && world && <span className="glass pointer-events-auto rounded-xl px-2 py-1 text-wait">Your chosen world isn't available, showing {world.name}</span>}
        {mode === "demo" ? (
          <span className="glass rounded-xl px-2 py-1 text-brass">Demo village · simulated sessions</span>
        ) : hooks.installed ? (
          <span className="glass rounded-xl px-2 py-1">Live · transcripts + hooks</span>
        ) : (
          <button onClick={() => setSettings("alerts")} className="glass pointer-events-auto rounded-xl px-2 py-1 hover:text-cream">Live · transcripts only · <span className="text-wait underline underline-offset-2">exact approval alerts</span></button>
        )}
      </div>

      <AnimatePresence>
        {settings && (
          <SettingsSheet
            tab={settings}
            onTab={setSettings}
            onClose={() => setSettings(null)}
            worlds={worlds}
            activeWorldId={world?.id}
            onWorld={chooseWorld}
            characters={characters}
            lastHookAt={hooks.lastEventAt}
            reducedMotion={prefs.reducedMotion}
            onReducedMotion={(reducedMotion) => update({ reducedMotion })}
            time={prefs.time}
            onTime={(time) => update({ time })}
            onOpenSkills={() => { setSettings(null); setSkillsOpen(true); }}
          />
        )}
      </AnimatePresence>
      {skillsOpen && <SkillsManager onClose={() => setSkillsOpen(false)} projects={trackedProjects ?? []} />}

      <Toaster position="bottom-center" theme="dark" toastOptions={{ className: "!bg-[#13221e]/95 !text-cream !border-white/10 !backdrop-blur-xl" }} />
    </div>
  );
}
