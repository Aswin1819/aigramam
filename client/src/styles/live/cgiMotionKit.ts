/**
 * Drawing kit for the live CGI Motion style: colour helpers, cached glow
 * sprites, tiled background layers, per-place building sprites, palms and
 * the smooth-shaded, rim-lit villager. Ported from protos/cgiMotion.ts and
 * generalised to any world width.
 */
import { BODY, hash, rng, skeleton } from "../scene";
import { asVillagerFrame } from "./reference";
import { GROUND, WORLD_H, type LivePlace, type LiveVillager } from "./types";

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
