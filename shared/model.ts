/**
 * Live session model shared by the server monitor and the browser.
 * Project → Session → Subagent. Everything here is display data built in
 * memory from local Claude Code files and hooks; it is never written to disk.
 */

export type SessionStatus = "working" | "waiting" | "idle" | "finished" | "error";

/**
 * Why a session is waiting for the user.
 * - permission: a permission dialog is open (hooks only)
 * - question: Claude asked a question (AskUserQuestion / elicitation)
 * - turn_end: Claude finished its reply; it's the user's turn
 */
export type WaitingReason = "permission" | "question" | "turn_end";

export type ActionKind =
  | "read"
  | "search"
  | "write"
  | "bash"
  | "web"
  | "delegate"
  | "question"
  | "tool"
  | "think"
  | "waiting"
  | "idle"
  | "done"
  | "error";

export interface Action {
  kind: ActionKind;
  emoji: string;
  /** Text-only label, e.g. "Editing auth.ts". Always present so the UI never relies on emoji alone. */
  label: string;
  /** Tool name when the action comes from a tool call. */
  tool?: string;
  startedAt: number;
}

export interface ActivityEntry {
  at: number;
  emoji: string;
  text: string;
  level: "info" | "warn" | "error";
  /** Set when the entry came from a subagent. */
  agent?: string;
}

/** A multiple-choice question Claude asked (AskUserQuestion), offered in the browser by the mod. */
export interface LinkQuestion {
  question: string;
  header: string;
  options: Array<{ label: string; description?: string }>;
  multiSelect: boolean;
}

/** One line of a session's conversation, for the chat view. */
export interface ChatItem {
  id: string;
  at: number;
  kind: "user" | "assistant" | "tool" | "note";
  text: string;
  emoji?: string;
  // Tool items only. What the transcript captured; not a full terminal.
  /** Tool name, e.g. "Bash". */
  tool?: string;
  /** The key input: the command, file path, pattern, URL/query or agent task (≤ ~500 chars). */
  detail?: string;
  /** The result text (plain text, images as "[image]"), at most the last ~6000 chars. Undefined when nothing was captured (e.g. hook-only sessions). */
  output?: string;
  /** True when output was cut to its last part. */
  outputClipped?: boolean;
  isError?: boolean;
  /** When the result arrived. */
  endedAt?: number;
}

export interface SubagentView {
  id: string;
  sessionId: string;
  agentType: string;
  description: string;
  status: SessionStatus;
  action?: Action;
  startedAt: number;
  lastActivityAt: number;
  finishedAt?: number;
}

export type TitleSource = "custom" | "agent" | "ai" | "registry" | "id" | "bridge" | "demo";
export type SessionSource = "transcript" | "hooks" | "bridge" | "demo";

export interface SessionView {
  id: string;
  shortId: string;
  projectId: string;
  title: string;
  titleSource: TitleSource;
  cwd: string;
  gitBranch?: string;
  status: SessionStatus;
  waitingReason?: WaitingReason;
  /** Without hooks a long-pending tool may be a permission prompt; shown as a soft hint, not a banner. */
  maybeNeedsApproval?: boolean;
  action?: Action;
  startedAt: number;
  lastActivityAt: number;
  statusSince: number;
  /** True once a hook event has arrived for this session. */
  hooksActive: boolean;
  source: SessionSource;
  prUrl?: string;
  /** Present when the Ai Gramam mod runs in this session: the browser can message, stop and approve. */
  link?: {
    connected: boolean;
    /** Messages queued in the browser, not yet picked up by the session. */
    queued: number;
    /** A permission request waiting for an answer in the browser. */
    approval?: { id: string; tool: string; label: string; since: number; questions?: LinkQuestion[] };
  };
  /**
   * The Ai Gramam managed terminal this session runs in (its process descends
   * from that terminal's shell). Unset when it was started anywhere else.
   */
  terminalId?: string;
  subagents: SubagentView[];
  recent: ActivityEntry[];
}

export interface ProjectView {
  id: string;
  name: string;
  root: string;
}

export interface HooksInfo {
  /** Our hook entries are present in ~/.claude/settings.json. */
  installed: boolean;
  lastEventAt?: number;
}

export interface Snapshot {
  projects: ProjectView[];
  sessions: SessionView[];
  hooks: HooksInfo;
  serverTime: number;
  demo: boolean;
}

export type ServerMessage =
  | { type: "snapshot"; payload: Snapshot }
  | { type: "worlds"; payload: import("./world").WorldsState }
  | { type: "characters"; payload: import("./character").CharactersState };
export type ClientMessage =
  | { type: "demo-start"; payload: null }
  | { type: "demo-stop"; payload: null }
  | { type: "session-message"; payload: { requestId: string; sessionId: string; text: string } }
  | { type: "session-stop"; payload: { requestId: string; sessionId: string } }
  /** answers (question text → chosen label(s) or typed text) only for a question; "deny" on a question means "answer it in the terminal". */
  | { type: "approval-decide"; payload: { requestId: string; approvalId: string; decision: "allow" | "deny"; answers?: Record<string, string> } }
  | { type: "chat-open"; payload: { sessionId: string } }
  | { type: "chat-close"; payload: null };

/** A session's conversation: the whole recent history when opened (reset), then new items as they come. */
export type ChatMessage = { type: "chat"; payload: { sessionId: string; reset: boolean; items: ChatItem[] } };

/** The server's reply to a browser command. */
export type CommandResult = { type: "command-result"; payload: { requestId: string; ok: boolean; error?: string } };
