/**
 * Workspace → Map in 3D: the village as an isometric operations floor. The
 * three.js scene (scene.ts) draws the square, the pods and the villagers at
 * their desks; this component lays the words over it (project cards, name
 * tags, the wires from the square) at the positions the scene reports after
 * each frame, and keeps the session status board beside it.
 * Clicking a villager or a board row opens it in Focus; clicking a project
 * card or pod flies to that project, "Overview" flies back.
 * Without WebGL it falls back to the 2D map.
 */
import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { ChevronRight, LocateFixed, Minus, PanelRightOpen, Plus } from "lucide-react";
import type { ProjectView, SessionView } from "@shared/model";
import { projectSummaries } from "../attention";
import { plainStatus, type Tone } from "../focus";
import type { Cast } from "../VillageStrip";
import MapPage from "../MapPage";
import { Board, MapButton, MapHeader, PANEL_W } from "../mapParts";
import type { BoardFilter } from "../villageMap";
import { layout3d, type Pod3D } from "./layout3d";
import { VillageScene, type FrameAnchors } from "./scene";

interface Props {
  sessions: SessionView[];
  projects: ProjectView[];
  now: number;
  cast: Cast;
  demo: boolean;
  /** "transcripts + hooks" or "transcripts only", for the header. */
  source: string;
  reducedMotion: boolean;
  emptyText: string;
  onFocus: (sessionId: string) => void;
  onOpenProject: (projectId: string) => void;
}

const TONE_DOT: Record<Tone, string> = { urgent: "bg-urgent", turn: "bg-wait", work: "bg-work", quiet: "bg-[#a3a098]", error: "bg-[#ff8a80]", rest: "bg-[#6f6c66]" };
const WIRE: Record<Pod3D["wire"], { color: (accent: string) => string; flow: boolean }> = {
  urgent: { color: () => "var(--color-urgent)", flow: true },
  work: { color: (a) => a, flow: true },
  quiet: { color: () => "rgba(236,234,227,0.28)", flow: false },
};
/** Name tags show once a villager is drawn big enough to read them next to. */
const TAG_MIN_PPU = 7;
const HEADER_SPACE = 64;
/** With more projects than this, cards show a short summary and open fully on hover or focus. */
const COMPACT_AFTER = 4;

type Rect = { x0: number; y0: number; x1: number; y1: number };
const overlapArea = (a: Rect, b: Rect) => Math.max(0, Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0)) * Math.max(0, Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0));
/** A box made smaller by `k` of its size on every side. */
const shrink = (r: Rect, k: number): Rect => {
  const dx = (r.x1 - r.x0) * k;
  const dy = (r.y1 - r.y0) * k;
  return { x0: r.x0 + dx, y0: r.y0 + dy, x1: r.x1 - dx, y1: r.y1 - dy };
};

