/**
 * The 3D Map scene (three.js): an orthographic isometric view of the village
 * square and one raised pod per project, with a desk, monitor, chair and
 * seated villager per session. It draws only; the layout comes from
 * layout3d.ts and every word is in the HTML overlay (Map3DPage.tsx), which
 * this class feeds with screen positions after each frame.
 *
 * Rebuilding is structural only: when just a status changes, the lamp and the
 * monitor of that desk are updated in place.
 */
import * as THREE from "three";
import type { Tone } from "../focus";
import type { Layout3D, Pod3D } from "./layout3d";
import { SQUARE_R } from "./layout3d";

/** View direction (towards the camera), as in classic isometric maps: equal x and z, a bit lower than 45°. */
const VIEW_DIR = new THREE.Vector3(1, 0.92, 1).normalize();
const CAMERA_DISTANCE = 240;
/** Half the visible height in world units at zoom 1. */
const BASE_HALF_H = 42;
const ZOOM_MIN = 0.35;
const ZOOM_MAX = 4;
/** Room kept free when fitting, in pixels: the header and the cards above the pods, and a small edge. */
const FIT_PAD = { top: 110, bottom: 40, x: 170 } as const;

const PLINTH_H = 2.6;
const FLOOR_H = 0.3;
const TOP_Y = PLINTH_H + FLOOR_H;

export const SCENE_COLORS = {
  plinth: "#2c2d2b",
  walkway: "#303230",
  deskTop: "#dcc29a",
  deskLeg: "#2a2b2d",
  monitor: "#1d1e22",
  chair: "#3b3d3a",
  squareFloor: "#3f5a45",
  trunk: "#5a3b1c",
  leaves: "#3f7a4c",
  dark: "#1b1c1a",
} as const;

const TONE_LAMP: Record<Tone, string> = { urgent: "#ff5a4f", turn: "#f5b33d", work: "#5eead4", quiet: "#a3a098", error: "#ff8a80", rest: "#6f6c66" };
const SKIN = ["#8d5a3b", "#a86f4c", "#c68a5e", "#6e4630", "#b97a55"];
const HAIR = ["#1d1512", "#2b1d16", "#3a2a20", "#141110"];

export interface Anchor {
  x: number;
  y: number;
  /** False when behind the camera or far outside the view. */
  visible: boolean;
}

export interface ScreenRect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface FrameAnchors {
  /** Pod id → the point above the pod's back corner where its card hangs, where its wire ends, and its box on screen. */
  pods: Map<string, { card: Anchor; wireEnd: Anchor; rect: ScreenRect }>;
  /** Session id → the point above the villager's head where its name tag goes. */
  desks: Map<string, Anchor>;
  /** Top of the square (wires start here). */
  square: Anchor;
  /** Pixels per world unit at the current zoom (for showing detail only when it's legible). */
  ppu: number;
}

export interface SceneOptions {
  reducedMotion: boolean;
  onFrame: (a: FrameAnchors) => void;
}

/** Mix two #rrggbb colours: t = 0 gives a, 1 gives b. */
export function mixHex(a: string, b: string, t: number): string {
  const pa = parseInt(a.slice(1), 16);
  const pb = parseInt(b.slice(1), 16);
  const ch = (p: number, s: number) => (p >> s) & 255;
  const m = (s: number) => Math.round(ch(pa, s) + (ch(pb, s) - ch(pa, s)) * t);
  return `#${((m(16) << 16) | (m(8) << 8) | m(0)).toString(16).padStart(6, "0")}`;
}

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** A rounded rectangle lying on the ground, extruded upwards by `height`. */
function roundedSlab(w: number, d: number, r: number, height: number): THREE.ExtrudeGeometry {
  const s = new THREE.Shape();
  const x = -w / 2;
  const y = -d / 2;
  r = Math.min(r, w / 2, d / 2);
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y);
  s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + d - r);
  s.quadraticCurveTo(x + w, y + d, x + w - r, y + d);
  s.lineTo(x + r, y + d);
  s.quadraticCurveTo(x, y + d, x, y + d - r);
  s.lineTo(x, y + r);
  s.quadraticCurveTo(x, y, x + r, y);
  const g = new THREE.ExtrudeGeometry(s, { depth: height, bevelEnabled: true, bevelThickness: 0.25, bevelSize: 0.25, bevelSegments: 2, curveSegments: 6 });
  // Shape is in x/y and extrudes along +z: lay it flat so it extrudes upwards.
  g.rotateX(-Math.PI / 2);
  return g;
}

