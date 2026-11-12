import { AnimatePresence, motion } from "motion/react";
import { Bell, ChevronDown, Moon, Radio, Settings2, Sparkles, Sun, Sunrise, Sunset, Clock3, Globe2, Palette, Volume2, VolumeX } from "lucide-react";
import type { ProjectView, SessionView } from "@shared/model";
import type { WorldInfo } from "@shared/world";
import { elapsed, isUrgent, statusText, waitingOrder } from "@/lib/status";
import type { AppMode } from "@/hooks/useLiveSessions";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import BrandMark from "./BrandMark";
import { ART_STYLES } from "@/styles/live/registry";
import type { TimeMode } from "./useDisplayPrefs";

interface Props {
  sessions: SessionView[];
  projects: ProjectView[];
  worlds: WorldInfo[];
  world: WorldInfo | null;
  brokenPacks: number;
  onWorld: (id: string) => void;
  artStyle: string;
  onArtStyle: (id: string) => void;
  mode: AppMode;
  connected: boolean;
  onLive: () => void;
  onDemo: () => void;
  time: TimeMode;
  onTime: (t: TimeMode) => void;
  sound: boolean;
  onSound: (on: boolean) => void;
  onSelect: (id: string) => void;
  onSettings: (tab?: string) => void;
  onDecide: (approvalId: string, decision: "allow" | "deny") => void;
  now: number;
}

const TIME_OPTIONS: Array<{ id: TimeMode; label: string; Icon: typeof Sun }> = [
  { id: "auto", label: "Follow my clock", Icon: Clock3 },
  { id: "dawn", label: "Dawn", Icon: Sunrise },
  { id: "day", label: "Day", Icon: Sun },
  { id: "dusk", label: "Dusk", Icon: Sunset },
  { id: "night", label: "Night", Icon: Moon },
];

