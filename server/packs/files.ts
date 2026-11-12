/**
 * File checks shared by world and character packs: every referenced file must
 * be a real file inside the pack folder, of an allowed type and size.
 */
import crypto from "crypto";
import fs from "fs";
import path from "path";
import type { ZodError } from "zod";
import { readPngSize, safeRelativePath } from "../_core/security";

export const LIMITS = {
  jsonBytes: 256 * 1024,
  pngBytes: 4 * 1024 * 1024,
  pngSide: 4096,
  soundBytes: 1024 * 1024,
  packBytes: 30 * 1024 * 1024,
  packEntries: 500,
};

export const ID_RE = /^[a-z0-9-]{1,40}$/;
const EXT: Record<"image" | "sound" | "json", Set<string>> = {
  image: new Set([".png"]),
  sound: new Set([".ogg", ".mp3", ".wav"]),
  json: new Set([".json"]),
};

export const CONTENT_TYPES: Record<string, string> = {
  ".png": "image/png",
  ".ogg": "audio/ogg",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".json": "application/json",
};

export interface FileRef {
  rel: string;
  kind: "image" | "sound" | "json";
  where: string;
  /** Extra limits for images (e.g. sprite sheets). */
  maxBytes?: number;
  maxSide?: number;
}

export interface CheckedFiles {
  files: Map<string, string>;
  dims: Map<string, { width: number; height: number }>;
  errors: string[];
  version: string;
}

export function formatZodError(e: ZodError): string[] {
  return e.issues.slice(0, 20).map((i) => {
    const where = i.path.length ? i.path.join(".") : "(root)";
    const missing = /^Invalid input: expected (\w+), received undefined$/.exec(i.message);
    return missing ? `${where}: is missing (expected ${missing[1]})` : `${where}: ${i.message}`;
  });
}

/** Total size of a folder, stopping early when limits are exceeded. */
export function folderSize(dir: string): { bytes: number; entries: number; symlinks: number } {
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

export function folderErrors(dir: string): string[] {
  const size = folderSize(dir);
  const errors: string[] = [];
  if (size.entries > LIMITS.packEntries) errors.push(`too many files (max ${LIMITS.packEntries})`);
  if (size.bytes > LIMITS.packBytes) errors.push(`folder is too big (max ${LIMITS.packBytes / 1024 / 1024} MB)`);
  if (size.symlinks > 0) errors.push("symbolic links are not allowed in a pack");
  return errors;
}

/** Read the pack's JSON file with size and BOM handling. */
export function readPackJson(dir: string, name: string): { raw?: string; json?: unknown; error?: string } {
  const p = path.join(dir, name);
  let raw: string;
  try {
    const st = fs.lstatSync(p);
    if (!st.isFile()) return { error: `${name} is not a regular file` };
    if (st.size > LIMITS.jsonBytes) return { error: `${name} is too big (${st.size} bytes, max ${LIMITS.jsonBytes})` };
    raw = fs.readFileSync(p, "utf8").replace(/^﻿/, "");
  } catch {
    return { error: `${name} is missing` };
  }
  try {
    return { raw, json: JSON.parse(raw) };
  } catch (e) {
    return { error: `${name} is not valid JSON: ${(e as Error).message}` };
  }
}

export function checkFiles(dir: string, refs: FileRef[], seed: string): CheckedFiles {
  const files = new Map<string, string>();
  const dims = new Map<string, { width: number; height: number }>();
  const errors: string[] = [];
  const hash = crypto.createHash("sha1").update(seed);
  for (const ref of refs) {
    const key = ref.rel.replace(/\\/g, "/");
    if (files.has(key)) continue;
    const abs = safeRelativePath(dir, ref.rel);
    if (!abs) {
      errors.push(`${ref.where}: "${ref.rel}" must be a relative path inside the pack folder`);
      continue;
    }
    const ext = path.extname(abs).toLowerCase();
    if (!EXT[ref.kind].has(ext)) {
      errors.push(`${ref.where}: "${ref.rel}" must be ${[...EXT[ref.kind]].join(" / ")}`);
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
      const maxBytes = ref.maxBytes ?? LIMITS.pngBytes, maxSide = ref.maxSide ?? LIMITS.pngSide;
      if (st.size > maxBytes) {
        errors.push(`${ref.where}: "${ref.rel}" is too big (max ${Math.round(maxBytes / 1024 / 1024)} MB)`);
        continue;
      }
      const head = Buffer.alloc(24);
      try {
        const fd = fs.openSync(abs, "r");
        fs.readSync(fd, head, 0, 24, 0);
        fs.closeSync(fd);
      } catch {}
      const d = readPngSize(head);
      if (!d) {
        errors.push(`${ref.where}: "${ref.rel}" is not a PNG image`);
        continue;
      }
      if (d.width < 1 || d.height < 1 || d.width > maxSide || d.height > maxSide) {
        errors.push(`${ref.where}: "${ref.rel}" is ${d.width}×${d.height}; images must be at most ${maxSide}×${maxSide}`);
        continue;
      }
      dims.set(key, d);
    } else if (st.size > (ref.kind === "sound" ? LIMITS.soundBytes : LIMITS.jsonBytes)) {
      errors.push(`${ref.where}: "${ref.rel}" is too big`);
      continue;
    }
    files.set(key, abs);
    hash.update(`${key}:${st.size}:${st.mtimeMs}`);
  }
  return { files, dims, errors, version: hash.digest("hex").slice(0, 12) };
}

export function assetUrls(prefix: string, id: string, files: Map<string, string>, version: string): Record<string, string> {
  const urls: Record<string, string> = {};
  for (const key of files.keys()) urls[key] = `${prefix}/${id}/${key.split("/").map(encodeURIComponent).join("/")}?v=${version}`;
  return urls;
}
