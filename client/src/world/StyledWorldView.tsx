import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import type { CharacterPalette } from "@shared/character";
import type { ProjectView, SessionView } from "@shared/model";
import { LiveSim } from "@/styles/live/sim";
import { tintFor } from "@/styles/live/lighting";
import { WORLD_H, type LiveFrame, type LiveStyle, type ViewRect } from "@/styles/live/types";
import type { PlaceTheme } from "@/styles/live/types";
import { buildingRect, pickPlace } from "@/styles/live/placeHit";
import type { WorldHandle } from "./WorldView";

interface Props {
  style: LiveStyle;
  sessions: SessionView[];
  projects: ProjectView[];
  selectedId: string | null;
  hoveredId: string | null;
  onSelect: (id: string) => void;
  reducedMotion: boolean;
  /** Chosen hour of day (0–24), or null to follow the clock. */
  hourOverride: number | null;
  /** Colours of the character chosen for a session's project. */
  paletteOf?: (s: SessionView) => CharacterPalette | undefined;
  /** The chosen place, drawn in this style. */
  theme: PlaceTheme;
  /** Clicking a project's building (not a villager in front of it) calls this with the project id. */
  onSelectProject?: (projectId: string) => void;
  /** The project open in the app: its building gets a brass selection outline. */
  selectedProjectId?: string | null;
}

interface Cam {
  /** World x of the view's left edge, world y of its top, zoom (1 = whole height). */
  x: number;
  y: number;
  z: number;
}

const MAX_Z = 2.6;
const MIN_Z = 0.72;
/** How much of the village the default view tries to show (world units), about four places. */
const FIT_W = 1100;

/**
 * The village drawn by one of the art styles (Canvas 2D), instead of the
 * Phaser Kerala world. Same contract as WorldView: focus / resetView, click a
 * villager to select it. Drag or scroll to look around; Ctrl+scroll zooms.
 */
