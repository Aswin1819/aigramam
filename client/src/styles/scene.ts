/**
 * The one scene every style prototype draws, so styles can be compared like
 * for like: a Kerala village corner with a tea shop (chaya kada), palms, the
 * backwater with a canoe, a row of brass lamps, and three villagers showing
 * the three session states that matter (working, needs approval, finished).
 *
 * Everything here is pure: `frameAt(t)` says where things are at time t
 * (seconds). Styles only decide how to draw it.
 *
 * Logical canvas: 640 × 360. Styles draw in these units; the host scales.
 */

export const W = 640;
export const H = 360;

/** Fixed layout, in logical units. */
export const LAYOUT = {
  horizonY: 150,
  waterTop: 150,
  waterBottom: 196,
  groundY: 196,
  pathY: 330,
  shop: { x: 70, y: 196, w: 170, h: 74, roofH: 38, doorX: 160 },
  palms: [
    { x: 28, baseY: 250, h: 150, lean: -0.12 },
    { x: 300, baseY: 214, h: 120, lean: 0.1 },
    { x: 616, baseY: 236, h: 140, lean: -0.08 },
  ],
  farPalms: [120, 210, 380, 450, 520],
  lamps: { x0: 446, dx: 22, y: 250, count: 5 },
  sign: { x: 330, y: 226, text: "AI GRAMAM" },
} as const;

export type Status = "working" | "waiting" | "finished";

export const STATUS_COLOR: Record<Status, string> = {
  working: "#5eead4",
  waiting: "#ff5a4f",
  finished: "#a3e635",
};

export interface VillagerFrame {
  id: string;
  name: string;
  status: Status;
  /** Feet position (logical units). */
  x: number;
  y: number;
  facing: 1 | -1;
  moving: boolean;
  /** Walk cycle 0..1 (only meaningful when moving). */
  phase: number;
  /** 0..1 jump height factor (finished villager celebrates). */
  jump: number;
  /** Short action text, e.g. "Editing auth.ts". Every style must show it as text. */
  label: string;
  /** Main shirt colour (the character identity), and mundu (lower cloth) colour. */
  shirt: string;
  mundu: string;
  skin: string;
  carry?: "laptop" | "glass";
}

export interface SceneFrame {
  t: number;
  villagers: VillagerFrame[];
  /** Canoe centre x on the backwater (wraps across the width). */
  canoeX: number;
  /** How many lamps are lit (0..count); the last one may be lighting up. */
  lampsLit: number;
  /** 0..1 pulse for the approval request, ~1.2 Hz. */
  pulse: number;
  /** 0..1 progress of the working villager's task (for progress bars). */
  progress: number;
  /** Cloud / bird drift offset in units. */
  drift: number;
}

const WALK_A = 270;
const WALK_B = 430;
const WALK_SPEED = 46; // units per second

/** Where everything is at time t (seconds). Deterministic. */
export function frameAt(t: number): SceneFrame {
  // Working villager: walks back and forth between the shop and the sign.
  const span = WALK_B - WALK_A;
  const leg = span / WALK_SPEED; // seconds per crossing
  const pauseS = 0.9; // pauses at each end (looks at the laptop)
  const cycle = 2 * (leg + pauseS);
  const c = ((t % cycle) + cycle) % cycle;
  let x: number;
  let facing: 1 | -1;
  let moving = true;
  if (c < leg) { x = WALK_A + c * WALK_SPEED; facing = 1; }
  else if (c < leg + pauseS) { x = WALK_B; facing = 1; moving = false; }
  else if (c < 2 * leg + pauseS) { x = WALK_B - (c - leg - pauseS) * WALK_SPEED; facing = -1; }
  else { x = WALK_A; facing = -1; moving = false; }
  const phase = (t * 1.6) % 1;

  // Finished villager: hops twice, then rests.
  const hop = t % 2.4;
  const jump = hop < 0.9 ? Math.abs(Math.sin((hop / 0.9) * Math.PI * 2)) : 0;

  // Lamps light one by one, then all stay lit for a while, then repeat.
  const lampCycle = t % 10;
  const lampsLit = Math.min(LAYOUT.lamps.count, lampCycle / 1.1);

  return {
    t,
    villagers: [
      { id: "a", name: "Kuttan", status: "working", x, y: LAYOUT.pathY, facing, moving, phase, jump: 0, label: "Editing auth.ts", shirt: "#f4efe2", mundu: "#f4efe2", skin: "#8a5a3c", carry: "laptop" },
      { id: "b", name: "Ammini", status: "waiting", x: LAYOUT.shop.doorX + 50, y: 296, facing: 1, moving: false, phase: 0, jump: 0, label: "Needs approval · git push", shirt: "#c2410c", mundu: "#fde68a", skin: "#a0694a", carry: "glass" },
      { id: "c", name: "Raghu", status: "finished", x: 566, y: 312, facing: -1, moving: false, phase: 0, jump, label: "Done ✓ tests pass", shirt: "#1d4ed8", mundu: "#f4efe2", skin: "#6b4430" },
    ],
    canoeX: ((t * 14) % (W + 160)) - 80,
    lampsLit,
    pulse: 0.5 + 0.5 * Math.sin(t * Math.PI * 2 * 1.2),
    progress: (t % 12) / 12,
    drift: t * 6,
  };
}

