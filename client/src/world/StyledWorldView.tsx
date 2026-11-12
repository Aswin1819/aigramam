import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import type { ProjectView, SessionView } from "@shared/model";
import { LiveSim } from "@/styles/live/sim";
import { WORLD_H, type LiveFrame, type LiveStyle, type ViewRect } from "@/styles/live/types";
import type { WorldHandle } from "./WorldView";

interface Props {
  style: LiveStyle;
  sessions: SessionView[];
  projects: ProjectView[];
  selectedId: string | null;
  hoveredId: string | null;
  onSelect: (id: string) => void;
  reducedMotion: boolean;
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
    const hit = (e: { clientX: number; clientY: number }) => {
      const f = lastFrame.current;
      if (!f) return null;
      const w = toWorld(e);
      for (let i = f.villagers.length - 1; i >= 0; i--) {
        const v = f.villagers[i]!;
        const top = v.y - 80 - v.jump * 26;
        if (w.x > v.x - 16 && w.x < v.x + 16 && w.y > top && w.y < v.y + 6) return v.id;
      }
      // Labels are big targets too.
      for (const v of f.villagers) {
        const half = Math.max(v.name.length * 5.4, v.label.length * 5.8) / 2 + 9;
        if (w.x > v.labelX - half && w.x < v.labelX + half && w.y > v.labelY - 4 && w.y < v.labelY + 28) return v.id;
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
      canvas.style.cursor = hit(e) ? "pointer" : "grab";
    };
    const up = (e: PointerEvent) => {
      if (drag && !drag.moved) {
        const id = hit(e);
        if (id) latest.current.onSelect(id);
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
    canvas.addEventListener("wheel", wheel, { passive: false });
    return () => {
      canvas.removeEventListener("pointerdown", down);
      canvas.removeEventListener("pointermove", move);
      canvas.removeEventListener("pointerup", up);
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

export default StyledWorldView;
