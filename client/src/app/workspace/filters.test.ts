import { describe, expect, it } from "vitest";
import type { SessionView } from "@shared/model";
import { projectSummaries } from "./attention";
import { filterProjects, filterSessions, groupCounts, matchesQuery } from "./filters";

const NOW = 50_000_000;
const s = (id: string, patch: Partial<SessionView> = {}): SessionView => ({
  id, shortId: id, projectId: "p1", title: id, titleSource: "id", cwd: "C:\\work\\app", status: "idle",
  startedAt: NOW - 1000, lastActivityAt: NOW - 1000, statusSince: NOW - 1000, hooksActive: false, source: "transcript",
  subagents: [], recent: [], ...patch,
});
const projects = [{ id: "p1", name: "chaya-app", root: "C:\\work\\chaya-app" }, { id: "p2", name: "metro-pay", root: "C:\\work\\metro-pay" }];
const sessions = [
  s("Fix login", { status: "working", gitBranch: "fix/login", action: { kind: "bash", emoji: "", label: "Running npm test", startedAt: 1 } }),
  s("Release v2", { status: "waiting", waitingReason: "permission", gitBranch: "release/v2" }),
  s("Payments audit", { projectId: "p2", status: "working", subagents: [{ id: "a", sessionId: "x", agentType: "Explore", description: "", status: "working", startedAt: 1, lastActivityAt: 1 }] }),
  s("Old notes", { projectId: "p2", status: "idle", statusSince: NOW - 10 * 3_600_000 }),
];

describe("agent filters", () => {
  it("matches every word across title, project, branch, action and subagents", () => {
    expect(matchesQuery(sessions[0]!, "chaya-app", "npm login")).toBe(true);
    expect(matchesQuery(sessions[0]!, "chaya-app", "npm metro")).toBe(false);
    expect(matchesQuery(sessions[2]!, "metro-pay", "explore")).toBe(true);
  });

  it("filters by project, group and query, needs-you first", () => {
    expect(filterSessions(sessions, projects, { query: "", projectId: null, group: "all" }, NOW).map((x) => x.id)).toEqual(["Release v2", "Fix login", "Payments audit", "Old notes"]);
    expect(filterSessions(sessions, projects, { query: "", projectId: "p2", group: "all" }, NOW).map((x) => x.id)).toEqual(["Payments audit", "Old notes"]);
    expect(filterSessions(sessions, projects, { query: "release", projectId: null, group: "needsYou" }, NOW).map((x) => x.id)).toEqual(["Release v2"]);
    expect(filterSessions(sessions, projects, { query: "", projectId: null, group: "errors" }, NOW)).toEqual([]);
  });

  it("counts each group for the current search", () => {
    const c = groupCounts(sessions, projects, { query: "", projectId: null }, NOW);
    expect(c).toMatchObject({ all: 4, needsYou: 1, working: 2, idle: 1, errors: 0 });
    expect(groupCounts(sessions, projects, { query: "metro", projectId: null }, NOW).all).toBe(2);
  });
});

describe("project search", () => {
  it("matches name, folder and branch", () => {
    const list = projectSummaries(projects, sessions);
    expect(filterProjects(list, "metro").map((p) => p.project.name)).toEqual(["metro-pay"]);
    expect(filterProjects(list, "release").map((p) => p.project.name)).toEqual(["chaya-app"]);
    expect(filterProjects(list, "")).toHaveLength(2);
  });
});
