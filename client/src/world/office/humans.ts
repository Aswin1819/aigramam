/**
 * People for the Office world: realistic proportions built from rounded
 * primitives (no model files), with real joints (neck, shoulders, elbows,
 * hips, knees) so poses read as human. A person is about 5.2 units tall next
 * to a desk top at 2 units (roughly 1.75 m beside a 0.7 m desk), faces +z, and
 * stands on y = 0 of their group.
 *
 * `lookOf` (pure, tested) picks how someone looks from a seed, so a session
 * always looks the same; `buildHuman` makes the meshes; `poseHuman` sets the
 * joints for what they are doing at time t (seconds, real elapsed time).
 */
import * as THREE from "three";
import { hash, mixHex } from "./threeKit";

export type Outfit = "shirt" | "kurta" | "blazer" | "mundu" | "skirt";
export type Hair = "short" | "side" | "long" | "bun" | "curly" | "bald";

export interface Look {
  skin: string;
  hair: Hair;
  hairColor: string;
  beard: boolean;
  glasses: boolean;
  outfit: Outfit;
  top: string;
  bottom: string;
  shoes: string;
  /** Slight differences in build, so a room isn't a row of copies. */
  height: number;
  width: number;
}

const SKINS = ["#f1c9a5", "#e0ac8a", "#c68a5e", "#a86f4c", "#8d5a3b", "#6e4630", "#4e3122"];
const HAIR_COLORS = ["#1b1411", "#2b1d16", "#3a2a20", "#5a3b24", "#7a5634", "#8c8c8c"];
const HAIRS: Hair[] = ["short", "side", "long", "bun", "curly", "bald"];
const OUTFITS: Outfit[] = ["shirt", "kurta", "blazer", "mundu", "skirt", "shirt"];
const TROUSERS = ["#2b2f3a", "#3a3f4b", "#334a6b", "#5b4a3a", "#2f3a33"];
const SHOES = ["#1d1b1a", "#4a3324", "#2a2a2e", "#6b4a2a"];

/** How someone looks, from a seed (a session or subagent id) and their project colour. */
export function lookOf(seed: string, accent: string, helper = false): Look {
  const h = hash(seed);
  const pick = <T,>(list: readonly T[], shift: number) => list[(h >>> shift) % list.length]!;
  const outfit = pick(OUTFITS, 7);
  const hair = pick(HAIRS, 11);
  // Tops wear the project's colour, a little varied per person; helpers wear a lighter tint.
  const top = helper ? mixHex(accent, "#ffffff", 0.55) : mixHex(accent, (h >>> 17) % 2 ? "#ffffff" : "#20232a", 0.12 + ((h >>> 19) % 3) * 0.06);
  return {
    skin: pick(SKINS, 0),
    hair,
    hairColor: pick(HAIR_COLORS, 4),
    beard: hair === "bald" || (h >>> 23) % 5 === 0,
    glasses: (h >>> 25) % 4 === 0,
    outfit,
    top,
    bottom: outfit === "mundu" ? "#f4efe3" : outfit === "skirt" ? mixHex(accent, "#1d1e22", 0.55) : pick(TROUSERS, 13),
    shoes: pick(SHOES, 15),
    height: 0.95 + ((h >>> 9) % 9) / 80, // 0.95 – 1.05
    width: 0.94 + ((h >>> 21) % 7) / 60, // 0.94 – 1.04
  };
}

export type Pose = "stand" | "sit" | "type" | "read" | "console" | "lookUp" | "raiseHand" | "lounge" | "think" | "error";

export interface HumanRig {
  root: THREE.Group;
  hips: THREE.Group;
  spine: THREE.Group;
  neck: THREE.Group;
  shoulderL: THREE.Group;
  shoulderR: THREE.Group;
  elbowL: THREE.Group;
  elbowR: THREE.Group;
  hipL: THREE.Group;
  hipR: THREE.Group;
  kneeL: THREE.Group;
  kneeR: THREE.Group;
  /** A mundu or long skirt (hidden while sitting, when the legs show its colour instead). */
  wrap: THREE.Object3D | null;
  /** Hand-held props, shown by pose. */
  book: THREE.Object3D;
  mug: THREE.Object3D;
  /** Height of the top of the head when standing (for lamps and tags). */
  headTop: number;
  look: Look;
}

