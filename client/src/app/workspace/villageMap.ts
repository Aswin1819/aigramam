/**
 * Layout for Workspace → Map: the village seen from above at an angle.
 * Each project is a raised yard (an isometric tile) placed on a ring around
 * the village square, its villagers sit at desks on it, and a card with the
 * project's figures floats beside it. Pure: world coordinates in px only;
 * the page scales them to fit.
 */
import type { SessionView } from "@shared/model";
import { PROJECT_ACCENTS, projectAccent } from "@shared/stations";
import type { ProjectSummary } from "./attention";
import { plainStatus, type Tone } from "./focus";

export const MAP_W = 1600;
export const MAP_H = 1000;
export const HUB = { x: MAP_W / 2, y: MAP_H / 2, r: 84 } as const;
/** The ring the yards sit on (an ellipse, because the ground is seen at an angle). */
const RING = { rx: 410, ry: 230 };
/** Most yards drawn on the map; the rest are counted in a note. */
export const MAX_YARDS = 10;
/** Most desks drawn per yard; the rest are counted on the card. */
export const MAX_DESKS = 9;
/** Size of the floating card, used for placement (the card itself is laid out by CSS). */
export const CARD = { w: 200, h: 124, gap: 14 } as const;

export interface Desk {
  session: SessionView;
  tone: Tone;
  /** Where the villager sits, in world px (the bottom centre of the figure). */
  x: number;
  y: number;
}

export interface Yard {
  summary: ProjectSummary;
  /** The project's colour: its usual accent, or the next free one when another yard on the map already has it. */
  accent: string;
  /** Centre of the tile's top face. */
  x: number;
  y: number;
  /** Half the tile's width; its half-height is a / 2 (2:1 isometric). */
  a: number;
  /** Seated villagers, back to front (draw in this order). */
  desks: Desk[];
  /** Villagers not drawn because the yard is full. */
  hidden: number;
  /** Top-left corner of the card. */
  card: { x: number; y: number; side: "top" | "left" | "right" | "bottom" };
  /** How the path from the square looks: someone needs the person, work is going on, or quiet. */
  path: "urgent" | "work" | "quiet";
  counts: Record<Tone, number>;
}

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface MapLayout {
  yards: Yard[];
  /** Projects with sessions that didn't fit on the map. */
  more: number;
  /** What is drawn (square, yards, villagers, cards), with a margin: the view fits this, not the whole map. */
  bounds: Box;
}

/** The area everything drawn covers, plus a margin. */
export function boundsOf(yards: Yard[], margin = 28): Box {
  // The square with its tree and name.
  let x0 = HUB.x - HUB.r - 40;
  let x1 = HUB.x + HUB.r + 40;
  let y0 = HUB.y - 130;
  let y1 = HUB.y + HUB.r * 0.5 + 64;
  for (const y of yards) {
    x0 = Math.min(x0, y.x - y.a, y.card.x);
    x1 = Math.max(x1, y.x + y.a, y.card.x + CARD.w);
    // Villagers stand up to ~80 px above their spot; the tile's side hangs below it.
    y0 = Math.min(y0, y.y - y.a / 2 - 40, y.card.y, ...y.desks.map((d) => d.y - 80));
    y1 = Math.max(y1, y.y + y.a / 2 + 24, y.card.y + CARD.h);
  }
  return { x: x0 - margin, y: y0 - margin, w: x1 - x0 + 2 * margin, h: y1 - y0 + 2 * margin };
}

function toneCounts(sessions: SessionView[], now: number): Record<Tone, number> {
  const c: Record<Tone, number> = { urgent: 0, turn: 0, work: 0, quiet: 0, error: 0, rest: 0 };
  for (const s of sessions) c[plainStatus(s, now).tone]++;
  return c;
}

