/**
 * Claude Code transcript record → monitor events.
 *
 * The transcript format is internal to Claude Code and changes between
 * versions, so every field is optional here and unknown records are ignored.
 * This function never throws.
 */

export type MonitorEvent =
  | { t: "meta"; at: number; cwd?: string; gitBranch?: string }
  | { t: "title"; source: "custom" | "agent" | "ai"; title: string }
  | { t: "prompt"; at: number }
  | { t: "assistant"; at: number }
  /** detail: the call's key input for the chat view (see toolDetail). */
  | { t: "tool_start"; at: number; id: string; name: string; input: unknown; detail?: string }
  /** output: the result text (clipped, see toolOutput); undefined when the record has none. */
  | { t: "tool_end"; at: number; id: string; isError: boolean; interrupted: boolean; async: boolean; agentId?: string; output?: string; outputClipped?: boolean }
  /** fromApp: the turn was stopped from Ai Gramam (reported by the mod). */
  | { t: "interrupted"; at: number; fromApp?: boolean }
  | { t: "turn_end"; at: number; pendingBackground: number }
  | { t: "permission_mode"; mode: string }
  | { t: "api_error"; at: number }
  | { t: "pr"; url: string }
  /** A conversation message for the chat view (kept in memory only). */
  | { t: "chat"; at: number; id: string; role: "user" | "assistant" | "note"; text: string };

type Rec = Record<string, unknown>;

function asRec(v: unknown): Rec | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Rec) : null;
}

function timeOf(r: Rec): number {
  const ts = r.timestamp;
  if (typeof ts === "string") {
    const n = Date.parse(ts);
    if (!Number.isNaN(n)) return n;
  }
  if (typeof ts === "number") return ts;
  return Date.now();
}

function blocksOf(r: Rec): Rec[] {
  const content = asRec(r.message)?.content;
  return Array.isArray(content) ? (content.map(asRec).filter(Boolean) as Rec[]) : [];
}

function textOf(r: Rec): string {
  const content = asRec(r.message)?.content;
  if (typeof content === "string") return content;
  return blocksOf(r)
    .filter((b) => b.type === "text" && typeof b.text === "string")
    .map((b) => b.text as string)
    .join("\n");
}

