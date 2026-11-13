import { AnimatePresence, motion } from "motion/react";
import { ChevronDown, ClipboardList } from "lucide-react";
import type { ProjectView, SessionView } from "@shared/model";
import { noticesOf, urgentCount, type NoticeTone } from "./notices";

interface Props {
  sessions: SessionView[];
  projects: ProjectView[];
  now: number;
  open: boolean;
  onToggle: () => void;
  onSelect: (sessionId: string) => void;
  onHover: (sessionId: string | null) => void;
  /** Opens the "how to read the village" guide. */
  onLegend?: () => void;
}

const PIN: Record<NoticeTone, string> = { urgent: "bg-urgent", error: "bg-urgent/70", wait: "bg-wait", done: "bg-work" };
const HEAD: Record<NoticeTone, string> = { urgent: "text-urgent", error: "text-red-200", wait: "text-wait", done: "text-work" };

/** The village notice board: approvals, questions, errors, your turn and recently done, pinned in the world. */
export default function NoticeBoard(p: Props) {
  const sections = noticesOf(p.sessions, p.projects, p.now);
  const urgent = urgentCount(sections);
  const total = sections.reduce((n, s) => n + s.items.length + s.more, 0);
  return (
    <motion.aside
      initial={{ opacity: 0, y: -12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 300, damping: 30 }}
      className="pointer-events-auto absolute right-3 top-[68px] z-20 w-[300px] max-w-[calc(100vw-24px)] overflow-hidden rounded-2xl border border-[#6b4a22] bg-[linear-gradient(160deg,#4a331a,#36240f)] text-cream shadow-[0_10px_30px_rgba(0,0,0,0.45),inset_0_1px_0_rgba(255,220,160,0.15)]"
      aria-label="Village notice board"
    >
      <button onClick={p.onToggle} className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left hover:bg-white/5" aria-expanded={p.open}>
        <span className="flex items-center gap-2">
          <ClipboardList size={15} className="text-brass" />
          <span className="font-display text-sm font-semibold">Notice board</span>
          {urgent > 0 ? (
            <span className="chip bg-urgent text-white">{urgent} need{urgent === 1 ? "s" : ""} you</span>
          ) : total > 0 ? (
            <span className="chip bg-black/25 text-cream/75">{total}</span>
          ) : null}
        </span>
        <motion.span animate={{ rotate: p.open ? 0 : 180 }}><ChevronDown size={16} className="text-cream/60" /></motion.span>
      </button>
      <AnimatePresence initial={false}>
        {p.open && (
          <motion.div
            key="notices"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ type: "spring", stiffness: 260, damping: 30 }}
            className="max-h-[min(52vh,460px)] overflow-y-auto border-t border-black/30 px-2.5 pb-2.5 pt-1.5"
          >
            {p.onLegend && (
              <button onClick={p.onLegend} className="mt-1 text-[11.5px] text-brass underline underline-offset-2 hover:brightness-125">How to read the village</button>
            )}
            {sections.length === 0 && <p className="px-1 py-2 text-[12px] text-cream/60">Nothing pinned: no approvals, questions or errors, and nothing finished in the last 2 hours.</p>}
            {sections.map((sec) => (
              <section key={sec.id} className="mt-1.5" aria-label={sec.title}>
                <h3 className={`px-1 text-[10.5px] font-semibold uppercase tracking-[0.12em] ${HEAD[sec.tone]}`}>{sec.title}</h3>
                <ul className="mt-1 space-y-1.5">
                  {sec.items.map((n, i) => (
                    <li key={n.sessionId}>
                      <button
                        onClick={() => p.onSelect(n.sessionId)}
                        onMouseEnter={() => p.onHover(n.sessionId)}
                        onMouseLeave={() => p.onHover(null)}
                        onFocus={() => p.onHover(n.sessionId)}
                        onBlur={() => p.onHover(null)}
                        className="relative block w-full rounded-md bg-[#f3e6c8] px-2.5 pb-1.5 pt-2 text-left text-ink shadow-[0_2px_4px_rgba(0,0,0,0.35)] transition-transform hover:-translate-y-0.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brass"
                        style={{ rotate: `${((i % 3) - 1) * 0.6}deg` }}
                      >
                        <span className={`absolute left-1/2 top-0.5 h-2 w-2 -translate-x-1/2 rounded-full shadow ${PIN[sec.tone]}`} aria-hidden />
                        <span className="block truncate text-[12px] font-semibold">{n.title}</span>
                        <span className="block truncate text-[11px] text-ink/70">{n.project}</span>
                        <span className="mt-0.5 block line-clamp-2 text-[11.5px] leading-snug text-ink/85">{n.text}</span>
                      </button>
                    </li>
                  ))}
                </ul>
                {sec.more > 0 && <p className="mt-1 px-1 text-[11px] text-cream/55">and {sec.more} more (see Workspace → Overview)</p>}
              </section>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.aside>
  );
}
