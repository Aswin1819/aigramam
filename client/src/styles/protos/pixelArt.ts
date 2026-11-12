import { H, LAYOUT, STATUS_COLOR, W, labelAnchor, rng, skeleton, type SceneFrame, type VillagerFrame } from "../scene";
import type { StyleProto } from "../types";

/**
 * 1 · Pixel Art: a retro 16-bit game. The scene is painted into a tiny
 * 214 × 120 canvas with a limited indigo-night palette, then upscaled with
 * smoothing off so every pixel stays a crisp square. A game HUD (task counter,
 * XP bar, hearts, quest banner) and pixel-font labels sit on top.
 */

const PW = 214;
const PH = 120;
const S = W / PW; // ≈ 3 logical units per pixel
const px = (v: number) => Math.round(v / S);

// Limited palette.
const C = {
  ink: "#0d0820",
  sky0: "#120a2a", sky1: "#1c1240", sky2: "#2a1a5a", sky3: "#3d2577", sky4: "#5b3190", sky5: "#7a3f9e",
  star: "#fff2c8", moon: "#ffe9b0", moonD: "#e3c486",
  shore: "#1a1238", farPalm: "#2a1d55",
  water0: "#1f2b70", water1: "#2a3a8f", water2: "#5a78d8", waterHi: "#a9c0ff",
  grass0: "#241d48", grass1: "#2f2660", grass2: "#3b3176",
  path0: "#4a3a72", path1: "#5c4a88", path2: "#382c5c",
  wall: "#6e3d3a", wallD: "#552c30", roof: "#c0503f", roofD: "#8f3434", roofL: "#e0715a",
  wood: "#3a2028", gold: "#ffd35a", warm: "#ffb050", warmD: "#d8762e", dark: "#24122c",
  trunk: "#7a5a7a", trunkD: "#553d5c", leaf: "#2e8a5e", leafL: "#4cc27e", leafD: "#1f5e4a", coco: "#8a5a2a",
  brass: "#d89a3a", brassD: "#9a6424", flame: "#ffe35a", flameO: "#ff8a2a",
  hull: "#7a4a2e", hullD: "#4e2c1c",
  white: "#f4efe2", grey: "#9aa3c0", greyD: "#5b6386", screen: "#7df0ff",
  hair: "#1a0f1a", tea: "#c06a2a", glass: "#e8e0ff",
  red: "#ff3b5c", redD: "#a3122e", green: "#4ade80", greenD: "#15803d",
};

// ── tiny 3×5 bitmap font ─────────────────────────────────────────────────────

const GLYPHS: Record<string, string> = {
  A: "010101111101101", B: "110101110101110", C: "011100100100011", D: "110101101101110",
  E: "111100110100111", F: "111100110100100", G: "011100101101011", H: "101101111101101",
  I: "111010010010111", J: "001001001101010", K: "101101110101101", L: "100100100100111",
  M: "101111101101101", N: "110101101101101", O: "010101101101010", P: "110101110100100",
  Q: "010101101110011", R: "110101110101101", S: "011100010001110", T: "111010010010010",
  U: "101101101101111", V: "101101101101010", W: "101101111111101", X: "101101010101101",
  Y: "101101010010010", Z: "111001010100111",
  "0": "111101101101111", "1": "010110010010111", "2": "110001010100111", "3": "110001010001110",
  "4": "101101111001001", "5": "111100110001110", "6": "011100111101111", "7": "111001010010010",
  "8": "111101111101111", "9": "111101111001110",
  ".": "000000000000010", "·": "000000010000000", "/": "001001010100100", ":": "000010000010000",
  "-": "000000111000000", "!": "010010010000010", ">": "100010001010100", " ": "000000000000000",
};
// Wider glyphs: [width, bits].
const WIDE: Record<string, [number, string]> = {
  "✓": [5, "00000" + "00001" + "00010" + "10100" + "01000"],
  M: [5, "10001" + "11011" + "10101" + "10001" + "10001"],
  W: [5, "10001" + "10001" + "10101" + "11011" + "10001"],
  N: [4, "1001" + "1101" + "1011" + "1001" + "1001"],
};

