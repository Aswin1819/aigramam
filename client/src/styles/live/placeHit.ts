/**
 * Hit-testing places (project buildings) for click-to-open-project. Pure, no
 * DOM: used by the art-style view (StyledWorldView) and the Phaser world.
 */
import type { LivePlace } from "./types";

/** An axis-aligned box in world units, owned by a project id. */
export interface PlaceRect {
  id: string;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** Roofs overhang the walls a little in most styles; this keeps the eaves clickable. */
const EAVES = 10;

/** A style place's building as a box: walls plus roof (and the eaves), down to just below the base. */
export function buildingRect(place: Pick<LivePlace, "id" | "building">): PlaceRect {
  const b = place.building;
  return { id: place.id, x0: b.x - EAVES, x1: b.x + b.w + EAVES, y0: b.baseY - b.wallH - b.roofH - 4, y1: b.baseY + 6 };
}

/**
 * The place under (x, y), or null. When boxes overlap, the one whose centre is
 * nearest the point wins (ties go to the later box, which draws on top).
 */
export function pickPlace(x: number, y: number, rects: readonly PlaceRect[]): string | null {
  let best: string | null = null;
  let bestD = Infinity;
  for (const r of rects) {
    if (x < r.x0 || x > r.x1 || y < r.y0 || y > r.y1) continue;
    const d = Math.hypot(x - (r.x0 + r.x1) / 2, y - (r.y0 + r.y1) / 2);
    if (d <= bestD) {
      bestD = d;
      best = r.id;
    }
  }
  return best;
}
