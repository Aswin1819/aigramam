/**
 * Where things go on the 3D Map, in world units on the ground plane (x, z).
 * The village square sits at the origin; each project gets a raised pod on a
 * ring around it, with one desk per villager in a grid. Pure, so it is tested
 * without WebGL; scene.ts only turns this into meshes.
 */
import type { SessionView } from "@shared/model";
import type { ProjectSummary } from "../attention";
import { plainStatus, type Tone } from "../focus";
import { distinctAccents } from "../villageMap";

/** Spacing between desk centres inside a pod (x across, z deep). */
export const DESK_PITCH = { x: 6.6, z: 6.2 } as const;
/** Margin between the outer desks and the pod's edge. */
const POD_MARGIN = { x: 3.2, z: 4.2 } as const;
/** Smallest pod, so a project with one villager still reads as a place. */
const POD_MIN = { w: 15, d: 15 } as const;
/** Radius of the village square in the middle. */
export const SQUARE_R = 8;
/** Gap kept between neighbouring pods, and between a pod and the square. */
const GAP = 15;
/** Most villagers drawn per pod (the card counts the rest). */
export const MAX_DESKS_3D = 12;
/** Most pods on the map (the board and Projects page list the rest). */
export const MAX_PODS = 12;

export interface Desk3D {
  session: SessionView;
  tone: Tone;
  /** Desk centre on the ground, in world units. */
  x: number;
  z: number;
}

export interface Pod3D {
  summary: ProjectSummary;
  accent: string;
  /** Centre of the pod. */
  x: number;
  z: number;
  /** Footprint: width along x, depth along z. */
  w: number;
  d: number;
  desks: Desk3D[];
  /** Villagers not drawn because the pod is full. */
  hidden: number;
  counts: Record<Tone, number>;
  /** How the wire from the square looks. */
  wire: "urgent" | "work" | "quiet";
}

export interface Layout3D {
  pods: Pod3D[];
  /** Projects not on the map. */
  more: number;
  /** Half the size of the area used, for fitting the camera. */
  extent: number;
}

/** Desk grid for `count` desks: as square as possible, at most 4 across. */
export function deskGrid(count: number): { cols: number; rows: number } {
  if (count <= 0) return { cols: 1, rows: 1 };
  const cols = Math.min(4, Math.ceil(Math.sqrt(count)));
  return { cols, rows: Math.ceil(count / cols) };
}

export function podSize(count: number): { w: number; d: number } {
  const { cols, rows } = deskGrid(count);
  return {
    w: Math.max(POD_MIN.w, cols * DESK_PITCH.x + 2 * POD_MARGIN.x),
    d: Math.max(POD_MIN.d, rows * DESK_PITCH.z + 2 * POD_MARGIN.z),
  };
}

function toneCounts(sessions: SessionView[], now: number): Record<Tone, number> {
  const c: Record<Tone, number> = { urgent: 0, turn: 0, work: 0, quiet: 0, error: 0, rest: 0 };
  for (const s of sessions) c[plainStatus(s, now).tone]++;
  return c;
}

/**
 * The ring radius that keeps neighbouring pods (and the square) apart: each
 * pod is treated as a circle around its footprint, and the ring is grown
 * until consecutive circles on it don't touch.
 */
function ringRadius(radii: number[]): number {
  const n = radii.length;
  const biggest = Math.max(...radii);
  let r = SQUARE_R + GAP + biggest;
  if (n < 2) return r;
  const step = (2 * Math.PI) / n;
  for (let i = 0; i < n; i++) {
    const need = radii[i]! + radii[(i + 1) % n]! + GAP;
    // Chord between neighbours on the ring: 2 r sin(step / 2).
    r = Math.max(r, need / (2 * Math.sin(step / 2)));
  }
  return r;
}

/** Layout for the projects (already in display order) at time `now`. */
export function layout3d(summaries: ProjectSummary[], now: number): Layout3D {
  const shown = summaries.slice(0, MAX_PODS);
  const accents = distinctAccents(shown.map((s) => s.project.id));
  const sizes = shown.map((s) => podSize(Math.min(MAX_DESKS_3D, s.sessions.length)));
  const radii = sizes.map((s) => Math.hypot(s.w, s.d) / 2);
  const ring = ringRadius(radii);
  const pods = shown.map((summary, i): Pod3D => {
    // First pod at the back (far from the camera), then clockwise as seen on screen.
    const angle = -Math.PI * 0.75 + (i * 2 * Math.PI) / Math.max(1, shown.length);
    const x = shown.length === 1 ? ring : ring * Math.cos(angle);
    const z = shown.length === 1 ? 0 : ring * Math.sin(angle);
    const { w, d } = sizes[i]!;
    const drawn = summary.sessions.slice(0, MAX_DESKS_3D);
    const { cols } = deskGrid(drawn.length);
    const desks = drawn.map((session, j): Desk3D => {
      const c = j % cols;
      const r = Math.floor(j / cols);
      const rows = Math.ceil(drawn.length / cols);
      return {
        session,
        tone: plainStatus(session, now).tone,
        x: x + (c - (cols - 1) / 2) * DESK_PITCH.x,
        z: z + (r - (rows - 1) / 2) * DESK_PITCH.z,
      };
    });
    const counts = toneCounts(summary.sessions, now);
    return {
      summary,
      accent: accents[i]!,
      x,
      z,
      w,
      d,
      desks,
      hidden: summary.sessions.length - drawn.length,
      counts,
      wire: counts.urgent > 0 ? "urgent" : counts.work > 0 ? "work" : "quiet",
    };
  });
  const extent = pods.reduce((m, p) => Math.max(m, Math.abs(p.x) + p.w / 2, Math.abs(p.z) + p.d / 2), SQUARE_R + 4);
  return { pods, more: Math.max(0, summaries.length - shown.length), extent };
}