function glyph(ch: string): [number, string] {
  const wide = WIDE[ch] ?? WIDE[ch.toUpperCase()];
  if (wide) return wide;
  return [3, GLYPHS[ch.toUpperCase()] ?? GLYPHS[" "]];
}
function textWidth(s: string) {
  let w = 0;
  for (const ch of s) w += glyph(ch)[0] + 1;
  return Math.max(0, w - 1);
}
/** Paint text pixel by pixel (1 font pixel = `k` units of the target context). */
function pixelText(c: CanvasRenderingContext2D, s: string, x: number, y: number, color: string, k = 1) {
  c.fillStyle = color;
  x = Math.round(x); y = Math.round(y);
  let cx = x;
  for (const ch of s) {
    const [gw, bits] = glyph(ch);
    for (let i = 0; i < bits.length; i++) if (bits[i] === "1") c.fillRect(cx + (i % gw) * k, y + Math.floor(i / gw) * k, k, k);
    cx += (gw + 1) * k;
  }
}

/** Cached outlined text sprites (1px per font pixel), drawn scaled up later. */
const textCache = new Map<string, HTMLCanvasElement>();
function textSprite(s: string, color: string, outline = C.ink) {
  const key = `${s}|${color}|${outline}`;
  let cnv = textCache.get(key);
  if (cnv) return cnv;
  cnv = document.createElement("canvas");
  cnv.width = textWidth(s) + 2;
  cnv.height = 7;
  const c = cnv.getContext("2d")!;
  for (const [dx, dy] of [[0, 1], [2, 1], [1, 0], [1, 2], [2, 2]]) pixelText(c, s, dx, dy, outline);
  pixelText(c, s, 1, 1, color);
  textCache.set(key, cnv);
  return cnv;
}
/** Draw outlined pixel text on the main (logical) context; `k` = units per font pixel. */
function hudText(ctx: CanvasRenderingContext2D, s: string, x: number, y: number, color: string, k = 2, align: "left" | "center" | "right" = "left") {
  const spr = textSprite(s, color);
  const w = spr.width * k;
  const lx = align === "center" ? x - w / 2 : align === "right" ? x - w : x;
  ctx.drawImage(spr, Math.round(lx), Math.round(y), w, spr.height * k);
}

// ── low-res drawing helpers ──────────────────────────────────────────────────

function rect(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, col: string) {
  c.fillStyle = col;
  c.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
}
/** Bresenham line of square pixels. */
function pline(c: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, col: string, w = 1) {
  x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
  c.fillStyle = col;
  const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  const o = Math.floor((w - 1) / 2);
  for (let n = 0; n < 400; n++) {
    c.fillRect(x0 - o, y0 - o, w, w);
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x0 += sx; }
    if (e2 <= dx) { err += dx; y0 += sy; }
  }
}
function disc(c: CanvasRenderingContext2D, cx: number, cy: number, r: number, col: string) {
  c.fillStyle = col;
  for (let y = -r; y <= r; y++) {
    const hw = Math.floor(Math.sqrt(r * r - y * y + r * 0.6));
    c.fillRect(cx - hw, cy + y, hw * 2 + 1, 1);
  }
}
/** Checkerboard dither row between two colours. */
function ditherRow(c: CanvasRenderingContext2D, y: number, col: string, x0 = 0, x1 = PW, odd = 0) {
  c.fillStyle = col;
  for (let x = x0 + ((y + odd) % 2); x < x1; x += 2) c.fillRect(x, y, 1, 1);
}

// ── static background (low-res, built once) ──────────────────────────────────

let bgCanvas: HTMLCanvasElement | null = null;
let frameCanvas: HTMLCanvasElement | null = null;

