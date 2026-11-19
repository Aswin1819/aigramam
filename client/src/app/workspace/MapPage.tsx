/**
 * Workspace → Map: the whole village at a glance. Each project is a raised
 * yard around the village square, its villagers sit at their desks, and a
 * card beside each yard gives its figures in words. The board on the right
 * lists every session by what it needs. Clicking a villager or a board row
 * opens it in Focus; clicking a card's name opens the project.
 * Layout is in villageMap.ts (pure, tested); this file only draws it.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { ChevronRight, GitBranch, LocateFixed, Minus, PanelRightClose, PanelRightOpen, Plus } from "lucide-react";
import type { ProjectView, SessionView } from "@shared/model";
import Avatar from "@/components/Avatar";
import { clockTime, elapsed } from "@/lib/status";
import { projectSummaries } from "./attention";
import { plainStatus, type Tone } from "./focus";
import { TONE_BG, TONE_TEXT, characterOf, type Cast } from "./VillageStrip";
import { BOARD_FILTERS, CARD, HUB, MAP_H, MAP_W, boardCounts, boardList, layoutMap, pathTo, tileFaces, type BoardFilter, type Box, type Yard } from "./villageMap";

interface Props {
  sessions: SessionView[];
  projects: ProjectView[];
  now: number;
  cast: Cast;
  demo: boolean;
  reducedMotion: boolean;
  /** Text for an empty village (why there's nothing, and what to do). */
  emptyText: string;
  onFocus: (sessionId: string) => void;
  onOpenProject: (projectId: string) => void;
}

const ZOOM_MIN = 0.6;
const ZOOM_MAX = 2.5;
const PANEL_W = 340;
/** Room kept free at the top for the map's header strip. */
const HEADER_H = 56;

const ANIM: Record<Tone, "idle" | "wait" | "error" | "read"> = { urgent: "wait", turn: "wait", error: "error", work: "read", quiet: "idle", rest: "idle" };
const PATH_STROKE: Record<Yard["path"], string> = { urgent: "var(--color-urgent)", work: "var(--color-work)", quiet: "rgba(255,248,231,0.22)" };

