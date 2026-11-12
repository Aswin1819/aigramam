import { H, LAYOUT, STATUS_COLOR, W, hash, poseOf, rng, type SceneFrame, type VillagerFrame } from "../scene";
import type { StyleProto } from "../types";
import {
  R3, add, box, boxBetween, cylinder, desat, ground, hex, layer, madd, makeCamera, mixRGB, mul, norm, obox, poly, project, rgba, rig, rigLabel, sub,
  type Look, type Poly, type RGB, type Tex, type V3,
} from "./mini3d";

/**
 * 4 · PS2 Style: early-2000s console 3D. Everything is rendered into a
 * 320 × 180 buffer with snapped (wobbly) vertices, flat-shaded low-poly
 * meshes, faked brick/tile textures and distance fog, then scaled up softly.
 * Nameplates and the task bar are a crisp game HUD on top.
 */

const LW = 320, LH = 180;
const cam = makeCamera({ fov: 40, horizonY: LAYOUT.horizonY, height: 170 });

const FOG: RGB = [158, 166, 168];
const look: Look = {
  light: norm([-0.45, 0.75, -0.55]),
  lightColor: [0.72, 0.66, 0.56],
  ambient: [0.46, 0.47, 0.52],
  fog: { color: FOG, near: 420, k: 0.2, max: 0.82 },
  snap: 2, // one low-res pixel: vertices jitter as things move
  seam: 0.9,
};
const lookStatic: Look = { ...look, snap: 2 };

const mute = (s: string, k = 0.3): RGB => desat(hex(s), k);

// ── textures (painted in screen space, clipped to the face) ─────────────────
function bbox(pts: number[]) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (let i = 0; i < pts.length; i += 2) {
    x0 = Math.min(x0, pts[i]); x1 = Math.max(x1, pts[i]);
    y0 = Math.min(y0, pts[i + 1]); y1 = Math.max(y1, pts[i + 1]);
  }
  return { x0, y0, x1, y1 };
}
const brick = (row: number, col: number, alpha = 0.32): Tex => (ctx, pts, fog) => {
  const b = bbox(pts);
  ctx.fillStyle = `rgba(52,26,16,${alpha * (1 - fog)})`;
  let k = 0;
  for (let y = Math.floor(b.y0 / row) * row; y < b.y1; y += row, k++) {
    ctx.fillRect(b.x0, y, b.x1 - b.x0, 1.2);
    for (let x = b.x0 + ((k % 2) * col) / 2; x < b.x1; x += col) ctx.fillRect(x, y, 1.2, row);
  }
  ctx.fillStyle = `rgba(255,220,180,${0.08 * (1 - fog)})`;
  for (let y = Math.floor(b.y0 / row) * row + 1.2; y < b.y1; y += row) ctx.fillRect(b.x0, y, b.x1 - b.x0, 1);
};
const tiles: Tex = (ctx, pts, fog) => {
  const b = bbox(pts);
  ctx.fillStyle = `rgba(40,14,8,${0.4 * (1 - fog)})`;
  for (let y = b.y0; y < b.y1; y += 4) ctx.fillRect(b.x0, y, b.x1 - b.x0, 1.2);
  for (let x = b.x0; x < b.x1; x += 6) ctx.fillRect(x, b.y0, 1, b.y1 - b.y0);
};
const planks: Tex = (ctx, pts, fog) => {
  const b = bbox(pts);
  ctx.fillStyle = `rgba(30,18,10,${0.35 * (1 - fog)})`;
  for (let x = b.x0; x < b.x1; x += 5) ctx.fillRect(x, b.y0, 1, b.y1 - b.y0);
};
const speckle = (seed: number, light: string, dark: string, n = 6): Tex => (ctx, pts) => {
  const b = bbox(pts);
  const r = rng(seed);
  for (let i = 0; i < n; i++) {
    ctx.fillStyle = i % 2 ? light : dark;
    ctx.fillRect(Math.round((b.x0 + r() * (b.x1 - b.x0)) / 2) * 2, Math.round((b.y0 + r() * (b.y1 - b.y0)) / 2) * 2, 2, 2);
  }
};

