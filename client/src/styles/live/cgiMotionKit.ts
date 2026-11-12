/**
 * Drawing kit for the live CGI Motion style: colour helpers, cached glow
 * sprites, tiled background layers, per-place building sprites, palms and
 * the smooth-shaded, rim-lit villager. Ported from protos/cgiMotion.ts and
 * generalised to any world width.
 */
import { BODY, hash, rng, skeleton } from "../scene";
import { asVillagerFrame } from "./reference";
import { GROUND, WORLD_H, type LiveCompanion, type LivePlace, type LiveVillager } from "./types";

export const S = 2; // offscreen cache resolution factor
export const TILE_W = 640;
export const FAR_H = 200;
export const RIM = "rgba(150,236,255,";
const AMB: RGB = [6, 26, 36];
const WARM: RGB = [255, 214, 160];

export type RGB = [number, number, number];
export const rgbOf = (c: string): RGB => {
  const h = c.startsWith("#") ? c.slice(1) : c;
  const full = h.length === 3 ? h.split("").map((x) => x + x).join("") : h;
  const n = parseInt(full, 16) || 0;
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
export const mix = (a: RGB, b: RGB, k: number) =>
  `rgb(${Math.round(a[0] + (b[0] - a[0]) * k)},${Math.round(a[1] + (b[1] - a[1]) * k)},${Math.round(a[2] + (b[2] - a[2]) * k)})`;
export const rgba = (c: RGB, a: number) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;

export function makeCanvas(w: number, h: number) {
  const cv = document.createElement("canvas");
  cv.width = Math.max(1, Math.ceil(w));
  cv.height = Math.max(1, Math.ceil(h));
  return cv;
}

/** Soft radial glow sprite (64×64) in one colour. */
const glowCache = new Map<string, HTMLCanvasElement>();
export function glow(color: string) {
  let cv = glowCache.get(color);
  if (cv) return cv;
  cv = makeCanvas(64, 64);
  const c = cv.getContext("2d")!;
  const g = c.createRadialGradient(32, 32, 0, 32, 32, 32);
  const rgb = rgbOf(color);
  g.addColorStop(0, rgba(rgb, 1));
  g.addColorStop(0.25, rgba(rgb, 0.45));
  g.addColorStop(1, rgba(rgb, 0));
  c.fillStyle = g;
  c.fillRect(0, 0, 64, 64);
  glowCache.set(color, cv);
  return cv;
}

/**
 * A horizontally tiling layer: the painter draws one tile in [0, TILE_W);
 * it's painted three times side by side (so overflow wraps), optionally
 * blurred, and the middle copy is kept, so tiles meet without seams.
 */
function tileLayer(h: number, blurPx: number, paint: (c: CanvasRenderingContext2D) => void) {
  const wide = makeCanvas(TILE_W * 3 * S, h * S);
  const wc = wide.getContext("2d")!;
  wc.scale(S, S);
  for (let k = 0; k < 3; k++) {
    wc.save();
    wc.translate(k * TILE_W, 0);
    paint(wc);
    wc.restore();
  }
  const out = makeCanvas(TILE_W * S, h * S);
  const oc = out.getContext("2d")!;
  if (blurPx > 0) oc.filter = `blur(${blurPx}px)`;
  oc.drawImage(wide, -TILE_W * S, 0);
  oc.filter = "none";
  return out;
}

// ── far tile: sky, stars, clouds, hills, far palms, water (blurred = DOF) ──

function paintFar(c: CanvasRenderingContext2D) {
  const sky = c.createLinearGradient(0, 0, 0, GROUND.waterTop);
  sky.addColorStop(0, "#030a12");
  sky.addColorStop(0.55, "#06202b");
  sky.addColorStop(1, "#0f3d47");
  c.fillStyle = sky;
  c.fillRect(0, -20, TILE_W, GROUND.waterTop + 22);
  const r = rng(88);
  for (let i = 0; i < 70; i++) {
    const x = r() * TILE_W, y = r() * 110, a = 0.2 + r() * 0.6;
    c.fillStyle = `rgba(200,240,255,${a})`;
    c.fillRect(x, y, 0.8, 0.8);
  }
  for (let i = 0; i < 5; i++) {
    const y = 30 + i * 18, x = (i * 173) % TILE_W;
    const g = c.createRadialGradient(x, y, 0, x, y, 120);
    g.addColorStop(0, "rgba(60,130,145,0.14)");
    g.addColorStop(1, "rgba(60,130,145,0)");
    c.save();
    c.translate(x, y);
    c.scale(1, 0.18);
    c.translate(-x, -y);
    c.fillStyle = g;
    c.fillRect(x - 120, y - 120, 240, 240);
    c.restore();
  }
  const hy = GROUND.waterTop;
  c.fillStyle = "#0a2a33";
  c.beginPath();
  c.moveTo(-1, hy);
  // Periodic in TILE_W so the hills wrap.
  const k = (Math.PI * 2) / TILE_W;
  for (let x = -1; x <= TILE_W + 1; x += 8) c.lineTo(x, hy - 10 - Math.sin(x * k * 1.3 + 0.3) * 6 - Math.sin(x * k * 4 + 1) * 3);
  c.lineTo(TILE_W + 1, hy);
  c.fill();
  for (const x of [40, 120, 210, 300, 380, 450, 520, 600]) {
    const h = 30 + (x % 3) * 4, top = hy - h;
    c.strokeStyle = "#071c24";
    c.lineWidth = 2;
    c.beginPath();
    c.moveTo(x, hy);
    c.quadraticCurveTo(x + 2, hy - h / 2, x + 4, top);
    c.stroke();
    c.fillStyle = "#071c24";
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2;
      c.beginPath();
      c.moveTo(x + 4, top);
      c.quadraticCurveTo(x + 4 + Math.cos(a) * 8, top - 6, x + 4 + Math.cos(a) * 14, top + Math.sin(a) * 4 + 5);
      c.quadraticCurveTo(x + 4 + Math.cos(a) * 7, top - 1, x + 4, top);
      c.fill();
    }
  }
  const haze = c.createLinearGradient(0, hy - 30, 0, hy);
  haze.addColorStop(0, "rgba(40,130,140,0)");
  haze.addColorStop(1, "rgba(60,160,170,0.28)");
  c.fillStyle = haze;
  c.fillRect(0, hy - 30, TILE_W, 30);
  const wat = c.createLinearGradient(0, GROUND.waterTop, 0, GROUND.waterBottom);
  wat.addColorStop(0, "#124651");
  wat.addColorStop(1, "#051820");
  c.fillStyle = wat;
  c.fillRect(0, GROUND.waterTop, TILE_W, FAR_H - GROUND.waterTop);
}

// ── ground tile: wet glossy ground, path band, puddles (sharp) ─────────────

function paintGround(c: CanvasRenderingContext2D) {
  const gy = GROUND.groundY;
  const gr = c.createLinearGradient(0, gy, 0, WORLD_H);
  gr.addColorStop(0, "#0d2c33");
  gr.addColorStop(0.35, "#081d23");
  gr.addColorStop(1, "#040e12");
  c.fillStyle = gr;
  c.fillRect(0, gy, TILE_W, WORLD_H - gy);
  c.fillStyle = "rgba(120,220,230,0.22)";
  c.fillRect(0, gy, TILE_W, 1);
  const path = c.createLinearGradient(0, GROUND.pathTop, 0, GROUND.pathBottom);
  path.addColorStop(0, "rgba(40,80,88,0)");
  path.addColorStop(0.5, "rgba(40,80,88,0.25)");
  path.addColorStop(1, "rgba(40,80,88,0)");
  c.fillStyle = path;
  c.fillRect(0, GROUND.pathTop, TILE_W, GROUND.pathBottom - GROUND.pathTop);
  const r = rng(31);
  for (let i = 0; i < 14; i++) {
    const x = r() * TILE_W, y = 210 + r() * 140, rx = 14 + r() * 40;
    c.save();
    c.translate(x, y);
    c.scale(1, 0.16);
    const g = c.createRadialGradient(0, 0, 0, 0, 0, rx);
    g.addColorStop(0, "rgba(90,180,195,0.16)");
    g.addColorStop(1, "rgba(90,180,195,0)");
    c.fillStyle = g;
    c.beginPath();
    c.arc(0, 0, rx, 0, Math.PI * 2);
    c.fill();
    c.restore();
  }
}

// ── shafts tile: slanted moonbeams + low fog (additive, blurred) ───────────

function paintShafts(c: CanvasRenderingContext2D) {
  const beams = [
    { x: 520, w: 50, dx: -190, a: 0.07 },
    { x: 600, w: 34, dx: -170, a: 0.05 },
    { x: 260, w: 40, dx: -200, a: 0.045 },
    { x: 140, w: 24, dx: -180, a: 0.04 },
  ];
  for (const b of beams) {
    const g = c.createLinearGradient(b.x, 0, b.x + b.dx, WORLD_H);
    g.addColorStop(0, "rgba(140,230,245,0)");
    g.addColorStop(0.18, `rgba(140,230,245,${b.a})`);
    g.addColorStop(0.7, `rgba(140,230,245,${b.a * 0.6})`);
    g.addColorStop(1, "rgba(140,230,245,0)");
    c.fillStyle = g;
    c.beginPath();
    c.moveTo(b.x, 0);
    c.lineTo(b.x + b.w, 0);
    c.lineTo(b.x + b.w * 2.2 + b.dx, WORLD_H);
    c.lineTo(b.x + b.dx, WORLD_H);
    c.closePath();
    c.fill();
  }
  const fog = c.createLinearGradient(0, GROUND.groundY - 8, 0, GROUND.groundY + 50);
  fog.addColorStop(0, "rgba(80,170,180,0)");
  fog.addColorStop(0.3, "rgba(80,170,180,0.09)");
  fog.addColorStop(1, "rgba(80,170,180,0)");
  c.fillStyle = fog;
  c.fillRect(0, GROUND.groundY - 8, TILE_W, 60);
}

/** Upper sky (above world y = 0), shown when the camera looks higher than the world. */
export const HIGH_H = 240;
function paintHigh(c: CanvasRenderingContext2D) {
  const g = c.createLinearGradient(0, 0, 0, HIGH_H);
  g.addColorStop(0, "#01050a");
  g.addColorStop(1, "#030a12");
  c.fillStyle = g;
  c.fillRect(0, 0, TILE_W, HIGH_H);
  const r = rng(404);
  for (let i = 0; i < 90; i++) {
    const x = r() * TILE_W, y = r() * HIGH_H, a = 0.15 + r() * 0.6, z = r() < 0.08 ? 1.3 : 0.8;
    c.fillStyle = `rgba(200,240,255,${a})`;
    c.fillRect(x, y, z, z);
  }
  for (let i = 0; i < 4; i++) {
    const y = 60 + i * 45, x = (i * 211) % TILE_W;
    const cg = c.createRadialGradient(x, y, 0, x, y, 140);
    cg.addColorStop(0, "rgba(50,110,125,0.1)");
    cg.addColorStop(1, "rgba(50,110,125,0)");
    c.save();
    c.translate(x, y);
    c.scale(1, 0.16);
    c.translate(-x, -y);
    c.fillStyle = cg;
    c.fillRect(x - 140, y - 140, 280, 280);
    c.restore();
  }
}

export interface Tiles { high: HTMLCanvasElement; far: HTMLCanvasElement; ground: HTMLCanvasElement; shafts: HTMLCanvasElement; vignette: HTMLCanvasElement; moon: HTMLCanvasElement }
let tiles: Tiles | null = null;
export function getTiles(): Tiles {
  if (!tiles) {
    const groundCv = makeCanvas(TILE_W * S, WORLD_H * S);
    const gc = groundCv.getContext("2d")!;
    gc.scale(S, S);
    paintGround(gc);
    const vignette = makeCanvas(256, 256);
    const vc = vignette.getContext("2d")!;
    const v = vc.createRadialGradient(128, 140, 70, 128, 140, 180);
    v.addColorStop(0, "rgba(0,0,0,0)");
    v.addColorStop(1, "rgba(0,6,10,0.6)");
    vc.fillStyle = v;
    vc.fillRect(0, 0, 256, 256);
    const moon = makeCanvas(260 * S, 260 * S);
    const mc = moon.getContext("2d")!;
    mc.scale(S, S);
    const halo = mc.createRadialGradient(130, 130, 6, 130, 130, 125);
    halo.addColorStop(0, "rgba(170,240,255,0.35)");
    halo.addColorStop(0.3, "rgba(90,200,220,0.12)");
    halo.addColorStop(1, "rgba(40,120,140,0)");
    mc.fillStyle = halo;
    mc.fillRect(0, 0, 260, 260);
    const disc = mc.createRadialGradient(127, 127, 1, 130, 130, 13);
    disc.addColorStop(0, "#f2fdff");
    disc.addColorStop(1, "#a6dde6");
    mc.fillStyle = disc;
    mc.filter = "blur(1px)";
    mc.beginPath();
    mc.arc(130, 130, 12, 0, Math.PI * 2);
    mc.fill();
    tiles = {
      high: tileLayer(HIGH_H, 1, paintHigh),
      far: tileLayer(FAR_H, 3, paintFar),
      ground: groundCv,
      shafts: tileLayer(WORLD_H, 4, paintShafts),
      vignette,
      moon,
    };
  }
  return tiles;
}

