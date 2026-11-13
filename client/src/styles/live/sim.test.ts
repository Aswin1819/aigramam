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
    expect(by.w).toMatchObject({ status: "working", label: "✏️ Editing auth.ts", urgent: false, carry: "laptop" });
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

  it("never wanders: a working villager stands still at its station", () => {
    const sim = new LiveSim();
    const i = input([session("w", "p", { status: "working", action: { kind: "read", emoji: "📖", label: "Reading a.ts", startedAt: 1 } })], [project("p", "app")]);
    run(sim, i, 5);
    const xs = new Set<number>();
    for (let k = 0; k < 60; k++) xs.add(Math.round(sim.frame(0.05, i).villagers[0]!.x));
    expect(xs.size).toBe(1);
  });

  it("keeps each project's place when another project stops", () => {
    const sim = new LiveSim();
    const projects = [project("p1", "alpha"), project("p2", "beta"), project("p3", "gamma")];
    const all = input([session("a", "p1"), session("b", "p2"), session("c", "p3")], projects);
    const before = sim.frame(0.016, all).places.find((p) => p.id === "p3")!.x;
    const after = sim.frame(0.016, input([session("a", "p1"), session("c", "p3")], projects)).places.find((p) => p.id === "p3")!.x;
    expect(after).toBe(before);
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

describe("chosen characters", () => {
  it("dress villagers in the chosen character's palette, and only those", () => {
    const pal = { shirt: "#111111", lower: "#222222", skin: "#333333", hair: "#444444" };
    const sessions = [session("a", "p1"), session("b", "p2")];
    const f = new LiveSim().frame(0.016, input(sessions, [project("p1", "one"), project("p2", "two")], { paletteOf: (s) => (s.projectId === "p1" ? pal : undefined) }));
    const a = f.villagers.find((v) => v.id === "a")!;
    const b = f.villagers.find((v) => v.id === "b")!;
    expect(a).toMatchObject({ shirt: "#111111", mundu: "#222222", skin: "#333333", hair: "#444444" });
    expect(b.shirt).not.toBe("#111111");
  });
});

describe("companions (subagents)", () => {
  const sub = (id: string, kind: string, status: "working" | "waiting" | "finished" = "working") => ({
    id, sessionId: "s", agentType: "Explore", description: "map the code", status,
    action: { kind: kind as never, emoji: "", label: `${kind} thing`, startedAt: 1 }, startedAt: 1, lastActivityAt: 1,
  });

  it("go on errands for reading: out, work at the spot, back, hand over", () => {
    const sim = new LiveSim();
    const projects = [project("p", "app")];
    const i = input([session("s", "p", { status: "working", subagents: [sub("a1", "read")] })], projects, { reducedMotion: false });
    const seen = new Set<string>();
    let maxAway = 0;
    let handover = false;
    for (let k = 0; k < 400; k++) {
      const c = sim.frame(0.05, i).villagers[0]!.companions[0]!;
      seen.add(c.moving ? "walk" : c.working ? "work" : "home");
      maxAway = Math.max(maxAway, c.away);
      if (c.handover > 0) handover = true;
      expect(c.label).toBe("Explore · read thing");
      expect(c.activity).toBe("errand");
    }
    expect([...seen].sort()).toEqual(["home", "walk", "work"]);
    expect(maxAway).toBe(1);
    expect(handover).toBe(true);
  });

  it("work beside the villager when writing, and get distinct slots", () => {
    const f = run(new LiveSim(), input([session("s", "p", { status: "working", subagents: [sub("w1", "write"), sub("w2", "bash")] })], [project("p", "app")]), 2);
    const [a, b] = f.villagers[0]!.companions;
    expect(a!.activity).toBe("busy");
    expect(a!.working).toBe(true);
    expect(Math.sign(a!.x - f.villagers[0]!.x)).not.toBe(Math.sign(b!.x - f.villagers[0]!.x));
  });

  it("hop and run off when finished, then are forgotten", () => {
    const sim = new LiveSim();
    const projects = [project("p", "app")];
    run(sim, input([session("s", "p", { subagents: [sub("x", "search")] })], projects), 1);
    const done = input([session("s", "p", { subagents: [sub("x", "search", "finished")] })], projects);
    const leaving = sim.frame(0.05, done).villagers[0]!.companions[0]!;
    expect(leaving.activity).toBe("leaving");
    expect(run(sim, done, 2).villagers[0]!.companions).toEqual([]);
  });

  it("stand still beside the villager with reduced motion", () => {
    const f = run(new LiveSim(), input([session("s", "p", { subagents: [sub("r", "web")] })], [project("p", "app")], { reducedMotion: true }), 5);
    const c = f.villagers[0]!.companions[0]!;
    expect(c.moving).toBe(false);
    expect(c.away).toBe(0);
  });
});

describe("companion errands near the world's edge", () => {
  it("never walk out of the world", () => {
    const sim = new LiveSim();
    const sub = { id: "edge", sessionId: "s", agentType: "Explore", description: "", status: "working" as const, action: { kind: "web" as const, emoji: "", label: "fetch", startedAt: 1 }, startedAt: 1, lastActivityAt: 1 };
    const sessions = Array.from({ length: 3 }, (_, k) => session(`s${k}`, "p", { status: "working", subagents: k === 2 ? [sub] : [] }));
    const i = input(sessions, [project("p", "app")]);
    for (let k = 0; k < 300; k++) {
      const f = sim.frame(0.05, i);
      for (const v of f.villagers) for (const c of v.companions) {
        expect(c.x).toBeGreaterThanOrEqual(0);
        expect(c.x).toBeLessThanOrEqual(f.worldW);
      }
    }
  });
});
