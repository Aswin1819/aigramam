import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ArrowLeft, ChevronLeft, ChevronRight, Copy, Maximize2, Pause, Play, Star, X } from "lucide-react";
import { STYLES } from "@/styles/registry";
import { H, W, frameAt, stepTime } from "@/styles/scene";
import type { StyleProto } from "@/styles/types";

/**
 * Style lab: every style prototype drawing the same village scene, so they
 * can be compared, starred and annotated. Picks and notes stay in this
 * browser (localStorage) and can be copied out.
 */

// ?style=<id> opens one prototype large; ?t=<seconds> freezes time (for screenshots).
const QUERY = new URLSearchParams(window.location.search);
const FROZEN_T = QUERY.get("t") !== null && Number.isFinite(Number(QUERY.get("t"))) ? Number(QUERY.get("t")) : null;

const PICKS_KEY = "ai-gramam:style-lab:picks";
const NOTES_KEY = "ai-gramam:style-lab:notes";

function load<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(key);
    return v ? (JSON.parse(v) as T) : fallback;
  } catch {
    return fallback;
  }
}
function save(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {}
}

function StyleCanvas({ style, paused, speed = 1 }: { style: StyleProto; paused: boolean; speed?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    let visible = true;
    const io = new IntersectionObserver(([e]) => (visible = e.isIntersecting));
    io.observe(canvas);
    let raf = 0;
    let simT = 0;
    let last = performance.now();
    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      if (FROZEN_T !== null) simT = FROZEN_T;
      else if (!paused) simT += dt * speed;
      if (!visible) return;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const cw = Math.round(canvas.clientWidth * dpr);
      const ch = Math.round(canvas.clientHeight * dpr);
      if (canvas.width !== cw || canvas.height !== ch) {
        canvas.width = cw;
        canvas.height = ch;
      }
      ctx.setTransform(cw / W, 0, 0, ch / H, 0, 0);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = "source-over";
      ctx.shadowBlur = 0;
      ctx.filter = "none";
      try {
        ctx.save();
        style.draw(ctx, frameAt(style.fps ? stepTime(simT, style.fps) : simT));
        ctx.restore();
      } catch (e) {
        cancelAnimationFrame(raf);
        setError(e instanceof Error ? e.message : String(e));
      }
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      io.disconnect();
    };
  }, [style, paused, speed]);
  return (
    <div className="relative aspect-video w-full overflow-hidden rounded-xl ring-1 ring-white/10" style={{ background: style.bg }}>
      <canvas ref={ref} className="absolute inset-0 h-full w-full" />
      {error && <div className="absolute inset-0 grid place-items-center bg-black/80 p-4 text-center text-[12px] text-red-300">This prototype failed to draw: {error}</div>}
    </div>
  );
}

