/**
 * Keeps a set of packs current: watches their folders, reloads on change
 * (debounced, with a polling fallback) and serves only the files a valid
 * pack references.
 */
import fs from "fs";
import path from "path";
import express, { type Request, type Response, type Router } from "express";
import { CONTENT_TYPES } from "./files";

export interface PackSource {
  dir: string;
  kind: "builtin" | "user";
}

export class PackManager<S, L extends { files: Map<string, string> }> {
  private loaded = new Map<string, L>();
  private stateValue: S;
  private signature = "";
  private listeners: Array<(s: S) => void> = [];
  private watchers: fs.FSWatcher[] = [];
  private timers: NodeJS.Timeout[] = [];
  private debounce: NodeJS.Timeout | null = null;

  constructor(
    private readonly label: string,
    private readonly sources: PackSource[],
    private readonly loadAll: (sources: PackSource[]) => { state: S; loaded: Map<string, L> },
    empty: S,
  ) {
    this.stateValue = empty;
  }

  get state() {
    return this.stateValue;
  }

  onChange(fn: (s: S) => void) {
    this.listeners.push(fn);
  }

  /** Reload everything; returns true if anything changed. */
  reload(): boolean {
    const { state, loaded } = this.loadAll(this.sources);
    const sig = JSON.stringify(state);
    if (sig === this.signature) return false;
    this.signature = sig;
    this.stateValue = state;
    this.loaded = loaded;
    const errors = (state as { errors?: Array<{ source: string; folder: string; messages: string[] }> }).errors ?? [];
    for (const e of errors) console.warn(`[${this.label}] ${e.source}/${e.folder}: ${e.messages.join("; ")}`);
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

  /** GET /<prefix>/:id/<file> — only files a valid pack references. */
  assetsRouter(): Router {
    const router = express.Router();
    router.get(/^\/([a-z0-9-]{1,40})\/(.+)$/, (req: Request, res: Response) => {
      const id = req.params[0];
      let rel: string;
      try {
        rel = decodeURIComponent(req.params[1] ?? "");
      } catch {
        res.status(404).end();
        return;
      }
      const abs = this.loaded.get(id)?.files.get(rel);
      const type = abs && CONTENT_TYPES[path.extname(abs).toLowerCase()];
      if (!abs || !type) {
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

/** The app folder (has package.json), found from this file both in dev and in the bundle (dist). */
export function appRoot(): string {
  let dir = import.meta.dirname;
  for (let i = 0; i < 6; i++) {
    if (fs.existsSync(path.join(dir, "package.json"))) return dir;
    dir = path.dirname(dir);
  }
  return process.cwd();
}
