/**
 * Loads and validates world packs from the shipped `worlds/` folder and the
 * user's `~/.claude-dungeon/worlds`. Read-only. A broken pack is reported
 * with readable errors and skipped; it never stops the others from loading.
 */
import crypto from "crypto";
import fs from "fs";
import path from "path";
import type { ZodError } from "zod";
import { worldSchema, type PackError, type WorldDef, type WorldInfo, type WorldsState } from "@shared/world";
import { readPngSize, safeRelativePath } from "../_core/security";

export const LIMITS = {
  worldJsonBytes: 256 * 1024,
  pngBytes: 4 * 1024 * 1024,
  pngSide: 4096,
  soundBytes: 1024 * 1024,
  packBytes: 30 * 1024 * 1024,
  packEntries: 500,
};

const ID_RE = /^[a-z0-9-]{1,40}$/;
const IMAGE_EXT = new Set([".png"]);
const SOUND_EXT = new Set([".ogg", ".mp3", ".wav"]);

export const CONTENT_TYPES: Record<string, string> = {
  ".png": "image/png",
  ".ogg": "audio/ogg",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
};

export interface Source {
  dir: string;
  kind: "builtin" | "user";
}

export interface LoadedWorld {
  info: WorldInfo;
  dir: string;
  /** Absolute paths of the files this world references; the only ones we serve. */
  files: Map<string, string>;
}

export function formatZodError(e: ZodError): string[] {
  return e.issues.slice(0, 20).map((i) => {
    const where = i.path.length ? i.path.join(".") : "(root)";
    const missing = /^Invalid input: expected (\w+), received undefined$/.exec(i.message);
    return missing ? `${where}: is missing (expected ${missing[1]})` : `${where}: ${i.message}`;
  });
}

/** Every file a world.json points at, with the kind of file it must be. */
function referencedFiles(def: WorldDef): Array<{ rel: string; kind: "image" | "sound"; where: string }> {
  const out: Array<{ rel: string; kind: "image" | "sound"; where: string }> = [];
  def.layers.forEach((l, i) => out.push({ rel: l.image, kind: "image", where: `layers.${i}.image` }));
  def.locations.forEach((l, i) => l.prop && out.push({ rel: l.prop, kind: "image", where: `locations.${i}.prop` }));
  if (def.overflow?.prop) out.push({ rel: def.overflow.prop, kind: "image", where: "overflow.prop" });
  if (def.completion?.sound) out.push({ rel: def.completion.sound, kind: "sound", where: "completion.sound" });
  return out;
}

