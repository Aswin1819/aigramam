import type { ReactNode } from "react";
import { motion } from "motion/react";
import type { SessionView } from "@shared/model";
import { STATUS_META, elapsed, statusColor, statusText } from "@/lib/status";

/** One session in a Workspace list: status, action, branch, subagents, linked or not. Click or Enter opens it. */
export default function SessionRow({ s, project, now, selected, onSelect, extra }: { s: SessionView; project: string; now: number; selected: boolean; onSelect: () => void; extra?: ReactNode }) {
  const color = statusColor(s);
  const helpers = s.subagents.filter((x) => x.status === "working" || x.status === "waiting").length;
  return (
    <motion.div
      layout
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), onSelect())}
      className={`flex cursor-pointer items-center gap-3 rounded-xl border px-3 py-2 ${selected ? "border-brass/60 bg-brass/10" : "border-white/8 bg-black/15 hover:bg-white/5"}`}
    >
      <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: color, boxShadow: `0 0 8px ${color}` }} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-[13px] font-semibold text-cream">{s.title}</span>
          <span className="shrink-0 text-[11px] text-cream/45">{project}</span>
        </div>
        <div className="truncate text-[12px] text-cream/65">
          <span style={{ color }}>{STATUS_META[s.status].emoji} {statusText(s)}</span>
          {s.action && <span> · {s.action.label}</span>}
        </div>
        <div className="mt-0.5 flex flex-wrap gap-x-3 text-[10.5px] text-cream/40">
          <span>for {elapsed(s.statusSince, now)}</span>
          {s.gitBranch && <span>⎇ {s.gitBranch}</span>}
          {helpers > 0 && <span>{helpers} subagent{helpers > 1 ? "s" : ""}</span>}
          {s.link?.connected ? <span className="text-work">linked</span> : <span>not linked</span>}
        </div>
      </div>
      {extra && <div className="shrink-0">{extra}</div>}
    </motion.div>
  );
}
