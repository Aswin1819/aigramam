import { describe, expect, it } from "vitest";
import type { CharacterInfo } from "@shared/character";
import type { WorldInfo } from "@shared/world";
import { assignmentsKey, pickCharacter } from "./characters";

const char = (id: string) => ({ id, name: id, version: "1" }) as unknown as CharacterInfo;
const cast = [char("mundu-hero"), char("shades-villain"), char("chaya-sidekick")];
const world = { def: { defaultCharacters: ["mundu-hero", "chaya-sidekick"] } } as unknown as WorldInfo;

describe("pickCharacter", () => {
  it("uses the project's chosen character for every session in it", () => {
    const a = { "C:\work\app": "shades-villain" };
    for (const id of ["s1", "s2", "s3"]) expect(pickCharacter({ id, projectId: "C:\work\app" }, world, cast, a)?.id).toBe("shades-villain");
  });

  it("falls back to the world's cast when nothing (or an uninstalled character) is chosen", () => {
    const auto = pickCharacter({ id: "s1", projectId: "p" }, world, cast)?.id;
    expect(["mundu-hero", "chaya-sidekick"]).toContain(auto);
    expect(pickCharacter({ id: "s1", projectId: "p" }, world, cast, { p: "gone-pack" })?.id).toBe(auto);
    expect(pickCharacter({ id: "s1", projectId: "p" }, null, [])).toBeNull();
  });

  it("has an order-independent key for remounting", () => {
    expect(assignmentsKey({ b: "x", a: "y" })).toBe(assignmentsKey({ a: "y", b: "x" }));
    expect(assignmentsKey(undefined)).toBe("");
  });
});
