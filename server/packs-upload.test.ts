import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import express from "express";
import type { Server } from "http";
import type { AddressInfo } from "net";
import { zipSync, type Zippable } from "fflate";
import { createPackUploadRouter, cleanEntryName, UPLOAD_LIMITS, type UploadDirs } from "./packs/upload";
import { BUILTIN_CHARACTERS_DIR, BUILTIN_WORLDS_DIR, CharacterManager } from "./worlds/manager";

const KERALA = path.join(BUILTIN_WORLDS_DIR, "kerala");
const HERO = path.join(BUILTIN_CHARACTERS_DIR, "mundu-hero");

/** Every file of a folder as zip entries under `prefix`. */
function folderEntries(dir: string, prefix = ""): Zippable {
  const out: Zippable = {};
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, e.name);
    if (e.isDirectory()) Object.assign(out, folderEntries(abs, `${prefix}${e.name}/`));
    else out[`${prefix}${e.name}`] = new Uint8Array(fs.readFileSync(abs));
  }
  return out;
}

const json = (v: unknown) => new Uint8Array(Buffer.from(JSON.stringify(v)));

function worldZip(id: string, mutate?: (w: Record<string, any>) => void, prefix = ""): Zippable {
  const files = folderEntries(KERALA, prefix);
  const w = JSON.parse(fs.readFileSync(path.join(KERALA, "world.json"), "utf8"));
  w.id = id;
  w.name = `World ${id}`;
  mutate?.(w);
  files[`${prefix}world.json`] = json(w);
  return files;
}

function heroZip(id: string, name = `Hero ${id}`, prefix = ""): Zippable {
  const files = folderEntries(HERO, prefix);
  const p = JSON.parse(fs.readFileSync(path.join(HERO, "pack.json"), "utf8"));
  files[`${prefix}pack.json`] = json({ ...p, id, name });
  return files;
}

let tmp: string;
let dirs: UploadDirs;
let server: Server;
let base: string;