function palm(c: CanvasRenderingContext2D, x: number, baseY: number, h: number, lean: number) {
  const bx = px(x), by = px(baseY), ph = px(h);
  const tx = bx + Math.round(lean * ph), ty = by - ph;
  // Trunk, 2px wide with ring marks.
  for (let i = 0; i <= ph; i++) {
    const k = i / ph;
    const xx = Math.round(bx + (tx - bx) * k * k);
    const yy = by - i;
    rect(c, xx, yy, 2, 1, i % 3 === 0 ? C.trunkD : C.trunk);
  }
  // Fronds: drooping arcs.
  const fronds = [[-1, 0.2], [-0.8, -0.3], [-0.35, -0.75], [0.35, -0.75], [0.8, -0.3], [1, 0.2], [0, -0.9]];
  for (const [dx, dy] of fronds) {
    const len = ph * 0.38;
    let lx = tx + 1, ly = ty;
    for (let s = 1; s <= 8; s++) {
      const k = s / 8;
      const nx = tx + 1 + dx * len * k;
      const ny = ty + dy * len * k * 0.7 + k * k * len * 0.55;
      pline(c, lx, ly, nx, ny, s < 3 ? C.leafL : C.leaf, 1);
      pline(c, lx, ly + 1, nx, ny + 1, C.leafD, 1);
      lx = nx; ly = ny;
    }
  }
  rect(c, tx, ty + 1, 2, 2, C.coco);
  rect(c, tx + 2, ty + 2, 1, 1, C.coco);
}