/** Total size of a folder, stopping early when limits are exceeded. */
function folderSize(dir: string): { bytes: number; entries: number; symlinks: number } {
  let bytes = 0, entries = 0, symlinks = 0;
  const stack = [dir];
  while (stack.length && entries <= LIMITS.packEntries && bytes <= LIMITS.packBytes) {
    const d = stack.pop()!;
    let list: fs.Dirent[];
    try {
      list = fs.readdirSync(d, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of list) {
      entries++;
      const p = path.join(d, e.name);
      if (e.isSymbolicLink()) symlinks++;
      else if (e.isDirectory()) stack.push(p);
      else if (e.isFile()) try { bytes += fs.statSync(p).size; } catch {}
    }
  }
  return { bytes, entries, symlinks };
}

export function loadWorldFolder(dir: string, source: Source["kind"]): { world?: LoadedWorld; error?: PackError } {
  const folder = path.basename(dir);
  const fail = (messages: string[]) => ({ error: { folder, source, messages } });

  if (!ID_RE.test(folder)) return fail([`Folder name "${folder}" must be lowercase letters, digits and - (it is the world id)`]);
  const jsonPath = path.join(dir, "world.json");
  let raw: string;
  try {
    const st = fs.lstatSync(jsonPath);
    if (!st.isFile()) return fail(["world.json is not a regular file"]);
    if (st.size > LIMITS.worldJsonBytes) return fail([`world.json is too big (${st.size} bytes, max ${LIMITS.worldJsonBytes})`]);
    raw = fs.readFileSync(jsonPath, "utf8").replace(/^﻿/, "");
  } catch {
    return fail(["world.json is missing"]);
  }
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch (e) {
    return fail([`world.json is not valid JSON: ${(e as Error).message}`]);
  }
  const parsed = worldSchema.safeParse(json);
  if (!parsed.success) return fail(formatZodError(parsed.error));
  const def = parsed.data;
  const errors: string[] = [];
  if (def.id !== folder) errors.push(`id "${def.id}" must match the folder name "${folder}"`);
  if (new Set(def.locations.map((l) => l.id)).size !== def.locations.length) errors.push("locations: ids must be unique");
  if (new Set(def.layers.map((l) => l.id)).size !== def.layers.length) errors.push("layers: ids must be unique");

  const size = folderSize(dir);
  if (size.entries > LIMITS.packEntries) errors.push(`too many files (max ${LIMITS.packEntries})`);
  if (size.bytes > LIMITS.packBytes) errors.push(`folder is too big (max ${LIMITS.packBytes / 1024 / 1024} MB)`);
  if (size.symlinks > 0) errors.push("symbolic links are not allowed in a pack");

  const files = new Map<string, string>();
  const hash = crypto.createHash("sha1").update(raw);
  for (const ref of referencedFiles(def)) {
    const abs = safeRelativePath(dir, ref.rel);
    if (!abs) {
      errors.push(`${ref.where}: "${ref.rel}" must be a relative path inside the world folder`);
      continue;
    }
    const ext = path.extname(abs).toLowerCase();
    const allowed = ref.kind === "image" ? IMAGE_EXT : SOUND_EXT;
    if (!allowed.has(ext)) {
      errors.push(`${ref.where}: "${ref.rel}" must be ${[...allowed].join(" / ")}`);
      continue;
    }
    let st: fs.Stats;
    try {
      st = fs.lstatSync(abs);
    } catch {
      errors.push(`${ref.where}: file "${ref.rel}" not found`);
      continue;
    }
    if (!st.isFile()) {
      errors.push(`${ref.where}: "${ref.rel}" is not a regular file`);
      continue;
    }
    if (ref.kind === "image") {
      if (st.size > LIMITS.pngBytes) {
        errors.push(`${ref.where}: "${ref.rel}" is too big (max ${LIMITS.pngBytes / 1024 / 1024} MB)`);
        continue;
      }
      const head = Buffer.alloc(24);
      try {
        const fd = fs.openSync(abs, "r");
        fs.readSync(fd, head, 0, 24, 0);
        fs.closeSync(fd);
      } catch {}
      const dims = readPngSize(head);
      if (!dims) {
        errors.push(`${ref.where}: "${ref.rel}" is not a PNG image`);
        continue;
      }
      if (dims.width < 1 || dims.height < 1 || dims.width > LIMITS.pngSide || dims.height > LIMITS.pngSide) {
        errors.push(`${ref.where}: "${ref.rel}" is ${dims.width}×${dims.height}; images must be at most ${LIMITS.pngSide}×${LIMITS.pngSide}`);
        continue;
      }
    } else if (st.size > LIMITS.soundBytes) {
      errors.push(`${ref.where}: "${ref.rel}" is too big (max 1 MB)`);
      continue;
    }
    const key = ref.rel.replace(/\\/g, "/");
    files.set(key, abs);
    hash.update(`${key}:${st.size}:${st.mtimeMs}`);
  }
  if (errors.length) return fail(errors);

  const version = hash.digest("hex").slice(0, 12);
  const urls: Record<string, string> = {};
  for (const key of files.keys()) urls[key] = `/world-assets/${def.id}/${key.split("/").map(encodeURIComponent).join("/")}?v=${version}`;
  return {
    world: {
      dir,
      files,
      info: { id: def.id, name: def.name, author: def.author, license: def.license, description: def.description, source, version, def, urls },
    },
  };
}

export function loadAllWorlds(sources: Source[]): { state: WorldsState; loaded: Map<string, LoadedWorld> } {
  const loaded = new Map<string, LoadedWorld>();
  const errors: PackError[] = [];
  for (const src of sources) {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(src.dir, { withFileTypes: true });
    } catch {
      continue; // folder doesn't exist (yet)
    }
    for (const e of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      if (!e.isDirectory() || e.name.startsWith(".")) continue;
      const { world, error } = loadWorldFolder(path.join(src.dir, e.name), src.kind);
      if (error) errors.push(error);
      else if (world) {
        if (loaded.has(world.info.id)) {
          errors.push({ folder: e.name, source: src.kind, messages: [`a world with id "${world.info.id}" is already installed`] });
        } else {
          loaded.set(world.info.id, world);
        }
      }
    }
  }
  const worlds = [...loaded.values()].map((w) => w.info).sort((a, b) => a.name.localeCompare(b.name));
  const defaultId = loaded.has("kerala") ? "kerala" : worlds[0]?.id ?? "";
  return { state: { worlds, errors, defaultId }, loaded };
}