/** A canvas texture with text, for names painted on the floor. */
function textTexture(text: string, color: string, font = "600 64px Georgia, 'Times New Roman', serif"): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  const ctx = c.getContext("2d")!;
  ctx.font = font;
  const w = Math.ceil(ctx.measureText(text).width) + 24;
  c.width = Math.min(2048, w);
  c.height = 96;
  ctx.font = font;
  ctx.fillStyle = color;
  ctx.textBaseline = "middle";
  ctx.fillText(text, 12, 50);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

interface DeskParts {
  lamp: THREE.Mesh<THREE.SphereGeometry, THREE.MeshStandardMaterial>;
  screen: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  screenKey: string;
  tone: Tone;
  head: THREE.Object3D;
  baseY: number;
}

export class VillageScene {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 1000);
  private target = new THREE.Vector3();
  private zoom = 1;
  private size = { w: 1, h: 1 };
  /** Right side covered by the board, so fitting centres the village in what's left. */
  private reserveRight = 0;
  private root = new THREE.Group();
  private sun: THREE.DirectionalLight;
  private desks = new Map<string, DeskParts>();
  private pickables: THREE.Object3D[] = [];
  private structureKey = "";
  private layout: Layout3D | null = null;
  private raf = 0;
  private dirty = true;
  private tween: { from: THREE.Vector3; to: THREE.Vector3; z0: number; z1: number; t0: number; ms: number } | null = null;
  private shared: Record<string, THREE.BufferGeometry> = {};
  private materials = new Map<string, THREE.Material>();
  private disposed = false;

  constructor(canvas: HTMLCanvasElement, private opts: SceneOptions) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.setClearColor(0x000000, 0);

    this.scene.add(new THREE.HemisphereLight(0xdfe4f0, 0x2a2622, 1.25));
    this.sun = new THREE.DirectionalLight(0xffe8cc, 2.2);
    this.sun.position.set(-40, 90, 30);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.04;
    this.sun.shadow.radius = 4;
    this.scene.add(this.sun, this.sun.target);

    // Invisible ground that only shows shadows, so the pods look like they float a little.
    const catcher = new THREE.Mesh(new THREE.PlaneGeometry(2000, 2000), new THREE.ShadowMaterial({ opacity: 0.38 }));
    catcher.rotation.x = -Math.PI / 2;
    catcher.position.y = -0.6;
    catcher.receiveShadow = true;
    this.scene.add(catcher, this.root);

    this.shared = {
      deskTop: new THREE.BoxGeometry(4.4, 0.24, 2.2),
      deskLeg: new THREE.BoxGeometry(0.7, 1.9, 1.9),
      monitor: new THREE.BoxGeometry(2.7, 1.75, 0.14),
      stand: new THREE.BoxGeometry(0.22, 0.6, 0.22),
      screen: new THREE.PlaneGeometry(2.5, 1.55),
      seat: new THREE.BoxGeometry(1.5, 0.22, 1.4),
      back: new THREE.BoxGeometry(1.5, 1.3, 0.2),
      post: new THREE.CylinderGeometry(0.12, 0.12, 1.3, 8),
      foot: new THREE.CylinderGeometry(0.75, 0.75, 0.12, 12),
      body: new THREE.CapsuleGeometry(0.62, 1.05, 4, 12),
      head: new THREE.SphereGeometry(0.58, 18, 14),
      hair: new THREE.SphereGeometry(0.61, 18, 10, 0, Math.PI * 2, 0, Math.PI * 0.55),
      lamp: new THREE.SphereGeometry(0.32, 14, 10),
    };
  }

  private mat(color: string, opts: { emissive?: string; roughness?: number } = {}): THREE.MeshStandardMaterial {
    const key = `${color}|${opts.emissive ?? ""}|${opts.roughness ?? 0.85}`;
    let m = this.materials.get(key) as THREE.MeshStandardMaterial | undefined;
    if (!m) {
      m = new THREE.MeshStandardMaterial({ color, roughness: opts.roughness ?? 0.85, metalness: 0, ...(opts.emissive ? { emissive: opts.emissive, emissiveIntensity: 0.9 } : {}) });
      this.materials.set(key, m);
    }
    return m;
  }

  private mesh(geo: THREE.BufferGeometry, material: THREE.Material, shadows = true): THREE.Mesh {
    const m = new THREE.Mesh(geo, material);
    m.castShadow = shadows;
    m.receiveShadow = true;
    return m;
  }

  setReserveRight(px: number) {
    if (px === this.reserveRight) return;
    this.reserveRight = px;
    this.fit(false);
  }

  setReducedMotion(on: boolean) {
    this.opts.reducedMotion = on;
    this.dirty = true;
  }

  resize(w: number, h: number) {
    this.size = { w: Math.max(1, w), h: Math.max(1, h) };
    this.renderer.setSize(this.size.w, this.size.h, false);
    this.updateCamera();
    this.dirty = true;
  }

  /** Show the layout: rebuild meshes only if pods or desks moved; otherwise update lamps and screens in place. */
  setLayout(layout: Layout3D) {
    this.layout = layout;
    const key = layout.pods.map((p) => `${p.summary.project.id}@${p.x.toFixed(1)},${p.z.toFixed(1)},${p.w},${p.d},${p.accent}:${p.desks.map((d) => d.session.id).join("+")}`).join("|");
    if (key !== this.structureKey) {
      const firstBuild = this.structureKey === "";
      this.structureKey = key;
      this.rebuild(layout);
      this.fit(!firstBuild);
    }
    for (const pod of layout.pods) for (const d of pod.desks) this.updateDesk(d.session.id, d.tone, d.session.title, d.session.action?.label ?? "");
    this.dirty = true;
  }

  private clearRoot() {
    this.root.traverse((o) => {
      const m = o as THREE.Mesh;
      // Shared geometries and cached materials are kept; per-object ones (text, screens, pod slabs) are freed.
      if (m.geometry && !Object.values(this.shared).includes(m.geometry)) m.geometry.dispose();
      const mat = m.material as THREE.Material | undefined;
      if (mat && ![...this.materials.values()].includes(mat)) {
        const map = (mat as THREE.MeshBasicMaterial).map;
        map?.dispose();
        mat.dispose();
      }
    });
    this.root.clear();
    this.desks.clear();
    this.pickables = [];
  }

  private rebuild(layout: Layout3D) {
    this.clearRoot();
    this.buildSquare();
    for (const pod of layout.pods) {
      this.buildWalkway(pod);
      this.buildPod(pod);
    }
    // Shadows cover what is drawn.
    const e = layout.extent + 12;
    const sc = this.sun.shadow.camera;
    sc.left = -e;
    sc.right = e;
    sc.top = e;
    sc.bottom = -e;
    sc.near = 1;
    sc.far = 400;
    sc.updateProjectionMatrix();
  }

  private buildSquare() {
    const base = this.mesh(new THREE.CylinderGeometry(SQUARE_R, SQUARE_R, PLINTH_H, 48), this.mat(SCENE_COLORS.plinth));
    base.position.y = PLINTH_H / 2;
    const floor = this.mesh(new THREE.CylinderGeometry(SQUARE_R - 0.8, SQUARE_R - 0.8, FLOOR_H, 48), this.mat(SCENE_COLORS.squareFloor));
    floor.position.y = PLINTH_H + FLOOR_H / 2;
    this.root.add(base, floor);
    // The banyan: trunk, hanging roots and a wide low-poly canopy.
    const tree = new THREE.Group();
    tree.position.y = TOP_Y;
    const trunk = this.mesh(new THREE.CylinderGeometry(0.7, 1.05, 4.6, 10), this.mat(SCENE_COLORS.trunk));
    trunk.position.y = 2.3;
    tree.add(trunk);
    for (const [dx, dz] of [[-2.4, 0.6], [2.2, -0.4], [0.4, 2.4], [-0.6, -2.3]] as const) {
      const root = this.mesh(new THREE.CylinderGeometry(0.12, 0.16, 3.8, 6), this.mat("#6d4a24"));
      root.position.set(dx, 2.0, dz);
      tree.add(root);
    }
    const leaves = this.mat(SCENE_COLORS.leaves, { roughness: 0.95 });
    for (const [dx, dy, dz, r] of [[0, 5.6, 0, 3.1], [-2.6, 5.0, 0.8, 2.3], [2.5, 5.1, -0.6, 2.4], [0.6, 5.0, 2.6, 2.2], [-0.8, 5.2, -2.5, 2.2], [0.2, 6.9, 0.2, 2.1]] as const) {
      const c = this.mesh(new THREE.IcosahedronGeometry(r, 0), leaves);
      c.position.set(dx, dy, dz);
      tree.add(c);
    }
    this.root.add(tree);
    this.addFloorText("AI GRAMAM", 0, SQUARE_R - 2.2, 7, "#e7e1d2");
  }

  private buildWalkway(pod: Pod3D) {
    const len = Math.hypot(pod.x, pod.z);
    const w = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.5, Math.max(0.1, len - SQUARE_R)), this.mat(SCENE_COLORS.walkway));
    w.receiveShadow = true;
    const mid = (SQUARE_R + len) / 2 / len;
    w.position.set(pod.x * mid, 0.9, pod.z * mid);
    w.rotation.y = Math.atan2(pod.x, pod.z);
    this.root.add(w);
  }

  private buildPod(pod: Pod3D) {
    const plinth = this.mesh(roundedSlab(pod.w, pod.d, 2.2, PLINTH_H - 0.5), this.mat(SCENE_COLORS.plinth));
    plinth.position.set(pod.x, 0.25, pod.z);
    // The project's colour, muted toward the dark floor so lit desks stand out (as in dark mode floor plans).
    const floorColor = mixHex(pod.accent, SCENE_COLORS.dark, 0.38);
    const floor = this.mesh(roundedSlab(pod.w - 1.6, pod.d - 1.6, 1.6, FLOOR_H - 0.2), this.mat(floorColor, { roughness: 0.95 }));
    floor.position.set(pod.x, PLINTH_H + 0.1, pod.z);
    floor.userData.projectId = pod.summary.project.id;
    this.pickables.push(floor);
    this.root.add(plinth, floor);
    this.addFloorText(pod.summary.project.name.toUpperCase(), pod.x, pod.z + pod.d / 2 - 1.9, Math.min(pod.w - 3, 2 + pod.summary.project.name.length * 0.9), mixHex(pod.accent, "#ffffff", 0.35));
    for (const d of pod.desks) this.buildDesk(pod, d.session.id, d.x, d.z, d.tone);
  }

  private addFloorText(text: string, x: number, z: number, width: number, color: string) {
    const tex = textTexture(text, color);
    const aspect = tex.image.width / tex.image.height;
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(width, width / aspect), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }));
    plane.rotation.x = -Math.PI / 2;
    plane.position.set(x, TOP_Y + 0.02, z);
    this.root.add(plane);
  }

  private buildDesk(pod: Pod3D, sessionId: string, x: number, z: number, tone: Tone) {
    const g = new THREE.Group();
    g.position.set(x, TOP_Y, z - 0.6);
    const top = this.mesh(this.shared.deskTop!, this.mat(SCENE_COLORS.deskTop, { roughness: 0.7 }));
    top.position.y = 2.0;
    const legL = this.mesh(this.shared.deskLeg!, this.mat(SCENE_COLORS.deskLeg));
    legL.position.set(-1.75, 0.95, 0);
    const legR = legL.clone();
    legR.position.x = 1.75;
    // Monitor faces the camera side (+z); the villager sits on that side, facing it.
    const monitor = this.mesh(this.shared.monitor!, this.mat(SCENE_COLORS.monitor, { roughness: 0.5 }));
    monitor.position.set(0, 3.25, -0.5);
    const stand = this.mesh(this.shared.stand!, this.mat(SCENE_COLORS.monitor));
    stand.position.set(0, 2.4, -0.5);
    const screen = new THREE.Mesh(this.shared.screen as THREE.PlaneGeometry, new THREE.MeshBasicMaterial({ color: 0xffffff }));
    screen.position.set(0, 3.25, -0.42);
    g.add(top, legL, legR, monitor, stand, screen);

    // Chair and villager on the near side.
    const chair = new THREE.Group();
    chair.position.set(0, 0, 2.0);
    const seat = this.mesh(this.shared.seat!, this.mat(SCENE_COLORS.chair));
    seat.position.y = 1.35;
    const back = this.mesh(this.shared.back!, this.mat(SCENE_COLORS.chair));
    back.position.set(0, 2.05, 0.65);
    const post = this.mesh(this.shared.post!, this.mat(SCENE_COLORS.deskLeg));
    post.position.y = 0.7;
    const foot = this.mesh(this.shared.foot!, this.mat(SCENE_COLORS.deskLeg));
    foot.position.y = 0.06;
    chair.add(seat, back, post, foot);

    const h = hash(sessionId);
    const person = new THREE.Group();
    person.position.set(0, 1.45, 1.75);
    const shirt = this.mat(mixHex(pod.accent, "#ffffff", 0.12));
    const body = this.mesh(this.shared.body!, shirt);
    body.position.y = 1.0;
    const head = new THREE.Group();
    head.position.y = 2.45;
    const skull = this.mesh(this.shared.head!, this.mat(SKIN[h % SKIN.length]!));
    const hair = this.mesh(this.shared.hair!, this.mat(HAIR[(h >>> 3) % HAIR.length]!));
    hair.rotation.x = 0.25;
    head.add(skull, hair);
    person.add(body, head);
    const lamp = new THREE.Mesh(this.shared.lamp as THREE.SphereGeometry, new THREE.MeshStandardMaterial({ color: TONE_LAMP[tone], emissive: TONE_LAMP[tone], emissiveIntensity: 1.2 }));
    lamp.position.y = 3.6;
    person.add(lamp);
    g.add(chair, person);
    for (const o of [top, monitor, screen, body, skull, hair]) {
      o.userData.sessionId = sessionId;
      this.pickables.push(o);
    }
    this.root.add(g);
    this.desks.set(sessionId, { lamp, screen, screenKey: "", tone, head, baseY: head.position.y });
  }

  private updateDesk(sessionId: string, tone: Tone, title: string, action: string) {
    const d = this.desks.get(sessionId);
    if (!d) return;
    if (d.tone !== tone) {
      d.tone = tone;
      d.lamp.material.color.set(TONE_LAMP[tone]);
      d.lamp.material.emissive.set(TONE_LAMP[tone]);
    }
    const key = `${tone}|${title}|${action}`;
    if (key === d.screenKey) return;
    d.screenKey = key;
    const old = d.screen.material.map;
    d.screen.material.map = screenTexture(tone, title, action);
    d.screen.material.needsUpdate = true;
    old?.dispose();
  }

  // ── Camera ─────────────────────────────────────────────────────────────────

  private pixelsPerUnit(): number {
    return this.size.h / ((2 * BASE_HALF_H) / this.zoom);
  }

  private updateCamera() {
    const aspect = this.size.w / this.size.h;
    this.camera.left = -BASE_HALF_H * aspect;
    this.camera.right = BASE_HALF_H * aspect;
    this.camera.top = BASE_HALF_H;
    this.camera.bottom = -BASE_HALF_H;
    this.camera.zoom = this.zoom;
    this.camera.position.copy(this.target).addScaledVector(VIEW_DIR, CAMERA_DISTANCE);
    this.camera.lookAt(this.target);
    this.camera.updateProjectionMatrix();
    this.camera.updateMatrixWorld();
  }

  /**
   * Zoom and centre so everything drawn fits beside the board: the pods' and
   * square's corners are projected on the view plane, then scaled into the free
   * area, leaving room on top for the header and the cards (which keep their
   * size in pixels at every zoom).
   */
  fit(animate = true) {
    const pods = this.layout?.pods ?? [];
    const pts: THREE.Vector3[] = [new THREE.Vector3(-SQUARE_R, 0, -SQUARE_R), new THREE.Vector3(SQUARE_R, TOP_Y + 9, SQUARE_R)];
    for (const p of pods) for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
      pts.push(new THREE.Vector3(p.x + (dx * p.w) / 2, 0, p.z + (dz * p.d) / 2), new THREE.Vector3(p.x + (dx * p.w) / 2, TOP_Y + 6, p.z + (dz * p.d) / 2));
    }
    this.updateCamera();
    const right = new THREE.Vector3().setFromMatrixColumn(this.camera.matrixWorld, 0);
    const up = new THREE.Vector3().setFromMatrixColumn(this.camera.matrixWorld, 1);
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const q of pts) {
      const sx = q.dot(right);
      const sy = q.dot(up);
      x0 = Math.min(x0, sx); x1 = Math.max(x1, sx); y0 = Math.min(y0, sy); y1 = Math.max(y1, sy);
    }
    const usableW = Math.max(200, this.size.w - this.reserveRight - 2 * FIT_PAD.x);
    const usableH = Math.max(160, this.size.h - FIT_PAD.top - FIT_PAD.bottom);
    // ppu = zoom · h / (2 · BASE_HALF_H)
    const unit = this.size.h / (2 * BASE_HALF_H);
    const zoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.min(usableW / ((x1 - x0) * unit), usableH / ((y1 - y0) * unit))));
    const ppu = zoom * unit;
    // Centre of the drawing, then shifted so it lands in the middle of the free area (left of the board, below the cards).
    const target = new THREE.Vector3()
      .addScaledVector(right, (x0 + x1) / 2 + this.reserveRight / 2 / ppu)
      .addScaledVector(up, (y0 + y1) / 2 + (FIT_PAD.top - FIT_PAD.bottom) / 2 / ppu);
    this.flyTo(target, zoom, animate);
  }

  /** Move the camera to look at a pod up close. */
  focusPod(projectId: string) {
    const pod = this.layout?.pods.find((p) => p.summary.project.id === projectId);
    if (!pod) return;
    const usableW = Math.max(200, this.size.w - this.reserveRight);
    const needW = (Math.SQRT2 * Math.max(pod.w, pod.d)) / 2 + 4;
    const zoom = Math.min(ZOOM_MAX, (BASE_HALF_H * usableW) / this.size.h / needW, BASE_HALF_H / (0.77 * Math.max(pod.w, pod.d) / 2 + 9));
    this.updateCamera();
    const right = new THREE.Vector3().setFromMatrixColumn(this.camera.matrixWorld, 0);
    const ppu = this.size.h / ((2 * BASE_HALF_H) / zoom);
    const target = new THREE.Vector3(pod.x, TOP_Y, pod.z).addScaledVector(right, this.reserveRight / 2 / ppu);
    this.flyTo(target, zoom, true);
  }

  private flyTo(to: THREE.Vector3, zoom: number, animate: boolean) {
    if (!animate || this.opts.reducedMotion) {
      this.target.copy(to);
      this.zoom = zoom;
      this.tween = null;
      this.updateCamera();
      this.dirty = true;
      return;
    }
    this.tween = { from: this.target.clone(), to: to.clone(), z0: this.zoom, z1: zoom, t0: performance.now(), ms: 650 };
  }

  zoomBy(k: number) {
    this.tween = null;
    this.zoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, this.zoom * k));
    this.updateCamera();
    this.dirty = true;
  }

  /** Drag by screen pixels: the ground follows the pointer. */
  panBy(dx: number, dy: number) {
    this.tween = null;
    const ppu = this.pixelsPerUnit();
    const right = new THREE.Vector3().setFromMatrixColumn(this.camera.matrixWorld, 0);
    const up = new THREE.Vector3().setFromMatrixColumn(this.camera.matrixWorld, 1);
    this.target.addScaledVector(right, -dx / ppu).addScaledVector(up, dy / ppu);
    this.updateCamera();
    this.dirty = true;
  }

  /** What is under a point of the canvas: a villager (session id) or a pod (project id). */
  pick(px: number, py: number): { sessionId?: string; projectId?: string } {
    const ndc = new THREE.Vector2((px / this.size.w) * 2 - 1, -(py / this.size.h) * 2 + 1);
    const ray = new THREE.Raycaster();
    ray.setFromCamera(ndc, this.camera);
    for (const hit of ray.intersectObjects(this.pickables, false)) {
      const u = hit.object.userData as { sessionId?: string; projectId?: string };
      if (u.sessionId || u.projectId) return u;
    }
    return {};
  }

  // ── Frames ─────────────────────────────────────────────────────────────────

  start() {
    const loop = (now: number) => {
      if (this.disposed) return;
      this.raf = requestAnimationFrame(loop);
      const animating = this.step(now);
      if (!this.dirty && !animating) return;
      this.dirty = false;
      this.renderer.render(this.scene, this.camera);
      this.opts.onFrame(this.anchors());
    };
    this.raf = requestAnimationFrame(loop);
  }

  /** Advance the camera tween and the small idle motions; true while something moves. */
  private step(now: number): boolean {
    let moving = false;
    if (this.tween) {
      const k = Math.min(1, (now - this.tween.t0) / this.tween.ms);
      const e = 1 - Math.pow(1 - k, 3);
      this.target.lerpVectors(this.tween.from, this.tween.to, e);
      this.zoom = this.tween.z0 + (this.tween.z1 - this.tween.z0) * e;
      this.updateCamera();
      if (k >= 1) this.tween = null;
      moving = true;
    }
    if (!this.opts.reducedMotion) {
      // Lamps of sessions that need the person pulse; working villagers nod a little at their screen.
      for (const d of this.desks.values()) {
        if (d.tone === "urgent") {
          d.lamp.scale.setScalar(1 + 0.35 * (0.5 + 0.5 * Math.sin(now / 220)));
          moving = true;
        } else if (d.lamp.scale.x !== 1) d.lamp.scale.setScalar(1);
        if (d.tone === "work") {
          d.head.position.y = d.baseY + 0.05 * Math.sin(now / 300 + d.baseY);
          moving = true;
        }
      }
    }
    return moving;
  }

  private project(x: number, y: number, z: number): Anchor {
    const v = new THREE.Vector3(x, y, z).project(this.camera);
    return { x: (v.x * 0.5 + 0.5) * this.size.w, y: (-v.y * 0.5 + 0.5) * this.size.h, visible: v.z < 1 && Math.abs(v.x) < 1.6 && Math.abs(v.y) < 1.6 };
  }

  /** The box a pod covers on screen, from its base to the villagers' heads. */
  private screenRect(p: Pod3D): ScreenRect {
    const r = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
    for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
      for (const y of [0, TOP_Y + 5]) {
        const a = this.project(p.x + (dx * p.w) / 2, y, p.z + (dz * p.d) / 2);
        r.x0 = Math.min(r.x0, a.x);
        r.x1 = Math.max(r.x1, a.x);
        r.y0 = Math.min(r.y0, a.y);
        r.y1 = Math.max(r.y1, a.y);
      }
    }
    return r;
  }

  private anchors(): FrameAnchors {
    const pods = new Map<string, { card: Anchor; wireEnd: Anchor; rect: ScreenRect }>();
    const desks = new Map<string, Anchor>();
    for (const p of this.layout?.pods ?? []) {
      // The pod's back corner (farthest from the camera) is the top of it on screen.
      pods.set(p.summary.project.id, {
        card: this.project(p.x - p.w / 2, TOP_Y + 1, p.z - p.d / 2),
        wireEnd: this.project(p.x - (Math.sign(p.x) * p.w) / 2.6, TOP_Y, p.z - (Math.sign(p.z) * p.d) / 2.6),
        rect: this.screenRect(p),
      });
      for (const d of p.desks) desks.set(d.session.id, this.project(d.x, TOP_Y + 6.2, d.z + 1.15));
    }
    return { pods, desks, square: this.project(0, TOP_Y + 9, 0), ppu: this.pixelsPerUnit() };
  }

  requestRender() {
    this.dirty = true;
  }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.clearRoot();
    for (const g of Object.values(this.shared)) g.dispose();
    for (const m of this.materials.values()) m.dispose();
    this.renderer.dispose();
    // Browsers allow only a few live WebGL contexts: give this one back now, not at garbage collection.
    this.renderer.forceContextLoss();
  }
}

