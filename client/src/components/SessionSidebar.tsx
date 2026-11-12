import type { ProjectView, SessionView } from "@shared/model";
import { STATUS_META, elapsed, isUrgent, statusText } from "@/lib/status";

interface Props {
  projects: ProjectView[];
  sessions: SessionView[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  now: number;
  emptyHint: string;
}

export function StatusChip({ s }: { s: Pick<SessionView, "status" | "waitingReason"> }) {
  const meta = STATUS_META[s.status];
  const urgent = isUrgent(s);
  return (
    <span
      className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-bold leading-none ${urgent ? "animate-pulse" : ""}`}
      style={{ color: urgent ? "#fff" : meta.color, backgroundColor: urgent ? "#dc2626" : meta.bg }}
    >
      <span aria-hidden>{meta.emoji}</span>
      {statusText(s)}
    </span>
  );
}

export default function SessionSidebar({ projects, sessions, selectedId, onSelect, now, emptyHint }: Props) {
  if (sessions.length === 0) {
    return <div className="p-4 text-center text-xs leading-relaxed text-gray-500 whitespace-pre-line">{emptyHint}</div>;
  }
  return (
    <div className="flex flex-col">
      {projects.map((p) => {
        const list = sessions.filter((s) => s.projectId === p.id);
        if (list.length === 0) return null;
        return (
          <section key={p.id} aria-label={`Project ${p.name}`}>
            <h3 className="sticky top-0 z-10 flex items-center justify-between border-b border-[#2a2440] bg-[#120f22] px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider text-[#c4b5fd]" title={p.root}>
              <span className="truncate">📁 {p.name}</span>
              <span className="text-gray-500">{list.length}</span>
            </h3>
            {list.map((s) => {
              const selected = s.id === selectedId;
              return (
                <button
                  key={s.id}
                  onClick={() => onSelect(s.id)}
                  className={`w-full border-b border-[#1a1a2e] px-3 py-2 text-left transition-colors ${selected ? "bg-[#221a3d] border-l-2 border-l-[#fbbf24]" : "hover:bg-[#16142a]"}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-xs font-bold text-white" title={s.title}>{s.title}</span>
                    <span className="shrink-0 text-[10px] text-gray-500" title="Time in this status">{elapsed(s.statusSince, now)}</span>
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-1">
                    <StatusChip s={s} />
                    {s.gitBranch && (
                      <span className="truncate rounded bg-[#1f2937] px-1.5 py-0.5 text-[10px] text-gray-300" title={`Git branch ${s.gitBranch}`}>
                        ⎇ {s.gitBranch}
                      </span>
                    )}
                    {s.subagents.filter((a) => a.status !== "finished").length > 0 && (
                      <span className="rounded bg-[#1e293b] px-1.5 py-0.5 text-[10px] text-sky-300">
                        🤝 {s.subagents.filter((a) => a.status !== "finished").length} subagent{s.subagents.length > 1 ? "s" : ""}
                      </span>
                    )}
                  </div>
                  {s.action && (
                    <div className="mt-1 truncate text-[11px] text-gray-300" title={s.action.label}>
                      <span aria-hidden>{s.action.emoji}</span> {s.action.label}
                    </div>
                  )}
                  {s.maybeNeedsApproval && (
                    <div className="mt-1 text-[10px] text-amber-300">⏳ Running {elapsed(s.action?.startedAt ?? s.statusSince, now)}: may be waiting for your approval</div>
                  )}
                </button>
              );
            })}
          </section>
        );
      })}
    </div>
  );
}
