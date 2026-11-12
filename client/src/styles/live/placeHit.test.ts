import { describe, expect, it } from "vitest";
import type { ProjectView, SessionView } from "@shared/model";
import { buildingRect, pickPlace, type PlaceRect } from "./placeHit";
import { LiveSim, type SimInput } from "./sim";

const project = (id: string, name: string): ProjectView => ({ id, name, root: `C:\\work\\${name}` });

function session(id: string, projectId: string): SessionView {
  return {
    id, shortId: id.slice(0, 8), projectId, title: `Session ${id}`, titleSource: "id", cwd: "C:\\work",
    status: "idle", startedAt: 1000, lastActivityAt: 1000, statusSince: 1000, hooksActive: false, source: "transcript",
    subagents: [], recent: [],
  };
}

const input = (patch: Partial<SimInput> = {}): SimInput => ({
  sessions: [session("a", "p1"), session("b", "p2")],
  projects: [project("p1", "alpha"), project("p2", "beta")],
  selectedId: null, hoveredId: null, reducedMotion: false, ...patch,
});

describe("buildingRect", () => {
  it("covers walls, roof and eaves, down to just below the base", () => {
    const r = buildingRect({ id: "p", building: { x: 100, w: 150, baseY: 270, wallH: 74, roofH: 38, doorX: 192 } });
    expect(r.id).toBe("p");
    expect(r.x0).toBeLessThan(100);
    expect(r.x1).toBeGreaterThan(250);
    expect(r.y0).toBeLessThanOrEqual(270 - 74 - 38);
    expect(r.y1).toBeGreaterThan(270);
  });
});

describe("pickPlace", () => {
  const rects: PlaceRect[] = [
    { id: "a", x0: 0, y0: 0, x1: 100, y1: 100 },
    { id: "b", x0: 80, y0: 0, x1: 180, y1: 100 },
  ];
  it("returns the place under the point, or null", () => {
    expect(pickPlace(20, 50, rects)).toBe("a");
    expect(pickPlace(150, 50, rects)).toBe("b");
    expect(pickPlace(300, 50, rects)).toBeNull();
    expect(pickPlace(20, 150, rects)).toBeNull();
  });
  it("prefers the nearest centre where boxes overlap", () => {
    expect(pickPlace(85, 50, rects)).toBe("a");
    expect(pickPlace(95, 50, rects)).toBe("b");
  });
  it("hits every style building from the sim's frame (roof included)", () => {
    const f = new LiveSim().frame(0.016, input());
    const rs = f.places.map(buildingRect);
    for (const p of f.places) {
      const b = p.building;
      expect(pickPlace(b.x + b.w / 2, b.baseY - b.wallH - b.roofH + 2, rs)).toBe(p.id);
      expect(pickPlace(b.x + b.w / 2, b.baseY - 5, rs)).toBe(p.id);
    }
  });
});

describe("LiveSim selectedProjectId", () => {
  it("marks only the selected project's place", () => {
    const f = new LiveSim().frame(0.016, input({ selectedProjectId: "p2" }));
    expect(f.places.find((p) => p.id === "p2")!.selected).toBe(true);
    expect(f.places.find((p) => p.id === "p1")!.selected).toBe(false);
  });
  it("marks none when nothing is selected", () => {
    const f = new LiveSim().frame(0.016, input());
    expect(f.places.every((p) => !p.selected)).toBe(true);
  });
});