// ── static set ──────────────────────────────────────────────────────────────
function palm(x: number, baseY: number, h: number, lean: number, seed: number, segs = 4, fronds = 7): Poly[] {
  const g = ground(cam, x, baseY);
  const s = g.s;
  const out: Poly[] = [];
  const trunk: RGB = [118, 100, 80];
  const P = (t: number): V3 => add(g.p, [lean * h * s * t * t, h * s * t, 0]);
  for (let i = 0; i < segs; i++) out.push(...cylinder(P(i / segs), P((i + 1) / segs), (3.4 - i * 0.35) * s, (3.4 - (i + 1) * 0.35) * s, 5, mixRGB(trunk, [90, 76, 60], (i % 2) * 0.5), undefined, { top: false }));
  const top = P(1);
  const L = h * 0.36 * s;
  for (let k = 0; k < fronds; k++) {
    const a = (k / fronds) * Math.PI * 2 + seed;
    const dir: V3 = [Math.cos(a), 0, Math.sin(a) * 0.85];
    const sd = norm([-dir[2], 0, dir[0]]);
    const col: RGB = mixRGB([64, 104, 58], [96, 122, 62], hash(seed * 9 + k));
    const node = (u: number): V3 => madd(madd(top, dir, L * u), [0, 1, 0], L * (0.32 * Math.sin(Math.PI * u * 0.9) - 0.6 * u * u));
    const wid = (u: number) => L * 0.15 * Math.sin(Math.PI * (0.12 + 0.88 * u)) + L * 0.02;
    for (let i = 0; i < 3; i++) {
      const u0 = i / 3, u1 = (i + 1) / 3;
      const a0 = node(u0), a1 = node(u1);
      out.push(poly([madd(a0, sd, -wid(u0)), madd(a0, sd, wid(u0)), madd(a1, sd, wid(u1)), madd(a1, sd, -wid(u1))], col, { double: true }));
    }
    out.push(poly([madd(node(1), sd, -wid(1)), madd(node(1), sd, wid(1)), madd(node(1.12), [0, 0, 0], 0)], col, { double: true }));
  }
  // Coconuts.
  for (let k = 0; k < 3; k++) {
    const a = k * 2.1 + seed;
    out.push(...box(add(top, [Math.cos(a) * 2.6 * s - 1.6 * s, -4.5 * s, Math.sin(a) * 2.6 * s - 1.6 * s]), add(top, [Math.cos(a) * 2.6 * s + 1.6 * s, -1.4 * s, Math.sin(a) * 2.6 * s + 1.6 * s]), [92, 70, 40]));
  }
  return out;
}

