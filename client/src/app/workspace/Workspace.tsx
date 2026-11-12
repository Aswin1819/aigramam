import { motion } from "motion/react";
import { FolderGit2, LayoutGrid, Users } from "lucide-react";
import type { ProjectView, SessionView } from "@shared/model";
import type { AppMode } from "@/hooks/useLiveSessions";
import { isUrgent } from "@/lib/status";
import type { WorkspacePage } from "../useDisplayPrefs";
import Overview from "./Overview";
import ProjectsPage from "./ProjectsPage";
import AgentsPage from "./AgentsPage";

interface Props {
  page: WorkspacePage;
  onPage: (page: WorkspacePage) => void;
  sessions: SessionView[];
  projects: ProjectView[];
  now: number;
  mode: AppMode;
  connected: boolean;
  hooksInstalled: boolean;
  selectedSessionId: string | null;
  onSelectSession: (id: string) => void;
  selectedProjectId: string | null;
  onSelectProject: (id: string | null) => void;
  onDecide: (approvalId: string, decision: "allow" | "deny") => void;
  onSettings: (tab?: string) => void;
}

const PAGES: Array<[WorkspacePage, string, typeof LayoutGrid]> = [
  ["overview", "Overview", LayoutGrid],
  ["projects", "Projects", FolderGit2],
  ["agents", "Agents", Users],
];

/** Workspace Mode: the practical side of Ai Gramam, on the same live data as the village. */
export default function Workspace(p: Props) {
  const urgent = p.sessions.filter(isUrgent).length;
  return (
    <div className="absolute inset-0 overflow-y-auto bg-[radial-gradient(ellipse_at_top,#173129,#0b1411_60%)] pb-6 pt-[76px]">
      <div className="mx-auto max-w-[1280px] px-4">
        <nav className="mb-3 flex gap-1" role="tablist" aria-label="Workspace pages">
          {PAGES.map(([id, label, Icon]) => (
            <button key={id} role="tab" aria-selected={p.page === id} onClick={() => p.onPage(id)} className="relative flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-[13px]">
              {p.page === id && <motion.span layoutId="workspace-tab" className="absolute inset-0 -z-0 rounded-xl bg-white/10 ring-1 ring-white/10" />}
              <Icon size={15} className={`relative ${p.page === id ? "text-brass" : "text-cream/50"}`} />
              <span className={`relative ${p.page === id ? "font-semibold text-cream" : "text-cream/65"}`}>{label}</span>
              {id === "agents" && urgent > 0 && <span className="relative chip bg-urgent text-white">{urgent}</span>}
            </button>
          ))}
        </nav>

        {p.page === "overview" && (
          <Overview
            sessions={p.sessions}
            projects={p.projects}
            now={p.now}
            mode={p.mode}
            connected={p.connected}
            hooksInstalled={p.hooksInstalled}
            selectedId={p.selectedSessionId}
            onSelect={p.onSelectSession}
            onDecide={p.onDecide}
            onSettings={p.onSettings}
            onOpenProject={(id) => {
              p.onSelectProject(id);
              p.onPage("projects");
            }}
          />
        )}
        {p.page === "projects" && (
          <ProjectsPage
            sessions={p.sessions}
            projects={p.projects}
            now={p.now}
            selectedProjectId={p.selectedProjectId}
            onSelectProject={p.onSelectProject}
            selectedSessionId={p.selectedSessionId}
            onSelectSession={p.onSelectSession}
          />
        )}
        {p.page === "agents" && (
          <AgentsPage sessions={p.sessions} projects={p.projects} now={p.now} selectedSessionId={p.selectedSessionId} onSelectSession={p.onSelectSession} />
        )}
      </div>
    </div>
  );
}