/** Geometry shared by everyone (built once per scene). */
export function humanGeometry() {
  return {
    torso: new THREE.CapsuleGeometry(0.62, 1.15, 6, 16),
    pelvis: new THREE.CapsuleGeometry(0.58, 0.25, 4, 14),
    neck: new THREE.CylinderGeometry(0.2, 0.23, 0.35, 10),
    head: new THREE.SphereGeometry(0.52, 24, 18),
    ear: new THREE.SphereGeometry(0.11, 8, 6),
    nose: new THREE.ConeGeometry(0.075, 0.2, 8),
    eye: new THREE.SphereGeometry(0.06, 8, 6),
    brow: new THREE.BoxGeometry(0.17, 0.035, 0.04),
    upperArm: new THREE.CapsuleGeometry(0.17, 0.62, 4, 10),
    foreArm: new THREE.CapsuleGeometry(0.15, 0.58, 4, 10),
    hand: new THREE.SphereGeometry(0.16, 10, 8),
    thigh: new THREE.CapsuleGeometry(0.24, 0.75, 4, 12),
    shin: new THREE.CapsuleGeometry(0.19, 0.78, 4, 10),
    shoe: new THREE.BoxGeometry(0.34, 0.2, 0.6),
    hairCap: new THREE.SphereGeometry(0.56, 24, 14, 0, Math.PI * 2, 0, Math.PI * 0.55),
    hairBack: new THREE.CapsuleGeometry(0.42, 0.7, 4, 12),
    bun: new THREE.SphereGeometry(0.24, 12, 10),
    curl: new THREE.SphereGeometry(0.17, 8, 6),
    beard: new THREE.SphereGeometry(0.42, 16, 10, 0, Math.PI * 2, Math.PI * 0.55, Math.PI * 0.45),
    lens: new THREE.TorusGeometry(0.11, 0.022, 6, 16),
    bridge: new THREE.BoxGeometry(0.1, 0.02, 0.02),
    skirt: new THREE.CylinderGeometry(0.55, 0.75, 1.85, 18, 1, true),
    border: new THREE.CylinderGeometry(0.755, 0.755, 0.12, 18, 1, true),
    lapel: new THREE.BoxGeometry(0.5, 1.1, 0.1),
    collar: new THREE.TorusGeometry(0.26, 0.06, 6, 14),
    lanyard: new THREE.TorusGeometry(0.33, 0.025, 4, 16, Math.PI),
    badge: new THREE.BoxGeometry(0.28, 0.36, 0.04),
    book: new THREE.BoxGeometry(0.75, 0.08, 0.55),
    page: new THREE.BoxGeometry(0.68, 0.02, 0.48),
    mug: new THREE.CylinderGeometry(0.15, 0.13, 0.3, 12),
  };
}
export type HumanGeometry = ReturnType<typeof humanGeometry>;

type MatFn = (color: string, roughness?: number) => THREE.Material;

/** A pivot group at a joint, holding a mesh hanging below it (offset along -y by `drop`). */
function limb(parent: THREE.Object3D, geo: THREE.BufferGeometry, mat: THREE.Material, at: [number, number, number], drop: number): { joint: THREE.Group; mesh: THREE.Mesh } {
  const joint = new THREE.Group();
  joint.position.set(...at);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.y = -drop;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  joint.add(mesh);
  parent.add(joint);
  return { joint, mesh };
}

function part(parent: THREE.Object3D, geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number, shadow = true): THREE.Mesh {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.castShadow = shadow;
  m.receiveShadow = true;
  parent.add(m);
  return m;
}

