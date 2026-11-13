/**
 * Counts what a session transcript recorded, one line at a time, so a file
 * that grows can be read on from where it was left (transcripts are
 * append-only). Only figures and short metadata are kept, never the
 * conversation itself. Unknown or malformed records are ignored.
 */
import { ACTIVE_GAP_MS, type HistoryDay, type HistoryUsage, type LastEvent } from "@shared/history";
import { chatTextOfPrompt, parseRecord } from "../monitor/parser";

/** Record types with nothing to count; skipped before parsing (they're most of a transcript's bytes). */
const SKIP_TYPES = new Set([
  "api-request",
  "api-request-blob",
  "api-request-shape",
  "attachment",
  "file-history-snapshot",
  "file-history-delta",
  "queue-operation",
  "mode",
  "atis-latch",
  "session-owner",
  "bridge-session",
  "last-prompt",
  "tools-used",
]);
const LEADING_TYPE_RE = /^\{"type":"([a-z-]+)"/;
const EDIT_TOOLS = new Set(["Write", "Edit", "MultiEdit", "NotebookEdit"]);
const TITLE_MAX = 80;

/** Local calendar day of a time, YYYY-MM-DD. */
export function dayKey(ms: number): string {
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

type Rec = Record<string, unknown>;
const asRec = (v: unknown): Rec | null => (v && typeof v === "object" && !Array.isArray(v) ? (v as Rec) : null);
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v > 0 ? v : 0);

export class TranscriptSummary {
  cwd = "";
  gitBranch?: string;
  titles: { custom?: string; agent?: string; ai?: string; prompt?: string } = {};
  startedAt = 0;
  lastActivityAt = 0;
  activeMs = 0;
  prompts = 0;
  replies = 0;
  toolCalls = 0;
  toolErrors = 0;
  interrupts = 0;
  compactions = 0;
  apiErrors = 0;
  prUrl?: string;
  lastEvent: LastEvent = "none";
  readonly tools = new Map<string, number>();
  readonly files = new Set<string>();
  readonly models = new Set<string>();
  readonly usage: HistoryUsage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, responses: 0 };
  readonly days = new Map<string, HistoryDay>();
  /** Recently counted API responses: one response is written as several records that repeat its usage. */
  private counted: string[] = [];

  private day(at: number): HistoryDay {
    const key = dayKey(at);
    let d = this.days.get(key);
    if (!d) this.days.set(key, (d = { day: key, prompts: 0, toolCalls: 0, toolErrors: 0, activeMs: 0, outputTokens: 0 }));
    return d;
  }

  private touch(at: number) {
    if (!at) return;
    if (!this.startedAt || at < this.startedAt) this.startedAt = at;
    if (this.lastActivityAt) {
      const gap = at - this.lastActivityAt;
      if (gap > 0 && gap <= ACTIVE_GAP_MS) {
        this.activeMs += gap;
        this.day(at).activeMs += gap;
      }
    }
    if (at > this.lastActivityAt) this.lastActivityAt = at;
  }

  private countUsage(r: Rec, at: number) {
    const msg = asRec(r.message);
    if (!msg) return;
    if (typeof msg.model === "string" && msg.model && !msg.model.startsWith("<")) this.models.add(msg.model);
    const u = asRec(msg.usage);
    const id = typeof msg.id === "string" ? msg.id : "";
    if (!u || !id || this.counted.includes(id)) return;
    this.counted.push(id);
    if (this.counted.length > 64) this.counted.shift();
    this.usage.input += num(u.input_tokens);
    this.usage.output += num(u.output_tokens);
    this.usage.cacheRead += num(u.cache_read_input_tokens);
    this.usage.cacheWrite += num(u.cache_creation_input_tokens);
    this.usage.responses++;
    this.day(at).outputTokens += num(u.output_tokens);
  }

  /** Count one transcript line. Never throws. */
  add(line: string) {
    const s = line.trim();
    if (!s || s[0] !== "{") return;
    const lead = LEADING_TYPE_RE.exec(s.slice(0, 40));
    if (lead && SKIP_TYPES.has(lead[1]!)) return;
    let raw: unknown;
    try {
      raw = JSON.parse(s);
    } catch {
      return;
    }
    const r = asRec(raw);
    if (!r) return;
    // Subagent work inside the main transcript belongs to the subagent, not the conversation.
    if (r.isSidechain === true) return;
    if (r.type === "assistant") this.countUsage(r, typeof r.timestamp === "string" ? Date.parse(r.timestamp) || 0 : 0);

    for (const ev of parseRecord(r)) {
      switch (ev.t) {
        case "meta":
          this.touch(ev.at);
          if (ev.cwd && !this.cwd) this.cwd = ev.cwd;
          if (ev.gitBranch) this.gitBranch = ev.gitBranch;
          break;
        case "title":
          this.titles[ev.source] = ev.title;
          break;
        case "pr":
          this.prUrl = ev.url;
          break;
        case "prompt":
          this.prompts++;
          this.day(ev.at).prompts++;
          this.lastEvent = "mid_turn";
          break;
        case "chat":
          if (ev.role === "note") this.compactions++;
          if (ev.role === "user" && !this.titles.prompt) {
            const t = chatTextOfPrompt(ev.text)?.replace(/\s+/g, " ").trim();
            if (t && !t.startsWith("/")) this.titles.prompt = t.length > TITLE_MAX ? t.slice(0, TITLE_MAX - 1) + "…" : t;
          }
          break;
        case "assistant":
          this.replies++;
          break;
        case "tool_start":
          this.toolCalls++;
          this.day(ev.at).toolCalls++;
          this.tools.set(ev.name, (this.tools.get(ev.name) ?? 0) + 1);
          if (EDIT_TOOLS.has(ev.name)) {
            const f = asRec(ev.input)?.file_path ?? asRec(ev.input)?.notebook_path;
            if (typeof f === "string" && f) this.files.add(f.toLowerCase());
          }
          this.lastEvent = "mid_turn";
          break;
        case "tool_end":
          if (ev.isError) {
            this.toolErrors++;
            this.day(ev.at).toolErrors++;
            this.lastEvent = "tool_error";
          } else this.lastEvent = "mid_turn";
          break;
        case "interrupted":
          this.interrupts++;
          this.lastEvent = "interrupted";
          break;
        case "api_error":
          this.apiErrors++;
          this.lastEvent = "api_error";
          break;
        case "turn_end":
          this.lastEvent = "reply_finished";
          break;
      }
    }
  }

  title(id: string): { title: string; source: "custom" | "agent" | "ai" | "prompt" | "id" } {
    const t = this.titles;
    if (t.custom) return { title: t.custom, source: "custom" };
    if (t.agent) return { title: t.agent, source: "agent" };
    if (t.ai) return { title: t.ai, source: "ai" };
    if (t.prompt) return { title: t.prompt, source: "prompt" };
    return { title: `Session ${id.slice(0, 8)}`, source: "id" };
  }
}