export default function StyleLab() {
  const [picks, setPicks] = useState<string[]>(() => load(PICKS_KEY, []));
  const [notes, setNotes] = useState<Record<string, string>>(() => load(NOTES_KEY, {}));
  const [open, setOpen] = useState<number | null>(() => {
    const i = STYLES.findIndex((s) => s.id === QUERY.get("style"));
    return i >= 0 ? i : null;
  });
  const [paused, setPaused] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => save(PICKS_KEY, picks), [picks]);
  useEffect(() => save(NOTES_KEY, notes), [notes]);

  const toggle = (id: string) => setPicks((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  const step = useCallback((d: number) => setOpen((o) => (o === null ? o : (o + d + STYLES.length) % STYLES.length)), []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === "TEXTAREA") return;
      if (e.key === "Escape") setOpen(null);
      else if (e.key === "ArrowRight") step(1);
      else if (e.key === "ArrowLeft") step(-1);
      else if (e.key === " ") { e.preventDefault(); setPaused((p) => !p); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [step]);

  const summary = () =>
    STYLES.filter((s) => picks.includes(s.id) || notes[s.id]?.trim())
      .map((s) => `${picks.includes(s.id) ? "★" : "·"} ${s.n}. ${s.name}${notes[s.id]?.trim() ? `: ${notes[s.id]!.trim()}` : ""}`)
      .join("\n");
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(summary() || "No picks yet");
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {}
  };

  const current = open === null ? null : STYLES[open];
  return (
    <div className="min-h-screen bg-[#0b1411] text-cream">
      <header className="sticky top-0 z-20 border-b border-white/8 bg-[#0b1411]/90 backdrop-blur">
        <div className="mx-auto flex max-w-[1400px] flex-wrap items-center gap-3 px-4 py-3">
          <a href="/" className="flex items-center gap-1.5 rounded-lg px-2 py-1 text-[13px] text-cream/70 hover:bg-white/10 hover:text-cream"><ArrowLeft size={15} /> Village</a>
          <div className="min-w-0 flex-1">
            <h1 className="font-display text-[17px] font-bold">Style lab <span className="text-brass">· {STYLES.length} prototypes</span></h1>
            <p className="text-[12px] text-cream/55">The same village scene in every style: Kuttan is working, Ammini needs approval, Raghu has finished. Star the ones you like and leave notes.</p>
          </div>
          <button onClick={() => setPaused((p) => !p)} className="flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-1.5 text-[12.5px] hover:bg-white/10">
            {paused ? <Play size={14} /> : <Pause size={14} />} {paused ? "Play all" : "Pause all"}
          </button>
          <button onClick={copy} className="flex items-center gap-1.5 rounded-lg bg-brass px-3 py-1.5 text-[12.5px] font-semibold text-ink hover:bg-brass/90">
            <Copy size={14} /> {copied ? "Copied" : `Copy my picks (${picks.length})`}
          </button>
        </div>
      </header>

      <main className="mx-auto grid max-w-[1400px] grid-cols-1 gap-5 px-4 py-5 md:grid-cols-2">
        {STYLES.map((s, i) => {
          const picked = picks.includes(s.id);
          return (
            <section key={s.id} className={`rounded-2xl border p-3 transition-colors ${picked ? "border-brass/60 bg-brass/[0.06]" : "border-white/8 bg-white/[0.02]"}`}>
              <button onClick={() => setOpen(i)} className="group relative block w-full text-left" aria-label={`Open ${s.name} large`}>
                <StyleCanvas style={s} paused={paused} />
                <span className="absolute right-2 top-2 grid h-7 w-7 place-items-center rounded-lg bg-black/50 text-cream/80 opacity-0 transition-opacity group-hover:opacity-100"><Maximize2 size={14} /></span>
              </button>
              <div className="mt-3 flex items-start gap-3">
                <div className="min-w-0 flex-1">
                  <h2 className="font-display text-[15px] font-bold"><span className="text-brass">{s.n}.</span> {s.name}{s.fps ? <span className="ml-2 align-middle text-[10.5px] font-normal text-cream/45">{s.fps} fps, choppy on purpose</span> : null}</h2>
                  <p className="mt-0.5 text-[12.5px] leading-snug text-cream/65">{s.blurb}</p>
                </div>
                <button onClick={() => toggle(s.id)} aria-pressed={picked} className={`flex shrink-0 items-center gap-1 rounded-lg px-2.5 py-1.5 text-[12px] ${picked ? "bg-brass text-ink" : "border border-white/12 text-cream/75 hover:bg-white/10"}`}>
                  <Star size={14} fill={picked ? "currentColor" : "none"} /> {picked ? "Picked" : "Pick"}
                </button>
              </div>
              <textarea
                value={notes[s.id] ?? ""}
                onChange={(e) => setNotes((n) => ({ ...n, [s.id]: e.target.value }))}
                placeholder="Notes (what to keep, what to change)…"
                rows={2}
                className="mt-2 w-full resize-y rounded-lg border border-white/10 bg-black/25 px-2.5 py-1.5 text-[12.5px] text-cream placeholder:text-cream/30 focus:border-brass/60 focus:outline-none"
              />
            </section>
          );
        })}
      </main>

      <AnimatePresence initial={!QUERY.get("style")}>
        {current && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-40 flex flex-col bg-black/92 p-4" onClick={() => setOpen(null)}>
            <div className="mx-auto flex w-full max-w-[1500px] items-center gap-3 pb-3" onClick={(e) => e.stopPropagation()}>
              <h2 className="flex-1 font-display text-[16px] font-bold"><span className="text-brass">{current.n}.</span> {current.name} <span className="ml-2 text-[12px] font-normal text-cream/50">← → to switch · Space to pause · Esc to close</span></h2>
              <button onClick={() => toggle(current.id)} className={`flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[12px] ${picks.includes(current.id) ? "bg-brass text-ink" : "border border-white/15 text-cream/80"}`}>
                <Star size={14} fill={picks.includes(current.id) ? "currentColor" : "none"} /> {picks.includes(current.id) ? "Picked" : "Pick"}
              </button>
              <button onClick={() => setOpen(null)} className="grid h-8 w-8 place-items-center rounded-lg text-cream/70 hover:bg-white/10" aria-label="Close"><X size={18} /></button>
            </div>
            <div className="relative mx-auto flex w-full max-w-[1500px] flex-1 items-center" onClick={(e) => e.stopPropagation()}>
              <button onClick={() => step(-1)} className="absolute -left-1 z-10 grid h-10 w-10 place-items-center rounded-full bg-white/10 hover:bg-white/20" aria-label="Previous style"><ChevronLeft /></button>
              <div className="mx-auto w-full max-w-[min(100%,calc((100vh-120px)*16/9))]">
                <StyleCanvas key={current.id} style={current} paused={paused} />
              </div>
              <button onClick={() => step(1)} className="absolute -right-1 z-10 grid h-10 w-10 place-items-center rounded-full bg-white/10 hover:bg-white/20" aria-label="Next style"><ChevronRight /></button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
