/**
 * Managed terminals: shells (PowerShell on Windows, the person's own shell on
 * macOS and Linux) that Ai Gramam starts in a project folder
 * when the person asks (roadmap Phase 2). They run on this computer through
 * the server and are shown in the browser; they are not the terminals the
 * person opened themselves, which Ai Gramam can't attach to.
 */

export type TerminalStatus = "running" | "exited";

/** What a terminal starts with besides the shell. Only Claude Code, and only from the person's click. */
export type TerminalStart = "claude";

/** Shown when "Start Claude Code" is asked for but the `claude` command isn't installed. */
export const CLAUDE_CLI_MISSING = "Claude Code CLI wasn't found on PATH. Install it or open a plain terminal.";

export interface TerminalInfo {
  id: string;
  projectId: string;
  projectName: string;
  /** The folder it started in (a known project's folder). */
  cwd: string;
  /** The shell program, e.g. "powershell.exe" or "/bin/zsh". */
  shell: string;
  pid: number;
  createdAt: number;
  status: TerminalStatus;
  exitCode?: number;
  exitedAt?: number;
  /** Set when the terminal was opened with "Start Claude Code" (the shell runs `claude`, then stays open). */
  started?: TerminalStart;
  /**
   * Claude Code sessions running inside this terminal right now: their process
   * is a child (or grandchild) of this terminal's shell and is the pid in
   * Claude Code's session registry. Exact pid matches only; empty otherwise.
   */
  sessionIds: string[];
}

/** Limits, shared so the UI can explain them. */
export const TERMINAL_LIMITS = {
  /** Terminals open at once (running or exited but not closed). */
  maxOpen: 8,
  /** Output kept per terminal so a reopened tab can show what happened. */
  scrollbackBytes: 256 * 1024,
  /** Largest single input message (a paste). */
  maxInputBytes: 64 * 1024,
  minCols: 20,
  maxCols: 400,
  minRows: 5,
  maxRows: 200,
} as const;

/** Browser → server. */
export type TerminalClientMessage =
  | { type: "term-create"; payload: { requestId: string; projectId: string; cols: number; rows: number; start?: TerminalStart } }
  | { type: "term-attach"; payload: { id: string } }
  | { type: "term-detach"; payload: { id: string } }
  | { type: "term-input"; payload: { id: string; data: string } }
  | { type: "term-resize"; payload: { id: string; cols: number; rows: number } }
  /** Stops the shell if it's running and forgets the terminal. */
  | { type: "term-close"; payload: { id: string } };

/** Server → browser. */
export type TerminalServerMessage =
  /** `shellName`: what a new terminal starts ("PowerShell", "zsh"…). */
  | { type: "term-list"; payload: { terminals: TerminalInfo[]; shellName?: string } }
  | { type: "term-created"; payload: { requestId: string; ok: boolean; id?: string; error?: string } }
  /** Output since attaching; `replay` marks the scrollback sent on attach. */
  | { type: "term-output"; payload: { id: string; data: string; replay?: boolean } }
  | { type: "term-error"; payload: { id?: string; error: string } };
