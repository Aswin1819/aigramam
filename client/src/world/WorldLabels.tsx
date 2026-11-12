import { useEffect, useRef, type RefObject } from "react";
import { AnimatePresence, motion } from "motion/react";
import type { ProjectView, SessionView, SubagentView } from "@shared/model";
import type { WorldInfo } from "@shared/world";
import { elapsed, isUrgent, statusColor, statusText } from "@/lib/status";
import type { CharacterPositions, SignPos } from "./WorldScene";

/** What a companion is doing, in words (its tag always says it, not only the sprite). */
function companionText(a: SubagentView): string {
  if (a.status === "error") return "Hit an error";
  if (a.status === "waiting") return a.action?.kind === "question" ? "Has a question" : "Waiting";
  if (a.status === "idle") return "Idle";
  return a.action?.label ?? "Thinking";
}

interface SceneLike {
  positions: Map<string, CharacterPositions>;
  signs: SignPos[];
  toCanvas(x: number, y: number): { x: number; y: number; zoom: number };
  /** Project pointed at on the canvas or via its signboard (highlights the sign and shows "Open project"). */
  readonly hoveredProjectId?: string | null;
  setSignHover?(projectId: string | null): void;
}

interface Props {
  wrapRef: RefObject<HTMLDivElement | null>;
  sceneRef: RefObject<SceneLike | null>;
  world: WorldInfo;
  sessions: SessionView[];
  projects: ProjectView[];
  selectedId: string | null;
  hoveredId: string | null;
  onSelect: (id: string) => void;
  onSelectProject?: (projectId: string) => void;
  selectedProjectId?: string | null;
  now: number;
}

/**
 * All text in the world as real HTML over the canvas: brass signboards,
 * speech bubbles with the current action, name tags and subagent tags.
 * Positions follow the camera every animation frame without re-rendering.
 */
