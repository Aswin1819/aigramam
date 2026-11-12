import { BODY, H, W, poseOf, type Pose, type VillagerFrame } from "../scene";

/**
 * mini3d: a tiny 3D renderer on Canvas 2D for the "3D-looking" style
 * prototypes (no Three.js). Perspective camera, meshes made of polygons with
 * explicit normals, per-face Lambert shading (one directional light +
 * ambient + optional rim), log-depth fog, optional vertex snapping (PS1/PS2
 * wobble), painter's-algorithm sorting, plus smooth "impostor" spheres and
 * capsules (gradient-shaded circles / round-capped strokes) for rounded looks.
 *
 * World space: X right, Y up, Z away from the camera. The camera's horizon
 * sits on the scene's horizon (y = 150) and `ground(cam, sx, sy)` turns any
 * logical 2D scene point into the world point on the ground plane that
 * projects exactly there, so 3D styles line up with the 2D ones.
 * `s` (world units per logical unit at that spot) sizes things so a villager
 * 72 units tall in 2D is 72 units tall on screen.
 */

export type V3 = [number, number, number];
export type RGB = [number, number, number];

// ── vector maths ────────────────────────────────────────────────────────────
export const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const mul = (a: V3, k: number): V3 => [a[0] * k, a[1] * k, a[2] * k];
export const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const len = (a: V3) => Math.hypot(a[0], a[1], a[2]);
export const norm = (a: V3): V3 => mul(a, 1 / (len(a) || 1));
export const lerp3 = (a: V3, b: V3, t: number): V3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
/** a + b*k + c*m (handy for building points in a local frame). */
export const madd = (a: V3, b: V3, k: number, c?: V3, m = 0): V3 =>
  c ? [a[0] + b[0] * k + c[0] * m, a[1] + b[1] * k + c[1] * m, a[2] + b[2] * k + c[2] * m] : [a[0] + b[0] * k, a[1] + b[1] * k, a[2] + b[2] * k];

// ── colour ──────────────────────────────────────────────────────────────────
export function hex(s: string): RGB {
  const h = s.replace("#", "");
  const f = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  return [parseInt(f.slice(0, 2), 16), parseInt(f.slice(2, 4), 16), parseInt(f.slice(4, 6), 16)];
}
export const mixRGB = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
export const scaleRGB = (a: RGB, k: number): RGB => [a[0] * k, a[1] * k, a[2] * k];
const c255 = (v: number) => (v < 0 ? 0 : v > 255 ? 255 : v | 0);
export const rgba = (c: RGB, a = 1) => (a >= 1 ? `rgb(${c255(c[0])},${c255(c[1])},${c255(c[2])})` : `rgba(${c255(c[0])},${c255(c[1])},${c255(c[2])},${a})`);
/** Desaturate towards grey by t (0..1). */
export function desat(c: RGB, t: number): RGB {
  const g = c[0] * 0.3 + c[1] * 0.59 + c[2] * 0.11;
  return mixRGB(c, [g, g, g], t);
}

// ── camera ──────────────────────────────────────────────────────────────────
export interface Camera { pos: V3; fw: V3; right: V3; up: V3; F: number; cx: number; cy: number }

/** A front-on camera pitched down so the horizon lands on `horizonY`. */
export function makeCamera(o: { fov?: number; horizonY?: number; height?: number; x?: number } = {}): Camera {
  const fov = ((o.fov ?? 40) * Math.PI) / 180;
  const F = H / 2 / Math.tan(fov / 2);
  const p = Math.atan((H / 2 - (o.horizonY ?? 150)) / F);
  return { pos: [o.x ?? W / 2, o.height ?? 170, 0], fw: [0, -Math.sin(p), Math.cos(p)], right: [1, 0, 0], up: [0, Math.cos(p), Math.sin(p)], F, cx: W / 2, cy: H / 2 };
}