// ── palms (sprite per size/lean) ───────────────────────────────────────────

export function paintPalm(c: CanvasRenderingContext2D, x: number, baseY: number, h: number, lean: number) {
  const topX = x + lean * h, topY = baseY - h;
  c.fillStyle = "rgba(0,0,0,0.4)";
  c.beginPath();
  c.ellipse(x, baseY + 1, 10, 2.5, 0, 0, Math.PI * 2);
  c.fill();
  const N = 14;
  for (let i = 0; i < N; i++) {
    const k0 = i / N, k1 = (i + 1) / N;
    const p = (k: number) => ({ x: x + lean * h * (0.4 * k * (1 - k) + k * k), y: baseY - h * k });
    const a = p(k0), b = p(k1);
    const w = 6 - k0 * 3;
    c.strokeStyle = i % 2 ? "#1d2a2a" : "#233232";
    c.lineWidth = w;
    c.lineCap = "round";
    c.beginPath();
    c.moveTo(a.x, a.y);
    c.lineTo(b.x, b.y);
    c.stroke();
    c.strokeStyle = RIM + "0.45)";
    c.lineWidth = 0.8;
    c.beginPath();
    c.moveTo(a.x + w * 0.45, a.y);
    c.lineTo(b.x + w * 0.45, b.y);
    c.stroke();
  }
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2 + 0.2;
    const len = h * (0.34 + hash(i + h) * 0.08);
    const ex = topX + Math.cos(a) * len;
    const ey = topY + Math.sin(a) * len * 0.35 + len * 0.32;
    const mx = (topX + ex) / 2, my = Math.min(topY, ey) - len * 0.18;
    const g = c.createLinearGradient(topX, topY - 10, ex, ey);
    g.addColorStop(0, "#1b4a40");
    g.addColorStop(1, "#0a2420");
    c.fillStyle = g;
    c.beginPath();
    c.moveTo(topX, topY);
    c.quadraticCurveTo(mx, my - 4, ex, ey);
    c.quadraticCurveTo(mx, my + 5, topX, topY + 2);
    c.fill();
    c.strokeStyle = RIM + "0.35)";
    c.lineWidth = 0.6;
    c.beginPath();
    c.moveTo(topX, topY);
    c.quadraticCurveTo(mx, my - 4, ex, ey);
    c.stroke();
  }
  for (let i = 0; i < 3; i++) {
    const g = c.createRadialGradient(topX - 2 + i * 3, topY + 3, 0.5, topX - 1 + i * 3, topY + 4, 3);
    g.addColorStop(0, "#4b5a35");
    g.addColorStop(1, "#16200f");
    c.fillStyle = g;
    c.beginPath();
    c.arc(topX - 2 + i * 3, topY + 4 + (i % 2), 2.6, 0, Math.PI * 2);
    c.fill();
  }
}

export interface Sprite { cv: HTMLCanvasElement; ox: number; oy: number; w: number; h: number }

/** A cached sprite painted in local units; (ox, oy) is where local (0,0) lands relative to the anchor. */
export function sprite(w: number, h: number, ox: number, oy: number, paint: (c: CanvasRenderingContext2D) => void): Sprite {
  const cv = makeCanvas(w * S, h * S);
  const c = cv.getContext("2d")!;
  c.scale(S, S);
  c.translate(-ox, -oy);
  paint(c);
  return { cv, ox, oy, w, h };
}

const palmCache = new Map<string, Sprite>();
export function palmSprite(h: number, lean: number): Sprite {
  const key = `${Math.round(h)}|${lean.toFixed(3)}`;
  let s = palmCache.get(key);
  if (!s) {
    if (palmCache.size > 64) palmCache.clear();
    const topX = lean * h;
    const left = Math.min(0, topX) - h * 0.5 - 4, right = Math.max(0, topX) + h * 0.5 + 4;
    const top = -h - h * 0.3, bottom = 8;
    s = sprite(right - left, bottom - top, left, top, (c) => paintPalm(c, 0, 0, h, lean));
    palmCache.set(key, s);
  }
  return s;
}

export function drawSprite(ctx: CanvasRenderingContext2D, s: Sprite, x: number, y: number) {
  ctx.drawImage(s.cv, x + s.ox, y + s.oy, s.w, s.h);
}

// ── buildings: one sprite per place (project name on an emissive board) ────

const ROOFS: [string, string][] = [["#5a2b20", "#2a120d"], ["#3e3a2a", "#1c1a10"], ["#5a3a1c", "#2a1a0a"], ["#47263a", "#1f0f1a"]];
const WALLS: [string, string][] = [["#2a4744", "#13292b"], ["#2d3f4a", "#141f27"], ["#3a4636", "#1a2418"], ["#3a3b4a", "#1a1b26"]];

function fitText(c: CanvasRenderingContext2D, text: string, maxW: number, weight: string, size: number, min: number) {
  let s = size;
  c.font = `${weight} ${s}px ui-sans-serif, system-ui, sans-serif`;
  while (c.measureText(text).width > maxW && s > min) {
    s -= 0.5;
    c.font = `${weight} ${s}px ui-sans-serif, system-ui, sans-serif`;
  }
  let t = text;
  while (c.measureText(t).width > maxW && t.length > 2) t = t.slice(0, -2) + "…";
  return t;
}

/** Paints the building with its left wall edge at local x = 0 and base at local y = 0. */
function paintBuilding(c: CanvasRenderingContext2D, p: LivePlace) {
  const b = p.building;
  const w = b.w, wallH = b.wallH, roofH = b.roofH, doorX = b.doorX - b.x;
  const y = -wallH, base = 0;
  const [wallA, wallB] = WALLS[p.variant % 4]!;
  const [roofA, roofB] = ROOFS[p.variant % 4]!;
  c.fillStyle = "rgba(0,0,0,0.45)";
  c.beginPath();
  c.ellipse(w / 2, base + 2, w * 0.6, 6, 0, 0, Math.PI * 2);
  c.fill();
  const wall = c.createLinearGradient(0, 0, w, 0);
  wall.addColorStop(0, wallA);
  wall.addColorStop(1, wallB);
  c.fillStyle = wall;
  c.fillRect(0, y, w, wallH);
  const ao = c.createLinearGradient(0, y, 0, y + 16);
  ao.addColorStop(0, "rgba(0,0,0,0.6)");
  ao.addColorStop(1, "rgba(0,0,0,0)");
  c.fillStyle = ao;
  c.fillRect(0, y, w, 16);
  c.fillStyle = RIM + "0.4)";
  c.fillRect(w - 1, y, 1, wallH);

  // Serving window (warm interior) left of the door.
  const wx = 8, wy = y + 26, ww = Math.max(30, doorX - 12 - 18), wh = 24;
  const inner = c.createLinearGradient(0, wy, 0, wy + wh);
  inner.addColorStop(0, "#ffb860");
  inner.addColorStop(1, "#b9541c");
  c.fillStyle = inner;
  c.fillRect(wx, wy, ww, wh);
  c.fillStyle = "rgba(60,24,10,0.75)";
  if (p.variant % 2 === 0) {
    c.beginPath();
    c.ellipse(wx + ww - 12, wy + 16, 7, 6, 0, 0, Math.PI * 2);
    c.fill();
    c.fillRect(wx + ww - 18, wy + 7, 12, 3);
    for (let i = 0; i < 4; i++) c.fillRect(wx + 6 + i * 7, wy + 6, 5, 9);
  } else {
    // Shelves of books / files.
    for (let r = 0; r < 2; r++) for (let i = 0; i < 9; i++) c.fillRect(wx + 4 + i * 6, wy + 3 + r * 11, 4, 8 - (i % 3));
  }
  const counter = c.createLinearGradient(0, wy + wh, 0, wy + wh + 5);
  counter.addColorStop(0, "#8a5a33");
  counter.addColorStop(1, "#3b2414");
  c.fillStyle = counter;
  c.fillRect(wx - 3, wy + wh - 1, ww + 6, 5);
  for (let i = 0; i < 3; i++) {
    const gx = wx + 8 + i * 11;
    c.fillStyle = "rgba(255,230,190,0.55)";
    c.fillRect(gx - 2, wy + wh - 8, 4, 7);
    c.fillStyle = "#c87a3a";
    c.fillRect(gx - 2, wy + wh - 5, 4, 4);
  }
  // Lit doorway.
  const door = c.createLinearGradient(0, y + 24, 0, base);
  door.addColorStop(0, "#ffcf86");
  door.addColorStop(1, "#c4621f");
  c.fillStyle = door;
  c.fillRect(doorX - 11, y + 24, 22, base - y - 24);
  c.fillStyle = "#1a1210";
  c.fillRect(doorX - 12, y + 23, 24, 1.5);
  c.fillRect(doorX - 12, y + 23, 1.5, base - y - 23);
  c.fillRect(doorX + 10.5, y + 23, 1.5, base - y - 23);
  // Side window right of the door.
  if (w - doorX > 40) {
    const sx = doorX + 18, sw = Math.min(26, w - doorX - 26);
    c.fillStyle = "#e48f3e";
    c.fillRect(sx, y + 28, sw, 16);
    c.strokeStyle = "#1a1210";
    c.lineWidth = 1.2;
    c.strokeRect(sx, y + 28, sw, 16);
    c.beginPath();
    c.moveTo(sx + sw / 2, y + 28);
    c.lineTo(sx + sw / 2, y + 44);
    c.stroke();
  }

  // Roof.
  const rl = -14, rr = w + 14, ry = y + 4, top = y - roofH;
  const roof = c.createLinearGradient(0, top, 0, ry);
  roof.addColorStop(0, roofA);
  roof.addColorStop(1, roofB);
  c.fillStyle = roof;
  c.beginPath();
  c.moveTo(rl, ry);
  c.lineTo(w / 2, top);
  c.lineTo(rr, ry);
  c.closePath();
  c.fill();
  c.save();
  c.clip();
  for (let i = 1; i < 8; i++) {
    const yy = top + i * 5.4;
    c.fillStyle = "rgba(0,0,0,0.35)";
    c.fillRect(rl, yy, rr - rl, 1);
    c.fillStyle = "rgba(255,170,120,0.08)";
    c.fillRect(rl, yy + 1, rr - rl, 1);
  }
  const ms = c.createLinearGradient(w / 2, 0, rr, 0);
  ms.addColorStop(0, "rgba(120,220,235,0)");
  ms.addColorStop(1, "rgba(120,220,235,0.18)");
  c.fillStyle = ms;
  c.fillRect(w / 2, top, rr - w / 2, ry - top);
  c.restore();
  c.strokeStyle = RIM + "0.7)";
  c.lineWidth = 1;
  c.beginPath();
  c.moveTo(w / 2, top);
  c.lineTo(rr, ry);
  c.stroke();
  c.fillStyle = "rgba(0,0,0,0.55)";
  c.fillRect(rl, ry, rr - rl, 2);

  // Emissive board with the project name.
  const bw = w - 20, bx = 10, by = y + 6, bh = 14;
  c.fillStyle = "#140c08";
  c.beginPath();
  c.roundRect(bx, by, bw, bh, 2.5);
  c.fill();
  c.strokeStyle = "rgba(255,190,110,0.5)";
  c.lineWidth = 0.6;
  c.stroke();
  c.save();
  const name = fitText(c, p.name.toUpperCase(), bw - 8, "700", 8, 5.5);
  c.shadowColor = "#ffb35c";
  c.shadowBlur = 8;
  c.textAlign = "center";
  c.fillStyle = "#ffd9a0";
  c.fillText(name, bx + bw / 2, by + 10);
  c.restore();

  // Warm spill + reflections on the wet ground.
  c.save();
  c.globalCompositeOperation = "lighter";
  const spill = c.createRadialGradient(doorX, base + 4, 2, doorX, base + 4, 60);
  spill.addColorStop(0, "rgba(255,160,70,0.35)");
  spill.addColorStop(1, "rgba(255,160,70,0)");
  c.fillStyle = spill;
  c.save();
  c.translate(doorX, base + 4);
  c.scale(1, 0.35);
  c.fillRect(-60, -60, 120, 120);
  c.restore();
  c.globalAlpha = 0.5;
  for (const [x0, w0] of [[doorX - 10, 20], [wx + 4, ww - 8]] as const) c.drawImage(glow("#ff9a3a"), x0 - 4, base - 20, w0 + 8, 80);
  // Warm cone out of the door.
  c.globalAlpha = 1;
  const g = c.createLinearGradient(doorX, y + 24, doorX + 30, base + 40);
  g.addColorStop(0, "rgba(255,170,80,0.14)");
  g.addColorStop(1, "rgba(255,170,80,0)");
  c.fillStyle = g;
  c.beginPath();
  c.moveTo(doorX - 11, y + 24);
  c.lineTo(doorX + 11, y + 24);
  c.lineTo(doorX + 60, base + 44);
  c.lineTo(doorX - 30, base + 44);
  c.closePath();
  c.fill();
  c.restore();
}