export default function WorldLabels({ wrapRef, sceneRef, world, sessions, projects, selectedId, hoveredId, onSelect, onSelectProject, selectedProjectId = null, now }: Props) {
  const els = useRef(new Map<string, HTMLDivElement>());
  const gameWidth = world.def.size.width;

  useEffect(() => {
    let raf = 0;
    const frame = () => {
      raf = requestAnimationFrame(frame);
      const wrap = wrapRef.current, scene = sceneRef.current;
      const canvas = wrap?.querySelector("canvas");
      if (!wrap || !scene || !canvas) return;
      const w = wrap.getBoundingClientRect(), c = canvas.getBoundingClientRect();
      const k = c.width / gameWidth, ox = c.left - w.left, oy = c.top - w.top;
      const signs = new Map(scene.signs.map((s) => [s.projectId, s]));
      // 1) Where each label wants to be.
      type Item = { el: HTMLDivElement; kind: "sign" | "head" | "tag"; x: number; y: number; alpha: number; w: number; h: number };
      const items: Item[] = [];
      for (const [key, el] of els.current) {
        let world_: { x: number; y: number } | undefined, alpha = 1;
        const kind: Item["kind"] = key.startsWith("sign|") ? "sign" : key.startsWith("head|") ? "head" : "tag";
        if (kind === "sign") world_ = signs.get(key.slice(5));
        else if (kind === "head") {
          const p = scene.positions.get(key.slice(5));
          world_ = p?.head; alpha = p?.hero.alpha ?? 0;
        } else {
          const [sid, aid] = key.split("|");
          const p = scene.positions.get(sid);
          const pos = aid ? p?.companions.get(aid) : p?.hero;
          world_ = pos; alpha = pos?.alpha ?? 0;
        }
        if (!world_) { el.style.opacity = "0"; continue; }
        const p = scene.toCanvas(world_.x, world_.y);
        const x = Math.max(70, Math.min(w.width - 70, ox + p.x * k)), y = oy + p.y * k;
        const off = x < -150 || y < -80 || x > w.width + 150 || y > w.height + 80;
        const child = el.firstElementChild as HTMLElement | null;
        items.push({ el, kind, x, y, alpha: off ? 0 : alpha, w: child?.offsetWidth ?? 0, h: child?.offsetHeight ?? 0 });
      }
      // 2) Keep text from overlapping: name tags stack downwards, bubbles and signboards step upwards.
      //    Box of each label relative to its anchor: tags hang below (+8px), bubbles and signs sit above.
      const placed: Array<{ l: number; r: number; t: number; b: number }> = [];
      const box = (it: Item, y: number) =>
        it.kind === "tag" ? { l: it.x - it.w / 2, r: it.x + it.w / 2, t: y + 6, b: y + 8 + it.h }
        : it.kind === "head" ? { l: it.x - it.w / 2, r: it.x + it.w / 2, t: y - 14 - it.h, b: y - 12 }
        : { l: it.x - it.w / 2, r: it.x + it.w / 2, t: y - it.h, b: y };
      const hits = (a: { l: number; r: number; t: number; b: number }) => placed.some((q) => a.l < q.r - 2 && a.r > q.l + 2 && a.t < q.b - 1 && a.b > q.t + 1);
      const order = { tag: 0, head: 1, sign: 2 } as const;
      items.sort((a, b) => order[a.kind] - order[b.kind] || a.y - b.y || a.x - b.x);
      // Hovered project (canvas or signboard): mark its sign so CSS shows the hint.
      const hovered = scene.hoveredProjectId ?? null;
      for (const [key, el] of els.current) {
        if (!key.startsWith("sign|")) continue;
        const on = key.slice(5) === hovered ? "1" : "0";
        if (el.dataset.hover !== on) el.dataset.hover = on;
      }
      for (const it of items) {
        let y = it.y;
        if (it.alpha > 0.05 && it.w > 0) {
          for (let tries = 0; tries < 8 && hits(box(it, y)); tries++) y += it.kind === "tag" ? it.h + 3 : -(it.h + 3);
          placed.push(box(it, y));
        }
        it.el.style.opacity = String(it.alpha);
        it.el.style.transform = `translate3d(${Math.round(it.x)}px, ${Math.round(y)}px, 0)`;
      }
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [wrapRef, sceneRef, gameWidth]);

  const setEl = (key: string) => (el: HTMLDivElement | null) => {
    if (el) els.current.set(key, el);
    else els.current.delete(key);
  };

  const withSessions = new Set(sessions.map((s) => s.projectId));
  const signLabel = (id: string) => sceneRef.current?.signs.find((s) => s.projectId === id)?.locationLabel;

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {projects.filter((p) => withSessions.has(p.id)).map((p) => {
        const selectedSign = p.id === selectedProjectId;
        const body = (
          <>
            <div className="max-w-[210px] truncate font-display text-[12.5px] font-semibold tracking-wide text-cream">{p.name}</div>
            {signLabel(p.id) && <div className="text-[10px] uppercase tracking-[0.14em] text-brass/90">{signLabel(p.id)}</div>}
          </>
        );
        const signClass = `signboard absolute left-1/2 -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-md px-2.5 py-1 text-center transition-[filter,box-shadow] ${
          selectedSign ? "ring-2 ring-brass ring-offset-2 ring-offset-[#251a0e] shadow-[0_0_18px_rgba(227,176,75,0.75)]" : ""
        }`;
        const motionProps = {
          initial: { opacity: 0, y: 8, scale: 0.9 },
          animate: { opacity: 1, y: 0, scale: 1 },
          transition: { type: "spring" as const, stiffness: 260, damping: 22 },
        };
        return (
          <div key={`sign|${p.id}`} ref={setEl(`sign|${p.id}`)} data-hover="0" className="group absolute left-0 top-0" style={{ opacity: 0, zIndex: selectedSign ? 2 : 1, willChange: "transform" }}>
            {onSelectProject ? (
              <motion.button
                {...motionProps}
                type="button"
                onClick={() => onSelectProject(p.id)}
                onPointerEnter={() => sceneRef.current?.setSignHover?.(p.id)}
                onPointerLeave={() => sceneRef.current?.setSignHover?.(null)}
                className={`${signClass} pointer-events-auto cursor-pointer group-data-[hover=1]:brightness-125`}
                title={`Open project · ${p.root}`}
                aria-label={`Open project ${p.name}`}
                aria-pressed={selectedSign}
              >
                {body}
                {/* Hint under the sign while the place or the sign is pointed at. */}
                <span className="pointer-events-none absolute left-1/2 top-full mt-1.5 -translate-x-1/2 whitespace-nowrap rounded-full border border-brass/60 bg-[#0d1b18]/90 px-2 py-[2px] text-[10.5px] font-semibold text-cream opacity-0 transition-opacity group-data-[hover=1]:opacity-100">
                  Open project
                </span>
              </motion.button>
            ) : (
              <motion.div {...motionProps} className={signClass} title={p.root}>
                {body}
              </motion.div>
            )}
          </div>
        );
      })}

      {sessions.map((s) => {
        const urgent = isUrgent(s);
        const waiting = s.status === "waiting";
        const selected = s.id === selectedId || s.id === hoveredId;
        const quiet = !selected && (s.status === "idle" || s.status === "finished");
        const color = statusColor(s);
        return (
          <div key={s.id}>
            {/* Speech bubble above the head */}
            <div ref={setEl(`head|${s.id}`)} className="absolute left-0 top-0" style={{ opacity: 0, zIndex: urgent ? 6 : waiting ? 5 : selected ? 4 : 3, willChange: "transform" }}>
              <AnimatePresence mode="popLayout">
                {s.action && !quiet && (
                  <motion.button
                    key={s.action.label}
                    onClick={() => onSelect(s.id)}
                    initial={{ opacity: 0, y: 6, scale: 0.92 }}
                    animate={urgent ? { opacity: 1, y: [0, -5, 0], scale: 1 } : { opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -8, scale: 0.95, transition: { duration: 0.18 } }}
                    transition={urgent ? { y: { repeat: Infinity, duration: 0.9, ease: "easeInOut" }, default: { type: "spring", stiffness: 380, damping: 26 } } : { type: "spring", stiffness: 380, damping: 26 }}
                    className={`bubble-tail pointer-events-auto absolute bottom-[14px] left-1/2 max-w-[240px] -translate-x-1/2 truncate whitespace-nowrap rounded-xl border px-2.5 py-1 text-[11.5px] font-medium shadow-lg ${
                      urgent ? "border-red-200/70 bg-urgent text-white shadow-red-900/50" : waiting ? "border-amber-100/70 bg-wait text-ink" : "border-white/15 bg-[#0d1b18]/90 text-cream"
                    }`}
                    title={s.action.label}
                  >
                    <span aria-hidden className="mr-1">{s.action.emoji}</span>
                    {s.action.label}
                  </motion.button>
                )}
              </AnimatePresence>
            </div>
            {/* Name tag under the feet */}
            <div ref={setEl(s.id)} className="absolute left-0 top-0" style={{ opacity: 0, zIndex: selected ? 4 : 2, willChange: "transform" }}>
              <button
                onClick={() => onSelect(s.id)}
                className={`pointer-events-auto absolute left-1/2 top-[8px] -translate-x-1/2 whitespace-nowrap rounded-full border px-2 py-[3px] text-center leading-tight backdrop-blur-md transition-colors ${
                  selected ? "border-brass bg-[#2a2212]/90" : "border-white/12 bg-black/55"
                }`}
                title={`${s.title} · ${statusText(s)} ${elapsed(s.statusSince, now)}`}
              >
                <span className="flex items-center gap-1.5">
                  <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${urgent || s.status === "working" ? "animate-pulse" : ""}`} style={{ background: color }} />
                  <span className={`truncate font-semibold text-cream ${quiet ? "max-w-[120px] text-[10.5px] opacity-80" : "max-w-[170px] text-[11.5px]"}`}>{s.title}</span>
                </span>
                {!quiet && (
                  <span className="block text-[10px] font-medium" style={{ color }}>
                    {statusText(s)} · {elapsed(s.statusSince, now)}
                  </span>
                )}
              </button>
            </div>
            {s.subagents.filter((a) => a.status !== "finished").map((a) => (
              <div key={a.id} ref={setEl(`${s.id}|${a.id}`)} className="absolute left-0 top-0" style={{ opacity: 0, zIndex: 2 }}>
                <motion.div
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="absolute left-1/2 top-[6px] max-w-[190px] -translate-x-1/2 truncate whitespace-nowrap rounded-full border border-sky-300/30 bg-sky-950/75 px-2 py-[2px] text-[10px] text-sky-100 backdrop-blur-md"
                  title={a.description || a.agentType}
                >
                  <span aria-hidden>{a.status === "working" && a.action ? a.action.emoji : "🤝"} </span>
                  <b className="font-semibold">{a.agentType}</b>
                  <span className="text-sky-100/75"> · {companionText(a)}</span>
                </motion.div>
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}