/** Desk spots on a tile: a small grid in the tile's own axes, mapped to the screen. */
export function deskSpots(count: number, a: number): Array<{ dx: number; dy: number }> {
  if (count <= 0) return [];
  const cols = Math.ceil(Math.sqrt(count));
  const rows = Math.ceil(count / cols);
  const spots: Array<{ dx: number; dy: number }> = [];
  for (let i = 0; i < count; i++) {
    const c = i % cols;
    const r = Math.floor(i / cols);
    // u, v in [-0.62, 0.62]: inside the tile with a margin for the desk and figure.
    const u = cols === 1 ? 0 : ((c + 0.5) / cols) * 2 - 1;
    const v = rows === 1 ? 0 : ((r + 0.5) / rows) * 2 - 1;
    const k = 0.62;
    spots.push({ dx: (u - v) * k * a * 0.5, dy: (u + v) * k * a * 0.25 + a * 0.12 });
  }
  return spots;
}

/** Card beside the tile, placed so it never covers the paths from the square. */
function cardSpot(x: number, y: number, a: number, angle: number, n: number): Yard["card"] {
  const spot = rawCardSpot(x, y, a, angle, n);
  // Never past the map's edge.
  return { ...spot, x: Math.min(Math.max(spot.x, 8), MAP_W - CARD.w - 8), y: Math.min(Math.max(spot.y, 8), MAP_H - CARD.h - 8) };
}

function rawCardSpot(x: number, y: number, a: number, angle: number, n: number): Yard["card"] {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  // Up to six yards: cards above (below for the yard under the square), which keeps the map narrow and so drawn larger.
  if (n <= 6) {
    if (sin > 0.85) return { x: x - CARD.w / 2, y: y + a / 2 + 14 + CARD.gap, side: "bottom" };
    // Extra room above: villagers at the back of the yard stand taller than the tile.
    return { x: x - CARD.w / 2, y: y - a / 2 - CARD.gap - 22 - CARD.h, side: "top" };
  }
  if (Math.abs(cos) > 0.55) {
    const side = cos > 0 ? "right" : "left";
    const cx = side === "right" ? x + a + CARD.gap : x - a - CARD.gap - CARD.w;
    return { x: cx, y: y - CARD.h / 2, side };
  }
  if (sin < 0) return { x: x - CARD.w / 2, y: y - a / 2 - CARD.gap - CARD.h, side: "top" };
  return { x: x - CARD.w / 2, y: y + a / 2 + 14 + CARD.gap, side: "bottom" };
}

/** Where everything goes, for the given projects (already in display order) at time `now`. */
export function layoutMap(summaries: ProjectSummary[], now: number): MapLayout {
  const shown = summaries.slice(0, MAX_YARDS);
  const n = shown.length;
  // Fewer yards are bigger; many yards shrink so neighbours don't touch.
  const base = n <= 4 ? 128 : n <= 6 ? 112 : 90;
  const accents = distinctAccents(shown.map((s) => s.project.id));
  const yards = shown.map((summary, i): Yard => {
    // Start at the top and go clockwise; a single yard sits to the right of the square.
    const angle = n === 1 ? 0 : -Math.PI / 2 + (i * 2 * Math.PI) / n;
    // One or two yards sit closer to the square so the map doesn't look empty.
    const rx = n <= 2 ? RING.rx * 0.72 : RING.rx;
    const x = HUB.x + rx * Math.cos(angle);
    // Many yards need a taller ring so the side cards don't stack on each other.
    const ry = n > 6 ? RING.ry * 1.26 : RING.ry;
    const y = HUB.y + ry * Math.sin(angle);
    const drawn = summary.sessions.slice(0, MAX_DESKS);
    const a = Math.min(base + 6 * Math.max(0, drawn.length - 2), base * 1.25);
    const spots = deskSpots(drawn.length, a);
    const desks = drawn
      .map((session, j) => ({ session, tone: plainStatus(session, now).tone, x: x + spots[j]!.dx, y: y + spots[j]!.dy }))
      .sort((p, q) => p.y - q.y || p.x - q.x);
    const counts = toneCounts(summary.sessions, now);
    return {
      summary,
      accent: accents[i]!,
      x,
      y,
      a,
      desks,
      hidden: summary.sessions.length - drawn.length,
      card: cardSpot(x, y, a, angle, n),
      path: counts.urgent > 0 ? "urgent" : counts.work > 0 ? "work" : "quiet",
      counts,
    };
  });
  return { yards, more: Math.max(0, summaries.length - shown.length), bounds: boundsOf(yards) };
}