function shop(): { polys: Poly[]; board: V3; glasses: V3[] } {
  const sh = LAYOUT.shop;
  const base = sh.y + sh.h; // 270
  const g0 = ground(cam, sh.x, base), g1 = ground(cam, sh.x + sh.w, base);
  const s = g0.s, z0 = g0.p[2], x0 = g0.p[0], x1 = g1.p[0];
  const D = 64 * s, h = sh.h * s;
  const X = (lx: number) => g0.p[0] + (lx - sh.x) * s; // logical x → world x on the shop front
  const out: Poly[] = [];
  const wall = mute("#b8704e", 0.35);
  out.push(...box([x0, 0, z0], [x1, h, z0 + D], wall, { tex: brick(4, 10) }));
  // Plinth.
  out.push(...box([x0 - 3 * s, 0, z0 - 3 * s], [x1 + 3 * s, 5 * s, z0 + D], [120, 112, 100], { tex: brick(3, 14, 0.25) }));
  // Doorway (dark opening) with a wooden frame.
  const dX0 = X(sh.doorX - 12), dX1 = X(sh.doorX + 12), dTop = (sh.h - 22) * s;
  out.push(...box([dX0 - 2 * s, 5 * s, z0 - 1.2 * s], [dX1 + 2 * s, dTop + 2 * s, z0 - 0.2 * s], [96, 66, 40], { tex: planks }));
  out.push(...box([dX0, 5 * s, z0 - 1.6 * s], [dX1, dTop, z0 - 1.2 * s], [36, 28, 24], { flat: true }));
  // Window with bars.
  const wX0 = X(194), wX1 = X(226);
  out.push(...box([wX0 - 2 * s, 30 * s, z0 - 1 * s], [wX1 + 2 * s, 56 * s, z0 - 0.2 * s], [96, 66, 40]));
  out.push(...box([wX0, 32 * s, z0 - 1.4 * s], [wX1, 54 * s, z0 - 1 * s], [44, 36, 30], { flat: true }));
  for (let i = 1; i < 4; i++) out.push(...box([wX0 + ((wX1 - wX0) * i) / 4 - 1 * s, 32 * s, z0 - 2.2 * s], [wX0 + ((wX1 - wX0) * i) / 4 + 1 * s, 54 * s, z0 - 1.4 * s], [110, 78, 48]));
  // Counter in front of the left half, glasses on top.
  const cX0 = X(sh.x + 6), cX1 = X(sh.x + 70), cH = 24 * s;
  out.push(...box([cX0, 0, z0 - 16 * s], [cX1, cH, z0], [122, 86, 54], { tex: planks }));
  out.push(...box([cX0 - 1.5 * s, cH, z0 - 17 * s], [cX1 + 1.5 * s, cH + 2 * s, z0 + 0.5 * s], [150, 112, 70]));
  const glasses: V3[] = [];
  for (let i = 0; i < 3; i++) {
    const gx = X(sh.x + 20 + i * 14);
    const gb: V3 = [gx, cH + 2 * s, z0 - 8 * s];
    out.push(...cylinder(gb, add(gb, [0, 7 * s, 0]), 2 * s, 2.5 * s, 6, [176, 116, 64]));
    glasses.push(add(gb, [0, 8 * s, 0]));
  }
  // Big tea urn on the counter.
  const ub: V3 = [X(sh.x + 60), cH + 2 * s, z0 - 9 * s];
  out.push(...cylinder(ub, add(ub, [0, 14 * s, 0]), 5 * s, 4.5 * s, 7, [170, 150, 110]));
  out.push(...cylinder(add(ub, [0, 14 * s, 0]), add(ub, [0, 17 * s, 0]), 3 * s, 1 * s, 7, [150, 130, 96]));
  // Name board.
  const bX0 = X(sh.x + 12), bX1 = X(sh.x + 68);
  out.push(...box([bX0, 50 * s, z0 - 2.5 * s], [bX1, 64 * s, z0 - 0.3 * s], [58, 74, 60]));
  const board: V3 = [(bX0 + bX1) / 2, 57 * s, z0 - 2.5 * s];
  // Front posts holding the roof's overhang.
  const zF = z0 - 12 * s, eave = h - 4 * s;
  for (const px of [x0 - 8 * s, x1 + 8 * s]) out.push(...box([px - 2 * s, 0, zF - 2 * s], [px + 2 * s, eave, zF + 2 * s], [104, 74, 46], { tex: planks }));
  // Gable roof, ridge running back from the front gable.
  const eL = x0 - 14 * s, eR = x1 + 14 * s, apexX = (x0 + x1) / 2, apexY = h + sh.roofH * s;
  const zB = z0 + D + 10 * s;
  const roof = mute("#a2533a", 0.3);
  const slope = (ex: number) => {
    const p = poly([[ex, eave, zF], [apexX, apexY, zF], [apexX, apexY, zB], [ex, eave, zB]], roof, { tex: tiles });
    if (p.n[1] < 0) p.n = mul(p.n, -1);
    return p;
  };
  out.push(slope(eL), slope(eR));
  const gable: RGB = [176, 150, 112];
  out.push(poly([[eL + 4 * s, eave + 1 * s, zF + 0.6 * s], [eR - 4 * s, eave + 1 * s, zF + 0.6 * s], [apexX, apexY - 3 * s, zF + 0.6 * s]], gable, { tex: planks }, [0, 0, -1]));
  // Fascia boards along the gable edges.
  out.push(...boxBetween([eL, eave, zF - 0.8 * s], [apexX, apexY, zF - 0.8 * s], [0, 0, 1], 3 * s, 2 * s, [92, 60, 38]));
  out.push(...boxBetween([apexX, apexY, zF - 0.8 * s], [eR, eave, zF - 0.8 * s], [0, 0, 1], 3 * s, 2 * s, [92, 60, 38]));
  return { polys: out, board, glasses };
}

function lamps(): { polys: Poly[]; tops: V3[] } {
  const L = LAYOUT.lamps;
  const out: Poly[] = [];
  const tops: V3[] = [];
  const brass: RGB = [182, 146, 74];
  for (let i = 0; i < L.count; i++) {
    const g = ground(cam, L.x0 + i * L.dx, L.y + 22);
    const s = g.s, b = g.p;
    out.push(...cylinder(b, add(b, [0, 3 * s, 0]), 6 * s, 3.5 * s, 6, brass));
    out.push(...cylinder(add(b, [0, 3 * s, 0]), add(b, [0, 19 * s, 0]), 1.3 * s, 1.1 * s, 5, brass, undefined, { top: false }));
    out.push(...cylinder(add(b, [0, 10 * s, 0]), add(b, [0, 12 * s, 0]), 2.4 * s, 2.4 * s, 5, brass));
    out.push(...cylinder(add(b, [0, 19 * s, 0]), add(b, [0, 22 * s, 0]), 1.5 * s, 5.5 * s, 6, brass));
    tops.push(add(b, [0, 22 * s, 0]));
  }
  return { polys: out, tops };
}

function sign(): { polys: Poly[]; center: V3 } {
  const S = LAYOUT.sign;
  const g = ground(cam, S.x, S.y + 40);
  const s = g.s, b = g.p;
  const wood: RGB = [110, 80, 52];
  const out = [
    ...box(add(b, [-1.6 * s, 0, -1.6 * s]), add(b, [1.6 * s, 40 * s, 1.6 * s]), wood, { tex: planks }),
    ...box(add(b, [-31 * s, 37 * s, -3.2 * s]), add(b, [31 * s, 53 * s, -1.4 * s]), [70, 52, 36]),
    ...box(add(b, [-29 * s, 38.5 * s, -3.6 * s]), add(b, [29 * s, 51.5 * s, -3.2 * s]), [214, 196, 150]),
  ];
  return { polys: out, center: add(b, [0, 45 * s, -3.6 * s]) };
}

