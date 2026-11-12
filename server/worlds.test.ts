import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import express from "express";
import type { AddressInfo } from "net";
import { loadAllWorlds, loadWorldFolder } from "./worlds/loader";
import { BUILTIN_WORLDS_DIR, WorldManager } from "./worlds/manager";
import { readPngSize, safeRelativePath } from "./_core/security";
import { placeProjects, standSpots } from "@shared/placement";
import type { WorldDef } from "@shared/world";

const KERALA = path.join(BUILTIN_WORLDS_DIR, "kerala");
let tmp: string;
beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "worlds-test-"));
});
afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));

/** Copy Kerala into tmp/<folder>, then let the test change world.json. */
function makeWorld(folder: string, mutate?: (w: Record<string, any>) => void, root = tmp): string {
  const dir = path.join(root, folder);
  fs.cpSync(KERALA, dir, { recursive: true });
  const json = JSON.parse(fs.readFileSync(path.join(dir, "world.json"), "utf8"));
  json.id = folder;
  mutate?.(json);
  fs.writeFileSync(path.join(dir, "world.json"), JSON.stringify(json));
  return dir;
}

const errorsOf = (dir: string) => loadWorldFolder(dir, "user").error?.messages.join(" | ") ?? "";

describe("built-in worlds", () => {
  it("Kerala loads with no errors and every asset is a valid PNG", () => {
    const { world, error } = loadWorldFolder(KERALA, "builtin");
    expect(error).toBeUndefined();
    expect(world!.info).toMatchObject({ id: "kerala", license: "CC0-1.0", source: "builtin" });
    expect(world!.files.size).toBeGreaterThanOrEqual(10);
    for (const url of Object.values(world!.info.urls)) expect(url).toMatch(/^\/world-assets\/kerala\/assets\/[a-z_]+\.png\?v=[0-9a-f]{12}$/);
  });
});

describe("world validation", () => {
  it.each([
    ["invalid JSON", (dir: string) => fs.writeFileSync(path.join(dir, "world.json"), "{ nope"), /not valid JSON/],
    ["missing world.json", (dir: string) => fs.rmSync(path.join(dir, "world.json")), /world.json is missing/],
    ["missing name", (dir: string) => fs.writeFileSync(path.join(dir, "world.json"), JSON.stringify({ ...JSON.parse(fs.readFileSync(path.join(KERALA, "world.json"), "utf8")), id: "bad", name: undefined })), /name/],
  ])("rejects %s", (_n, breakIt, msg) => {
    const dir = makeWorld("bad");
    breakIt(dir);
    expect(errorsOf(dir)).toMatch(msg);
  });

  it.each<[string, (w: Record<string, any>) => void, RegExp]>([
    ["id not matching folder", (w) => (w.id = "other"), /must match the folder name/],
    ["path outside the folder", (w) => (w.layers[0].image = "../kerala/assets/sky.png"), /relative path inside the world folder/],
    ["absolute path", (w) => (w.layers[0].image = "C:/Windows/win.ini"), /relative path inside/],
    ["wrong file type", (w) => (w.layers[0].image = "world.json"), /must be \.png/],
    ["missing file", (w) => (w.layers[0].image = "assets/nope.png"), /not found/],
    ["unknown field (typo)", (w) => (w.layerz = []), /Unrecognized key/i],
    ["unknown effect", (w) => (w.completion = { effect: "explode" }), /completion\.effect/],
    ["bad colour", (w) => (w.palette.accent = "gold"), /palette\.accent/],
    ["duplicate location ids", (w) => (w.locations[1].id = w.locations[0].id), /ids must be unique/],
    ["too-large world size", (w) => (w.size.width = 99999), /size\.width/],
  ])("rejects %s with a clear message", (_n, mutate, msg) => {
    expect(errorsOf(makeWorld("bad", mutate))).toMatch(msg);
  });

  it("rejects fake PNGs and oversized images", () => {
    const dir = makeWorld("bad");
    fs.writeFileSync(path.join(dir, "assets", "sky.png"), "not a png at all, just text padding....");
    expect(errorsOf(dir)).toMatch(/is not a PNG image/);
    const huge = Buffer.from(fs.readFileSync(path.join(KERALA, "assets", "hut.png")));
    huge.writeUInt32BE(5000, 16);
    fs.writeFileSync(path.join(dir, "assets", "sky.png"), huge);
    expect(errorsOf(dir)).toMatch(/at most 4096×4096/);
  });

  it("rejects a folder name that isn't a valid id", () => {
    expect(errorsOf(makeWorld("Bad Name"))).toMatch(/Folder name/);
  });

  it("one broken world never blocks the others, and duplicate ids are reported", () => {
    const builtin = path.join(tmp, "builtin");
    const user = path.join(tmp, "user");
    fs.mkdirSync(builtin);
    fs.mkdirSync(user);
    makeWorld("kerala", undefined, builtin);
    makeWorld("good-one", undefined, user);
    makeWorld("broken", (w) => (w.layers = []), user);
    makeWorld("kerala", undefined, user);
    const { state } = loadAllWorlds([{ dir: builtin, kind: "builtin" }, { dir: user, kind: "user" }, { dir: path.join(tmp, "missing"), kind: "user" }]);
    expect(state.worlds.map((w) => w.id).sort()).toEqual(["good-one", "kerala"]);
    expect(state.worlds.find((w) => w.id === "kerala")!.source).toBe("builtin");
    expect(state.defaultId).toBe("kerala");
    expect(state.errors.map((e) => e.folder).sort()).toEqual(["broken", "kerala"]);
    expect(state.errors.find((e) => e.folder === "kerala")!.messages[0]).toMatch(/already installed/);
  });
});

