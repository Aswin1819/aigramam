/**
 * Keeps the list of worlds current: watches the world folders, reloads on
 * change (debounced) and notifies listeners. Also serves world assets.
 */
import fs from "fs";
import os from "os";
import path from "path";
import express, { type Request, type Response, type Router } from "express";
import type { WorldsState } from "@shared/world";
import { CONTENT_TYPES, loadAllWorlds, type LoadedWorld, type Source } from "./loader";

/** The app folder (has package.json), found from this file both in dev (server/worlds) and in the bundle (dist). */
function appRoot(): string {
  let dir = import.meta.dirname;
  for (let i = 0; i < 6; i++) {
    if (fs.existsSync(path.join(dir, "package.json"))) return dir;
    dir = path.dirname(dir);
  }
  return process.cwd();
}

export const BUILTIN_WORLDS_DIR = path.join(appRoot(), "worlds");
export const USER_WORLDS_DIR = path.join(os.homedir(), ".claude-dungeon", "worlds");

export class WorldManager {
  private loaded = new Map<string, LoadedWorld>();
  private stateValue: WorldsState = { worlds: [], errors: [], defaultId: "" };
  private signature = "";
  private listeners: Array<(s: WorldsState) => void> = [];
  private watchers: fs.FSWatcher[] = [];
  private timers: NodeJS.Timeout[] = [];
  private debounce: NodeJS.Timeout | null = null;

  constructor(private readonly sources: Source[] = [
    { dir: BUILTIN_WORLDS_DIR, kind: "builtin" },
    { dir: USER_WORLDS_DIR, kind: "user" },
  ]) {}

  get state() {
    return this.stateValue;
  }

  onChange(fn: (s: WorldsState) => void) {
    this.listeners.push(fn);
  }

  /** Reload everything; returns true if anything changed. */
  reload(): boolean {
    const { state, loaded } = loadAllWorlds(this.sources);
    const sig = JSON.stringify(state);
    if (sig === this.signature) return false;
    this.signature = sig;
    this.stateValue = state;
    this.loaded = loaded;
    for (const e of state.errors) console.warn(`[Worlds] ${e.source}/${e.folder}: ${e.messages.join("; ")}`);
    for (const fn of this.listeners) fn(state);
    return true;
  }

  private scheduleReload() {
    if (this.debounce) clearTimeout(this.debounce);
    this.debounce = setTimeout(() => this.reload(), 300);
  }

  start(pollMs = 3000) {
    this.reload();
    for (const src of this.sources) {
      try {
        this.watchers.push(fs.watch(src.dir, { recursive: true }, () => this.scheduleReload()));
      } catch {
        // folder missing or recursive watch unsupported: the poll below covers it
      }
    }
    this.timers.push(setInterval(() => this.reload(), pollMs));
  }

  stop() {
    for (const w of this.watchers) try { w.close(); } catch {}
    for (const t of this.timers) clearInterval(t);
    if (this.debounce) clearTimeout(this.debounce);
    this.watchers = [];
    this.timers = [];
  }

  /** GET /world-assets/:id/<file> — only files a valid world references. */
  assetsRouter(): Router {
    const router = express.Router();
    router.get(/^\/([a-z0-9-]{1,40})\/(.+)$/, (req: Request, res: Response) => {
      const id = req.params[0];
      const rel = decodeURIComponent(req.params[1] ?? "");
      const abs = this.loaded.get(id)?.files.get(rel);
      if (!abs) {
        res.status(404).end();
        return;
      }
      const type = CONTENT_TYPES[path.extname(abs).toLowerCase()];
      if (!type) {
        res.status(404).end();
        return;
      }
      res.setHeader("Content-Type", type);
      res.setHeader("X-Content-Type-Options", "nosniff");
      res.setHeader("Cache-Control", req.query.v ? "public, max-age=31536000, immutable" : "no-cache");
      res.sendFile(abs, (err) => {
        if (err && !res.headersSent) res.status(404).end();
      });
    });
    return router;
  }
}