// ── cached layers (320 × 180, the console's buffer size) ───────────────────
let bg: HTMLCanvasElement | null = null;
let fg: HTMLCanvasElement | null = null;
let low: { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } | null = null;
let lampTops: V3[] = [];
let boardAt = { x: 0, y: 0 }, signAt = { x: 0, y: 0 };
let interlace: HTMLCanvasElement | null = null;
let mid: { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } | null = null;

function buildBg() {
  const { canvas, ctx } = layer(LW, LH);
  // Sky: hazy late-afternoon gradient, hard-banded like a 16-bit gradient.
  const bands = 14;
  for (let i = 0; i < bands; i++) {
    const t = i / (bands - 1);
    ctx.fillStyle = rgba(mixRGB([92, 116, 146], FOG, Math.pow(t, 1.4)));
    ctx.fillRect(0, (i * 152) / bands, W, 152 / bands + 1);
  }
  // Dim sun and low-poly clouds.
  ctx.fillStyle = "rgba(240,226,190,0.55)";
  ctx.beginPath();
  for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; ctx.lineTo(500 + Math.cos(a) * 14, 70 + Math.sin(a) * 14); }
  ctx.fill();
  const r = rng(44);
  for (let c = 0; c < 5; c++) {
    const cx = r() * W, cy = 30 + r() * 60, cw = 50 + r() * 60;
    ctx.fillStyle = `rgba(214,218,216,${0.45 + r() * 0.2})`;
    ctx.beginPath();
    ctx.moveTo(cx - cw / 2, cy + 6);
    for (let k = 0; k <= 6; k++) ctx.lineTo(cx - cw / 2 + (k / 6) * cw, cy - 4 - r() * 9 * Math.sin((k / 6) * Math.PI));
    ctx.lineTo(cx + cw / 2, cy + 6);
    ctx.fill();
  }
  // Far hills, two fogged jagged layers.
  for (const [k, col] of [[0, [124, 138, 140]], [1, [110, 128, 122]]] as const) {
    ctx.fillStyle = rgba(col as unknown as RGB);
    ctx.beginPath();
    ctx.moveTo(0, 152);
    const rr = rng(10 + k);
    for (let x = 0; x <= W; x += 40) ctx.lineTo(x, 150 - (k ? 6 : 14) - rr() * (k ? 8 : 12));
    ctx.lineTo(W, 152);
    ctx.fill();
  }

  const r3 = new R3(cam, lookStatic);
  // Far bank (screen-space columns so it spans the width) and water.
  const strip = (syNear: number, syFar: number, cols: number, col: (i: number) => RGB, opts?: Poly["o"]) => {
    for (let i = 0; i < cols; i++) {
      const xa = -40 + (i * 720) / cols, xb = -40 + ((i + 1) * 720) / cols;
      r3.add([{ v: [ground(cam, xa, syNear).p, ground(cam, xb, syNear).p, ground(cam, xb, syFar).p, ground(cam, xa, syFar).p], n: [0, 1, 0], c: col(i), o: opts }], -2);
    }
  };
  strip(156, 150.6, 8, () => [92, 112, 80]);
  const waterRows = [196, 189, 182, 175, 168, 162, 156];
  for (let k = 0; k < waterRows.length - 1; k++) strip(waterRows[k], waterRows[k + 1], 12, (i) => mixRGB([54, 92, 98], [66, 104, 108], hash(i * 3 + k * 17)));
  for (let i = 0; i < LAYOUT.farPalms.length; i++) r3.add(palm(LAYOUT.farPalms[i], 155, 34, 0.05, i * 1.7, 2, 5), -1);

  // Ground: world-space tiles (grass, a shore strip, the dirt path).
  const rows = [372, 350, 330, 310, 288, 270, 254, 240, 228, 218, 209, 202, 196];
  for (let k = 0; k < rows.length - 1; k++) {
    const za = ground(cam, W / 2, rows[k]).p[2], zb = ground(cam, W / 2, rows[k + 1]).p[2];
    const path = rows[k] <= 350 && rows[k] > 288;
    const shore = rows[k + 1] === 196;
    const G = 80;
    for (let x = -1040; x < 1700; x += G) {
      const n = hash(x * 0.37 + k * 11.3);
      const col: RGB = shore ? mixRGB([120, 112, 84], [108, 100, 76], n) : path ? mixRGB([150, 128, 96], [138, 116, 86], n) : mixRGB([96, 122, 70], [86, 112, 64], (((x / G) | 0) + k) % 2 ? n * 0.4 : 0.6 + n * 0.4);
      const tex = path ? speckle(x + k * 97, "rgba(190,170,140,0.5)", "rgba(80,64,48,0.35)", 5) : speckle(x + k * 97, "rgba(150,170,100,0.45)", "rgba(40,64,36,0.4)", 7);
      r3.add([{ v: [[x, 0, za], [x + G, 0, za], [x + G, 0, zb], [x, 0, zb]], n: [0, 1, 0], c: col, o: { tex } }], -2);
    }
  }
  r3.render(ctx);
  return canvas;
}

