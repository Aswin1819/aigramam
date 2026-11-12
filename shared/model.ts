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

export type ServerMessage = { type: "snapshot"; payload: Snapshot };
export type ClientMessage =
  | { type: "demo-start"; payload: null }
  | { type: "demo-stop"; payload: null };