export interface Proj { x: number; y: number; z: number }
export function project(cam: Camera, p: V3): Proj {
  const d = sub(p, cam.pos);
  const z = Math.max(1, dot(d, cam.fw));
  return { x: cam.cx + (dot(d, cam.right) * cam.F) / z, y: cam.cy - (dot(d, cam.up) * cam.F) / z, z };
}

/** World point on the ground plane (Y = 0) under logical screen point (sx, sy); s = world units per logical unit there. */
export function ground(cam: Camera, sx: number, sy: number): { p: V3; s: number; z: number } {
  const a = (sx - cam.cx) / cam.F, b = -(sy - cam.cy) / cam.F;
  const dir: V3 = [cam.fw[0] + cam.right[0] * a + cam.up[0] * b, cam.fw[1] + cam.right[1] * a + cam.up[1] * b, cam.fw[2] + cam.right[2] * a + cam.up[2] * b];
  const t = dir[1] < -1e-6 ? -cam.pos[1] / dir[1] : 1e6;
  return { p: madd(cam.pos, dir, t), s: t / cam.F, z: t };
}

// ── meshes ──────────────────────────────────────────────────────────────────
/** Texture painter: called clipped to the face with its projected points (x0,y0,x1,y1,...) and fog amount. */
export type Tex = (ctx: CanvasRenderingContext2D, pts: number[], fog: number) => void;
export interface PolyOpts {
  /** Draw both sides (normal flips toward the camera). */
  double?: boolean;
  /** Adds c × emissive to the lit colour (self-lit screens, flames). */
  emissive?: number;
  tex?: Tex;
  alpha?: number;
  /** Skip lighting: use the colour as is (fog still applies). */
  flat?: boolean;
  noFog?: boolean;
}
export interface Poly { v: V3[]; n: V3; c: RGB; o?: PolyOpts }

const AX: [V3, V3, V3] = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];

