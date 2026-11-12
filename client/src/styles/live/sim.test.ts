import { describe, expect, it } from "vitest";
import type { ProjectView, SessionView } from "@shared/model";
import { LiveSim, type SimInput } from "./sim";
import { phaseAt, tintFor } from "./lighting";
import { MARGIN, SLOT_W } from "./types";

const project = (id: string, name: string): ProjectView => ({ id, name, root: `C:\\work\\${name}` });

function session(id: string, projectId: string, patch: Partial<SessionView> = {}): SessionView {
  return {
    id, shortId: id.slice(0, 8), projectId, title: `Session ${id}`, titleSource: "id", cwd: "C:\\work",
    status: "idle", startedAt: 1000, lastActivityAt: 1000, statusSince: 1000, hooksActive: false, source: "transcript",
    subagents: [], recent: [], ...patch,
  };
}

const input = (sessions: SessionView[], projects: ProjectView[], patch: Partial<SimInput> = {}): SimInput => ({
  sessions, projects, selectedId: null, hoveredId: null, reducedMotion: false, ...patch,
});

/** Run the sim for `seconds` in small steps and return the last frame. */
function run(sim: LiveSim, i: SimInput, seconds: number) {
  let f = sim.frame(0.016, i);
  for (let t = 0; t < seconds; t += 0.05) f = sim.frame(0.05, i);
  return f;
}

describe("LiveSim", () => {
  it("lays out one place per project with sessions, in name order, and sizes the world to fit", () => {
    const projects = [project("p2", "zeta"), project("p1", "alpha"), project("p3", "empty")];
    const f = new LiveSim().frame(0.016, input([session("a", "p2"), session("b", "p1")], projects));
    expect(f.places.map((p) => p.name)).toEqual(["alpha", "zeta"]);
    expect(f.places[0]!.x).toBe(MARGIN + SLOT_W / 2);
    expect(f.worldW).toBe(Math.max(640, MARGIN * 2 + SLOT_W * 2));
  });

  it("maps session states to drawing states, labels and urgency", () => {
    const sessions = [
      session("w", "p", { status: "working", action: { kind: "write", emoji: "✏️", label: "Editing auth.ts", startedAt: 1 } }),
      session("q", "p", { status: "waiting", waitingReason: "permission", link: { connected: true, queued: 0, approval: { id: "x", tool: "Bash", label: "Running git push", since: 1 } } }),
      session("t", "p", { status: "waiting", waitingReason: "turn_end" }),
      session("d", "p", { status: "finished" }),
    ];
    const f = new LiveSim().frame(0.016, input(sessions, [project("p", "app")]));
    const by = Object.fromEntries(f.villagers.map((v) => [v.id, v]));
    expect(by.w).toMatchObject({ status: "working", label: "Editing auth.ts", urgent: false, carry: "laptop" });
    expect(by.q).toMatchObject({ status: "approval", urgent: true, linked: true });
    expect(by.q!.label).toContain("Running git push");
    expect(by.t).toMatchObject({ status: "turn", urgent: false });
    expect(by.d).toMatchObject({ status: "finished", label: "Done ✓" });
    expect(f.places[0]!.urgent).toBe(1);
  });

  it("keeps working villagers inside their place and walks others to their spot", () => {
    const sim = new LiveSim();
    const i = input([session("w", "p", { status: "working" }), session("s", "p", { status: "idle" })], [project("p", "app")]);
    const f = run(sim, i, 20);
    const place = f.places[0]!;
    for (const v of f.villagers) {
      expect(v.x).toBeGreaterThanOrEqual(place.x - 110);
      expect(v.x).toBeLessThanOrEqual(place.x + 115);
    }
    expect(f.villagers.find((v) => v.id === "s")!.moving).toBe(false);
  });

  it("stacks labels so neighbours never overlap", () => {
    const sessions = Array.from({ length: 6 }, (_, k) => session(`s${k}`, "p", { status: "idle", title: `A fairly long session title ${k}` }));
    const f = run(new LiveSim(), input(sessions, [project("p", "app")]), 3);
    const boxes = f.villagers.map((v) => {
      const half = Math.max(v.name.length * 5.4, v.label.length * 5.8) / 2 + 9;
      return { x0: v.labelX - half, x1: v.labelX + half, y0: v.labelY, y1: v.labelY + 26 };
    });
    for (let a = 0; a < boxes.length; a++) {
      for (let b = a + 1; b < boxes.length; b++) {
        const A = boxes[a]!;
        const B = boxes[b]!;
        const overlap = A.x0 < B.x1 && A.x1 > B.x0 && A.y0 < B.y1 && A.y1 > B.y0;
        expect(overlap).toBe(false);
      }
    }
  });

  it("lights a lamp for each session seen finishing, and marks selection", () => {
    const sim = new LiveSim();
    const projects = [project("p", "app")];
    sim.frame(0.016, input([session("a", "p", { status: "finished" }), session("b", "p", { status: "working" })], projects));
    const f = sim.frame(0.016, input([session("a", "p", { status: "idle" }), session("b", "p", { status: "finished" })], projects, { selectedId: "b" }));
    expect(f.lamps.lit).toBe(2);
    expect(f.villagers.find((v) => v.id === "b")!.selected).toBe(true);
  });

  it("forgets villagers whose sessions are gone", () => {
    const sim = new LiveSim();
    const projects = [project("p", "app")];
    sim.frame(0.016, input([session("a", "p"), session("b", "p")], projects));
    const f = sim.frame(0.016, input([session("b", "p")], projects));
    expect(f.villagers.map((v) => v.id)).toEqual(["b"]);
  });
});

describe("lighting", () => {
  it("knows the phases of the day", () => {
    expect([3, 6.5, 12, 18.5, 22].map(phaseAt)).toEqual(["night", "dawn", "day", "dusk", "night"]);
  });

  it("tints day styles towards later times, never brightens night styles", () => {
    expect(tintFor("day", 12)).toBeNull();
    expect(tintFor("day", 22)).not.toBeNull();
    expect(tintFor("dusk", 18.5)).toBeNull();
    expect(tintFor("dusk", 23)).not.toBeNull();
    expect(tintFor("night", 12)).toBeNull();
  });
});