function buildFg() {
  const { canvas, ctx } = layer(LW, LH);
  const r3 = new R3(cam, lookStatic);
  const S = shop();
  r3.add(S.polys);
  LAYOUT.palms.forEach((p, i) => r3.add(palm(p.x, p.baseY, p.h, p.lean, i * 2.3 + 0.4)));
  const lp = lamps();
  lampTops = lp.tops;
  for (const l of lp.polys) r3.add([l]);
  const sg = sign();
  r3.add(sg.polys);
  r3.render(ctx);
  boardAt = project(cam, S.board);
  signAt = project(cam, sg.center);
  return canvas;
}

/** Sign lettering, drawn at screen resolution so it stays legible (like a sharper decal texture). */
function lettering(ctx: CanvasRenderingContext2D) {
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = "bold 7px Verdana, Tahoma, sans-serif";
  ctx.fillStyle = "rgba(0,0,0,0.5)";
  ctx.fillText("CHAYA KADA", boardAt.x + 0.6, boardAt.y + 0.6);
  ctx.fillStyle = "#eadfb8";
  ctx.fillText("CHAYA KADA", boardAt.x, boardAt.y);
  ctx.font = "bold 7.5px Verdana, Tahoma, sans-serif";
  ctx.fillStyle = "#4a3624";
  ctx.fillText(LAYOUT.sign.text, signAt.x, signAt.y);
  ctx.textBaseline = "alphabetic";
}

function buildInterlace() {
  const { canvas, ctx } = layer(W * 2, H * 2);
  ctx.fillStyle = "rgba(0,0,0,0.07)";
  for (let y = 0; y < H; y += 2) ctx.fillRect(0, y, W, 1);
  return canvas;
}

// ── dynamic bits ────────────────────────────────────────────────────────────
function canoe(r3: R3, f: SceneFrame) {
  const g = ground(cam, f.canoeX, 178);
  const s = g.s, b = g.p;
  const P = (x: number, y: number, z: number): V3 => add(b, [x * s, y * s, z * s]);
  const wood: RGB = [96, 66, 42], inner: RGB = [70, 48, 32];
  r3.begin(g.z);
  r3.add([poly([P(-22, 6, 0), P(-14, 3, 5), P(14, 3, 5), P(22, 6, 0), P(16, -1.5, 0), P(-16, -1.5, 0)], inner, { double: true }, [0, 0.3, -1])]);
  r3.add([{ v: [P(-14, 2, -5), P(14, 2, -5), P(14, 2, 5), P(-14, 2, 5)], n: [0, 1, 0], c: inner }]);
  // Rower: blocky body and head, oar swinging.
  const row = Math.sin(f.t * 2.2);
  r3.add(box(P(-3, 2, -2.5), P(3, 13, 2.5), [150, 70, 60]));
  r3.add(box(P(-2.6, 13, -2.4), P(2.6, 18.5, 2.4), [116, 80, 58]));
  r3.add(box(P(-2.8, 17.5, -2.6), P(2.8, 19.5, 2.6), [40, 32, 28]));
  r3.add(boxBetween(P(-1 + row * 6, 15, -4), P(4 + row * 9, -3, -6), [0, 0, 1], 1.4 * s, 1.4 * s, [130, 100, 66]));
  r3.add([poly([P(-22, 6, 0), P(-14, 3, -5), P(14, 3, -5), P(22, 6, 0), P(16, -1.5, 0), P(-16, -1.5, 0)], wood, { double: true }, [0, -0.2, -1])]);
  r3.end();
}

function celebratePose(v: VillagerFrame) {
  const p = poseOf(v);
  if (v.jump <= 0.02) return p;
  const k = Math.min(1, v.jump * 1.6);
  return { ...p, legF: 0.55 * k, kneeF: 1.1 * k, legB: -0.15 * k, kneeB: 0.9 * k };
}

