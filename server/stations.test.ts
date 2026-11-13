import { describe, expect, it } from "vitest";
import type { SessionView } from "@shared/model";
import { DWELL_MS, MOVE_GAP_MS, PlaceKeeper, StationKeeper, plotWidth, stationIndexes, stationSpot, wantedStation } from "@shared/stations";

const working = (kind: string) => ({ status: "working" as const, action: { kind, emoji: "", label: "", startedAt: 0 } }) as Pick<SessionView, "status" | "waitingReason" | "action">;

describe("stations", () => {
  it("maps each activity and state to a station", () => {
    expect(wantedStation(working("read"))).toBe("study");
    expect(wantedStation(working("search"))).toBe("study");
    expect(wantedStation(working("write"))).toBe("desk");
    expect(wantedStation(working("delegate"))).toBe("desk");
    expect(wantedStation(working("bash"))).toBe("works");
    expect(wantedStation(working("test"))).toBe("works");
    expect(wantedStation(working("web"))).toBe("gate");
    expect(wantedStation(working("think"))).toBeNull();
    expect(wantedStation({ status: "waiting", waitingReason: "permission" })).toBe("porch");
    expect(wantedStation({ status: "waiting", waitingReason: "question" })).toBe("porch");
    expect(wantedStation({ status: "waiting", waitingReason: "turn_end" })).toBe("bench");
    expect(wantedStation({ status: "idle" })).toBe("bench");
    expect(wantedStation({ status: "error" })).toBeNull();
  });

  it("walks to a work station only after the activity lasts, at most once per gap", () => {
    const k = new StationKeeper();
    expect(k.stationOf("a", "study", 0)).toBe("study");
    expect(k.stationOf("a", "desk", 1000)).toBe("study"); // a quick edit: stays
    expect(k.stationOf("a", "study", 1500)).toBe("study");
    expect(k.stationOf("a", "desk", 2000)).toBe("study");
    expect(k.stationOf("a", "desk", 2000 + DWELL_MS)).toBe("study"); // dwelled, but moved too recently
    expect(k.stationOf("a", "desk", MOVE_GAP_MS)).toBe("desk");
    expect(k.stationOf("a", null, MOVE_GAP_MS + 100)).toBe("desk"); // thinking or error: stays put
  });

  it("goes to the porch or bench at once, and back to work at once", () => {
    const k = new StationKeeper();
    k.stationOf("a", "works", 0);
    expect(k.stationOf("a", "porch", 100)).toBe("porch");
    expect(k.stationOf("a", "study", 200)).toBe("study");
    expect(k.stationOf("a", "bench", 300)).toBe("bench");
  });

  it("lays out stations inside the plot without overlapping", () => {
    const plot = { x: 500, y: 700, w: 300 };
    const spots = [0, 1, 2, 3, 4, 5, 6, 7].map((i) => stationSpot(plot, "desk", i));
    for (const s of spots) expect(Math.abs(s.x - 500)).toBeLessThanOrEqual(136);
    expect(new Set(spots.map((s) => `${s.x},${s.y}`)).size).toBe(spots.length);
    expect(stationSpot(plot, "study", 0).x).toBeLessThan(stationSpot(plot, "works", 0).x);
    expect(stationSpot(plot, "porch", 0).y).toBeGreaterThan(stationSpot(plot, "desk", 0).y);
  });

  it("sizes plots clear of neighbours on the same row", () => {
    const a = { x: 250, y: 715 };
    const row = [a, { x: 640, y: 715 }, { x: 330, y: 975 }];
    expect(plotWidth(a, row)).toBe(320);
    expect(plotWidth({ x: 640, y: 715 }, [{ x: 640, y: 715 }, { x: 900, y: 720 }])).toBe(230);
  });

  it("orders sessions at a station by start time", () => {
    const idx = stationIndexes([
      { id: "b", station: "desk", startedAt: 5 },
      { id: "a", station: "desk", startedAt: 9 },
      { id: "c", station: "study", startedAt: 1 },
    ]);
    expect([idx.get("b"), idx.get("a"), idx.get("c")]).toEqual([0, 1, 0]);
  });
});

describe("place keeper", () => {
  it("keeps a project's slot while others come and go", () => {
    const k = new PlaceKeeper(60_000);
    const first = k.assign(["p1", "p2"], 4, 0, (id) => (id === "p1" ? 1 : 1));
    expect(first.get("p1")).toBe(1);
    expect(first.get("p2")).toBe(2);
    // p1 stops: p2 keeps slot 2, and p1's slot is held for the grace period.
    expect(k.assign(["p2", "p3"], 4, 1000, () => 1).get("p2")).toBe(2);
    expect(k.assign(["p2", "p3"], 4, 1000, () => 1).get("p3")).toBe(3);
    expect(k.assign(["p1", "p2", "p3"], 4, 5000).get("p1")).toBe(1);
  });

  it("frees a slot after the grace period, and overflows when full", () => {
    const k = new PlaceKeeper(1000);
    k.assign(["a"], 1, 0, () => 0);
    expect(k.assign(["b"], 1, 500, () => 0).get("b")).toBeNull();
    expect(k.assign(["b"], 1, 2000, () => 0).get("b")).toBe(0);
  });
});
