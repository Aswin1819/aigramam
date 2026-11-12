import { useEffect, useRef, type RefObject } from "react";
import type { SessionView } from "@shared/model";
import { STATUS_META, elapsed, isUrgent, statusText } from "@/lib/status";
import type { HeroPositions } from "./DungeonMapPhaser";

interface SceneLike {
  positions: Map<string, HeroPositions>;
}

interface Props {
  wrapRef: RefObject<HTMLDivElement | null>;
  sceneRef: RefObject<SceneLike | null>;
  sessions: SessionView[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  now: number;
  worldWidth: number;
}

/**
 * Name tags, action bubbles and subagent labels as real HTML text, kept on
 * top of their characters. Positions are applied directly to the DOM each
 * animation frame, so React only re-renders when the text changes.
 */
export default function MapLabels({ wrapRef, sceneRef, sessions, selectedId, onSelect, now, worldWidth }: Props) {
  const els = useRef(new Map<string, HTMLDivElement>());

  useEffect(() => {
    let raf = 0;
    const frame = () => {
      raf = requestAnimationFrame(frame);
      const wrap = wrapRef.current;
      const scene = sceneRef.current;
      const canvas = wrap?.querySelector("canvas");
      if (!wrap || !scene || !canvas) return;
      const w = wrap.getBoundingClientRect();
      const c = canvas.getBoundingClientRect();
      const k = c.width / worldWidth;
      const ox = c.left - w.left;
      const oy = c.top - w.top;
      for (const [key, el] of els.current) {
        const [sid, aid] = key.split("|");
        const p = scene.positions.get(sid);
        const pos = aid ? p?.companions.get(aid) : p?.hero;
        if (!pos) {
          el.style.opacity = "0";
          continue;
        }
        el.style.opacity = String(pos.alpha);
        // Keep centred labels (up to ~220px wide) inside the visible map.
        const margin = Math.min(110, w.width / 2);
        const x = Math.max(margin, Math.min(w.width - margin, ox + pos.x * k));
        const y = Math.max(40, Math.min(w.height - 40, oy + pos.y * k));
        el.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
      }
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [wrapRef, sceneRef, worldWidth]);

  const setEl = (key: string) => (el: HTMLDivElement | null) => {
    if (el) els.current.set(key, el);
    else els.current.delete(key);
  };

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden={false}>
      {sessions.map((s) => {
        const urgent = isUrgent(s);
        const waiting = s.status === "waiting";
        const meta = STATUS_META[s.status];
        const selected = s.id === selectedId;
        // Quiet sessions get a small tag so busy ones stay readable.
        const compact = !selected && (s.status === "idle" || s.status === "finished");
        if (compact) {
          return (
            <div key={s.id} ref={setEl(s.id)} className="absolute left-0 top-0" style={{ opacity: 0, zIndex: 1, willChange: "transform" }}>
              <button
                onClick={() => onSelect(s.id)}
                className="pointer-events-auto absolute left-1/2 top-[18px] max-w-[130px] -translate-x-1/2 truncate whitespace-nowrap rounded border border-white/10 bg-black/60 px-1 py-px text-[10px] text-gray-300"
                title={`${s.title} · ${statusText(s)} ${elapsed(s.statusSince, now)}`}
              >
                <span aria-hidden>{meta.emoji}</span> {s.title}
              </button>
            </div>
          );
        }
        return (
          <div key={s.id} ref={setEl(s.id)} className="absolute left-0 top-0" style={{ opacity: 0, zIndex: urgent ? 4 : waiting ? 3 : 2, willChange: "transform" }}>
            {/* Action bubble above the head */}
            {s.action && (
              <button
                onClick={() => onSelect(s.id)}
                className={`pointer-events-auto absolute bottom-[26px] left-1/2 max-w-[220px] -translate-x-1/2 truncate whitespace-nowrap rounded-md border px-1.5 py-0.5 text-[11px] leading-tight shadow ${
                  urgent ? "animate-bounce border-red-300 bg-red-600 font-bold text-white" : waiting ? "border-amber-300 bg-amber-500 font-bold text-black" : "border-white/20 bg-black/80 text-white"
                }`}
                title={s.action.label}
              >
                <span aria-hidden>{s.action.emoji}</span> {s.action.label}
              </button>
            )}
            {/* Name tag under the feet */}
            <button
              onClick={() => onSelect(s.id)}
              className={`pointer-events-auto absolute left-1/2 top-[20px] -translate-x-1/2 whitespace-nowrap rounded border px-1.5 py-0.5 text-center leading-tight ${s.id === selectedId ? "border-yellow-300 bg-[#2a2140]" : "border-white/15 bg-black/75"}`}
            >
              <div className="max-w-[180px] truncate text-[11px] font-bold text-white">{s.title}</div>
              <div className="text-[10px]" style={{ color: urgent ? "#fca5a5" : meta.color }}>
                {statusText(s)} · {elapsed(s.statusSince, now)}
              </div>
            </button>
          </div>
        );
      })}
      {sessions.flatMap((s) =>
        s.subagents
          .filter((a) => a.status !== "finished")
          .map((a) => (
            <div key={`${s.id}|${a.id}`} ref={setEl(`${s.id}|${a.id}`)} className="absolute left-0 top-0" style={{ opacity: 0 }}>
              <div className="absolute left-1/2 top-[12px] max-w-[200px] -translate-x-1/2 truncate whitespace-nowrap rounded border border-sky-400/40 bg-sky-950/85 px-1 py-px text-[10px] text-sky-200" title={a.description || a.agentType}>
                🤝 {a.agentType}
                {a.action && <span className="text-sky-100/80"> · {a.action.label}</span>}
              </div>
            </div>
          )),
      )}
    </div>
  );
}