function villager(r3: R3, v: VillagerFrame) {
  const R = rig(cam, v, { turn: 0.5, pose: celebratePose(v) });
  const { j, s, side, fwd, up } = R;
  if (v.jump > 0.02) {
    // Cheering: both arms thrown up in a V while in the air.
    const k = Math.min(1, v.jump * 1.6);
    const arm = (ang: number): [[number, number], [number, number]] => {
      const dx = Math.sin(ang), dy = -Math.cos(ang);
      const e: [number, number] = [j.shoulder[0] + dx * R.body.upperArm, j.shoulder[1] + dy * R.body.upperArm];
      return [e, [e[0] + dx * R.body.forearm, e[1] + dy * R.body.forearm]];
    };
    [j.elbowF, j.handF] = arm(0.3 + 2.5 * k);
    [j.elbowB, j.handB] = arm(-0.3 - 2.5 * k);
  }
  const L = (p: [number, number], z: number) => R.w([p[0], p[1], z]);
  const shirt = mute(v.shirt), mundu = mute(v.mundu), skin = mute(v.skin, 0.15);
  const hair: RGB = [34, 28, 26], sandal: RGB = [70, 50, 36];
  const AX: [V3, V3, V3] = [fwd, up, side];

  // Blob shadow (a classic of the era): a low-poly dark disc, smaller in the air.
  const sh = (1 - v.jump * 0.5) * 9 * s;
  const sv: V3[] = [];
  for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; sv.push(add(R.base, [Math.cos(a) * sh, 0.4, Math.sin(a) * sh * 0.8])); }
  r3.add([{ v: sv, n: [0, 1, 0], c: [20, 24, 20], o: { alpha: 0.5 - v.jump * 0.25, flat: true } }], -1);

  r3.begin(R.z);
  const limb = (a: [number, number], b: [number, number], z: number, wv: number, col: RGB) => r3.add(boxBetween(L(a, z), L(b, z), side, wv * s, wv * s, col));
  // Far arm and leg first.
  limb(j.shoulder, j.elbowB, -6.5, 3.8, shirt);
  limb(j.elbowB, j.handB, -6.5, 3.2, skin);
  limb(j.hip, j.kneeB, -3.2, 4.8, mundu);
  limb(j.kneeB, j.footB, -3.2, 3.8, skin);
  r3.add(obox(L([j.footB[0] + 1.8, j.footB[1] + 1], -3.2), AX, [3.2 * s, 1 * s, 2 * s], sandal));
  limb(j.hip, j.kneeF, 3.2, 4.8, mundu);
  limb(j.kneeF, j.footF, 3.2, 3.8, skin);
  r3.add(obox(L([j.footF[0] + 1.8, j.footF[1] + 1], 3.2), AX, [3.2 * s, 1 * s, 2 * s], sandal));
  // Mundu: knee-length wrap around the hips.
  r3.add(obox(L([0.3, j.hip[1] - 4], 0), AX, [6 * s, 7 * s, 6.6 * s], mundu));
  // Torso, belt line, head, hair, nose.
  r3.add(boxBetween(L([j.hip[0], j.hip[1] + 2], 0), L(j.neck, 0), side, 11 * s, 10 * s, shirt));
  r3.add(obox(L([j.head[0], j.head[1] - 0.5], 0), AX, [4.4 * s, 5 * s, 4.2 * s], skin));
  r3.add(obox(L([j.head[0] - 0.8, j.head[1] + 3.6], 0), AX, [4.8 * s, 1.8 * s, 4.6 * s], hair));
  r3.add(obox(L([j.head[0] - 3.4, j.head[1] + 0.5], 0), AX, [1.6 * s, 4 * s, 4.5 * s], hair));
  r3.add(obox(L([j.head[0] + 4.8, j.head[1] - 0.5], 0), AX, [0.8 * s, 1.2 * s, 0.9 * s], mixRGB(skin, [0, 0, 0], 0.15)));
  // Near arm.
  limb(j.shoulder, j.elbowF, 6.5, 3.8, shirt);
  limb(j.elbowF, j.handF, 6.5, 3.2, skin);
  if (v.carry === "laptop") {
    const hp = L([j.handF[0] - 4, j.handF[1] + 1], 2);
    r3.add(obox(hp, AX, [6 * s, 0.8 * s, 5 * s], [70, 72, 78]));
    const hinge = madd(hp, fwd, 6 * s, up, 0.8 * s);
    const lidTop = madd(hinge, fwd, 3 * s, up, 9.5 * s);
    r3.add(boxBetween(hinge, lidTop, side, 1 * s, 10 * s, [88, 92, 100]));
    const n = norm(sub(mul(fwd, -1), mul(up, 0.3)));
    const q = (a: V3, k: number) => madd(madd(a, side, k * 4.2 * s), n, 0.7 * s);
    r3.add([{ v: [q(hinge, -1), q(hinge, 1), q(lidTop, 1), q(lidTop, -1)], n, c: [90, 170, 190], o: { emissive: 0.9 } }]);
  } else if (v.carry === "glass") {
    const gb = L([j.handF[0], j.handF[1] - 2], 6.5);
    r3.add(cylinder(gb, madd(gb, up, 9 * s), 2.4 * s, 3 * s, 6, [206, 140, 74]));
    r3.add(cylinder(madd(gb, up, 9 * s), madd(gb, up, 10 * s), 3 * s, 3.1 * s, 6, [236, 214, 170]));
  }
  r3.end();
  return R;
}

