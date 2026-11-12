/**
 * Install a world or character pack from a .zip sent by the browser
 * (POST /api/packs/upload?kind=world|character&replace=0|1, raw zip body).
 *
 * Nothing is written until the whole zip has been checked in memory: entry
 * count, sizes (declared before inflating, then actual), safe paths, allowed
 * file types and the manifest with the loaders' own schema. The files then go
 * to a hidden `.incoming-*` folder inside the user packs folder (the loaders
 * skip dot folders), get the exact check the PackManager runs, and are renamed
 * into place in one step. The PackManager's watcher picks the new pack up.
 */
import crypto from "crypto";
import fs from "fs";
import path from "path";
import express, { type NextFunction, type Request, type Response, type Router } from "express";
import { unzipSync } from "fflate";
import { worldSchema } from "@shared/world";
import { packSchema } from "@shared/character";
import { DATA_DIR } from "../_core/paths";
import { hostAndOriginGuard, isLocalRequest, safeChildPath, safeRelativePath } from "../_core/security";
import { BUILTIN_CHARACTERS_DIR, BUILTIN_WORLDS_DIR, USER_CHARACTERS_DIR, USER_WORLDS_DIR } from "../worlds/manager";
import { loadWorldFolder, referencedFiles as worldFiles } from "../worlds/loader";
import { loadCharacterFolder, referencedFiles as characterFiles } from "../characters/loader";
import { formatZodError, ID_RE, LIMITS, type FileRef } from "./files";

export type PackKind = "world" | "character";

export const UPLOAD_LIMITS = {
  zipBytes: 25 * 1024 * 1024,
  /** Same cap as an installed pack folder, so anything that unzips also installs. */
  totalBytes: LIMITS.packBytes,
  fileBytes: 20 * 1024 * 1024,
  entries: 300,
  pathLength: 200,
  depth: 8,
};

const ALLOWED_EXT = new Set([".json", ".png", ".webp", ".jpg", ".jpeg", ".ogg", ".mp3", ".wav", ".txt", ".md"]);
/** OS clutter that zip tools add; skipped silently rather than rejected. */
const JUNK_NAMES = new Set(["__macosx", ".ds_store", "thumbs.db", "desktop.ini"]);
/** Names Windows can't create (CON, NUL, COM1…), with or without an extension. */
const WIN_RESERVED = /^(con|prn|aux|nul|com[0-9]|lpt[0-9])(\..*)?$/i;
/**
 * Only non-"simple" content types: a cross-site page can't send these without
 * a CORS preflight, which this server never answers (defence on top of the
 * Origin check).
 */
const ZIP_TYPES = new Set(["application/zip", "application/x-zip-compressed", "application/octet-stream"]);

export interface UploadDirs {
  world: { builtin: string; user: string };
  character: { builtin: string; user: string };
  backups: string;
}

export function defaultUploadDirs(): UploadDirs {
  return {
    world: { builtin: BUILTIN_WORLDS_DIR, user: USER_WORLDS_DIR },
    character: { builtin: BUILTIN_CHARACTERS_DIR, user: USER_CHARACTERS_DIR },
    backups: path.join(DATA_DIR, "backups"),
  };
}

export class UploadError extends Error {
  constructor(public status: number, message: string, public exists = false) {
    super(message);
  }
}

const MANIFEST: Record<PackKind, string> = { world: "world.json", character: "pack.json" };
const mb = (n: number) => `${Math.round(n / 1024 / 1024)} MB`;

/**
 * Normalise one zip entry name. Returns the clean "a/b.png" path, "skip" for
 * folders and OS junk, or an error message. Backslashes count as separators
 * (PowerShell 5's Compress-Archive writes them), so "..\x" is caught too.
 */