/** Oriented box: centre, three unit axes, half sizes. */
export function obox(c: V3, ax: [V3, V3, V3], h: [number, number, number], col: RGB, o?: PolyOpts): Poly[] {
  const out: Poly[] = [];
  for (let i = 0; i < 3; i++) {
    const j = (i + 1) % 3, k = (i + 2) % 3;
    for (const sg of [-1, 1]) {
      const fc = madd(c, ax[i], h[i] * sg);
      const P = (a: number, b: number) => madd(fc, ax[j], h[j] * a, ax[k], h[k] * b);
      out.push({ v: [P(-1, -1), P(1, -1), P(1, 1), P(-1, 1)], n: mul(ax[i], sg), c: col, o });
    }
  }
  return out;
}
/** Axis-aligned box from min to max corner. */
export function box(min: V3, max: V3, col: RGB, o?: PolyOpts): Poly[] {
  return obox(lerp3(min, max, 0.5), AX, [(max[0] - min[0]) / 2, (max[1] - min[1]) / 2, (max[2] - min[2]) / 2], col, o);
}
/** Box from a to b (a limb): w across in the plane, d along `side`. */
export function boxBetween(a: V3, b: V3, side: V3, w: number, d: number, col: RGB, o?: PolyOpts): Poly[] {
  const ab = sub(b, a);
  const L = len(ab) || 1e-3;
  const u = mul(ab, 1 / L);
  const s = norm(sub(side, mul(u, dot(side, u))));
  const p = cross(u, s);
  return obox(lerp3(a, b, 0.5), [u, p, s], [L / 2, w / 2, d / 2], col, o);
}
function basis(axis: V3): [V3, V3] {
  const ref: V3 = Math.abs(axis[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
  const e1 = norm(cross(axis, ref));
  return [e1, cross(axis, e1)];
}
/** Low-poly cylinder / cone frustum from a (radius r0) to b (radius r1). */
export function cylinder(a: V3, b: V3, r0: number, r1: number, seg: number, col: RGB, o?: PolyOpts, caps: { top?: boolean; bottom?: boolean } = { top: true }): Poly[] {
  const ab = sub(b, a);
  const L = len(ab) || 1e-3;
  const u = mul(ab, 1 / L);
  const [e1, e2] = basis(u);
  const ring = (c: V3, r: number, i: number) => {
    const t = (i / seg) * Math.PI * 2;
    return madd(c, e1, Math.cos(t) * r, e2, Math.sin(t) * r);
  };
  const out: Poly[] = [];
  const slope = (r0 - r1) / L;
  for (let i = 0; i < seg; i++) {
    const tm = ((i + 0.5) / seg) * Math.PI * 2;
    const n = norm(add(madd([0, 0, 0], e1, Math.cos(tm), e2, Math.sin(tm)), mul(u, slope)));
    out.push({ v: [ring(a, r0, i), ring(a, r0, i + 1), ring(b, r1, i + 1), ring(b, r1, i)], n, c: col, o });
  }
  if (caps.top && r1 > 0) out.push({ v: Array.from({ length: seg }, (_, i) => ring(b, r1, i)), n: u, c: col, o });
  if (caps.bottom && r0 > 0) out.push({ v: Array.from({ length: seg }, (_, i) => ring(a, r0, i)), n: mul(u, -1), c: col, o });
  return out;
}
/** Low-poly ellipsoid (lat-long). */
export function ellipsoid(c: V3, r: V3, segU: number, segV: number, col: RGB, o?: PolyOpts): Poly[] {
  const P = (i: number, j: number): V3 => {
    const th = (i / segU) * Math.PI * 2, ph = (j / segV) * Math.PI;
    return [c[0] + Math.cos(th) * Math.sin(ph) * r[0], c[1] + Math.cos(ph) * r[1], c[2] + Math.sin(th) * Math.sin(ph) * r[2]];
  };
  const out: Poly[] = [];
  for (let j = 0; j < segV; j++)
    for (let i = 0; i < segU; i++) {
      const v = [P(i, j), P(i + 1, j), P(i + 1, j + 1), P(i, j + 1)];
      const m = P(i + 0.5, j + 0.5);
      const n = norm([(m[0] - c[0]) / (r[0] * r[0]), (m[1] - c[1]) / (r[1] * r[1]), (m[2] - c[2]) / (r[2] * r[2])]);
      out.push({ v: j === 0 ? [v[0], v[2], v[3]] : j === segV - 1 ? [v[0], v[1], v[2]] : v, n, c: col, o });
    }
  return out;
}
/** Any flat polygon; the normal is taken from its first three points (pass `n` to override). */
export function poly(v: V3[], col: RGB, o?: PolyOpts, n?: V3): Poly {
  return { v, n: n ?? norm(cross(sub(v[1], v[0]), sub(v[2], v[0]))), c: col, o };
}
/** Horizontal quad on the ground (normal up), from 4 world points. */
export function flatQuad(v: V3[], col: RGB, o?: PolyOpts): Poly {
  return { v, n: [0, 1, 0], c: col, o };
}
export function translate(ps: Poly[], d: V3): Poly[] {
  return ps.map((p) => ({ ...p, v: p.v.map((q) => add(q, d)) }));
}
/** Rotate about the vertical axis through `pivot`. */
export function rotateY(ps: Poly[], ang: number, pivot: V3): Poly[] {
  const c = Math.cos(ang), s = Math.sin(ang);
  const r = (q: V3): V3 => [pivot[0] + (q[0] - pivot[0]) * c + (q[2] - pivot[2]) * s, q[1], pivot[2] - (q[0] - pivot[0]) * s + (q[2] - pivot[2]) * c];
  const rn = (n: V3): V3 => [n[0] * c + n[2] * s, n[1], -n[0] * s + n[2] * c];
  return ps.map((p) => ({ ...p, v: p.v.map(r), n: rn(p.n) }));
}

// ── renderer ────────────────────────────────────────────────────────────────
export interface Look {
  /** Unit vector pointing toward the light. */
  light: V3;
  /** Light and ambient colour multipliers (around 0..1.2). */
  lightColor: RGB;
  ambient: RGB;
  /** Rim (fresnel-ish) light added on surfaces seen edge-on. */
  rim?: { color: RGB; k: number };
  /** Log-depth fog: amount = min(max, k · ln(z / near)). */
  fog?: { color: RGB; near: number; k: number; max?: number };
  /** Snap projected vertices to this grid (logical units) for PS1/PS2 wobble. */
  snap?: number;
  /** Stroke each face with its own colour (hides hairline seams). Width in logical units. */
  seam?: number;
  /** Specular highlight strength for impostor spheres/capsules (0..1). */
  spec?: number;
}

interface Item { l: number; k1: number; k2: number; k3: number; draw: (ctx: CanvasRenderingContext2D) => void }
export interface ImpostorOpts { layer?: number; emissive?: number; alpha?: number; /** vertical squash of a sphere (ry / r) */ sy?: number; noRim?: boolean }

export class R3 {
  private items: Item[] = [];
  private grp: number | null = null;
  private sub = 0;
  /** Light direction on screen (unit, y down). */
  readonly L2: [number, number];

  constructor(public cam: Camera, public look: Look) {
    const lx = dot(look.light, cam.right), ly = -dot(look.light, cam.up);
    const l = Math.hypot(lx, ly) || 1;
    this.L2 = [lx / l, ly / l];
  }

  /** Group following items (one character): sorted together at `depth`, drawn in the order they're added. */
  begin(depth: number) { this.grp = depth; this.sub = 0; }
  end() { this.grp = null; }
  get count() { return this.items.length; }

  private push(z: number, draw: Item["draw"], layer = 0) {
    this.items.push({ l: layer, k1: this.grp ?? z, k2: this.grp === null ? 0 : this.sub, k3: z, draw });
  }
  private snap(v: number) { const g = this.look.snap; return g ? Math.round(v / g) * g : v; }

  fogAt(z: number) {
    const fg = this.look.fog;
    if (!fg) return 0;
    return Math.min(fg.max ?? 1, Math.max(0, fg.k * Math.log(Math.max(1, z / fg.near))));
  }
  /** Lit colour of a surface with normal n at point `at`, before fog. */
  shade(c: RGB, n: V3, at: V3, emissive = 0): RGB {
    const L = this.look;
    const d = Math.max(0, dot(n, L.light));
    let r = c[0] * (L.ambient[0] + L.lightColor[0] * d + emissive);
    let g = c[1] * (L.ambient[1] + L.lightColor[1] * d + emissive);
    let b = c[2] * (L.ambient[2] + L.lightColor[2] * d + emissive);
    if (L.rim) {
      const v = norm(sub(this.cam.pos, at));
      const k = Math.pow(1 - Math.max(0, dot(n, v)), 2.5) * L.rim.k;
      r += L.rim.color[0] * k; g += L.rim.color[1] * k; b += L.rim.color[2] * k;
    }
    return [r, g, b];
  }
  fogged(c: RGB, z: number, noFog = false): RGB {
    const fg = this.look.fog;
    return fg && !noFog ? mixRGB(c, fg.color, this.fogAt(z)) : c;
  }

  /** Add polygons (one mesh). Back faces are culled unless `double`. */
  add(ps: Poly[], layer = 0) {
    const cam = this.cam;
    for (const p of ps) {
      let n = p.n;
      const toCam = sub(cam.pos, p.v[0]);
      if (dot(n, toCam) < 0) {
        if (!p.o?.double) continue;
        n = mul(n, -1);
      }
      const pts: number[] = [];
      let zs = 0;
      const ctr: V3 = [0, 0, 0];
      for (const q of p.v) {
        const pr = project(cam, q);
        pts.push(this.snap(pr.x), this.snap(pr.y));
        zs += pr.z;
        ctr[0] += q[0]; ctr[1] += q[1]; ctr[2] += q[2];
      }
      const z = zs / p.v.length;
      const o = p.o;
      const lit = o?.flat ? p.c : this.shade(p.c, n, mul(ctr, 1 / p.v.length), o?.emissive ?? 0);
      const fogA = o?.noFog ? 0 : this.fogAt(z);
      const fill = rgba(this.fogged(lit, z, o?.noFog), o?.alpha ?? 1);
      const seam = this.look.seam;
      this.push(z, (ctx) => {
        ctx.beginPath();
        ctx.moveTo(pts[0], pts[1]);
        for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]);
        ctx.closePath();
        ctx.fillStyle = fill;
        ctx.fill();
        if (seam && !(o?.alpha! < 1)) { ctx.strokeStyle = fill; ctx.lineWidth = seam; ctx.stroke(); }
        if (o?.tex) { ctx.save(); ctx.clip(); o.tex(ctx, pts, fogA); ctx.restore(); }
      }, layer);
    }
    if (this.grp !== null) this.sub++;
  }

  private tones(c: RGB, at: V3, z: number, emissive: number) {
    const v = norm(sub(this.cam.pos, at));
    const lit = this.fogged(this.shade(c, this.look.light, at, emissive), z);
    const mid = this.fogged(this.shade(c, norm(add(v, mul(this.look.light, 0.35))), at, emissive), z);
    const dark = this.fogged(this.shade(c, norm(sub(mul(v, 0.3), this.look.light)), at, emissive), z);
    const sp = this.look.spec ?? 0;
    const hi = mixRGB(lit, [255, 255, 255], sp * 0.6);
    return { lit, mid, dark, hi };
  }
  private rimStroke(): string | null {
    const r = this.look.rim;
    return r ? rgba(mixRGB(r.color, [255, 255, 255], 0.2), Math.min(1, r.k)) : null;
  }

  /** Smooth sphere impostor (gradient-shaded circle). */
  sphere(c: V3, r: number, col: RGB, o: ImpostorOpts = {}) {
    const p = project(this.cam, c);
    const rr = (r * this.cam.F) / p.z;
    const t = this.tones(col, c, p.z, o.emissive ?? 0);
    const [lx, ly] = this.L2;
    const sy = o.sy ?? 1;
    const rim = o.noRim ? null : this.rimStroke();
    const x = this.snap(p.x), y = this.snap(p.y);
    this.push(p.z, (ctx) => {
      ctx.save();
      ctx.translate(x, y);
      if (sy !== 1) ctx.scale(1, sy);
      const g = ctx.createRadialGradient(lx * rr * 0.4, ly * rr * 0.4, rr * 0.04, 0, 0, rr);
      g.addColorStop(0, rgba(t.hi, o.alpha ?? 1));
      g.addColorStop(0.3, rgba(t.lit, o.alpha ?? 1));
      g.addColorStop(0.75, rgba(t.mid, o.alpha ?? 1));
      g.addColorStop(1, rgba(t.dark, o.alpha ?? 1));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(0, 0, rr, 0, Math.PI * 2);
      ctx.fill();
      if (rim) {
        const a = Math.atan2(-ly, -lx);
        ctx.globalCompositeOperation = "lighter";
        ctx.strokeStyle = rim;
        ctx.lineWidth = Math.max(0.6, rr * 0.16);
        ctx.beginPath();
        ctx.arc(0, 0, rr * 0.9, a - 1.1, a + 1.1);
        ctx.stroke();
      }
      ctx.restore();
    }, o.layer ?? 0);
    if (this.grp !== null) this.sub++;
  }

  /** Smooth capsule impostor from a to b (a round-capped, cylinder-shaded stroke). */
  capsule(a: V3, b: V3, r: number, col: RGB, o: ImpostorOpts = {}) {
    const pa = project(this.cam, a), pb = project(this.cam, b);
    const z = (pa.z + pb.z) / 2;
    const rr = (r * this.cam.F) / z;
    const t = this.tones(col, lerp3(a, b, 0.5), z, o.emissive ?? 0);
    let nx = -(pb.y - pa.y), ny = pb.x - pa.x;
    const nl = Math.hypot(nx, ny);
    if (nl < 1e-4) { nx = this.L2[0]; ny = this.L2[1]; } else { nx /= nl; ny /= nl; }
    if (nx * this.L2[0] + ny * this.L2[1] < 0) { nx = -nx; ny = -ny; }
    const ax = this.snap(pa.x), ay = this.snap(pa.y);
    let bx = this.snap(pb.x), by = this.snap(pb.y);
    if (Math.abs(bx - ax) + Math.abs(by - ay) < 0.01) bx += 0.01;
    const rim = o.noRim ? null : this.rimStroke();
    const al = o.alpha ?? 1;
    this.push(z, (ctx) => {
      const mx = (ax + bx) / 2, my = (ay + by) / 2;
      const g = ctx.createLinearGradient(mx - nx * rr, my - ny * rr, mx + nx * rr, my + ny * rr);
      g.addColorStop(0, rgba(t.dark, al));
      g.addColorStop(0.45, rgba(t.mid, al));
      g.addColorStop(0.78, rgba(t.lit, al));
      g.addColorStop(0.9, rgba(t.hi, al));
      g.addColorStop(1, rgba(t.lit, al));
      ctx.save();
      ctx.lineCap = "round";
      ctx.strokeStyle = g;
      ctx.lineWidth = rr * 2;
      ctx.beginPath();
      ctx.moveTo(ax, ay);
      ctx.lineTo(bx, by);
      ctx.stroke();
      if (rim) {
        ctx.globalCompositeOperation = "lighter";
        ctx.strokeStyle = rim;
        ctx.lineWidth = Math.max(0.5, rr * 0.3);
        ctx.beginPath();
        ctx.moveTo(ax - nx * rr * 0.78, ay - ny * rr * 0.78);
        ctx.lineTo(bx - nx * rr * 0.78, by - ny * rr * 0.78);
        ctx.stroke();
      }
      ctx.restore();
    }, o.layer ?? 0);
    if (this.grp !== null) this.sub++;
  }

  /** Arbitrary 2D drawing sorted at view depth z (labels, glows, decals). */
  custom(z: number, draw: (ctx: CanvasRenderingContext2D) => void, layer = 0) {
    this.push(z, draw, layer);
    if (this.grp !== null) this.sub++;
  }

  /** Sort (layer ↑, then far → near, groups in add order) and draw everything, then clear. */
  render(ctx: CanvasRenderingContext2D) {
    this.items.sort((a, b) => a.l - b.l || b.k1 - a.k1 || a.k2 - b.k2 || b.k3 - a.k3);
    ctx.lineJoin = "round";
    for (const it of this.items) it.draw(ctx);
    this.items.length = 0;
  }
}

