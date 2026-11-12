import { useEffect, useRef, type RefObject } from "react";
import type { ProjectView, SessionView } from "@shared/model";
import type { WorldInfo } from "@shared/world";
import { STATUS_META, elapsed, isUrgent, statusText } from "@/lib/status";
import type { CharacterPositions, SignPos } from "./WorldScene";

interface SceneLike {
  positions: Map<string, CharacterPositions>;
  signs: SignPos[];
}

interface Props {
  wrapRef: RefObject<HTMLDivElement | null>;
  sceneRef: RefObject<SceneLike | null>;
  world: WorldInfo;
  sessions: SessionView[];
  projects: ProjectView[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  now: number;
}

/**
 * All text in the world as real HTML: project signboards, character name tags,
 * action bubbles and subagent labels. Positions are applied straight to the
 * DOM every animation frame, so React only re-renders when text changes.
 */
export default function WorldLabels({ wrapRef, sceneRef, world, sessions, projects, selectedId, onSelect, now }: Props) {
  const els = useRef(new Map<string, HTMLDivElement>());
  const { palette } = world.def;
  const worldWidth = world.def.size.width;

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
      const signs = new Map(scene.signs.map((s) => [s.projectId, s]));
      for (const [key, el] of els.current) {
        let pos: { x: number; y: number; alpha: number } | undefined;
        if (key.startsWith("sign|")) {
          const s = signs.get(key.slice(5));
          pos = s && { x: s.x, y: s.y, alpha: 1 };
        } else {
          const [sid, aid] = key.split("|");
          const p = scene.positions.get(sid);
          pos = aid ? p?.companions.get(aid) : p?.hero;
        }
        if (!pos) {
          el.style.opacity = "0";
          continue;
        }
        const margin = Math.min(110, w.width / 2);
        const x = Math.max(margin, Math.min(w.width - margin, ox + pos.x * k));
        const y = Math.max(28, Math.min(w.height - 28, oy + pos.y * k));
        el.style.opacity = String(pos.alpha);
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

  const sessionsByProject = new Map<string, number>();
  for (const s of sessions) sessionsByProject.set(s.projectId, (sessionsByProject.get(s.projectId) ?? 0) + 1);

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {/* Project signboards */}
      {projects.filter((p) => sessionsByProject.has(p.id)).map((p) => (
        <div key={`sign|${p.id}`} ref={setEl(`sign|${p.id}`)} className="absolute left-0 top-0" style={{ opacity: 0, zIndex: 1 }}>
          <div
            className="absolute left-1/2 -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-sm border-2 px-2 py-0.5 text-center shadow-lg"
            style={{ background: palette.labelBg, borderColor: palette.accent, color: palette.label }}
            title={p.root}
          >
            <div className="max-w-[200px] truncate text-[12px] font-bold">📁 {p.name}</div>
            <SignLocation projectId={p.id} sceneRef={sceneRef} />
          </div>
        </div>
      ))}

      {sessions.map((s) => {
        const urgent = isUrgent(s);
        const waiting = s.status === "waiting";
        const meta = STATUS_META[s.status];
        const selected = s.id === selectedId;
        const compact = !selected && (s.status === "idle" || s.status === "finished");
        if (compact) {
          return (
            <div key={s.id} ref={setEl(s.id)} className="absolute left-0 top-0" style={{ opacity: 0, zIndex: 2 }}>
              <button
                onClick={() => onSelect(s.id)}
                className="pointer-events-auto absolute left-1/2 top-[6px] max-w-[130px] -translate-x-1/2 truncate whitespace-nowrap rounded border border-white/10 bg-black/60 px-1 py-px text-[10px] text-gray-200"
                title={`${s.title} · ${statusText(s)} ${elapsed(s.statusSince, now)}`}
              >
                <span aria-hidden>{meta.emoji}</span> {s.title}
              </button>
            </div>
          );
        }
        return (
          <div key={s.id} ref={setEl(s.id)} className="absolute left-0 top-0" style={{ opacity: 0, zIndex: urgent ? 5 : waiting ? 4 : 3 }}>
            {s.action && (
              <button
                onClick={() => onSelect(s.id)}
                className={`pointer-events-auto absolute bottom-[52px] left-1/2 max-w-[230px] -translate-x-1/2 truncate whitespace-nowrap rounded-md border px-1.5 py-0.5 text-[11px] leading-tight shadow ${urgent ? "animate-bounce font-bold text-white" : waiting ? "font-bold text-black" : "border-white/20 bg-black/80 text-white"}`}
                style={urgent ? { background: palette.urgent, borderColor: "#fecaca" } : waiting ? { background: palette.waiting, borderColor: "#fde68a" } : undefined}
                title={s.action.label}
              >
                <span aria-hidden>{s.action.emoji}</span> {s.action.label}
              </button>
            )}
            <button
              onClick={() => onSelect(s.id)}
              className={`pointer-events-auto absolute left-1/2 top-[6px] -translate-x-1/2 whitespace-nowrap rounded border px-1.5 py-0.5 text-center leading-tight ${selected ? "border-yellow-300 bg-[#2a2140]" : "border-white/15 bg-black/75"}`}
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
            <div key={`${s.id}|${a.id}`} ref={setEl(`${s.id}|${a.id}`)} className="absolute left-0 top-0" style={{ opacity: 0, zIndex: 2 }}>
              <div className="absolute left-1/2 top-[4px] max-w-[200px] -translate-x-1/2 truncate whitespace-nowrap rounded border border-sky-400/40 bg-sky-950/85 px-1 py-px text-[10px] text-sky-200" title={a.description || a.agentType}>
                🤝 {a.agentType}
                {a.action && <span className="text-sky-100/80"> · {a.action.label}</span>}
              </div>
            </div>
          )),
      )}
    </div>
  );
}

/** The location's own name under the project name (e.g. "Chaya Kada"). */
function SignLocation({ projectId, sceneRef }: { projectId: string; sceneRef: RefObject<SceneLike | null> }) {
  const label = sceneRef.current?.signs.find((s) => s.projectId === projectId)?.locationLabel;
  return label ? <div className="text-[10px] opacity-80">{label}</div> : null;
}