export function cleanEntryName(raw: string): { path: string } | "skip" | { error: string } {
  const show = JSON.stringify(raw.slice(0, 80));
  if (/[\0-\x1f]/.test(raw)) return { error: `${show} has control characters in its name` };
  const name = raw.replace(/\\/g, "/");
  if (name.startsWith("/") || /^[a-zA-Z]:/.test(name)) return { error: `${show} is an absolute path` };
  const segments = name.split("/").filter((s) => s !== "" && s !== ".");
  if (segments.some((s) => s === "..")) return { error: `${show} points outside the pack ("..")` };
  if (name.endsWith("/") || segments.length === 0) return "skip";
  if (segments.some((s) => JUNK_NAMES.has(s.toLowerCase()) || s.startsWith("."))) return "skip";
  for (const s of segments) {
    if (/[<>:"|?*]/.test(s) || /[. ]$/.test(s) || WIN_RESERVED.test(s)) return { error: `${show} isn't a valid file name on Windows` };
  }
  const clean = segments.join("/");
  if (clean.length > UPLOAD_LIMITS.pathLength || segments.length > UPLOAD_LIMITS.depth) return { error: `${show} is nested too deeply or has too long a name` };
  return { path: clean };
}

/** Thrown inside fflate's filter to stop reading a zip that is clearly too big. */
class StopUnzip extends Error {}

/** Unzip in memory, enforcing every limit before (and after) inflating. */
export function readZip(zip: Uint8Array): Map<string, Uint8Array> {
  if (zip.length > UPLOAD_LIMITS.zipBytes) throw new UploadError(413, `The zip is too big (max ${mb(UPLOAD_LIMITS.zipBytes)})`);
  const problems: string[] = [];
  const keep = new Map<string, string>(); // raw entry name -> clean path
  const seen = new Set<string>(); // lowercased: Windows can't hold two names differing only by case
  let entries = 0, declared = 0, tooBig = false;
  let raw: Record<string, Uint8Array>;
  try {
    raw = unzipSync(zip, {
      filter: (f) => {
        if (++entries > UPLOAD_LIMITS.entries) throw new StopUnzip(`The zip has too many entries (max ${UPLOAD_LIMITS.entries})`);
        const c = cleanEntryName(f.name);
        if (c === "skip") return false;
        if ("error" in c) {
          problems.push(c.error);
          return false;
        }
        const ext = path.extname(c.path).toLowerCase();
        if (!ALLOWED_EXT.has(ext)) {
          problems.push(`"${c.path}": ${ext ? `${ext} files aren't` : "files without an extension aren't"} allowed in a pack (allowed: ${[...ALLOWED_EXT].join(" ")})`);
          return false;
        }
        if (seen.has(c.path.toLowerCase())) {
          problems.push(`"${c.path}" appears twice in the zip`);
          return false;
        }
        seen.add(c.path.toLowerCase());
        if (f.originalSize > UPLOAD_LIMITS.fileBytes) {
          problems.push(`"${c.path}" is too big (max ${mb(UPLOAD_LIMITS.fileBytes)} per file)`);
          tooBig = true;
          return false;
        }
        declared += f.originalSize;
        if (declared > UPLOAD_LIMITS.totalBytes) throw new StopUnzip(`The pack is too big once unzipped (max ${mb(UPLOAD_LIMITS.totalBytes)})`);
        // Don't inflate anything once the zip is known to be bad.
        if (problems.length) return false;
        keep.set(f.name, c.path);
        return true;
      },
    });
  } catch (e) {
    if (e instanceof StopUnzip) throw new UploadError(413, e.message);
    throw new UploadError(400, `This isn't a readable .zip file (${(e as Error).message})`);
  }
  if (problems.length) throw new UploadError(tooBig ? 413 : 400, problems.slice(0, 5).join("; "));
  // fflate inflates into a buffer of the declared size, so real output can't
  // exceed it; check anyway in case that ever changes.
  const files = new Map<string, Uint8Array>();
  let total = 0;
  for (const [name, data] of Object.entries(raw)) {
    const clean = keep.get(name);
    if (!clean) continue;
    total += data.length;
    if (data.length > UPLOAD_LIMITS.fileBytes || total > UPLOAD_LIMITS.totalBytes) throw new UploadError(413, `The pack is too big once unzipped (max ${mb(UPLOAD_LIMITS.totalBytes)})`);
    files.set(clean, data);
  }
  return files;
}

/** Find the manifest at the root or inside exactly one top-level folder, and strip that folder. */
export function rootPack(files: Map<string, Uint8Array>, kind: PackKind): Map<string, Uint8Array> {
  const manifest = MANIFEST[kind];
  if (files.has(manifest)) return files;
  const tops = new Set([...files.keys()].map((k) => (k.includes("/") ? k.split("/")[0] : "")));
  const [only] = tops;
  if (tops.size === 1 && only && files.has(`${only}/${manifest}`)) {
    return new Map([...files].map(([k, v]) => [k.slice(only.length + 1), v]));
  }
  throw new UploadError(400, `${manifest} must be at the top of the zip, or inside a single folder (is this a ${kind === "world" ? "character" : "world"} pack?)`);
}

/** Check the manifest with the loaders' schema and make sure every file it names is in the zip. */
export function checkManifest(files: Map<string, Uint8Array>, kind: PackKind): { id: string; name: string } {
  const manifest = MANIFEST[kind];
  const bytes = files.get(manifest)!;
  if (bytes.length > LIMITS.jsonBytes) throw new UploadError(400, `${manifest} is too big (max ${LIMITS.jsonBytes / 1024} KB)`);
  let json: unknown;
  try {
    json = JSON.parse(Buffer.from(bytes).toString("utf8").replace(/^﻿/, ""));
  } catch (e) {
    throw new UploadError(400, `${manifest} is not valid JSON: ${(e as Error).message}`);
  }
  let id: string, name: string, refs: FileRef[];
  if (kind === "world") {
    const parsed = worldSchema.safeParse(json);
    if (!parsed.success) throw new UploadError(400, `${manifest}: ${formatZodError(parsed.error).join("; ")}`);
    ({ id, name } = parsed.data);
    refs = worldFiles(parsed.data);
  } else {
    const parsed = packSchema.safeParse(json);
    if (!parsed.success) throw new UploadError(400, `${manifest}: ${formatZodError(parsed.error).join("; ")}`);
    ({ id, name } = parsed.data);
    refs = characterFiles(parsed.data);
  }
  if (!ID_RE.test(id)) throw new UploadError(400, `id "${id}" must be 1–40 lowercase letters, digits and -`);
  const missing = refs.filter((r) => !files.has(r.rel.replace(/\\/g, "/"))).map((r) => `${r.where} → "${r.rel}"`);
  if (missing.length) throw new UploadError(400, `${manifest} names files that aren't in the zip: ${missing.slice(0, 5).join(", ")}`);
  return { id, name };
}

function stamp() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

/** rename, retrying briefly: on Windows a watcher or antivirus can hold a folder for a moment. */
async function moveDir(from: string, to: string) {
  for (let i = 0; ; i++) {
    try {
      fs.renameSync(from, to);
      return;
    } catch (e) {
      const code = (e as NodeJS.ErrnoException).code;
      if (code === "EXDEV") {
        fs.cpSync(from, to, { recursive: true });
        fs.rmSync(from, { recursive: true, force: true });
        return;
      }
      if (i >= 5 || (code !== "EPERM" && code !== "EBUSY" && code !== "EACCES")) throw e;
      await new Promise((r) => setTimeout(r, 100 * (i + 1)));
    }
  }
}

// One install at a time, so two uploads of the same id can't race.
let queue: Promise<unknown> = Promise.resolve();

export function installPack(zip: Uint8Array, kind: PackKind, replace: boolean, dirs: UploadDirs = defaultUploadDirs()) {
  const run = queue.then(() => install(zip, kind, replace, dirs));
  queue = run.catch(() => {});
  return run;
}

async function install(zip: Uint8Array, kind: PackKind, replace: boolean, dirs: UploadDirs): Promise<{ id: string; name: string; kind: PackKind }> {
  const files = rootPack(readZip(zip), kind);
  const { id, name } = checkManifest(files, kind);
  const { builtin, user } = dirs[kind];
  if (fs.existsSync(path.join(builtin, id))) throw new UploadError(409, `"${id}" is a built-in ${kind} and can't be replaced. Give your pack a different id.`);
  const dest = safeChildPath(user, id);
  if (fs.existsSync(dest) && !replace) throw new UploadError(409, `You already have a ${kind} called "${id}". Replace it?`, true);

  fs.mkdirSync(user, { recursive: true });
  const incoming = path.join(user, `.incoming-${crypto.randomBytes(6).toString("hex")}`);
  const staged = path.join(incoming, id); // the loader wants folder name = id
  try {
    for (const [rel, data] of files) {
      const abs = safeRelativePath(staged, rel);
      if (!abs) throw new UploadError(400, `"${rel}" isn't a safe path`);
      fs.mkdirSync(path.dirname(abs), { recursive: true });
      fs.writeFileSync(abs, data);
    }
    // Exactly the check the PackManager will run on the installed folder.
    const result = kind === "world" ? loadWorldFolder(staged, "user") : loadCharacterFolder(staged, "user");
    if (result.error) throw new UploadError(400, result.error.messages.slice(0, 8).join("; "));

    let backup: string | undefined;
    if (fs.existsSync(dest)) {
      if (!replace) throw new UploadError(409, `You already have a ${kind} called "${id}". Replace it?`, true);
      fs.mkdirSync(dirs.backups, { recursive: true });
      backup = path.join(dirs.backups, `${kind}-${id}-${stamp()}`);
      await moveDir(dest, backup);
    }
    try {
      await moveDir(staged, dest);
    } catch (e) {
      if (backup) try { await moveDir(backup, dest); } catch {} // put the old pack back
      throw e;
    }
    return { id, name, kind };
  } finally {
    fs.rmSync(incoming, { recursive: true, force: true });
  }
}

/** POST /upload?kind=world|character&replace=0|1 — loopback only, same-origin only. */
export function createPackUploadRouter(dirs: () => UploadDirs = defaultUploadDirs): Router {
  const router = express.Router();
  router.post(
    "/upload",
    hostAndOriginGuard,
    (req: Request, res: Response, next: NextFunction) => {
      if (!isLocalRequest(req)) {
        res.status(403).json({ ok: false, error: "Packs can only be uploaded from this computer" });
        return;
      }
      const type = (req.headers["content-type"] ?? "").split(";")[0].trim().toLowerCase();
      if (!ZIP_TYPES.has(type)) {
        res.status(415).json({ ok: false, error: "Send the pack as a .zip (Content-Type: application/zip)" });
        return;
      }
      next();
    },
    express.raw({ type: () => true, limit: UPLOAD_LIMITS.zipBytes }),
    async (req: Request, res: Response) => {
      const kind = req.query.kind;
      if (kind !== "world" && kind !== "character") {
        res.status(400).json({ ok: false, error: 'kind must be "world" or "character"' });
        return;
      }
      if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
        res.status(400).json({ ok: false, error: "No zip file was sent" });
        return;
      }
      try {
        const out = await installPack(new Uint8Array(req.body), kind, req.query.replace === "1", dirs());
        res.json({ ok: true, ...out });
      } catch (e) {
        if (e instanceof UploadError) {
          res.status(e.status).json({ ok: false, error: e.message, ...(e.exists ? { exists: true } : {}) });
        } else {
          console.error("[packs] upload failed:", e);
          res.status(500).json({ ok: false, error: `Couldn't install the pack: ${(e as Error).message}` });
        }
      }
    },
  );
  // body-parser errors (e.g. the 25 MB limit) as the same JSON shape.
  router.use((err: { status?: number; type?: string }, _req: Request, res: Response, next: NextFunction) => {
    if (res.headersSent) return next(err);
    if (err.type === "entity.too.large") res.status(413).json({ ok: false, error: `The zip is too big (max ${mb(UPLOAD_LIMITS.zipBytes)})` });
    else res.status(err.status ?? 400).json({ ok: false, error: "Couldn't read the upload" });
  });
  return router;
}