// ── character rig ───────────────────────────────────────────────────────────
export type Local = [number, number, number];
export interface Rig {
  v: VillagerFrame;
  pose: Pose;
  /** World units per logical unit at the villager. */
  s: number;
  base: V3;
  /** Unit axes: forward (walking direction, turned a little toward the camera), up, and side (toward the camera). */
  fwd: V3;
  up: V3;
  side: V3;
  /** View depth of the feet (use with R3.begin). */
  z: number;
  /** Local (forward, up, side) in logical units → world. */
  w: (l: Local) => V3;
  /** Joints in local (forward, up) logical units; legs/arms "B" sit at side -off, "F" at +off. */
  j: Record<"hip" | "kneeF" | "kneeB" | "footF" | "footB" | "neck" | "head" | "shoulder" | "elbowF" | "elbowB" | "handF" | "handB" | "top", [number, number]>;
  body: { [K in keyof typeof BODY]: number };
}
export interface RigOpts {
  /** Yaw toward the camera, radians (0 = pure profile). Default 0.45. */
  turn?: number;
  /** Override body proportions (e.g. big heads). */
  prop?: Partial<{ [K in keyof typeof BODY]: number }>;
  /** Vertical squash/stretch (1 = none); widths scale by 1/√squash. */
  squash?: number;
  /** Override the pose (e.g. eased jumps). */
  pose?: Pose;
}

