import { useState } from "react";
import { Search } from "lucide-react";
import type { ProjectView, SessionView } from "@shared/model";
import { GROUP_LABEL, filterSessions, groupCounts, type AgentGroup } from "./filters";
import { QUIET_AFTER_MS } from "./attention";
import SessionRow from "./SessionRow";

interface Props {
  sessions: SessionView[];
  projects: ProjectView[];
  now: number;
  selectedSessionId: string | null;
  onSelectSession: (id: string) => void;
}

const GROUPS: AgentGroup[] = ["all", "needsYou", "yourTurn", "working", "quiet", "errors", "recentlyDone", "idle"];

/** Every session Ai Gramam can see, with search, a project filter and status groups. */
export default function AgentsPage(p: Props) {
  const [query, setQuery] = useState("");
  const [projectId, setProjectId] = useState<string | null>(null);
  const [group, setGroup] = useState<AgentGroup>("all");
  const counts = groupCounts(p.sessions, p.projects, { query, projectId }, p.now);
  const list = filterSessions(p.sessions, p.projects, { query, projectId, group }, p.now);
  const projectName = (s: SessionView) => p.projects.find((x) => x.id === s.projectId)?.name ?? s.cwd.split(/[\\/]/).filter(Boolean).pop() ?? "";
  const withSessions = p.projects.filter((pr) => p.sessions.some((s) => s.projectId === pr.id)).sort((a, b) => a.name.localeCompare(b.name));

  return (
    <section className="glass rounded-2xl p-3">
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex min-w-[220px] flex-1 items-center gap-2 rounded-xl border border-white/10 bg-black/25 px-2.5 py-1.5 focus-within:border-brass/60">
          <Search size={14} className="text-cream/45" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search sessions, actions, branches, subagents…" aria-label="Search agents" className="w-full bg-transparent text-[13px] text-cream outline-none placeholder:text-cream/35" />
        </label>
        <select
          value={projectId ?? ""}
          onChange={(e) => setProjectId(e.target.value || null)}
          aria-label="Filter by project"
          className="rounded-xl border border-white/10 bg-black/25 px-2.5 py-1.5 text-[13px] text-cream outline-none focus:border-brass/60"
        >
          <option value="">All projects</option>
          {withSessions.map((pr) => <option key={pr.id} value={pr.id}>{pr.name}</option>)}
        </select>
      </div>

      <div className="mt-2 flex flex-wrap gap-1.5" role="radiogroup" aria-label="Filter by status">
        {GROUPS.map((g) => (
          <button
            key={g}
            role="radio"
            aria-checked={group === g}
            onClick={() => setGroup(g)}
            disabled={g !== "all" && counts[g] === 0 && group !== g}
            className={`rounded-full border px-2.5 py-1 text-[12px] disabled:opacity-35 ${group === g ? "border-brass bg-brass/20 text-cream" : "border-white/12 text-cream/75 hover:bg-white/5"}`}
            title={g === "quiet" ? `Working, but nothing recorded for over ${QUIET_AFTER_MS / 60_000} minutes` : undefined}
          >
            {GROUP_LABEL[g]} <span className="tabular-nums text-cream/50">{counts[g]}</span>
          </button>
        ))}
      </div>

      <div className="mt-3 space-y-1.5">
        {list.map((s) => <SessionRow key={s.id} s={s} project={projectName(s)} now={p.now} selected={s.id === p.selectedSessionId} onSelect={() => p.onSelectSession(s.id)} />)}
        {list.length === 0 && (
          <p className="py-6 text-center text-[12.5px] text-cream/45">
            {p.sessions.length === 0 ? "No Claude Code sessions are running." : "No session matches these filters."}
          </p>
        )}
      </div>
    </section>
  );
}
