/**
 * The Office world (three.js): an isometric office floor seen at night or by
 * day, with a lobby in the middle and one office room per project. Each room
 * has the same areas (library, web window, server rack, desks, lounge, front
 * counter), and each session is an employee who walks to the area of what it
 * is doing now and takes that area's pose. The scene draws only: the layout
 * comes from officeLayout.ts, where each employee should be comes from the
 * view (StationKeeper), and every word is in the HTML overlay, fed with
 * screen positions after each frame.
 *
 * Furniture is rebuilt only when rooms or desks change; employees are kept
 * and moved, so walking stays smooth across updates.
 */
import * as THREE from "three";
import type { Station } from "@shared/stations";
import type { Tone } from "@/app/workspace/focus";
import { LOBBY_R, type OfficeLayout, type Room } from "./officeLayout";
import { browserTexture, hash, mixHex, roundedSlab, screenTexture, textTexture } from "./threeKit";

const VIEW_DIR = new THREE.Vector3(1, 0.92, 1).normalize();
const CAMERA_DISTANCE = 260;
const BASE_HALF_H = 42;
const ZOOM_MIN = 0.3;
const ZOOM_MAX = 4;
/** Room kept free when fitting, in pixels: the top bar and cards above, the session list on the left, the notice board on the right. */
const FIT_PAD: Record<"top" | "bottom" | "left" | "right", number> = { top: 130, bottom: 30, left: 360, right: 200 };

const PLINTH_H = 2.4;
const FLOOR_Y = PLINTH_H + 0.3;
const WALL_H = 6.5;
const WALK_SPEED = 7; // world units per second

const C = {
  plinth: "#2c2d2b",
  wall: "#3c3d39",
  wallTop: "#4a4b46",
  corridor: "#303230",
  deskTop: "#dcc29a",
  deskLeg: "#2a2b2d",
  monitor: "#1d1e22",
  chair: "#3b3d3a",
  shelf: "#6b4a2a",
  rack: "#23252a",
  sofa: "#5b6b7a",
  counter: "#d8cdb8",
  brass: "#e3b04b",
  lobby: "#3f5a45",
  dark: "#1b1c1a",
} as const;

const TONE_LAMP: Record<Tone, string> = { urgent: "#ff5a4f", turn: "#f5b33d", work: "#5eead4", quiet: "#a3a098", error: "#ff8a80", rest: "#6f6c66" };
const SKIN = ["#8d5a3b", "#a86f4c", "#c68a5e", "#6e4630", "#b97a55"];
const HAIR = ["#1d1512", "#2b1d16", "#3a2a20", "#141110"];
const BOOKS = ["#b85c4a", "#4a7bb8", "#d9a441", "#5e9a6b", "#8a5fb0", "#c7c0b0"];

export interface Anchor {
  x: number;
  y: number;
  visible: boolean;
}

export interface ScreenRect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface FrameAnchors {
  rooms: Map<string, { card: Anchor; rect: ScreenRect }>;
  /** Employee or helper id → above their head. */
  people: Map<string, Anchor>;
  ppu: number;
}

/** What the view tells the scene about one employee (a session) or helper (a subagent). */
export interface Person {
  id: string;
  /** The session id it belongs to (for picking). */
  sessionId: string;
  roomId: string;
  x: number;
  z: number;
  seated: boolean;
  /** The area the person is in; picks the pose. Helpers use "desk". */
  station: Station;
  tone: Tone;
  thinking: boolean;
  helper: boolean;
  /** For the monitor at the person's desk (employees only). */
  title: string;
  action: string;
}

export interface SceneOptions {
  reducedMotion: boolean;
  onFrame: (a: FrameAnchors) => void;
}

interface PersonParts {
  group: THREE.Group;
  body: THREE.Mesh;
  head: THREE.Group;
  armR: THREE.Mesh;
  prop: THREE.Mesh;
  lamp: THREE.Mesh<THREE.SphereGeometry, THREE.MeshStandardMaterial>;
  dots: THREE.Sprite;
  alert: THREE.Sprite;
  target: THREE.Vector3;
  seatedTarget: boolean;
  data: Person;
  phase: number;
}