export default function Map3DPage(p: Props) {
  const [webgl, setWebgl] = useState<"pending" | "ok" | "failed">("pending");
  const frameRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<VillageScene | null>(null);
  const cards = useRef(new Map<string, HTMLDivElement>());
  const tags = useRef(new Map<string, HTMLDivElement>());
  const wires = useRef(new Map<string, SVGPathElement>());
  const [panelOpen, setPanelOpen] = useState(() => typeof window === "undefined" || window.innerWidth >= 1100);
  const [filter, setFilter] = useState<BoardFilter>("all");
  const [focusedPod, setFocusedPod] = useState<string | null>(null);
  const [hover, setHover] = useState(false);
  const drag = useRef<{ id: number; x: number; y: number; moved: boolean } | null>(null);

  const summaries = useMemo(() => projectSummaries(p.projects, p.sessions), [p.projects, p.sessions]);
  const layout = useMemo(() => layout3d(summaries, p.now), [summaries, p.now]);
  const layoutRef = useRef(layout);
  layoutRef.current = layout;
  const needsYou = useMemo(() => p.sessions.filter((s) => plainStatus(s, p.now).tone === "urgent").length, [p.sessions, p.now]);

  // Create the scene once; without WebGL, use the 2D map.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let scene: VillageScene;
    try {
      scene = new VillageScene(canvas, { reducedMotion: p.reducedMotion, onFrame: (a) => placeOverlay(a) });
    } catch (e) {
      console.warn("[Ai Gramam] 3D map unavailable, showing the 2D map", e);
      setWebgl("failed");
      return;
    }
    sceneRef.current = scene;
    setWebgl("ok");
    const el = frameRef.current!;
    const ro = new ResizeObserver(([entry]) => entry && scene.resize(entry.contentRect.width, entry.contentRect.height));
    ro.observe(el);
    scene.resize(el.clientWidth, el.clientHeight);
    scene.setLayout(layoutRef.current);
    scene.start();
    // The wheel zooms the map instead of scrolling the page.
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

  useEffect(() => {
    sceneRef.current?.setLayout(layout);
  }, [layout]);
  useEffect(() => {
    sceneRef.current?.setReducedMotion(p.reducedMotion);
  }, [p.reducedMotion]);
  useEffect(() => {
    sceneRef.current?.setReserveRight(panelOpen ? PANEL_W + 28 : 0);
  }, [panelOpen, webgl]);

  /** Put cards, tags and wires where the scene says, without a React render per frame. */
  function placeOverlay(a: FrameAnchors) {
    // The header strip is taken: nothing is placed under it.
    const placed: Rect[] = [{ x0: -1e4, y0: -1e4, x1: 1e4, y1: HEADER_SPACE }];
    const hits = (r: Rect) => placed.some((q) => overlapArea(r, q) > 0);
    // Pods are obstacles too (a little smaller than their box, which includes empty corners).
    const podRects = [...a.pods.values()].map(({ rect }) => shrink(rect, 0.18));
    // Cards: the ones that need the person first, then from the top of the screen down. Each takes the
    // spot (above, beside or below its pod) that covers the least of the other cards and the pods.
    const cardList = [...a.pods.entries()].sort((x, y) => urgentRank(y[0]) - urgentRank(x[0]) || x[1].rect.y0 - y[1].rect.y0);
    for (const [id, anchor] of cardList) {
      const el = cards.current.get(id);
      if (!el) continue;
      const w = el.offsetWidth;
      const h = el.offsetHeight;
      const pr = anchor.rect;
      const cx = (pr.x0 + pr.x1) / 2;
      const cy = (pr.y0 + pr.y1) / 2;
      const candidates: Rect[] = [
        { x0: cx - w / 2, y0: pr.y0 - h - 6, x1: cx + w / 2, y1: pr.y0 - 6 },
        { x0: pr.x0 - w - 6, y0: cy - h / 2, x1: pr.x0 - 6, y1: cy + h / 2 },
        { x0: pr.x1 + 6, y0: cy - h / 2, x1: pr.x1 + 6 + w, y1: cy + h / 2 },
        { x0: cx - w / 2, y0: pr.y1 + 6, x1: cx + w / 2, y1: pr.y1 + 6 + h },
      ];
      // Prefer the side facing away from the square, so cards ring the village instead of piling up in the middle.
      const sq = a.square;
      const away = (r: Rect) => Math.max(0, Math.hypot(cx - sq.x, cy - sq.y) - Math.hypot((r.x0 + r.x1) / 2 - sq.x, (r.y0 + r.y1) / 2 - sq.y)) * 40;
      const cost = (r: Rect) => placed.reduce((s, q) => s + overlapArea(r, q), 0) + podRects.reduce((s, q) => s + overlapArea(r, q), 0) * 1.5 + offFrame(r) * 3 + away(r);
      const best = candidates.reduce((b, c) => (cost(c) < cost(b) - 1 ? c : b));
      el.style.transform = `translate(${Math.round(best.x0)}px, ${Math.round(best.y0)}px)`;
      el.style.visibility = anchor.card.visible ? "visible" : "hidden";
      placed.push(best);
      const wire = wires.current.get(id);
      if (wire) {
        const s = a.square;
        const e = anchor.wireEnd;
        // Bend upwards like a cable hung between the square and the pod.
        const mx = (s.x + e.x) / 2;
        const my = Math.min(s.y, e.y) - Math.abs(e.x - s.x) * 0.18 - 20;
        wire.setAttribute("d", `M${s.x.toFixed(1)},${s.y.toFixed(1)} Q${mx.toFixed(1)},${my.toFixed(1)} ${e.x.toFixed(1)},${e.y.toFixed(1)}`);
      }
    }
    // Name tags: only when legible, never on top of a card or another tag; the ones that need the person go first.
    const showTags = a.ppu >= TAG_MIN_PPU;
    const order = [...a.desks.entries()].sort((x, y) => tagRank(x[0]) - tagRank(y[0]));
    for (const [id, anchor] of order) {
      const el = tags.current.get(id);
      if (!el) continue;
      const w = el.offsetWidth;
      const h = el.offsetHeight;
      const x0 = anchor.x - w / 2;
      const y0 = anchor.y - h;
      const r = { x0, y0, x1: x0 + w, y1: y0 + h };
      const show = showTags && anchor.visible && !hits(r);
      el.style.transform = `translate(${Math.round(x0)}px, ${Math.round(y0)}px)`;
      el.style.visibility = show ? "visible" : "hidden";
      if (show) placed.push(r);
    }
  }

  /** Area outside the frame (cards should stay in view). */
  function offFrame(r: Rect): number {
    const el = frameRef.current;
    if (!el) return 0;
    const W = el.clientWidth - (panelOpen ? PANEL_W + 24 : 0);
    const H = el.clientHeight;
    const inside = overlapArea(r, { x0: 0, y0: 0, x1: W, y1: H });
    return (r.x1 - r.x0) * (r.y1 - r.y0) - inside;
  }

  function urgentRank(projectId: string): number {
    return layoutRef.current.pods.find((x) => x.summary.project.id === projectId)?.counts.urgent ?? 0;
  }

  function tagRank(sessionId: string): number {
    const d = layoutRef.current.pods.flatMap((x) => x.desks).find((x) => x.session.id === sessionId);
    const order: Tone[] = ["urgent", "turn", "error", "work", "quiet", "rest"];
    return d ? order.indexOf(d.tone) : 9;
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
    if (hit.sessionId) p.onFocus(hit.sessionId);
    else if (hit.projectId) flyTo(hit.projectId);
  };

  function flyTo(projectId: string) {
    setFocusedPod(projectId);
    sceneRef.current?.focusPod(projectId);
  }
  function overview() {
    setFocusedPod(null);
    sceneRef.current?.fit(true);
  }

  if (webgl === "failed") return <MapPage {...p} />;

  return (
    <div
      ref={frameRef}
      className={`map-frame relative h-[calc(100vh-150px)] min-h-[480px] touch-none select-none overflow-hidden rounded-2xl border border-[var(--map-line)] ${hover ? "cursor-pointer" : "cursor-grab active:cursor-grabbing"}`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={() => (drag.current = null)}
    >
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" aria-label="The village from above: each project is a raised floor with its villagers at desks" role="img" />

      {/* Wires from the square to each project, under the cards. */}
      <svg className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden>
        {layout.pods.map((pod) => (
          <path
            key={pod.summary.project.id}
            ref={(el) => void (el ? wires.current.set(pod.summary.project.id, el) : wires.current.delete(pod.summary.project.id))}
            fill="none"
            stroke={WIRE[pod.wire].color(pod.accent)}
            strokeWidth={1.6}
            strokeDasharray="3 8"
            strokeLinecap="round"
            className={WIRE[pod.wire].flow && !p.reducedMotion ? "map-wire-flow" : undefined}
          />
        ))}
      </svg>

      {/* Name tags over the villagers. */}
      <div className="pointer-events-none absolute left-0 top-0" aria-hidden>
        {layout.pods.flatMap((pod) =>
          pod.desks.map((d) => (
            <div
              key={d.session.id}
              ref={(el) => void (el ? tags.current.set(d.session.id, el) : tags.current.delete(d.session.id))}
              className="absolute left-0 top-0 flex max-w-[190px] items-center gap-1.5 whitespace-nowrap rounded-full border border-white/10 bg-[#16171b]/92 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-[0.1em] text-[#eceae3] shadow"
              style={{ visibility: "hidden" }}
            >
              <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${TONE_DOT[d.tone]}`} />
              <span className="truncate">{d.session.title}</span>
            </div>
          )),
        )}
      </div>

      {/* Project cards. */}
      <div className="pointer-events-none absolute left-0 top-0">
        {layout.pods.map((pod) => (
          <PodCard
            key={pod.summary.project.id}
            pod={pod}
            now={p.now}
            focused={focusedPod === pod.summary.project.id}
            compact={layout.pods.length > COMPACT_AFTER && focusedPod !== pod.summary.project.id}
            refFn={(el) => void (el ? cards.current.set(pod.summary.project.id, el) : cards.current.delete(pod.summary.project.id))}
            onFly={() => flyTo(pod.summary.project.id)}
            onOpenProject={() => p.onOpenProject(pod.summary.project.id)}
            onFocus={p.onFocus}
          />
        ))}
      </div>

      <div className="pointer-events-none absolute inset-x-3 top-3 z-10" style={{ right: panelOpen ? PANEL_W + 24 : 12 }}>
        <MapHeader total={p.sessions.length} projects={summaries.length} needsYou={needsYou} demo={p.demo} source={p.source} now={p.now} />
      </div>

      {p.sessions.length === 0 && webgl === "ok" && (
        <p className="map-panel absolute left-1/2 top-[22%] max-w-md -translate-x-1/2 rounded-xl px-4 py-2.5 text-center text-[13.5px] text-cream/90" style={{ marginLeft: panelOpen ? -(PANEL_W + 24) / 2 : 0 }}>
          {p.emptyText}
        </p>
      )}
      {layout.more > 0 && (
        <p className="map-panel absolute bottom-3 left-3 rounded-xl px-3 py-1.5 text-[12.5px] text-cream/80">
          {layout.more === 1 ? "1 more project" : `${layout.more} more projects`} not on the map: see the board or the Projects page
        </p>
      )}

      <div className="absolute bottom-3 z-10 flex flex-col items-end gap-1.5" style={{ right: panelOpen ? PANEL_W + 24 : 12 }} data-no-pan>
        {focusedPod && (
          <button onClick={overview} className="map-panel map-label mb-1 rounded-full px-3 py-1.5 text-cream hover:text-white">
            ‹ Overview
          </button>
        )}
        <MapButton label="Zoom in" onClick={() => sceneRef.current?.zoomBy(1.2)}><Plus size={16} /></MapButton>
        <MapButton label="Zoom out" onClick={() => sceneRef.current?.zoomBy(1 / 1.2)}><Minus size={16} /></MapButton>
        <MapButton label="Fit the village" onClick={overview}><LocateFixed size={16} /></MapButton>
      </div>

      <div className="absolute bottom-3 right-3 top-3 z-10" data-no-pan>
        {panelOpen ? (
          <Board
            onHide={() => setPanelOpen(false)}
            sessions={p.sessions}
            projects={p.projects}
            now={p.now}
            demo={p.demo}
            filter={filter}
            onFilter={setFilter}
            onFocus={p.onFocus}
            scopeProjectId={focusedPod}
          />
        ) : (
          <MapButton label="Show session status" onClick={() => setPanelOpen(true)}><PanelRightOpen size={16} /></MapButton>
        )}
      </div>
    </div>
  );
}

/** A project's card: its figures in words, like a team card on an operations floor. */
function PodCard({ pod, now, focused, compact, refFn, onFly, onOpenProject, onFocus }: { pod: Pod3D; now: number; focused: boolean; compact: boolean; refFn: (el: HTMLDivElement | null) => void; onFly: () => void; onOpenProject: () => void; onFocus: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  const full = !compact || open;
  const { summary, counts } = pod;
  const firstUrgent = summary.sessions.filter((s) => plainStatus(s, now).tone === "urgent").sort((a, b) => a.statusSince - b.statusSince)[0];
  const resting = counts.rest + counts.quiet;
  const n = summary.sessions.length;
  return (
    <div
      ref={refFn}
      className={`map-panel pointer-events-auto absolute left-0 top-0 rounded-2xl px-3.5 pb-2.5 pt-2.5 text-cream ${compact ? "w-[176px]" : "w-[196px]"}`}
      style={{ visibility: "hidden", zIndex: open ? 5 : undefined, boxShadow: focused ? `0 0 0 1.5px ${pod.accent}, 0 0 44px ${pod.accent}55` : undefined }}
      onPointerEnter={() => setOpen(true)}
      onPointerLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={(e) => !e.currentTarget.contains(e.relatedTarget) && setOpen(false)}
      data-no-pan
    >
      <button onClick={onFly} className="flex w-full items-center gap-1.5 pr-5 text-left" title={`Fly to ${summary.project.name}`}>
        <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: pod.accent }} aria-hidden />
        <span className="map-label min-w-0 flex-1 truncate text-cream">{summary.project.name}</span>
        {counts.urgent > 0 && <span className="h-2 w-2 shrink-0 rounded-full bg-urgent" aria-hidden />}
      </button>
      <button onClick={onOpenProject} className="absolute right-2 top-2 rounded-md p-0.5 text-[var(--map-grey)] hover:bg-white/10 hover:text-cream" aria-label={`Open ${summary.project.name} on the Projects page`} title="Open on the Projects page">
        <ChevronRight size={14} aria-hidden />
      </button>
      <button onClick={onFly} className="mt-1 flex items-baseline gap-2" aria-label={`${n} ${n === 1 ? "villager" : "villagers"} in ${summary.project.name}`}>
        <span className={`font-serif leading-none ${full ? "text-[32px]" : "text-[24px]"}`}>{n}</span>
        <span className="map-label">{n === 1 ? "villager" : "villagers"}</span>
      </button>
      {full && (
        <dl className="mt-2 space-y-0.5 text-[12px]">
          <div className="flex items-baseline justify-between">
            <dt className="map-label">Helpers</dt>
            <dd className="font-serif text-[15px]">{summary.subagents}</dd>
          </div>
          <div className="flex items-baseline justify-between gap-3">
            <dt className="map-label">Branches</dt>
            <dd className="min-w-0 truncate font-serif text-[15px]" title={summary.branches.join(", ")}>{summary.branches.length ? summary.branches.join(", ") : "none"}</dd>
          </div>
        </dl>
      )}
      <div className={`map-label flex justify-between whitespace-nowrap ${full ? "mt-2" : "mt-1"}`}>
        <span className={counts.work ? "text-work" : ""}>Work {counts.work}</span>
        <span className={counts.turn ? "text-wait" : ""}>Turn {counts.turn}</span>
        <span>Rest {resting}</span>
      </div>
      {pod.hidden > 0 && <div className="mt-1 text-[12px] text-[var(--map-grey)]">{pod.hidden} more not drawn</div>}
      {firstUrgent && (
        <button onClick={() => onFocus(firstUrgent.id)} className="map-label mt-2 flex w-full items-center justify-center gap-1 rounded-full bg-urgent/15 px-2 py-1 text-urgent ring-1 ring-urgent/50 hover:bg-urgent/25">
          {counts.urgent === 1 ? "1 needs you" : `${counts.urgent} need you`}
        </button>
      )}
    </div>
  );
}