export default function MapPage(p: Props) {
  const summaries = useMemo(() => projectSummaries(p.projects, p.sessions), [p.projects, p.sessions]);
  const layout = useMemo(() => layoutMap(summaries, p.now), [summaries, p.now]);
  const [filter, setFilter] = useState<BoardFilter>("all");
  const [panelOpen, setPanelOpen] = useState(() => typeof window === "undefined" || window.innerWidth >= 1100);
  const view = useMapView(layout.bounds, panelOpen ? PANEL_W + 24 : 0);
  const flow = !p.reducedMotion;
  const total = p.sessions.length;

  return (
    <div
      ref={view.frameRef}
      className="map-frame relative h-[calc(100vh-150px)] min-h-[460px] touch-none select-none overflow-hidden rounded-2xl border border-[var(--map-line)]"
      onPointerDown={view.onPointerDown}
      onPointerMove={view.onPointerMove}
      onPointerUp={view.onPointerUp}
      onPointerCancel={view.onPointerUp}
    >
      <div className="absolute left-0 top-0 origin-top-left" style={{ width: MAP_W, height: MAP_H, transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})` }}>
        <svg width={MAP_W} height={MAP_H} className="absolute inset-0" aria-hidden>
          <defs>
            <pattern id="map-grid" width="64" height="32" patternUnits="userSpaceOnUse">
              <path d="M0 16 L32 0 L64 16 L32 32 Z" fill="none" stroke="rgba(255,244,220,0.05)" strokeWidth="1" />
            </pattern>
            <radialGradient id="map-square" cx="50%" cy="40%" r="60%">
              <stop offset="0%" stopColor="#c99a4c" />
              <stop offset="100%" stopColor="#7a5a2c" />
            </radialGradient>
          </defs>
          <rect width={MAP_W} height={MAP_H} fill="url(#map-grid)" />
          {layout.yards.map((y) => (
            <path
              key={`path-${y.summary.project.id}`}
              d={pathTo(y)}
              fill="none"
              stroke={PATH_STROKE[y.path]}
              strokeWidth={y.path === "quiet" ? 2 : 2.5}
              strokeDasharray="7 7"
              strokeLinecap="round"
              className={flow && y.path !== "quiet" ? "map-flow" : undefined}
            />
          ))}
          <Square total={total} />
          {layout.yards.map((y) => (
            <Tile key={`tile-${y.summary.project.id}`} yard={y} />
          ))}
        </svg>

        <div className="absolute text-center" style={{ left: HUB.x - 110, top: HUB.y + HUB.r * 0.5 + 18, width: 220 }}>
          <div className="font-display text-[17px] font-bold text-cream">
            Ai <span className="text-brass">Gramam</span>
          </div>
          <div className="text-[13px] text-cream/70">
            {total === 1 ? "1 villager" : `${total} villagers`} · {summaries.length === 1 ? "1 project" : `${summaries.length} projects`}
          </div>
        </div>

        {layout.yards.map((y) =>
          y.desks.map((d) => (
            <Villager key={d.session.id} cast={p.cast} s={d.session} tone={d.tone} now={p.now} x={d.x} y={d.y} flow={flow} onOpen={() => p.onFocus(d.session.id)} />
          )),
        )}
        {layout.yards.map((y) => (
          <YardCard key={`card-${y.summary.project.id}`} yard={y} now={p.now} onOpenProject={p.onOpenProject} onFocus={p.onFocus} />
        ))}
      </div>

      <MapHeader total={total} projects={summaries.length} demo={p.demo} now={p.now} />

      {total === 0 && (
        <p className="absolute left-1/2 top-[18%] max-w-md -translate-x-1/2 rounded-xl bg-black/55 px-4 py-2.5 text-center text-[13.5px] text-cream/90" style={{ marginLeft: panelOpen ? -(PANEL_W + 24) / 2 : 0 }}>
          {p.emptyText}
        </p>
      )}
      {layout.more > 0 && (
        <p className="absolute bottom-3 left-3 rounded-lg bg-black/55 px-2.5 py-1 text-[12.5px] text-cream/80">
          {layout.more === 1 ? "1 more project" : `${layout.more} more projects`} not on the map: see the board or the Projects page
        </p>
      )}

      <div className="absolute bottom-3 flex flex-col gap-1.5" style={{ right: panelOpen ? PANEL_W + 24 : 12 }} data-no-pan>
        <MapButton label="Zoom in" onClick={() => view.zoomBy(1.2)}><Plus size={16} /></MapButton>
        <MapButton label="Zoom out" onClick={() => view.zoomBy(1 / 1.2)}><Minus size={16} /></MapButton>
        <MapButton label="Fit the village" onClick={view.reset}><LocateFixed size={16} /></MapButton>
      </div>

      <Board
        open={panelOpen}
        onToggle={() => setPanelOpen((o) => !o)}
        sessions={p.sessions}
        projects={p.projects}
        now={p.now}
        demo={p.demo}
        filter={filter}
        onFilter={setFilter}
        onFocus={p.onFocus}
      />
    </div>
  );
}

/** Largest fit scale, so a village of one or two yards isn't blown up. */
const FIT_MAX = 1.35;

/** Fits what is drawn into the frame, with zoom (buttons or the wheel) and drag to pan. */
function useMapView(bounds: Box, reserveRight: number) {
  const frameRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const drag = useRef<{ id: number; x: number; y: number; px: number; py: number } | null>(null);

  useEffect(() => {
    const el = frameRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => e && setSize({ w: e.contentRect.width, h: e.contentRect.height }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const usableW = Math.max(200, size.w - reserveRight);
  const usableH = Math.max(200, size.h - HEADER_H);
  const fit = size.w ? Math.min(usableW / bounds.w, usableH / bounds.h, FIT_MAX) : 1;
  const scale = fit * zoom;
  const x = (usableW - bounds.w * scale) / 2 - bounds.x * scale + pan.x;
  const y = HEADER_H + (usableH - bounds.h * scale) / 2 - bounds.y * scale + pan.y;

  const zoomBy = useCallback((k: number) => setZoom((z) => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z * k))), []);
  const reset = useCallback(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, []);

  // A non-passive listener, so the wheel zooms the map instead of scrolling the page.
  useEffect(() => {
    const el = frameRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if ((e.target as HTMLElement).closest("[data-no-pan]")) return;
      e.preventDefault();
      zoomBy(e.deltaY < 0 ? 1.1 : 1 / 1.1);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [zoomBy]);

  const onPointerDown = (e: ReactPointerEvent) => {
    if (e.button !== 0 || (e.target as HTMLElement).closest("button, a, input, [data-no-pan]")) return;
    drag.current = { id: e.pointerId, x: e.clientX, y: e.clientY, px: pan.x, py: pan.y };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: ReactPointerEvent) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    setPan({ x: d.px + e.clientX - d.x, y: d.py + e.clientY - d.y });
  };
  const onPointerUp = (e: ReactPointerEvent) => {
    if (drag.current?.id === e.pointerId) drag.current = null;
  };

  return { frameRef, scale, x, y, zoomBy, reset, onPointerDown, onPointerMove, onPointerUp };
}

/** The village square: a round stone platform with the banyan tree. */
function Square({ total }: { total: number }) {
  const { x, y, r } = HUB;
  return (
    <g>
      <ellipse cx={x} cy={y + 14} rx={r} ry={r * 0.5} fill="#3b2b16" />
      <ellipse cx={x} cy={y} rx={r} ry={r * 0.5} fill="url(#map-square)" stroke="#e3b04b" strokeOpacity={0.55} strokeWidth={2} />
      <ellipse cx={x} cy={y} rx={r * 0.62} ry={r * 0.31} fill="none" stroke="#fff8e7" strokeOpacity={0.18} strokeDasharray="4 6" />
      {/* Banyan: trunk, aerial roots and a wide canopy. */}
      <rect x={x - 7} y={y - 62} width={14} height={62} rx={4} fill="#5a3b1c" />
      {[-24, -14, 16, 26].map((dx) => (
        <line key={dx} x1={x + dx} y1={y - 50} x2={x + dx * 0.9} y2={y - 4} stroke="#6d4a24" strokeWidth={2} />
      ))}
      {[
        [-40, -70, 30],
        [0, -86, 36],
        [40, -70, 30],
        [-20, -60, 26],
        [22, -60, 26],
      ].map(([dx, dy, rr]) => (
        <circle key={`${dx}${dy}`} cx={x + dx!} cy={y + dy!} r={rr} fill={total ? "#2f7a4f" : "#2a5a44"} stroke="#1d4a37" strokeWidth={2} />
      ))}
    </g>
  );
}

/** A project's raised yard: top face in its colour, two darker sides, and a soft rim. */
function Tile({ yard }: { yard: Yard }) {
  // Muted like painted floor tiles: the project's colour mixed toward warm grey.
  const accent = `color-mix(in srgb, ${yard.accent} 58%, #8a8478)`;
  const f = tileFaces(yard);
  return (
    <g>
      <polygon points={f.left} fill={accent} />
      <polygon points={f.left} fill="#000" opacity={0.45} />
      <polygon points={f.right} fill={accent} />
      <polygon points={f.right} fill="#000" opacity={0.6} />
      <polygon points={f.top} fill={accent} />
      <polygon points={f.top} fill="#121211" opacity={0.28} />
      <polygon points={f.top} fill="none" stroke={yard.path === "urgent" ? "var(--color-urgent)" : accent} strokeOpacity={yard.path === "urgent" ? 0.9 : 0.75} strokeWidth={yard.path === "urgent" ? 3 : 2} />
      <Hut x={yard.x + yard.a * 0.34} y={yard.y - yard.a * 0.2} s={yard.a / 128} />
      <Palm x={yard.x - yard.a * 0.62} y={yard.y - yard.a * 0.04} s={yard.a / 128} />
    </g>
  );
}

/** A small thatched hut at the back of a yard (decoration only). */
function Hut({ x, y, s }: { x: number; y: number; s: number }) {
  const w = 26 * s;
  const h = 18 * s;
  return (
    <g>
      <polygon points={`${x - w},${y} ${x},${y + w / 2} ${x},${y + w / 2 - h} ${x - w},${y - h}`} fill="#e8d3a8" />
      <polygon points={`${x + w},${y} ${x},${y + w / 2} ${x},${y + w / 2 - h} ${x + w},${y - h}`} fill="#c4a874" />
      {/* Door on the front-left wall: along the wall's base from 40% to 62%, 60% of the wall's height. */}
      <polygon points={[0.4, 0.62, 0.62, 0.4].map((f, i) => `${x - w + w * f},${y + (w / 2) * f - (i < 2 ? 0 : h * 0.6)}`).join(" ")} fill="#5a3b1c" />
      <polygon points={`${x - w - 4 * s},${y - h + 2 * s} ${x},${y + w / 2 - h + 4 * s} ${x + w + 4 * s},${y - h + 2 * s} ${x},${y - h - 22 * s}`} fill="#8a5a2b" />
      <polygon points={`${x},${y + w / 2 - h + 4 * s} ${x + w + 4 * s},${y - h + 2 * s} ${x},${y - h - 22 * s}`} fill="#6d4420" />
    </g>
  );
}

/** A coconut palm at the side of a yard (decoration only). */
function Palm({ x, y, s }: { x: number; y: number; s: number }) {
  const top = y - 58 * s;
  return (
    <g>
      <path d={`M${x},${y} Q${x + 8 * s},${y - 30 * s} ${x + 3 * s},${top}`} stroke="#7a5a2c" strokeWidth={4 * s} fill="none" strokeLinecap="round" />
      {[-150, -110, -60, -20, 20].map((deg) => {
        const r = (deg * Math.PI) / 180;
        const ex = x + 3 * s + Math.cos(r) * 26 * s;
        const ey = top + Math.sin(r) * 14 * s + 10 * s;
        return <path key={deg} d={`M${x + 3 * s},${top} Q${(x + 3 * s + ex) / 2},${top - 10 * s} ${ex},${ey}`} stroke="#3f8f5a" strokeWidth={5 * s} fill="none" strokeLinecap="round" />;
      })}
    </g>
  );
}

/** A villager at a desk, with a lamp above in the colour of its state; the state is also in its name and on the board. */
function Villager({ cast, s, tone, now, x, y, flow, onOpen }: { cast: Cast; s: SessionView; tone: Tone; now: number; x: number; y: number; flow: boolean; onOpen: () => void }) {
  const status = plainStatus(s, now);
  const label = `${s.title}: ${status.headline}. ${status.detail}. Open in Focus`;
  return (
    <button
      onClick={onOpen}
      title={`${s.title}\n${status.headline} · ${status.detail}`}
      aria-label={label}
      className="group absolute flex flex-col items-center"
      style={{ left: x, top: y, transform: "translate(-50%, -100%)" }}
    >
      <span className={`mb-0.5 h-2.5 w-2.5 rounded-full ring-2 ring-black/40 ${TONE_BG[tone]} ${tone === "urgent" && flow ? "animate-pulse" : ""}`} aria-hidden />
      <span className="relative transition-transform group-hover:-translate-y-0.5">
        <Avatar character={characterOf(cast, s)} size={50} anim={ANIM[tone]} />
      </span>
      <Desk />
      {tone === "urgent" && <span className="mt-0.5 whitespace-nowrap rounded bg-urgent px-1 text-[11px] font-semibold leading-tight text-white">Needs you</span>}
      <span className="pointer-events-none absolute -bottom-6 left-1/2 hidden -translate-x-1/2 whitespace-nowrap rounded bg-black/75 px-1.5 py-0.5 text-[12px] text-cream group-hover:block group-focus-visible:block">
        {s.title}
      </span>
    </button>
  );
}

/** A small low desk drawn in front of the villager's legs. */
function Desk() {
  return (
    <svg width="46" height="22" viewBox="0 0 46 22" className="-mt-4" aria-hidden>
      <polygon points="23,2 44,10 23,18 2,10" fill="#c9a26a" />
      <polygon points="2,10 23,18 23,22 2,14" fill="#7a5a2c" />
      <polygon points="44,10 23,18 23,22 44,14" fill="#5e4420" />
      <rect x="17" y="7" width="12" height="5" rx="1" fill="#1d2b26" opacity={0.85} />
    </svg>
  );
}

/** The figures for one yard, in words: villagers, what needs the person, branches. */
function YardCard({ yard, now, onOpenProject, onFocus }: { yard: Yard; now: number; onOpenProject: (id: string) => void; onFocus: (id: string) => void }) {
  const { summary, counts } = yard;
  const accent = yard.accent;
  const firstUrgent = summary.sessions.filter((s) => plainStatus(s, now).tone === "urgent").sort((a, b) => a.statusSince - b.statusSince)[0];
  const resting = counts.rest + counts.quiet;
  return (
    <div
      className="map-panel absolute rounded-xl p-2.5 text-cream"
      style={{ left: yard.card.x, top: yard.card.y, width: CARD.w, minHeight: CARD.h }}
      data-no-pan
    >
      <button onClick={() => onOpenProject(summary.project.id)} title={`${summary.project.root}\nOpen on the Projects page`} className="flex w-full items-center gap-1.5 text-left hover:text-brass">
        <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: accent }} aria-hidden />
        <span className="map-caps min-w-0 flex-1 truncate text-[14px] font-semibold">{summary.project.name}</span>
        <ChevronRight size={14} className="shrink-0 text-cream/50" aria-hidden />
      </button>
      <div className="mt-1 flex items-baseline gap-1.5">
        <span className="font-serif text-[30px] leading-none">{summary.sessions.length}</span>
        <span className="map-caps text-[12.5px] text-cream/70">{summary.sessions.length === 1 ? "villager" : "villagers"}</span>
        {summary.subagents > 0 && <span className="ml-auto text-[12px] text-cream/70">+{summary.subagents} helping</span>}
      </div>
      <div className="mt-1.5 flex flex-wrap gap-x-2.5 gap-y-0.5 text-[12px]">
        <span className={counts.work ? TONE_TEXT.work : "text-cream/55"}>{counts.work} working</span>
        <span className={counts.turn ? TONE_TEXT.turn : "text-cream/55"}>{counts.turn} your turn</span>
        <span className="text-cream/55">{resting} resting</span>
        {counts.error > 0 && <span className={TONE_TEXT.error}>{counts.error} stopped</span>}
      </div>
      {summary.branches.length > 0 && (
        <div className="mt-1 flex min-w-0 items-center gap-1 text-[12px] text-cream/60" title={summary.branches.join(", ")}>
          <GitBranch size={12} className="shrink-0" aria-hidden />
          <span className="truncate">{summary.branches.join(", ")}</span>
        </div>
      )}
      {yard.hidden > 0 && <div className="mt-0.5 text-[12px] text-cream/55">{yard.hidden} more not drawn</div>}
      {firstUrgent && (
        <button onClick={() => onFocus(firstUrgent.id)} className="mt-1.5 flex w-full items-center justify-between rounded-lg bg-urgent/20 px-2 py-1 text-[12px] font-semibold text-urgent ring-1 ring-urgent/40 hover:bg-urgent/30">
          <span>{counts.urgent === 1 ? "1 needs you" : `${counts.urgent} need you`}</span>
          <span className="text-cream/80">Open ›</span>
        </button>
      )}
    </div>
  );
}

