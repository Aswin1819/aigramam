/**
 * Where projects and their sessions stand in a world.
 * Projects get a stable location (hash of the project id, then the next free
 * one); when every location is taken, the rest share the overflow area.
 */
import type { WorldDef } from "./world";

export interface Spot {
  x: number;
  y: number;
}

export interface Placement {
  projectId: string;
  /** null = overflow area */
  locationId: string | null;
  locationLabel: string;
  anchor: Spot;
  sign: Spot;
  slots: number;
  spacing: number;
}

export function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function placeProjects(projectIds: string[], def: WorldDef): Map<string, Placement> {
  const out = new Map<string, Placement>();
  const locs = def.locations;
  const taken = new Set<number>();
  const overflow: string[] = [];
  // Sorted so the result doesn't depend on the order projects appeared in.
  for (const pid of [...projectIds].sort()) {
    let idx = hashString(pid) % locs.length;
    let tries = 0;
    while (taken.has(idx) && tries < locs.length) {
      idx = (idx + 1) % locs.length;
      tries++;
    }
    if (taken.has(idx)) {
      overflow.push(pid);
      continue;
    }
    taken.add(idx);
    const l = locs[idx];
    out.set(pid, {
      projectId: pid,
      locationId: l.id,
      locationLabel: l.label,
      anchor: { x: l.x, y: l.y },
      sign: { x: l.x + l.signboard.dx, y: l.y + l.signboard.dy },
      slots: l.slots,
      spacing: l.spacing,
    });
  }
  if (overflow.length) {
    const area = def.overflow?.area ?? { x: def.size.width * 0.3, y: def.size.height * 0.85, w: def.size.width * 0.4, h: def.size.height * 0.1 };
    const label = def.overflow?.label ?? "Camp";
    const cols = Math.max(1, Math.ceil(Math.sqrt(overflow.length * (area.w / Math.max(area.h, 1)))));
    const rows = Math.ceil(overflow.length / cols);
    overflow.forEach((pid, i) => {
      const c = i % cols, r = Math.floor(i / cols);
      const x = area.x + ((c + 0.5) * area.w) / cols;
      const y = area.y + ((r + 0.5) * area.h) / rows;
      out.set(pid, { projectId: pid, locationId: null, locationLabel: label, anchor: { x, y }, sign: { x, y: y - 110 }, slots: 3, spacing: 56 });
    });
  }
  return out;
}

/** Standing spots for `count` sessions around a placement: a centred row, extra rows step back. */
export function standSpots(p: Placement, count: number): Spot[] {
  const spots: Spot[] = [];
  const perRow = Math.max(1, p.slots);
  for (let i = 0; i < count; i++) {
    const row = Math.floor(i / perRow);
    const inRow = Math.min(perRow, count - row * perRow);
    const col = i % perRow;
    const x = p.anchor.x + (col - (inRow - 1) / 2) * p.spacing + (row % 2) * (p.spacing / 2);
    const y = p.anchor.y - row * 34;
    spots.push({ x, y });
  }
  return spots;
}