/** A monitor's picture: a dark terminal while working, amber when it needs the person, a pale page while resting. */
function screenTexture(tone: Tone, title: string, action: string): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 160;
  const ctx = c.getContext("2d")!;
  const dark = tone === "work" || tone === "quiet" || tone === "error";
  ctx.fillStyle = tone === "urgent" ? "#3a2a12" : dark ? "#15171b" : "#efe9dc";
  ctx.fillRect(0, 0, 256, 160);
  ctx.font = "bold 22px Consolas, Menlo, monospace";
  ctx.fillStyle = tone === "urgent" ? "#f5b33d" : tone === "error" ? "#ff8a80" : dark ? "#9be7d4" : "#4a463d";
  ctx.fillText(title.slice(0, 18), 12, 32);
  ctx.font = "18px Consolas, Menlo, monospace";
  ctx.fillStyle = tone === "urgent" ? "#ffd58a" : dark ? "#c9d1cf" : "#6b665b";
  const words = (tone === "urgent" ? "Waiting for you" : action || (dark ? "Thinking" : "Resting")).slice(0, 60);
  for (let i = 0; i < 3; i++) ctx.fillText(words.slice(i * 20, i * 20 + 20), 12, 66 + i * 26);
  // Faint lines below the text, like more output.
  ctx.fillStyle = dark ? "rgba(155,231,212,0.25)" : "rgba(74,70,61,0.2)";
  for (let i = 0; i < 2; i++) ctx.fillRect(12, 128 + i * 12, 120 + ((title.length * 37 + i * 53) % 110), 5);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
