import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import { CharacterAssignmentStore } from "./characters/assignments";
import { packSchema } from "@shared/character";

let tmp: string;
beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "gramam-chars-"));
});
afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));

describe("character choices per project", () => {
  it("saves, reloads and clears a project's character", () => {
    const file = path.join(tmp, "characters.json");
    const a = new CharacterAssignmentStore(file);
    let changes = 0;
    a.onChange = () => changes++;
    expect(a.set("C:\\work\\shop", "mundu-hero")).toBe(true);
    expect(a.set("C:\\work\\blog", "chaya-sidekick")).toBe(true);
    expect(new CharacterAssignmentStore(file).all()).toEqual({ "C:\\work\\shop": "mundu-hero", "C:\\work\\blog": "chaya-sidekick" });
    expect(a.set("C:\\work\\shop", null)).toBe(true);
    expect(new CharacterAssignmentStore(file).all()).toEqual({ "C:\\work\\blog": "chaya-sidekick" });
    expect(changes).toBe(3);
    expect(fs.readdirSync(tmp)).toEqual(["characters.json"]); // no temp files left behind
  });

  it("refuses bad ids and ignores a damaged file", () => {
    const file = path.join(tmp, "characters.json");
    const a = new CharacterAssignmentStore(file);
    expect(a.set("", "mundu-hero")).toBe(false);
    expect(a.set("C:\\x", "../../etc")).toBe(false);
    expect(a.set("C:\\x", "Has Spaces")).toBe(false);
    expect(a.all()).toEqual({});

    fs.writeFileSync(file, "{ not json");
    expect(new CharacterAssignmentStore(file).all()).toEqual({});
    fs.writeFileSync(file, JSON.stringify({ version: 1, byProject: { "C:\\ok": "mundu-hero", "C:\\bad": "<script>", "C:\\num": 5 } }));
    expect(new CharacterAssignmentStore(file).all()).toEqual({ "C:\\ok": "mundu-hero" });
  });

  it("built-in packs carry a valid colour palette", () => {
    for (const id of ["mundu-hero", "shades-villain", "chaya-sidekick"]) {
      const def = packSchema.parse(JSON.parse(fs.readFileSync(path.join(__dirname, "..", "characters", id, "pack.json"), "utf8")));
      expect(def.palette, id).toMatchObject({ shirt: expect.stringMatching(/^#[0-9a-f]{6}$/), lower: expect.any(String), skin: expect.any(String), hair: expect.any(String) });
    }
    expect(() => packSchema.shape.palette.parse({ shirt: "red", lower: "#000000", skin: "#000000", hair: "#000000" })).toThrow();
  });
});
