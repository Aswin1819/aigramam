/**
 * The Office world view: the village as an office floor (OfficeScene) with
 * the words over it. Each project is an office; each session is an employee
 * who walks to the area of what it is doing (desks, library, servers, web
 * window, lounge, front counter) by the same dwell rule as the village, so
 * movement always means a change of activity. Name tags (buttons) and office
 * cards are HTML, placed from the scene's projections each frame and never
 * on top of each other.
 */
import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import type { ProjectView, SessionView } from "@shared/model";
import { StationKeeper, wantedStation, type Station } from "@shared/stations";
import { projectSummaries } from "@/app/workspace/attention";
import { plainStatus, type Tone } from "@/app/workspace/focus";
import type { WorldHandle } from "../WorldView";
import { officeLayout, runningHelpers, spotFor } from "./officeLayout";
import { OfficeScene, type FrameAnchors, type Person } from "./OfficeScene";

interface Props {
  sessions: SessionView[];
  projects: ProjectView[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  reducedMotion: boolean;
  /** Chosen hour (0–24), or null to follow the clock. */
  hourOverride: number | null;
  onSelectProject?: (projectId: string) => void;
  selectedProjectId?: string | null;
  now: number;
}

const TONE_DOT: Record<Tone, string> = { urgent: "bg-urgent", turn: "bg-wait", work: "bg-work", quiet: "bg-[#a3a098]", error: "bg-[#ff8a80]", rest: "bg-[#6f6c66]" };
/** Words for the area an employee is in, shown on its tag when zoomed in. */
const AREA_WORD: Record<Station, string> = { desk: "at desk", study: "in the library", works: "at the servers", gate: "on the web", porch: "at the front counter", bench: "in the lounge" };
const TAG_MIN_PPU = 6;
/** The app's top bar covers this much of the view. */
const TOP_SPACE = 70;

type Rect = { x0: number; y0: number; x1: number; y1: number };
const overlapArea = (a: Rect, b: Rect) => Math.max(0, Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0)) * Math.max(0, Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0));

