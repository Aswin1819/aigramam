import type { SessionStatus, SessionView, WaitingReason } from "@shared/model";

export const STATUS_META: Record<SessionStatus, { label: string; emoji: string; color: string; bg: string }> = {
  working: { label: "Working", emoji: "⚙️", color: "#7dd3fc", bg: "#0c4a6e55" },
  waiting: { label: "Waiting for you", emoji: "🔔", color: "#fbbf24", bg: "#78350f66" },
  idle: { label: "Idle", emoji: "💤", color: "#9ca3af", bg: "#37415144" },
  finished: { label: "Finished", emoji: "✅", color: "#86efac", bg: "#14532d55" },
  error: { label: "Error", emoji: "⚠️", color: "#fca5a5", bg: "#7f1d1d66" },
};

export const WAITING_META: Record<WaitingReason, { label: string; urgent: boolean }> = {
  permission: { label: "Needs approval", urgent: true },
  question: { label: "Asked a question", urgent: true },
  turn_end: { label: "Your turn", urgent: false },
};

export function statusText(s: Pick<SessionView, "status" | "waitingReason">): string {
  if (s.status === "waiting" && s.waitingReason) return WAITING_META[s.waitingReason].label;
  return STATUS_META[s.status].label;
}

export function isUrgent(s: Pick<SessionView, "status" | "waitingReason">): boolean {
  return s.status === "waiting" && !!s.waitingReason && WAITING_META[s.waitingReason].urgent;
}

/** "45s", "12m", "3h 05m" */
export function elapsed(from: number, now: number): string {
  const sec = Math.max(0, Math.floor((now - from) / 1000));
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m`;
  const h = Math.floor(min / 60);
  return `${h}h ${String(min % 60).padStart(2, "0")}m`;
}

export function clockTime(at: number): string {
  return new Date(at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

/** Most urgent first: approvals/questions, then "your turn", then the rest. */
export function waitingOrder(a: SessionView, b: SessionView): number {
  const rank = (s: SessionView) => (isUrgent(s) ? 0 : s.status === "waiting" ? 1 : 2);
  return rank(a) - rank(b) || a.statusSince - b.statusSince;
}
