/**
 * A session's recorded events in order, for the History page: messages sent,
 * tools run, questions, subagents, errors, interruptions, finished replies.
 * Read from the transcript when asked and not kept. Approval requests aren't
 * written to transcripts, so they can't appear here.
 */
import fs from "fs";
import readline from "readline";
import type { SessionTimeline, TimelineEvent } from "@shared/history";
import { describeTool } from "../monitor/actions";
import { chatTextOfPrompt, parseRecord } from "../monitor/parser";

const LEADING_TYPE_RE = /^\{"type":"([a-z-]+)"/;
const KEEP_TYPES = new Set(["user", "assistant", "system", "pr-link"]);
const DETAIL_MAX = 240;
export const TIMELINE_MAX = 800;

const clip = (t: string | undefined, max = DETAIL_MAX) => {
  if (!t) return undefined;
  const one = t.replace(/\s+/g, " ").trim();
  return one.length > max ? one.slice(0, max - 1) + "…" : one || undefined;
};

function formatDuration(ms: number): string {
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  return m < 60 ? `${m}m ${s % 60}s` : `${Math.floor(m / 60)}h ${m % 60}m`;
}

/** Turn one transcript line into timeline events (exported for tests). */
export interface TimelineState {
  /** Tool call id → tool name, to name the tool in an error. */
  toolNames: Map<string, string>;
  started: boolean;
  /** Claude Code writes the PR link record again and again; show it when it changes. */
  lastPr?: string;
}

export const newTimelineState = (): TimelineState => ({ toolNames: new Map(), started: false });

export function timelineEventsOf(line: string, st: TimelineState): TimelineEvent[] {
  const s = line.trim();
  if (!s || s[0] !== "{") return [];
  const lead = LEADING_TYPE_RE.exec(s.slice(0, 40));
  if (lead && !KEEP_TYPES.has(lead[1]!)) return [];
  let r: Record<string, unknown>;
  try {
    r = JSON.parse(s);
  } catch {
    return [];
  }
  if (!r || typeof r !== "object" || r.isSidechain === true) return [];
  const out: TimelineEvent[] = [];
  for (const ev of parseRecord(r)) {
    switch (ev.t) {
      case "meta":
        if (!st.started) {
          st.started = true;
          out.push({ at: ev.at, kind: "start", text: "Session started", detail: ev.cwd });
        }
        break;
      case "chat":
        if (ev.role === "user") {
          const said = chatTextOfPrompt(ev.text);
          out.push({ at: ev.at, kind: "prompt", text: said?.startsWith("/") ? "You ran a command" : "You sent a message", detail: clip(said ?? undefined) });
        } else if (ev.role === "note") out.push({ at: ev.at, kind: "compacted", text: "Conversation compacted (earlier context summarised)" });
        break;
      case "tool_start": {
        st.toolNames.set(ev.id, ev.name);
        if (ev.name === "AskUserQuestion") out.push({ at: ev.at, kind: "question", text: "Claude asked you a question", tool: ev.name });
        else if (ev.name === "Agent" || ev.name === "Task") out.push({ at: ev.at, kind: "subagent", text: "Started a subagent", detail: clip(ev.detail), tool: ev.name });
        else out.push({ at: ev.at, kind: "tool", text: describeTool(ev.name, ev.input, ev.at).label, detail: clip(ev.detail), tool: ev.name });
        break;
      }
      case "tool_end":
        if (ev.isError) {
          const tool = st.toolNames.get(ev.id);
          out.push({ at: ev.at, kind: "tool_error", text: tool ? `${tool} reported an error` : "A tool reported an error", detail: clip(ev.output), tool });
        }
        break;
      case "interrupted":
        out.push({ at: ev.at, kind: "interrupted", text: "Interrupted" });
        break;
      case "turn_end": {
        const ms = typeof r.durationMs === "number" && r.durationMs > 0 ? r.durationMs : 0;
        out.push({ at: ev.at, kind: "turn_end", text: ms ? `Reply finished (took ${formatDuration(ms)})` : "Reply finished" });
        break;
      }
      case "api_error":
        out.push({ at: ev.at, kind: "api_error", text: "The API returned an error" });
        break;
      case "pr":
        if (ev.url === st.lastPr) break;
        st.lastPr = ev.url;
        out.push({ at: typeof r.timestamp === "string" ? Date.parse(r.timestamp) || 0 : 0, kind: "pr", text: "Pull request linked", detail: ev.url });
        break;
    }
  }
  return out;
}

/** Read a transcript's timeline: the latest `max` events, oldest first. */
export async function readTimeline(file: string, sessionId: string, max = TIMELINE_MAX): Promise<SessionTimeline> {
  const events: TimelineEvent[] = [];
  let total = 0;
  const st = newTimelineState();
  const rl = readline.createInterface({ input: fs.createReadStream(file, { highWaterMark: 1 << 20 }), crlfDelay: Infinity });
  try {
    for await (const line of rl) {
      for (const ev of timelineEventsOf(line, st)) {
        total++;
        // Keep the start, then a rolling window of the latest events.
        if (ev.kind === "start" || events.length < max) events.push(ev);
        else events.splice(1, 1), events.push(ev);
      }
    }
  } catch {
    // A transcript that disappears mid-read just yields what was read.
  }
  return { sessionId, events, omitted: Math.max(0, total - events.length) };
}