// ── pose helpers ─────────────────────────────────────────────────────────────

export interface Pose {
  /** Leg swing angles (radians, 0 = straight down), front and back. */
  legF: number;
  legB: number;
  /** Knee bend for each leg (radians, ≥ 0). */
  kneeF: number;
  kneeB: number;
  /** Arm swing angles (radians). */
  armF: number;
  armB: number;
  /** Vertical body bob in units (negative = up). */
  bob: number;
}

/** A simple, readable walk cycle; standing pose when not moving. */
export function poseOf(v: VillagerFrame): Pose {
  if (!v.moving) return { legF: 0.04, legB: -0.04, kneeF: 0, kneeB: 0, armF: 0.05, armB: -0.05, bob: -v.jump * 26 };
  const a = v.phase * Math.PI * 2;
  const s = Math.sin(a);
  return {
    legF: s * 0.45,
    legB: -s * 0.45,
    kneeF: Math.max(0, -Math.cos(a)) * 0.5,
    kneeB: Math.max(0, Math.cos(a)) * 0.5,
    armF: -s * 0.35,
    armB: s * 0.35,
    bob: -Math.abs(Math.cos(a)) * 2.4,
  };
}

/** Standard body proportions (units) for a villager ~72 units tall. */
export const BODY = { height: 72, head: 10, torso: 23, thigh: 13, shin: 13, upperArm: 11, forearm: 11 } as const;

/** Where a villager's label should sit: just above the head, following jumps. */
export function labelAnchor(v: VillagerFrame) {
  return { x: v.x, y: v.y - BODY.height - 12 - v.jump * 26 };
}

/** Joint positions for a villager in logical units, from its pose. */
export function skeleton(v: VillagerFrame) {
  const p = poseOf(v);
  const f = v.facing;
  const hipY = v.y - BODY.thigh - BODY.shin + p.bob;
  const hip = { x: v.x, y: hipY };
  const neck = { x: v.x + f * 1.5, y: hipY - BODY.torso };
  const head = { x: neck.x + f * 0.8, y: neck.y - BODY.head + 1 };
  const limb = (o: { x: number; y: number }, ang: number, len: number) => ({ x: o.x + Math.sin(ang) * len * f, y: o.y + Math.cos(ang) * len });
  const kneeF = limb(hip, p.legF, BODY.thigh);
  const kneeB = limb(hip, p.legB, BODY.thigh);
  const footF = limb(kneeF, p.legF - p.kneeF, BODY.shin);
  const footB = limb(kneeB, p.legB - p.kneeB, BODY.shin);
  const shoulder = { x: neck.x, y: neck.y + 3 };
  const carrying = !!v.carry;
  const elbowF = limb(shoulder, carrying ? 0.3 : p.armF, BODY.upperArm);
  const elbowB = limb(shoulder, p.armB, BODY.upperArm);
  const handF = carrying ? { x: elbowF.x + f * BODY.forearm, y: elbowF.y - 2 } : limb(elbowF, p.armF * 0.6, BODY.forearm);
  const handB = limb(elbowB, p.armB * 0.6, BODY.forearm);
  return { p, hip, neck, head, kneeF, kneeB, footF, footB, shoulder, elbowF, elbowB, handF, handB };
}

// ── small utilities styles share ─────────────────────────────────────────────

/** Deterministic hash noise in [0,1). */
export function hash(n: number): number {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
}

/**
 * "Line boil": a small offset that changes `fps` times a second, the
 * hand-drawn wobble of chalk and sketch animation. Same seed + time → same value.
 */
export function boil(seed: number, t: number, amp = 0.8, fps = 8): number {
  const k = Math.floor(t * fps);
  return (hash(seed * 13.7 + k * 7.31) - 0.5) * 2 * amp;
}

/** Quantise time to a frame rate, for choppy "on twos" styles. */
export const stepTime = (t: number, fps: number) => Math.floor(t * fps) / fps;

/** Seeded RNG for scatter (stars, grain, studs). */
export function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13; s ^= s >>> 17; s ^= s << 5;
    return ((s >>> 0) % 100000) / 100000;
  };
}