/** Builds a villager's frame from the shared pose (same joints as scene.skeleton, in 3D). */
export function rig(cam: Camera, v: VillagerFrame, o: RigOpts = {}): Rig {
  const B = { ...BODY, ...o.prop };
  const p = o.pose ?? poseOf(v);
  const g = ground(cam, v.x, v.y);
  const turn = o.turn ?? 0.45;
  const fwd: V3 = [v.facing * Math.cos(turn), 0, -Math.sin(turn)];
  let side: V3 = [-Math.sin(turn), 0, -v.facing * Math.cos(turn)];
  if (side[2] > 0) side = mul(side, -1);
  const up: V3 = [0, 1, 0];
  const sq = o.squash ?? 1;
  const wq = 1 / Math.sqrt(sq);
  const s = g.s;
  const w = (l: Local): V3 => madd(madd(g.p, fwd, l[0] * s * wq, up, l[1] * s * sq), side, l[2] * s * wq);
  const hipY = B.thigh + B.shin - p.bob;
  const hip: [number, number] = [0, hipY];
  const limb = (o2: [number, number], ang: number, L: number): [number, number] => [o2[0] + Math.sin(ang) * L, o2[1] - Math.cos(ang) * L];
  const kneeF = limb(hip, p.legF, B.thigh), kneeB = limb(hip, p.legB, B.thigh);
  const footF = limb(kneeF, p.legF - p.kneeF, B.shin), footB = limb(kneeB, p.legB - p.kneeB, B.shin);
  const neck: [number, number] = [1.5, hipY + B.torso];
  const head: [number, number] = [neck[0] + 0.8, neck[1] + B.head - 1];
  const shoulder: [number, number] = [neck[0], neck[1] - 3];
  const carrying = !!v.carry;
  const elbowF = limb(shoulder, carrying ? 0.3 : p.armF, B.upperArm);
  const elbowB = limb(shoulder, p.armB, B.upperArm);
  const handF: [number, number] = carrying ? [elbowF[0] + B.forearm, elbowF[1] + 2] : limb(elbowF, p.armF * 0.6, B.forearm);
  const handB = limb(elbowB, p.armB * 0.6, B.forearm);
  const top: [number, number] = [head[0], head[1] + B.head];
  return { v, pose: p, s, base: g.p, fwd, up, side, z: g.z, w, j: { hip, kneeF, kneeB, footF, footB, neck, head, shoulder, elbowF, elbowB, handF, handB, top }, body: B };
}

/** Screen point for a villager's label (just above the head, follows jumps). */
export function rigLabel(cam: Camera, r: Rig, gap = 12): Proj {
  return project(cam, r.w([r.j.top[0], r.j.top[1] + gap, 0]));
}

// ── offscreen layers ────────────────────────────────────────────────────────
/** An offscreen canvas `pw × ph` pixels whose context is scaled to logical 640 × 360. */
export function layer(pw = W * 2, ph = H * 2): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const canvas = document.createElement("canvas");
  canvas.width = pw;
  canvas.height = ph;
  const ctx = canvas.getContext("2d")!;
  ctx.setTransform(pw / W, 0, 0, ph / H, 0, 0);
  return { canvas, ctx };
}

/** Bilinear point inside a projected quad (pts = x0,y0..x3,y3 in order), for painting textures/screens onto faces. */
export function quadAt(pts: number[], u: number, v: number): [number, number] {
  const x = (1 - v) * ((1 - u) * pts[0] + u * pts[2]) + v * ((1 - u) * pts[6] + u * pts[4]);
  const y = (1 - v) * ((1 - u) * pts[1] + u * pts[3]) + v * ((1 - u) * pts[7] + u * pts[5]);
  return [x, y];
}