const buildingCache = new Map<string, Sprite>();
export function buildingSprite(p: LivePlace): Sprite {
  const b = p.building;
  const key = `${p.name}|${p.variant}|${b.w}|${b.wallH}|${b.roofH}|${b.doorX - b.x}`;
  let s = buildingCache.get(key);
  if (!s) {
    if (buildingCache.size > 48) buildingCache.clear();
    const left = -40, right = b.w + 40, top = -b.wallH - b.roofH - 6, bottom = 80;
    s = sprite(right - left, bottom - top, left, top, (c) => paintBuilding(c, p));
    buildingCache.set(key, s);
  }
  return s;
}

// ── village sign and lamp stand sprites ────────────────────────────────────

let signSprite: Sprite | null = null;
export function getSignSprite(text: string): Sprite {
  if (!signSprite) {
    signSprite = sprite(90, 100, -45, -20, (c) => {
      c.fillStyle = "rgba(0,0,0,0.4)";
      c.beginPath();
      c.ellipse(0, 40, 8, 2, 0, 0, Math.PI * 2);
      c.fill();
      const post = c.createLinearGradient(-2, 0, 2, 0);
      post.addColorStop(0, "#3b4a4a");
      post.addColorStop(1, "#141d1f");
      c.fillStyle = post;
      c.fillRect(-1.8, 0, 3.6, 40);
      c.fillStyle = "#0b1a1f";
      c.beginPath();
      c.roundRect(-32, -14, 64, 17, 3);
      c.fill();
      c.strokeStyle = "rgba(94,234,212,0.8)";
      c.lineWidth = 0.8;
      c.stroke();
      c.save();
      c.shadowColor = "#5eead4";
      c.shadowBlur = 10;
      c.font = "800 8.5px ui-sans-serif, system-ui, sans-serif";
      c.textAlign = "center";
      c.fillStyle = "#c9fff6";
      c.fillText(text, 0, -2.5);
      c.restore();
      c.globalCompositeOperation = "lighter";
      c.globalAlpha = 0.35;
      c.drawImage(glow("#5eead4"), -26, 26, 52, 50);
    });
  }
  return signSprite;
}

let lampSprite: Sprite | null = null;
export function getLampSprite(): Sprite {
  if (!lampSprite) {
    lampSprite = sprite(20, 30, -10, -4, (c) => {
      c.fillStyle = "rgba(0,0,0,0.45)";
      c.beginPath();
      c.ellipse(0, 23, 8, 2, 0, 0, Math.PI * 2);
      c.fill();
      const brass = c.createLinearGradient(-6, 0, 6, 0);
      brass.addColorStop(0, "#c08a35");
      brass.addColorStop(0.45, "#6b4a1c");
      brass.addColorStop(1, "#2a1c0a");
      c.fillStyle = brass;
      c.beginPath();
      c.ellipse(0, 21, 6.5, 2.2, 0, 0, Math.PI * 2);
      c.fill();
      c.fillRect(-1.2, 2, 2.4, 19);
      c.beginPath();
      c.ellipse(0, 10, 2.6, 1.2, 0, 0, Math.PI * 2);
      c.fill();
      c.beginPath();
      c.moveTo(-6, 0);
      c.quadraticCurveTo(0, 6, 6, 0);
      c.closePath();
      c.fill();
      c.strokeStyle = RIM + "0.5)";
      c.lineWidth = 0.6;
      c.beginPath();
      c.moveTo(1.2, 3);
      c.lineTo(1.2, 20);
      c.stroke();
    });
  }
  return lampSprite;
}

// ── villagers: smooth-shaded capsules with a rim light ─────────────────────

interface Pal { skinD: string; skin: string; skinH: string; shirtD: string; shirt: string; shirtH: string; munduD: string; mundu: string; hair: string }
const palCache = new Map<string, Pal>();
function palOf(v: LiveVillager): Pal {
  const key = `${v.shirt}|${v.mundu}|${v.skin}|${v.hair}`;
  let p = palCache.get(key);
  if (p) return p;
  if (palCache.size > 128) palCache.clear();
  const sk = rgbOf(v.skin), sh = rgbOf(v.shirt), mu = rgbOf(v.mundu);
  p = {
    skinD: mix(sk, AMB, 0.5), skin: mix(sk, AMB, 0.15), skinH: mix(sk, WARM, 0.3),
    shirtD: mix(sh, AMB, 0.6), shirt: mix(sh, AMB, 0.25), shirtH: mix(sh, WARM, 0.15),
    munduD: mix(mu, AMB, 0.6), mundu: mix(mu, AMB, 0.3),
    hair: mix(rgbOf(v.hair), AMB, 0.3),
  };
  palCache.set(key, p);
  return p;
}

type Pt = { x: number; y: number };

function capsule(ctx: CanvasRenderingContext2D, pts: Pt[], w: number, dark: string, mid: string, rimA: number) {
  // A Path2D is re-transformed at each stroke, so the offsets below apply.
  const path = new Path2D();
  pts.forEach((p, i) => (i ? path.lineTo(p.x, p.y) : path.moveTo(p.x, p.y)));
  ctx.strokeStyle = dark;
  ctx.lineWidth = w;
  ctx.stroke(path);
  ctx.translate(-w * 0.16, -w * 0.08);
  ctx.strokeStyle = mid;
  ctx.lineWidth = w * 0.55;
  ctx.stroke(path);
  ctx.translate(w * 0.58, -0.2 + w * 0.08);
  ctx.strokeStyle = RIM + rimA + ")";
  ctx.lineWidth = 0.7;
  ctx.stroke(path);
  ctx.translate(-w * 0.42, 0.2);
}

const lerp = (a: Pt, b: Pt, k: number) => ({ x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k });

