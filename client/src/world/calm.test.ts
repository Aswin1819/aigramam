import { describe, expect, it } from "vitest";
import { calmKind, MIN_HOLD_MS, sceneKindFallback } from "./calm";

describe("calm villager poses", () => {
  it("holds an activity through quick tool calls, then follows", () => {
    let h = calmKind(null, "read", 0);
    h = calmKind(h, "write", 400);
    expect(h).toEqual({ kind: "read", since: 0 });
    h = calmKind(h, "bash", MIN_HOLD_MS - 1);
    expect(h.kind).toBe("read");
    h = calmKind(h, "bash", MIN_HOLD_MS);
    expect(h).toEqual({ kind: "bash", since: MIN_HOLD_MS });
  });

  it("shows states the person must see at once", () => {
    for (const k of ["waiting", "question", "error", "done", "idle"] as const) {
      expect(calmKind({ kind: "write", since: 0 }, k, 10).kind).toBe(k);
    }
    expect(calmKind({ kind: "waiting", since: 0 }, "read", 10).kind).toBe("read");
  });

  it("falls back from test to bash for worlds without a test scene", () => {
    expect(sceneKindFallback("test", (k) => k === "bash")).toBe("bash");
    expect(sceneKindFallback("test", () => true)).toBe("test");
    expect(sceneKindFallback("read", () => false)).toBe("read");
  });
});
