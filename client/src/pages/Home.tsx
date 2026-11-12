import type { SessionView } from "@shared/model";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { toast, Toaster } from "sonner";
import WorldView, { type WorldHandle } from "@/world/WorldView";
import StyledWorldView from "@/world/StyledWorldView";
import { ART_STYLES } from "@/styles/live/registry";
import { placeThemeOf, type LiveStyle } from "@/styles/live/types";
import { useWorldChoice } from "@/world/useWorldChoice";
import { assignmentsKey, pickCharacter } from "@/world/characters";
import SkillsManager from "@/components/SkillsManager";
import { useLiveSessions } from "@/hooks/useLiveSessions";
import { isUrgent, statusText } from "@/lib/status";
import { trpc } from "@/lib/trpc";
import { playChime } from "@/lib/chime";
import TopBar from "@/app/TopBar";
import SessionDock from "@/app/SessionDock";
import DetailDrawer from "@/app/DetailDrawer";
import SettingsSheet, { type SettingsTab } from "@/app/SettingsSheet";
import BrandMark from "@/app/BrandMark";
import { useDisplayPrefs } from "@/app/useDisplayPrefs";

export default function Home() {
  const { snapshot, worlds, characters, mode, connected, now, startDemo, startLive, command, chat, openChat } = useLiveSessions();
  const { active: world, choose: chooseWorld, fellBack } = useWorldChoice(worlds);
  const { prefs, update, hourOverride } = useDisplayPrefs();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [settings, setSettings] = useState<SettingsTab | null>(null);
  const [skillsOpen, setSkillsOpen] = useState(false);
  const worldRef = useRef<WorldHandle>(null);
  // The chosen art style's renderer, loaded on demand ("classic" = the Phaser world).
  const [liveStyle, setLiveStyle] = useState<LiveStyle | null>(null);
  useEffect(() => {
    const entry = ART_STYLES.find((a) => a.id === prefs.artStyle);
    if (!entry) return setLiveStyle(null);
    let alive = true;
    entry.load().then(
      (s) => alive && setLiveStyle(s),
      () => {
        if (!alive) return;
        toast.error(`Couldn't load the ${entry.name} style`);
        update({ artStyle: "classic" });
      },
    );
    return () => { alive = false; };
  }, [prefs.artStyle, update]);
  const styled = prefs.artStyle !== "classic" && liveStyle?.id === prefs.artStyle ? liveStyle : null;
  const { data: trackedProjects } = trpc.agents.trackedProjects.useQuery(undefined, { enabled: skillsOpen });

  const { sessions, projects, hooks } = snapshot;
  const cast = characters?.characters ?? [];
  const assignments = characters?.assignments;
  // A chosen character also dresses the villagers in the art styles.
  const paletteOf = useCallback(
    (s: SessionView) => (assignments?.[s.projectId] ? pickCharacter(s, world, cast, assignments)?.def.palette : undefined),
    [assignments, world, cast],
  );
  const assignCharacter = trpc.worlds.assignCharacter.useMutation({
    onError: () => toast.error("Couldn't save the character choice"),
  });
  const selected = useMemo(() => sessions.find((s) => s.id === selectedId) ?? null, [sessions, selectedId]);
  // Follow the selected session's conversation while its drawer is open.
  useEffect(() => openChat(selected ? selected.id : null), [selected?.id, openChat]);

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

  const decide = useCallback(async (approvalId: string, decision: "allow" | "deny") => {
    const r = await command("approval-decide", { approvalId, decision });
    if (!r.ok) toast.error(r.error ?? "Couldn't send your answer");
    else toast.success(decision === "allow" ? "Approved" : "Denied");
  }, [command]);

  // A toast (and a sound) the moment a session newly needs approval or asks a question.
  const seenUrgent = useRef<Set<string> | null>(null);
  const seenTurns = useRef<Set<string> | null>(null);
  const shownApprovals = useRef(new Set<string>());
  useEffect(() => {
    const urgentNow = new Set(sessions.filter(isUrgent).map((s) => `${s.id}:${s.statusSince}`));
    const turnsNow = new Set(sessions.filter((s) => s.status === "waiting" && s.waitingReason === "turn_end").map((s) => `${s.id}:${s.statusSince}`));
    if (seenUrgent.current && mode === "live") {
      let urgentNew = false;
      for (const s of sessions.filter(isUrgent)) {
        if (seenUrgent.current.has(`${s.id}:${s.statusSince}`)) continue;
        urgentNew = true;
        const approval = s.link?.approval;
        // Approvals can be answered right in the toast; questions need the card in the chat.
        const quick = approval && !approval.questions ? approval : null;
        toast(`${s.title}`, {
          // One toast per request, so it can be closed once the request is answered anywhere.
          id: approval ? `approval:${approval.id}` : `urgent:${s.id}:${s.statusSince}`,
          description: approval?.questions ? `Asks: ${approval.label}` : `${statusText(s)}${s.action ? ` · ${s.action.label}` : ""}`,
          action: quick ? { label: "Approve", onClick: () => decide(quick.id, "allow") } : { label: approval?.questions ? "Answer" : "Show me", onClick: () => select(s.id) },
          cancel: quick ? { label: "Deny", onClick: () => decide(quick.id, "deny") } : undefined,
          duration: approval ? 45000 : 8000,
        });
      }
      const turnNew = !!seenTurns.current && [...turnsNow].some((k) => !seenTurns.current!.has(k));
      if (prefs.sound && urgentNew) playChime("urgent");
      else if (prefs.sound && turnNew) playChime("soft");
    }
    seenTurns.current = turnsNow;
    // Close toasts for requests that were answered (here, in the terminal) or expired.
    const openApprovals = new Set(sessions.map((s) => s.link?.approval?.id).filter(Boolean));
    for (const id of shownApprovals.current) {
      if (!openApprovals.has(id)) {
        toast.dismiss(`approval:${id}`);
        shownApprovals.current.delete(id);
      }
    }
    for (const id of openApprovals) shownApprovals.current.add(id as string);
    seenUrgent.current = urgentNow;
  }, [sessions, mode, select, decide, prefs.sound]);

  const worldKey = world ? `${world.id}@${world.version}|${cast.map((c) => c.version).join(",")}|${assignmentsKey(assignments)}` : "none";
  const brokenPacks = (worlds?.errors.length ?? 0) + (characters?.errors.length ?? 0);
  const emptyHint = mode === "demo" ? "Loading the demo village…" : "No Claude Code sessions are running.\nStart Claude Code in any folder and a villager walks in within seconds.";

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-ink text-cream">
      {/* The world */}
      {styled ? (
        <StyledWorldView
          ref={worldRef}
          style={styled}
          sessions={sessions}
          projects={projects}
          selectedId={selectedId}
          hoveredId={hoveredId}
          onSelect={select}
          reducedMotion={prefs.reducedMotion}
          hourOverride={hourOverride}
          paletteOf={paletteOf}
          theme={placeThemeOf(world)}
        />
      ) : !ART_STYLES.some((a) => a.id === prefs.artStyle) && world && characters ? (
        <WorldView
          key={worldKey}
          ref={worldRef}
          world={world}
          characters={cast}
          assignments={assignments}
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
        artStyle={prefs.artStyle}
        onArtStyle={(artStyle) => update({ artStyle })}
        mode={mode}
        connected={connected}
        onLive={startLive}
        onDemo={startDemo}
        time={prefs.time}
        onTime={(time) => update({ time })}
        sound={prefs.sound}
        onSound={(sound) => update({ sound })}
        onSelect={select}
        onSettings={(tab) => setSettings((tab as SettingsTab) ?? "link")}
        onDecide={decide}
        now={now}
      />

      <SessionDock
        sessions={sessions}
        projects={projects}
        world={world}
        characters={cast}
        assignments={assignments}
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
            character={pickCharacter(selected, world, cast, assignments)}
            cast={cast}
            chosenCharacterId={assignments?.[selected.projectId] ?? null}
            onChooseCharacter={(characterId) => assignCharacter.mutate({ projectId: selected.projectId, characterId })}
            chat={chat && chat.sessionId === selected.id ? chat.items : null}
            now={now}
            onClose={close}
            onFocus={() => worldRef.current?.focus(selected.id)}
            onSetupAlerts={() => setSettings("alerts")}
            onSetupLink={() => setSettings("link")}
            demo={mode === "demo"}
            command={command}
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
            linkedCount={sessions.filter((s) => s.link?.connected).length}
            sessionCount={sessions.length}
          />
        )}
      </AnimatePresence>
      {skillsOpen && <SkillsManager onClose={() => setSkillsOpen(false)} projects={trackedProjects ?? []} />}

      <Toaster position="bottom-center" theme="dark" toastOptions={{ className: "!bg-[#13221e]/95 !text-cream !border-white/10 !backdrop-blur-xl" }} />
    </div>
  );
}