/**
 * Accent colours for the projects on the map, in order. Each keeps its usual
 * colour (the one the village uses) unless an earlier project already took it,
 * so two neighbouring yards never look like one project.
 */
export function distinctAccents(projectIds: string[]): string[] {
  const used = new Set<string>();
  return projectIds.map((id) => {
    const start = PROJECT_ACCENTS.indexOf(projectAccent(id));
    for (let k = 0; k < PROJECT_ACCENTS.length; k++) {
      const c = PROJECT_ACCENTS[(start + k) % PROJECT_ACCENTS.length]!;
      if (!used.has(c)) {
        used.add(c);
        return c;
      }
    }
    return projectAccent(id); // more projects than colours: repeats are unavoidable
  });
}

/** The path from the square's edge to the yard's nearest corner, as an SVG quadratic curve. */
export function pathTo(yard: Pick<Yard, "x" | "y" | "a">): string {
  const dx = yard.x - HUB.x;
  const dy = yard.y - HUB.y;
  const len = Math.hypot(dx, dy) || 1;
  const sx = HUB.x + (dx / len) * HUB.r;
  const sy = HUB.y + (dy / len) * HUB.r * 0.5;
  // Corner of the tile facing the square.
  const corners = [
    { x: yard.x - yard.a, y: yard.y },
    { x: yard.x + yard.a, y: yard.y },
    { x: yard.x, y: yard.y - yard.a / 2 },
    { x: yard.x, y: yard.y + yard.a / 2 },
  ];
  const end = corners.reduce((best, c) => (Math.hypot(c.x - sx, c.y - sy) < Math.hypot(best.x - sx, best.y - sy) ? c : best));
  // Bend a little to the side so paths read as roads, not rays.
  const mx = (sx + end.x) / 2 - (dy / len) * 30;
  const my = (sy + end.y) / 2 + (dx / len) * 18;
  return `M${sx.toFixed(1)},${sy.toFixed(1)} Q${mx.toFixed(1)},${my.toFixed(1)} ${end.x.toFixed(1)},${end.y.toFixed(1)}`;
}

/** The tile's top face and its two visible sides, as SVG points. */
export function tileFaces(yard: Pick<Yard, "x" | "y" | "a">, depth = 16) {
  const { x, y, a } = yard;
  const h = a / 2;
  const pts = (list: Array<[number, number]>) => list.map(([px, py]) => `${px.toFixed(1)},${py.toFixed(1)}`).join(" ");
  return {
    top: pts([[x, y - h], [x + a, y], [x, y + h], [x - a, y]]),
    left: pts([[x - a, y], [x, y + h], [x, y + h + depth], [x - a, y + depth]]),
    right: pts([[x + a, y], [x, y + h], [x, y + h + depth], [x + a, y + depth]]),
  };
}

export type BoardFilter = "all" | "needs" | "turn" | "work" | "rest";

export const BOARD_FILTERS: Array<{ id: BoardFilter; label: string; tones: Tone[] }> = [
  { id: "all", label: "All", tones: ["urgent", "turn", "error", "work", "quiet", "rest"] },
  { id: "needs", label: "Needs you", tones: ["urgent", "error"] },
  { id: "turn", label: "Your turn", tones: ["turn"] },
  { id: "work", label: "Working", tones: ["work", "quiet"] },
  { id: "rest", label: "Resting", tones: ["rest"] },
];

/** Sessions for the board under a filter, most in need of the person first. */
export function boardList(sessions: SessionView[], filter: BoardFilter, now: number): SessionView[] {
  const tones = BOARD_FILTERS.find((f) => f.id === filter)!.tones;
  const rank = (s: SessionView) => tones.indexOf(plainStatus(s, now).tone);
  return sessions
    .filter((s) => rank(s) >= 0)
    .sort((p, q) => rank(p) - rank(q) || p.statusSince - q.statusSince);
}

export function boardCounts(sessions: SessionView[], now: number): Record<BoardFilter, number> {
  const out = {} as Record<BoardFilter, number>;
  for (const f of BOARD_FILTERS) out[f.id] = boardList(sessions, f.id, now).length;
  return out;
}
