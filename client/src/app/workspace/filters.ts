/**
 * Search and filters for the Agents and Projects pages. Pure, so they're
 * tested without the UI. Groups are the same as the Overview's (attention.ts).
 */
import type { ProjectView, SessionView } from "@shared/model";
import { attentionOf, type Attention, type ProjectSummary } from "./attention";

export type AgentGroup = "all" | keyof Attention;

export const GROUP_LABEL: Record<AgentGroup, string> = {
  all: "All",
  needsYou: "Needs you",
  yourTurn: "Your turn",
  working: "Working",
  quiet: "No recent activity",
  errors: "Errors",
  recentlyDone: "Recently done",
  idle: "Idle",
};

export interface AgentFilter {
  query: string;
  /** Project id, or null for every project. */
  projectId: string | null;
  group: AgentGroup;
}

const norm = (s: string) => s.toLowerCase();

/** Every word of the query must appear in the session's title, project, branch, action, folder or subagent types. */
export function matchesQuery(s: SessionView, projectName: string, query: string): boolean {
  const words = norm(query).split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  const hay = norm([s.title, projectName, s.gitBranch ?? "", s.action?.label ?? "", s.cwd, ...s.subagents.map((a) => a.agentType)].join(" "));
  return words.every((w) => hay.includes(w));
}

/** Sessions matching the filter, in the Overview's order (needs you first … idle last). */
export function filterSessions(sessions: SessionView[], projects: ProjectView[], f: AgentFilter, now: number): SessionView[] {
  const name = (s: SessionView) => projects.find((p) => p.id === s.projectId)?.name ?? "";
  const pool = sessions.filter((s) => (!f.projectId || s.projectId === f.projectId) && matchesQuery(s, name(s), f.query));
  const a = attentionOf(pool, now);
  if (f.group !== "all") return a[f.group];
  return [...a.needsYou, ...a.yourTurn, ...a.errors, ...a.quiet, ...a.working, ...a.recentlyDone, ...a.idle];
}

/** How many sessions each group would show for the current search and project. */
export function groupCounts(sessions: SessionView[], projects: ProjectView[], f: Omit<AgentFilter, "group">, now: number): Record<AgentGroup, number> {
  const a = attentionOf(filterSessions(sessions, projects, { ...f, group: "all" }, now), now);
  const counts = Object.fromEntries(Object.entries(a).map(([k, v]) => [k, v.length])) as Record<keyof Attention, number>;
  return { all: Object.values(counts).reduce((x, y) => x + y, 0), ...counts };
}

/** Projects whose name or folder matches every word of the query. */
export function filterProjects(list: ProjectSummary[], query: string): ProjectSummary[] {
  const words = norm(query).split(/\s+/).filter(Boolean);
  return words.length ? list.filter((p) => words.every((w) => norm(`${p.project.name} ${p.project.root} ${p.branches.join(" ")}`).includes(w))) : list;
}
