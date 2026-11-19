import { describe, expect, it } from "vitest";
import type { ProjectView, SessionView } from "@shared/model";
import { projectSummaries } from "../attention";
import { DESK_PITCH, MAX_DESKS_3D, MAX_PODS, SQUARE_R, deskGrid, layout3d, podSize } from "./layout3d";

const NOW = 10_000_000;
const s = (id: string, projectId: string, patch: Partial<SessionView> = {}): SessionView => ({
  id, shortId: id, projectId, title: id, titleSource: "id", cwd: "/work/app", status: "working",
  startedAt: NOW - 3_600_000, lastActivityAt: NOW - 1000, statusSince: NOW - 1000, hooksActive: false, source: "transcript",
  subagents: [], recent: [], ...patch,
});

function village(sizes: number[]) {
  const projects: ProjectView[] = sizes.map((_, i) => ({ id: `/work/p${i}`, name: `p${i}`, root: `/work/p${i}` }));
  const sessions = projects.flatMap((p, i) => Array.from({ length: sizes[i]! }, (_, j) => s(`${p.name}-${j}`, p.id)));
  return projectSummaries(projects, sessions);
}

const rect = (p: { x: number; z: number; w: number; d: number }) => ({ x0: p.x - p.w / 2, x1: p.x + p.w / 2, z0: p.z - p.d / 2, z1: p.z + p.d / 2 });
const overlap = (a: ReturnType<typeof rect>, b: ReturnType<typeof rect>) => a.x0 < b.x1 && b.x0 < a.x1 && a.z0 < b.z1 && b.z0 < a.z1;

describe("layout3d", () => {
  it("keeps pods apart from each other and from the square, for 1 to MAX_PODS projects of mixed sizes", () => {
    for (let n = 1; n <= MAX_PODS; n++) {
      const sizes = Array.from({ length: n }, (_, i) => 1 + ((i * 5) % MAX_DESKS_3D));
      const { pods } = layout3d(village(sizes), NOW);
      expect(pods).toHaveLength(n);
      for (const [i, p] of pods.entries()) {
        const r = rect(p);
        // Not on the square: the closest point of the pod is outside its circle.
        const cx = Math.max(r.x0, Math.min(0, r.x1));
        const cz = Math.max(r.z0, Math.min(0, r.z1));
        expect(Math.hypot(cx, cz), `pod ${i} of ${n} on the square`).toBeGreaterThan(SQUARE_R);
        for (const [j, q] of pods.entries()) if (j > i) expect(overlap(r, rect(q)), `pods ${i} and ${j} of ${n}`).toBe(false);
      }
    }
  });

  it("puts every desk on its pod with room around it", () => {
    const { pods } = layout3d(village([1, 4, 7, MAX_DESKS_3D]), NOW);
    for (const p of pods) {
      const r = rect(p);
      for (const d of p.desks) {
        expect(d.x - DESK_PITCH.x / 2).toBeGreaterThanOrEqual(r.x0);
        expect(d.x + DESK_PITCH.x / 2).toBeLessThanOrEqual(r.x1);
        expect(d.z - DESK_PITCH.z / 2).toBeGreaterThanOrEqual(r.z0);
        expect(d.z + DESK_PITCH.z / 2).toBeLessThanOrEqual(r.z1);
      }
      // No two desks share a spot.
      expect(new Set(p.desks.map((d) => `${d.x},${d.z}`)).size).toBe(p.desks.length);
    }
  });

  it("counts villagers and projects that don't fit", () => {
    const big = layout3d(village([MAX_DESKS_3D + 3]), NOW);
    expect(big.pods[0]!.desks).toHaveLength(MAX_DESKS_3D);
    expect(big.pods[0]!.hidden).toBe(3);
    expect(layout3d(village(Array(MAX_PODS + 2).fill(1)), NOW).more).toBe(2);
    expect(layout3d([], NOW)).toMatchObject({ pods: [], more: 0 });
  });

  it("colours the wire by what the pod needs, from real status only", () => {
    const projects: ProjectView[] = [{ id: "a", name: "a", root: "a" }, { id: "b", name: "b", root: "b" }, { id: "c", name: "c", root: "c" }];
    const sessions = [
      s("ask", "a", { status: "waiting", waitingReason: "permission" }),
      s("busy", "b"),
      s("rest", "c", { status: "idle" }),
    ];
    const byId = Object.fromEntries(layout3d(projectSummaries(projects, sessions), NOW).pods.map((p) => [p.summary.project.id, p.wire]));
    expect(byId).toEqual({ a: "urgent", b: "work", c: "quiet" });
  });
});

describe("deskGrid and podSize", () => {
  it("grows the pod with its desks and never below the minimum", () => {
    expect(deskGrid(1)).toEqual({ cols: 1, rows: 1 });
    expect(deskGrid(5)).toEqual({ cols: 3, rows: 2 });
    expect(deskGrid(MAX_DESKS_3D).cols).toBeLessThanOrEqual(4);
    expect(podSize(1)).toEqual({ w: 15, d: 15 });
    expect(podSize(9).w).toBeGreaterThan(podSize(4).w);
  });
});
