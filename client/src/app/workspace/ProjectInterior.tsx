/**
 * Inside a project's building: its Git state and recent sessions from the
 * history, both read-only and from what Git and the transcripts report.
 */
import { GitBranch, History } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { LAST_EVENT_LABEL, dateTime, duration } from "./history";

const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? "" : "s"}`;

export function ProjectGit({ projectId, demo }: { projectId: string; demo: boolean }) {
  const status = trpc.git.status.useQuery({ projectId }, { enabled: !demo, staleTime: 10_000, refetchInterval: 30_000, retry: false });
  if (demo) return null;
  const d = status.data;
  return (
    <section className="mt-3 rounded-xl border border-white/8 bg-black/20 px-3 py-2 text-[12px]" aria-label="Git">
      <div className="flex items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-[0.12em] text-brass/90"><GitBranch size={12} /> Git</div>
      {status.isLoading ? (
        <p className="mt-1 text-cream/50">Reading Git status…</p>
      ) : status.isError ? (
        <p className="mt-1 text-cream/60">Couldn't read Git status: {status.error.message}</p>
      ) : d && !d.available ? (
        <p className="mt-1 text-cream/60">{d.message}</p>
      ) : d ? (
        <div className="mt-1 space-y-0.5 text-cream/80">
          <div>
            {d.detached ? "Detached HEAD" : <>On <b className="text-cream">{d.branch ?? "an unnamed branch"}</b></>}
            {d.upstream && d.ahead !== null && d.behind !== null && (
              <span className="text-cream/60"> · {d.ahead === 0 && d.behind === 0 ? `up to date with ${d.upstream}` : `${d.ahead} ahead, ${d.behind} behind ${d.upstream}`}</span>
            )}
            {!d.upstream && <span className="text-cream/50"> · no upstream</span>}
          </div>
          <div>{d.totalFiles === 0 ? "No uncommitted changes" : `${plural(d.totalFiles, "changed file")} (open a session's Changes tab for diffs)`}</div>
          {d.lastCommit && <div className="truncate text-cream/60" title={d.lastCommit.subject}>Last commit {d.lastCommit.relative}: {d.lastCommit.subject}</div>}
        </div>
      ) : null}
    </section>
  );
}

export function ProjectRecent({ projectId, demo, liveIds, onSelectSession }: { projectId: string; demo: boolean; liveIds: Set<string>; onSelectSession: (id: string) => void }) {
  const list = trpc.history.list.useQuery(undefined, { enabled: !demo, staleTime: 15_000, refetchInterval: (q) => (q.state.data?.scanning ? 2_000 : 60_000) });
  if (demo) return null;
  const sessions = (list.data?.sessions ?? []).filter((s) => s.projectId === projectId).slice(0, 5);
  const scanning = list.data?.scanning;
  return (
    <section className="mt-4" aria-label="Recent history">
      <h3 className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-brass/90"><History size={12} /> Recent history</h3>
      {list.isLoading || (scanning && sessions.length === 0) ? (
        <p className="text-[12px] text-cream/50">Reading transcripts{scanning ? ` (${scanning.done} of ${scanning.total})` : ""}…</p>
      ) : sessions.length === 0 ? (
        <p className="text-[12px] text-cream/50">No recorded sessions for this project are still on disk.</p>
      ) : (
        <ul className="space-y-1">
          {sessions.map((s) => {
            const live = liveIds.has(s.id);
            const body = (
              <>
                <span className="block truncate text-[12.5px] font-semibold text-cream">{s.title}</span>
                <span className="block text-[11.5px] text-cream/60">
                  {dateTime(s.lastActivityAt)} · {plural(s.prompts, "message")} · {plural(s.toolCalls, "tool call")} · active {duration(s.activeMs)}
                </span>
                <span className="block text-[11px] text-cream/45">{live ? "Running now: open it" : LAST_EVENT_LABEL[s.lastEvent]}</span>
              </>
            );
            return (
              <li key={s.id}>
                {live ? (
                  <button onClick={() => onSelectSession(s.id)} className="block w-full rounded-lg border border-white/8 bg-black/15 px-2.5 py-1.5 text-left hover:bg-white/5">{body}</button>
                ) : (
                  <div className="rounded-lg border border-white/8 bg-black/15 px-2.5 py-1.5">{body}</div>
                )}
              </li>
            );
          })}
        </ul>
      )}
      <p className="mt-1.5 text-[11px] text-cream/40">From transcripts still on this computer; see Workspace → History for everything.</p>
    </section>
  );
}