function Board(p: {
  open: boolean;
  onToggle: () => void;
  sessions: SessionView[];
  projects: ProjectView[];
  now: number;
  demo: boolean;
  filter: BoardFilter;
  onFilter: (f: BoardFilter) => void;
  onFocus: (id: string) => void;
}) {
  const counts = useMemo(() => boardCounts(p.sessions, p.now), [p.sessions, p.now]);
  const list = useMemo(() => boardList(p.sessions, p.filter, p.now), [p.sessions, p.filter, p.now]);
  const names = useMemo(() => new Map(p.projects.map((x) => [x.id, x.name])), [p.projects]);
  if (!p.open)
    return (
      <div className="absolute right-3 top-3" data-no-pan>
        <MapButton label="Show session status" onClick={p.onToggle}><PanelRightOpen size={16} /></MapButton>
      </div>
    );
  return (
    <aside className="map-panel absolute bottom-3 right-3 top-3 flex flex-col rounded-2xl" style={{ width: PANEL_W }} aria-label="Session status" data-no-pan>
      <header className="flex items-center gap-2 border-b border-[var(--map-line)] px-3.5 py-2.5">
        <h2 className="map-caps text-[15px] font-semibold text-cream">Session status</h2>
        <span className="map-caps text-[12.5px] text-cream/60">{p.demo ? "demo village" : "whole village"}</span>
        <button onClick={p.onToggle} aria-label="Hide session status" title="Hide session status" className="ml-auto rounded-lg p-1.5 text-cream/70 hover:bg-white/10 hover:text-cream">
          <PanelRightClose size={16} />
        </button>
      </header>
      <div className="flex flex-wrap gap-1.5 px-3 pt-2.5" role="group" aria-label="Show sessions">
        {BOARD_FILTERS.map((f) => (
          <button
            key={f.id}
            onClick={() => p.onFilter(f.id)}
            aria-pressed={p.filter === f.id}
            className={`rounded-full px-2.5 py-1 text-[12px] font-semibold ring-1 transition-colors ${p.filter === f.id ? "bg-cream text-ink ring-cream" : "bg-transparent text-cream/75 ring-[var(--map-line)] hover:bg-white/5"} ${f.id === "needs" && counts.needs > 0 && p.filter !== f.id ? "text-urgent ring-urgent/40" : ""}`}
          >
            {f.label} {counts[f.id]}
          </button>
        ))}
      </div>
      <ul className="mt-2 flex-1 space-y-1.5 overflow-y-auto px-3 pb-3">
        {list.length === 0 && <li className="px-1 py-6 text-center text-[13px] text-cream/60">Nothing here right now.</li>}
        {list.map((s) => {
          const st = plainStatus(s, p.now);
          return (
            <li key={s.id}>
              <button
                onClick={() => p.onFocus(s.id)}
                className={`w-full rounded-xl px-2.5 py-2 text-left ring-1 transition-colors ${st.tone === "urgent" ? "bg-urgent/10 ring-urgent/45 hover:bg-urgent/18" : "bg-white/[0.03] ring-[var(--map-line)] hover:bg-white/[0.06]"}`}
              >
                <span className="flex items-center gap-2">
                  <span className={`chip shrink-0 ${TONE_BG[st.tone]} text-ink`}>{st.headline}</span>
                  <span className="ml-auto shrink-0 text-[12px] text-cream/55">{elapsed(s.statusSince, p.now)}</span>
                </span>
                <span className="mt-1 block truncate text-[13.5px] font-semibold text-cream">{s.title}</span>
                <span className="block truncate text-[12.5px] text-cream/65">
                  {names.get(s.projectId) ?? "Other"} · {st.detail}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </aside>
  );
}

/** The map's own top strip: name, where the data comes from, counts and the time (all real). */
function MapHeader({ total, projects, demo, now }: { total: number; projects: number; demo: boolean; now: number }) {
  return (
    <div className="map-panel absolute left-3 top-3 flex items-center gap-3 rounded-xl px-3 py-1.5 text-[12.5px] text-cream/80" data-no-pan>
      <span className="map-caps text-[15px] font-semibold text-cream">
        Ai Gramam <span className="text-cream/55">· village map</span>
      </span>
      <span className="flex items-center gap-1.5">
        <span className={`h-2 w-2 rounded-full ${demo ? "bg-brass" : "bg-work"}`} aria-hidden />
        {demo ? "Demo: simulated sessions" : "Live: sessions on this computer"}
      </span>
      <span className="text-cream/60">
        {total} {total === 1 ? "villager" : "villagers"} · {projects} {projects === 1 ? "project" : "projects"}
      </span>
      <span className="font-serif tabular-nums text-cream/85">{clockTime(now)}</span>
    </div>
  );
}

function MapButton({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} aria-label={label} title={label} className="map-panel grid h-10 w-10 place-items-center rounded-full text-cream/85 hover:text-cream">
      {children}
    </button>
  );
}
