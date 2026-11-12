import { AnimatePresence, motion } from "motion/react";
import { ChevronDown, GitBranch, Users } from "lucide-react";
import type { ProjectView, SessionView } from "@shared/model";
import type { CharacterInfo } from "@shared/character";
import type { WorldInfo } from "@shared/world";
import Avatar from "@/components/Avatar";
import { attentionOrder, elapsed, isUrgent, statusColor, statusText } from "@/lib/status";
import { pickCharacter } from "@/world/characters";

interface Props {
  sessions: SessionView[];
  projects: ProjectView[];
  world: WorldInfo | null;
  characters: CharacterInfo[];
  selectedId: string | null;
  open: boolean;
  onToggle: () => void;
  onSelect: (id: string) => void;
  onHover: (id: string | null) => void;
  now: number;
  emptyHint: string;
}

/** Floating list of live sessions, grouped by project, "needs you" first. */
export default function SessionDock(p: Props) {
  const groups = p.projects
    .map((proj) => ({ proj, list: p.sessions.filter((s) => s.projectId === proj.id).sort(attentionOrder) }))
    .filter((g) => g.list.length)
    .sort((a, b) => attentionOrder(a.list[0], b.list[0]) || a.proj.name.localeCompare(b.proj.name));

  return (
    <motion.aside
      layout
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ type: "spring", stiffness: 300, damping: 30 }}
      className="glass pointer-events-auto absolute bottom-3 left-3 z-20 flex w-[340px] max-w-[calc(100vw-24px)] flex-col overflow-hidden rounded-2xl"
      style={{ maxHeight: p.open ? "min(62vh, 560px)" : undefined }}
      aria-label="Live sessions"
    >
      <button onClick={p.onToggle} className="flex items-center justify-between gap-2 px-3.5 py-2.5 text-left hover:bg-white/5" aria-expanded={p.open}>
        <span className="flex items-center gap-2">
          <Users size={15} className="text-brass" />
          <span className="text-sm font-semibold text-cream">Sessions</span>
          <span className="chip bg-white/8 text-cream/70">{p.sessions.length}</span>
          {p.projects.length > 0 && <span className="text-[11px] text-cream/50">in {groups.length} project{groups.length === 1 ? "" : "s"}</span>}
        </span>
        <motion.span animate={{ rotate: p.open ? 0 : 180 }}><ChevronDown size={16} className="text-cream/60" /></motion.span>
      </button>

      <AnimatePresence initial={false}>
        {p.open && (
          <motion.div
            key="list"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ type: "spring", stiffness: 260, damping: 30 }}
            className="min-h-0 overflow-y-auto border-t border-white/8"
          >
            {p.sessions.length === 0 && <p className="whitespace-pre-line px-4 py-5 text-center text-xs leading-relaxed text-cream/55">{p.emptyHint}</p>}
            {groups.map(({ proj, list }) => (
              <section key={proj.id} aria-label={`Project ${proj.name}`} className="pb-1">
                <h3 className="sticky top-0 z-10 flex items-center justify-between bg-[#12211d]/95 px-3.5 py-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-brass/90 backdrop-blur" title={proj.root}>
                  <span className="truncate">{proj.name}</span>
                  <span className="text-cream/40">{list.length}</span>
                </h3>
                <AnimatePresence initial={false}>
                  {list.map((s) => {
                    const selected = s.id === p.selectedId;
                    const color = statusColor(s);
                    return (
                      <motion.button
                        layout
                        key={s.id}
                        initial={{ opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, x: -20, transition: { duration: 0.2 } }}
                        transition={{ type: "spring", stiffness: 380, damping: 32 }}
                        onClick={() => p.onSelect(s.id)}
                        onMouseEnter={() => p.onHover(s.id)}
                        onMouseLeave={() => p.onHover(null)}
                        className={`group relative mx-1.5 mb-0.5 flex w-[calc(100%-12px)] items-center gap-2.5 rounded-xl px-2 py-1.5 text-left transition-colors ${selected ? "bg-brass/15 ring-1 ring-brass/60" : "hover:bg-white/6"}`}
                      >
                        <span className="absolute inset-y-2 left-0 w-[3px] rounded-full" style={{ background: color, boxShadow: isUrgent(s) ? `0 0 10px ${color}` : undefined }} />
                        <div className="grid h-10 w-8 shrink-0 place-items-end rounded-lg bg-white/5">
                          <Avatar character={pickCharacter(s.id, p.world, p.characters)} size={36} anim={s.status === "waiting" ? "wait" : s.status === "error" ? "error" : "idle"} />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-2">
                            <span className="truncate text-[13px] font-semibold text-cream">{s.title}</span>
                            <span className="shrink-0 text-[10.5px] tabular-nums text-cream/45">{elapsed(s.statusSince, p.now)}</span>
                          </div>
                          <div className="flex items-center gap-1.5 text-[11.5px]">
                            <span className="shrink-0 font-semibold" style={{ color }}>{statusText(s)}</span>
                            {s.action && <span className="truncate text-cream/65">· {s.action.label}</span>}
                          </div>
                          {(s.gitBranch || s.subagents.some((a) => a.status !== "finished") || s.maybeNeedsApproval) && (
                            <div className="mt-0.5 flex items-center gap-1.5 text-[10.5px] text-cream/50">
                              {s.gitBranch && <span className="flex min-w-0 items-center gap-0.5 truncate"><GitBranch size={11} />{s.gitBranch}</span>}
                              {s.subagents.some((a) => a.status !== "finished") && <span className="text-sky-300">🤝 {s.subagents.filter((a) => a.status !== "finished").length}</span>}
                              {s.maybeNeedsApproval && <span className="text-wait">⏳ may need approval</span>}
                            </div>
                          )}
                        </div>
                      </motion.button>
                    );
                  })}
                </AnimatePresence>
              </section>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.aside>
  );
}
