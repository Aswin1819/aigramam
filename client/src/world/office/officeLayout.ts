/**
 * The Office world's floor plan, in world units on the ground (x, z; the
 * camera looks from +x +z). The lobby sits at the origin; each project gets
 * an office room on a ring around it. Inside every room the same areas map
 * the village stations to office furniture:
 *
 *   back wall:  library (study) · web window (gate) · server rack (works)
 *   middle:     one desk per session (desk)
 *   front:      lounge with sofa and coffee (bench) · front counter with a bell (porch)
 *
 * Pure: the scene turns this into meshes, and where each employee stands
 * comes from `spotFor` and the station the StationKeeper settled on.
 */
import type { ProjectView, SessionView, SubagentView } from "@shared/model";
import { PROJECT_ACCENTS, projectAccent, type Station } from "@shared/stations";

export const LOBBY_R = 9;
export const DESK_PITCH = { x: 6.6, z: 6.4 } as const;
/** Back strip (library, window, servers) and front strip (lounge, counter), in depth. */
const BACK_D = 8;
const FRONT_D = 9;
const SIDE_MARGIN = 4;
const ROOM_MIN_W = 30;
/** Gap between neighbouring rooms, and between a room and the lobby. */
const GAP = 12;
export const MAX_ROOMS = 10;
export const MAX_DESKS = 12;

export interface Desk {
  sessionId: string;
  /** Desk centre (world). The chair and the seated employee are on its +z side. */
  x: number;
  z: number;
}

export interface Room {
  project: ProjectView;
  accent: string;
  /** Centre of the floor. */
  x: number;
  z: number;
  w: number;
  d: number;
  desks: Desk[];
  /** Sessions in this project that have no desk drawn (room full). */
  hidden: number;
  /** Where each area's furniture stands (world), and where people using it stand. */
  areas: Record<Exclude<Station, "desk">, { x: number; z: number }>;
}

export interface OfficeLayout {
  rooms: Room[];
  /** Projects not drawn. */
  more: number;
  /** Half the size of the used area, for fitting the camera. */
  extent: number;
}

/**
 * Accent colours for the rooms, in order: each keeps its usual project colour
 * unless an earlier room already took it, so neighbours never look alike.
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
    return projectAccent(id);
  });
}

export function deskGrid(count: number): { cols: number; rows: number } {
  if (count <= 0) return { cols: 1, rows: 1 };
  const cols = Math.min(4, Math.ceil(Math.sqrt(count)));
  return { cols, rows: Math.ceil(count / cols) };
}

export function roomSize(desks: number): { w: number; d: number } {
  const { cols, rows } = deskGrid(desks);
  return { w: Math.max(ROOM_MIN_W, cols * DESK_PITCH.x + 2 * SIDE_MARGIN), d: BACK_D + rows * DESK_PITCH.z + FRONT_D };
}

/** Ring radius at which neighbouring rooms (as circles around their floors) and the lobby don't touch. */
function ringRadius(radii: number[]): number {
  const n = radii.length;
  let r = LOBBY_R + GAP + Math.max(0, ...radii);
  if (n < 2) return r;
  const step = (2 * Math.PI) / n;
  for (let i = 0; i < n; i++) r = Math.max(r, (radii[i]! + radii[(i + 1) % n]! + GAP) / (2 * Math.sin(step / 2)));
  return r;
}

/** Projects with at least one session, in the order given, as rooms around the lobby. */
export function officeLayout(projects: Array<{ project: ProjectView; sessions: SessionView[] }>): OfficeLayout {
  const shown = projects.filter((p) => p.sessions.length > 0).slice(0, MAX_ROOMS);
  const accents = distinctAccents(shown.map((p) => p.project.id));
  const sizes = shown.map((p) => roomSize(Math.min(MAX_DESKS, p.sessions.length)));
  const ring = ringRadius(sizes.map((s) => Math.hypot(s.w, s.d) / 2));
  const rooms = shown.map(({ project, sessions }, i): Room => {
    const angle = -Math.PI * 0.75 + (i * 2 * Math.PI) / Math.max(1, shown.length);
    const x = shown.length === 1 ? ring : ring * Math.cos(angle);
    const z = shown.length === 1 ? 0 : ring * Math.sin(angle);
    const { w, d } = sizes[i]!;
    const drawn = sessions.slice(0, MAX_DESKS);
    const { cols } = deskGrid(drawn.length);
    const deskTop = z - d / 2 + BACK_D + DESK_PITCH.z / 2;
    const desks = drawn.map((s, j): Desk => ({
      sessionId: s.id,
      x: x + ((j % cols) - (cols - 1) / 2) * DESK_PITCH.x,
      z: deskTop + Math.floor(j / cols) * DESK_PITCH.z,
    }));
    const back = z - d / 2 + 3;
    const front = z + d / 2 - 4;
    return {
      project,
      accent: accents[i]!,
      x,
      z,
      w,
      d,
      desks,
      hidden: sessions.length - drawn.length,
      areas: {
        study: { x: x - w / 2 + 5, z: back },
        gate: { x, z: back },
        works: { x: x + w / 2 - 5, z: back },
        bench: { x: x - w / 2 + 6, z: front },
        porch: { x: x + w / 2 - 6, z: front },
      },
    };
  });
  const extent = rooms.reduce((m, r) => Math.max(m, Math.abs(r.x) + r.w / 2, Math.abs(r.z) + r.d / 2), LOBBY_R + 4);
  return { rooms, more: Math.max(0, projects.filter((p) => p.sessions.length > 0).length - shown.length), extent };
}

/** Where an employee stands or sits for a station: their own chair at their desk, or a spot in that area (side by side). */
export function spotFor(room: Room, sessionId: string, station: Station, indexInArea: number): { x: number; z: number; seated: boolean } {
  if (station === "desk") {
    const desk = room.desks.find((d) => d.sessionId === sessionId);
    if (desk) return { x: desk.x, z: desk.z + 2.1, seated: true };
  }
  const area = station === "desk" ? room.areas.gate : room.areas[station];
  // People in the same area stand in a short row facing the furniture, alternating left and right.
  const k = Math.ceil(indexInArea / 2) * (indexInArea % 2 === 0 ? 1 : -1);
  const seated = station === "bench";
  return { x: area.x + k * 2.2, z: area.z + (station === "bench" || station === "porch" ? -1.2 : 2.4), seated };
}

/** Running helpers (subagents) of a session: they stand beside their parent's desk while they work. */
export function runningHelpers(s: SessionView): SubagentView[] {
  return s.subagents.filter((a) => a.status === "working" || a.status === "waiting");
}
