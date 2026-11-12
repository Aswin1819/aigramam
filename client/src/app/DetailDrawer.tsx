import { motion } from "motion/react";
import { ExternalLink, Folder, GitBranch, Hash, Clock, X, Radio, Crosshair } from "lucide-react";
import type { ProjectView, SessionView } from "@shared/model";
import type { CharacterInfo } from "@shared/character";
import Avatar from "@/components/Avatar";
import { STATUS_META, clockTime, elapsed, isUrgent, statusColor, statusText } from "@/lib/status";

interface Props {
  session: SessionView;
  project?: ProjectView;
  character: CharacterInfo | null;
  now: number;
  onClose: () => void;
  onFocus: () => void;
  onSetupAlerts: () => void;
}

function Meta({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2 text-[12px]">
      <span className="mt-0.5 text-cream/40">{icon}</span>
      <span className="w-14 shrink-0 text-cream/45">{label}</span>
      <span className="min-w-0 break-words text-cream/90">{children}</span>
    </div>
  );
}

/** Slide-in panel with everything about one session. */
export default function DetailDrawer({ session: s, project, character, now, onClose, onFocus, onSetupAlerts }: Props) {
  const color = statusColor(s);
  const urgent = isUrgent(s);
  const source = s.source === "demo" ? "Demo data" : s.hooksActive ? "Live · hooks + transcript" : s.source === "bridge" ? "Remote bridge" : "Live · transcript";
  return (
    <motion.aside
      key="drawer"
      initial={{ x: 420, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: 420, opacity: 0 }}
      transition={{ type: "spring", stiffness: 280, damping: 32 }}
      className="glass-strong pointer-events-auto absolute bottom-3 right-3 top-[76px] z-20 flex w-[380px] max-w-[calc(100vw-24px)] flex-col overflow-hidden rounded-2xl"
      aria-label="Session details"
    >
      {/* Header */}
      <div className="relative overflow-hidden border-b border-white/8 p-4">
        <div className="pointer-events-none absolute -right-10 -top-16 h-44 w-44 rounded-full opacity-30 blur-3xl" style={{ background: color }} />
        <div className="relative flex items-start gap-3">
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="grid h-[92px] w-16 shrink-0 place-items-end rounded-xl bg-gradient-to-b from-white/10 to-white/0 ring-1 ring-white/10"
          >
            <Avatar character={character} size={84} anim={s.status === "waiting" ? "wait" : s.status === "error" ? "error" : s.status === "finished" ? "celebrate" : "idle"} />
          </motion.div>
          <div className="min-w-0 flex-1">
            <h2 className="break-words font-display text-[17px] font-bold leading-snug text-cream">{s.title}</h2>
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              <span className={`chip ${urgent ? "animate-pulse text-white" : ""}`} style={{ background: urgent ? color : STATUS_META[s.status].bg, color: urgent ? "#fff" : color }}>
                {STATUS_META[s.status].emoji} {statusText(s)}
              </span>
              <span className="text-[11px] tabular-nums text-cream/50">for {elapsed(s.statusSince, now)}</span>
            </div>
            {character && <div className="mt-1 text-[11px] text-cream/45">Shown as {character.name}</div>}
          </div>
          <div className="flex flex-col gap-1">
            <button onClick={onClose} className="grid h-7 w-7 place-items-center rounded-lg text-cream/60 hover:bg-white/10 hover:text-cream" aria-label="Close details"><X size={16} /></button>
            <button onClick={onFocus} className="grid h-7 w-7 place-items-center rounded-lg text-cream/60 hover:bg-white/10 hover:text-cream" aria-label="Find in the world" title="Find in the world"><Crosshair size={15} /></button>
          </div>
        </div>
        {s.action && (
          <motion.div layout key={s.action.label} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="relative mt-3 flex items-center gap-2 rounded-xl border border-white/10 bg-black/25 px-3 py-2">
            <span className="text-lg" aria-hidden>{s.action.emoji}</span>
            <span className="min-w-0 flex-1 text-[13px] font-medium text-cream">{s.action.label}</span>
            <span className="text-[11px] tabular-nums text-cream/50">{elapsed(s.action.startedAt, now)}</span>
          </motion.div>
        )}
        {s.maybeNeedsApproval && (
          <p className="relative mt-2 text-[11.5px] leading-snug text-wait">
            ⏳ This has been running a while and may be waiting for your approval.{" "}
            <button onClick={onSetupAlerts} className="underline underline-offset-2">Turn on exact alerts</button>
          </p>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="space-y-1.5 border-b border-white/8 p-4">
          <Meta icon={<Folder size={13} />} label="Project">{project?.name ?? "?"} <span className="block font-mono text-[10.5px] text-cream/45">{s.cwd}</span></Meta>
          {s.gitBranch && <Meta icon={<GitBranch size={13} />} label="Branch">{s.gitBranch}</Meta>}
          <Meta icon={<Clock size={13} />} label="Started">{clockTime(s.startedAt)} · {elapsed(s.startedAt, now)} ago</Meta>
          <Meta icon={<Radio size={13} />} label="Source">{source}</Meta>
          <Meta icon={<Hash size={13} />} label="Session"><span className="font-mono text-[10.5px]">{s.id}</span></Meta>
          {s.prUrl && (
            <Meta icon={<ExternalLink size={13} />} label="PR">
              <a href={s.prUrl} target="_blank" rel="noreferrer noopener" className="text-sky-300 underline underline-offset-2">{s.prUrl.replace(/^https:\/\/github\.com\//, "")}</a>
            </Meta>
          )}
        </div>

        {s.subagents.length > 0 && (
          <div className="border-b border-white/8 p-4">
            <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-sky-300">Subagents</h3>
            <ul className="space-y-1.5">
              {s.subagents.map((a) => (
                <motion.li layout key={a.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="rounded-xl border border-sky-300/15 bg-sky-950/30 px-3 py-2 text-[12px]">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-cream">🤝 {a.agentType}</span>
                    <span className="text-[11px]" style={{ color: STATUS_META[a.status].color }}>{STATUS_META[a.status].label}</span>
                  </div>
                  {a.description && <div className="text-cream/60">{a.description}</div>}
                  {a.action && a.status === "working" && <div className="mt-0.5 text-cream/80">{a.action.emoji} {a.action.label}</div>}
                </motion.li>
              ))}
            </ul>
          </div>
        )}

        <div className="p-4">
          <h3 className="mb-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-brass/90">Activity</h3>
          {s.recent.length === 0 ? (
            <p className="text-[12px] text-cream/50">Nothing yet.</p>
          ) : (
            <ol className="relative ml-1.5 space-y-2.5 border-l border-white/10 pl-4">
              {[...s.recent].reverse().map((r, i) => (
                <motion.li key={`${r.at}-${r.text}-${i}`} initial={i === 0 ? { opacity: 0, x: -6 } : false} animate={{ opacity: 1, x: 0 }} className="relative text-[12px]">
                  <span
                    className="absolute -left-[21px] top-1.5 h-2 w-2 rounded-full ring-2 ring-[#13221e]"
                    style={{ background: r.level === "error" ? "#ff5a4f" : r.level === "warn" ? "#f5b33d" : i === 0 ? "#5eead4" : "rgba(255,248,231,0.35)" }}
                  />
                  <div className={r.level === "error" ? "text-red-300" : r.level === "warn" ? "text-amber-200" : "text-cream/85"}>
                    <span aria-hidden>{r.emoji}</span> {r.agent && <span className="text-sky-300">{r.agent} · </span>}{r.text}
                  </div>
                  <div className="font-mono text-[10px] text-cream/35">{clockTime(r.at)}</div>
                </motion.li>
              ))}
            </ol>
          )}
        </div>
      </div>
    </motion.aside>
  );
}