export default function TopBar(p: Props) {
  const waiting = p.sessions.filter((s) => s.status === "waiting").sort(waitingOrder);
  const working = p.sessions.filter((s) => s.status === "working").length;
  const idle = p.sessions.filter((s) => s.status === "idle" || s.status === "finished").length;
  const projectName = (id: string) => p.projects.find((x) => x.id === id)?.name ?? "";
  const TimeIcon = TIME_OPTIONS.find((t) => t.id === p.time)?.Icon ?? Clock3;

  return (
    <header className="pointer-events-none absolute inset-x-0 top-0 z-30 flex items-start gap-3 p-3">
      {/* Brand */}
      <motion.div initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }} className="glass pointer-events-auto flex shrink-0 items-center gap-2.5 rounded-2xl py-1.5 pl-1.5 pr-4">
        <BrandMark />
        <div className="leading-tight">
          <div className="font-display text-[17px] font-bold tracking-tight text-cream">
            Ai <span className="text-brass">Gramam</span>
          </div>
          <div className="text-[11px] text-cream/60">your agents' village</div>
        </div>
      </motion.div>

      {/* Needs-you rail */}
      <div className="flex min-w-0 flex-1 justify-center">
        <AnimatePresence initial={false}>
          {waiting.length > 0 && (
            <motion.div
              key="rail"
              initial={{ opacity: 0, y: -16, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -16, scale: 0.96 }}
              transition={{ type: "spring", stiffness: 320, damping: 26 }}
              role="alert"
              aria-live="assertive"
              className={`glass pointer-events-auto flex max-w-full items-center gap-2 overflow-x-auto rounded-2xl px-2 py-1.5 ${waiting.some(isUrgent) ? "ring-1 ring-urgent/70 shadow-[0_0_30px_rgba(255,90,79,0.35)]" : ""}`}
            >
              <motion.span
                animate={waiting.some(isUrgent) ? { rotate: [0, -14, 12, -8, 6, 0] } : { rotate: 0 }}
                transition={{ repeat: Infinity, duration: 1.4, repeatDelay: 0.8 }}
                className={`grid h-7 w-7 shrink-0 place-items-center rounded-xl ${waiting.some(isUrgent) ? "bg-urgent text-white" : "bg-wait text-ink"}`}
              >
                <Bell size={15} strokeWidth={2.5} />
              </motion.span>
              <span className="shrink-0 pr-1 text-xs font-semibold text-cream">{waiting.length === 1 ? "1 needs you" : `${waiting.length} need you`}</span>
              <AnimatePresence initial={false}>
                {waiting.map((s) => (
                  <motion.button
                    layout
                    key={s.id}
                    initial={{ opacity: 0, x: 12 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -12 }}
                    onClick={() => p.onSelect(s.id)}
                    className={`flex shrink-0 items-center gap-1.5 rounded-xl px-2.5 py-1 text-xs transition-transform hover:-translate-y-0.5 ${isUrgent(s) ? "bg-urgent font-semibold text-white" : "bg-wait/90 font-medium text-ink"}`}
                    title={`${s.title} · ${projectName(s.projectId)}`}
                  >
                    <span className="max-w-[14rem] truncate">{s.title}</span>
                    <span className="opacity-75">· {statusText(s)}</span>
                    <span className="tabular-nums opacity-70">{elapsed(s.statusSince, p.now)}</span>
                    {s.link?.approval && !s.link.approval.questions && (
                      <span className="ml-1 flex gap-1" onClick={(ev) => ev.stopPropagation()}>
                        <span role="button" tabIndex={0} aria-label="Approve" title="Approve once" onClick={() => p.onDecide(s.link!.approval!.id, "allow")} className="grid h-5 w-5 place-items-center rounded-md bg-white/90 text-[11px] font-bold text-ink hover:bg-white">✓</span>
                        <span role="button" tabIndex={0} aria-label="Deny" title="Deny" onClick={() => p.onDecide(s.link!.approval!.id, "deny")} className="grid h-5 w-5 place-items-center rounded-md bg-black/30 text-[11px] font-bold text-white hover:bg-black/50">✕</span>
                      </span>
                    )}
                  </motion.button>
                ))}
              </AnimatePresence>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Controls */}
      <motion.div initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }} className="glass pointer-events-auto flex shrink-0 items-center gap-1 rounded-2xl p-1.5">
        <div className="hidden items-center gap-1 px-1 lg:flex" aria-label="Session counts">
          <span className="chip bg-work/15 text-work"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-work" />{working} working</span>
          <span className={`chip ${waiting.length ? "bg-wait/20 text-wait" : "bg-white/5 text-cream/50"}`}>{waiting.length} waiting</span>
          <span className="chip bg-white/5 text-cream/60">{idle} idle</span>
        </div>

        {/* Place: which world the village is in. With an art style chosen, the place is drawn in that style. */}
        <DropdownMenu>
          <DropdownMenuTrigger className="flex items-center gap-1.5 rounded-xl px-2.5 py-1.5 text-xs font-semibold text-cream hover:bg-white/10" aria-label="Place" title="Place (world)">
            <Globe2 size={15} className="text-brass" />
            <span className="max-w-[9rem] truncate">{p.world?.name ?? "Place"}</span>
            {p.brokenPacks > 0 && <span className="chip bg-urgent/20 text-urgent">{p.brokenPacks}!</span>}
            <ChevronDown size={14} className="opacity-60" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="glass-strong w-64 rounded-xl text-cream">
            <DropdownMenuLabel className="text-xs text-cream/60">Places</DropdownMenuLabel>
            {p.worlds.map((w) => (
              <DropdownMenuItem key={w.id} onClick={() => p.onWorld(w.id)} className="flex flex-col items-start gap-0 rounded-lg">
                <span className={`text-sm font-semibold ${w.id === p.world?.id ? "text-brass" : ""}`}>{w.name}</span>
                <span className="text-[11px] text-cream/55">by {w.author} · {w.license}</span>
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => p.onSettings("worlds")} className="rounded-lg text-xs">
              Manage places{p.brokenPacks ? ` (${p.brokenPacks} couldn't load)` : ""}…
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Art style: how the village is drawn. */}
        <DropdownMenu>
          <DropdownMenuTrigger className="flex items-center gap-1.5 rounded-xl px-2.5 py-1.5 text-xs font-semibold text-cream hover:bg-white/10" aria-label="Art style" title="Art style">
            <Palette size={15} className="text-brass" />
            <span className="max-w-[8rem] truncate">{ART_STYLES.find((a) => a.id === p.artStyle)?.name ?? "World art"}</span>
            <ChevronDown size={14} className="opacity-60" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="glass-strong w-64 rounded-xl text-cream">
            <DropdownMenuLabel className="text-xs text-cream/60">Art style</DropdownMenuLabel>
            <DropdownMenuItem onClick={() => p.onArtStyle("classic")} className="flex flex-col items-start gap-0 rounded-lg">
              <span className={`text-sm font-semibold ${!ART_STYLES.some((a) => a.id === p.artStyle) ? "text-brass" : ""}`}>World art</span>
              <span className="text-[11px] text-cream/55">The place's own illustrated art ({p.world?.name ?? "the chosen place"}).</span>
            </DropdownMenuItem>
            {ART_STYLES.map((a) => (
              <DropdownMenuItem key={a.id} onClick={() => p.onArtStyle(a.id)} className="flex flex-col items-start gap-0 rounded-lg">
                <span className={`text-sm font-semibold ${a.id === p.artStyle ? "text-brass" : ""}`}>{a.name}</span>
                <span className="text-[11px] text-cream/55">{a.blurb}</span>
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => { window.location.href = "/styles"; }} className="rounded-lg text-xs text-cream/70">
              Compare styles in the Style lab…
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <button
          onClick={() => p.onSound(!p.sound)}
          className="grid h-8 w-8 place-items-center rounded-xl text-cream hover:bg-white/10"
          aria-label={p.sound ? "Sound on: mute alerts" : "Sound off: turn alerts on"}
          aria-pressed={p.sound}
          title={p.sound ? "Sound cues on (click to mute)" : "Sound cues muted (click to turn on)"}
        >
          {p.sound ? <Volume2 size={16} /> : <VolumeX size={16} className="text-cream/50" />}
        </button>

        <DropdownMenu>
          <DropdownMenuTrigger className="grid h-8 w-8 place-items-center rounded-xl text-cream hover:bg-white/10" aria-label="Time of day" title="Time of day">
            <TimeIcon size={16} />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="glass-strong rounded-xl text-cream">
            <DropdownMenuLabel className="text-xs text-cream/60">Time of day</DropdownMenuLabel>
            {TIME_OPTIONS.map(({ id, label, Icon }) => (
              <DropdownMenuItem key={id} onClick={() => p.onTime(id)} className={`gap-2 rounded-lg ${p.time === id ? "text-brass" : ""}`}>
                <Icon size={15} /> {label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <div className="relative flex rounded-xl bg-black/25 p-0.5" role="group" aria-label="Mode">
          {(["live", "demo"] as const).map((m) => (
            <button key={m} onClick={m === "live" ? p.onLive : p.onDemo} aria-pressed={p.mode === m} className="relative z-10 flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-semibold text-cream">
              {p.mode === m && <motion.span layoutId="mode-pill" className="absolute inset-0 -z-10 rounded-lg bg-brass/90" transition={{ type: "spring", stiffness: 420, damping: 32 }} />}
              <span className={p.mode === m ? "text-ink" : "text-cream/70"}>
                {m === "live" ? <span className="flex items-center gap-1"><Radio size={13} /> Live</span> : <span className="flex items-center gap-1"><Sparkles size={13} /> Demo</span>}
              </span>
            </button>
          ))}
        </div>

        <span className={`mx-1 h-2 w-2 rounded-full ${p.connected ? "bg-work shadow-[0_0_8px_#5eead4]" : "bg-urgent"}`} title={p.connected ? "Connected" : "Reconnecting…"} aria-label={p.connected ? "Connected" : "Reconnecting"} />

        <button onClick={() => p.onSettings()} className="grid h-8 w-8 place-items-center rounded-xl text-cream hover:bg-white/10" aria-label="Settings" title="Settings">
          <Settings2 size={16} />
        </button>
      </motion.div>
    </header>
  );
}
