/**
 * Sorts live sessions into what the Overview shows. Pure and based only on
 * what the monitor knows (status, waiting reason, timestamps); nothing is
 * guessed. In particular, a quiet session is "No recent activity", never
 * "stuck": the app can't tell a long-running tool from a hung one.
 */
import type { ProjectView, SessionView } from "@shared/model";
import { isUrgent } from "@/lib/status";

/** A working session with no recorded activity for this long is listed under "No recent activity". */
export const QUIET_AFTER_MS = 5 * 60_000;
/** Sessions that ended a turn or finished within this window count as recently finished. */
export const RECENT_MS = 2 * 60 * 60_000;

export interface Attention {
  /** Approval or question: blocked until the person answers. Oldest first. */
  needsYou: SessionView[];
  /** Finished a turn and waits for the next message. Oldest first. */
  yourTurn: SessionView[];
  /** Working with recent activity. */
  working: SessionView[];
  /** Working, but nothing recorded for QUIET_AFTER_MS. Quietest first. */
  quiet: SessionView[];
  errors: SessionView[];
  /** Idle or finished within RECENT_MS. Most recent first. */
  recentlyDone: SessionView[];
  /** Everything else (idle for longer). */
  idle: SessionView[];
}

export function attentionOf(sessions: SessionView[], now: number): Attention {
  const a: Attention = { needsYou: [], yourTurn: [], working: [], quiet: [], errors: [], recentlyDone: [], idle: [] };
  for (const s of sessions) {
    if (isUrgent(s)) a.needsYou.push(s);
    else if (s.status === "waiting") a.yourTurn.push(s);
    else if (s.status === "error") a.errors.push(s);
    else if (s.status === "working") (now - s.lastActivityAt > QUIET_AFTER_MS ? a.quiet : a.working).push(s);
    else if (now - s.statusSince <= RECENT_MS) a.recentlyDone.push(s);
    else a.idle.push(s);
  }
  const oldestFirst = (x: SessionView, y: SessionView) => x.statusSince - y.statusSince;
  a.needsYou.sort(oldestFirst);
  a.yourTurn.sort(oldestFirst);
  a.quiet.sort((x, y) => x.lastActivityAt - y.lastActivityAt);
  a.working.sort((x, y) => y.lastActivityAt - x.lastActivityAt);
  a.recentlyDone.sort((x, y) => y.statusSince - x.statusSince);
  return a;
}

export interface ProjectSummary {
  project: ProjectView;
  sessions: SessionView[];
  /** Distinct git branches seen in this project's sessions. */
  branches: string[];
  needsYou: number;
  working: number;
  errors: number;
  /** Running subagents across the project's sessions. */
  subagents: number;
  lastActivityAt: number;
}

/** One summary per project that has sessions, the ones that need the person first, then the busiest. */
export function projectSummaries(projects: ProjectView[], sessions: SessionView[]): ProjectSummary[] {
  const byId = new Map(projects.map((p) => [p.id, p]));
  const groups = new Map<string, SessionView[]>();
  for (const s of sessions) groups.set(s.projectId, [...(groups.get(s.projectId) ?? []), s]);
  return [...groups.entries()]
    .map(([id, list]) => {
      const project = byId.get(id) ?? { id, name: id.split(/[\\/]/).filter(Boolean).pop() || id, root: id };
      return {
        project,
        sessions: list,
        branches: [...new Set(list.map((s) => s.gitBranch).filter((b): b is string => !!b))],
        needsYou: list.filter(isUrgent).length,
        working: list.filter((s) => s.status === "working").length,
        errors: list.filter((s) => s.status === "error").length,
        subagents: list.reduce((n, s) => n + s.subagents.filter((x) => x.status === "working" || x.status === "waiting").length, 0),
        lastActivityAt: Math.max(...list.map((s) => s.lastActivityAt)),
      };
    })
    .sort((x, y) => y.needsYou - x.needsYou || y.errors - x.errors || y.working - x.working || y.lastActivityAt - x.lastActivityAt);
}