describe("WorldManager", () => {
  it("picks up a new world folder without a restart", async () => {
    const user = path.join(tmp, "user");
    fs.mkdirSync(user);
    const m = new WorldManager([{ dir: user, kind: "user" }]);
    const seen: string[][] = [];
    m.onChange((s) => seen.push(s.worlds.map((w) => w.id)));
    m.start(200);
    try {
      expect(m.state.worlds).toEqual([]);
      makeWorld("mumbai", undefined, user);
      const t0 = Date.now();
      while (!m.state.worlds.some((w) => w.id === "mumbai") && Date.now() - t0 < 3000) await new Promise((r) => setTimeout(r, 50));
      expect(m.state.worlds.map((w) => w.id)).toEqual(["mumbai"]);
      expect(seen.at(-1)).toEqual(["mumbai"]);
      // Editing a file changes the version (cache busting).
      const v1 = m.state.worlds[0].version;
      const wj = path.join(user, "mumbai", "world.json");
      fs.writeFileSync(wj, fs.readFileSync(wj, "utf8").replace('"Kerala Backwaters"', '"Mumbai"'));
      const t1 = Date.now();
      while (m.state.worlds[0]?.version === v1 && Date.now() - t1 < 3000) await new Promise((r) => setTimeout(r, 50));
      expect(m.state.worlds[0]).toMatchObject({ name: "Mumbai" });
      expect(m.state.worlds[0].version).not.toBe(v1);
    } finally {
      m.stop();
    }
  });

  it("serves only files a valid world references", async () => {
    const user = path.join(tmp, "user");
    fs.mkdirSync(user);
    const dir = makeWorld("serve-test", undefined, user);
    fs.writeFileSync(path.join(dir, "assets", "secret.png"), fs.readFileSync(path.join(KERALA, "assets", "hut.png")));
    fs.writeFileSync(path.join(dir, "notes.txt"), "private");
    const m = new WorldManager([{ dir: user, kind: "user" }]);
    m.reload();
    const app = express();
    app.use("/world-assets", m.assetsRouter());
    const server = app.listen(0, "127.0.0.1");
    await new Promise((r) => server.once("listening", r));
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/world-assets`;
    try {
      const ok = await fetch(`${base}/serve-test/assets/hut.png?v=1`);
      expect(ok.status).toBe(200);
      expect(ok.headers.get("content-type")).toBe("image/png");
      expect(ok.headers.get("x-content-type-options")).toBe("nosniff");
      for (const bad of ["serve-test/assets/secret.png", "serve-test/notes.txt", "serve-test/world.json", "serve-test/..%2F..%2Fx", "nope/assets/hut.png"]) {
        expect((await fetch(`${base}/${bad}`)).status, bad).toBe(404);
      }
    } finally {
      server.close();
    }
  });
});

describe("path and PNG helpers", () => {
  it("safeRelativePath allows sub-folders but nothing outside", () => {
    expect(safeRelativePath(tmp, "assets/sky.png")).toBe(path.join(tmp, "assets", "sky.png"));
    expect(safeRelativePath(tmp, "assets\\sky.png")).toBe(path.join(tmp, "assets", "sky.png"));
    for (const bad of ["../x.png", "assets/../../x", "/etc/passwd", "\\\\server\\share", "C:/x.png", "a/.hidden.png", "", "a\0b"]) {
      expect(safeRelativePath(tmp, bad), bad).toBeNull();
    }
  });
  it("readPngSize reads the header and rejects non-PNGs", () => {
    expect(readPngSize(fs.readFileSync(path.join(KERALA, "assets", "hut.png")))).toEqual({ width: 160, height: 140 });
    expect(readPngSize(Buffer.from("GIF89a................."))).toBeNull();
  });
});

describe("placement", () => {
  const def = JSON.parse(fs.readFileSync(path.join(KERALA, "world.json"), "utf8")) as WorldDef;
  def.locations = def.locations.map((l) => ({ propScale: 1, slots: 4, spacing: 70, signboard: { dx: 0, dy: -120 }, ...l }));

  it("gives each project its own location, independent of order, and overflows the rest", () => {
    for (const n of [1, 3, 8, 10, 15]) {
      const ids = Array.from({ length: n }, (_, i) => `C:\\work\\project-${i}`);
      const a = placeProjects(ids, def);
      const b = placeProjects([...ids].reverse(), def);
      expect(a.size).toBe(n);
      for (const id of ids) expect(b.get(id)).toEqual(a.get(id));
      const named = [...a.values()].filter((p) => p.locationId);
      expect(new Set(named.map((p) => p.locationId)).size).toBe(named.length);
      expect(named.length).toBe(Math.min(n, def.locations.length));
      for (const p of a.values()) {
        expect(p.anchor.x).toBeGreaterThanOrEqual(0);
        expect(p.anchor.x).toBeLessThanOrEqual(def.size.width);
        expect(p.anchor.y).toBeLessThanOrEqual(def.size.height);
      }
    }
  });

  it("spreads sessions at a location without stacking them", () => {
    const p = placeProjects(["x"], def).get("x")!;
    const spots = standSpots(p, 6);
    expect(spots).toHaveLength(6);
    expect(new Set(spots.map((s) => `${s.x},${s.y}`)).size).toBe(6);
  });
});
