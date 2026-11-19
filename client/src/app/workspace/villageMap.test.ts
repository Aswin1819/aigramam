import { describe, expect, it } from "vitest";
import type { ProjectView, SessionView } from "@shared/model";
import { projectSummaries } from "./attention";
import { projectAccent } from "@shared/stations";
import { CARD, HUB, distinctAccents, MAP_H, MAP_W, MAX_DESKS, MAX_YARDS, boardCounts, boardList, deskSpots, layoutMap, pathTo, tileFaces } from "./villageMap";

const NOW = 10_000_000;
const s = (id: string, projectId: string, patch: Partial<SessionView> = {}): SessionView => ({
  id, shortId: id, projectId, title: id, titleSource: "id", cwd: "C:\\work\\app", status: "idle",
  startedAt: NOW - 3_600_000, lastActivityAt: NOW - 1000, statusSince: NOW - 1000, hooksActive: false, source: "transcript",
  subagents: [], recent: [], ...patch,
});
const project = (id: string): ProjectView => ({ id, name: id, root: `C:\\work\\${id}` });

function village(projectCount: number, perProject: number) {
  const projects = Array.from({ length: projectCount }, (_, i) => project(`p${i}`));
  const sessions = projects.flatMap((p) => Array.from({ length: perProject }, (_, j) => s(`${p.id}-s${j}`, p.id, { status: "working" })));
  return projectSummaries(projects, sessions);
}

type Box = { x: number; y: number; w: number; h: number };
const overlaps = (p: Box, q: Box) => p.x < q.x + q.w && q.x < p.x + p.w && p.y < q.y + q.h && q.y < p.y + p.h;

describe("layoutMap", () => {
  it("keeps every yard and card inside the map, and cards apart, for 1 to MAX_YARDS projects", () => {
    for (let n = 1; n <= MAX_YARDS; n++) {
      const { yards } = layoutMap(village(n, 3), NOW);
      expect(yards).toHaveLength(n);
      const cards = yards.map((y) => ({ ...y.card, w: CARD.w, h: CARD.h }));
      for (const [i, y] of yards.entries()) {
        expect(y.x - y.a).toBeGreaterThanOrEqual(0);
        expect(y.x + y.a).toBeLessThanOrEqual(MAP_W);
        const c = cards[i]!;
        expect(c.x, `card ${i} of ${n}`).toBeGreaterThanOrEqual(0);
        expect(c.y, `card ${i} of ${n}`).toBeGreaterThanOrEqual(0);
        expect(c.x + c.w, `card ${i} of ${n}`).toBeLessThanOrEqual(MAP_W);
        expect(c.y + c.h, `card ${i} of ${n}`).toBeLessThanOrEqual(MAP_H);
        for (const [j, d] of cards.entries()) if (j > i) expect(overlaps(c, d), `cards ${i} and ${j} of ${n}`).toBe(false);
        // A card never covers its own yard's tile.
        expect(overlaps(c, { x: y.x - y.a, y: y.y - y.a / 2, w: 2 * y.a, h: y.a }), `card ${i} of ${n} on its tile`).toBe(false);
      }
    }
  });

  it("draws at most MAX_DESKS villagers per yard and counts the rest", () => {
    const { yards } = layoutMap(village(1, MAX_DESKS + 4), NOW);
    expect(yards[0]!.desks).toHaveLength(MAX_DESKS);
    expect(yards[0]!.hidden).toBe(4);
  });

  it("counts projects that don't fit", () => {
    expect(layoutMap(village(MAX_YARDS + 3, 1), NOW).more).toBe(3);
    expect(layoutMap([], NOW)).toMatchObject({ yards: [], more: 0 });
    // An empty village still frames the square.
    const b = layoutMap([], NOW).bounds;
    expect(b.x).toBeLessThan(HUB.x - HUB.r);
    expect(b.x + b.w).toBeGreaterThan(HUB.x + HUB.r);
  });

  it("orders desks back to front, and colours the path by what the yard needs", () => {
    const projects = [project("a"), project("b"), project("c")];
    const sessions = [
      s("ask", "a", { status: "waiting", waitingReason: "permission" }),
      s("busy", "a", { status: "working" }),
      s("busy2", "b", { status: "working" }),
      s("rest", "c", { status: "idle" }),
    ];
    const { yards } = layoutMap(projectSummaries(projects, sessions), NOW);
    const byId = Object.fromEntries(yards.map((y) => [y.summary.project.id, y]));
    expect(byId.a!.path).toBe("urgent");
    expect(byId.b!.path).toBe("work");
    expect(byId.c!.path).toBe("quiet");
    expect(byId.a!.counts.urgent).toBe(1);
    for (const y of yards) for (let i = 1; i < y.desks.length; i++) expect(y.desks[i]!.y).toBeGreaterThanOrEqual(y.desks[i - 1]!.y);
  });
});

describe("distinctAccents", () => {
  it("keeps each project's usual colour when free and never repeats one while colours remain", () => {
    const ids = Array.from({ length: 8 }, (_, i) => `/work/project-${i}`);
    const got = distinctAccents(ids);
    expect(new Set(got).size).toBe(8);
    expect(got[0]).toBe(projectAccent(ids[0]!));
    expect(distinctAccents([...ids, "/work/x"])).toHaveLength(9);
  });
});

describe("deskSpots", () => {
  it("keeps every villager on the tile's top face", () => {
    const a = 150;
    for (let n = 1; n <= MAX_DESKS; n++) {
      for (const { dx, dy } of deskSpots(n, a)) {
        // Inside the rhombus |dx|/a + |dy|/(a/2) <= 1.
        expect(Math.abs(dx) / a + Math.abs(dy) / (a / 2)).toBeLessThanOrEqual(1);
      }
    }
    expect(deskSpots(0, a)).toEqual([]);
  });
});

describe("pathTo and tileFaces", () => {
  it("start at the square and end on a corner of the tile", () => {
    const yard = { x: HUB.x + 400, y: HUB.y, a: 120 };
    const end = pathTo(yard).split(" ").pop()!;
    expect(end).toBe(`${(yard.x - yard.a).toFixed(1)},${yard.y.toFixed(1)}`);
    expect(tileFaces(yard).top.split(" ")).toHaveLength(4);
  });
});

describe("board", () => {
  const sessions = [
    s("ask", "a", { status: "waiting", waitingReason: "question", statusSince: NOW - 9000 }),
    s("turn", "a", { status: "waiting", waitingReason: "turn_end" }),
    s("busy", "a", { status: "working" }),
    s("broken", "b", { status: "error" }),
    s("rest", "b", { status: "finished" }),
  ];
  it("filters by what the session needs, needs-you first", () => {
    expect(boardList(sessions, "all", NOW).map((x) => x.id)).toEqual(["ask", "turn", "broken", "busy", "rest"]);
    expect(boardList(sessions, "needs", NOW).map((x) => x.id)).toEqual(["ask", "broken"]);
    expect(boardCounts(sessions, NOW)).toEqual({ all: 5, needs: 2, turn: 1, work: 1, rest: 1 });
  });
});
