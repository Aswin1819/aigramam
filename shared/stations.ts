/**
 * Plots and stations: the shared village layout both renderers use.
 *
 * - Each project gets a plot (a yard in front of its place) and keeps it while
 *   the page is open (PlaceKeeper), so nobody walks across the village because
 *   another project started or stopped.
 * - Every plot has the same stations, so one place teaches them all:
 *   study (read, search), desk (write, delegate), works (commands, tests,
 *   tools), gate (web), porch (approval, question: front, facing you),
 *   bench (your turn, idle).
 * - Villagers walk only to change station, and only after that kind of work
 *   has gone on for a while (StationKeeper). States that need the person move
 *   at once; an error stays where it happened; thinking stays put.
 */
import type { SessionView } from "./model";
import { hashString } from "./placement";

export type Station = "study" | "desk" | "works" | "gate" | "porch" | "bench";
export const STATIONS: Station[] = ["study", "desk", "works", "gate", "porch", "bench"];

export const STATION_LABEL: Record<Station, string> = {
  study: "Study (reading, searching)",
  desk: "Desk (writing code, delegating)",
  works: "Works (commands, tests)",
  gate: "Gate (the web)",
  porch: "Porch (needs you)",
  bench: "Bench (your turn, resting)",
};

/** A sustained new activity must last this long before the villager walks to its station. */
export const DWELL_MS = 3000;
/** And at most one walk between work stations in this long. */
export const MOVE_GAP_MS = 6000;

/** The station a session's current state calls for; null = stay where it is (thinking, error). */
export function wantedStation(s: Pick<SessionView, "status" | "waitingReason" | "action">): Station | null {
  if (s.status === "waiting") return s.waitingReason === "turn_end" || !s.waitingReason ? "bench" : "porch";
  if (s.status === "idle" || s.status === "finished") return "bench";
  if (s.status === "error") return null;
  switch (s.action?.kind) {
    case "read":
    case "search":
      return "study";
    case "write":
    case "delegate":
      return "desk";
    case "bash":
    case "test":
    case "tool":
      return "works";
    case "web":
      return "gate";
    case "question":
      return "porch";
    case "waiting":
      return "bench";
    default:
      return null; // think, or no action yet
  }
}

const ATTENTION: ReadonlySet<Station> = new Set(["porch", "bench"]);

interface Track {
  station: Station;
  movedAt: number;
  candidate: Station | null;
  candidateSince: number;
}

/** Remembers each villager's station and applies the dwell rule. */
export class StationKeeper {
  private tracks = new Map<string, Track>();

  /** The station to show for a session now. */
  stationOf(id: string, wanted: Station | null, now: number): Station {
    let t = this.tracks.get(id);
    if (!t) {
      t = { station: wanted ?? "desk", movedAt: now, candidate: null, candidateSince: now };
      this.tracks.set(id, t);
      return t.station;
    }
    if (wanted === null || wanted === t.station) {
      t.candidate = null;
      return t.station;
    }
    // Needs the person, or leaving an attention spot for work: go now.
    if (ATTENTION.has(wanted) || ATTENTION.has(t.station)) {
      t.station = wanted;
      t.movedAt = now;
      t.candidate = null;
      return t.station;
    }
    if (t.candidate !== wanted) {
      t.candidate = wanted;
      t.candidateSince = now;
    }
    if (now - t.candidateSince >= DWELL_MS && now - t.movedAt >= MOVE_GAP_MS) {
      t.station = wanted;
      t.movedAt = now;
      t.candidate = null;
    }
    return t.station;
  }

  prune(live: Set<string>) {
    for (const id of this.tracks.keys()) if (!live.has(id)) this.tracks.delete(id);
  }
}

/** A plot: the yard in front of a place, centred on x, standing line at y. */
export interface Plot {
  x: number;
  y: number;
  w: number;
}

/** Station centres as fractions of the plot width, and depth offsets (positive = nearer the viewer). */
const LAYOUT: Record<Station, { fx: number; dy: number }> = {
  study: { fx: -0.36, dy: -4 },
  desk: { fx: -0.12, dy: -8 },
  works: { fx: 0.14, dy: -4 },
  gate: { fx: 0.42, dy: 6 },
  porch: { fx: 0, dy: 24 },
  bench: { fx: -0.3, dy: 16 },
};

