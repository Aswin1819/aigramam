import { describe, expect, it } from "vitest";
import type { ProjectView, SessionView } from "@shared/model";
import { STATIONS } from "@shared/stations";
import { LOBBY_R, MAX_DESKS, MAX_ROOMS, distinctAccents, officeLayout, roomSize, spotFor } from "./officeLayout";

const NOW = 10_000_000;
const s = (id: string, projectId: string, patch: Partial<SessionView> = {}): SessionView => ({
  id, shortId: id, projectId, title: id, titleSource: "id", cwd: "/work/app", status: "working",
  startedAt: NOW - 3_600_000, lastActivityAt: NOW - 1000, statusSince: NOW - 1000, hooksActive: false, source: "transcript",
  subagents: [], recent: [], ...patch,
});

function offices(sizes: number[]) {
  return sizes.map((n, i) => {
    const project: ProjectView = { id: `/work/p${i}`, name: `p${i}`, root: `/work/p${i}` };
    return { project, sessions: Array.from({ length: n }, (_, j) => s(`p${i}-${j}`, project.id)) };
  });
}

type R = { x0: number; x1: number; z0: number; z1: number };
const rect = (r: { x: number; z: number; w: number; d: number }): R => ({ x0: r.x - r.w / 2, x1: r.x + r.w / 2, z0: r.z - r.d / 2, z1: r.z + r.d / 2 });
const overlap = (a: R, b: R) => a.x0 < b.x1 && b.x0 < a.x1 && a.z0 < b.z1 && b.z0 < a.z1;
const inside = (p: { x: number; z: number }, r: R) => p.x >= r.x0 && p.x <= r.x1 && p.z >= r.z0 && p.z <= r.z1;

describe("officeLayout", () => {
  it("keeps rooms apart from each other and from the lobby, for 1 to MAX_ROOMS projects of mixed sizes", () => {
    for (let n = 1; n <= MAX_ROOMS; n++) {
      const { rooms } = officeLayout(offices(Array.from({ length: n }, (_, i) => 1 + ((i * 5) % MAX_DESKS))));
      expect(rooms).toHaveLength(n);
      for (const [i, r] of rooms.entries()) {
        const a = rect(r);
        const cx = Math.max(a.x0, Math.min(0, a.x1));
        const cz = Math.max(a.z0, Math.min(0, a.z1));
        expect(Math.hypot(cx, cz), `room ${i} of ${n} on the lobby`).toBeGreaterThan(LOBBY_R);
        for (const [j, q] of rooms.entries()) if (j > i) expect(overlap(a, rect(q)), `rooms ${i} and ${j} of ${n}`).toBe(false);
      }
    }
  });

  it("gives every session its own desk inside its room, and every area a spot inside the room", () => {
    const { rooms } = officeLayout(offices([1, 5, MAX_DESKS]));
    for (const r of rooms) {
      const a = rect(r);
      expect(new Set(r.desks.map((d) => `${d.x},${d.z}`)).size).toBe(r.desks.length);
      for (const d of r.desks) expect(inside(d, a)).toBe(true);
      for (const area of Object.values(r.areas)) expect(inside(area, a)).toBe(true);
      for (const st of STATIONS) for (let k = 0; k < 4; k++) expect(inside(spotFor(r, r.desks[0]!.sessionId, st, k), a), `${st} #${k}`).toBe(true);
    }
  });

  it("seats people at their own desk and on the lounge sofa; everyone else stands", () => {
    const { rooms } = officeLayout(offices([2]));
    const r = rooms[0]!;
    const id = r.desks[1]!.sessionId;
    expect(spotFor(r, id, "desk", 0)).toMatchObject({ x: r.desks[1]!.x, seated: true });
    expect(spotFor(r, id, "bench", 0).seated).toBe(true);
    expect(spotFor(r, id, "porch", 0).seated).toBe(false);
    // Two people at the same area don't stand on the same spot.
    expect(spotFor(r, id, "works", 0)).not.toEqual(spotFor(r, id, "works", 1));
  });

  it("skips projects without sessions and counts what doesn't fit", () => {
    expect(officeLayout(offices([0, 2])).rooms).toHaveLength(1);
    const big = officeLayout(offices([MAX_DESKS + 3]));
    expect(big.rooms[0]!.desks).toHaveLength(MAX_DESKS);
    expect(big.rooms[0]!.hidden).toBe(3);
    expect(officeLayout(offices(Array(MAX_ROOMS + 2).fill(1))).more).toBe(2);
  });

  it("grows a room with its desks, and gives neighbours different colours", () => {
    expect(roomSize(9).d).toBeGreaterThan(roomSize(2).d);
    expect(new Set(distinctAccents(Array.from({ length: 8 }, (_, i) => `/p/${i}`))).size).toBe(8);
  });
});
