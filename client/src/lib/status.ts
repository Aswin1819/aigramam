import type { SessionStatus, SessionView, WaitingReason } from "@shared/model";

export const STATUS_META: Record<SessionStatus, { label: string; emoji: string; color: string; bg: string }> = {
  working: { label: "Working", emoji: "⚙️", color: "#5eead4", bg: "rgba(94, 234, 212, 0.14)" },
  waiting: { label: "Waiting for you", emoji: "🔔", color: "#f5b33d", bg: "rgba(245, 179, 61, 0.16)" },
  idle: { label: "Idle", emoji: "💤", color: "#9aa7a3", bg: "rgba(154, 167, 163, 0.14)" },
  finished: { label: "Finished", emoji: "✅", color: "#8ee59a", bg: "rgba(142, 229, 154, 0.14)" },
  error: { label: "Error", emoji: "⚠️", color: "#ff8a80", bg: "rgba(255, 90, 79, 0.16)" },
};

export const URGENT_COLOR = "#ff5a4f";

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

export function statusColor(s: Pick<SessionView, "status" | "waitingReason">): string {
  return isUrgent(s) ? URGENT_COLOR : STATUS_META[s.status].color;
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

/** Order for lists: needs-you first, then working, then idle/finished. */
export function attentionOrder(a: SessionView, b: SessionView): number {
  const rank = (s: SessionView) => (isUrgent(s) ? 0 : s.status === "waiting" ? 1 : s.status === "error" ? 2 : s.status === "working" ? 3 : 4);
  return rank(a) - rank(b) || a.title.localeCompare(b.title);
}
