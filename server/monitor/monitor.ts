/**
 * Watches local Claude Code data and keeps the SessionStore up to date.
 * Read-only: it never writes inside ~/.claude.
 *
 *   ~/.claude/projects/<enc>/<sessionId>.jsonl                  session transcript
 *   ~/.claude/projects/<enc>/<sessionId>/subagents/agent-<id>.jsonl (+ .meta.json)
 *   ~/.claude/sessions/<pid>.json                                running sessions
 */
import fs from "fs";
import os from "os";
import path from "path";
import { parseLine } from "./parser";
import { describeTool } from "./actions";
import type { ChatItem } from "@shared/model";
import { readRegistry } from "./registry";
import { SessionStore, interruptNoteId } from "./store";
import { FileTailer, scanLinesContaining } from "./tailer";

export interface MonitorOptions {
  claudeDir?: string;
  /** Transcripts changed within this window are treated as live when we first see them. */
  activeWindowMs?: number;
  pollMs?: number;
  scanMs?: number;
}

interface Tracked {
  tailer: FileTailer;
  sessionId: string;
  agentId?: string;
}

const NL = String.fromCharCode(10);
const SESSION_FILE_RE = /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.jsonl$/i;
const AGENT_FILE_RE = /^agent-([A-Za-z0-9_-]+)\.jsonl$/;

export class Monitor {
  readonly store = new SessionStore();
  private readonly claudeDir: string;
  private readonly projectsDir: string;
  private readonly sessionsDir: string;
  private readonly activeWindowMs: number;
  private readonly pollMs: number;
  private readonly scanMs: number;
  private tracked = new Map<string, Tracked>(); // file path → tailer
  private sessionFiles = new Map<string, string>(); // sessionId → transcript path
  /** Sessions the store dropped, with the time; they come back only if their transcript changes again. */
  private ended = new Map<string, number>();
  private timers: NodeJS.Timeout[] = [];
  private watchers: fs.FSWatcher[] = [];
  private onChange: () => void = () => {};

  constructor(opts: MonitorOptions = {}) {
    this.claudeDir = opts.claudeDir ?? path.join(os.homedir(), ".claude");
    this.projectsDir = path.join(this.claudeDir, "projects");
    this.sessionsDir = path.join(this.claudeDir, "sessions");
    this.activeWindowMs = opts.activeWindowMs ?? 10 * 60_000;
    this.pollMs = opts.pollMs ?? 500;
    this.scanMs = opts.scanMs ?? 2_000;
  }

  start(onChange: () => void) {
    this.onChange = onChange;
    this.scan();
    this.pollRegistry();
    this.timers.push(setInterval(() => this.pollTailers(), this.pollMs));
    this.timers.push(setInterval(() => { this.scan(); this.pollRegistry(); }, this.scanMs));
    this.timers.push(setInterval(() => { this.store.prune(); this.dropUntracked(); this.onChange(); }, 1_000));
    try {
      // Recursive watching works on Windows and macOS; the scan timer covers everything else.
      this.watchers.push(fs.watch(this.projectsDir, { recursive: true }, () => this.pollTailers()));
    } catch {}
  }

  stop() {
    for (const t of this.timers) clearInterval(t);
    for (const w of this.watchers) try { w.close(); } catch {}
    this.timers = [];
    this.watchers = [];
  }

  private historyLoaded = new Set<string>();


  /**
   * Fill a session's chat with older conversation from its transcript (the
   * last few MB, read once per session) the first time someone opens it.
   */
  async loadChatHistory(sessionId: string, maxBytes = 3 * 1024 * 1024): Promise<void> {
    if (this.historyLoaded.has(sessionId)) return;
    this.historyLoaded.add(sessionId);
    const file = this.sessionFiles.get(sessionId);
    if (!file) return;
    let text: string;
    try {
      const fh = await fs.promises.open(file, "r");
      try {
        const { size } = await fh.stat();
        const start = Math.max(0, size - maxBytes);
        const buf = Buffer.alloc(size - start);
        await fh.read(buf, 0, buf.length, start);
        text = buf.toString("utf8");
        if (start > 0) text = text.slice(text.indexOf(NL) + 1); // drop the partial first line
      } finally {
        await fh.close();
      }
    } catch {
      return;
    }
    const items: ChatItem[] = [];
    for (const line of text.split(NL)) {
      if (!line.includes('"assistant"') && !line.includes('"user"')) continue;
      for (const ev of parseLine(line)) {
        if (ev.t === "chat") items.push({ id: ev.id, at: ev.at, kind: ev.role, text: ev.text });
        else if (ev.t === "tool_start") {
          const a = describeTool(ev.name, ev.input, ev.at);
          items.push({ id: `tool:${ev.id}`, at: ev.at, kind: "tool", text: a.label, emoji: a.emoji });
        } else if (ev.t === "interrupted") items.push({ id: interruptNoteId(ev.at), at: ev.at, kind: "note", text: "Interrupted" });
      }
    }
    this.store.importChat(sessionId, items);
  }

  /** Make sure a transcript (e.g. from a hook's transcript_path) is being followed. */
  follow(transcriptPath: string) {
    const m = SESSION_FILE_RE.exec(path.basename(transcriptPath));
    if (m && fs.existsSync(transcriptPath)) this.track(transcriptPath, m[1]);
  }

