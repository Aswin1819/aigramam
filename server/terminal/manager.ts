/**
 * Runs managed terminals: PowerShell sessions started in a known project
 * folder when the person clicks "New terminal". Output streams to the
 * browser tabs that have the terminal open; the last part is kept so a
 * reopened tab sees what happened.
 *
 * Safety:
 * - only project folders Ai Gramam already shows (never a path from the browser);
 * - only on the person's request (the browser sends term-create from a click);
 * - nothing is ever typed into a terminal except what the browser sends from the keyboard;
 * - every shell is stopped when it's closed or the server stops.
 */
import crypto from "crypto";
import fs from "fs";
import type { ProjectView } from "@shared/model";
import { TERMINAL_LIMITS as L, type TerminalInfo } from "@shared/terminal";

/** The part of a node-pty process the manager uses (so tests can pass a fake). */
export interface PtyLike {
  pid: number;
  write(data: string): void;
  resize(cols: number, rows: number): void;
  kill(): void;
  onData(cb: (data: string) => void): void;
  onExit(cb: (e: { exitCode: number }) => void): void;
}
export type Spawn = (shell: string, args: string[], opts: { cwd: string; cols: number; rows: number; env: NodeJS.ProcessEnv }) => PtyLike;

interface Term {
  info: TerminalInfo;
  pty: PtyLike;
  /** Output kept for re-attaching, oldest first, trimmed to the scrollback limit. */
  scrollback: string[];
  scrollbackBytes: number;
  /** Output waiting for the next flush (sent in small batches, not per byte). */
  pending: string;
  flushTimer: NodeJS.Timeout | null;
}

export interface TerminalManagerOptions {
  spawn: Spawn;
  projects: () => ProjectView[];
  /** Called with output for the subscribers of a terminal. */
  onOutput: (id: string, data: string) => void;
  /** Called whenever the list (or a status) changes. */
  onList: (list: TerminalInfo[]) => void;
  shell?: string;
  flushMs?: number;
}

const clamp = (n: unknown, lo: number, hi: number, dflt: number) => (typeof n === "number" && Number.isFinite(n) ? Math.min(hi, Math.max(lo, Math.round(n))) : dflt);

export class TerminalManager {
  private terms = new Map<string, Term>();
  private readonly shell: string;
  private readonly flushMs: number;

  constructor(private readonly opts: TerminalManagerOptions) {
    this.shell = opts.shell ?? "powershell.exe";
    this.flushMs = opts.flushMs ?? 16;
  }

  list(): TerminalInfo[] {
    return [...this.terms.values()].map((t) => ({ ...t.info })).sort((a, b) => a.createdAt - b.createdAt);
  }

  /** Start PowerShell in a known project's folder. */
  create(projectId: string, cols: unknown, rows: unknown): { ok: true; id: string } | { ok: false; error: string } {
    const project = this.opts.projects().find((p) => p.id === projectId);
    if (!project) return { ok: false, error: "That project isn't one Ai Gramam currently shows." };
    let isDir = false;
    try {
      isDir = fs.statSync(project.root).isDirectory();
    } catch {}
    if (!isDir) return { ok: false, error: `The project folder no longer exists: ${project.root}` };
    if (this.terms.size >= L.maxOpen) return { ok: false, error: `At most ${L.maxOpen} terminals can be open; close one first.` };

    const c = clamp(cols, L.minCols, L.maxCols, 100);
    const r = clamp(rows, L.minRows, L.maxRows, 30);
    let pty: PtyLike;
    try {
      pty = this.opts.spawn(this.shell, ["-NoLogo"], { cwd: project.root, cols: c, rows: r, env: { ...process.env, AI_GRAMAM_TERMINAL: "1" } });
    } catch (e) {
      return { ok: false, error: `Couldn't start ${this.shell}: ${e instanceof Error ? e.message : String(e)}` };
    }
    const id = crypto.randomUUID();
    const t: Term = {
      info: { id, projectId, projectName: project.name, cwd: project.root, shell: this.shell, pid: pty.pid, createdAt: Date.now(), status: "running" },
      pty,
      scrollback: [],
      scrollbackBytes: 0,
      pending: "",
      flushTimer: null,
    };
    this.terms.set(id, t);
    pty.onData((data) => this.output(t, data));
    pty.onExit(({ exitCode }) => {
      if (!this.terms.has(id)) return;
      this.flush(t);
      t.info.status = "exited";
      t.info.exitCode = exitCode;
      t.info.exitedAt = Date.now();
      this.opts.onList(this.list());
    });
    this.opts.onList(this.list());
    return { ok: true, id };
  }

  /**
   * Everything kept for a terminal (sent when a tab opens it). Waiting output
   * is flushed to the current viewers first, so the new viewer doesn't get it
   * twice (once in this replay and again in the next live batch).
   */
  scrollback(id: string): string | null {
    const t = this.terms.get(id);
    if (!t) return null;
    this.flush(t);
    return t.scrollback.join("");
  }

  input(id: string, data: unknown): boolean {
    const t = this.terms.get(id);
    if (!t || t.info.status !== "running" || typeof data !== "string" || !data) return false;
    if (Buffer.byteLength(data) > L.maxInputBytes) return false;
    t.pty.write(data);
    return true;
  }

  resize(id: string, cols: unknown, rows: unknown): boolean {
    const t = this.terms.get(id);
    if (!t || t.info.status !== "running") return false;
    try {
      t.pty.resize(clamp(cols, L.minCols, L.maxCols, 100), clamp(rows, L.minRows, L.maxRows, 30));
      return true;
    } catch {
      return false;
    }
  }

  /** Stop the shell (if running) and forget the terminal. */
  close(id: string): boolean {
    const t = this.terms.get(id);
    if (!t) return false;
    this.terms.delete(id);
    if (t.flushTimer) clearTimeout(t.flushTimer);
    if (t.info.status === "running") {
      try {
        t.pty.kill();
      } catch {}
    }
    this.opts.onList(this.list());
    return true;
  }

  /** Stop every shell (server shutting down). */
  closeAll() {
    for (const id of [...this.terms.keys()]) this.close(id);
  }

  private output(t: Term, data: string) {
    t.scrollback.push(data);
    t.scrollbackBytes += data.length;
    while (t.scrollbackBytes > L.scrollbackBytes && t.scrollback.length > 1) t.scrollbackBytes -= t.scrollback.shift()!.length;
    t.pending += data;
    if (!t.flushTimer) t.flushTimer = setTimeout(() => this.flush(t), this.flushMs);
  }

  private flush(t: Term) {
    if (t.flushTimer) clearTimeout(t.flushTimer);
    t.flushTimer = null;
    if (!t.pending) return;
    const data = t.pending;
    t.pending = "";
    this.opts.onOutput(t.info.id, data);
  }
}
