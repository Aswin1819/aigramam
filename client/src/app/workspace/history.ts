/**
 * Filters and daily totals for the History page. Pure; every figure is a sum
 * of what the server counted from transcripts, nothing is estimated.
 */
import type { HistoryDay, HistorySession, LastEvent } from "@shared/history";

export type HistoryRange = "today" | "7d" | "30d" | "all";
export type HistoryState = "all" | "live" | "ended";

export const RANGE_LABEL: Record<HistoryRange, string> = { today: "Today", "7d": "7 days", "30d": "30 days", all: "Everything" };

export interface HistoryFilter {
  range: HistoryRange;
  projectId: string | null;
  state: HistoryState;
  query: string;
}

/** Start of the range (local midnight), or 0 for everything. */
export function rangeStart(range: HistoryRange, now: number): number {
  if (range === "all") return 0;
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  const days = range === "today" ? 0 : range === "7d" ? 6 : 29;
  d.setDate(d.getDate() - days);
  return d.getTime();
}

/** Local YYYY-MM-DD (same keys as the server's HistoryDay.day). */
export function localDay(ms: number): string {
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Sessions with any activity in the range that match the filters, most recent first. */
export function filterHistory(sessions: HistorySession[], f: HistoryFilter, now: number): HistorySession[] {
  const from = rangeStart(f.range, now);
  const q = f.query.trim().toLowerCase();
  return sessions
    .filter((s) => s.lastActivityAt >= from)
    .filter((s) => !f.projectId || s.projectId === f.projectId)
    .filter((s) => f.state === "all" || s.state === f.state)
    .filter((s) => !q || [s.title, s.projectName, s.gitBranch ?? "", s.id].some((x) => x.toLowerCase().includes(q)))
    .sort((a, b) => b.lastActivityAt - a.lastActivityAt);
}

export interface DayTotal extends HistoryDay {
  sessions: number;
}

/** Per-day totals across sessions, newest day first, limited to days inside the range. */
export function dailyTotals(sessions: HistorySession[], range: HistoryRange, now: number): DayTotal[] {
  const fromDay = range === "all" ? "" : localDay(rangeStart(range, now));
  const byDay = new Map<string, DayTotal>();
  for (const s of sessions) {
    for (const d of s.days) {
      if (d.day < fromDay) continue;
      const t = byDay.get(d.day) ?? { day: d.day, prompts: 0, toolCalls: 0, toolErrors: 0, activeMs: 0, outputTokens: 0, sessions: 0 };
      t.prompts += d.prompts;
      t.toolCalls += d.toolCalls;
      t.toolErrors += d.toolErrors;
      t.activeMs += d.activeMs;
      t.outputTokens += d.outputTokens;
      t.sessions++;
      byDay.set(d.day, t);
    }
  }
  return [...byDay.values()].sort((a, b) => b.day.localeCompare(a.day));
}

/** Projects that appear in the history, by name. */
export function historyProjects(sessions: HistorySession[]): Array<{ id: string; name: string }> {
  const m = new Map<string, string>();
  for (const s of sessions) if (s.projectId) m.set(s.projectId, s.projectName);
  return [...m.entries()].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
}

export const LAST_EVENT_LABEL: Record<LastEvent, string> = {
  reply_finished: "Last recorded: reply finished",
  interrupted: "Last recorded: interrupted",
  tool_error: "Last recorded: a tool error",
  api_error: "Last recorded: an API error",
  mid_turn: "Last recorded: mid-reply (no finished reply after it)",
  none: "Nothing recorded",
};

/** "1h 05m", "12m", "40s". */
export function duration(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${h}h ${String(m % 60).padStart(2, "0")}m`;
  return `${Math.floor(h / 24)}d ${h % 24}h`;
}

/** Exact token counts, shortened for reading: 950, 12.3k, 4.56M. */
export function tokens(n: number): string {
  if (n < 1000) return String(n);
  if (n < 1_000_000) return `${(n / 1000).toFixed(n < 10_000 ? 2 : 1)}k`;
  return `${(n / 1_000_000).toFixed(2)}M`;
}

export function dayLabel(day: string, now: number): string {
  if (day === localDay(now)) return "Today";
  const y = new Date(now);
  y.setDate(y.getDate() - 1);
  if (day === localDay(y.getTime())) return "Yesterday";
  const [yy, mm, dd] = day.split("-").map(Number);
  return new Date(yy!, mm! - 1, dd!).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
}

export function dateTime(ms: number): string {
  return new Date(ms).toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}
