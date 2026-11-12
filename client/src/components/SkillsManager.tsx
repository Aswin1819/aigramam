/**
 * SkillsManager - read-only viewer for Claude Code agents and skills.
 *
 * Agents: ~/.claude/agents/<name>.md (global) and <project>/.claude/agents/<name>.md (project)
 * Skills: ~/.claude/skills/<name>/SKILL.md (global) and <project>/.claude/skills/<name>/SKILL.md (project)
 *
 * Ai Gramam never changes these files; edit them in Claude Code or an editor.
 */

import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import {
  X, RefreshCw, Globe, FolderOpen,
  Bot, Zap, ChevronDown, ChevronRight, Copy, AlertCircle, Eye
} from "lucide-react";

interface SkillsManagerProps {
  onClose: () => void;
  projects: Array<{ encodedName: string; realPath: string; sessionCount: number }>;
}

interface ViewItem {
  name: string;
  displayName?: string;
  description: string;
  content: string;
  tools?: string;
  model?: string;
  agentPath?: string;
  skillPath?: string;
}

/** Projects whose folder could be found; the server only reads tracked, absolute paths. */
const isAbsolutePath = (p: string) => /^([A-Za-z]:[\\/]|\/)/.test(p);

export default function SkillsManager({ onClose, projects: allProjects }: SkillsManagerProps) {
  const projects = allProjects.filter((p) => isAbsolutePath(p.realPath));
  const [activeTab, setActiveTab] = useState<"agents" | "skills">("agents");
  const [scope, setScope] = useState<"global" | "project">("global");
  const [selectedProject, setSelectedProject] = useState<string>(projects[0]?.realPath || "");
  const [expandedItem, setExpandedItem] = useState<string | null>(null);

  // ── Queries (read-only) ─────────────────────────────────────────────────────
  const globalAgents = trpc.agents.globalAgents.useQuery(undefined, { refetchInterval: 3000 });
  const projectAgents = trpc.agents.projectAgents.useQuery(
    { projectPath: selectedProject },
    { enabled: scope === "project" && !!selectedProject, refetchInterval: 3000 }
  );
  const globalSkills = trpc.agents.globalSkills.useQuery(undefined, { refetchInterval: 3000 });
  const projectSkills = trpc.agents.projectSkills.useQuery(
    { projectPath: selectedProject },
    { enabled: scope === "project" && !!selectedProject, refetchInterval: 3000 }
  );

  const active = activeTab === "agents"
    ? (scope === "global" ? globalAgents : projectAgents)
    : (scope === "global" ? globalSkills : projectSkills);

  const currentItems: ViewItem[] = (active.data as ViewItem[] | undefined) ?? [];
  const isLoading = active.isLoading && active.fetchStatus !== "idle";

  const pathInfo = activeTab === "agents"
    ? (scope === "global" ? "~/.claude/agents/<name>.md" : `<project>/.claude/agents/<name>.md`)
    : (scope === "global" ? "~/.claude/skills/<name>/SKILL.md" : `<project>/.claude/skills/<name>/SKILL.md`);

  const projectLabel = (p: string) => p.split(/[\\/]/).filter(Boolean).pop() || p;

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-40 p-4">
      <div className="bg-[#0f1d19] border-2 border-white/10 rounded-lg w-full max-w-4xl flex flex-col text-cream" style={{ maxHeight: "90vh" }}>
        {/* Header */}
        <div className="flex items-start justify-between gap-3 p-4 border-b border-white/10 bg-white/[0.04]">
          <div className="min-w-0">
            <h2 className="text-brass font-bold text-lg">Skills & agents</h2>
            <p className="text-xs text-gray-400 mt-0.5">{pathInfo}</p>
            <p className="mt-2 flex items-start gap-1.5 text-xs text-cream/70">
              <Eye size={13} className="mt-0.5 shrink-0 text-brass" />
              <span>Read-only: Ai Gramam shows your skills and agents but never changes files in ~/.claude or your projects. Edit them in Claude Code or your editor.</span>
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-xl shrink-0" aria-label="Close" title="Close"><X size={20} /></button>
        </div>

        {/* Tab Bar */}
        <div className="flex border-b border-white/10">
          {(["agents", "skills"] as const).map((t) => (
            <button
              key={t}
              onClick={() => { setActiveTab(t); setExpandedItem(null); }}
              className={`flex items-center gap-2 px-6 py-3 text-xs font-bold uppercase border-b-2 transition-colors ${
                activeTab === t ? "border-brass text-brass" : "border-transparent text-gray-500 hover:text-gray-300"
              }`}
            >
              {t === "agents" ? <Bot size={14} /> : <Zap size={14} />} {t === "agents" ? "Agents" : "Skills"}
            </button>
          ))}
        </div>

        {/* Scope Selector */}
        <div className="flex flex-wrap items-center gap-3 px-4 py-3 border-b border-white/10 bg-black/30">
          <div className="flex gap-2">
            <button
              onClick={() => { setScope("global"); setExpandedItem(null); }}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold uppercase rounded transition-colors ${
                scope === "global" ? "bg-brass-deep text-white" : "bg-white/5 text-gray-400 hover:text-white"
              }`}
            >
              <Globe size={12} /> Global
            </button>
            <button
              onClick={() => { setScope("project"); setExpandedItem(null); }}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold uppercase rounded transition-colors ${
                scope === "project" ? "bg-brass-deep text-white" : "bg-white/5 text-gray-400 hover:text-white"
              }`}
            >
              <FolderOpen size={12} /> Project
            </button>
          </div>

          {scope === "project" && (
            <select
              value={selectedProject}
              onChange={(e) => { setSelectedProject(e.target.value); setExpandedItem(null); }}
              className="bg-white/5 border border-white/15 text-gray-300 text-xs px-2 py-1.5 rounded focus:outline-none focus:border-brass/50 flex-1 min-w-0 max-w-xs"
              aria-label="Project"
            >
              {projects.length === 0 ? (
                <option value="">No projects detected yet</option>
              ) : (
                projects.map((p) => (
                  <option key={p.encodedName} value={p.realPath}>
                    {projectLabel(p.realPath)} ({p.sessionCount} sessions)
                  </option>
                ))
              )}
            </select>
          )}

          <button
            onClick={() => active.refetch()}
            className="ml-auto flex items-center gap-1.5 text-xs text-gray-500 hover:text-brass p-1"
            title="Refresh"
          >
            <RefreshCw size={14} className={active.isFetching ? "animate-spin" : ""} /> Refresh
          </button>
        </div>

        {/* Items List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {scope === "project" && !selectedProject && (
            <div className="flex items-center gap-2 text-yellow-600 text-xs p-4 bg-yellow-900/20 rounded border border-yellow-700/30">
              <AlertCircle size={14} />
              No project selected. Start Claude Code in a project to see it here.
            </div>
          )}

          {active.error && (
            <div className="flex items-center gap-2 text-urgent text-xs p-3 rounded border border-white/15 bg-black/30">
              <AlertCircle size={14} /> Couldn't read {activeTab}: {active.error.message}
            </div>
          )}

          {isLoading && <p className="text-gray-500 text-xs">Loading…</p>}

          {currentItems.length === 0 && !isLoading && !active.error && (
            <div className="text-center py-12">
              <div className="mb-3 flex justify-center text-brass/60">{activeTab === "agents" ? <Bot size={32} /> : <Zap size={32} />}</div>
              <p className="text-gray-500 text-xs uppercase">
                No {activeTab} found in {scope} scope
              </p>
              <p className="text-gray-600 text-xs mt-1">{pathInfo}</p>
            </div>
          )}

          {currentItems.map((item) => {
            const open = expandedItem === item.name;
            return (
              <div
                key={item.name}
                className="bg-black/40 border border-white/15 rounded-lg overflow-hidden hover:border-brass/40 transition-colors"
              >
                <div className="flex items-center justify-between p-3">
                  <button
                    type="button"
                    className="flex items-center gap-3 min-w-0 flex-1 text-left"
                    onClick={() => setExpandedItem(open ? null : item.name)}
                    aria-expanded={open}
                  >
                    <span className="text-brass shrink-0">{activeTab === "agents" ? <Bot size={15} /> : <Zap size={15} />}</span>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-work text-sm font-bold">{item.displayName || item.name}</span>
                        {item.displayName && item.displayName !== item.name && (
                          <span className="text-gray-500 text-xs">/{item.name}</span>
                        )}
                        {item.model && (
                          <span className="text-gray-400 text-xs bg-white/5 px-1.5 py-0.5 rounded">Model: {item.model}</span>
                        )}
                      </div>
                      <p className="text-gray-400 text-xs truncate mt-0.5">{item.description || "No description"}</p>
                      {item.tools && (
                        <p className="text-sky-300/80 text-xs mt-0.5 truncate">Tools: {item.tools}</p>
                      )}
                    </div>
                  </button>
                  <div className="flex items-center gap-2 ml-2 shrink-0">
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(item.content).then(
                          () => toast.success("Copied"),
                          () => toast.error("Couldn't copy"),
                        );
                      }}
                      className="flex items-center gap-1 text-gray-500 hover:text-brass p-1 text-xs"
                      title="Copy content"
                    >
                      <Copy size={13} /> Copy
                    </button>
                    <button
                      onClick={() => setExpandedItem(open ? null : item.name)}
                      className="flex items-center gap-1 text-gray-500 hover:text-brass p-1 text-xs"
                      title={open ? "Hide content" : "View content"}
                    >
                      {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />} {open ? "Hide" : "View"}
                    </button>
                  </div>
                </div>

                {open && (
                  <div className="border-t border-white/10 p-3">
                    <pre className="text-work/80 text-xs font-mono whitespace-pre-wrap break-words bg-black/50 p-3 rounded max-h-80 overflow-auto">
                      {item.content}
                    </pre>
                    <p className="text-gray-500 text-xs mt-2 break-all">
                      File: {item.agentPath || (item.skillPath ? `${item.skillPath}${item.skillPath.includes("\\") ? "\\" : "/"}SKILL.md` : "")}
                    </p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