function buildBg() {
  const cnv = document.createElement("canvas");
  cnv.width = PW;
  cnv.height = PH;
  const c = cnv.getContext("2d")!;
  // Sky: banded with dithered seams.
  const sky = [C.sky0, C.sky1, C.sky2, C.sky3, C.sky4, C.sky5];
  const top = px(LAYOUT.horizonY);
  const band = top / sky.length;
  for (let i = 0; i < sky.length; i++) rect(c, 0, Math.floor(i * band), PW, Math.ceil(band) + 1, sky[i]);
  for (let i = 1; i < sky.length; i++) ditherRow(c, Math.floor(i * band) - 1, sky[i]), ditherRow(c, Math.floor(i * band), sky[i - 1], 0, PW, 1);
  // Moon with craters.
  disc(c, 186, 16, 6, C.moon);
  rect(c, 184, 13, 2, 2, C.moonD); rect(c, 188, 18, 2, 1, C.moonD); rect(c, 183, 19, 1, 1, C.moonD);
  // Far shore and far palms.
  rect(c, 0, top - 4, PW, 4, C.shore);
  for (let x = 0; x < PW; x += 2) if ((x * 7) % 5 < 2) rect(c, x, top - 5, 2, 1, C.shore);
  for (const fx of LAYOUT.farPalms) {
    const x = px(fx);
    pline(c, x, top - 4, x + 1, top - 13, C.farPalm);
    for (const [dx, dy] of [[-4, 1], [-3, -2], [3, -2], [4, 1], [0, -3]]) pline(c, x + 1, top - 13, x + 1 + dx, top - 13 + dy + 1, C.farPalm);
  }
  // Water.
  const wb = px(LAYOUT.waterBottom);
  rect(c, 0, top, PW, wb - top, C.water0);
  for (let y = top + 2; y < wb; y += 3) ditherRow(c, y, C.water1);
  // Ground.
  rect(c, 0, wb, PW, PH - wb, C.grass0);
  rect(c, 0, wb, PW, 1, C.grass2);
  ditherRow(c, wb + 1, C.grass1);
  const r = rng(11);
  for (let i = 0; i < 160; i++) {
    const x = Math.floor(r() * PW), y = wb + 2 + Math.floor(r() * (PH - wb - 2));
    rect(c, x, y, 1, 1, r() < 0.5 ? C.grass1 : C.grass2);
    if (r() < 0.3) rect(c, x + 1, y - 1, 1, 1, C.grass2);
  }
  // Dirt path the walker uses.
  const py0 = px(LAYOUT.pathY) - 6, py1 = px(LAYOUT.pathY) + 3;
  rect(c, 0, py0, PW, py1 - py0, C.path0);
  ditherRow(c, py0 - 1, C.path0);
  ditherRow(c, py1, C.path2);
  rect(c, 0, py1 + 1, PW, 1, C.path2);
  for (let i = 0; i < 60; i++) rect(c, Math.floor(r() * PW), py0 + Math.floor(r() * (py1 - py0)), r() < 0.5 ? 2 : 1, 1, r() < 0.6 ? C.path1 : C.path2);

  // Palms behind the shop.
  for (const p of LAYOUT.palms) palm(c, p.x, p.baseY, p.h, p.lean);

  // Tea shop.
  const sh = LAYOUT.shop;
  const sx = px(sh.x), sy = px(sh.y), sw = px(sh.w), shh = px(sh.h), rh = px(sh.roofH);
  rect(c, sx, sy, sw, shh, C.wall);
  for (let x = sx + 3; x < sx + sw; x += 4) rect(c, x, sy, 1, shh, C.wallD);
  rect(c, sx, sy + shh - 1, sw, 1, C.wallD);
  // Roof: stepped trapezoid with tile rows.
  for (let i = 0; i <= rh; i++) {
    const y = sy - rh + i + 1;
    const inset = Math.round(((rh - i) / rh) * 13) - 5;
    const x0 = sx + inset, x1 = sx + sw - inset;
    rect(c, x0, y, x1 - x0, 1, i % 3 === 2 ? C.roofD : C.roof);
    if (i % 3 === 0) for (let x = x0 + (i % 2) * 2; x < x1; x += 4) rect(c, x, y, 1, 1, C.roofL);
  }
  rect(c, sx - 5, sy, sw + 10, 1, C.roofD);
  // Board on the roof.
  const bw = textWidth("CHAYA KADA") + 4;
  const bx = sx + 1;
  rect(c, bx - 1, sy - 9, bw + 2, 9, C.ink);
  rect(c, bx, sy - 8, bw, 7, C.wood);
  pixelText(c, "CHAYA KADA", bx + 2, sy - 7, C.gold);
  // Counter window: warm interior, counter, glasses.
  const wx = sx + 3, wy = sy + 4;
  rect(c, wx, wy, 20, 11, C.dark);
  ditherRow(c, wy + 1, C.warmD, wx, wx + 20);
  rect(c, wx + 9, wy + 1, 2, 2, C.warm);
  rect(c, wx - 1, wy + 11, 22, 2, C.warmD);
  rect(c, wx - 1, wy + 13, 22, 1, C.wallD);
  for (let i = 0; i < 3; i++) {
    rect(c, wx + 3 + i * 6, wy + 8, 2, 3, C.glass);
    rect(c, wx + 3 + i * 6, wy + 9, 2, 2, C.tea);
  }
  // Doorway with lamplight.
  const dx = px(sh.doorX);
  rect(c, dx - 4, sy + 7, 9, shh - 7, C.warmD);
  rect(c, dx - 3, sy + 8, 7, shh - 8, C.warm);
  for (let y = sy + 8; y < sy + shh; y += 2) ditherRow(c, y, C.gold, dx - 2, dx + 3);
  rect(c, dx - 5, sy + 6, 11, 1, C.wood);
  // Light spill on the ground.
  for (let y = sy + shh; y < sy + shh + 4; y++) ditherRow(c, y, C.warmD, dx - 5 - (y - sy - shh), dx + 6 + (y - sy - shh));

  // Sign post.
  const sg = LAYOUT.sign;
  const gx = px(sg.x), gy = px(sg.y);
  rect(c, gx - 1, gy - 1, 2, 16, C.wood);
  const tw = textWidth(sg.text) + 7;
  rect(c, gx - tw / 2 - 1, gy - 7, tw + 2, 10, C.ink);
  rect(c, gx - tw / 2, gy - 6, tw, 8, C.wallD);
  rect(c, gx - tw / 2, gy - 6, tw, 1, C.wall);
  pixelText(c, sg.text, gx - tw / 2 + 3, gy - 4, C.gold);

  // Lamp posts.
  const L = LAYOUT.lamps;
  for (let i = 0; i < L.count; i++) {
    const x = px(L.x0 + i * L.dx), y = px(L.y);
    rect(c, x, y, 1, 8, C.brass);
    rect(c, x - 1, y + 7, 3, 1, C.brassD);
    rect(c, x - 1, y, 3, 1, C.brassD);
  }
  return cnv;
}