export class OfficeScene {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 1200);
  private target = new THREE.Vector3();
  private zoom = 1;
  private size = { w: 1, h: 1 };
  private hemi: THREE.HemisphereLight;
  private sun: THREE.DirectionalLight;
  private furniture = new THREE.Group();
  private peopleRoot = new THREE.Group();
  private people = new Map<string, PersonParts>();
  private screens = new Map<string, { mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>; key: string }>();
  private windowGlows: THREE.MeshStandardMaterial[] = [];
  private roomFloors: THREE.Object3D[] = [];
  private layout: OfficeLayout | null = null;
  private structureKey = "";
  private raf = 0;
  private dirty = true;
  private lastTick = 0;
  private tween: { from: THREE.Vector3; to: THREE.Vector3; z0: number; z1: number; t0: number; ms: number } | null = null;
  private geo: Record<string, THREE.BufferGeometry>;
  private materials = new Map<string, THREE.MeshStandardMaterial>();
  private disposed = false;
  private night = false;

  constructor(canvas: HTMLCanvasElement, private opts: SceneOptions) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.setClearColor(0x000000, 0);

    this.hemi = new THREE.HemisphereLight(0xdfe4f0, 0x2a2622, 1.25);
    this.sun = new THREE.DirectionalLight(0xffe8cc, 2.2);
    this.sun.position.set(-40, 90, 30);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.04;
    this.sun.shadow.radius = 4;
    this.scene.add(this.hemi, this.sun, this.sun.target);

    const catcher = new THREE.Mesh(new THREE.PlaneGeometry(3000, 3000), new THREE.ShadowMaterial({ opacity: 0.38 }));
    catcher.rotation.x = -Math.PI / 2;
    catcher.position.y = -0.6;
    catcher.receiveShadow = true;
    this.scene.add(catcher, this.furniture, this.peopleRoot);

    this.geo = {
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
      arm: new THREE.CapsuleGeometry(0.18, 0.9, 3, 8),
      lamp: new THREE.SphereGeometry(0.3, 14, 10),
      book: new THREE.BoxGeometry(0.7, 0.9, 0.18),
      mug: new THREE.CylinderGeometry(0.22, 0.2, 0.42, 12),
    };
  }

  private mat(color: string, opts: { emissive?: string; intensity?: number; roughness?: number } = {}): THREE.MeshStandardMaterial {
    const key = `${color}|${opts.emissive ?? ""}|${opts.intensity ?? 0}|${opts.roughness ?? 0.85}`;
    let m = this.materials.get(key);
    if (!m) {
      m = new THREE.MeshStandardMaterial({ color, roughness: opts.roughness ?? 0.85, metalness: 0, ...(opts.emissive ? { emissive: opts.emissive, emissiveIntensity: opts.intensity ?? 0.9 } : {}) });
      this.materials.set(key, m);
    }
    return m;
  }

  private box(w: number, h: number, d: number, color: string, x: number, y: number, z: number, parent: THREE.Object3D = this.furniture, shadows = true): THREE.Mesh {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), this.mat(color));
    m.position.set(x, y, z);
    m.castShadow = shadows;
    m.receiveShadow = true;
    parent.add(m);
    return m;
  }

  private mesh(geo: THREE.BufferGeometry, material: THREE.Material, parent: THREE.Object3D): THREE.Mesh {
    const m = new THREE.Mesh(geo, material);
    m.castShadow = true;
    m.receiveShadow = true;
    parent.add(m);
    return m;
  }

  // ── Public API ──────────────────────────────────────────────────────────────

  setReducedMotion(on: boolean) {
    this.opts.reducedMotion = on;
    this.dirty = true;
  }

  /** Lighting by hour: bright day, warm dusk, and at night dim ambient with glowing windows and lamps. */
  setHour(hour: number) {
    const night = hour < 6 || hour >= 19.5;
    const dusk = !night && (hour < 8 || hour >= 17.5);
    this.night = night;
    this.hemi.intensity = night ? 0.55 : dusk ? 0.95 : 1.25;
    this.hemi.color.set(night ? "#8fa0c8" : "#dfe4f0");
    this.sun.intensity = night ? 0.7 : dusk ? 1.6 : 2.2;
    this.sun.color.set(night ? "#9fb2e0" : dusk ? "#ffc58f" : "#ffe8cc");
    for (const m of this.windowGlows) m.emissiveIntensity = night ? 1.4 : 0.15;
    this.dirty = true;
  }

  resize(w: number, h: number) {
    this.size = { w: Math.max(1, w), h: Math.max(1, h) };
    this.renderer.setSize(this.size.w, this.size.h, false);
    this.updateCamera();
    this.dirty = true;
  }

  /** Rooms and furniture: rebuilt only when the floor plan changes. */
  setLayout(layout: OfficeLayout) {
    this.layout = layout;
    const key = layout.rooms.map((r) => `${r.project.id}@${r.x.toFixed(1)},${r.z.toFixed(1)},${r.w},${r.d},${r.accent}:${r.desks.map((d) => d.sessionId).join("+")}`).join("|");
    if (key === this.structureKey) return;
    const first = this.structureKey === "";
    this.structureKey = key;
    this.rebuildFurniture(layout);
    if (first) this.fit(false);
    this.dirty = true;
  }

  /** Employees and helpers: added, removed, or sent walking to their new spot. */
  setPeople(list: Person[]) {
    const live = new Set(list.map((p) => p.id));
    for (const [id, parts] of this.people) {
      if (live.has(id)) continue;
      this.peopleRoot.remove(parts.group);
      parts.lamp.material.dispose();
      (parts.dots.material as THREE.SpriteMaterial).map?.dispose();
      (parts.dots.material as THREE.SpriteMaterial).dispose();
      (parts.alert.material as THREE.SpriteMaterial).map?.dispose();
      (parts.alert.material as THREE.SpriteMaterial).dispose();
      this.people.delete(id);
    }
    for (const p of list) {
      let parts = this.people.get(p.id);
      if (!parts) {
        parts = this.buildPerson(p);
        this.people.set(p.id, parts);
        // New people appear in place (no walk in from nowhere).
        parts.group.position.copy(parts.target);
      }
      this.updatePerson(parts, p);
      if (!p.helper) this.updateScreen(p);
    }
    this.dirty = true;
  }

  zoomBy(k: number) {
    this.tween = null;
    this.zoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, this.zoom * k));
    this.updateCamera();
    this.dirty = true;
  }

  panBy(dx: number, dy: number) {
    this.tween = null;
    const ppu = this.ppu();
    const right = new THREE.Vector3().setFromMatrixColumn(this.camera.matrixWorld, 0);
    const up = new THREE.Vector3().setFromMatrixColumn(this.camera.matrixWorld, 1);
    this.target.addScaledVector(right, -dx / ppu).addScaledVector(up, dy / ppu);
    this.updateCamera();
    this.dirty = true;
  }

  /** Fit the whole office into the view (leaving room for the top bar and cards). */
  fit(animate = true) {
    const rooms = this.layout?.rooms ?? [];
    const pts: THREE.Vector3[] = [new THREE.Vector3(-LOBBY_R, 0, -LOBBY_R), new THREE.Vector3(LOBBY_R, FLOOR_Y + 9, LOBBY_R)];
    for (const r of rooms) for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
      pts.push(new THREE.Vector3(r.x + (dx * r.w) / 2, 0, r.z + (dz * r.d) / 2), new THREE.Vector3(r.x + (dx * r.w) / 2, FLOOR_Y + WALL_H, r.z + (dz * r.d) / 2));
    }
    this.lookAtBox(pts, animate);
  }

  /** Fly to one room. */
  focusRoom(projectId: string) {
    const r = this.layout?.rooms.find((x) => x.project.id === projectId);
    if (!r) return;
    const pts: THREE.Vector3[] = [];
    for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
      pts.push(new THREE.Vector3(r.x + (dx * r.w) / 2, 0, r.z + (dz * r.d) / 2), new THREE.Vector3(r.x + (dx * r.w) / 2, FLOOR_Y + WALL_H, r.z + (dz * r.d) / 2));
    }
    // The project panel opens on the right when a room is chosen: keep the room clear of it.
    this.lookAtBox(pts, true, { right: 400 });
  }

  /** Fly to the room an employee works in. */
  focusPerson(sessionId: string) {
    const p = this.people.get(sessionId);
    if (p) this.focusRoom(p.data.roomId);
  }

  pick(px: number, py: number): { sessionId?: string; projectId?: string } {
    const ndc = new THREE.Vector2((px / this.size.w) * 2 - 1, -(py / this.size.h) * 2 + 1);
    const ray = new THREE.Raycaster();
    ray.setFromCamera(ndc, this.camera);
    const targets: THREE.Object3D[] = [...this.roomFloors];
    for (const p of this.people.values()) targets.push(p.body, p.head);
    for (const s of this.screens.values()) targets.push(s.mesh);
    for (const hit of ray.intersectObjects(targets, true)) {
      let o: THREE.Object3D | null = hit.object;
      while (o && !o.userData.sessionId && !o.userData.projectId) o = o.parent;
      if (o) return o.userData as { sessionId?: string; projectId?: string };
    }
    return {};
  }

  start() {
    const loop = (now: number) => {
      if (this.disposed) return;
      this.raf = requestAnimationFrame(loop);
      const dt = this.lastTick ? Math.min(0.1, (now - this.lastTick) / 1000) : 0;
      this.lastTick = now;
      const moving = this.step(now, dt);
      if (!this.dirty && !moving) return;
      this.dirty = false;
      this.renderer.render(this.scene, this.camera);
      this.opts.onFrame(this.anchors());
    };
    this.raf = requestAnimationFrame(loop);
  }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.clearFurniture();
    this.setPeople([]);
    for (const g of Object.values(this.geo)) g.dispose();
    for (const m of this.materials.values()) m.dispose();
    this.renderer.dispose();
    // Browsers allow only a few live WebGL contexts: give this one back now.
    this.renderer.forceContextLoss();
  }

  // ── Camera ──────────────────────────────────────────────────────────────────

  private ppu(): number {
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

  private lookAtBox(pts: THREE.Vector3[], animate: boolean, padOverride: Partial<typeof FIT_PAD> = {}) {
    const pad = { ...FIT_PAD, ...padOverride };
    this.updateCamera();
    const right = new THREE.Vector3().setFromMatrixColumn(this.camera.matrixWorld, 0);
    const up = new THREE.Vector3().setFromMatrixColumn(this.camera.matrixWorld, 1);
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const q of pts) {
      const sx = q.dot(right);
      const sy = q.dot(up);
      x0 = Math.min(x0, sx); x1 = Math.max(x1, sx); y0 = Math.min(y0, sy); y1 = Math.max(y1, sy);
    }
    const unit = this.size.h / (2 * BASE_HALF_H);
    const usableW = Math.max(200, this.size.w - pad.left - pad.right);
    const usableH = Math.max(160, this.size.h - pad.top - pad.bottom);
    const zoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.min(usableW / ((x1 - x0) * unit), usableH / ((y1 - y0) * unit))));
    const ppu = zoom * unit;
    // Centre the drawing in the free area: shifted right past the session list and down below the top bar.
    const to = new THREE.Vector3()
      .addScaledVector(right, (x0 + x1) / 2 - (pad.left - pad.right) / 2 / ppu)
      .addScaledVector(up, (y0 + y1) / 2 + (pad.top - pad.bottom) / 2 / ppu);
    if (!animate || this.opts.reducedMotion) {
      this.target.copy(to);
      this.zoom = zoom;
      this.tween = null;
      this.updateCamera();
      this.dirty = true;
    } else {
      this.tween = { from: this.target.clone(), to, z0: this.zoom, z1: zoom, t0: performance.now(), ms: 650 };
    }
  }

  // ── Building ────────────────────────────────────────────────────────────────

  private clearFurniture() {
    this.furniture.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.geometry && !Object.values(this.geo).includes(m.geometry)) m.geometry.dispose();
      const mat = m.material as THREE.Material | undefined;
      if (mat && ![...this.materials.values()].includes(mat as THREE.MeshStandardMaterial)) {
        (mat as THREE.MeshBasicMaterial).map?.dispose();
        mat.dispose();
      }
    });
    this.furniture.clear();
    this.screens.clear();
    this.windowGlows = [];
    this.roomFloors = [];
  }

  private rebuildFurniture(layout: OfficeLayout) {
    this.clearFurniture();
    this.buildLobby();
    for (const r of layout.rooms) {
      this.buildCorridor(r);
      this.buildRoom(r);
    }
    const e = layout.extent + 14;
    const sc = this.sun.shadow.camera;
    sc.left = -e;
    sc.right = e;
    sc.top = e;
    sc.bottom = -e;
    sc.near = 1;
    sc.far = 500;
    sc.updateProjectionMatrix();
    this.setHour(this.night ? 23 : 12);
  }

  private addFloorText(text: string, x: number, y: number, z: number, width: number, color: string, facing: "up" | "front" = "up", bg?: string) {
    const tex = textTexture(text, color, undefined, bg);
    const aspect = tex.image.width / tex.image.height;
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(width, width / aspect), new THREE.MeshBasicMaterial({ map: tex, transparent: !bg, depthWrite: !!bg }));
    if (facing === "up") plane.rotation.x = -Math.PI / 2;
    plane.position.set(x, y, z);
    this.furniture.add(plane);
  }

  private buildLobby() {
    const base = new THREE.Mesh(new THREE.CylinderGeometry(LOBBY_R, LOBBY_R, PLINTH_H, 48), this.mat(C.plinth));
    base.position.y = PLINTH_H / 2;
    base.receiveShadow = true;
    const floor = new THREE.Mesh(new THREE.CylinderGeometry(LOBBY_R - 0.8, LOBBY_R - 0.8, 0.3, 48), this.mat(C.lobby));
    floor.position.y = PLINTH_H + 0.15;
    floor.receiveShadow = true;
    this.furniture.add(base, floor);
    // Reception: a round desk with a banyan behind it (the village's tree, indoors).
    const desk = new THREE.Mesh(new THREE.TorusGeometry(2.6, 0.55, 10, 32, Math.PI * 1.2), this.mat(C.counter));
    desk.rotation.x = Math.PI / 2;
    desk.rotation.z = Math.PI * 0.15;
    desk.position.set(1.5, FLOOR_Y + 1, 1.5);
    desk.castShadow = true;
    this.furniture.add(desk);
    const trunk = this.box(0.9, 4.2, 0.9, "#5a3b1c", -2.5, FLOOR_Y + 2.1, -2.5);
    trunk.castShadow = true;
    for (const [dx, dy, dz, r] of [[-2.5, 5.3, -2.5, 2.4], [-4, 4.6, -1.8, 1.7], [-1.2, 4.7, -3.6, 1.7], [-2.6, 6.5, -2.3, 1.6]] as const) {
      const c = this.mesh(new THREE.IcosahedronGeometry(r, 0), this.mat("#3f7a4c", { roughness: 0.95 }), this.furniture);
      c.position.set(dx, FLOOR_Y + dy, dz);
    }
    this.addFloorText("AI GRAMAM · LOBBY", 0, FLOOR_Y + 0.03, LOBBY_R - 2.4, 9, "#e7e1d2");
  }

  private buildCorridor(r: Room) {
    const len = Math.hypot(r.x, r.z);
    const w = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.5, Math.max(0.1, len - LOBBY_R)), this.mat(C.corridor));
    w.receiveShadow = true;
    const mid = (LOBBY_R + len) / 2 / len;
    w.position.set(r.x * mid, 0.9, r.z * mid);
    w.rotation.y = Math.atan2(r.x, r.z);
    this.furniture.add(w);
  }

  private buildRoom(r: Room) {
    const plinth = new THREE.Mesh(roundedSlab(r.w, r.d, 2, PLINTH_H - 0.5), this.mat(C.plinth));
    plinth.position.set(r.x, 0.25, r.z);
    plinth.receiveShadow = true;
    plinth.castShadow = true;
    const floor = new THREE.Mesh(roundedSlab(r.w - 1.4, r.d - 1.4, 1.5, 0.12), this.mat(mixHex(r.accent, C.dark, 0.42), { roughness: 0.95 }));
    floor.position.set(r.x, PLINTH_H + 0.05, r.z);
    floor.receiveShadow = true;
    floor.userData.projectId = r.project.id;
    this.roomFloors.push(floor);
    this.furniture.add(plinth, floor);

    // Back walls (the camera looks from the front-right, so these never hide anyone): north along x, west along z.
    const x0 = r.x - r.w / 2 + 0.7;
    const z0 = r.z - r.d / 2 + 0.7;
    this.box(r.w - 1.4, WALL_H, 0.5, C.wall, r.x, FLOOR_Y + WALL_H / 2, z0);
    this.box(0.5, WALL_H, r.d - 1.4, C.wall, x0, FLOOR_Y + WALL_H / 2, r.z);
    this.box(r.w - 1.4, 0.25, 0.7, C.wallTop, r.x, FLOOR_Y + WALL_H, z0, this.furniture, false);
    this.box(0.7, 0.25, r.d - 1.4, C.wallTop, x0, FLOOR_Y + WALL_H, r.z, this.furniture, false);
    // Windows along the west wall: soft by day, glowing at night.
    const glow = new THREE.MeshStandardMaterial({ color: "#2b3a4a", emissive: "#ffd58a", emissiveIntensity: 0.15, roughness: 0.4 });
    this.windowGlows.push(glow);
    for (let k = 0; k < Math.max(1, Math.floor((r.d - 10) / 7)); k++) {
      const win = new THREE.Mesh(new THREE.BoxGeometry(0.1, 2.4, 3.2), glow);
      win.position.set(x0 + 0.3, FLOOR_Y + 3.6, r.z - r.d / 2 + 9 + k * 7);
      this.furniture.add(win);
    }
    // The project's name on the north wall, above the web window.
    this.addFloorText(r.project.name.toUpperCase(), r.x, FLOOR_Y + WALL_H - 0.55, z0 + 0.3, Math.min(r.w / 2 - 2, 2.5 + r.project.name.length * 0.75), "#f2ead8", "front", mixHex(r.accent, C.dark, 0.25));

    this.buildLibrary(r);
    this.buildWebWindow(r);
    this.buildServers(r);
    this.buildLounge(r);
    this.buildCounter(r);
    for (const d of r.desks) this.buildDesk(d.sessionId, d.x, d.z);
  }

  private buildLibrary(r: Room) {
    const { x, z } = r.areas.study;
    const shelfZ = r.z - r.d / 2 + 1.3;
    this.box(5.2, 4.6, 1.1, C.shelf, x, FLOOR_Y + 2.3, shelfZ);
    for (let row = 0; row < 3; row++) {
      for (let k = 0; k < 7; k++) {
        const h = 0.9 + ((k * 7 + row * 3) % 4) * 0.1;
        this.box(0.55, h, 0.7, BOOKS[(k + row * 2) % BOOKS.length]!, x - 2.1 + k * 0.7, FLOOR_Y + 0.75 + row * 1.45 + h / 2, shelfZ + 0.25, this.furniture, false);
      }
    }
    // Reading armchair.
    this.box(1.8, 0.8, 1.6, "#7a5a3a", x + 3.6, FLOOR_Y + 0.4, z + 2.2);
    this.box(1.8, 1.4, 0.4, "#7a5a3a", x + 3.6, FLOOR_Y + 1.1, z + 1.5);
  }

  private buildWebWindow(r: Room) {
    const { x } = r.areas.gate;
    const wallZ = r.z - r.d / 2 + 1.0;
    const frame = this.box(6.4, 3.8, 0.25, "#1d1e22", x, FLOOR_Y + 3.5, wallZ, this.furniture, false);
    frame.castShadow = false;
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(6, 3.4), new THREE.MeshBasicMaterial({ map: browserTexture() }));
    screen.position.set(x, FLOOR_Y + 3.5, wallZ + 0.14);
    this.furniture.add(screen);
  }

  private buildServers(r: Room) {
    const { x } = r.areas.works;
    const z = r.z - r.d / 2 + 1.5;
    for (const dx of [-1.6, 1.6]) {
      this.box(2.6, 5.2, 1.6, C.rack, x + dx, FLOOR_Y + 2.6, z);
      for (let k = 0; k < 6; k++) {
        const led = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.12, 0.05), this.mat(k % 3 === 0 ? "#5eead4" : "#3d4148", { emissive: k % 3 === 0 ? "#5eead4" : undefined, intensity: 1.2 }));
        led.position.set(x + dx, FLOOR_Y + 0.9 + k * 0.7, z + 0.83);
        this.furniture.add(led);
      }
    }
  }

  private buildLounge(r: Room) {
    const { x, z } = r.areas.bench;
    this.box(5.4, 0.9, 1.8, C.sofa, x, FLOOR_Y + 0.6, z - 1.6);
    this.box(5.4, 1.6, 0.5, C.sofa, x, FLOOR_Y + 1.3, z - 2.4);
    this.box(0.5, 1.2, 1.8, C.sofa, x - 2.7, FLOOR_Y + 0.9, z - 1.6);
    this.box(0.5, 1.2, 1.8, C.sofa, x + 2.7, FLOOR_Y + 0.9, z - 1.6);
    // Coffee table and machine.
    this.box(2.6, 0.2, 1.2, C.deskTop, x, FLOOR_Y + 0.9, z + 0.9);
    this.box(0.25, 0.8, 0.25, C.deskLeg, x, FLOOR_Y + 0.4, z + 0.9);
    this.box(1.2, 1.6, 1.0, "#2f3134", x + 4.3, FLOOR_Y + 0.8, z - 1.8);
    this.box(0.5, 0.3, 0.3, C.brass, x + 4.3, FLOOR_Y + 1.25, z - 1.25, this.furniture, false);
  }

  private buildCounter(r: Room) {
    const { x, z } = r.areas.porch;
    this.box(5, 1.9, 1.3, C.counter, x, FLOOR_Y + 0.95, z - 2.2);
    this.box(5.2, 0.18, 1.6, "#efe7d6", x, FLOOR_Y + 1.95, z - 2.2, this.furniture, false);
    // The call bell people ring when they need you.
    const bell = new THREE.Mesh(new THREE.SphereGeometry(0.4, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), this.mat(C.brass, { roughness: 0.3 }));
    bell.position.set(x + 1.4, FLOOR_Y + 2.05, z - 2.2);
    bell.castShadow = true;
    this.furniture.add(bell);
  }

  private buildDesk(sessionId: string, x: number, z: number) {
    const g = new THREE.Group();
    g.position.set(x, FLOOR_Y, z);
    const top = this.mesh(this.geo.deskTop!, this.mat(C.deskTop, { roughness: 0.7 }), g);
    top.position.y = 2.0;
    const legL = this.mesh(this.geo.deskLeg!, this.mat(C.deskLeg), g);
    legL.position.set(-1.75, 0.95, 0);
    const legR = this.mesh(this.geo.deskLeg!, this.mat(C.deskLeg), g);
    legR.position.set(1.75, 0.95, 0);
    const monitor = this.mesh(this.geo.monitor!, this.mat(C.monitor, { roughness: 0.5 }), g);
    monitor.position.set(0, 3.25, -0.5);
    const stand = this.mesh(this.geo.stand!, this.mat(C.monitor), g);
    stand.position.set(0, 2.4, -0.5);
    const screen = new THREE.Mesh(this.geo.screen as THREE.PlaneGeometry, new THREE.MeshBasicMaterial({ color: 0xffffff }));
    screen.position.set(0, 3.25, -0.42);
    screen.userData.sessionId = sessionId;
    g.add(screen);
    // Chair on the near side.
    const chair = new THREE.Group();
    chair.position.set(0, 0, 2.1);
    this.mesh(this.geo.seat!, this.mat(C.chair), chair).position.y = 1.35;
    const back = this.mesh(this.geo.back!, this.mat(C.chair), chair);
    back.position.set(0, 2.05, 0.65);
    this.mesh(this.geo.post!, this.mat(C.deskLeg), chair).position.y = 0.7;
    this.mesh(this.geo.foot!, this.mat(C.deskLeg), chair).position.y = 0.06;
    g.add(chair);
    // A small plant on every other desk.
    if (hash(sessionId) % 2 === 0) {
      const pot = this.mesh(new THREE.CylinderGeometry(0.28, 0.22, 0.45, 10), this.mat("#b7653f"), g);
      pot.position.set(1.6, 2.35, -0.5);
      const leaf = this.mesh(new THREE.IcosahedronGeometry(0.5, 0), this.mat("#4f8a57"), g);
      leaf.position.set(1.6, 2.85, -0.5);
    }
    this.furniture.add(g);
    this.screens.set(sessionId, { mesh: screen, key: "" });
  }

  private updateScreen(p: Person) {
    const s = this.screens.get(p.sessionId);
    if (!s) return;
    const key = `${p.tone}|${p.title}|${p.action}`;
    if (key === s.key) return;
    s.key = key;
    const old = s.mesh.material.map;
    s.mesh.material.map = screenTexture(p.tone, p.title, p.action);
    s.mesh.material.needsUpdate = true;
    old?.dispose();
  }

  // ── People ──────────────────────────────────────────────────────────────────

  private sprite(text: string, color: string): THREE.Sprite {
    const c = document.createElement("canvas");
    c.width = 128;
    c.height = 64;
    const ctx = c.getContext("2d")!;
    ctx.fillStyle = "rgba(22,23,27,0.9)";
    ctx.beginPath();
    ctx.roundRect(4, 4, 120, 56, 26);
    ctx.fill();
    ctx.fillStyle = color;
    ctx.font = "bold 40px Georgia, serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, 64, 34);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
    sp.scale.set(1.8, 0.9, 1);
    sp.renderOrder = 10;
    return sp;
  }

  private buildPerson(p: Person): PersonParts {
    const room = this.layout?.rooms.find((r) => r.project.id === p.roomId);
    const accent = room?.accent ?? "#a3a098";
    const h = hash(p.id);
    const group = new THREE.Group();
    group.scale.setScalar(p.helper ? 0.8 : 1);
    const body = this.mesh(this.geo.body!, this.mat(p.helper ? mixHex(accent, "#ffffff", 0.5) : mixHex(accent, "#ffffff", 0.12)), group);
    body.position.y = 1.0;
    body.userData.sessionId = p.sessionId;
    const head = new THREE.Group();
    head.position.y = 2.45;
    head.userData.sessionId = p.sessionId;
    this.mesh(this.geo.head!, this.mat(SKIN[h % SKIN.length]!), head);
    const hair = this.mesh(this.geo.hair!, this.mat(HAIR[(h >>> 3) % HAIR.length]!), head);
    hair.rotation.x = 0.25;
    group.add(head);
    const armR = this.mesh(this.geo.arm!, this.mat(mixHex(accent, "#ffffff", 0.12)), group);
    armR.position.set(0.75, 1.3, 0);
    const prop = new THREE.Mesh(this.geo.book!, this.mat("#b85c4a"));
    prop.visible = false;
    group.add(prop);
    const lamp = new THREE.Mesh(this.geo.lamp as THREE.SphereGeometry, new THREE.MeshStandardMaterial({ color: TONE_LAMP[p.tone], emissive: TONE_LAMP[p.tone], emissiveIntensity: 1.2 }));
    lamp.position.y = 3.55;
    group.add(lamp);
    const dots = this.sprite("…", "#eceae3");
    dots.position.set(0.9, 3.9, 0);
    const alert = this.sprite("!", "#ff8a80");
    alert.position.set(0.9, 3.9, 0);
    group.add(dots, alert);
    this.peopleRoot.add(group);
    return { group, body, head, armR, prop, lamp, dots, alert, target: new THREE.Vector3(p.x, FLOOR_Y, p.z), seatedTarget: p.seated, data: p, phase: (h % 1000) / 160 };
  }

  private updatePerson(parts: PersonParts, p: Person) {
    parts.data = p;
    parts.target.set(p.x, FLOOR_Y + (p.seated ? 0.45 : 0), p.z);
    parts.seatedTarget = p.seated;
    if (this.opts.reducedMotion) parts.group.position.copy(parts.target);
    parts.lamp.material.color.set(TONE_LAMP[p.tone]);
    parts.lamp.material.emissive.set(TONE_LAMP[p.tone]);
    parts.dots.visible = p.thinking && p.tone !== "error";
    parts.alert.visible = p.tone === "error";
    // Props by area: a book in the library, a mug in the lounge.
    parts.prop.visible = p.station === "study" || p.station === "bench";
    if (p.station === "study") {
      parts.prop.geometry = this.geo.book!;
      parts.prop.material = this.mat("#b85c4a");
      parts.prop.position.set(0.1, 1.55, -0.65);
    } else if (p.station === "bench") {
      parts.prop.geometry = this.geo.mug!;
      parts.prop.material = this.mat("#efe7d6");
      parts.prop.position.set(0.75, 1.45, -0.3);
    }
  }

  /** Walking, poses and small idle motions; true while anything moves. */
  private step(now: number, dt: number): boolean {
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
    const t = now / 1000;
    for (const p of this.people.values()) {
      const pos = p.group.position;
      const to = p.target;
      const dx = to.x - pos.x;
      const dz = to.z - pos.z;
      const dist = Math.hypot(dx, dz);
      const walking = dist > 0.05 && !this.opts.reducedMotion;
      if (walking) {
        const stepLen = Math.min(dist, WALK_SPEED * dt);
        pos.x += (dx / dist) * stepLen;
        pos.z += (dz / dist) * stepLen;
        pos.y = FLOOR_Y + Math.abs(Math.sin(t * 10 + p.phase)) * 0.18;
        // Face where they're going.
        p.group.rotation.y = Math.atan2(dx, dz);
        moving = true;
      } else {
        pos.copy(to);
        // At rest, face the furniture of the area (the back wall), the desk, or the room (lounge).
        p.group.rotation.y = p.data.station === "bench" ? 0 : Math.PI;
      }
      const s = p.data.station;
      // Arm pose: typing at the desk, raised at the counter, holding a mug or book, else down.
      const raise = s === "porch" && !walking;
      p.armR.rotation.x = raise ? Math.PI * 0.95 : s === "desk" && !walking ? -1.1 : s === "study" || s === "bench" ? -0.9 : 0;
      p.armR.position.y = raise ? 2.1 : 1.3;
      if (!this.opts.reducedMotion && !walking) {
        if (s === "desk" && p.data.tone === "work") {
          p.armR.rotation.z = 0.15 * Math.sin(t * 14 + p.phase);
          p.head.position.y = 2.45 + 0.04 * Math.sin(t * 3 + p.phase);
          moving = true;
        } else if (raise) {
          p.armR.rotation.z = 0.25 * Math.sin(t * 6 + p.phase);
          moving = true;
        }
        if (p.data.tone === "urgent") {
          p.lamp.scale.setScalar(1 + 0.35 * (0.5 + 0.5 * Math.sin(t * 4.5)));
          moving = true;
        } else p.lamp.scale.setScalar(1);
        if (p.dots.visible) {
          p.dots.material.opacity = 0.55 + 0.45 * Math.sin(t * 4 + p.phase);
          moving = true;
        }
      }
    }
    return moving;
  }

  private project(x: number, y: number, z: number): Anchor {
    const v = new THREE.Vector3(x, y, z).project(this.camera);
    return { x: (v.x * 0.5 + 0.5) * this.size.w, y: (-v.y * 0.5 + 0.5) * this.size.h, visible: v.z < 1 && Math.abs(v.x) < 1.4 && Math.abs(v.y) < 1.4 };
  }

  private anchors(): FrameAnchors {
    const rooms = new Map<string, { card: Anchor; rect: ScreenRect }>();
    for (const r of this.layout?.rooms ?? []) {
      const rect = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
      for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
        for (const y of [0, FLOOR_Y + WALL_H]) {
          const a = this.project(r.x + (dx * r.w) / 2, y, r.z + (dz * r.d) / 2);
          rect.x0 = Math.min(rect.x0, a.x); rect.x1 = Math.max(rect.x1, a.x); rect.y0 = Math.min(rect.y0, a.y); rect.y1 = Math.max(rect.y1, a.y);
        }
      }
      rooms.set(r.project.id, { card: this.project(r.x - r.w / 2, FLOOR_Y + WALL_H + 1, r.z - r.d / 2), rect });
    }
    const people = new Map<string, Anchor>();
    for (const [id, p] of this.people) {
      const pos = p.group.position;
      people.set(id, this.project(pos.x, pos.y + (p.data.helper ? 3.6 : 4.4), pos.z));
    }
    return { rooms, people, ppu: this.ppu() };
  }
}