/** Build a person facing +z, feet on y = 0. */
export function buildHuman(look: Look, g: HumanGeometry, mat: MatFn, helper = false): HumanRig {
  const root = new THREE.Group();
  const body = new THREE.Group();
  body.scale.set(look.width, look.height, look.width);
  root.add(body);
  const skin = mat(look.skin, 0.7);
  const top = mat(look.top, 0.85);
  const bottom = mat(look.bottom, 0.9);
  const shoes = mat(look.shoes, 0.6);
  const hairMat = mat(look.hairColor, 0.95);
  const dark = mat("#1a1a1a", 0.4);

  // Hips at 2.15 (leg length), then the spine up to the shoulders at ~3.55, head on top.
  const hips = new THREE.Group();
  hips.position.y = 2.15;
  body.add(hips);
  part(hips, g.pelvis, bottom, 0, 0.05, 0);
  const spine = new THREE.Group();
  spine.position.y = 0.2;
  hips.add(spine);
  const torso = part(spine, g.torso, top, 0, 0.75, 0);
  torso.scale.set(1, 1, 0.72);
  if (look.outfit === "kurta") {
    // A kurta reaches mid-thigh.
    const hem = part(spine, g.skirt, top, 0, -0.35, 0);
    hem.scale.set(0.95, 0.42, 0.75);
  }
  if (look.outfit === "blazer") {
    part(spine, g.lapel, mat(mixHex(look.top, "#000000", 0.35)), -0.25, 0.95, 0.42).rotation.z = 0.18;
    part(spine, g.lapel, mat(mixHex(look.top, "#000000", 0.35)), 0.25, 0.95, 0.42).rotation.z = -0.18;
    part(spine, g.lapel, mat("#f2efe8"), 0, 1.05, 0.4).scale.set(0.45, 0.7, 1);
  } else {
    const collar = part(spine, g.collar, mat(mixHex(look.top, "#ffffff", 0.25)), 0, 1.62, 0.02);
    collar.rotation.x = Math.PI / 2;
  }
  if (helper) {
    const lan = part(spine, g.lanyard, mat("#2f6fb0"), 0, 1.55, 0.3);
    lan.rotation.z = Math.PI;
    part(spine, g.badge, mat("#f4f1ea"), 0, 1.0, 0.47);
  }

  const neck = new THREE.Group();
  neck.position.y = 1.65;
  spine.add(neck);
  part(neck, g.neck, skin, 0, 0.12, 0);
  const head = new THREE.Group();
  head.position.y = 0.62;
  neck.add(head);
  const skull = part(head, g.head, skin, 0, 0, 0);
  skull.scale.set(0.92, 1.05, 0.98);
  part(head, g.ear, skin, -0.48, 0, 0);
  part(head, g.ear, skin, 0.48, 0, 0);
  part(head, g.nose, skin, 0, -0.04, 0.52, false).rotation.x = Math.PI / 2;
  for (const sx of [-0.17, 0.17]) {
    part(head, g.eye, dark, sx, 0.08, 0.46, false);
    part(head, g.brow, hairMat, sx, 0.2, 0.47, false);
  }
  if (look.glasses) {
    for (const sx of [-0.17, 0.17]) part(head, g.lens, dark, sx, 0.08, 0.52, false);
    part(head, g.bridge, dark, 0, 0.1, 0.53, false);
  }
  if (look.beard) {
    const b = part(head, g.beard, hairMat, 0, -0.05, 0.06);
    b.scale.set(1.08, 1, 1.1);
  }
  if (look.hair !== "bald") {
    const cap = part(head, g.hairCap, hairMat, 0, 0.05, -0.02);
    cap.rotation.x = -0.25;
    if (look.hair === "side") cap.rotation.z = 0.12;
    if (look.hair === "long") part(head, g.hairBack, hairMat, 0, -0.45, -0.22).scale.set(1, 1, 0.55);
    if (look.hair === "bun") part(head, g.bun, hairMat, 0, 0.45, -0.32);
    if (look.hair === "curly") for (let k = 0; k < 9; k++) {
      const a = (k / 9) * Math.PI * 2;
      part(head, g.curl, hairMat, Math.cos(a) * 0.42, 0.28 + (k % 2) * 0.08, Math.sin(a) * 0.36 - 0.05);
    }
  }

  // Arms from the shoulders: upper arm, elbow, forearm and hand (hanging straight when all joints are 0).
  const arm = (side: -1 | 1) => {
    const sh = limb(spine, g.upperArm, top, [side * 0.78, 1.45, 0], 0.48);
    const el = limb(sh.joint, g.foreArm, look.outfit === "blazer" ? top : skin, [0, -0.95, 0], 0.42);
    part(el.joint, g.hand, skin, 0, -0.9, 0);
    return { shoulder: sh.joint, elbow: el.joint };
  };
  const L = arm(-1);
  const R = arm(1);

  // Legs from the hips: thigh, knee, shin and shoe.
  const leg = (side: -1 | 1) => {
    const hip = limb(hips, g.thigh, bottom, [side * 0.32, -0.05, 0], 0.55);
    const knee = limb(hip.joint, g.shin, look.outfit === "mundu" ? skin : bottom, [0, -1.08, 0], 0.5);
    part(knee.joint, g.shoe, shoes, 0, -1.0, 0.12);
    return { hip: hip.joint, knee: knee.joint };
  };
  const LL = leg(-1);
  const RL = leg(1);
  let wrap: THREE.Group | null = null;
  if (look.outfit === "mundu" || look.outfit === "skirt") {
    // A wrap from the waist to the ankles; the mundu has its gold border.
    wrap = new THREE.Group();
    hips.add(wrap);
    part(wrap, g.skirt, bottom, 0, -0.95, 0).scale.set(1, 1, 0.8);
    if (look.outfit === "mundu") part(wrap, g.border, mat("#d4a537", 0.5), 0, -1.82, 0).scale.set(1, 1, 0.8);
  }

  // Props in the right hand (shown by pose).
  const book = new THREE.Group();
  part(book, g.book, mat("#8a3b2e"), 0, 0, 0);
  part(book, g.page, mat("#f4efe3"), 0, 0.05, 0, false);
  book.position.set(-0.75, -0.95, 0.35);
  book.visible = false;
  R.elbow.add(book);
  const mug = part(new THREE.Group(), g.mug, mat("#efe7d6"), 0, 0, 0);
  const mugHolder = mug.parent!;
  mugHolder.position.set(0, -0.95, 0.12);
  mugHolder.visible = false;
  R.elbow.add(mugHolder);

  return {
    root,
    hips,
    spine,
    neck,
    shoulderL: L.shoulder,
    shoulderR: R.shoulder,
    elbowL: L.elbow,
    elbowR: R.elbow,
    hipL: LL.hip,
    hipR: RL.hip,
    kneeL: LL.knee,
    kneeR: RL.knee,
    wrap,
    book,
    mug: mugHolder,
    headTop: 5.2 * look.height,
    look,
  };
}