// ── sprites ──────────────────────────────────────────────────────────────────

function villagerSprite(c: CanvasRenderingContext2D, v: VillagerFrame, ox: number, oy: number, mono?: string) {
  const s = skeleton(v);
  const P = (p: { x: number; y: number }) => ({ x: Math.round(p.x / S) + ox, y: Math.round(p.y / S) + oy });
  const hip = P(s.hip), neck = P(s.neck), head = P(s.head);
  const kF = P(s.kneeF), kB = P(s.kneeB), fF = P(s.footF), fB = P(s.footB);
  const sh = P(s.shoulder), eF = P(s.elbowF), eB = P(s.elbowB), hF = P(s.handF), hB = P(s.handB);
  const col = (k: string) => mono ?? k;
  const f = v.facing;
  // Back arm and leg.
  pline(c, sh.x, sh.y, eB.x, eB.y, col(v.shirt));
  pline(c, eB.x, eB.y, hB.x, hB.y, col(v.skin));
  pline(c, kB.x, kB.y, fB.x, fB.y, col(v.skin));
  rect(c, fB.x - (f < 0 ? 1 : 0), fB.y, 2, 1, col(C.hair));
  // Front leg.
  pline(c, kF.x, kF.y, fF.x, fF.y, col(v.skin));
  rect(c, fF.x - (f < 0 ? 1 : 0), fF.y, 2, 1, col(C.hair));
  // Mundu: cloth from hip to knees.
  const mx0 = Math.min(hip.x - 2, kF.x - 1, kB.x - 1), mx1 = Math.max(hip.x + 2, kF.x + 1, kB.x + 1);
  const my1 = Math.max(kF.y, kB.y) + 1;
  rect(c, mx0, hip.y, mx1 - mx0 + 1, my1 - hip.y, col(v.mundu));
  if (!mono) rect(c, mx0, hip.y, mx1 - mx0 + 1, 1, "#b8ac90");
  // Torso.
  rect(c, neck.x - 2, neck.y, 5, hip.y - neck.y, col(v.shirt));
  if (!mono) rect(c, neck.x - 2 + (f > 0 ? 0 : 4), neck.y + 1, 1, hip.y - neck.y - 1, "rgba(0,0,0,0.25)");
  // Head: skin block, hair, eye.
  rect(c, head.x - 2, head.y - 2, 5, 5, col(v.skin));
  rect(c, head.x - 2, head.y - 3, 5, 2, col(C.hair));
  rect(c, head.x - 2 - f, head.y - 2, 1, 3, col(C.hair));
  if (!mono) rect(c, head.x + f, head.y, 1, 1, C.ink);
  // Front arm.
  pline(c, sh.x, sh.y, eF.x, eF.y, col(v.shirt));
  pline(c, eF.x, eF.y, hF.x, hF.y, col(v.skin));
  // Props.
  if (v.carry === "laptop") {
    rect(c, hF.x - 3, hF.y - 1, 7, 2, col(C.grey));
    const lidX = f > 0 ? hF.x + 3 : hF.x - 3;
    rect(c, lidX, hF.y - 6, 1, 5, col(C.greyD));
    if (!mono) { rect(c, lidX - f, hF.y - 5, 1, 4, C.screen); rect(c, hF.x - 2, hF.y - 1, 5, 1, C.greyD); }
  } else if (v.carry === "glass") {
    rect(c, hF.x - 1, hF.y - 3, 2, 3, col(C.glass));
    if (!mono) rect(c, hF.x - 1, hF.y - 2, 2, 2, C.tea);
  }
}

function drawVillager(c: CanvasRenderingContext2D, v: VillagerFrame) {
  // Shadow (stays on the ground while hopping).
  rect(c, Math.round(v.x / S) - 3, Math.round(v.y / S) + 1, 7, 1, "rgba(8,4,24,0.55)");
  for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) villagerSprite(c, v, dx, dy, C.ink);
  villagerSprite(c, v, 0, 0);
}