/** Draws one villager. `alpha` is the base opacity (fade-in × reflection). */
export function drawVillager(ctx: CanvasRenderingContext2D, v: LiveVillager, t: number, rimTint: string, alpha: number) {
  const s = skeleton(asVillagerFrame(v));
  const p = palOf(v);
  const fc = v.facing;
  let { elbowF, handF, elbowB, handB } = s;
  if (v.status === "finished" && v.jump > 0.05) {
    const k = Math.min(1, v.jump * 1.6);
    elbowF = { x: s.shoulder.x + 5 * k + 1, y: s.shoulder.y - 8 * k + 3 };
    handF = { x: s.shoulder.x + 8 * k, y: s.shoulder.y - 17 * k + 6 };
    elbowB = { x: s.shoulder.x - 5 * k - 1, y: s.shoulder.y - 8 * k + 3 };
    handB = { x: s.shoulder.x - 8 * k, y: s.shoulder.y - 17 * k + 6 };
  }
  ctx.globalAlpha = alpha;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  capsule(ctx, [s.shoulder, elbowB], 3.6, p.shirtD, p.shirtD, 0.2);
  capsule(ctx, [elbowB, handB], 2.8, p.skinD, p.skinD, 0.2);
  capsule(ctx, [s.hip, s.kneeB, s.footB], 3.8, p.skinD, p.skinD, 0.25);
  capsule(ctx, [s.hip, s.kneeF, s.footF], 4, p.skinD, p.skin, 0.55);
  ctx.fillStyle = "#1a1210";
  for (const ft of [s.footB, s.footF]) {
    ctx.beginPath();
    ctx.ellipse(ft.x + fc * 1.6, ft.y - 0.6, 3, 1.3, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // Mundu.
  const mF = lerp(s.kneeF, s.footF, 0.45), mB = lerp(s.kneeB, s.footB, 0.45);
  const lo = mF.x < mB.x ? mF : mB, hi = mF.x < mB.x ? mB : mF;
  const mg = ctx.createLinearGradient(s.hip.x - 7, 0, s.hip.x + 7, 0);
  mg.addColorStop(0, p.mundu);
  mg.addColorStop(1, p.munduD);
  ctx.fillStyle = mg;
  ctx.beginPath();
  ctx.moveTo(s.hip.x - 5.5, s.hip.y - 3);
  ctx.lineTo(s.hip.x + 5.5, s.hip.y - 3);
  ctx.quadraticCurveTo(hi.x + 4, (s.hip.y + hi.y) / 2, hi.x + 3.2, hi.y);
  ctx.lineTo(lo.x - 3.2, lo.y);
  ctx.quadraticCurveTo(lo.x - 4, (s.hip.y + lo.y) / 2, s.hip.x - 5.5, s.hip.y - 3);
  ctx.fill();
  ctx.strokeStyle = RIM + "0.5)";
  ctx.lineWidth = 0.7;
  ctx.beginPath();
  ctx.moveTo(s.hip.x + 5.5, s.hip.y - 3);
  ctx.quadraticCurveTo(hi.x + 4, (s.hip.y + hi.y) / 2, hi.x + 3.2, hi.y);
  ctx.stroke();
  ctx.strokeStyle = "rgba(230,180,80,0.85)";
  ctx.lineWidth = 0.9;
  ctx.beginPath();
  ctx.moveTo(lo.x - 3.2, lo.y - 1);
  ctx.lineTo(hi.x + 3.2, hi.y - 1);
  ctx.stroke();

  // Torso.
  const n = s.neck, h = s.hip;
  const tg = ctx.createLinearGradient(n.x - 7, 0, n.x + 7, 0);
  tg.addColorStop(0, p.shirtH);
  tg.addColorStop(0.55, p.shirt);
  tg.addColorStop(1, p.shirtD);
  ctx.fillStyle = tg;
  ctx.strokeStyle = tg;
  ctx.lineWidth = 2.4;
  ctx.beginPath();
  ctx.moveTo(n.x - 5.5, n.y + 1.5);
  ctx.lineTo(n.x + 5.5, n.y + 1.5);
  ctx.lineTo(h.x + 5, h.y - 2);
  ctx.lineTo(h.x - 5, h.y - 2);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.strokeStyle = rimTint;
  ctx.lineWidth = 0.9;
  ctx.beginPath();
  ctx.moveTo(n.x + 6.6, n.y + 1.5);
  ctx.lineTo(h.x + 6.1, h.y - 2);
  ctx.stroke();
  capsule(ctx, [n, { x: n.x + fc * 0.3, y: n.y - 3 }], 3.2, p.skinD, p.skin, 0.3);

  // Head.
  const hd = s.head, R = 6.2;
  const hg = ctx.createRadialGradient(hd.x - 2, hd.y - 2, 0.5, hd.x, hd.y, R + 1);
  hg.addColorStop(0, p.skinH);
  hg.addColorStop(0.6, p.skin);
  hg.addColorStop(1, p.skinD);
  ctx.fillStyle = hg;
  ctx.beginPath();
  ctx.arc(hd.x, hd.y, R, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = p.hair;
  ctx.beginPath();
  ctx.arc(hd.x - fc * 0.8, hd.y - 0.8, R + 0.4, Math.PI * (fc > 0 ? 0.95 : 1.2), Math.PI * (fc > 0 ? 1.8 : 2.05));
  ctx.lineTo(hd.x - fc * 0.8, hd.y);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(hd.x - fc * 2.5, hd.y - 1, R * 0.8, fc > 0 ? Math.PI : 0, fc > 0 ? Math.PI * 2 : Math.PI);
  ctx.fill();
  if (hash(v.id.length * 7.1 + v.id.charCodeAt(0)) > 0.5) {
    ctx.beginPath();
    ctx.arc(hd.x - fc * 6.5, hd.y + 1, 3, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = "#120a06";
  ctx.beginPath();
  ctx.arc(hd.x + fc * 3.4, hd.y - 0.2, 0.75, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = rimTint;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(hd.x, hd.y, R - 0.3, -Math.PI * 0.45, Math.PI * 0.25);
  ctx.stroke();

  // Front arm.
  capsule(ctx, [s.shoulder, elbowF], 3.8, p.shirtD, p.shirtH, 0.6);
  capsule(ctx, [elbowF, handF], 2.9, p.skinD, p.skin, 0.55);
  ctx.fillStyle = p.skin;
  ctx.beginPath();
  ctx.arc(handF.x, handF.y, 1.6, 0, Math.PI * 2);
  ctx.fill();

  if (v.carry === "laptop") {
    const hx = handF.x, hy = handF.y;
    ctx.strokeStyle = "#3a464c";
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.moveTo(hx - fc * 6, hy);
    ctx.lineTo(hx + fc * 7, hy);
    ctx.stroke();
    ctx.strokeStyle = "#20292d";
    ctx.beginPath();
    ctx.moveTo(hx + fc * 7, hy);
    ctx.lineTo(hx + fc * 10, hy - 11);
    ctx.stroke();
    ctx.strokeStyle = "rgba(160,255,240,0.95)";
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(hx + fc * 6, hy - 1);
    ctx.lineTo(hx + fc * 8.8, hy - 10.5);
    ctx.stroke();
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.globalAlpha = alpha * (0.55 + 0.1 * Math.sin(t * 9));
    ctx.drawImage(glow("#5eead4"), hx - 14, hy - 22, 28, 28);
    ctx.restore();
  } else if (v.carry === "glass") {
    const gx = handF.x, gy = handF.y;
    ctx.fillStyle = "rgba(220,240,240,0.35)";
    ctx.beginPath();
    ctx.moveTo(gx - 2.4, gy - 7);
    ctx.lineTo(gx + 2.4, gy - 7);
    ctx.lineTo(gx + 1.9, gy + 1);
    ctx.lineTo(gx - 1.9, gy + 1);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#c27b3a";
    ctx.fillRect(gx - 2.1, gy - 4.5, 4.2, 5.2);
    ctx.fillStyle = "rgba(255,255,255,0.7)";
    ctx.fillRect(gx - 1.9, gy - 6.5, 0.7, 6.5);
    ctx.strokeStyle = "rgba(220,240,240,0.28)";
    ctx.lineWidth = 0.9;
    for (let k = 0; k < 2; k++) {
      ctx.beginPath();
      ctx.moveTo(gx - 1 + k * 2, gy - 8);
      for (let j = 1; j <= 5; j++) ctx.lineTo(gx - 1 + k * 2 + Math.sin(t * 3 + j * 1.3 + k * 2) * 1.6, gy - 8 - j * 2.6);
      ctx.stroke();
    }
  }

  // Error: a small red warning badge by the head.
  if (v.status === "error") {
    const bx = hd.x - fc * 10, by = hd.y - 6;
    ctx.fillStyle = "#f87171";
    ctx.beginPath();
    ctx.moveTo(bx, by - 4.5);
    ctx.lineTo(bx + 4.5, by + 3.5);
    ctx.lineTo(bx - 4.5, by + 3.5);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#2a0505";
    ctx.fillRect(bx - 0.5, by - 1.8, 1, 3);
    ctx.fillRect(bx - 0.5, by + 1.8, 1, 1);
  }
  ctx.globalAlpha = 1;
}

/** Head-top y of a villager (for leaders and badges). */
export const headTop = (v: LiveVillager) => v.y - BODY.height - v.jump * 26;

// ── holo panel ─────────────────────────────────────────────────────────────

export function holoPanel(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, skew: number, t: number, seed: number, kind: "code" | "task", title: string, meter: number) {
  const C = "94,234,212";
  ctx.save();
  ctx.translate(x, y);
  ctx.transform(1, skew, 0, 1, 0, 0);
  ctx.globalAlpha = 0.88 + 0.12 * Math.sin(t * 21 + x);
  ctx.globalCompositeOperation = "lighter";
  ctx.fillStyle = `rgba(${C},0.1)`;
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = `rgba(${C},0.65)`;
  ctx.lineWidth = 0.5;
  ctx.strokeRect(0, 0, w, h);
  ctx.strokeStyle = "rgba(200,255,245,0.9)";
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  for (const [cx, cy, sx, sy] of [[0, 0, 1, 1], [w, 0, -1, 1], [0, h, 1, -1], [w, h, -1, -1]] as const) {
    ctx.moveTo(cx + sx * 4, cy);
    ctx.lineTo(cx, cy);
    ctx.lineTo(cx, cy + sy * 4);
  }
  ctx.stroke();
  ctx.font = "600 4.6px ui-monospace, Consolas, monospace";
  ctx.textAlign = "left";
  ctx.fillStyle = "rgba(210,255,248,0.95)";
  if (kind === "code") {
    ctx.fillText(title.length > 12 ? title.slice(0, 11) + "…" : title, 2.5, 5.5);
    ctx.save();
    ctx.beginPath();
    ctx.rect(1, 7.5, w - 2, h - 9);
    ctx.clip();
    const step = 3.2, scroll = t * 7;
    const first = Math.floor(scroll / step);
    for (let i = 0; i < 9; i++) {
      const li = first + i + seed * 31;
      const yy = 9 + i * step - (scroll % step);
      const ind = (hash(li * 3.1) * 3) | 0;
      const len = 6 + hash(li) * (w - 14);
      const hue = hash(li * 7.7);
      ctx.fillStyle = hue < 0.55 ? `rgba(${C},0.85)` : hue < 0.8 ? "rgba(255,255,255,0.7)" : "rgba(255,190,110,0.85)";
      ctx.fillRect(3 + ind * 3, yy, len, 1.3);
    }
    ctx.restore();
  } else {
    ctx.fillText("TASK", 2.5, 5.5);
    ctx.fillStyle = `rgba(${C},0.25)`;
    ctx.fillRect(2.5, 9, w - 5, 3);
    ctx.fillStyle = `rgba(${C},0.95)`;
    ctx.fillRect(2.5, 9, (w - 5) * meter, 3);
    for (let i = 0; i < 5; i++) {
      const hh = 2 + hash(i + seed + Math.floor(t * 2)) * 6;
      ctx.fillStyle = i < meter * 6 ? "rgba(163,230,53,0.85)" : `rgba(${C},0.4)`;
      ctx.fillRect(3 + i * ((w - 6) / 5), h - 2 - hh, (w - 6) / 5 - 1.5, hh);
    }
  }
  const sy = ((t * 0.7 + x * 0.01) % 1) * h;
  ctx.fillStyle = `rgba(${C},0.25)`;
  ctx.fillRect(0, sy, w, 0.8);
  ctx.restore();
}

// ════════════════════════════════════════════════════════════════════════════
// Bengaluru (f.theme === "bengaluru"): the same CGI night, a city instead of
// the backwaters. Cached separately from Kerala (own tiles and sprite keys).
// ════════════════════════════════════════════════════════════════════════════

/** Metro viaduct geometry (world y): the train rides on DECK_TOP. */
export const DECK_TOP = 160;
export const DECK_BOT = 172;

function softBlob(c: CanvasRenderingContext2D, x: number, y: number, r: number, sy: number, col: string) {
  const g = c.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, col);
  g.addColorStop(1, col.replace(/[\d.]+\)$/, "0)"));
  c.save();
  c.translate(x, y);
  c.scale(1, sy);
  c.translate(-x, -y);
  c.fillStyle = g;
  c.fillRect(x - r, y - r, r * 2, r * 2);
  c.restore();
}

function litWindows(c: CanvasRenderingContext2D, r: () => number, x: number, y: number, w: number, h: number, cw: number, ch: number, p: number, dim = 1) {
  for (let yy = y + 2; yy + ch <= y + h - 1; yy += ch + 2) {
    for (let xx = x + 2; xx + cw <= x + w - 1; xx += cw + 1.6) {
      const q = r();
      if (q > p) continue;
      c.fillStyle = q < p * 0.6 ? `rgba(255,205,130,${(0.45 + r() * 0.45) * dim})` : `rgba(150,225,255,${(0.35 + r() * 0.4) * dim})`;
      c.fillRect(xx, yy, cw, ch);
    }
  }
}

// ── far tile: night sky, moonlit clouds, the tech skyline, park canopy ────

function paintFarCity(c: CanvasRenderingContext2D) {
  const sky = c.createLinearGradient(0, 0, 0, GROUND.waterTop);
  sky.addColorStop(0, "#030a12");
  sky.addColorStop(0.55, "#071f2c");
  sky.addColorStop(1, "#123a48");
  c.fillStyle = sky;
  c.fillRect(0, -20, TILE_W, GROUND.waterTop + 22);
  const r = rng(88);
  for (let i = 0; i < 40; i++) {
    const x = r() * TILE_W, y = r() * 80, a = 0.15 + r() * 0.5;
    c.fillStyle = `rgba(200,240,255,${a})`;
    c.fillRect(x, y, 0.8, 0.8);
  }
  // Soft moonlit clouds.
  for (let i = 0; i < 4; i++) {
    const cx = 60 + i * 160 + (i % 2) * 40, cy = 26 + (i % 3) * 16;
    for (let k = 0; k < 6; k++) softBlob(c, cx + (k - 2.5) * 13, cy + Math.sin(k * 1.7) * 3, 18 + (k % 3) * 5, 0.45, "rgba(80,140,160,0.16)");
  }
  const hy = GROUND.waterTop + 4;
  const s = rng(707);
  // Back row: dim, hazy blocks.
  for (let i = 0; i < 24; i++) {
    const x = i * 27 + s() * 8, w = 14 + s() * 14, h = 34 + s() * 46;
    c.fillStyle = "#0a2230";
    c.fillRect(x, hy - h, w, h);
    litWindows(c, s, x, hy - h, w, h, 1.6, 1.4, 0.18, 0.5);
  }
  // Cranes over sites under construction.
  for (const cx of [190, 500]) {
    const top = hy - 128;
    c.strokeStyle = "#16343e";
    c.lineWidth = 1;
    c.beginPath();
    c.moveTo(cx - 2, hy);
    c.lineTo(cx - 2, top);
    c.moveTo(cx + 2, hy);
    c.lineTo(cx + 2, top);
    for (let y = hy; y > top + 4; y -= 6) {
      c.moveTo(cx - 2, y);
      c.lineTo(cx + 2, y - 6);
    }
    c.moveTo(cx - 22, top + 2);
    c.lineTo(cx + 64, top + 2);
    c.moveTo(cx - 22, top + 5);
    c.lineTo(cx + 64, top + 5);
    c.moveTo(cx, top - 10);
    c.lineTo(cx + 60, top + 2);
    c.moveTo(cx, top - 10);
    c.lineTo(cx - 20, top + 2);
    c.moveTo(cx + 44, top + 5);
    c.lineTo(cx + 44, top + 30);
    c.stroke();
    c.fillStyle = "#16343e";
    c.fillRect(cx - 22, top + 2, 8, 6);
    c.fillStyle = "#ff5040";
    c.fillRect(cx - 0.8, top - 11.5, 1.6, 1.6);
    softBlob(c, cx, top - 10.5, 6, 1, "rgba(255,80,60,0.5)");
  }
  // Front row: glass towers and apartment blocks (some with water tanks).
  for (let i = 0; i < 13; i++) {
    const x = i * 50 + s() * 18 - 6;
    if (s() < 0.55) {
      const w = 18 + s() * 14, h = 60 + s() * 62;
      const g = c.createLinearGradient(x, 0, x + w, 0);
      g.addColorStop(0, "#123447");
      g.addColorStop(1, "#071824");
      c.fillStyle = g;
      c.fillRect(x, hy - h, w, h);
      c.strokeStyle = "rgba(120,200,220,0.12)";
      c.lineWidth = 0.4;
      c.beginPath();
      for (let yy = hy - h + 4; yy < hy; yy += 4) {
        c.moveTo(x, yy);
        c.lineTo(x + w, yy);
      }
      c.stroke();
      litWindows(c, s, x, hy - h, w, h, 2.2, 2, 0.32);
      c.fillStyle = RIM + "0.45)";
      c.fillRect(x + w - 0.8, hy - h, 0.8, h);
      c.fillRect(x, hy - h, w, 0.6);
      if (s() < 0.5) {
        c.fillStyle = "#0b2230";
        c.fillRect(x + w / 2 - 0.5, hy - h - 10, 1, 10);
        c.fillStyle = "#ff5a4f";
        c.fillRect(x + w / 2 - 0.8, hy - h - 11, 1.6, 1.6);
      }
    } else {
      const w = 30 + s() * 16, h = 38 + s() * 30;
      c.fillStyle = "#0d2429";
      c.fillRect(x, hy - h, w, h);
      for (let yy = hy - h + 5; yy < hy; yy += 5) {
        c.fillStyle = "rgba(0,0,0,0.35)";
        c.fillRect(x, yy, w, 1);
      }
      litWindows(c, s, x, hy - h, w, h, 3, 2.4, 0.3);
      c.fillStyle = RIM + "0.35)";
      c.fillRect(x + w - 0.8, hy - h, 0.8, h);
      const tanks = 1 + (s() < 0.5 ? 1 : 0);
      for (let k = 0; k < tanks; k++) {
        const tx = x + 5 + k * 12;
        c.fillStyle = "#06141a";
        c.fillRect(tx, hy - h - 6, 7, 6);
        c.beginPath();
        c.ellipse(tx + 3.5, hy - h - 6, 3.5, 1.2, 0, 0, Math.PI * 2);
        c.fill();
        c.fillStyle = RIM + "0.4)";
        c.fillRect(tx + 6.3, hy - h - 6, 0.7, 6);
      }
    }
  }
  const haze = c.createLinearGradient(0, hy - 40, 0, hy);
  haze.addColorStop(0, "rgba(40,130,140,0)");
  haze.addColorStop(1, "rgba(60,160,170,0.3)");
  c.fillStyle = haze;
  c.fillRect(0, hy - 40, TILE_W, 40);
  // Park behind the viaduct: dark lawn and tree canopy with a few blooms.
  const lawn = c.createLinearGradient(0, GROUND.waterTop, 0, FAR_H);
  lawn.addColorStop(0, "#0b2a28");
  lawn.addColorStop(1, "#04151a");
  c.fillStyle = lawn;
  c.fillRect(0, GROUND.waterTop + 2, TILE_W, FAR_H - GROUND.waterTop - 2);
  const p = rng(515);
  for (let x = -4; x < TILE_W + 8; x += 9 + p() * 8) {
    const y = GROUND.waterTop + 6 + p() * 8, rr = 7 + p() * 8;
    c.fillStyle = p() < 0.5 ? "#0a2a24" : "#08221e";
    c.beginPath();
    c.arc(x, y, rr, 0, Math.PI * 2);
    c.fill();
    if (p() < 0.4) {
      c.fillStyle = "rgba(190,70,45,0.55)";
      for (let k = 0; k < 4; k++) c.fillRect(x - rr * 0.6 + p() * rr * 1.2, y - rr * 0.7 + p() * rr * 0.8, 1.4, 1.4);
    }
  }
  for (let i = 0; i < 6; i++) softBlob(c, 50 + i * 107, GROUND.waterTop + 30, 18, 0.5, "rgba(255,190,110,0.12)");
}

// ── viaduct tile: deck, purple stripe, pillars (sharp, world-locked) ──────

function paintViaduct(c: CanvasRenderingContext2D) {
  for (let x = 40; x < TILE_W; x += 80) {
    const pg = c.createLinearGradient(x - 4, 0, x + 4, 0);
    pg.addColorStop(0, "#2c3d44");
    pg.addColorStop(1, "#0d171b");
    c.fillStyle = pg;
    c.fillRect(x - 3.5, DECK_BOT, 7, FAR_H - DECK_BOT);
    c.beginPath();
    c.moveTo(x - 10, DECK_BOT);
    c.lineTo(x + 10, DECK_BOT);
    c.lineTo(x + 4, DECK_BOT + 6);
    c.lineTo(x - 4, DECK_BOT + 6);
    c.closePath();
    c.fill();
    c.fillStyle = RIM + "0.35)";
    c.fillRect(x + 3, DECK_BOT + 4, 0.7, FAR_H - DECK_BOT - 4);
  }
  const d = c.createLinearGradient(0, DECK_TOP - 2, 0, DECK_BOT);
  d.addColorStop(0, "#4a5d66");
  d.addColorStop(0.3, "#2a3a42");
  d.addColorStop(1, "#121c21");
  c.fillStyle = d;
  c.fillRect(0, DECK_TOP - 2, TILE_W, DECK_BOT - DECK_TOP + 2);
  c.fillStyle = "#6a46b8";
  c.fillRect(0, DECK_TOP + 4.5, TILE_W, 2);
  c.fillStyle = "rgba(170,130,255,0.35)";
  c.fillRect(0, DECK_TOP + 4.5, TILE_W, 0.6);
  c.fillStyle = RIM + "0.7)";
  c.fillRect(0, DECK_TOP - 2, TILE_W, 0.7);
  c.fillStyle = "rgba(0,0,0,0.5)";
  c.fillRect(0, DECK_BOT, TILE_W, 1.5);
  // Small lights under the deck.
  for (let x = 20; x < TILE_W; x += 40) {
    c.fillStyle = "rgba(220,250,255,0.9)";
    c.fillRect(x - 1, DECK_BOT - 1, 2, 1);
    softBlob(c, x, DECK_BOT + 1, 5, 0.6, "rgba(180,240,255,0.35)");
  }
}

// ── ground tile: wet pavers, black-yellow kerbs, asphalt road ─────────────

function paintGroundCity(c: CanvasRenderingContext2D) {
  const gy = GROUND.groundY, pt = GROUND.pathTop, pb = GROUND.pathBottom;
  const gr = c.createLinearGradient(0, gy, 0, WORLD_H);
  gr.addColorStop(0, "#0d2830");
  gr.addColorStop(0.35, "#081b21");
  gr.addColorStop(1, "#040e12");
  c.fillStyle = gr;
  c.fillRect(0, gy, TILE_W, WORLD_H - gy);
  c.fillStyle = "rgba(120,220,230,0.22)";
  c.fillRect(0, gy, TILE_W, 1);
  // Lawn strip along the park railing.
  c.fillStyle = "#0a2620";
  c.fillRect(0, gy + 1, TILE_W, 7);
  c.fillStyle = "rgba(120,220,180,0.12)";
  c.fillRect(0, gy + 8, TILE_W, 0.6);
  // Pavers (running bond).
  c.strokeStyle = "rgba(130,210,220,0.07)";
  c.lineWidth = 0.5;
  c.beginPath();
  let row = 0;
  for (let y = gy + 12; y < pt - 4; y += 9, row++) {
    c.moveTo(0, y);
    c.lineTo(TILE_W, y);
    for (let x = (row % 2) * 8; x < TILE_W; x += 16) {
      c.moveTo(x, y);
      c.lineTo(x, Math.min(y + 9, pt - 4));
    }
  }
  c.stroke();
  // The viaduct's purple stripe and deck lights mirrored in the wet pavers.
  c.fillStyle = "rgba(120,80,200,0.12)";
  c.fillRect(0, gy + 10, TILE_W, 3);
  for (let x = 20; x < TILE_W; x += 40) softBlob(c, x, gy + 16, 9, 1.6, "rgba(180,240,255,0.08)");
  // Road.
  const road = c.createLinearGradient(0, pt, 0, pb);
  road.addColorStop(0, "#0a1519");
  road.addColorStop(0.5, "#0c1a1f");
  road.addColorStop(1, "#071116");
  c.fillStyle = road;
  c.fillRect(0, pt, TILE_W, pb - pt);
  const sheen = c.createLinearGradient(0, pt, 0, pb);
  sheen.addColorStop(0, "rgba(90,170,190,0)");
  sheen.addColorStop(0.5, "rgba(90,170,190,0.07)");
  sheen.addColorStop(1, "rgba(90,170,190,0)");
  c.fillStyle = sheen;
  c.fillRect(0, pt, TILE_W, pb - pt);
  c.fillStyle = "rgba(220,235,235,0.4)";
  const mid = (pt + pb) / 2;
  for (let x = 4; x < TILE_W; x += 40) c.fillRect(x, mid - 0.8, 18, 1.6);
  c.fillStyle = "rgba(230,200,110,0.22)";
  c.fillRect(0, pt + 4, TILE_W, 0.8);
  c.fillRect(0, pb - 4.8, TILE_W, 0.8);
  // Kerbs, black and yellow.
  for (const ky of [pt - 4, pb]) {
    for (let x = 0; x < TILE_W; x += 10) {
      c.fillStyle = (x / 10) % 2 ? "#0d1012" : "#8f7426";
      c.fillRect(x, ky, 10, 4);
    }
    c.fillStyle = RIM + "0.3)";
    c.fillRect(0, ky, TILE_W, 0.6);
  }
  // Puddles.
  const r = rng(31);
  for (let i = 0; i < 14; i++) {
    const x = r() * TILE_W, y = 210 + r() * 140, rx = 14 + r() * 40;
    softBlob(c, x, y, rx, 0.16, "rgba(90,180,195,0.16)");
  }
}

export interface CityTiles { far: HTMLCanvasElement; viaduct: HTMLCanvasElement; ground: HTMLCanvasElement }
let cityTiles: CityTiles | null = null;
export function getCityTiles(): CityTiles {
  if (!cityTiles) {
    const groundCv = makeCanvas(TILE_W * S, WORLD_H * S);
    const gc = groundCv.getContext("2d")!;
    gc.scale(S, S);
    paintGroundCity(gc);
    cityTiles = { far: tileLayer(FAR_H, 2.4, paintFarCity), viaduct: tileLayer(FAR_H, 0, paintViaduct), ground: groundCv };
  }
  return cityTiles;
}

// ── gulmohar / rain trees (sprite per size/lean) ──────────────────────────

function paintTree(c: CanvasRenderingContext2D, h: number, lean: number) {
  const r = rng(Math.round(h * 13 + lean * 1000));
  const topX = lean * h * 0.7, topY = -h * 0.62;
  c.fillStyle = "rgba(0,0,0,0.4)";
  c.beginPath();
  c.ellipse(0, 1, 14, 3, 0, 0, Math.PI * 2);
  c.fill();
  // Trunk and branches.
  c.lineCap = "round";
  const tg = c.createLinearGradient(-4, 0, 4, 0);
  tg.addColorStop(0, "#2b2a26");
  tg.addColorStop(1, "#141412");
  c.strokeStyle = tg;
  c.lineWidth = 6;
  c.beginPath();
  c.moveTo(0, 0);
  c.quadraticCurveTo(lean * h * 0.2, -h * 0.35, topX, topY);
  c.stroke();
  c.lineWidth = 3;
  c.beginPath();
  for (const [bx, by] of [[-0.3, -0.85], [0.32, -0.8], [0, -0.95]] as const) {
    c.moveTo(topX, topY);
    c.quadraticCurveTo(topX + bx * h * 0.2, topY - h * 0.1, topX + bx * h, by * h);
  }
  c.stroke();
  c.strokeStyle = RIM + "0.4)";
  c.lineWidth = 0.8;
  c.beginPath();
  c.moveTo(2.6, 0);
  c.quadraticCurveTo(lean * h * 0.2 + 2.4, -h * 0.35, topX + 1.4, topY);
  c.stroke();
  // Canopy: a wide umbrella of leaf clusters.
  const cx = topX, cy = -h * 0.82, R = h * 0.34;
  const blobs: [number, number, number][] = [];
  for (let i = 0; i < 16; i++) {
    const a = r() * Math.PI * 2, d = Math.sqrt(r());
    blobs.push([cx + Math.cos(a) * R * d * 1.05, cy + Math.sin(a) * R * d * 0.45, R * (0.32 + r() * 0.18)]);
  }
  blobs.sort((a, b) => a[1] - b[1]);
  for (const [x, y, rr] of blobs) {
    const g = c.createRadialGradient(x - rr * 0.3, y - rr * 0.4, rr * 0.1, x, y, rr);
    g.addColorStop(0, "#1a4a3a");
    g.addColorStop(1, "#071a16");
    c.fillStyle = g;
    c.beginPath();
    c.arc(x, y, rr, 0, Math.PI * 2);
    c.fill();
    c.strokeStyle = RIM + "0.28)";
    c.lineWidth = 0.6;
    c.beginPath();
    c.arc(x, y, rr - 0.4, -Math.PI * 0.55, -Math.PI * 0.05);
    c.stroke();
  }
  // Red-orange blooms, brighter on top.
  for (let i = 0; i < 70; i++) {
    const a = r() * Math.PI * 2, d = Math.sqrt(r());
    const x = cx + Math.cos(a) * R * d * 1.15, y = cy + Math.sin(a) * R * d * 0.5 - R * 0.1;
    const top = y < cy;
    c.fillStyle = top ? (r() < 0.5 ? "#e0582e" : "#f08a3c") : "#9a3420";
    c.globalAlpha = top ? 0.9 : 0.7;
    c.beginPath();
    c.arc(x, y, 1 + r() * 1.2, 0, Math.PI * 2);
    c.fill();
  }
  c.globalAlpha = 1;
}

const treeCache = new Map<string, Sprite>();
export function treeSprite(h: number, lean: number): Sprite {
  const key = `city|${Math.round(h)}|${lean.toFixed(3)}`;
  let s = treeCache.get(key);
  if (!s) {
    if (treeCache.size > 64) treeCache.clear();
    const topX = lean * h * 0.7, R = h * 0.34;
    const left = Math.min(0, topX) - R * 1.3 - 6, right = Math.max(0, topX) + R * 1.3 + 6;
    const top = -h * 0.82 - R * 0.75 - 6, bottom = 8;
    s = sprite(right - left, bottom - top, left, top, (c) => paintTree(c, h, lean));
    treeCache.set(key, s);
  }
  return s;
}

// ── city buildings per variant ─────────────────────────────────────────────

function cityBoardAndSpill(c: CanvasRenderingContext2D, p: LivePlace, y: number, doorX: number, glows: [number, number][]) {
  const w = p.building.w;
  const bw = w - 20, bx = 10, by = y + 6, bh = 14;
  c.fillStyle = "#0c0e12";
  c.beginPath();
  c.roundRect(bx, by, bw, bh, 2.5);
  c.fill();
  c.strokeStyle = "rgba(255,190,110,0.55)";
  c.lineWidth = 0.6;
  c.stroke();
  c.save();
  const name = fitText(c, p.name.toUpperCase(), bw - 8, "700", 8, 5.5);
  c.shadowColor = "#ffb35c";
  c.shadowBlur = 8;
  c.textAlign = "center";
  c.fillStyle = "#ffd9a0";
  c.fillText(name, bx + bw / 2, by + 10);
  c.restore();
  c.save();
  c.globalCompositeOperation = "lighter";
  const spill = c.createRadialGradient(doorX, 4, 2, doorX, 4, 60);
  spill.addColorStop(0, "rgba(255,160,70,0.32)");
  spill.addColorStop(1, "rgba(255,160,70,0)");
  c.fillStyle = spill;
  c.save();
  c.translate(doorX, 4);
  c.scale(1, 0.35);
  c.fillRect(-60, -60, 120, 120);
  c.restore();
  c.globalAlpha = 0.45;
  for (const [x0, w0] of glows) c.drawImage(glow("#ff9a3a"), x0 - 4, -20, w0 + 8, 80);
  c.restore();
}

function litDoor(c: CanvasRenderingContext2D, doorX: number, top: number, glass: boolean) {
  const door = c.createLinearGradient(0, top, 0, 0);
  door.addColorStop(0, glass ? "#d8f4ff" : "#ffcf86");
  door.addColorStop(1, glass ? "#4aa0b8" : "#c4621f");
  c.fillStyle = door;
  c.fillRect(doorX - 11, top, 22, -top);
  c.fillStyle = "#101418";
  c.fillRect(doorX - 12, top - 1, 24, 1.5);
  c.fillRect(doorX - 12, top - 1, 1.5, -top + 1);
  c.fillRect(doorX + 10.5, top - 1, 1.5, -top + 1);
  if (glass) c.fillRect(doorX - 0.5, top, 1, -top);
}

function paintCityBuilding(c: CanvasRenderingContext2D, p: LivePlace) {
  const b = p.building;
  const w = b.w, wallH = b.wallH, roofH = b.roofH, doorX = b.doorX - b.x;
  const y = -wallH;
  const v = p.variant % 4;
  const r = rng(17 + v * 101 + Math.round(w));
  c.fillStyle = "rgba(0,0,0,0.45)";
  c.beginPath();
  c.ellipse(w / 2, 2, w * 0.6, 6, 0, 0, Math.PI * 2);
  c.fill();
  const glows: [number, number][] = [[doorX - 10, 20]];

  if (v === 0) {
    // Glass office block.
    const top = y - roofH;
    const g = c.createLinearGradient(0, 0, w, 0);
    g.addColorStop(0, "#15405a");
    g.addColorStop(1, "#071a26");
    c.fillStyle = g;
    c.fillRect(0, top, w, -top);
    litWindows(c, r, 0, top + 2, w, -30 - top, 9, 6, 0.42);
    c.strokeStyle = "rgba(140,220,240,0.22)";
    c.lineWidth = 0.6;
    c.beginPath();
    for (let x = 0; x <= w; x += 10.6) {
      c.moveTo(x, top);
      c.lineTo(x, -30);
    }
    for (let yy = top + 8; yy < -30; yy += 8) {
      c.moveTo(0, yy);
      c.lineTo(w, yy);
    }
    c.stroke();
    c.save();
    c.beginPath();
    c.rect(0, top, w, -top);
    c.clip();
    c.fillStyle = "rgba(150,236,255,0.07)";
    c.beginPath();
    c.moveTo(w * 0.55, top);
    c.lineTo(w * 0.75, top);
    c.lineTo(w * 0.25, 0);
    c.lineTo(w * 0.05, 0);
    c.fill();
    c.restore();
    c.fillStyle = "#0a1820";
    c.fillRect(-2, top - 3, w + 4, 3);
    c.fillStyle = RIM + "0.7)";
    c.fillRect(-2, top - 3, w + 4, 0.7);
    // Lit lobby under a canopy.
    const lob = c.createLinearGradient(0, -30, 0, 0);
    lob.addColorStop(0, "#ffe2b0");
    lob.addColorStop(1, "#b86a2a");
    c.fillStyle = lob;
    c.fillRect(6, -28, w - 12, 28);
    c.fillStyle = "rgba(20,30,36,0.55)";
    for (let x = 10; x < w - 8; x += 18) c.fillRect(x, -28, 1.2, 28);
    c.fillStyle = "#0b1a20";
    c.fillRect(-4, -32, w + 8, 4);
    c.fillStyle = RIM + "0.6)";
    c.fillRect(-4, -32, w + 8, 0.6);
    litDoor(c, doorX, -27, true);
    glows.push([8, w - 16]);
  } else if (v === 1) {
    // Darshini café: open steel counter, menu board, flat roof.
    const [wallA, wallB] = WALLS[1]!;
    const g = c.createLinearGradient(0, 0, w, 0);
    g.addColorStop(0, wallA);
    g.addColorStop(1, wallB);
    c.fillStyle = g;
    const top = y - roofH * 0.7;
    c.fillRect(0, top, w, -top);
    c.fillStyle = "#0e161b";
    c.fillRect(-3, top - 3, w + 6, 4);
    c.fillStyle = RIM + "0.6)";
    c.fillRect(-3, top - 3, w + 6, 0.7);
    // Upper floor: a home above the café, with a balcony.
    for (let i = 0; i < 4; i++) {
      const ux = 10 + i * ((w - 20) / 4), uw = (w - 20) / 4 - 8;
      const on = r() < 0.6;
      c.fillStyle = on ? "#e8a050" : "#0a1418";
      c.fillRect(ux, top + 5, uw, 12);
      c.fillStyle = "rgba(10,14,16,0.8)";
      c.fillRect(ux + uw / 2 - 0.5, top + 5, 1, 12);
    }
    c.strokeStyle = "rgba(170,190,196,0.6)";
    c.lineWidth = 0.6;
    c.beginPath();
    c.moveTo(4, top + 17);
    c.lineTo(w - 4, top + 17);
    for (let x = 6; x < w - 4; x += 4) {
      c.moveTo(x, top + 17);
      c.lineTo(x, top + 22);
    }
    c.moveTo(4, top + 22);
    c.lineTo(w - 4, top + 22);
    c.stroke();
    c.fillStyle = "#0e161b";
    c.fillRect(-3, y - 4, w + 6, 3);
    const wx = 8, wy = y + 24, ww = Math.max(30, doorX - 12 - 18), wh = 30;
    const inner = c.createLinearGradient(0, wy, 0, wy + wh);
    inner.addColorStop(0, "#ffd08a");
    inner.addColorStop(1, "#b9541c");
    c.fillStyle = inner;
    c.fillRect(wx, wy, ww, wh);
    c.fillStyle = "rgba(240,255,255,0.95)";
    c.fillRect(wx + 4, wy + 2, ww - 8, 1.2);
    for (let i = 0; i < 3; i++) {
      const vx = wx + 4 + i * 11;
      const sg = c.createLinearGradient(vx, 0, vx + 9, 0);
      sg.addColorStop(0, "#e8eef0");
      sg.addColorStop(0.5, "#8d9aa2");
      sg.addColorStop(1, "#3a454c");
      c.fillStyle = sg;
      c.beginPath();
      c.roundRect(vx, wy + wh - 13, 9, 12, 2);
      c.fill();
    }
    c.fillStyle = "rgba(30,14,6,0.8)";
    c.fillRect(wx + ww - 18, wy + 6, 14, 10);
    c.fillStyle = "rgba(255,240,210,0.6)";
    for (let k = 0; k < 3; k++) c.fillRect(wx + ww - 16, wy + 8 + k * 3, 10 - k * 2, 0.8);
    const counter = c.createLinearGradient(0, wy + wh, 0, wy + wh + 6);
    counter.addColorStop(0, "#b8c4ca");
    counter.addColorStop(1, "#3c464c");
    c.fillStyle = counter;
    c.fillRect(wx - 3, wy + wh - 1, ww + 6, 6);
    for (let i = 0; i < 4; i++) {
      const gx = wx + 40 + i * 7;
      if (gx > wx + ww - 22) break;
      c.fillStyle = "rgba(220,230,235,0.7)";
      c.fillRect(gx, wy + wh - 6, 3.4, 5);
      c.fillStyle = "#b8743a";
      c.fillRect(gx, wy + wh - 4, 3.4, 3);
    }
    litDoor(c, doorX, y + 24, false);
    if (w - doorX > 40) {
      const sx = doorX + 18, sw = Math.min(26, w - doorX - 26);
      c.fillStyle = "#e48f3e";
      c.fillRect(sx, y + 28, sw, 16);
      c.strokeStyle = "#101418";
      c.lineWidth = 1.2;
      c.strokeRect(sx, y + 28, sw, 16);
    }
    glows.push([wx + 4, ww - 8]);
  } else if (v === 2) {
    // Co-working loft: brick, big factory windows, a water tank on the roof.
    const top = y - roofH * 0.55;
    const g = c.createLinearGradient(0, 0, w, 0);
    g.addColorStop(0, "#4a2620");
    g.addColorStop(1, "#1e0f0c");
    c.fillStyle = g;
    c.fillRect(0, top, w, -top);
    c.strokeStyle = "rgba(0,0,0,0.35)";
    c.lineWidth = 0.5;
    c.beginPath();
    let row = 0;
    for (let yy = top + 3.5; yy < 0; yy += 3.5, row++) {
      c.moveTo(0, yy);
      c.lineTo(w, yy);
      for (let x = (row % 2) * 4; x < w; x += 8) {
        c.moveTo(x, yy);
        c.lineTo(x, yy - 3.5);
      }
    }
    c.stroke();
    const win = (x: number, yy: number, ww: number, hh: number) => {
      const ig = c.createLinearGradient(0, yy, 0, yy + hh);
      ig.addColorStop(0, "#ffd79a");
      ig.addColorStop(1, "#c46a28");
      c.fillStyle = ig;
      c.fillRect(x, yy, ww, hh);
      c.strokeStyle = "#141010";
      c.lineWidth = 1;
      c.strokeRect(x, yy, ww, hh);
      c.beginPath();
      for (let gx = x + 6; gx < x + ww; gx += 6) {
        c.moveTo(gx, yy);
        c.lineTo(gx, yy + hh);
      }
      c.moveTo(x, yy + hh / 2);
      c.lineTo(x + ww, yy + hh / 2);
      c.stroke();
    };
    win(8, top + 4, w * 0.38, 14);
    win(w * 0.55, top + 4, w * 0.38, 14);
    const lw = Math.max(30, doorX - 32);
    win(8, y + 24, lw, 26);
    litDoor(c, doorX, y + 24, true);
    c.fillStyle = "#120c0a";
    c.fillRect(-2, top - 3, w + 4, 3);
    c.fillStyle = RIM + "0.6)";
    c.fillRect(-2, top - 3, w + 4, 0.7);
    const tx = w - 34;
    c.fillStyle = "#0c1114";
    c.fillRect(tx, top - 15, 16, 12);
    c.beginPath();
    c.ellipse(tx + 8, top - 15, 8, 2.2, 0, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = RIM + "0.5)";
    c.fillRect(tx + 15, top - 15, 0.8, 12);
    c.fillStyle = "#0c1114";
    c.fillRect(tx + 2, top - 3, 1.5, 3);
    c.fillRect(tx + 12.5, top - 3, 1.5, 3);
    glows.push([12, lw - 8]);
  } else {
    // Kiosk / shop with a striped awning.
    const [wallA, wallB] = WALLS[3]!;
    const g = c.createLinearGradient(0, 0, w, 0);
    g.addColorStop(0, wallA);
    g.addColorStop(1, wallB);
    c.fillStyle = g;
    c.fillRect(0, y - 6, w, wallH + 6);
    c.fillStyle = "#0e1016";
    c.fillRect(-2, y - 9, w + 4, 4);
    c.fillStyle = RIM + "0.55)";
    c.fillRect(-2, y - 9, w + 4, 0.7);
    const sx = 6, sw = doorX - 16 - sx, sy = y + 32;
    const ig = c.createLinearGradient(0, sy, 0, 0);
    ig.addColorStop(0, "#ffd696");
    ig.addColorStop(1, "#b55a20");
    c.fillStyle = ig;
    c.fillRect(sx, sy, sw, -sy - 6);
    const cols = ["#3a7a9a", "#c8463a", "#d8b03a", "#5a9a4a", "#8a5ab8"];
    for (let rr = 0; rr < 3; rr++) {
      c.fillStyle = "rgba(60,24,10,0.6)";
      c.fillRect(sx + 2, sy + 10 + rr * 10, sw - 4, 1.2);
      for (let x = sx + 4; x < sx + sw - 6; x += 5) {
        c.fillStyle = cols[(r() * cols.length) | 0]!;
        c.globalAlpha = 0.85;
        c.fillRect(x, sy + 3 + rr * 10, 3.6, 6.5 - r() * 2);
      }
      c.globalAlpha = 1;
    }
    c.fillStyle = "#3a2a1c";
    c.fillRect(sx - 2, -7, sw + 4, 7);
    litDoor(c, doorX, y + 32, false);
    if (w - doorX > 30) {
      const rx = doorX + 16, rw = w - doorX - 22;
      c.fillStyle = "#e48f3e";
      c.fillRect(rx, y + 32, rw, -y - 32);
      const sh = c.createLinearGradient(0, y + 32, 0, y + 50);
      sh.addColorStop(0, "#5a6168");
      sh.addColorStop(1, "#2a2f34");
      c.fillStyle = sh;
      c.fillRect(rx, y + 32, rw, 18);
      c.fillStyle = "rgba(0,0,0,0.35)";
      for (let yy = y + 34; yy < y + 50; yy += 2) c.fillRect(rx, yy, rw, 0.6);
    }
    const ay = y + 22, ah = 10;
    c.save();
    c.beginPath();
    c.moveTo(-6, ay + ah);
    c.lineTo(2, ay);
    c.lineTo(w - 2, ay);
    c.lineTo(w + 6, ay + ah);
    for (let x = w + 6; x > -6; x -= 8) c.quadraticCurveTo(x - 4, ay + ah + 4, x - 8, ay + ah);
    c.closePath();
    c.clip();
    for (let x = -6, k = 0; x < w + 6; x += 8, k++) {
      c.fillStyle = k % 2 ? "#d8cbb0" : "#8a2a22";
      c.fillRect(x, ay, 8, ah + 5);
    }
    const sh = c.createLinearGradient(0, ay, 0, ay + ah + 4);
    sh.addColorStop(0, "rgba(6,20,28,0.15)");
    sh.addColorStop(1, "rgba(6,20,28,0.55)");
    c.fillStyle = sh;
    c.fillRect(-6, ay, w + 12, ah + 5);
    c.restore();
    c.strokeStyle = RIM + "0.6)";
    c.lineWidth = 0.8;
    c.beginPath();
    c.moveTo(2, ay);
    c.lineTo(w - 2, ay);
    c.lineTo(w + 6, ay + ah);
    c.stroke();
    glows.push([sx + 4, sw - 8]);
  }
  c.fillStyle = RIM + "0.4)";
  c.fillRect(w - 1, y, 1, wallH);
  cityBoardAndSpill(c, p, y, doorX, glows);
}

const cityBuildingCache = new Map<string, Sprite>();
export function cityBuildingSprite(p: LivePlace): Sprite {
  const b = p.building;
  const key = `city|${p.name}|${p.variant}|${b.w}|${b.wallH}|${b.roofH}|${b.doorX - b.x}`;
  let s = cityBuildingCache.get(key);
  if (!s) {
    if (cityBuildingCache.size > 48) cityBuildingCache.clear();
    const left = -40, right = b.w + 40, top = -b.wallH - b.roofH - 22, bottom = 80;
    s = sprite(right - left, bottom - top, left, top, (c) => paintCityBuilding(c, p));
    cityBuildingCache.set(key, s);
  }
  return s;
}

// ── green street sign, lamp posts, vehicles ────────────────────────────────

let citySignSprite: Sprite | null = null;
export function getCitySignSprite(text: string): Sprite {
  if (!citySignSprite) {
    citySignSprite = sprite(90, 100, -45, -20, (c) => {
      c.fillStyle = "rgba(0,0,0,0.4)";
      c.beginPath();
      c.ellipse(0, 40, 8, 2, 0, 0, Math.PI * 2);
      c.fill();
      const post = c.createLinearGradient(-2, 0, 2, 0);
      post.addColorStop(0, "#5a6a70");
      post.addColorStop(1, "#1a2428");
      c.fillStyle = post;
      c.fillRect(-1.6, 0, 3.2, 40);
      for (let k = 0; k < 4; k++) {
        c.fillStyle = k % 2 ? "#0d1012" : "#c8c8c0";
        c.fillRect(-1.6, 28 + k * 3, 3.2, 3);
      }
      const bg = c.createLinearGradient(0, -15, 0, 4);
      bg.addColorStop(0, "#17663e");
      bg.addColorStop(1, "#0a3a22");
      c.fillStyle = bg;
      c.beginPath();
      c.roundRect(-33, -15, 66, 19, 2.5);
      c.fill();
      c.strokeStyle = "rgba(235,255,240,0.85)";
      c.lineWidth = 0.7;
      c.beginPath();
      c.roundRect(-31.5, -13.5, 63, 16, 1.6);
      c.stroke();
      c.fillStyle = "#0a3a22";
      c.beginPath();
      c.roundRect(-22, 5.5, 44, 9, 1.5);
      c.fill();
      c.strokeStyle = "rgba(235,255,240,0.6)";
      c.lineWidth = 0.5;
      c.stroke();
      c.save();
      c.shadowColor = "#6ef0a8";
      c.shadowBlur = 8;
      c.textAlign = "center";
      c.font = "800 8.5px ui-sans-serif, system-ui, sans-serif";
      c.fillStyle = "#effff5";
      c.fillText(text, 0, -2.8);
      c.font = "700 5px ui-sans-serif, system-ui, sans-serif";
      c.fillText("BENGALURU", 0, 12);
      c.restore();
      c.fillStyle = RIM + "0.6)";
      c.fillRect(-33, -15, 66, 0.6);
      c.globalCompositeOperation = "lighter";
      c.globalAlpha = 0.3;
      c.drawImage(glow("#4ade80"), -26, 26, 52, 50);
    });
  }
  return citySignSprite;
}

/** A short lamp post; local (0,0) is the lantern, the base is at y = 23. */
let postSprite: Sprite | null = null;
export function getPostSprite(): Sprite {
  if (!postSprite) {
    postSprite = sprite(20, 34, -10, -8, (c) => {
      c.fillStyle = "rgba(0,0,0,0.45)";
      c.beginPath();
      c.ellipse(0, 23, 6, 1.8, 0, 0, Math.PI * 2);
      c.fill();
      const pg = c.createLinearGradient(-2, 0, 2, 0);
      pg.addColorStop(0, "#56646a");
      pg.addColorStop(1, "#141c20");
      c.fillStyle = pg;
      c.fillRect(-1.1, 2, 2.2, 21);
      c.fillRect(-2.6, 20, 5.2, 3);
      c.fillStyle = "#0e1418";
      c.beginPath();
      c.moveTo(-3.5, -1.5);
      c.lineTo(3.5, -1.5);
      c.lineTo(2.4, 3);
      c.lineTo(-2.4, 3);
      c.closePath();
      c.fill();
      c.beginPath();
      c.moveTo(-4, -2);
      c.lineTo(0, -6);
      c.lineTo(4, -2);
      c.closePath();
      c.fill();
      c.fillStyle = "rgba(255,230,180,0.25)";
      c.fillRect(-2.2, -1, 4.4, 3.4);
      c.strokeStyle = RIM + "0.5)";
      c.lineWidth = 0.6;
      c.beginPath();
      c.moveTo(1.1, 4);
      c.lineTo(1.1, 20);
      c.stroke();
    });
  }
  return postSprite;
}

function paintAuto(c: CanvasRenderingContext2D) {
  // Local origin at the road contact, facing right.
  c.fillStyle = "rgba(0,0,0,0.5)";
  c.beginPath();
  c.ellipse(1, 0, 15, 2.4, 0, 0, Math.PI * 2);
  c.fill();
  const bg = c.createLinearGradient(0, -16, 0, -2);
  bg.addColorStop(0, "#2f9a56");
  bg.addColorStop(1, "#0e3a20");
  c.fillStyle = bg;
  c.beginPath();
  c.moveTo(-13, -3);
  c.lineTo(-13, -12);
  c.quadraticCurveTo(-13, -14, -10, -14);
  c.lineTo(4, -14);
  c.lineTo(6, -3);
  c.closePath();
  c.fill();
  const yg = c.createLinearGradient(0, -14, 0, -2);
  yg.addColorStop(0, "#e8c040");
  yg.addColorStop(1, "#6a5214");
  c.fillStyle = yg;
  c.beginPath();
  c.moveTo(4, -14);
  c.lineTo(9, -14);
  c.quadraticCurveTo(14, -10, 14, -4);
  c.lineTo(6, -3);
  c.closePath();
  c.fill();
  c.fillStyle = "#d8b030";
  c.fillRect(-13, -9.5, 18, 1.4);
  c.fillStyle = "#081014";
  c.fillRect(-5, -13.5, 8.5, 6.5);
  c.fillStyle = "#1c242a";
  c.beginPath();
  c.arc(5.6, -16, 2, 0, Math.PI * 2);
  c.fill();
  c.fillRect(4.4, -14.5, 2.6, 5);
  c.fillStyle = "#101214";
  c.beginPath();
  c.moveTo(-14, -14);
  c.quadraticCurveTo(-13, -21, -4, -21);
  c.lineTo(8, -21);
  c.quadraticCurveTo(11, -20, 10, -14);
  c.closePath();
  c.fill();
  c.fillStyle = "rgba(160,220,235,0.25)";
  c.beginPath();
  c.moveTo(9.2, -20);
  c.lineTo(12.4, -12);
  c.lineTo(10, -12);
  c.lineTo(8.4, -20);
  c.fill();
  c.strokeStyle = RIM + "0.75)";
  c.lineWidth = 0.7;
  c.beginPath();
  c.moveTo(-10, -21);
  c.lineTo(8, -21);
  c.quadraticCurveTo(11, -20, 10.4, -15);
  c.moveTo(9.4, -14);
  c.quadraticCurveTo(14, -10, 14, -4);
  c.stroke();
  for (const [wx, wr] of [[-8, 2.8], [10.5, 2.5]] as const) {
    c.fillStyle = "#050708";
    c.beginPath();
    c.arc(wx, -2.6, wr, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = "#59646a";
    c.beginPath();
    c.arc(wx, -2.6, 0.9, 0, Math.PI * 2);
    c.fill();
  }
  c.fillStyle = "#fff4d0";
  c.fillRect(13, -9, 1.6, 2.2);
  c.fillStyle = "#ff3a2a";
  c.fillRect(-13.6, -8, 1.2, 2);
}

function paintBus(c: CanvasRenderingContext2D) {
  c.fillStyle = "rgba(0,0,0,0.5)";
  c.beginPath();
  c.ellipse(0, 0, 40, 3, 0, 0, Math.PI * 2);
  c.fill();
  const g = c.createLinearGradient(0, -30, 0, -3);
  g.addColorStop(0, "#2a7a8a");
  g.addColorStop(0.5, "#144a58");
  g.addColorStop(1, "#08222a");
  c.fillStyle = g;
  c.beginPath();
  c.roundRect(-38, -30, 76, 27, [4, 7, 3, 3]);
  c.fill();
  c.fillStyle = "#081418";
  c.fillRect(-35, -26, 66, 10);
  for (let x = -34; x < 28; x += 9) {
    c.fillStyle = "rgba(255,236,190,0.92)";
    c.fillRect(x, -25, 7.6, 8);
  }
  c.fillStyle = "rgba(200,240,255,0.55)";
  c.beginPath();
  c.moveTo(32, -26);
  c.lineTo(37, -26);
  c.lineTo(37.6, -14);
  c.lineTo(32, -14);
  c.fill();
  c.fillStyle = "#d8a030";
  c.fillRect(-38, -12, 76, 1.6);
  c.fillStyle = "#ffb050";
  c.fillRect(20, -29, 14, 2.4);
  c.fillStyle = "#081014";
  c.fillRect(22, -16, 6, 13);
  c.strokeStyle = RIM + "0.75)";
  c.lineWidth = 0.7;
  c.beginPath();
  c.moveTo(-36, -30);
  c.lineTo(32, -30);
  c.quadraticCurveTo(38, -30, 38, -24);
  c.lineTo(38, -4);
  c.stroke();
  for (const wx of [-25, 25]) {
    c.fillStyle = "#050708";
    c.beginPath();
    c.arc(wx, -3, 4, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = "#59646a";
    c.beginPath();
    c.arc(wx, -3, 1.4, 0, Math.PI * 2);
    c.fill();
  }
  c.fillStyle = "#fff4d0";
  c.fillRect(36.5, -9, 1.6, 3);
  c.fillStyle = "#ff3a2a";
  c.fillRect(-38.4, -9, 1.4, 3);
}

/** Vehicles are painted small and scaled up to stand beside the villagers. */
export const VEH_SCALE = { auto: 1.6, bus: 1.5 } as const;
const vehicleCache = new Map<string, Sprite>();
/** Vehicle sprite; local origin at road contact under its centre. */
export function vehicleSprite(kind: "auto" | "bus", dir: 1 | -1): Sprite {
  const key = `${kind}|${dir}`;
  let s = vehicleCache.get(key);
  if (!s) {
    const k = VEH_SCALE[kind];
    const hw = (kind === "bus" ? 44 : 18) * k, h = (kind === "bus" ? 36 : 28) * k;
    s = sprite(hw * 2, h, -hw, -h + 5 * k, (c) => {
      c.scale(dir * k, k);
      if (kind === "bus") paintBus(c);
      else paintAuto(c);
    });
    vehicleCache.set(key, s);
  }
  return s;
}

// ── subagent companions: rim-lit mini villagers with holo floor rings ──────

/** Companion figure scale relative to a villager. */
export const COMP_K = 0.7;
const COMP_TINT: RGB = [190, 244, 255];
const EMOJI_FONT = "'Segoe UI Emoji','Apple Color Emoji','Noto Color Emoji',sans-serif";

const tintCache = new Map<string, string>();
/** A parent colour pulled towards the cool companion tint (hex, so the villager palette can read it). */
function compTint(hex: string, k: number) {
  const key = `${hex}|${k}`;
  let out = tintCache.get(key);
  if (out) return out;
  if (tintCache.size > 256) tintCache.clear();
  const c = rgbOf(hex);
  out = "#" + c.map((x, i) => Math.round(x + (COMP_TINT[i]! - x) * k).toString(16).padStart(2, "0")).join("");
  tintCache.set(key, out);
  return out;
}

/** The companion as a villager-shaped record so the villager drawing code can render it. */
function asFigure(p: LiveVillager, c: LiveCompanion): LiveVillager {
  return {
    ...p,
    id: c.id, x: c.x, y: c.y, facing: c.facing, moving: c.moving, phase: c.phase, jump: c.jump,
    status: "working", carry: undefined, selected: false, hovered: false,
    shirt: compTint(p.shirt, 0.38), mundu: compTint(p.mundu, 0.3),
  };
}

export const compHeadTop = (c: LiveCompanion) => c.y - (BODY.height + c.jump * 26) * COMP_K;

/** The rim-lit mini figure (or its mirrored reflection when the ctx is flipped). */
export function drawCompanionFigure(ctx: CanvasRenderingContext2D, p: LiveVillager, c: LiveCompanion, t: number, alpha: number) {
  const rim = c.activity === "error" ? "rgba(255,120,120,0.85)" : c.activity === "wait" ? "rgba(255,210,130,0.8)" : RIM + "0.9)";
  ctx.save();
  ctx.translate(c.x, c.y);
  ctx.scale(COMP_K, COMP_K);
  ctx.translate(-c.x, -c.y);
  drawVillager(ctx, asFigure(p, c), t, rim, alpha);
  ctx.restore();
}

/** Floor work under a companion: the glowing tether to its parent, a cyan ring and a contact shadow. */
export function companionFloor(ctx: CanvasRenderingContext2D, p: LiveVillager, c: LiveCompanion, t: number, reflect: boolean) {
  const a = c.alpha * p.alpha;
  if (c.away > 0.02) {
    const ta = a * Math.min(1, c.away * 4) * (0.75 - 0.35 * c.away);
    const mx = (p.x + c.x) / 2, my = Math.max(p.y, c.y) + 5;
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.strokeStyle = "rgba(94,234,255,1)";
    ctx.globalAlpha = ta * 0.35;
    ctx.lineWidth = 2.6;
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    ctx.quadraticCurveTo(mx, my, c.x, c.y);
    ctx.stroke();
    ctx.globalAlpha = ta;
    ctx.strokeStyle = "rgba(210,252,255,1)";
    ctx.lineWidth = 0.6;
    ctx.stroke();
    // A light packet running along the tether.
    const u = (t * 0.9 + (c.id.charCodeAt(0) % 7) / 7) % 1;
    const qx = (1 - u) * (1 - u) * p.x + 2 * u * (1 - u) * mx + u * u * c.x;
    const qy = (1 - u) * (1 - u) * p.y + 2 * u * (1 - u) * my + u * u * c.y;
    ctx.globalAlpha = ta * 1.2;
    ctx.drawImage(glow("#9be8ff"), qx - 4, qy - 2.5, 8, 5);
    ctx.restore();
  }
  if (reflect) {
    ctx.save();
    ctx.translate(0, 2 * c.y + 1);
    ctx.scale(1, -1);
    drawCompanionFigure(ctx, p, c, t, a * 0.18);
    ctx.restore();
  }
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  ctx.globalAlpha = a * 0.45;
  ctx.drawImage(glow(c.activity === "error" ? "#f87171" : "#5eead4"), c.x - 13, c.y - 4, 26, 8);
  ctx.globalAlpha = a * 0.85;
  ctx.strokeStyle = c.activity === "error" ? "#f87171" : c.activity === "wait" ? "#f5b33d" : "#7ff0ff";
  ctx.lineWidth = 0.6;
  ctx.beginPath();
  ctx.ellipse(c.x, c.y, 6.5, 1.7, 0, 0, Math.PI * 2);
  ctx.stroke();
  if (c.working) {
    const ph = (t * 0.8 + (c.id.length % 5) / 5) % 1;
    ctx.globalAlpha = a * (1 - ph) * 0.6;
    ctx.beginPath();
    ctx.ellipse(c.x, c.y, 6.5 + ph * 10, (6.5 + ph * 10) * 0.26, 0, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
  ctx.fillStyle = `rgba(0,0,0,${(0.5 - c.jump * 0.3) * a})`;
  ctx.beginPath();
  ctx.ellipse(c.x, c.y, 6 - c.jump * 2, 1.6, 0, 0, Math.PI * 2);
  ctx.fill();
}

function emoji(ctx: CanvasRenderingContext2D, s: string, x: number, y: number, size: number) {
  ctx.font = `${size}px ${EMOJI_FONT}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(s, x, y);
  ctx.textBaseline = "alphabetic";
}

/** Above-head work: holo icon, puffs, "?" / "!" bubbles, leaving sparkles, and the hand-over burst at the parent. */
export function companionOverlay(ctx: CanvasRenderingContext2D, p: LiveVillager, c: LiveCompanion, t: number) {
  const a = c.alpha * p.alpha;
  const hy = compHeadTop(c);
  const seed = (c.id.charCodeAt(c.id.length - 1) % 10) / 10;
  ctx.save();
  if (c.working) {
    const iy = hy - 10 + Math.sin(t * 3.2 + seed * 6) * 1.6;
    ctx.globalCompositeOperation = "lighter";
    ctx.globalAlpha = a * 0.5;
    ctx.drawImage(glow("#5eead4"), c.x - 10, iy - 10, 20, 20);
    ctx.globalAlpha = a * 0.7;
    ctx.strokeStyle = "#9be8ff";
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.ellipse(c.x, iy + 6.5, 5, 1.3, 0, 0, Math.PI * 2);
    ctx.stroke();
    // A faint projector beam from the head to the icon.
    ctx.globalAlpha = a * 0.12;
    ctx.fillStyle = "#9be8ff";
    ctx.beginPath();
    ctx.moveTo(c.x - 1, hy - 1);
    ctx.lineTo(c.x + 1, hy - 1);
    ctx.lineTo(c.x + 5, iy + 6.5);
    ctx.lineTo(c.x - 5, iy + 6.5);
    ctx.closePath();
    ctx.fill();
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = a;
    emoji(ctx, c.icon, c.x, iy, 8);
    if (c.activity === "busy") {
      // Sparks and puffs from the hands.
      ctx.globalCompositeOperation = "lighter";
      for (let i = 0; i < 4; i++) {
        const u = (t * 1.3 + i / 4 + seed) % 1;
        const px = c.x + c.facing * 4 + Math.sin(i * 2.3 + t * 2) * 3 + (i % 2 ? 1 : -1) * u * 4;
        const py = c.y - 26 * COMP_K - u * 12;
        ctx.globalAlpha = a * (1 - u) * 0.8;
        ctx.drawImage(glow(i % 2 ? "#ffd08a" : "#c8faff"), px - 2.5 - u * 2, py - 2.5 - u * 2, 5 + u * 4, 5 + u * 4);
      }
    }
  } else if (c.activity === "wait" || c.activity === "error") {
    const err = c.activity === "error";
    const by = hy - 9 + (err ? 0 : Math.sin(t * 2.4 + seed * 6) * 1);
    ctx.globalCompositeOperation = "lighter";
    ctx.globalAlpha = a * (err ? 0.55 + 0.3 * Math.abs(Math.sin(t * 4)) : 0.4);
    ctx.drawImage(glow(err ? "#ff4a4a" : "#f5b33d"), c.x - 9, by - 9, 18, 18);
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = a;
    ctx.fillStyle = err ? "rgba(60,6,6,0.9)" : "rgba(40,26,4,0.88)";
    ctx.strokeStyle = err ? "#ff7a7a" : "#ffd27a";
    ctx.lineWidth = 0.7;
    ctx.beginPath();
    ctx.arc(c.x, by, 4.6, 0, Math.PI * 2);
    ctx.moveTo(c.x - 1.6, by + 4.2);
    ctx.lineTo(c.x, by + 7);
    ctx.lineTo(c.x + 1.6, by + 4.2);
    ctx.fill();
    ctx.stroke();
    ctx.font = "800 6.5px ui-sans-serif, system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillStyle = err ? "#ff9a9a" : "#ffe3a0";
    ctx.fillText(err ? "!" : "?", c.x, by + 2.4);
  } else if (c.activity === "leaving") {
    ctx.globalCompositeOperation = "lighter";
    for (let i = 0; i < 5; i++) {
      const ang = i * 1.257 + t * 2;
      const r = 5 + ((t * 1.5 + i * 0.2) % 1) * 6;
      const sx = c.x + Math.cos(ang) * r, sy = hy + 6 + Math.sin(ang) * r * 0.8;
      ctx.globalAlpha = a * (0.5 + 0.5 * Math.sin(t * 9 + i));
      ctx.drawImage(glow("#fff2b0"), sx - 2.5, sy - 2.5, 5, 5);
    }
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = a;
    emoji(ctx, c.icon, c.x, hy - 7, 7);
  }
  ctx.restore();
  if (c.handover > 0) handoverBurst(ctx, p, c.handover, t);
}


/** A small sparkle burst at the parent's chest when an errand's result is handed over. */
function handoverBurst(ctx: CanvasRenderingContext2D, p: LiveVillager, h: number, t: number) {
  const cx = p.x, cy = p.y - 40 - p.jump * 26;
  const r = 4 + (1 - h) * 13;
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  ctx.globalAlpha = p.alpha * h * 0.8;
  ctx.drawImage(glow("#c8faff"), cx - 12, cy - 12, 24, 24);
  ctx.strokeStyle = "#e8fdff";
  ctx.lineWidth = 0.7;
  ctx.beginPath();
  for (let i = 0; i < 8; i++) {
    const ang = (i / 8) * Math.PI * 2 + t * 0.5;
    ctx.moveTo(cx + Math.cos(ang) * r * 0.55, cy + Math.sin(ang) * r * 0.55);
    ctx.lineTo(cx + Math.cos(ang) * r, cy + Math.sin(ang) * r);
  }
  ctx.stroke();
  for (let i = 0; i < 6; i++) {
    const ang = (i / 6) * Math.PI * 2 + 0.3;
    ctx.drawImage(glow(i % 2 ? "#ffe9a8" : "#9be8ff"), cx + Math.cos(ang) * r * 1.2 - 2, cy + Math.sin(ang) * r * 1.2 - 2, 4, 4);
  }
  ctx.restore();
}

/** Tiny label pill under the companion's feet (on the floor, clear of the villager labels above heads). */
export function companionLabel(ctx: CanvasRenderingContext2D, p: LiveVillager, c: LiveCompanion) {
  const a = c.alpha * p.alpha;
  if (a < 0.05 || !c.label) return;
  ctx.save();
  ctx.globalAlpha = a;
  ctx.font = "500 5.2px ui-sans-serif, system-ui, sans-serif";
  ctx.textAlign = "center";
  const tw = ctx.measureText(c.label).width;
  const pw = tw + 7, ph = 7.6, px = c.x - pw / 2, py = c.y + 3.5;
  ctx.fillStyle = "rgba(4,18,24,0.82)";
  ctx.beginPath();
  ctx.roundRect(px, py, pw, ph, 3.8);
  ctx.fill();
  ctx.strokeStyle = "rgba(127,240,255,0.55)";
  ctx.lineWidth = 0.45;
  ctx.stroke();
  ctx.fillStyle = "rgba(220,250,255,0.95)";
  ctx.fillText(c.label, c.x, py + 5.5);
  ctx.restore();
}

/** "+N" badge by the parent when there are more companions than figures drawn. */
export function companionBadge(ctx: CanvasRenderingContext2D, p: LiveVillager, extra: number) {
  const x = p.x + 13, y = p.y - BODY.height * 0.62 - p.jump * 26;
  ctx.save();
  ctx.globalAlpha = p.alpha;
  ctx.fillStyle = "rgba(4,18,24,0.85)";
  ctx.strokeStyle = "rgba(127,240,255,0.8)";
  ctx.lineWidth = 0.6;
  ctx.beginPath();
  ctx.roundRect(x, y - 5, 13, 8, 4);
  ctx.fill();
  ctx.stroke();
  ctx.font = "700 5.5px ui-sans-serif, system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.fillStyle = "#c8faff";
  ctx.fillText(`+${extra}`, x + 6.5, y + 1);
  ctx.restore();
}