/** Make every mesh in the person clickable as the given session. */
export function tagHuman(rig: HumanRig, sessionId: string) {
  rig.root.traverse((o) => (o.userData.sessionId = sessionId));
}

const HALF_PI = Math.PI / 2;

/**
 * Set the joints for a pose. `walking` (0 when standing still) is the walk
 * phase in radians; `t` is real time in seconds for small motions; with
 * `still` (reduced motion) the pose holds without moving.
 */
export function poseHuman(rig: HumanRig, pose: Pose, t: number, walking: number | null, still: boolean, phase = 0, thinking = false) {
  const r = rig;
  // Neutral first: standing straight, arms by the side.
  for (const j of [r.hips, r.spine, r.neck, r.shoulderL, r.shoulderR, r.elbowL, r.elbowR, r.hipL, r.hipR, r.kneeL, r.kneeR]) j.rotation.set(0, 0, 0);
  r.hips.position.y = 2.15;
  r.shoulderL.rotation.z = -0.08;
  r.shoulderR.rotation.z = 0.08;
  r.book.visible = pose === "read";
  r.mug.visible = pose === "lounge";
  const wave = (speed: number, amount: number) => (still ? 0 : Math.sin(t * speed + phase) * amount);

  if (walking !== null) {
    // Opposite arm and leg swing; knees bend on the back swing.
    const s = Math.sin(walking);
    r.hipL.rotation.x = s * 0.55;
    r.hipR.rotation.x = -s * 0.55;
    r.kneeL.rotation.x = Math.max(0, -s) * 0.7;
    r.kneeR.rotation.x = Math.max(0, s) * 0.7;
    r.shoulderL.rotation.x = -s * 0.45;
    r.shoulderR.rotation.x = s * 0.45;
    r.elbowL.rotation.x = -0.25;
    r.elbowR.rotation.x = -0.25;
    r.hips.position.y = 2.15 + Math.abs(Math.cos(walking)) * 0.08;
    r.book.visible = false;
    r.mug.visible = false;
    return;
  }

  const sitting = pose === "sit" || pose === "type" || pose === "lounge";
  if (r.wrap) r.wrap.visible = !sitting;
  if (sitting) {
    // Office chair seat at ~1.45, the sofa lower: thighs forward, shins down.
    r.hips.position.y = pose === "lounge" ? 1.15 : 1.4;
    r.hipL.rotation.x = r.hipR.rotation.x = -HALF_PI;
    r.kneeL.rotation.x = r.kneeR.rotation.x = HALF_PI;
  }
  switch (pose) {
    case "type":
      // Leaning in, forearms forward to the keyboard, fingers busy.
      r.spine.rotation.x = 0.12;
      r.shoulderL.rotation.x = r.shoulderR.rotation.x = -0.55;
      r.elbowL.rotation.x = -1.05 + wave(16, 0.12);
      r.elbowR.rotation.x = -1.05 + wave(17.5, 0.12);
      r.neck.rotation.x = 0.1;
      break;
    case "sit":
      r.shoulderL.rotation.x = r.shoulderR.rotation.x = -0.35;
      r.elbowL.rotation.x = r.elbowR.rotation.x = -0.9;
      break;
    case "lounge":
      // Sitting back with a mug, the other hand on the knee.
      r.spine.rotation.x = -0.22;
      r.shoulderR.rotation.x = -0.5;
      r.elbowR.rotation.x = -1.6 + wave(0.8, 0.12);
      r.shoulderL.rotation.x = -0.4;
      r.elbowL.rotation.x = -0.5;
      break;
    case "read":
      // Book held in front, head tilted down.
      r.shoulderR.rotation.x = -0.6;
      r.elbowR.rotation.x = -1.2;
      r.shoulderR.rotation.z = -0.2;
      r.shoulderL.rotation.x = -0.6;
      r.elbowL.rotation.x = -1.2;
      r.shoulderL.rotation.z = 0.25;
      r.neck.rotation.x = 0.35 + wave(0.6, 0.04);
      break;
    case "console":
      // One hand on the console, slight lean, checking the rack.
      r.spine.rotation.x = 0.08;
      r.shoulderR.rotation.x = -0.9;
      r.elbowR.rotation.x = -0.5 + wave(9, 0.1);
      r.neck.rotation.y = wave(0.5, 0.25);
      break;
    case "lookUp":
      r.neck.rotation.x = -0.35;
      r.shoulderL.rotation.x = -0.2;
      r.shoulderR.rotation.x = -0.9;
      r.elbowR.rotation.x = -0.9;
      break;
    case "raiseHand":
      // Arm up high and waving: "I need you".
      r.shoulderR.rotation.x = -Math.PI * 0.95;
      r.shoulderR.rotation.z = 0.25 + wave(6, 0.25);
      r.elbowR.rotation.x = -0.15;
      r.neck.rotation.x = -0.1;
      break;
    case "think":
      // Hand on the chin.
      r.shoulderR.rotation.x = -0.75;
      r.shoulderR.rotation.z = -0.3;
      r.elbowR.rotation.x = -2.2;
      r.neck.rotation.x = -0.12 + wave(0.7, 0.05);
      break;
    case "error":
      r.book.visible = r.mug.visible = false;
      // Both hands on the head.
      r.shoulderL.rotation.x = r.shoulderR.rotation.x = -2.6;
      r.shoulderL.rotation.z = 0.6;
      r.shoulderR.rotation.z = -0.6;
      r.elbowL.rotation.x = r.elbowR.rotation.x = -1.6;
      break;
    case "stand":
      r.shoulderL.rotation.x = wave(0.9, 0.03);
      break;
  }
  if (thinking && pose !== "think" && pose !== "error" && pose !== "raiseHand") {
    // Thinking in any spot: the right hand goes to the chin.
    r.shoulderR.rotation.set(-0.75, 0, -0.3);
    r.elbowR.rotation.x = -2.2;
    r.book.visible = r.mug.visible = false;
  }
}

/** Height of the top of the head above the feet for a pose (sitting is lower). */
export function headHeight(rig: HumanRig, pose: Pose, walking: boolean): number {
  if (walking) return rig.headTop;
  if (pose === "lounge") return rig.headTop - 1.0 * rig.look.height;
  if (pose === "sit" || pose === "type") return rig.headTop - 0.75 * rig.look.height;
  return rig.headTop;
}