const StyledWorldView = forwardRef<WorldHandle, Props>(function StyledWorldView(props, ref) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const latest = useRef(props);
  latest.current = props;
  const sim = useRef(new LiveSim());
  const cam = useRef<Cam>({ x: 0, y: 0, z: 1 });
  const target = useRef<Cam>({ x: 0, y: 0, z: 1 });
  /** Session the camera follows (after focus), until the person drags. */
  const follow = useRef<string | null>(null);
  const lastFrame = useRef<LiveFrame | null>(null);
  /** Project whose building is under the pointer (only while onSelectProject is given). */
  const hoveredPlace = useRef<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  /** Default zoom: whole height, or zoomed out (more sky) so ~4 places fit across. */
  const fitZ = (worldW: number) => {
    const c = canvasRef.current;
    const aspectW = ((c?.clientWidth ?? 1280) / (c?.clientHeight ?? 720)) * WORLD_H;
    return Math.min(1, Math.max(MIN_Z, aspectW / Math.min(worldW, FIT_W)));
  };
  const fitted = useRef(false);

  const viewSize = (z: number) => {
    const c = canvasRef.current;
    const w = c?.clientWidth ?? 1280;
    const h = c?.clientHeight ?? 720;
    const scale = (h / WORLD_H) * z;
    return { w: w / scale, h: WORLD_H / z, scale };
  };

  useImperativeHandle(ref, () => ({
    focus: (id) => {
      follow.current = id;
      target.current.z = Math.max(target.current.z, 1.7);
    },
    resetView: () => {
      follow.current = null;
      target.current = { x: target.current.x, y: 0, z: fitZ(lastFrame.current?.worldW ?? 640) };
    },
    startRain: () => {},
  }));

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    let raf = 0;
    let last = performance.now();
    let lastDrawKey = -1;

    const clamp = (c: Cam, worldW: number) => {
      const v = viewSize(c.z);
      c.x = v.w >= worldW ? (worldW - v.w) / 2 : Math.min(Math.max(c.x, 0), worldW - v.w);
      // Taller than the world: keep the ground at the bottom, show more sky.
      c.y = v.h >= WORLD_H ? WORLD_H - v.h : Math.min(Math.max(c.y, 0), WORLD_H - v.h);
    };

    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      const p = latest.current;
      const frame = sim.current.frame(dt, p);
      lastFrame.current = frame;
      if (!fitted.current) {
        fitted.current = true;
        target.current.z = cam.current.z = fitZ(frame.worldW);
      }

      // Camera: follow the focused villager, ease towards the target.
      const tg = target.current;
      if (follow.current) {
        const v = frame.villagers.find((x) => x.id === follow.current);
        if (v) {
          const vs = viewSize(tg.z);
          tg.x = v.x - vs.w * 0.38;
          tg.y = v.y - 46 - vs.h * 0.55;
        } else follow.current = null;
      }
      clamp(tg, frame.worldW);
      const c = cam.current;
      const k = p.reducedMotion ? 1 : Math.min(1, dt * 5);
      c.x += (tg.x - c.x) * k;
      c.y += (tg.y - c.y) * k;
      c.z += (tg.z - c.z) * k;
      clamp(c, frame.worldW);

      // Choppy styles draw only on their own frame boundaries.
      if (p.style.fps) {
        const key = Math.floor(frame.t * p.style.fps);
        if (key === lastDrawKey) return;
        lastDrawKey = key;
        frame.t = key / p.style.fps;
      }

      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const cw = Math.round(canvas.clientWidth * dpr);
      const ch = Math.round(canvas.clientHeight * dpr);
      if (canvas.width !== cw || canvas.height !== ch) {
        canvas.width = cw;
        canvas.height = ch;
      }
      const vs = viewSize(c.z);
      const s = vs.scale * dpr;
      const view: ViewRect = { x: c.x, y: c.y, w: vs.w, h: vs.h };
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = "source-over";
      ctx.filter = "none";
      ctx.shadowBlur = 0;
      ctx.fillStyle = p.style.bg;
      ctx.fillRect(0, 0, cw, ch);
      ctx.setTransform(s, 0, 0, s, -c.x * s, -c.y * s);
      try {
        ctx.save();
        p.style.draw(ctx, frame, view);
        ctx.restore();
        // Time of day: tint towards dusk/night when the chosen time is later than the style is painted.
        const d = new Date();
        const tint = tintFor(p.style.lighting, p.hourOverride ?? d.getHours() + d.getMinutes() / 60);
        if (tint) {
          ctx.setTransform(1, 0, 0, 1, 0, 0);
          ctx.globalCompositeOperation = "multiply";
          ctx.fillStyle = tint;
          ctx.fillRect(0, 0, cw, ch);
          ctx.globalCompositeOperation = "source-over";
        }
        // Selected / hovered project: a generic outline over whatever the style drew (after the tint, so it reads at night).
        ctx.setTransform(s, 0, 0, s, -c.x * s, -c.y * s);
        drawPlaceOutlines(ctx, frame, p.selectedProjectId ?? null, p.onSelectProject ? hoveredPlace.current : null, vs.scale);
      } catch (e) {
        cancelAnimationFrame(raf);
        console.error("[Ai Gramam] art style failed to draw", e);
        setError(e instanceof Error ? e.message : String(e));
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [props.style]);

  // Pointer: drag to pan, click to select, wheel to pan / Ctrl+wheel to zoom.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let drag: { x: number; y: number; cx: number; cy: number; moved: boolean } | null = null;
    const toWorld = (e: { clientX: number; clientY: number }) => {
      const r = canvas.getBoundingClientRect();
      const vs = viewSize(cam.current.z);
      return { x: cam.current.x + (e.clientX - r.left) / vs.scale, y: cam.current.y + (e.clientY - r.top) / vs.scale };
    };
    type Hit = { kind: "villager" | "place"; id: string };
    const hit = (e: { clientX: number; clientY: number }): Hit | null => {
      const f = lastFrame.current;
      if (!f) return null;
      const w = toWorld(e);
      for (let i = f.villagers.length - 1; i >= 0; i--) {
        const v = f.villagers[i]!;
        const top = v.y - 80 - v.jump * 26;
        if (w.x > v.x - 16 && w.x < v.x + 16 && w.y > top && w.y < v.y + 6) return { kind: "villager", id: v.id };
      }
      // Labels are big targets too.
      for (const v of f.villagers) {
        const half = Math.max(v.name.length * 5.4, v.label.length * 5.8) / 2 + 9;
        if (w.x > v.labelX - half && w.x < v.labelX + half && w.y > v.labelY - 4 && w.y < v.labelY + 28) return { kind: "villager", id: v.id };
      }
      // Then the buildings behind them (projects), when the parent wants project clicks.
      if (latest.current.onSelectProject) {
        const id = pickPlace(w.x, w.y, f.places.map(buildingRect));
        if (id) return { kind: "place", id };
      }
      return null;
    };
    const down = (e: PointerEvent) => {
      drag = { x: e.clientX, y: e.clientY, cx: target.current.x, cy: target.current.y, moved: false };
      canvas.setPointerCapture(e.pointerId);
    };
    const move = (e: PointerEvent) => {
      if (drag) {
        const dx = e.clientX - drag.x;
        const dy = e.clientY - drag.y;
        if (Math.abs(dx) + Math.abs(dy) > 4) {
          drag.moved = true;
          follow.current = null;
        }
        if (drag.moved) {
          const vs = viewSize(target.current.z);
          target.current.x = drag.cx - dx / vs.scale;
          target.current.y = drag.cy - dy / vs.scale;
        }
        return;
      }
      const h = hit(e);
      hoveredPlace.current = h?.kind === "place" ? h.id : null;
      canvas.style.cursor = h ? "pointer" : "grab";
    };
    const leave = () => {
      if (!drag) hoveredPlace.current = null;
    };
    const up = (e: PointerEvent) => {
      if (drag && !drag.moved) {
        const h = hit(e);
        if (h?.kind === "villager") latest.current.onSelect(h.id);
        else if (h?.kind === "place") latest.current.onSelectProject?.(h.id);
      }
      drag = null;
    };
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      const t = target.current;
      if (e.ctrlKey || e.metaKey) {
        const before = toWorld(e);
        t.z = Math.min(MAX_Z, Math.max(MIN_Z, t.z * Math.exp(-e.deltaY * 0.0015)));
        const r = canvas.getBoundingClientRect();
        const vs = viewSize(t.z);
        t.x = before.x - (e.clientX - r.left) / vs.scale;
        t.y = before.y - (e.clientY - r.top) / vs.scale;
      } else {
        follow.current = null;
        const vs = viewSize(t.z);
        t.x += (Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY) / vs.scale;
      }
    };
    canvas.addEventListener("pointerdown", down);
    canvas.addEventListener("pointermove", move);
    canvas.addEventListener("pointerup", up);
    canvas.addEventListener("pointerleave", leave);
    canvas.addEventListener("wheel", wheel, { passive: false });
    return () => {
      canvas.removeEventListener("pointerdown", down);
      canvas.removeEventListener("pointermove", move);
      canvas.removeEventListener("pointerup", up);
      canvas.removeEventListener("pointerleave", leave);
      canvas.removeEventListener("wheel", wheel);
    };
  }, []);

  return (
    <div className="absolute inset-0" style={{ background: props.style.bg }}>
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full touch-none" aria-label={`The village, drawn in the ${props.style.name} style`} />
      {error && (
        <div className="absolute inset-0 grid place-items-center bg-black/70 p-6 text-center text-sm text-red-200">
          The {props.style.name} style failed to draw ({error}). Pick another art style in the top bar.
        </div>
      )}
    </div>
  );
});