function flames(ctx: CanvasRenderingContext2D, f: SceneFrame) {
  for (let i = 0; i < lampTops.length; i++) {
    const lit = Math.max(0, Math.min(1, f.lampsLit - i));
    if (lit <= 0) continue;
    const p = project(cam, lampTops[i]);
    const fl = 1 + (hash(i * 7 + Math.floor(f.t * 15)) - 0.5) * 0.35;
    const x = Math.round(p.x / 2) * 2, y = Math.round(p.y / 2) * 2;
    ctx.globalCompositeOperation = "lighter";
    const g = ctx.createRadialGradient(x, y - 4, 0, x, y - 4, 16 * lit);
    g.addColorStop(0, `rgba(255,170,70,${0.55 * lit})`);
    g.addColorStop(1, "rgba(255,120,40,0)");
    ctx.fillStyle = g;
    ctx.fillRect(x - 18, y - 22, 36, 36);
    // Warm pool of light on the ground.
    ctx.fillStyle = `rgba(255,150,60,${0.12 * lit})`;
    ctx.beginPath();
    ctx.ellipse(x, y + 24, 12, 3, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalCompositeOperation = "source-over";
    // Billboard flame: two stacked diamonds.
    const h = 9 * fl * lit;
    ctx.fillStyle = "#ff8a2a";
    ctx.beginPath(); ctx.moveTo(x, y - h); ctx.lineTo(x + 2.5, y - 2); ctx.lineTo(x, y); ctx.lineTo(x - 2.5, y - 2); ctx.fill();
    ctx.fillStyle = "#ffe08a";
    ctx.beginPath(); ctx.moveTo(x, y - h * 0.6); ctx.lineTo(x + 1.2, y - 2); ctx.lineTo(x, y); ctx.lineTo(x - 1.2, y - 2); ctx.fill();
  }
}

function shimmer(ctx: CanvasRenderingContext2D, t: number) {
  const r = rng(91);
  for (let i = 0; i < 18; i++) {
    const y = 158 + r() * 36;
    const sp = 6 + r() * 10;
    const w = 6 + r() * 14 * ((y - 150) / 46);
    const x = ((r() * (W + 40) + t * sp) % (W + 40)) - 20;
    ctx.fillStyle = `rgba(190,214,210,${0.18 + 0.12 * Math.sin(t * 2 + i)})`;
    ctx.fillRect(Math.round(x / 2) * 2, Math.round(y / 2) * 2, Math.round(w / 2) * 2, 2);
  }
}

// ── HUD ─────────────────────────────────────────────────────────────────────
interface Plate { v: VillagerFrame; x: number; y: number; w: number; h: number }

function bevel(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, edge: string) {
  ctx.fillStyle = "rgba(12,18,40,0.78)";
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = "rgba(255,255,255,0.35)";
  ctx.fillRect(x, y, w, 1);
  ctx.fillRect(x, y, 1, h);
  ctx.fillStyle = "rgba(0,0,0,0.6)";
  ctx.fillRect(x, y + h - 1, w, 1);
  ctx.fillRect(x + w - 1, y, 1, h);
  ctx.strokeStyle = edge;
  ctx.lineWidth = 1;
  ctx.strokeRect(x - 0.5, y - 0.5, w + 1, h + 1);
}

function plates(ctx: CanvasRenderingContext2D, f: SceneFrame, anchors: { v: VillagerFrame; x: number; y: number }[]) {
  ctx.textBaseline = "alphabetic";
  const NAME = "bold 8px Verdana, Tahoma, sans-serif";
  const TEXT = "bold 8.5px Verdana, Tahoma, sans-serif";
  const list: Plate[] = anchors.map(({ v, x, y }) => {
    ctx.font = TEXT;
    const tw = ctx.measureText(v.label).width + (v.status === "waiting" ? 14 : 0);
    ctx.font = NAME;
    const w = Math.max(tw, ctx.measureText(v.name).width) + 12;
    const h = 24;
    return { v, x: Math.max(4, Math.min(W - 4 - w, x - w / 2)), y: y - h, w, h };
  });
  // Keep plates apart: nearer villagers (lower on screen) keep their spot.
  list.sort((a, b) => b.v.y - a.v.y);
  for (let i = 0; i < list.length; i++)
    for (let k = 0; k < i; k++) {
      const a = list[i], b = list[k];
      if (a.x < b.x + b.w + 3 && b.x < a.x + a.w + 3 && a.y < b.y + b.h + 3 && b.y < a.y + a.h + 3) a.y = b.y - a.h - 4;
    }
  for (const p of list) {
    const { v } = p;
    const urgent = v.status === "waiting";
    const sc = STATUS_COLOR[v.status];
    const edge = urgent ? `rgba(255,90,79,${0.45 + 0.55 * f.pulse})` : "rgba(160,170,200,0.6)";
    bevel(ctx, p.x, p.y, p.w, p.h, edge);
    // State stripe on the left.
    ctx.fillStyle = sc;
    ctx.fillRect(p.x + 1, p.y + 1, 2.5, p.h - 2);
    ctx.textAlign = "left";
    ctx.font = NAME;
    ctx.fillStyle = "#ffd75e";
    ctx.fillText(v.name.toUpperCase(), p.x + 7, p.y + 10);
    ctx.font = TEXT;
    let tx = p.x + 7;
    if (urgent) {
      ctx.fillStyle = `rgba(255,90,79,${0.6 + 0.4 * f.pulse})`;
      ctx.fillRect(tx, p.y + 13.5, 10, 9);
      ctx.fillStyle = "#fff";
      ctx.textAlign = "center";
      ctx.fillText("!", tx + 5, p.y + 21);
      ctx.textAlign = "left";
      tx += 14;
    }
    ctx.fillStyle = urgent ? `rgba(255,${190 + 65 * (1 - f.pulse)},${180 + 75 * (1 - f.pulse)},1)` : "#f2f4ff";
    ctx.fillText(v.label, tx, p.y + 21);
    // Pointer down to the head.
    const ax = Math.max(p.x + 6, Math.min(p.x + p.w - 6, p.x + p.w / 2));
    ctx.fillStyle = "rgba(12,18,40,0.78)";
    ctx.beginPath();
    ctx.moveTo(ax - 4, p.y + p.h);
    ctx.lineTo(ax + 4, p.y + p.h);
    ctx.lineTo(ax, p.y + p.h + 5);
    ctx.fill();
  }
}

function taskBar(ctx: CanvasRenderingContext2D, f: SceneFrame) {
  const x = 10, y = 334, w = 200, h = 18;
  bevel(ctx, x, y, w, h, "rgba(160,170,200,0.6)");
  ctx.font = "bold 7.5px Verdana, Tahoma, sans-serif";
  ctx.textAlign = "left";
  ctx.fillStyle = "#ffd75e";
  ctx.fillText("TASK", x + 5, y + 12);
  const bx = x + 34, bw = 120, segs = 12;
  ctx.fillStyle = "rgba(0,0,0,0.6)";
  ctx.fillRect(bx, y + 5, bw, 8);
  const filled = f.progress * segs;
  for (let i = 0; i < segs; i++) {
    const k = Math.max(0, Math.min(1, filled - i));
    if (k <= 0) continue;
    const sx = bx + 1 + i * (bw / segs);
    const g = ctx.createLinearGradient(0, y + 6, 0, y + 12);
    g.addColorStop(0, "#9ff5e6");
    g.addColorStop(1, "#1f9e8c");
    ctx.fillStyle = g;
    ctx.fillRect(sx, y + 6, (bw / segs - 2) * k, 6);
  }
  ctx.fillStyle = "#f2f4ff";
  ctx.textAlign = "right";
  ctx.fillText(`${Math.round(f.progress * 100)}%`, x + w - 6, y + 12);
}

export const ps2: StyleProto = {
  id: "ps2",
  n: 4,
  name: "PS2 Style",
  blurb: "Early-2000s console 3D: low-poly flat-shaded blocks, faked brick and tile textures, fog, wobbly snapped vertices and a soft 320×180 upscale, with a game-HUD nameplate per villager.",
  fps: 30,
  bg: "#5c7088",
  draw(ctx, f) {
    if (!low) low = layer(LW, LH);
    if (!bg) bg = buildBg();
    if (!fg) fg = buildFg();
    if (!interlace) interlace = buildInterlace();
    const g = low.ctx;
    g.imageSmoothingEnabled = false;
    g.drawImage(bg, 0, 0, W, H);
    shimmer(g, f.t);
    const r3 = new R3(cam, look);
    canoe(r3, f);
    r3.render(g);
    g.drawImage(fg, 0, 0, W, H);
    flames(g, f);
    const anchors = f.villagers.map((v) => {
      const R = villager(r3, v);
      const p = rigLabel(cam, R, 8);
      return { v, x: p.x, y: p.y };
    });
    r3.render(g);

    // Upscale the console buffer in two steps: a soft 2× (composite-video bleed), then hard pixels.
    if (!mid) mid = layer(W, H);
    mid.ctx.imageSmoothingEnabled = true;
    mid.ctx.imageSmoothingQuality = "low";
    mid.ctx.drawImage(low.canvas, 0, 0, W, H);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(mid.canvas, 0, 0, W, H);
    ctx.imageSmoothingEnabled = true;
    lettering(ctx);
    ctx.drawImage(interlace, 0, 0, W, H);
    plates(ctx, f, anchors);
    taskBar(ctx, f);
  },
};