const HEART = ["0110110", "1111111", "1111111", "0111110", "0011100", "0001000"];
function heart(ctx: CanvasRenderingContext2D, x: number, y: number, k: number, full: boolean) {
  for (let r = 0; r < HEART.length; r++)
    for (let q = 0; q < 7; q++) {
      if (HEART[r][q] !== "1") continue;
      const edge = r === 0 || q === 0 || q === 6 || HEART[r + 1]?.[q] !== "1" || HEART[r][q - 1] !== "1" || HEART[r][q + 1] !== "1";
      ctx.fillStyle = edge ? C.ink : full ? (r === 1 && q === 1 ? "#ffd0da" : C.red) : "#3a2a55";
      ctx.fillRect(x + q * k, y + r * k, k, k);
    }
}

/** A game-style framed box in logical units. */
function box(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, fill: string, border: string) {
  ctx.fillStyle = C.ink;
  ctx.fillRect(x - 2, y - 2, w + 4, h + 4);
  ctx.fillStyle = border;
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = fill;
  ctx.fillRect(x + 2, y + 2, w - 4, h - 4);
}

function label(ctx: CanvasRenderingContext2D, v: VillagerFrame, f: SceneFrame) {
  const a = labelAnchor(v);
  const urgent = v.status === "waiting";
  const on = f.pulse > 0.5;
  const k = 2;
  const name = v.name.toUpperCase();
  const icon = urgent ? 14 : 0;
  const nw = (textWidth(name) + 2) * k, tw = (textWidth(v.label) + 2) * k;
  const bw = icon + nw + 6 + tw + 8, bh = 7 * k + 6;
  const bx = Math.max(6, Math.min(W - 6 - bw, Math.round(a.x - bw / 2)));
  const by = Math.round(a.y - bh + 4);
  const sc = urgent ? (on ? C.flame : "#ffb3c0") : STATUS_COLOR[v.status];
  box(ctx, bx, by, bw, bh, urgent ? (on ? C.redD : "#5e0a20") : "#1a1038", urgent ? (on ? "#ffd0d0" : C.red) : STATUS_COLOR[v.status]);
  if (urgent) {
    ctx.fillStyle = on ? C.flame : "#ffb3c0";
    ctx.fillRect(bx + 3, by + 3, 10, 14);
    ctx.fillStyle = C.ink;
    ctx.fillRect(bx + 7, by + 5, 2, 6);
    ctx.fillRect(bx + 7, by + 13, 2, 2);
  }
  hudText(ctx, name, bx + 4 + icon, by + 3, sc, k);
  hudText(ctx, v.label, bx + 4 + icon + nw + 6, by + 3, C.white, k);
  // Pointer notch down to the head.
  ctx.fillStyle = urgent ? C.red : STATUS_COLOR[v.status];
  const nx = Math.round(a.x);
  ctx.fillRect(nx - 3, by + bh + 2, 6, 2);
  ctx.fillRect(nx - 1, by + bh + 4, 2, 2);
}