/**
 * Outline the selected project's building (brass, with a soft glow) and the
 * hovered one (lighter, dashed, with an "Open project" tab on its top-right corner).
 * Drawn in world units on top of the style; `scale` is screen px per world
 * unit, so strokes and text keep a steady on-screen size.
 */
function drawPlaceOutlines(ctx: CanvasRenderingContext2D, f: LiveFrame, selected: string | null, hovered: string | null, scale: number) {
  if (!selected && !hovered) return;
  const px = 1 / Math.max(0.01, scale);
  for (const place of f.places) {
    const isSel = place.id === selected;
    const isHov = place.id === hovered;
    if (!isSel && !isHov) continue;
    const r = buildingRect(place);
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(r.x0, r.y0, r.x1 - r.x0, r.y1 - r.y0, 10);
    if (isSel) {
      ctx.shadowColor = "rgba(227, 176, 75, 0.85)";
      ctx.shadowBlur = 14;
      ctx.strokeStyle = "#e3b04b";
      ctx.lineWidth = 2.5 * px;
      ctx.stroke();
      ctx.shadowBlur = 0;
    }
    if (isHov) {
      ctx.fillStyle = "rgba(255, 248, 231, 0.07)";
      ctx.fill();
      ctx.setLineDash([6 * px, 4 * px]);
      ctx.strokeStyle = isSel ? "rgba(255, 248, 231, 0.9)" : "rgba(255, 248, 231, 0.7)";
      ctx.lineWidth = 1.5 * px;
      ctx.stroke();
      ctx.setLineDash([]);
      // Hint: a small tab on the outline's top-right corner (clear of the centred sign and badges styles draw).
      const text = "Open project";
      ctx.font = `600 ${11 * px}px system-ui, sans-serif`;
      const ph = 18 * px;
      const pw = ctx.measureText(text).width + 16 * px;
      const cx = r.x1 - pw / 2 - 4 * px;
      const top = r.y0 - ph / 2;
      ctx.beginPath();
      ctx.roundRect(cx - pw / 2, top, pw, ph, ph / 2);
      ctx.fillStyle = "rgba(13, 27, 24, 0.88)";
      ctx.fill();
      ctx.strokeStyle = "rgba(227, 176, 75, 0.8)";
      ctx.lineWidth = px;
      ctx.stroke();
      ctx.fillStyle = "#fff8e7";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(text, cx, top + ph / 2 + 0.5 * px);
    }
    ctx.restore();
  }
}

export default StyledWorldView;
