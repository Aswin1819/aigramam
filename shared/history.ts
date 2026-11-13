/**
 * Session history, read from Claude Code's own transcripts on this computer
 * (`~/.claude/projects/<folder>/<session>.jsonl`). Ai Gramam keeps nothing:
 * every figure here is counted from those files in memory and recounted when
 * they change. Claude Code removes old transcripts itself (30 days by
 * default, its `cleanupPeriodDays` setting), so history only goes back as far
 * as the files that remain.
 */

/** Token counts as the API reported them (main conversation only; subagents' own transcripts aren't added). */
export interface HistoryUsage {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  /** API responses counted (each once, however many records it was split into). */
  responses: number;
}

/** One local calendar day of a session's recorded activity. */
export interface HistoryDay {
  /** Local date, YYYY-MM-DD. */
  day: string;
  prompts: number;
  toolCalls: number;
  toolErrors: number;
  /** Time between recorded events that were at most ACTIVE_GAP_MS apart. */
  activeMs: number;
  outputTokens: number;
}

/**
 * What the last recorded event was. The transcript can't say whether a
 * session "succeeded"; this is only what was written last.
 */
export type LastEvent = "reply_finished" | "interrupted" | "tool_error" | "api_error" | "mid_turn" | "none";

export interface HistorySession {
  id: string;
  /** Same id the live views use (the git repository root, or the folder). */
  projectId: string;
  projectName: string;
  cwd: string;
  gitBranch?: string;
  title: string;
  titleSource: "custom" | "agent" | "ai" | "prompt" | "id";
  /** First and last recorded event. */
  startedAt: number;
  lastActivityAt: number;
  activeMs: number;
  prompts: number;
  replies: number;
  toolCalls: number;
  toolErrors: number;
  /** Calls per tool name, most used first (at most 12). */
  topTools: Array<[string, number]>;
  /** Distinct files written with Write/Edit/MultiEdit/NotebookEdit. */
  filesEdited: number;
  interrupts: number;
  compactions: number;
  apiErrors: number;
  /** Subagent transcripts found next to this session's. */
  subagents: number;
  models: string[];
  /** Null when the transcript carries no usage figures. */
  usage: HistoryUsage | null;
  prUrl?: string;
  lastEvent: LastEvent;
  /** "live": the monitor shows it now (open or recently active). Otherwise it has ended or isn't running. */
  state: "live" | "ended";
  days: HistoryDay[];
}

export interface HistoryList {
  sessions: HistorySession[];
  /** Set while transcripts are being read for the first time (or after big changes). */
  scanning: { done: number; total: number } | null;
  /** Oldest transcript still on disk (history can't go further back). */
  oldestAt: number | null;
}

export type TimelineKind =
  | "start"
  | "prompt"
  | "tool"
  | "question"
  | "subagent"
  | "tool_error"
  | "interrupted"
  | "compacted"
  | "turn_end"
  | "api_error"
  | "pr";

export interface TimelineEvent {
  at: number;
  kind: TimelineKind;
  /** Plain description, e.g. "Ran a command" or "You sent a message". */
  text: string;
  /** The command, file, prompt excerpt, etc. (clipped). */
  detail?: string;
  tool?: string;
}

export interface SessionTimeline {
  sessionId: string;
  events: TimelineEvent[];
  /** Older events left out to keep the view light. */
  omitted: number;
}

/** Gaps between recorded events longer than this don't count as active time. */
export const ACTIVE_GAP_MS = 5 * 60_000;