export const pixelArt: StyleProto = {
  id: "pixel-art",
  n: 1,
  name: "Pixel Art",
  blurb: "A retro 16-bit game: chunky pixels in a limited indigo-night palette, a game HUD with hearts, XP bar and quest banner, and a cheering pixel crowd. Runs at 12 fps.",
  fps: 12,
  bg: "#1a1033",
  draw(ctx, f) {
    if (!bgCanvas) bgCanvas = buildBg();
    if (!frameCanvas) {
      frameCanvas = document.createElement("canvas");
      frameCanvas.width = PW;
      frameCanvas.height = PH;
    }
    const c = frameCanvas.getContext("2d")!;
    c.drawImage(bgCanvas, 0, 0);
    const t = f.t;

    // Twinkling stars.
    const r = rng(5);
    for (let i = 0; i < 34; i++) {
      const x = Math.floor(r() * PW), y = Math.floor(r() * 40), ph = r() * 6;
      if (x > 178 && x < 194 && y < 24) continue;
      const tw = Math.sin(t * 2.2 + ph);
      if (tw > -0.3) rect(c, x, y, 1, 1, tw > 0.75 ? C.star : C.sky5);
      if (tw > 0.92 && i % 3 === 0) { rect(c, x - 1, y, 3, 1, C.sky5); rect(c, x, y - 1, 1, 3, C.sky5); rect(c, x, y, 1, 1, C.star); }
    }
    // Drifting pixel clouds.
    for (let i = 0; i < 3; i++) {
      const cx = Math.round(((f.drift * 0.25 + i * 83) % (PW + 40)) - 20), cy = 10 + i * 9;
      rect(c, cx, cy, 16, 2, C.sky3);
      rect(c, cx + 3, cy - 1, 8, 1, C.sky3);
      rect(c, cx + 2, cy + 2, 12, 1, C.sky2);
    }
    // Water shimmer + moon reflection.
    const top = px(LAYOUT.waterTop), wb = px(LAYOUT.waterBottom);
    for (let i = 0; i < 14; i++) {
      const y = top + 2 + ((i * 5) % (wb - top - 3));
      const x = Math.round(((i * 37 + t * (4 + (i % 3) * 3)) % (PW + 10)) - 5);
      rect(c, x, y, 3 + (i % 3), 1, i % 4 === 0 ? C.waterHi : C.water2);
    }
    for (let y = top + 1; y < wb - 2; y += 2) {
      const w = 5 - Math.floor((y - top) / 4) + (Math.floor(t * 4 + y) % 2);
      if (w > 1 && (y + Math.floor(t * 3)) % 4 !== 0) rect(c, 186 - Math.floor(w / 2) + ((y + Math.floor(t * 2)) % 3) - 1, y, w, 1, y < top + 6 ? C.moonD : C.water2);
    }
    // Canoe with rower.
    const cx = px(f.canoeX), cy = px(178);
    rect(c, cx - 7, cy, 14, 1, C.hull);
    rect(c, cx - 6, cy + 1, 12, 1, C.hullD);
    rect(c, cx - 8, cy - 1, 1, 1, C.hull); rect(c, cx + 7, cy - 1, 1, 1, C.hull);
    rect(c, cx - 1, cy - 4, 2, 4, C.white);
    rect(c, cx - 1, cy - 6, 2, 2, "#6b4430");
    const oar = Math.floor(t * 3) % 2;
    pline(c, cx + 1, cy - 3, cx + 4 + oar, cy + 2, C.wood);
    if (oar) rect(c, cx + 5, cy + 2, 2, 1, C.waterHi);

    // Shop steam (pixels rising, flickering).
    const sh = LAYOUT.shop;
    for (let i = 0; i < 3; i++) {
      const gx = px(sh.x) + 6 + i * 6, gy = px(sh.y) + 11;
      for (let k = 0; k < 3; k++) {
        const ph = (t * 1.5 + i * 0.33 + k * 0.33) % 1;
        rect(c, gx + Math.round(Math.sin(ph * 6 + i) * 1), gy - Math.round(ph * 7), 1, 1, ph < 0.6 ? "#c8c0e8" : C.sky4);
      }
    }

    // Lamps: flame flicker and dithered glow.
    const L = LAYOUT.lamps;
    for (let i = 0; i < L.count; i++) {
      const lit = Math.max(0, Math.min(1, f.lampsLit - i));
      if (lit <= 0) continue;
      const x = px(L.x0 + i * L.dx), y = px(L.y);
      if (lit > 0.4) {
        c.fillStyle = "rgba(255,214,110,0.45)";
        for (let gy = -3; gy <= 2; gy++) for (let gx = -2; gx <= 2; gx++) if ((gx + gy) % 2 === 0 && gx * gx + gy * gy < 7 && !(gx === 0 && gy >= 0)) c.fillRect(x + gx, y - 2 + gy, 1, 1);
      }
      const fl = (Math.floor(t * 12) + i) % 3;
      rect(c, x, y - 2, 1, 2, C.flame);
      if (lit > 0.6) rect(c, x + (fl === 1 ? 1 : 0), y - 3 - (fl === 2 ? 1 : 0), 1, 1, C.flameO);
    }

    // Villagers, back to front.
    const vs = [...f.villagers].sort((a, b) => a.y - b.y);
    for (const v of vs) drawVillager(c, v);
    // Raghu's celebration sparkles while hopping.
    const rg = f.villagers.find((v) => v.status === "finished");
    if (rg && rg.jump > 0.15) {
      const hx = px(rg.x), hy = px(rg.y - 80 - rg.jump * 26);
      const k = Math.floor(t * 12) % 4;
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2 + k * 0.4;
        const sx = hx + Math.round(Math.cos(a) * 8), sy = hy + 8 + Math.round(Math.sin(a) * 6);
        rect(c, sx, sy, 1, 1, C.flame);
        if ((i + k) % 2) { rect(c, sx - 1, sy, 3, 1, C.flame); rect(c, sx, sy - 1, 1, 3, C.flame); }
      }
    }

    // Cheering crowd along the bottom edge.
    rect(c, 0, PH - 4, PW, 4, C.ink);
    const skins = ["#8a5a3c", "#a0694a", "#6b4430", "#b07a52"];
    const shirts = ["#c2410c", "#1d4ed8", "#f4efe2", "#15803d", "#a21caf", "#eab308"];
    for (let i = 0; i < 15; i++) {
      const hx = 4 + i * 14 + (i % 2) * 3;
      const bob = Math.round(Math.abs(Math.sin(t * 5 + i * 1.3)) * 2);
      const y = PH - 6 - bob;
      const up = (Math.floor(t * 6) + i) % 2 === 0;
      rect(c, hx - 1, y - 1, 7, 7, C.ink);
      rect(c, hx, y + 3, 5, 4, shirts[i % shirts.length]);
      rect(c, hx, y, 5, 4, skins[i % skins.length]);
      rect(c, hx, y, 5, 1, C.hair);
      rect(c, hx + 1, y + 2, 1, 1, C.ink); rect(c, hx + 3, y + 2, 1, 1, C.ink);
      if (up) { rect(c, hx - 1, y - 2, 1, 3, skins[i % skins.length]); rect(c, hx + 5, y - 2, 1, 3, skins[i % skins.length]); }
    }

    // Upscale with crisp pixels.
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(frameCanvas, 0, 0, W, H);

    // ── HUD (full resolution, pixel font) ──
    const done = Math.min(10, Math.floor(f.progress * 10));
    const step = Math.floor(t / 12) + 1;
    box(ctx, 10, 10, 124, 50, "#1a1038", "#c9b8ff");
    hudText(ctx, `TASKS ${done}/10`, 16, 15, C.white, 2);
    hudText(ctx, "XP", 16, 30, C.flame, 2);
    ctx.fillStyle = C.ink;
    ctx.fillRect(36, 30, 92, 12);
    ctx.fillStyle = C.greenD;
    ctx.fillRect(38, 32, Math.round(88 * f.progress), 8);
    ctx.fillStyle = C.green;
    ctx.fillRect(38, 32, Math.round(88 * f.progress), 5);
    ctx.fillStyle = "rgba(13,8,32,0.6)";
    for (let x = 38 + 11; x < 126; x += 11) ctx.fillRect(x, 32, 1, 8);
    hudText(ctx, `STEP ${String(step % 1000).padStart(3, "0")}`, 16, 45, "#c9b8ff", 2);

    for (let i = 0; i < 4; i++) heart(ctx, W - 104 + i * 24, 12, 3, i < 3);

    // Quest banner with ribbon tails.
    const qw = textWidth("GRAMAM QUEST") * 3 + 24;
    const qx = W / 2 - qw / 2, qy = 9;
    ctx.fillStyle = C.ink;
    ctx.fillRect(qx - 18, qy + 8, 20, 18);
    ctx.fillRect(qx + qw - 2, qy + 8, 20, 18);
    ctx.fillStyle = C.roofD;
    ctx.fillRect(qx - 16, qy + 10, 16, 14);
    ctx.fillRect(qx + qw, qy + 10, 16, 14);
    box(ctx, qx, qy, qw, 28, C.roof, C.gold);
    hudText(ctx, "GRAMAM QUEST", W / 2, qy + 4, C.gold, 3, "center");

    // Labels.
    for (const v of f.villagers) label(ctx, v, f);
  },
};
