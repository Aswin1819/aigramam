import { useMemo, useState } from "react";
import { FolderGit2, Search } from "lucide-react";
import type { ProjectView, SessionView } from "@shared/model";
import { elapsed } from "@/lib/status";
import { projectSummaries } from "./attention";
import { filterProjects } from "./filters";
import ProjectDetail from "./ProjectDetail";

interface Props {
  sessions: SessionView[];
  projects: ProjectView[];
  now: number;
  selectedProjectId: string | null;
  onSelectProject: (id: string | null) => void;
  selectedSessionId: string | null;
  onSelectSession: (id: string) => void;
  onOpenTerminal?: (projectId: string) => void;
  terminalBlockedReason?: string | null;
}

/** Every project with an open session: search on the left, the chosen project's details on the right. */
export default function ProjectsPage(p: Props) {
  const [query, setQuery] = useState("");
  const all = useMemo(() => projectSummaries(p.projects, p.sessions), [p.projects, p.sessions]);
  const list = filterProjects(all, query);
  const selected = all.find((x) => x.project.id === p.selectedProjectId) ?? null;

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)]">
      <section className="glass rounded-2xl p-3">
        <label className="flex items-center gap-2 rounded-xl border border-white/10 bg-black/25 px-2.5 py-1.5 focus-within:border-brass/60">
          <Search size={14} className="text-cream/45" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search projects, folders, branches…" aria-label="Search projects" className="w-full bg-transparent text-[13px] text-cream outline-none placeholder:text-cream/35" />
        </label>
        <p className="mb-2 mt-2 text-[11px] text-cream/45">{list.length} of {all.length} projects with an open session</p>
        <div className="space-y-1.5">
          {list.map((pr) => (
            <button
              key={pr.project.id}
              onClick={() => p.onSelectProject(pr.project.id)}
              aria-pressed={pr.project.id === p.selectedProjectId}
              className={`w-full rounded-xl border px-3 py-2 text-left ${pr.project.id === p.selectedProjectId ? "border-brass/60 bg-brass/10" : "border-white/8 bg-black/15 hover:bg-white/5"}`}
            >
              <div className="flex items-center gap-2">
                <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-cream">{pr.project.name}</span>
                {pr.needsYou > 0 && <span className="chip bg-urgent text-white">{pr.needsYou} needs you</span>}
                {pr.errors > 0 && <span className="chip bg-urgent/20 text-urgent">{pr.errors} error</span>}
              </div>
              <div className="mt-0.5 flex gap-3 text-[11px] text-cream/50">
                <span>{pr.sessions.length} session{pr.sessions.length > 1 ? "s" : ""}</span>
                {pr.working > 0 && <span className="text-work">{pr.working} working</span>}
                <span className="ml-auto">{elapsed(pr.lastActivityAt, p.now)} ago</span>
              </div>
            </button>
          ))}
          {list.length === 0 && <p className="py-4 text-center text-[12px] text-cream/45">{all.length ? "No project matches your search." : "No projects have an open session."}</p>}
        </div>
      </section>

      <section className="glass rounded-2xl p-4">
        {selected ? (
          <ProjectDetail
            summary={selected}
            now={p.now}
            selectedSessionId={p.selectedSessionId}
            onSelectSession={p.onSelectSession}
            onOpenTerminal={p.onOpenTerminal}
            terminalBlockedReason={p.terminalBlockedReason}
          />
        ) : (
          <div className="grid h-full min-h-[200px] place-items-center text-center text-[13px] text-cream/50">
            <div>
              <FolderGit2 size={22} className="mx-auto mb-2 text-cream/30" />
              Choose a project to see its sessions, folder and branches.
              {p.selectedProjectId && <p className="mt-1 text-[12px]">That project has no open session right now.</p>}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
