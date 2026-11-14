/**
 * Runs managed terminals: shells (PowerShell on Windows, the person's own shell
 * on macOS and Linux, see shell.ts) started in a known project
 * folder when the person clicks "New terminal". Output streams to the
 * browser tabs that have the terminal open; the last part is kept so a
 * reopened tab sees what happened.
 *
 * Safety:
 * - only project folders Ai Gramam already shows (never a path from the browser);
 * - only on the person's request (the browser sends term-create from a click);
 * - nothing is ever typed into a terminal except what the browser sends from the keyboard;
 *   "Start Claude Code" passes `claude` as the shell's start command (shellArgs), only after
 *   checking the CLI is on PATH; nothing is typed;
 * - every shell is stopped when it's closed or the server stops.
 */
import crypto from "crypto";
import fs from "fs";
import type { ProjectView } from "@shared/model";
import { CLAUDE_CLI_MISSING, TERMINAL_LIMITS as L, type TerminalInfo } from "@shared/terminal";
import type { RegistryEntry } from "../monitor/registry";
import { findOnPath, listChildProcesses, matchSessions, type ProcessLister } from "./links";
import { chooseShell, shellArgs, shellLabel } from "./shell";

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
  /** Is a command on PATH? (where.exe / which by default; tests pass a fake). */
  findCli?: (name: string) => Promise<boolean>;
  /** Children and grandchildren of the given pids (Win32_Process or ps by default). */
  listProcesses?: ProcessLister;
  /** Claude Code's session registry, read when linking sessions to terminals. */
  registry?: () => RegistryEntry[];
}

export type CreateResult = { ok: true; id: string } | { ok: false; error: string };

/** How long a "the CLI is installed" answer is reused; a "not found" is rechecked sooner so installing it takes effect quickly. */
const CLI_FOUND_TTL_MS = 30_000;
const CLI_MISSING_TTL_MS = 5_000;

/**
 * Variables a running Claude Code session sets for its own child processes.
 * When Ai Gramam itself was started from inside a Claude Code session, its
 * terminals would inherit them, and a `claude` started there would treat
 * itself as that session's child (e.g. no transcript, no session registry).
 * A managed terminal is a fresh, top-level shell, so they're removed.
 * Settings the person chose (ANTHROPIC_*, CLAUDE_CODE_USE_*, …) are kept.
 */
const CLAUDE_SESSION_MARKERS = [
  "CLAUDECODE",
  "CLAUDE_PID",
  "CLAUDE_EFFORT",
  "CLAUDE_CODE_CHILD_SESSION",
  "CLAUDE_CODE_SESSION_ID",
  "CLAUDE_CODE_SESSION_ATTENDED",
  "CLAUDE_CODE_BRIDGE_SESSION_ID",
  "CLAUDE_CODE_MESSAGING_SOCKET",
  "CLAUDE_CODE_MESSAGING_TOKEN",
  "CLAUDE_CODE_ENTRYPOINT",
  "CLAUDE_CODE_EXECPATH",
];

/** The environment for a managed terminal: this process's, minus Claude Code session markers. */
export function terminalEnv(base: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...base, AI_GRAMAM_TERMINAL: "1" };
  // Windows env names are case-insensitive.
  const drop = new Set(CLAUDE_SESSION_MARKERS);
  for (const k of Object.keys(env)) if (drop.has(k.toUpperCase())) delete env[k];
  return env;
}

const clamp = (n: unknown, lo: number, hi: number, dflt: number) => (typeof n === "number" && Number.isFinite(n) ? Math.min(hi, Math.max(lo, Math.round(n))) : dflt);

export class TerminalManager {
  private terms = new Map<string, Term>();
  private readonly shell: string;
  private readonly flushMs: number;
  private cli: { found: boolean; at: number } | null = null;
  private linkTimer: NodeJS.Timeout | null = null;
  private linking = false;
  /** sessionId → terminal id, from the last process-tree check. */
  private sessionTerminal = new Map<string, string>();

  constructor(private readonly opts: TerminalManagerOptions) {
    this.shell = opts.shell ?? chooseShell();
    this.flushMs = opts.flushMs ?? 16;
  }

  /** The shell's name for the UI ("PowerShell", "zsh"…). */
  get shellName(): string {
    return shellLabel(this.shell);
  }