  /** Find recently active transcripts and subagent files. */
  scan(now = Date.now()) {
    let projectDirs: string[];
    try {
      projectDirs = fs.readdirSync(this.projectsDir, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => path.join(this.projectsDir, d.name));
    } catch {
      return;
    }
    for (const dir of projectDirs) {
      let entries: fs.Dirent[];
      try {
        entries = fs.readdirSync(dir, { withFileTypes: true });
      } catch {
        continue;
      }
      for (const e of entries) {
        if (!e.isFile()) continue;
        const m = SESSION_FILE_RE.exec(e.name);
        if (!m) continue;
        const file = path.join(dir, e.name);
        const sessionId = m[1];
        if (!this.tracked.has(file)) {
          if (!this.store.has(sessionId) && !this.isRecent(file, now)) continue;
          const endedAt = this.ended.get(sessionId);
          if (endedAt !== undefined) {
            if (this.mtime(file) <= endedAt) continue;
            this.ended.delete(sessionId);
          }
          this.track(file, sessionId);
        }
        this.scanSubagents(path.join(dir, sessionId, "subagents"), sessionId, now);
      }
    }
  }

  private mtime(file: string) {
    try {
      return fs.statSync(file).mtimeMs;
    } catch {
      return 0;
    }
  }

  private isRecent(file: string, now: number) {
    try {
      return now - fs.statSync(file).mtimeMs < this.activeWindowMs;
    } catch {
      return false;
    }
  }

  private scanSubagents(dir: string, sessionId: string, now: number) {
    if (!this.store.has(sessionId)) return;
    let files: string[];
    try {
      files = fs.readdirSync(dir);
    } catch {
      return;
    }
    for (const f of files) {
      const m = AGENT_FILE_RE.exec(f);
      if (!m) continue;
      const file = path.join(dir, f);
      if (this.tracked.has(file)) continue;
      // Only subagents that are (or were very recently) running.
      if (now - this.mtime(file) > 3 * 60_000) continue;
      const agentId = m[1];
      this.readSubagentMeta(path.join(dir, `agent-${agentId}.meta.json`), sessionId, agentId);
      this.tracked.set(file, { tailer: new FileTailer(file), sessionId, agentId });
    }
  }

  private readSubagentMeta(metaPath: string, sessionId: string, agentId: string) {
    try {
      const o = JSON.parse(fs.readFileSync(metaPath, "utf8")) as Record<string, unknown>;
      this.store.subagentMeta(
        sessionId,
        agentId,
        {
          agentType: typeof o.agentType === "string" ? o.agentType : undefined,
          description: typeof o.description === "string" ? o.description.slice(0, 80) : undefined,
          toolUseId: typeof o.toolUseId === "string" ? o.toolUseId : undefined,
          finished: o.finished === true,
        },
        Date.now(),
      );
    } catch {
      this.store.subagentMeta(sessionId, agentId, {}, Date.now());
    }
  }

  private track(file: string, sessionId: string) {
    if (this.tracked.has(file)) return;
    const tailer = new FileTailer(file);
    this.tracked.set(file, { tailer, sessionId });
    this.sessionFiles.set(sessionId, file);
    this.store.ensure(sessionId);
    this.feed(this.tracked.get(file)!);
    // Rare records (a /rename title) may sit far before the tail we read; find them in the background.
    void scanLinesContaining(file, ['"custom-title"', '"agent-name"', '"pr-link"'], (line) => {
      for (const ev of parseLine(line)) if (ev.t === "title" || ev.t === "pr") this.store.applyEvent(sessionId, ev);
      this.onChange();
    });
    this.onChange();
  }

  private feed(t: Tracked): boolean {
    const lines = t.tailer.readNewLines();
    for (const line of lines) {
      for (const ev of parseLine(line)) this.store.applyEvent(t.sessionId, ev, t.agentId);
    }
    return lines.length > 0;
  }

  pollTailers() {
    let changed = false;
    for (const t of this.tracked.values()) {
      if (!this.store.has(t.sessionId)) continue;
      if (this.feed(t)) changed = true;
    }
    if (changed) this.onChange();
  }

  /** Stop following files for sessions/subagents the store has dropped. */
  private dropUntracked() {
    const live = new Set(this.store.ids());
    for (const [file, t] of this.tracked) {
      if (!live.has(t.sessionId)) {
        this.tracked.delete(file);
        if (!t.agentId) {
          this.sessionFiles.delete(t.sessionId);
          this.ended.set(t.sessionId, Date.now());
        }
      }
    }
  }

  private pollRegistry() {
    const entries = readRegistry(this.sessionsDir);
    // Open sessions are shown even when they've been quiet for a while.
    for (const e of entries) {
      if (!e.alive || this.store.has(e.sessionId) || this.ended.has(e.sessionId)) continue;
      const file = this.findTranscript(e.sessionId);
      if (file) this.track(file, e.sessionId);
    }
    this.store.applyRegistry(entries);
  }

  private findTranscript(sessionId: string): string | null {
    const known = this.sessionFiles.get(sessionId);
    if (known) return known;
    try {
      for (const d of fs.readdirSync(this.projectsDir)) {
        const f = path.join(this.projectsDir, d, `${sessionId}.jsonl`);
        if (fs.existsSync(f)) return f;
      }
    } catch {}
    return null;
  }
}