/** Where the i-th villager at a station stands: a small diagonal cluster, then the fringe. */
export function stationSpot(plot: Plot, station: Station, index: number): { x: number; y: number } {
  const l = LAYOUT[station];
  const cluster = [
    [0, 0],
    [20, -10],
    [-20, 10],
    [38, 4],
    [-38, -4],
    [10, 16],
  ];
  const [dx, dy] = cluster[index % cluster.length]!;
  const ring = Math.floor(index / cluster.length) * 12;
  const half = plot.w / 2 - 14;
  const x = Math.max(plot.x - half, Math.min(plot.x + half, plot.x + l.fx * plot.w + dx + ring));
  return { x, y: plot.y + l.dy + dy };
}

/** Plot width for a location: up to `max`, but clear of neighbours on about the same row. */
export function plotWidth(at: { x: number; y: number }, others: Array<{ x: number; y: number }>, max = 320, min = 150): number {
  let w = max;
  for (const o of others) {
    if (o === at || Math.abs(o.y - at.y) > 140) continue;
    const gap = Math.abs(o.x - at.x);
    if (gap > 0) w = Math.min(w, gap - 30);
  }
  return Math.max(min, w);
}

/** Index of each session at its station, ordered by start time (stable). */
export function stationIndexes(items: Array<{ id: string; station: Station; startedAt: number }>): Map<string, number> {
  const out = new Map<string, number>();
  const by = new Map<Station, typeof items>();
  for (const it of items) by.set(it.station, [...(by.get(it.station) ?? []), it]);
  for (const list of by.values()) list.sort((a, b) => a.startedAt - b.startedAt || a.id.localeCompare(b.id)).forEach((it, i) => out.set(it.id, i));
  return out;
}

/** One accent colour per project (fence posts, sashes, companions), never a status colour. */
export const PROJECT_ACCENTS = ["#7aa2f7", "#bb9af7", "#e0af68", "#2ac3de", "#ff9e64", "#9ece6a", "#f7768e", "#c0a36e"];
export function projectAccent(projectId: string): string {
  return PROJECT_ACCENTS[hashString(projectId) % PROJECT_ACCENTS.length]!;
}

/**
 * Keeps each project in the slot it first got while it stays around (and for
 * a grace period after its last session ends), so places don't reshuffle.
 * Slots are numbered 0..n-1; `preferred` gives a project's first choice.
 */
export class PlaceKeeper {
  private slotOf = new Map<string, number>();
  private goneAt = new Map<string, number>();

  constructor(private readonly graceMs = 2 * 60_000) {}

  /** Every project holding a slot (present, or gone within the grace period), by slot. */
  held(): Array<{ id: string; slot: number }> {
    return [...this.slotOf.entries()].map(([id, slot]) => ({ id, slot })).sort((a, b) => a.slot - b.slot);
  }

  assign(projectIds: string[], slots: number, now: number, preferred: (id: string) => number = (id) => hashString(id) % Math.max(1, slots)): Map<string, number | null> {
    const present = new Set(projectIds);
    for (const id of this.slotOf.keys()) {
      if (present.has(id)) this.goneAt.delete(id);
      else if (!this.goneAt.has(id)) this.goneAt.set(id, now);
    }
    for (const [id, at] of this.goneAt) {
      if (now - at > this.graceMs) {
        this.slotOf.delete(id);
        this.goneAt.delete(id);
      }
    }
    const taken = new Set(this.slotOf.values());
    const out = new Map<string, number | null>();
    for (const id of [...projectIds].sort()) {
      let slot = this.slotOf.get(id);
      if (slot === undefined && slots > 0) {
        let idx = preferred(id) % slots;
        for (let tries = 0; tries < slots && taken.has(idx); tries++) idx = (idx + 1) % slots;
        if (!taken.has(idx)) {
          slot = idx;
          this.slotOf.set(id, idx);
          taken.add(idx);
        }
      }
      out.set(id, slot ?? null);
    }
    return out;
  }
}