const INTERRUPT_RE = /^\[Request interrupted by user/;
/** The engine's record for a tool call whose turn ended before it finished. */
const TOOL_CUT_RE = /^\[Tool call did not complete/;
const MAX_CHAT_TEXT = 20_000;

function clipChat(t: string): string {
  return t.length > MAX_CHAT_TEXT ? t.slice(0, MAX_CHAT_TEXT) + "\n…" : t;
}

/**
 * What the person actually said in a user record, for the chat view: system
 * reminders stripped, a slash command shown as "/name args", and engine
 * notices (background-task notifications, local command output) left out.
 */
export function chatTextOfPrompt(raw: string): string | null {
  const t = raw.replace(/<system-reminder>[\s\S]*?<\/system-reminder>/g, "").trim();
  if (!t) return null;
  const cmd = /<command-name>([^<]*)<\/command-name>/.exec(t);
  if (cmd) {
    const args = /<command-args>([\s\S]*?)<\/command-args>/.exec(t)?.[1]?.trim();
    const name = (cmd[1] ?? "").trim();
    return `${name.startsWith("/") ? name : "/" + name}${args ? " " + args : ""}`;
  }
  if (/^<(task-notification|local-command-[a-z]+|command-[a-z]+|bash-[a-z]+)\b/.test(t)) return null;
  return clipChat(t);
}

export const TOOL_DETAIL_MAX = 500;
export const TOOL_OUTPUT_MAX = 6000;
const REMINDER_RE = /<system-reminder>[\s\S]*?<\/system-reminder>/g;

/**
 * The key input of a tool call, for the chat view: the command, file path,
 * search pattern, URL or query, or a subagent's task. Only well-known fields;
 * never file contents. At most TOOL_DETAIL_MAX characters.
 */
export function toolDetail(name: string, rawInput: unknown): string | undefined {
  const input = asRec(rawInput);
  if (!input) return undefined;
  const str = (...keys: string[]) => {
    for (const k of keys) {
      const v = input[k];
      if (typeof v === "string" && v.trim()) return v.trim();
    }
    return "";
  };
  let d = "";
  switch (name) {
    case "Bash":
    case "PowerShell":
      d = str("command");
      if (d) d = `$ ${d}`;
      break;
    case "Read":
    case "Write":
    case "Edit":
    case "MultiEdit":
    case "NotebookRead":
    case "NotebookEdit":
      d = str("file_path", "notebook_path", "path");
      break;
    case "Grep":
    case "Glob": {
      const p = str("pattern");
      const where = str("path", "glob");
      d = p ? (where ? `${p}  in ${where}` : p) : "";
      break;
    }
    case "WebFetch":
      d = str("url");
      break;
    case "WebSearch":
      d = str("query");
      break;
    case "Agent":
    case "Task": {
      const type = str("subagent_type");
      const desc = str("description");
      d = [type, desc].filter(Boolean).join(": ");
      break;
    }
    default:
      d = str("command", "file_path", "path", "pattern", "url", "query", "description");
  }
  if (!d) return undefined;
  return d.length > TOOL_DETAIL_MAX ? d.slice(0, TOOL_DETAIL_MAX - 1) + "…" : d;
}

/**
 * A tool_result block's content as plain text: text blocks joined, images as
 * "[image]", system reminders stripped, and only the last TOOL_OUTPUT_MAX
 * characters kept (command output matters most at its end).
 * Undefined when the block carries no content field.
 */
export function toolOutput(content: unknown): { output: string; clipped: boolean } | undefined {
  let text: string;
  if (typeof content === "string") text = content;
  else if (Array.isArray(content)) {
    const parts: string[] = [];
    for (const raw of content) {
      const b = asRec(raw);
      if (!b) continue;
      if (b.type === "text" && typeof b.text === "string") parts.push(b.text);
      else if (b.type === "image") parts.push("[image]");
    }
    text = parts.join("\n");
  } else return undefined;
  // Drop blank lines at the edges but keep the first line's indentation (e.g. Read's line numbers).
  text = text.replace(REMINDER_RE, "").replace(/^(?:[ \t]*\r?\n)+/, "").trimEnd();
  if (text.length <= TOOL_OUTPUT_MAX) return { output: text, clipped: false };
  return { output: text.slice(text.length - TOOL_OUTPUT_MAX), clipped: true };
}

export function parseRecord(raw: unknown): MonitorEvent[] {
  const r = asRec(raw);
  if (!r) return [];
  const events: MonitorEvent[] = [];
  const type = typeof r.type === "string" ? r.type : "";

  try {
    switch (type) {
      case "custom-title":
        if (typeof r.customTitle === "string" && r.customTitle.trim()) events.push({ t: "title", source: "custom", title: r.customTitle.trim() });
        return events;
      case "agent-name":
        if (typeof r.agentName === "string" && r.agentName.trim()) events.push({ t: "title", source: "agent", title: r.agentName.trim() });
        return events;
      case "ai-title":
        if (typeof r.aiTitle === "string" && r.aiTitle.trim()) events.push({ t: "title", source: "ai", title: r.aiTitle.trim() });
        return events;
      case "permission-mode":
        if (typeof r.permissionMode === "string") events.push({ t: "permission_mode", mode: r.permissionMode });
        return events;
      case "pr-link":
        if (typeof r.prUrl === "string" && /^https:\/\//.test(r.prUrl)) events.push({ t: "pr", url: r.prUrl });
        return events;
    }

    const at = timeOf(r);
    if (typeof r.cwd === "string" || typeof r.gitBranch === "string") {
      events.push({
        t: "meta",
        at,
        cwd: typeof r.cwd === "string" && r.cwd ? r.cwd : undefined,
        // "HEAD" means no branch (detached checkout or not a git folder).
        gitBranch: typeof r.gitBranch === "string" && r.gitBranch && r.gitBranch !== "HEAD" ? r.gitBranch : undefined,
      });
    }

    if (type === "assistant") {
      if (r.isApiErrorMessage === true) {
        events.push({ t: "api_error", at });
        return events;
      }
      let sawTool = false;
      const said = blocksOf(r)
        .filter((b) => b.type === "text" && typeof b.text === "string")
        .map((b) => b.text as string)
        .join("\n\n")
        .trim();
      if (said && r.isSidechain !== true) {
        events.push({ t: "chat", at, id: typeof r.uuid === "string" ? r.uuid : `a-${at}`, role: "assistant", text: clipChat(said) });
      }
      for (const b of blocksOf(r)) {
        if (b.type === "tool_use" && typeof b.id === "string") {
          sawTool = true;
          const name = typeof b.name === "string" ? b.name : "tool";
          events.push({ t: "tool_start", at, id: b.id, name, input: b.input, detail: toolDetail(name, b.input) });
        }
      }
      if (!sawTool) events.push({ t: "assistant", at });
      return events;
    }

    if (type === "user") {
      const results = blocksOf(r).filter((b) => b.type === "tool_result" && typeof b.tool_use_id === "string");
      if (results.length > 0) {
        const tur = asRec(r.toolUseResult);
        for (const b of results) {
          const out = toolOutput(b.content);
          events.push({
            t: "tool_end",
            at,
            id: b.tool_use_id as string,
            isError: b.is_error === true,
            interrupted: tur?.interrupted === true,
            async: tur?.isAsync === true,
            agentId: typeof tur?.agentId === "string" ? tur.agentId : undefined,
            output: out?.output,
            outputClipped: out?.clipped || undefined,
          });
        }
        // A turn ended mid-tool (stopped, or cut short for a queued message) records the call as not completed.
        if (typeof r.toolUseResult === "string" && TOOL_CUT_RE.test(r.toolUseResult)) events.push({ t: "interrupted", at });
        return events;
      }
      const text = textOf(r);
      if (r.isCompactSummary === true) {
        // Claude Code's own summary after compaction: not something the person typed.
        if (r.isSidechain !== true) events.push({ t: "chat", at, id: typeof r.uuid === "string" ? r.uuid : `c-${at}`, role: "note", text: "Conversation compacted · earlier context was summarised" });
      } else if (INTERRUPT_RE.test(text.trim())) {
        events.push({ t: "interrupted", at });
      } else if (r.isMeta !== true && text.trim()) {
        events.push({ t: "prompt", at });
        const said = r.isSidechain === true ? null : chatTextOfPrompt(text);
        if (said) events.push({ t: "chat", at, id: typeof r.uuid === "string" ? r.uuid : `u-${at}`, role: "user", text: said });
      }
      return events;
    }

    if (type === "system" && r.subtype === "turn_duration") {
      const pending = typeof r.pendingBackgroundAgentCount === "number" ? r.pendingBackgroundAgentCount : 0;
      events.push({ t: "turn_end", at, pendingBackground: pending });
      return events;
    }
  } catch {
    return events;
  }
  return events;
}

/** Parse one JSONL line; malformed lines produce no events. */
export function parseLine(line: string): MonitorEvent[] {
  const s = line.trim();
  if (!s || s[0] !== "{") return [];
  try {
    return parseRecord(JSON.parse(s));
  } catch {
    return [];
  }
}
