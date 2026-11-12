import type { ProjectView, SessionView } from "@shared/model";
import { STATUS_META, clockTime, elapsed } from "@/lib/status";
import { StatusChip } from "./SessionSidebar";

interface Props {
  session: SessionView;
  project?: ProjectView;
  now: number;
  onClose: () => void;
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-2 text-[11px]">
      <span className="w-16 shrink-0 text-gray-500">{label}</span>
      <span className="min-w-0 break-words text-gray-200">{children}</span>
    </div>
  );
}

export default function SessionDetail({ session: s, project, now, onClose }: Props) {
  const sourceNote =
    s.source === "demo" ? "Demo data" : s.hooksActive ? "Live via hooks + transcript" : s.source === "bridge" ? "Remote bridge" : "Live via transcript";
  return (
    <aside className="flex h-full flex-col border-l border-[#4B0082] bg-[#0b0a18]" aria-label="Session details">
      <div className="flex items-start justify-between gap-2 border-b border-[#2a2440] p-3">
        <div className="min-w-0">
          <h2 className="break-words text-sm font-bold text-white">{s.title}</h2>
          <div className="mt-1"><StatusChip s={s} /></div>
        </div>
        <button onClick={onClose} className="text-gray-500 hover:text-white" aria-label="Close details">✕</button>
      </div>

      <div className="space-y-1.5 border-b border-[#2a2440] p-3">
        {s.action && (
          <div className="mb-2 rounded bg-[#16142a] px-2 py-1.5 text-xs text-white">
            <span aria-hidden>{s.action.emoji}</span> {s.action.label}
            <span className="ml-1 text-gray-500">({elapsed(s.action.startedAt, now)})</span>
          </div>
        )}
        <Row label="Project">{project?.name ?? "?"}</Row>
        {s.gitBranch && <Row label="Branch">⎇ {s.gitBranch}</Row>}
        <Row label="Folder"><span className="font-mono text-[10px]">{s.cwd}</span></Row>
        <Row label="Session"><span className="font-mono text-[10px]">{s.id}</span></Row>
        <Row label="Started">{clockTime(s.startedAt)} ({elapsed(s.startedAt, now)} ago)</Row>
        <Row label="Status for">{elapsed(s.statusSince, now)}</Row>
        <Row label="Source">{sourceNote}</Row>
        {s.prUrl && (
          <Row label="PR">
            <a href={s.prUrl} target="_blank" rel="noreferrer noopener" className="text-sky-300 underline">{s.prUrl.replace(/^https:\/\/github\.com\//, "")}</a>
          </Row>
        )}
        {s.maybeNeedsApproval && (
          <p className="pt-1 text-[11px] text-amber-300">⏳ This tool has been running a while and may be waiting for your approval. Install hooks (⚙️ Setup) for exact alerts.</p>
        )}
      </div>

      {s.subagents.length > 0 && (
        <div className="border-b border-[#2a2440] p-3">
          <h3 className="mb-1.5 text-[11px] font-bold uppercase tracking-wider text-sky-300">🤝 Subagents</h3>
          <ul className="space-y-1.5">
            {s.subagents.map((a) => (
              <li key={a.id} className="rounded bg-[#111827] px-2 py-1 text-[11px]">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-bold text-white">{a.agentType}</span>
                  <span style={{ color: STATUS_META[a.status].color }}>{STATUS_META[a.status].label}</span>
                </div>
                {a.description && <div className="text-gray-400">{a.description}</div>}
                {a.action && a.status !== "finished" && <div className="text-gray-300"><span aria-hidden>{a.action.emoji}</span> {a.action.label}</div>}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        <h3 className="mb-1.5 text-[11px] font-bold uppercase tracking-wider text-[#c4b5fd]">📜 Recent activity</h3>
        {s.recent.length === 0 ? (
          <p className="text-[11px] text-gray-500">No activity seen yet.</p>
        ) : (
          <ol className="space-y-1">
            {[...s.recent].reverse().map((r, i) => (
              <li key={`${r.at}-${i}`} className={`flex gap-2 text-[11px] ${r.level === "error" ? "text-red-300" : r.level === "warn" ? "text-amber-200" : "text-gray-300"}`}>
                <span className="shrink-0 font-mono text-[10px] text-gray-500">{clockTime(r.at)}</span>
                <span className="min-w-0 break-words">
                  <span aria-hidden>{r.emoji}</span> {r.agent && <span className="text-sky-300">[{r.agent}] </span>}{r.text}
                </span>
              </li>
            ))}
          </ol>
        )}
      </div>
    </aside>
  );
}
