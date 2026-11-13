/**
 * Plain words for a session, for Workspace → Focus: one headline and
 * one detail line that never repeat each other, and what the person can do
 * from here. Pure; only what the monitor knows.
 */
import type { SessionView } from "@shared/model";
import { elapsed, isUrgent } from "@/lib/status";

export type Tone = "urgent" | "turn" | "work" | "quiet" | "error" | "rest";

export interface Plain {
  tone: Tone;
  /** Short state: "Needs your approval", "Your turn", "Working"… */
  headline: string;
  /** What it's doing or waiting on, with time: "Editing auth.ts · 12s". */
  detail: string;
}

/** A working session with nothing recorded for this long reads "No recent activity". */
export const QUIET_MS = 5 * 60_000;

export function plainStatus(s: SessionView, now: number): Plain {
  const since = elapsed(s.statusSince, now);
  const ask = s.link?.approval;
  if (isUrgent(s)) {
    if (ask?.questions) return { tone: "urgent", headline: "Asked you a question", detail: `${ask.label} · ${since}` };
    if (ask) return { tone: "urgent", headline: "Needs your approval", detail: `${ask.label} · ${since}` };
    return { tone: "urgent", headline: s.waitingReason === "question" ? "Asked you a question" : "Needs your approval", detail: `Answer in its terminal · ${since}` };
  }
  if (s.status === "waiting") return { tone: "turn", headline: "Your turn", detail: `Reply finished ${since} ago` };
  if (s.status === "error") return { tone: "error", headline: "Stopped with an error", detail: s.statusNote ?? `${since} ago` };
  if (s.status === "working") {
    const quiet = now - s.lastActivityAt > QUIET_MS;
    const doing = s.action && s.action.kind !== "waiting" ? s.action.label : "Thinking";
    return quiet
      ? { tone: "quiet", headline: "No recent activity", detail: `Last: ${doing} · ${elapsed(s.lastActivityAt, now)} ago` }
      : { tone: "work", headline: "Working", detail: `${doing} · ${elapsed(s.action?.startedAt ?? s.statusSince, now)}` };
  }
  if (s.status === "finished") return { tone: "rest", headline: "Ended", detail: `${since} ago` };
  return { tone: "rest", headline: "Idle", detail: `for ${since}` };
}

/** What can be done from the browser, and if nothing, why (in plain words). */
export function controlOf(s: SessionView, demo: boolean): { canAct: boolean; why?: string } {
  if (demo) return { canAct: false, why: "Demo village: nothing is sent." };
  if (!s.link?.connected) return { canAct: false, why: "Watch only: this session isn't running the Ai Gramam mod." };
  return { canAct: true };
}

const RANK: Record<Tone, number> = { urgent: 0, turn: 1, error: 2, quiet: 3, work: 4, rest: 5 };

/** Most in need of the person first; within a tone, the longest waiting first. */
export function byAttention(now: number) {
  return (a: SessionView, b: SessionView) => RANK[plainStatus(a, now).tone] - RANK[plainStatus(b, now).tone] || a.statusSince - b.statusSince;
}

export function isInbox(s: SessionView, now: number): boolean {
  const t = plainStatus(s, now).tone;
  return t === "urgent" || t === "turn" || t === "error";
}

export const GROUP_TITLE: Record<Tone, string> = { urgent: "Needs you", turn: "Your turn", error: "Errors", quiet: "No recent activity", work: "Working", rest: "Resting" };

/** The next or previous session in the queue from the current one (clamped at the ends). */
export function step(queue: Array<{ id: string }>, currentId: string | null, by: 1 | -1): string | null {
  if (!queue.length) return null;
  const i = queue.findIndex((s) => s.id === currentId);
  if (i < 0) return queue[0]!.id;
  return queue[Math.max(0, Math.min(queue.length - 1, i + by))]!.id;
}

/** What the palette finds: sessions and projects whose name or folder contains every word typed. */
export function paletteMatches<T extends { label: string; sub: string }>(items: T[], query: string, limit = 12): T[] {
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  return items.filter((x) => words.every((w) => `${x.label} ${x.sub}`.toLowerCase().includes(w))).slice(0, limit);
}