beforeAll(async () => {
  const app = express();
  app.use("/api/packs", createPackUploadRouter(() => dirs));
  server = app.listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/packs/upload`;
});
afterAll(() => new Promise((r) => server.close(r)));

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "packs-upload-test-"));
  dirs = {
    world: { builtin: BUILTIN_WORLDS_DIR, user: path.join(tmp, "worlds") },
    character: { builtin: BUILTIN_CHARACTERS_DIR, user: path.join(tmp, "characters") },
    backups: path.join(tmp, "backups"),
  };
});
afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));

async function upload(kind: string, body: Uint8Array | Zippable, opts: { replace?: boolean; headers?: Record<string, string> } = {}) {
  const data = body instanceof Uint8Array ? body : zipSync(body);
  const res = await fetch(`${base}?kind=${kind}&replace=${opts.replace ? 1 : 0}`, {
    method: "POST",
    headers: { "Content-Type": "application/zip", ...opts.headers },
    body: data,
  });
  return { status: res.status, body: (await res.json()) as { ok: boolean; error?: string; id?: string; name?: string; kind?: string; exists?: boolean } };
}

/** Nothing staged may be left behind in the user folder. */
function leftovers(kind: "world" | "character") {
  const dir = dirs[kind].user;
  return fs.existsSync(dir) ? fs.readdirSync(dir).filter((n) => n.startsWith(".incoming")) : [];
}

describe("pack upload: installs", () => {
  it("installs a valid world zip", async () => {
    const r = await upload("world", worldZip("my-world"));
    expect(r).toMatchObject({ status: 200, body: { ok: true, id: "my-world", name: "World my-world", kind: "world" } });
    const dir = path.join(dirs.world.user, "my-world");
    expect(fs.existsSync(path.join(dir, "world.json"))).toBe(true);
    expect(fs.readdirSync(path.join(dir, "assets")).length).toBeGreaterThan(5);
    expect(leftovers("world")).toEqual([]);
  });

  it("installs a character zip from inside one top-level folder, skipping OS junk", async () => {
    const files = heroZip("zip-hero", "Zip Hero", "Zip Hero v2/");
    files["__MACOSX/Zip Hero v2/._pack.json"] = new Uint8Array([1, 2, 3]);
    files["Zip Hero v2/.DS_Store"] = new Uint8Array([0]);
    files["Zip Hero v2/Thumbs.db"] = new Uint8Array([0]);
    files["Zip Hero v2/README.md"] = new Uint8Array(Buffer.from("# hi"));
    const r = await upload("character", files);
    expect(r.body).toMatchObject({ ok: true, id: "zip-hero", name: "Zip Hero", kind: "character" });
    expect(fs.readdirSync(path.join(dirs.character.user, "zip-hero")).sort()).toEqual(["README.md", "pack.json", "sprites.png"]);
  });

  it("the CharacterManager picks the new pack up by itself", async () => {
    const mgr = new CharacterManager([{ dir: dirs.character.builtin, kind: "builtin" }, { dir: dirs.character.user, kind: "user" }]);
    mgr.start(100);
    try {
      expect(mgr.state.characters.some((c) => c.id === "live-hero")).toBe(false);
      await upload("character", heroZip("live-hero"));
      await expect.poll(() => mgr.state.characters.find((c) => c.id === "live-hero")?.source, { timeout: 3000 }).toBe("user");
    } finally {
      mgr.stop();
    }
  });
});

describe("pack upload: rejects", () => {
  it.each([
    ["../x.png", /outside the pack/],
    ["a/../../x.png", /outside the pack/],
    ["..\\x.png", /outside the pack/],
    ["/etc/x.png", /absolute path/],
    ["C:/Windows/x.png", /absolute path/],
    ["C:x.png", /absolute path/],
  ])("path %s", async (bad, msg) => {
    const files = heroZip("evil-hero");
    files[bad] = new Uint8Array([1]);
    const r = await upload("character", files);
    expect(r.status).toBe(400);
    expect(r.body.error).toMatch(msg);
    expect(fs.existsSync(path.join(dirs.character.user, "evil-hero"))).toBe(false);
    expect(leftovers("character")).toEqual([]);
  });

  it("names with NUL / Windows-reserved names", () => {
    expect(cleanEntryName("a\0b.png")).toHaveProperty("error");
    expect(cleanEntryName("CON.png")).toHaveProperty("error");
    expect(cleanEntryName("x:stream.png")).toHaveProperty("error");
    expect(cleanEntryName("./a//b.png")).toEqual({ path: "a/b.png" });
    expect(cleanEntryName("dir/")).toBe("skip");
  });

  it("a disallowed file type", async () => {
    const files = heroZip("exe-hero");
    files["run.exe"] = new Uint8Array([0x4d, 0x5a]);
    const r = await upload("character", files);
    expect(r.status).toBe(400);
    expect(r.body.error).toMatch(/\.exe files aren't allowed/);
  });

  it("a manifest naming a file that isn't in the zip", async () => {
    const r = await upload("world", worldZip("holey", (w) => (w.layers[0].image = "assets/missing.png")));
    expect(r.status).toBe(400);
    expect(r.body.error).toMatch(/aren't in the zip.*assets\/missing\.png/);
    expect(leftovers("world")).toEqual([]);
  });

  it("an invalid manifest (schema) and a manifest that fails the loader's checks", async () => {
    const bad = await upload("world", worldZip("typo", (w) => (w.layerz = [])));
    expect(bad.body.error).toMatch(/Unrecognized key/i);
    const files = heroZip("fake-png");
    files["sprites.png"] = new Uint8Array(Buffer.from("not a png"));
    const fake = await upload("character", files);
    expect(fake.status).toBe(400);
    expect(fake.body.error).toMatch(/not a PNG/);
    expect(leftovers("character")).toEqual([]);
  });

  it("a zip without the manifest, or with it two folders deep", async () => {
    expect((await upload("character", { "a.png": new Uint8Array([1]) })).body.error).toMatch(/pack\.json must be at the top/);
    expect((await upload("character", heroZip("deep", "Deep", "a/b/"))).body.error).toMatch(/pack\.json must be at the top/);
    expect((await upload("world", heroZip("wrong-kind"))).body.error).toMatch(/world\.json must be at the top/);
  });

  it("oversized files, too many entries and a zip bomb", async () => {
    const big = heroZip("big-hero");
    big["huge.txt"] = new Uint8Array(UPLOAD_LIMITS.fileBytes + 1); // zeros: compresses to almost nothing
    const r1 = await upload("character", big);
    expect(r1.status).toBe(413);
    expect(r1.body.error).toMatch(/too big/);

    const many = heroZip("many-hero");
    for (let i = 0; i < UPLOAD_LIMITS.entries; i++) many[`n/${i}.txt`] = new Uint8Array([1]);
    const r2 = await upload("character", many);
    expect(r2.status).toBe(413);
    expect(r2.body.error).toMatch(/too many entries/);

    const bomb = heroZip("bomb-hero");
    for (let i = 0; i < 4; i++) bomb[`b${i}.txt`] = new Uint8Array(UPLOAD_LIMITS.fileBytes - 10);
    const r3 = await upload("character", bomb);
    expect(r3.status).toBe(413);
    expect(r3.body.error).toMatch(/too big once unzipped/);
    expect(leftovers("character")).toEqual([]);
    expect(fs.existsSync(dirs.character.user) ? fs.readdirSync(dirs.character.user) : []).toEqual([]);
  });

  it("a body that isn't a zip, the wrong content type, a bad kind, and a cross-site origin", async () => {
    expect((await upload("character", new Uint8Array(Buffer.from("hello")))).body.error).toMatch(/readable \.zip/);
    expect((await upload("character", heroZip("x"), { headers: { "Content-Type": "text/plain" } })).status).toBe(415);
    expect((await upload("plugin", heroZip("x"))).status).toBe(400);
    expect((await upload("character", heroZip("x"), { headers: { Origin: "https://evil.example" } })).status).toBe(403);
    expect((await upload("character", heroZip("ok-origin"), { headers: { Origin: "http://localhost:4317" } })).body.ok).toBe(true);
  });
});

describe("pack upload: existing ids", () => {
  it("refuses an existing id with 409, then replaces it and backs up the old one", async () => {
    expect((await upload("character", heroZip("dup-hero", "First"))).body.ok).toBe(true);
    const again = await upload("character", heroZip("dup-hero", "Second"));
    expect(again).toMatchObject({ status: 409, body: { ok: false, exists: true } });
    expect(JSON.parse(fs.readFileSync(path.join(dirs.character.user, "dup-hero", "pack.json"), "utf8")).name).toBe("First");

    const replaced = await upload("character", heroZip("dup-hero", "Second"), { replace: true });
    expect(replaced.body).toMatchObject({ ok: true, name: "Second" });
    expect(JSON.parse(fs.readFileSync(path.join(dirs.character.user, "dup-hero", "pack.json"), "utf8")).name).toBe("Second");
    const backups = fs.readdirSync(dirs.backups);
    expect(backups).toHaveLength(1);
    expect(backups[0]).toMatch(/^character-dup-hero-/);
    expect(JSON.parse(fs.readFileSync(path.join(dirs.backups, backups[0], "pack.json"), "utf8")).name).toBe("First");
    expect(leftovers("character")).toEqual([]);
  });

  it("a broken replacement leaves the installed pack alone", async () => {
    await upload("character", heroZip("keep-hero", "Keep"));
    const files = heroZip("keep-hero", "Broken");
    files["sprites.png"] = new Uint8Array(Buffer.from("nope"));
    expect((await upload("character", files, { replace: true })).status).toBe(400);
    expect(JSON.parse(fs.readFileSync(path.join(dirs.character.user, "keep-hero", "pack.json"), "utf8")).name).toBe("Keep");
    expect(fs.existsSync(dirs.backups)).toBe(false);
  });

  it("never replaces a built-in pack", async () => {
    for (const replace of [false, true]) {
      const r = await upload("character", heroZip("mundu-hero"), { replace });
      expect(r.status).toBe(409);
      expect(r.body.error).toMatch(/built-in/);
    }
    expect((await upload("world", worldZip("kerala"), { replace: true })).body.error).toMatch(/built-in/);
    expect(fs.existsSync(path.join(dirs.character.user, "mundu-hero"))).toBe(false);
  });
});