const OfficeWorldView = forwardRef<WorldHandle, Props>(function OfficeWorldView(p, ref) {
  const frameRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<OfficeScene | null>(null);
  const keeper = useRef(new StationKeeper());
  const cards = useRef(new Map<string, HTMLDivElement>());
  const tags = useRef(new Map<string, HTMLButtonElement>());
  const drag = useRef<{ id: number; x: number; y: number; moved: boolean } | null>(null);
  const [failed, setFailed] = useState(false);
  const [hover, setHover] = useState(false);

  const summaries = useMemo(() => projectSummaries(p.projects, p.sessions), [p.projects, p.sessions]);
  const layout = useMemo(() => officeLayout(summaries.map((s) => ({ project: s.project, sessions: s.sessions }))), [summaries]);

  // Where everyone is: the station each session settled on (dwell rule), then a spot in that area of its room.
  const people = useMemo(() => {
    const list: Person[] = [];
    const byId = new Map(p.sessions.map((s) => [s.id, s]));
    for (const room of layout.rooms) {
      const count = new Map<Station, number>();
      for (const desk of room.desks) {
        const s = byId.get(desk.sessionId);
        if (!s) continue;
        const station = keeper.current.stationOf(s.id, wantedStation(s), p.now);
        const n = count.get(station) ?? 0;
        count.set(station, n + 1);
        const spot = spotFor(room, s.id, station, n);
        const tone = plainStatus(s, p.now).tone;
        list.push({
          id: s.id,
          sessionId: s.id,
          roomId: room.project.id,
          x: spot.x,
          z: spot.z,
          station,
          tone,
          thinking: s.status === "working" && (!s.action || s.action.kind === "think"),
          helper: false,
          title: s.title,
          action: s.action?.label ?? "",
        });
        // Helpers (running subagents) stand beside their lead's desk.
        runningHelpers(s).forEach((a, i) => {
          list.push({
            id: `${s.id}:${a.id}`,
            sessionId: s.id,
            roomId: room.project.id,
            x: desk.x + 3.4 + (i % 2) * 1.5,
            z: desk.z + 0.6 + Math.floor(i / 2) * 1.5,
            station: "desk",
            tone: a.status === "waiting" ? "turn" : "work",
            thinking: !a.action || a.action.kind === "think",
            helper: true,
            title: a.agentType,
            action: a.action?.label ?? a.description,
          });
        });
      }
    }
    keeper.current.prune(new Set(p.sessions.map((s) => s.id)));
    return list;
  }, [layout, p.sessions, p.now]);
  const peopleRef = useRef(people);
  peopleRef.current = people;

  // Lighting follows the chosen time or the clock, in quarter-hour steps.
  const quarter = Math.floor((p.hourOverride ?? new Date(p.now).getHours() + new Date(p.now).getMinutes() / 60) * 4) / 4;
  const quarterRef = useRef(quarter);
  quarterRef.current = quarter;
  useEffect(() => sceneRef.current?.setHour(quarter), [quarter]);

  useImperativeHandle(ref, () => ({
    focus: (id: string) => sceneRef.current?.focusPerson(id),
    resetView: () => sceneRef.current?.fit(true),
  }));

  useEffect(() => {
    const canvas = canvasRef.current;
    const el = frameRef.current;
    if (!canvas || !el) return;
    let scene: OfficeScene;
    try {
      scene = new OfficeScene(canvas, { reducedMotion: p.reducedMotion, onFrame: placeOverlay });
    } catch (e) {
      console.warn("[Ai Gramam] the Office world needs WebGL", e);
      setFailed(true);
      return;
    }
    sceneRef.current = scene;
    const ro = new ResizeObserver(([entry]) => entry && scene.resize(entry.contentRect.width, entry.contentRect.height));
    ro.observe(el);
    scene.resize(el.clientWidth, el.clientHeight);
    scene.setLayout(layout);
    scene.setPeople(peopleRef.current);
    scene.setHour(quarterRef.current);
    scene.start();
    const onWheel = (e: WheelEvent) => {
      if ((e.target as HTMLElement).closest("[data-no-pan]")) return;
      e.preventDefault();
      scene.zoomBy(e.deltaY < 0 ? 1.12 : 1 / 1.12);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      el.removeEventListener("wheel", onWheel);
      ro.disconnect();
      scene.dispose();
      sceneRef.current = null;
    };
    // Created once; later changes reach the scene through the effects below.
  }, []);

  useEffect(() => sceneRef.current?.setLayout(layout), [layout]);
  useEffect(() => sceneRef.current?.setPeople(people), [people]);
  useEffect(() => sceneRef.current?.setReducedMotion(p.reducedMotion), [p.reducedMotion]);

  /** Cards beside their office where they cover least; tags over heads, never on cards or each other. */
  function placeOverlay(a: FrameAnchors) {
    const el = frameRef.current;
    if (!el) return;
    const W = el.clientWidth;
    const H = el.clientHeight;
    const placed: Rect[] = [{ x0: -1e4, y0: -1e4, x1: 1e4, y1: TOP_SPACE }];
    const roomRects = [...a.rooms.values()].map(({ rect }) => rect);
    for (const [id, anchor] of [...a.rooms.entries()].sort((x, y) => x[1].rect.y0 - y[1].rect.y0)) {
      const card = cards.current.get(id);
      if (!card) continue;
      const w = card.offsetWidth;
      const h = card.offsetHeight;
      const r = anchor.rect;
      const cx = (r.x0 + r.x1) / 2;
      const cy = (r.y0 + r.y1) / 2;
      const candidates: Rect[] = [
        { x0: cx - w / 2, y0: r.y0 - h - 6, x1: cx + w / 2, y1: r.y0 - 6 },
        { x0: r.x0 - w - 6, y0: cy - h / 2, x1: r.x0 - 6, y1: cy + h / 2 },
        { x0: r.x1 + 6, y0: cy - h / 2, x1: r.x1 + 6 + w, y1: cy + h / 2 },
        { x0: cx - w / 2, y0: r.y1 + 6, x1: cx + w / 2, y1: r.y1 + 6 + h },
      ];
      const off = (c: Rect) => (c.x1 - c.x0) * (c.y1 - c.y0) - overlapArea(c, { x0: 0, y0: 0, x1: W, y1: H });
      const cost = (c: Rect) => placed.reduce((s, q) => s + overlapArea(c, q), 0) + roomRects.reduce((s, q) => s + overlapArea(c, q), 0) * 1.2 + off(c) * 3;
      const best = candidates.reduce((b, c) => (cost(c) < cost(b) - 1 ? c : b));
      card.style.transform = `translate(${Math.round(best.x0)}px, ${Math.round(best.y0)}px)`;
      card.style.visibility = anchor.card.visible ? "visible" : "hidden";
      placed.push(best);
    }
    const show = a.ppu >= TAG_MIN_PPU;
    const rank: Tone[] = ["urgent", "turn", "error", "work", "quiet", "rest"];
    const order = [...peopleRef.current].sort((x, y) => Number(x.helper) - Number(y.helper) || rank.indexOf(x.tone) - rank.indexOf(y.tone));
    for (const person of order) {
      const tag = tags.current.get(person.id);
      const anchor = a.people.get(person.id);
      if (!tag || !anchor) continue;
      const w = tag.offsetWidth;
      const h = tag.offsetHeight;
      const r = { x0: anchor.x - w / 2, y0: anchor.y - h, x1: anchor.x + w / 2, y1: anchor.y };
      // Tags of people who need you always show (they matter most); others only when legible and free.
      const free = !placed.some((q) => overlapArea(r, q) > 0);
      const visible = anchor.visible && (person.tone === "urgent" || (show && free));
      tag.style.transform = `translate(${Math.round(r.x0)}px, ${Math.round(r.y0)}px)`;
      tag.style.visibility = visible ? "visible" : "hidden";
      if (visible) placed.push(r);
    }
  }

  const onPointerDown = (e: ReactPointerEvent) => {
    if (e.button !== 0 || (e.target as HTMLElement).closest("[data-no-pan]")) return;
    drag.current = { id: e.pointerId, x: e.clientX, y: e.clientY, moved: false };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: ReactPointerEvent) => {
    const scene = sceneRef.current;
    if (!scene) return;
    const d = drag.current;
    if (d && d.id === e.pointerId) {
      const dx = e.clientX - d.x;
      const dy = e.clientY - d.y;
      if (d.moved || Math.hypot(dx, dy) > 4) {
        d.moved = true;
        scene.panBy(dx, dy);
        d.x = e.clientX;
        d.y = e.clientY;
      }
      return;
    }
    const r = canvasRef.current!.getBoundingClientRect();
    const hit = scene.pick(e.clientX - r.left, e.clientY - r.top);
    setHover(!!(hit.sessionId || hit.projectId));
  };
  const onPointerUp = (e: ReactPointerEvent) => {
    const d = drag.current;
    drag.current = null;
    if (!d || d.id !== e.pointerId || d.moved || !sceneRef.current) return;
    const r = canvasRef.current!.getBoundingClientRect();
    const hit = sceneRef.current.pick(e.clientX - r.left, e.clientY - r.top);
    if (hit.sessionId) p.onSelect(hit.sessionId);
    else if (hit.projectId) {
      sceneRef.current.focusRoom(hit.projectId);
      p.onSelectProject?.(hit.projectId);
    }
  };

  if (failed)
    return (
      <div className="absolute inset-0 grid place-items-center bg-ink text-center text-[14px] text-cream/80">
        <p className="max-w-md">The Office world needs WebGL, which this browser has turned off. Pick another art style from the top bar.</p>
      </div>
    );

  const byRoom = new Map(summaries.map((s) => [s.project.id, s]));
  return (
    <div
      ref={frameRef}
      className={`map-frame absolute inset-0 touch-none select-none overflow-hidden ${hover ? "cursor-pointer" : "cursor-grab active:cursor-grabbing"}`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={() => (drag.current = null)}
    >
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" role="img" aria-label="The office: each project is an office room, each session an employee at work" />

      <div className="pointer-events-none absolute left-0 top-0">
        {people.map((person) => {
          const s = p.sessions.find((x) => x.id === person.sessionId);
          const status = s && !person.helper ? plainStatus(s, p.now).headline : person.tone === "turn" ? "Waiting" : "Helping";
          return (
            <button
              key={person.id}
              ref={(el) => void (el ? tags.current.set(person.id, el) : tags.current.delete(person.id))}
              onClick={() => p.onSelect(person.sessionId)}
              data-no-pan
              className={`pointer-events-auto absolute left-0 top-0 flex max-w-[230px] items-center gap-1.5 whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-semibold shadow ${person.sessionId === p.selectedId ? "border-brass bg-[#2a2212]/95 text-cream" : person.tone === "urgent" ? "border-urgent/70 bg-[#2a1416]/95 text-cream" : "border-white/10 bg-[#16171b]/92 text-[#eceae3]"} ${person.helper ? "opacity-90" : ""}`}
              style={{ visibility: "hidden" }}
              title={`${person.title}: ${status}${person.action ? ` · ${person.action}` : ""}`}
              aria-label={`${person.helper ? "Helper " : ""}${person.title}: ${status}, ${AREA_WORD[person.station]}. Open details`}
            >
              <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${TONE_DOT[person.tone]}`} aria-hidden />
              <span className="truncate uppercase tracking-[0.08em]">{person.title}</span>
              {!person.helper && <span className="truncate font-normal text-cream/70">· {status}</span>}
            </button>
          );
        })}
      </div>

      <div className="pointer-events-none absolute left-0 top-0">
        {layout.rooms.map((room) => {
          const sum = byRoom.get(room.project.id);
          if (!sum) return null;
          const tones = sum.sessions.map((s) => plainStatus(s, p.now).tone);
          const n = (t: Tone) => tones.filter((x) => x === t).length;
          return (
            <div
              key={room.project.id}
              ref={(el) => void (el ? cards.current.set(room.project.id, el) : cards.current.delete(room.project.id))}
              className="map-panel pointer-events-auto absolute left-0 top-0 w-[184px] rounded-2xl px-3 py-2 text-cream"
              style={{ visibility: "hidden", boxShadow: p.selectedProjectId === room.project.id ? `0 0 0 1.5px ${room.accent}, 0 0 36px ${room.accent}55` : undefined }}
              data-no-pan
            >
              <button onClick={() => { sceneRef.current?.focusRoom(room.project.id); p.onSelectProject?.(room.project.id); }} className="flex w-full items-center gap-1.5 text-left" title={`${room.project.root}\nFly to this office and open the project`}>
                <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: room.accent }} aria-hidden />
                <span className="map-label min-w-0 flex-1 truncate text-cream">{room.project.name}</span>
                {n("urgent") > 0 && <span className="h-2 w-2 shrink-0 rounded-full bg-urgent" aria-hidden />}
              </button>
              <div className="mt-0.5 flex items-baseline gap-1.5">
                <span className="font-serif text-[26px] leading-none">{sum.sessions.length}</span>
                <span className="map-label">{sum.sessions.length === 1 ? "employee" : "employees"}</span>
                {sum.subagents > 0 && <span className="map-label ml-auto">+{sum.subagents} helping</span>}
              </div>
              <div className="map-label mt-1 flex justify-between whitespace-nowrap">
                <span className={n("work") ? "text-work" : ""}>Work {n("work")}</span>
                <span className={n("turn") ? "text-wait" : ""}>Turn {n("turn")}</span>
                <span>Rest {n("rest") + n("quiet")}</span>
              </div>
              {n("urgent") > 0 && <div className="map-label mt-1 text-urgent">{n("urgent") === 1 ? "1 needs you" : `${n("urgent")} need you`}</div>}
              {room.hidden > 0 && <div className="mt-0.5 text-[11px] text-[var(--map-grey)]">{room.hidden} more not drawn</div>}
            </div>
          );
        })}
      </div>

      {layout.more > 0 && (
        <p className="map-panel absolute bottom-16 left-3 rounded-xl px-3 py-1.5 text-[12.5px] text-cream/80">
          {layout.more === 1 ? "1 more project" : `${layout.more} more projects`} not shown: see the session list
        </p>
      )}
    </div>
  );
});

export default OfficeWorldView;
