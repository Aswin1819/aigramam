import type { SessionView } from "@shared/model";
import type { TerminalStart } from "@shared/terminal";
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
import { useTerminals } from "@/hooks/useTerminals";
import { terminalBlockedReason } from "@/app/terminal/terminalState";
import { isUrgent, statusText } from "@/lib/status";
import { trpc } from "@/lib/trpc";
import { playChime } from "@/lib/chime";
import { desktopNotify } from "@/lib/desktopNotify";
import TopBar from "@/app/TopBar";
import SessionDock from "@/app/SessionDock";
import NoticeBoard from "@/app/NoticeBoard";
import VillageLegend from "@/app/VillageLegend";
import DetailDrawer from "@/app/DetailDrawer";
import SettingsSheet, { type SettingsTab } from "@/app/SettingsSheet";
import BrandMark from "@/app/BrandMark";
import Workspace from "@/app/workspace/Workspace";
import ProjectDrawer from "@/app/ProjectDrawer";
import { projectSummaries } from "@/app/workspace/attention";
import { useDisplayPrefs } from "@/app/useDisplayPrefs";

export default function Home() {
  const { snapshot, worlds, characters, mode, connected, now, startDemo, startLive, command, chat, openChat, onTerminal, sendTerminal } = useLiveSessions();
  const terminals = useTerminals({ onTerminal, sendTerminal });
  const { active: world, choose: chooseWorld, fellBack } = useWorldChoice(worlds);
  const { prefs, update, hourOverride } = useDisplayPrefs();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // The session open on Workspace → Focus (its conversation shows in the page, not the drawer).
  const [focusId, setFocusId] = useState<string | null>(null);
  // The project open on Workspace → Projects, and (in the village) whether its drawer is showing.
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [projectDrawer, setProjectDrawer] = useState(false);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [settings, setSettings] = useState<SettingsTab | null>(null);
  const [skillsOpen, setSkillsOpen] = useState(false);
  const [legendOpen, setLegendOpen] = useState(false);
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
  const onFocusPage = prefs.view === "workspace" && prefs.workspacePage === "overview";
  // Follow the drawer's session's conversation, or the Focus page's.
  const chatId = selected ? selected.id : onFocusPage ? focusId : null;
  useEffect(() => openChat(chatId), [chatId, openChat]);

  const select = useCallback(
    (id: string) => {
      // On Workspace → Focus, picking a session (top bar, toast, notification) focuses it in the page.
      if (onFocusPage) {
        setSelectedId(null);
        setFocusId(id);
        return;
      }
      setSelectedId((cur) => (cur === id ? null : id));
      worldRef.current?.focus(id);
    },
    [onFocusPage],
  );
  const close = useCallback(() => {
    setSelectedId(null);
    setProjectDrawer(false);
    worldRef.current?.resetView();
  }, []);
  /** A building clicked in the village: show its project. */
  const openProject = useCallback((projectId: string) => {
    setSelectedId(null);
    setSelectedProjectId(projectId);
    setProjectDrawer(true);
  }, []);
  const projectSummary = useMemo(
    () => (selectedProjectId ? projectSummaries(projects, sessions).find((x) => x.project.id === selectedProjectId) ?? null : null),
    [selectedProjectId, projects, sessions],
  );

  /** "Open terminal here" / "Start Claude here": start PowerShell (optionally running Claude Code) in the project's folder and show it in Workspace → Terminals. */
  const createTerminal = terminals.create;
  const openTerminal = useCallback(
    (projectId: string, start?: TerminalStart) => {
      setProjectDrawer(false);
      update({ view: "workspace", workspacePage: "terminals" });
      void createTerminal(projectId, start);
    },
    [update, createTerminal],
  );
  /** A session's "Running in an Ai Gramam terminal — Open": show that terminal. */
  const setActiveTerminal = terminals.setActiveId;
  const showTerminal = useCallback(
    (terminalId: string) => {
      setSelectedId(null);
      setProjectDrawer(false);
      setActiveTerminal(terminalId);
      update({ view: "workspace", workspacePage: "terminals" });
    },
    [update, setActiveTerminal],
  );

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

  // A toast (and a sound, and optionally a desktop notification) the moment a session newly needs you.
  const seenUrgent = useRef<Set<string> | null>(null);
  const seenTurns = useRef<Set<string> | null>(null);
  const seenErrors = useRef<Set<string> | null>(null);
  const shownApprovals = useRef(new Set<string>());
  useEffect(() => {
    const urgentNow = new Set(sessions.filter(isUrgent).map((s) => `${s.id}:${s.statusSince}`));
    const turnsNow = new Set(sessions.filter((s) => s.status === "waiting" && s.waitingReason === "turn_end").map((s) => `${s.id}:${s.statusSince}`));
    const errorsNow = new Set(sessions.filter((s) => s.status === "error").map((s) => `${s.id}:${s.statusSince}`));
    const notify = (s: (typeof sessions)[number], body: string) => prefs.desktopNotify && desktopNotify(s.title, body, `ai-gramam:${s.id}`, () => select(s.id));
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
        notify(s, approval?.questions ? `Asks: ${approval.label}` : `${statusText(s)}${s.action ? ` · ${s.action.label}` : ""}`);
      }
      const turnNew = !!seenTurns.current && [...turnsNow].some((k) => !seenTurns.current!.has(k));
      if (seenTurns.current) for (const s of sessions) if (turnsNow.has(`${s.id}:${s.statusSince}`) && !seenTurns.current.has(`${s.id}:${s.statusSince}`)) notify(s, "Finished its turn: your turn");
      if (seenErrors.current) for (const s of sessions) if (errorsNow.has(`${s.id}:${s.statusSince}`) && !seenErrors.current.has(`${s.id}:${s.statusSince}`)) notify(s, "Stopped with an error");
      if (prefs.sound && urgentNew) playChime("urgent");
      else if (prefs.sound && turnNew) playChime("soft");
    }
    seenTurns.current = turnsNow;
    seenErrors.current = errorsNow;
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
  }, [sessions, mode, select, decide, prefs.sound, prefs.desktopNotify]);

  const worldKey = world ? `${world.id}@${world.version}|${cast.map((c) => c.version).join(",")}|${assignmentsKey(assignments)}` : "none";
  const brokenPacks = (worlds?.errors.length ?? 0) + (characters?.errors.length ?? 0);
  const emptyHint = mode === "demo" ? "Loading the demo village…" : !connected ? "Can't reach the Ai Gramam server, reconnecting…\nSessions can't be shown until it's back; this doesn't mean none are running." : "No Claude Code sessions are running.\nStart Claude Code in any folder and a villager walks in within seconds.";

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-ink text-cream">
      {/* Workspace: Focus, Projects, Agents, Terminals, History. World: the village. */}
      {prefs.view === "workspace" ? (
        <Workspace
          page={prefs.workspacePage}
          onPage={(workspacePage) => update({ workspacePage })}
          sessions={sessions}
          projects={projects}
          now={now}
          mode={mode}
          connected={connected}
          hooksInstalled={hooks.installed}
          selectedSessionId={selectedId}
          onSelectSession={select}
          selectedProjectId={selectedProjectId}
          onSelectProject={setSelectedProjectId}
          onDecide={decide}
          onSettings={(tab) => setSettings((tab as SettingsTab) ?? "link")}
          terminals={terminals}
          onOpenTerminal={openTerminal}
          cast={{ world, cast, assignments }}
          chat={chat}
          command={command}
          focusId={focusId}
          onFocus={setFocusId}
          onOpenDetails={setSelectedId}
        />
      ) : styled ? (
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
          onSelectProject={openProject}
          selectedProjectId={projectDrawer ? selectedProjectId : null}
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
          onSelectProject={openProject}
          selectedProjectId={projectDrawer ? selectedProjectId : null}
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
        view={prefs.view}
        onView={(view) => update({ view })}
        onSelect={select}
        onSettings={(tab) => setSettings((tab as SettingsTab) ?? "link")}
        onDecide={decide}
        now={now}
      />

      {prefs.view === "world" && (
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
      )}

      {prefs.view === "world" && !selected && !projectDrawer && sessions.length > 0 && (
        <NoticeBoard
          sessions={sessions}
          projects={projects}
          now={now}
          open={prefs.boardOpen}
          onToggle={() => update({ boardOpen: !prefs.boardOpen })}
          onSelect={select}
          onHover={setHoveredId}
          onLegend={() => setLegendOpen(true)}
        />
      )}

      <AnimatePresence>
        {prefs.view === "world" && world && sessions.length > 0 && !selected && !projectDrawer && (legendOpen || !prefs.legendSeen) && (
          <VillageLegend
            key="legend"
            world={world}
            onClose={() => {
              setLegendOpen(false);
              if (!prefs.legendSeen) update({ legendSeen: true });
            }}
          />
        )}
      </AnimatePresence>

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
            onOpenTerminal={showTerminal}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {!selected && projectDrawer && prefs.view === "world" && (
          <ProjectDrawer
            key="project-drawer"
            summary={projectSummary}
            now={now}
            selectedSessionId={selectedId}
            onSelectSession={select}
            onOpenInWorkspace={() => {
              setProjectDrawer(false);
              update({ view: "workspace", workspacePage: "projects" });
            }}
            onOpenTerminal={openTerminal}
            terminalBlockedReason={terminalBlockedReason(mode, connected, mode === "demo" ? 0 : terminals.terminals.length)}
            onClose={() => setProjectDrawer(false)}
          />
        )}
      </AnimatePresence>

      {/* Empty state */}
      <AnimatePresence>
        {prefs.view === "world" && sessions.length === 0 && mode === "live" && world && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="glass pointer-events-auto absolute bottom-6 left-1/2 z-20 w-[min(440px,90vw)] -translate-x-1/2 rounded-2xl p-4 text-center"
          >
            <div className="font-display text-base font-semibold">{connected ? "The village is quiet" : "Can't reach the Ai Gramam server"}</div>
            <p className="mt-1 text-sm text-cream/65">{connected ? "Start Claude Code in any folder and a villager walks in within a few seconds." : "Reconnecting… Villagers can't be shown until it's back; this doesn't mean no sessions are running."}</p>
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
            desktopNotify={prefs.desktopNotify}
            onDesktopNotify={(desktopNotify) => update({ desktopNotify })}
            time={prefs.time}
            onTime={(time) => update({ time })}
            onOpenSkills={() => { setSettings(null); setSkillsOpen(true); }}
            connected={mode === "live" ? connected : true}
          />
        )}
      </AnimatePresence>
      {skillsOpen && <SkillsManager onClose={() => setSkillsOpen(false)} projects={trackedProjects ?? []} />}

      <Toaster position="bottom-center" theme="dark" toastOptions={{ className: "!bg-[#13221e]/95 !text-cream !border-white/10 !backdrop-blur-xl" }} />
    </div>
  );
}
