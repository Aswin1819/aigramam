/**
 * Pure helpers for the managed-terminal UI (no React, no DOM), so they can be tested.
 */
import { TERMINAL_LIMITS, type TerminalInfo } from "@shared/terminal";
import type { SessionView } from "@shared/model";
import type { AppMode } from "@/hooks/useLiveSessions";

/** The terminal to show: the chosen one if it's still open, otherwise the newest. */
export function resolveActive(terminals: TerminalInfo[], activeId: string | null): TerminalInfo | null {
  if (!terminals.length) return null;
  return terminals.find((t) => t.id === activeId) ?? terminals[terminals.length - 1];
}

/** After closing a tab, show its neighbour (the next one, else the previous). */
export function neighbourAfterClose(terminals: TerminalInfo[], closedId: string): string | null {
  const i = terminals.findIndex((t) => t.id === closedId);
  if (i < 0) return terminals.length ? terminals[terminals.length - 1].id : null;
  const rest = terminals.filter((t) => t.id !== closedId);
  if (!rest.length) return null;
  return rest[Math.min(i, rest.length - 1)].id;
}

/** Why a terminal can't be started right now (null when it can). */
export function terminalBlockedReason(mode: AppMode, connected: boolean, openCount = 0): string | null {
  if (mode === "demo") return "Switch to Live to use terminals.";
  if (!connected) return "Not connected to Ai Gramam. Terminals come back when it reconnects.";
  if (openCount >= TERMINAL_LIMITS.maxOpen) return `At most ${TERMINAL_LIMITS.maxOpen} terminals can be open; close one first.`;
  return null;
}

/**
 * Split typed or pasted text so each piece stays under the server's input
 * limit (bytes). 16k UTF-16 units is at most 64,000 bytes in UTF-8, and a
 * surrogate pair is never split.
 */
export function chunkInput(data: string, maxUnits = 16_000): string[] {
  if (data.length <= maxUnits) return data ? [data] : [];
  const out: string[] = [];
  let i = 0;
  while (i < data.length) {
    let end = Math.min(i + maxUnits, data.length);
    const last = data.charCodeAt(end - 1);
    if (end < data.length && last >= 0xd800 && last <= 0xdbff) end--;
    out.push(data.slice(i, end));
    i = end;
  }
  return out;
}

/** Status text for a terminal, in words. */
export function terminalStatusText(t: TerminalInfo): string {
  if (t.status === "running") return "Running";
  return t.exitCode === undefined ? "Exited" : `Exited (code ${t.exitCode})`;
}

/** How long "Starting Claude…" shows for a Claude terminal that has no linked session yet. */
export const CLAUDE_STARTING_MS = 20_000;

export type ClaudeLink =
  | { kind: "linked"; sessionId: string; title: string; more: number }
  | { kind: "starting" }
  | null;

/**
 * What a terminal's status bar says about Claude Code: the session running in
 * it (matched by process on the server), "starting" for a little while after
 * "Start Claude Code", otherwise nothing (no guess).
 */
export function claudeLinkOf(t: TerminalInfo, sessions: Pick<SessionView, "id" | "title">[], now: number, startingMs = CLAUDE_STARTING_MS): ClaudeLink {
  const ids = t.sessionIds ?? [];
  if (ids.length) {
    const first = ids[0]!;
    const s = sessions.find((x) => x.id === first);
    return { kind: "linked", sessionId: first, title: s?.title ?? `Session ${first.slice(0, 8)}`, more: ids.length - 1 };
  }
  if (t.started === "claude" && t.status === "running" && now - t.createdAt < startingMs) return { kind: "starting" };
  return null;
}
