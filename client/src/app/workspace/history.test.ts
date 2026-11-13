import { describe, expect, it } from "vitest";
import type { HistorySession } from "@shared/history";
import { dailyTotals, duration, filterHistory, historyProjects, localDay, rangeStart, tokens } from "./history";

const NOW = new Date(2026, 10, 13, 15, 0).getTime(); // 13 Nov 2026, 15:00 local
const daysAgo = (n: number, h = 10) => new Date(2026, 10, 13 - n, h, 0).getTime();

function session(id: string, over: Partial<HistorySession> = {}): HistorySession {
  const at = over.lastActivityAt ?? daysAgo(0);
  return {
    id,
    projectId: "c:\\work\\app",
    projectName: "app",
    cwd: "C:\\work\\app",
    title: `Session ${id}`,
    titleSource: "ai",
    startedAt: at - 3600_000,
    lastActivityAt: at,
    activeMs: 1800_000,
    prompts: 3,
    replies: 2,
    toolCalls: 10,
    toolErrors: 1,
    topTools: [],
    filesEdited: 2,
    interrupts: 0,
    compactions: 0,
    apiErrors: 0,
    subagents: 0,
    models: [],
    usage: null,
    lastEvent: "reply_finished",
    state: "ended",
    days: [{ day: localDay(at), prompts: 3, toolCalls: 10, toolErrors: 1, activeMs: 1800_000, outputTokens: 500 }],
    ...over,
  };
}

describe("history filters", () => {
  const list = [
    session("a"),
    session("b", { lastActivityAt: daysAgo(3), projectId: "c:\\work\\api", projectName: "api", state: "live", gitBranch: "feat/login" }),
    session("c", { lastActivityAt: daysAgo(20) }),
    session("d", { lastActivityAt: daysAgo(45) }),
  ];

  it("filters by range from local midnight", () => {
    expect(rangeStart("today", NOW)).toBe(new Date(2026, 10, 13).getTime());
    const ids = (range: "today" | "7d" | "30d" | "all") => filterHistory(list, { range, projectId: null, state: "all", query: "" }, NOW).map((s) => s.id);
    expect(ids("today")).toEqual(["a"]);
    expect(ids("7d")).toEqual(["a", "b"]);
    expect(ids("30d")).toEqual(["a", "b", "c"]);
    expect(ids("all")).toEqual(["a", "b", "c", "d"]);
  });

  it("filters by project, state and text", () => {
    const f = { range: "all" as const, projectId: null, state: "all" as const, query: "" };
    expect(filterHistory(list, { ...f, projectId: "c:\\work\\api" }, NOW).map((s) => s.id)).toEqual(["b"]);
    expect(filterHistory(list, { ...f, state: "live" }, NOW).map((s) => s.id)).toEqual(["b"]);
    expect(filterHistory(list, { ...f, query: "LOGIN" }, NOW).map((s) => s.id)).toEqual(["b"]);
    expect(historyProjects(list)).toEqual([{ id: "c:\\work\\api", name: "api" }, { id: "c:\\work\\app", name: "app" }]);
  });

  it("adds up days across sessions, newest first, inside the range", () => {
    const two = [session("a"), session("b"), session("c", { lastActivityAt: daysAgo(2) })];
    const t = dailyTotals(two, "7d", NOW);
    expect(t.map((d) => [d.day, d.sessions, d.prompts, d.toolCalls, d.outputTokens])).toEqual([
      [localDay(NOW), 2, 6, 20, 1000],
      [localDay(daysAgo(2)), 1, 3, 10, 500],
    ]);
    expect(dailyTotals(two, "today", NOW)).toHaveLength(1);
  });
});

describe("formatting", () => {
  it("formats durations and token counts", () => {
    expect(duration(40_000)).toBe("40s");
    expect(duration(12 * 60_000)).toBe("12m");
    expect(duration(65 * 60_000)).toBe("1h 05m");
    expect(duration(50 * 3600_000)).toBe("2d 2h");
    expect(tokens(950)).toBe("950");
    expect(tokens(1234)).toBe("1.23k");
    expect(tokens(12_345)).toBe("12.3k");
    expect(tokens(4_560_000)).toBe("4.56M");
  });
});
