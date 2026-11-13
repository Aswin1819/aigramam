/**
 * Session history for every transcript still on disk, kept up to date by
 * reading each file on from where it was left. Nothing is written anywhere;
 * the figures live in memory and are rebuilt after a restart (the first read
 * of a large `~/.claude/projects` takes a little while, shown as progress).
 * Read-only on `~/.claude`.
 */
import fs from "fs";
import path from "path";
import type { HistoryList, HistorySession } from "@shared/history";
import { resolveProject } from "../monitor/projectRoot";
import { TranscriptSummary } from "./summarize";

const SESSION_FILE_RE = /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.jsonl$/i;
const CHUNK = 1 << 20;
const NL = 10;
/** Don't look for changes more often than this. */
const REFRESH_MIN_MS = 4_000;

interface Entry {
  sessionId: string;
  file: string;
  size: number;
  mtimeMs: number;
  /** Bytes already counted (always at a line boundary). */
  offset: number;
  summary: TranscriptSummary;
  subagents: number;
}

export interface HistoryIndexOptions {
  projectsDir: string;
  /** Ids of sessions the live monitor shows right now. */
  liveIds?: () => Set<string>;
  /** Yield to the event loop between chunks (tests turn it off). */
  yieldEvery?: boolean;
}

/** Read complete lines from `offset` to `end`; returns the offset after the last complete line. */
async function readLines(file: string, offset: number, end: number, onLine: (line: string) => void, yieldEvery: boolean): Promise<number> {
  const fh = await fs.promises.open(file, "r");
  try {
    let pos = offset;
    let carry = Buffer.alloc(0);
    // Bytes up to the end of the last complete line; a partial last line is read again next time.
    let consumed = offset;
    while (pos < end) {
      const want = Math.min(CHUNK, end - pos);
      const buf = Buffer.alloc(want);
      const { bytesRead } = await fh.read(buf, 0, want, pos);
      if (bytesRead <= 0) break;
      pos += bytesRead;
      const data = carry.length ? Buffer.concat([carry, buf.subarray(0, bytesRead)]) : buf.subarray(0, bytesRead);
      let start = 0;
      for (let i = data.indexOf(NL); i !== -1; i = data.indexOf(NL, start)) {
        onLine(data.toString("utf8", start, i));
        start = i + 1;
      }
      carry = Buffer.from(data.subarray(start));
      consumed = pos - carry.length;
      if (yieldEvery) await new Promise((r) => setImmediate(r));
    }
    return consumed;
  } finally {
    await fh.close();
  }
}

export class HistoryIndex {
  private entries = new Map<string, Entry>(); // file → entry
  private running: Promise<void> | null = null;
  private lastRefresh = 0;
  private progress: { done: number; total: number } | null = null;

  constructor(private readonly opts: HistoryIndexOptions) {}

  /** Look for new or grown transcripts (at most every few seconds; concurrent callers share one pass). */
  refresh(force = false): Promise<void> {
    if (this.running) return this.running;
    if (!force && Date.now() - this.lastRefresh < REFRESH_MIN_MS) return Promise.resolve();
    this.running = this.pass().finally(() => {
      this.running = null;
      this.lastRefresh = Date.now();
      this.progress = null;
    });
    return this.running;
  }

  private listFiles(): Array<{ file: string; sessionId: string; size: number; mtimeMs: number }> {
    const out: Array<{ file: string; sessionId: string; size: number; mtimeMs: number }> = [];
    let dirs: fs.Dirent[] = [];
    try {
      dirs = fs.readdirSync(this.opts.projectsDir, { withFileTypes: true });
    } catch {
      return out;
    }
    for (const d of dirs) {
      if (!d.isDirectory()) continue;
      const dir = path.join(this.opts.projectsDir, d.name);
      let names: string[] = [];
      try {
        names = fs.readdirSync(dir);
      } catch {
        continue;
      }
      for (const n of names) {
        const m = SESSION_FILE_RE.exec(n);
        if (!m) continue;
        const file = path.join(dir, n);
        try {
          const st = fs.statSync(file);
          if (st.isFile()) out.push({ file, sessionId: m[1]!.toLowerCase(), size: st.size, mtimeMs: st.mtimeMs });
        } catch {}
      }
    }
    return out;
  }