  list(): TerminalInfo[] {
    return [...this.terms.values()].map((t) => ({ ...t.info, sessionIds: [...t.info.sessionIds] })).sort((a, b) => a.createdAt - b.createdAt);
  }

  /** Is the Claude Code CLI on PATH? (cached briefly) */
  private async claudeInstalled(): Promise<boolean> {
    const now = Date.now();
    if (this.cli && now - this.cli.at < (this.cli.found ? CLI_FOUND_TTL_MS : CLI_MISSING_TTL_MS)) return this.cli.found;
    let found = false;
    try {
      found = await (this.opts.findCli ?? findOnPath)("claude");
    } catch {}
    this.cli = { found, at: Date.now() };
    return found;
  }

  /**
   * Start the shell in a known project's folder; with start "claude", the shell
   * runs Claude Code and stays open after it exits. Any other `start` is refused.
   */
  async create(projectId: string, cols: unknown, rows: unknown, start?: unknown): Promise<CreateResult> {
    if (start !== undefined && start !== null && start !== "claude") return { ok: false, error: "Unknown start command." };
    const withClaude = start === "claude";
    if (withClaude && !(await this.claudeInstalled())) return { ok: false, error: CLAUDE_CLI_MISSING };
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
      const args = shellArgs(this.shell, withClaude);
      pty = this.opts.spawn(this.shell, args, { cwd: project.root, cols: c, rows: r, env: terminalEnv() });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      // A missing terminal library explains itself (ptyUnavailableMessage); anything else names the shell.
      return { ok: false, error: msg.startsWith("Terminals aren't available") ? msg : `Couldn't start ${shellLabel(this.shell)}: ${msg}` };
    }
    const id = crypto.randomUUID();
    const t: Term = {
      info: { id, projectId, projectName: project.name, cwd: project.root, shell: this.shell, pid: pty.pid, createdAt: Date.now(), status: "running", sessionIds: [], ...(withClaude ? { started: "claude" as const } : {}) },
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
      this.setLinks(t, []);
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
    this.setLinks(t, []);
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
    this.stopLinking();
    for (const id of [...this.terms.keys()]) this.close(id);
  }

  /** The managed terminal a Claude Code session runs in, if any. */
  terminalForSession(sessionId: string): string | undefined {
    return this.sessionTerminal.get(sessionId);
  }

  /** Check the process tree every `ms` while terminals are running. */
  startLinking(ms = 5000) {
    if (this.linkTimer) return;
    this.linkTimer = setInterval(() => void this.refreshLinks(), ms);
    this.linkTimer.unref?.();
  }

  stopLinking() {
    if (this.linkTimer) clearInterval(this.linkTimer);
    this.linkTimer = null;
  }

  /**
   * Match running terminals' shells with Claude Code's session registry by
   * pid (child or grandchild of the shell). Skipped when nothing is running.
   */
  async refreshLinks(): Promise<void> {
    if (this.linking || !this.opts.registry) return;
    const running = [...this.terms.values()].filter((t) => t.info.status === "running");
    if (!running.length) return;
    this.linking = true;
    try {
      const procs = await (this.opts.listProcesses ?? listChildProcesses)(running.map((t) => t.info.pid));
      const links = matchSessions(running.map((t) => t.info.pid), procs, this.opts.registry());
      let changed = false;
      for (const t of running) {
        // The terminal may have exited or closed while the lookup ran.
        if (this.terms.get(t.info.id) !== t || t.info.status !== "running") continue;
        if (this.setLinks(t, links.get(t.info.pid) ?? [])) changed = true;
      }
      if (changed) this.opts.onList(this.list());
    } catch {
      // A failed lookup leaves the previous links; the next round tries again.
    } finally {
      this.linking = false;
    }
  }

  /** Returns true when the terminal's sessions changed. */
  private setLinks(t: Term, ids: string[]): boolean {
    const same = ids.length === t.info.sessionIds.length && ids.every((x, i) => x === t.info.sessionIds[i]);
    for (const old of t.info.sessionIds) if (this.sessionTerminal.get(old) === t.info.id) this.sessionTerminal.delete(old);
    for (const id of ids) this.sessionTerminal.set(id, t.info.id);
    t.info.sessionIds = [...ids];
    return !same;
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
