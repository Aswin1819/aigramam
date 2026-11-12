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
  | { t: "tool_start"; at: number; id: string; name: string; input: unknown }
  | { t: "tool_end"; at: number; id: string; isError: boolean; interrupted: boolean; async: boolean; agentId?: string }
  | { t: "interrupted"; at: number }
  | { t: "turn_end"; at: number; pendingBackground: number }
  | { t: "permission_mode"; mode: string }
  | { t: "api_error"; at: number }
  | { t: "pr"; url: string };

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
      for (const b of blocksOf(r)) {
        if (b.type === "tool_use" && typeof b.id === "string") {
          sawTool = true;
          events.push({ t: "tool_start", at, id: b.id, name: typeof b.name === "string" ? b.name : "tool", input: b.input });
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
          events.push({
            t: "tool_end",
            at,
            id: b.tool_use_id as string,
            isError: b.is_error === true,
            interrupted: tur?.interrupted === true,
            async: tur?.isAsync === true,
            agentId: typeof tur?.agentId === "string" ? tur.agentId : undefined,
          });
        }
        return events;
      }
      const text = textOf(r);
      if (INTERRUPT_RE.test(text.trim())) {
        events.push({ t: "interrupted", at });
      } else if (r.isMeta !== true && text.trim()) {
        events.push({ t: "prompt", at });
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
