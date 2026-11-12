import type { ProjectView, SessionView } from "@shared/model";
import { elapsed, isUrgent, statusText, waitingOrder } from "@/lib/status";

interface Props {
  sessions: SessionView[];
  projects: ProjectView[];
  now: number;
  onSelect: (id: string) => void;
}

/** Top-of-screen alert listing every session that needs the user. */
export default function WaitingBanner({ sessions, projects, now, onSelect }: Props) {
  const waiting = sessions.filter((s) => s.status === "waiting").sort(waitingOrder);
  if (waiting.length === 0) return null;
  const urgent = waiting.some(isUrgent);
  const projectName = (id: string) => projects.find((p) => p.id === id)?.name ?? "";

  return (
    <div
      role="alert"
      aria-live="assertive"
      className={`flex shrink-0 items-center gap-2 overflow-x-auto border-b px-3 py-1.5 ${urgent ? "border-red-500 bg-red-950/90" : "border-amber-500/60 bg-amber-950/70"}`}
    >
      <span className={`text-lg ${urgent ? "animate-bounce" : ""}`} aria-hidden>🔔</span>
      <span className={`shrink-0 text-xs font-bold uppercase tracking-wider ${urgent ? "text-red-200" : "text-amber-200"}`}>
        {waiting.length === 1 ? "1 session needs you" : `${waiting.length} sessions need you`}
      </span>
      {waiting.map((s) => (
        <button
          key={s.id}
          onClick={() => onSelect(s.id)}
          className={`flex shrink-0 items-center gap-1.5 rounded border px-2 py-0.5 text-xs ${isUrgent(s) ? "border-red-400 bg-red-600 font-bold text-white shadow-[0_0_12px_#ef4444]" : "border-amber-500/60 bg-amber-900/60 text-amber-100"}`}
          title={`${s.title} · ${projectName(s.projectId)}`}
        >
          <span className="max-w-[16rem] truncate">{s.title}</span>
          <span className="opacity-80">· {projectName(s.projectId)}</span>
          <span className="opacity-90">· {statusText(s)}</span>
          <span className="opacity-70">{elapsed(s.statusSince, now)}</span>
        </button>
      ))}
    </div>
  );
}
