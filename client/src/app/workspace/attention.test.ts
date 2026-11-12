import { describe, expect, it } from "vitest";
import type { SessionView } from "@shared/model";
import { QUIET_AFTER_MS, RECENT_MS, attentionOf, projectSummaries } from "./attention";

const NOW = 10_000_000;
const s = (id: string, patch: Partial<SessionView> = {}): SessionView => ({
  id, shortId: id, projectId: "p1", title: id, titleSource: "id", cwd: "C:\\work\\app", status: "idle",
  startedAt: NOW - 3_600_000, lastActivityAt: NOW - 1000, statusSince: NOW - 1000, hooksActive: false, source: "transcript",
  subagents: [], recent: [], ...patch,
});

describe("attentionOf", () => {
  it("puts every session in exactly one group, from real status only", () => {
    const sessions = [
      s("approval", { status: "waiting", waitingReason: "permission", statusSince: NOW - 5000 }),
      s("question", { status: "waiting", waitingReason: "question", statusSince: NOW - 9000 }),
      s("turn", { status: "waiting", waitingReason: "turn_end" }),
      s("busy", { status: "working" }),
      s("quiet", { status: "working", lastActivityAt: NOW - QUIET_AFTER_MS - 1 }),
      s("broken", { status: "error" }),
      s("done", { status: "finished", statusSince: NOW - 60_000 }),
      s("old", { status: "idle", statusSince: NOW - RECENT_MS - 1 }),
    ];
    const a = attentionOf(sessions, NOW);
    expect(a.needsYou.map((x) => x.id)).toEqual(["question", "approval"]); // oldest first
    expect(a.yourTurn.map((x) => x.id)).toEqual(["turn"]);
    expect(a.working.map((x) => x.id)).toEqual(["busy"]);
    expect(a.quiet.map((x) => x.id)).toEqual(["quiet"]);
    expect(a.errors.map((x) => x.id)).toEqual(["broken"]);
    expect(a.recentlyDone.map((x) => x.id)).toEqual(["done"]);
    expect(a.idle.map((x) => x.id)).toEqual(["old"]);
    const all = Object.values(a).flat();
    expect(all).toHaveLength(sessions.length);
  });

  it("calls a working session quiet only after the threshold", () => {
    expect(attentionOf([s("a", { status: "working", lastActivityAt: NOW - QUIET_AFTER_MS + 1000 })], NOW).quiet).toHaveLength(0);
    expect(attentionOf([s("a", { status: "working", lastActivityAt: NOW - QUIET_AFTER_MS - 1000 })], NOW).quiet).toHaveLength(1);
  });
});

describe("projectSummaries", () => {
  it("summarises projects that have sessions, most urgent first", () => {
    const projects = [{ id: "p1", name: "app", root: "C:\\work\\app" }, { id: "p2", name: "api", root: "C:\\work\\api" }, { id: "p3", name: "empty", root: "C:\\x" }];
    const list = projectSummaries(projects, [
      s("a", { projectId: "p1", status: "working", gitBranch: "main" }),
      s("b", { projectId: "p1", status: "idle", gitBranch: "feat/x" }),
      s("c", { projectId: "p2", status: "waiting", waitingReason: "permission", subagents: [{ id: "x", sessionId: "c", agentType: "Explore", description: "", status: "working", startedAt: 1, lastActivityAt: 1 }] }),
      s("d", { projectId: "gone\\folder" }),
    ]);
    expect(list.map((p) => p.project.name)).toEqual(["api", "app", "folder"]);
    expect(list[0]).toMatchObject({ needsYou: 1, subagents: 1 });
    expect(list[1]!.branches.sort()).toEqual(["feat/x", "main"]);
  });
});
