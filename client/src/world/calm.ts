/**
 * Keeps villagers calm: while a session works through quick tool calls
 * (read, read, edit, run…), its pose changes at most every MIN_HOLD_MS.
 * State changes the person must see (waiting, question, error, done, idle)
 * always show at once. The text label still shows the latest action.
 */
import type { SceneKind } from "@shared/world";

export const MIN_HOLD_MS = 1500;

/** Kinds that only say what a working session is doing right now. */
const ACTIVITY: ReadonlySet<SceneKind> = new Set(["read", "search", "write", "bash", "test", "web", "delegate", "tool", "think"]);

export interface Held {
  kind: SceneKind;
  since: number;
}

/** The pose to show now, given the one shown so far (null at first) and the session's latest kind. */
export function calmKind(prev: Held | null, next: SceneKind, now: number, minHoldMs = MIN_HOLD_MS): Held {
  if (!prev || prev.kind === next) return prev ?? { kind: next, since: now };
  const bothActivity = ACTIVITY.has(prev.kind) && ACTIVITY.has(next);
  if (bothActivity && now - prev.since < minHoldMs) return prev;
  return { kind: next, since: now };
}

/** The scene a world defines for a kind; "test" falls back to "bash" for worlds made before it existed. */
export function sceneKindFallback(kind: SceneKind, defined: (k: SceneKind) => boolean): SceneKind {
  if (defined(kind)) return kind;
  if (kind === "test") return "bash";
  return kind;
}