  private countSubagents(file: string): number {
    try {
      return fs.readdirSync(path.join(file.replace(/\.jsonl$/i, ""), "subagents")).filter((n) => /^agent-.*\.jsonl$/.test(n)).length;
    } catch {
      return 0;
    }
  }

  private async pass() {
    const files = this.listFiles();
    const seen = new Set(files.map((f) => f.file));
    for (const file of [...this.entries.keys()]) if (!seen.has(file)) this.entries.delete(file);
    const todo = files.filter((f) => {
      const e = this.entries.get(f.file);
      return !e || e.size !== f.size || e.mtimeMs !== f.mtimeMs;
    });
    // Newest first, so recent sessions appear quickly during a first read.
    todo.sort((a, b) => b.mtimeMs - a.mtimeMs);
    this.progress = { done: 0, total: todo.length };
    for (const f of todo) {
      let e = this.entries.get(f.file);
      if (!e || f.size < e.offset) {
        e = { sessionId: f.sessionId, file: f.file, size: 0, mtimeMs: 0, offset: 0, summary: new TranscriptSummary(), subagents: 0 };
        this.entries.set(f.file, e);
      }
      const entry = e;
      try {
        entry.offset = await readLines(f.file, entry.offset, f.size, (l) => entry.summary.add(l), this.opts.yieldEvery !== false);
      } catch {
        // Unreadable right now; try again next pass.
      }
      entry.size = f.size;
      entry.mtimeMs = f.mtimeMs;
      entry.subagents = this.countSubagents(f.file);
      this.progress = { done: this.progress.done + 1, total: this.progress.total };
    }
  }

  /** The transcript file of a session the index knows (never a path from outside). */
  fileOf(sessionId: string): string | undefined {
    const id = sessionId.toLowerCase();
    for (const e of this.entries.values()) if (e.sessionId === id) return e.file;
    return undefined;
  }

  list(): HistoryList {
    const live = this.opts.liveIds?.() ?? new Set<string>();
    const sessions: HistorySession[] = [];
    let oldestAt: number | null = null;
    for (const e of this.entries.values()) {
      const s = e.summary;
      if (!s.startedAt) continue; // nothing recorded yet (or only engine bookkeeping)
      if (oldestAt === null || s.startedAt < oldestAt) oldestAt = s.startedAt;
      const project = s.cwd ? resolveProject(s.cwd) : { id: "", name: "Unknown folder", root: "" };
      const { title, source } = s.title(e.sessionId);
      const u = s.usage;
      sessions.push({
        id: e.sessionId,
        projectId: project.id,
        projectName: project.name,
        cwd: s.cwd,
        gitBranch: s.gitBranch,
        title,
        titleSource: source,
        startedAt: s.startedAt,
        lastActivityAt: s.lastActivityAt,
        activeMs: s.activeMs,
        prompts: s.prompts,
        replies: s.replies,
        toolCalls: s.toolCalls,
        toolErrors: s.toolErrors,
        topTools: [...s.tools.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12),
        filesEdited: s.files.size,
        interrupts: s.interrupts,
        compactions: s.compactions,
        apiErrors: s.apiErrors,
        subagents: e.subagents,
        models: [...s.models],
        usage: u.responses > 0 ? { ...u } : null,
        prUrl: s.prUrl,
        lastEvent: s.lastEvent,
        state: live.has(e.sessionId) ? "live" : "ended",
        days: [...s.days.values()].sort((a, b) => a.day.localeCompare(b.day)),
      });
    }
    sessions.sort((a, b) => b.lastActivityAt - a.lastActivityAt);
    return { sessions, scanning: this.progress ? { ...this.progress } : null, oldestAt };
  }
}
