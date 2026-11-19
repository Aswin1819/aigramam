import { describe, expect, it } from "vitest";
import { lookOf } from "./humans";

const ids = Array.from({ length: 400 }, (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`);

describe("lookOf", () => {
  it("is stable: the same session always looks the same", () => {
    expect(lookOf(ids[3]!, "#7aa2f7")).toEqual(lookOf(ids[3]!, "#7aa2f7"));
  });

  it("varies across people: skin tones, hair, outfits, glasses and builds all show up", () => {
    const looks = ids.map((id) => lookOf(id, "#7aa2f7"));
    expect(new Set(looks.map((l) => l.skin)).size).toBeGreaterThanOrEqual(6);
    expect(new Set(looks.map((l) => l.hair)).size).toBe(6);
    expect(new Set(looks.map((l) => l.outfit)).size).toBe(5);
    expect(looks.some((l) => l.glasses)).toBe(true);
    expect(looks.some((l) => !l.glasses)).toBe(true);
    for (const l of looks) {
      expect(l.height).toBeGreaterThanOrEqual(0.95);
      expect(l.height).toBeLessThanOrEqual(1.05);
      expect(l.skin).toMatch(/^#[0-9a-f]{6}$/);
      expect(l.top).toMatch(/^#[0-9a-f]{6}$/);
    }
  });

  it("dresses people in their project's colour, helpers in a lighter tint, and gives a mundu its white cloth", () => {
    const a = lookOf(ids[0]!, "#bb9af7");
    const helper = lookOf(ids[0]!, "#bb9af7", true);
    expect(a.top).not.toBe(helper.top);
    const lum = (hex: string) => [1, 3, 5].reduce((s, i) => s + parseInt(hex.slice(i, i + 2), 16), 0);
    expect(lum(helper.top)).toBeGreaterThan(lum(a.top));
    const mundu = ids.map((id) => lookOf(id, "#bb9af7")).find((l) => l.outfit === "mundu");
    expect(mundu?.bottom).toBe("#f4efe3");
  });
});
