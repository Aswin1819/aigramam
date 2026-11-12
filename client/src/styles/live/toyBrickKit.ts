/**
 * Toy Brick drawing kit: the brick, stud, slope and tile primitives from the
 * Style-lab prototype (protos/toyBrick.ts), plus sprite painters for the live
 * village (palms, buildings, sign, lamp posts, clouds, background tiles).
 * Generic plastic toy bricks only: no brand names or logos, nothing on studs.
 */
import { hash, rng } from "../scene";
import { GROUND, WORLD_H } from "./types";

export type C2 = CanvasRenderingContext2D;
export const TAU = Math.PI * 2;
/** Stud pitch, world units. */
export const P = 8;

export const K = {
  sky: "#dcefff", skyLow: "#f4fbff",
  base: "#3dab4a", path: "#e9d29a", pathD: "#d8bc7c",
  water: "#38a3e0", waterL: "#7fd0f5",
  red: "#e3342f", yellow: "#f7c52b", blue: "#2563d9", white: "#f6f3ea", tan: "#e9d29a",
  brown: "#8a5a2f", dark: "#3b2a22", grey: "#a7aeb8", greyD: "#6b7280", green: "#2fa84f", lime: "#7ccf3c",
  brass: "#f2b311", flame: "#ff9a1f", ink: "#1f2430", orange: "#f59e0b", sky2: "#cfe6ff",
};

// ── colour + shape helpers ───────────────────────────────────────────────────

const shadeCache = new Map<string, string>();
/** Mix a #rrggbb colour toward white (k > 0) or black (k < 0). Non-hex colours pass through. */
export function shade(hex: string, k: number): string {
  const key = hex + k;
  const hit = shadeCache.get(key);
  if (hit) return hit;
  if (!/^#[0-9a-fA-F]{6}$/.test(hex)) return hex;
  const n = parseInt(hex.slice(1), 16);
  const t = k < 0 ? 0 : 255;
  const a = Math.abs(k);
  const ch = (c: number) => Math.round(c + (t - c) * a);
  const out = `rgb(${ch((n >> 16) & 255)},${ch((n >> 8) & 255)},${ch(n & 255)})`;
  shadeCache.set(key, out);
  return out;
}

export function rr(ctx: C2, x: number, y: number, w: number, h: number, r: number) {
  const q = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + q, y);
  ctx.arcTo(x + w, y, x + w, y + h, q);
  ctx.arcTo(x + w, y + h, x, y + h, q);
  ctx.arcTo(x, y + h, x, y, q);
  ctx.arcTo(x, y, x + w, y, q);
  ctx.closePath();
}

export function ell(ctx: C2, x: number, y: number, rx: number, ry: number) {
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, 0, 0, TAU);
}

/** One plain stud seen from slightly above. */
export function stud(ctx: C2, cx: number, cy: number, color: string, rx = 2.6, alpha = 1) {
  const ry = rx * 0.5;
  const side = rx * 0.6;
  ctx.globalAlpha = alpha;
  ctx.fillStyle = shade(color, -0.32);
  ell(ctx, cx, cy + side, rx, ry);
  ctx.fill();
  ctx.fillRect(cx - rx, cy, rx * 2, side);
  ctx.fillStyle = shade(color, 0.14);
  ell(ctx, cx, cy, rx, ry);
  ctx.fill();
  ctx.fillStyle = "rgba(255,255,255,0.6)";
  ell(ctx, cx - rx * 0.38, cy - ry * 0.15, rx * 0.34, ry * 0.42);
  ctx.fill();
  ctx.globalAlpha = 1;
}

/** A brick in elevation: bevels, glossy streak, seam outline, studs on top. */
export function brick(ctx: C2, x: number, y: number, w: number, h: number, color: string, studs = true) {
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = shade(color, 0.3);
  ctx.fillRect(x, y, w, 1.1);
  ctx.fillStyle = shade(color, -0.2);
  ctx.fillRect(x, y + h - 1.4, w, 1.4);
  ctx.fillStyle = "rgba(255,255,255,0.22)";
  if (h > 5) ctx.fillRect(x + 1.6, y + 2, 1.1, h - 4);
  ctx.strokeStyle = shade(color, -0.42);
  ctx.lineWidth = 0.6;
  ctx.strokeRect(x + 0.3, y + 0.3, w - 0.6, h - 0.6);
  if (studs) for (let sx = x + P / 2; sx < x + w - 1; sx += P) stud(ctx, sx, y - 1.5, color, 2.5);
}

/** A sloped brick end. dir 1 = slope goes down to the right. */
export function slope(ctx: C2, x: number, y: number, w: number, h: number, color: string, dir: 1 | -1) {
  ctx.fillStyle = shade(color, -0.1);
  ctx.beginPath();
  if (dir === 1) { ctx.moveTo(x, y); ctx.lineTo(x + w, y + h); ctx.lineTo(x, y + h); }
  else { ctx.moveTo(x + w, y); ctx.lineTo(x + w, y + h); ctx.lineTo(x, y + h); }
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = shade(color, -0.42);
  ctx.lineWidth = 0.6;
  ctx.stroke();
  ctx.strokeStyle = "rgba(255,255,255,0.25)";
  ctx.beginPath();
  for (let i = 1; i < 3; i++) {
    const fx = dir === 1 ? x + (w * i) / 3 : x + w - (w * i) / 3;
    const fy = y + (h * i) / 3;
    ctx.moveTo(fx, fy + 1);
    ctx.lineTo(fx + dir * 2, fy + 3);
  }
  ctx.stroke();
}

/** A flat tile (no studs): glossy top face with a darker edge underneath. */
export function tile(ctx: C2, x: number, y: number, w: number, h: number, color: string, edge = 2) {
  ctx.fillStyle = shade(color, -0.38);
  rr(ctx, x, y + edge, w, h, 2.2);
  ctx.fill();
  ctx.fillStyle = color;
  rr(ctx, x, y, w, h, 2.2);
  ctx.fill();
  ctx.fillStyle = "rgba(255,255,255,0.55)";
  ctx.fillRect(x + 2, y + 1, w - 4, 1.1);
  ctx.strokeStyle = shade(color, -0.45);
  ctx.lineWidth = 0.6;
  rr(ctx, x + 0.3, y + 0.3, w - 0.6, h + edge - 0.6, 2.2);
  ctx.stroke();
}

/** Text that fits a width: shrinks the font down to `min`, then truncates with an ellipsis. */
export function fitText(ctx: C2, text: string, maxW: number, weight: string, size: number, min: number): number {
  let s = size;
  ctx.font = `${weight} ${s}px ui-sans-serif, system-ui, sans-serif`;
  while (ctx.measureText(text).width > maxW && s > min) {
    s -= 0.5;
    ctx.font = `${weight} ${s}px ui-sans-serif, system-ui, sans-serif`;
  }
  return s;
}

export function clip(ctx: C2, text: string, maxW: number): string {
  if (ctx.measureText(text).width <= maxW) return text;
  let t = text;
  while (t.length > 1 && ctx.measureText(t + "…").width > maxW) t = t.slice(0, -1);
  return t + "…";
}

/** Frame-index jitter: tiny, deterministic, changes every stop-motion frame. */
export function jit(k: number, seed: number, amp: number) {
  return (hash(k * 1.37 + seed * 19.3) - 0.5) * 2 * amp;
}

/** Stable numeric seed from a string id. */
export function seedOf(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  return ((h >>> 0) % 9973) + 1;
}

// ── sprites (offscreen canvases at 2× resolution) ───────────────────────────

export interface Sprite { img: HTMLCanvasElement; ox: number; oy: number; w: number; h: number }

/** Paint into a 2× offscreen canvas; `ox, oy` = where world point (0,0) of the painter lands inside it. */
export function makeSprite(w: number, h: number, ox: number, oy: number, paint: (g: C2) => void): Sprite {
  const c = document.createElement("canvas");
  c.width = Math.ceil(w * 2);
  c.height = Math.ceil(h * 2);
  const g = c.getContext("2d")!;
  g.scale(2, 2);
  g.translate(ox, oy);
  paint(g);
  return { img: c, ox, oy, w, h };
}

/** Draw a sprite so its painter origin sits at world (x, y). */
export function blit(ctx: C2, s: Sprite, x: number, y: number) {
  ctx.drawImage(s.img, x - s.ox, y - s.oy, s.w, s.h);
}

/** Background tile (sky, hills, far bank, water), width BACK_W, height WORLD_H. Repeats seamlessly. */
export const BACK_W = 512;
export function paintBackTile(g: C2) {
  const sky = g.createLinearGradient(0, 0, 0, GROUND.waterTop);
  sky.addColorStop(0, K.sky);
  sky.addColorStop(1, K.skyLow);
  g.fillStyle = sky;
  g.fillRect(0, 0, BACK_W, GROUND.waterTop);
  // Stepped brick hills (kept inside the tile so it repeats cleanly).
  const hills = [{ x: 8, w: 150, rows: 3 }, { x: 176, w: 112, rows: 2 }, { x: 304, w: 196, rows: 4 }];
  for (const hl of hills) {
    for (let r = 0; r < hl.rows; r++) {
      const inset = r * 16;
      brick(g, hl.x + inset, GROUND.waterTop - (r + 1) * 6, hl.w - inset * 2, 6, r % 2 ? "#9fd88a" : "#8fcf78", r === hl.rows - 1);
    }
  }
  // Water plates seen from above.
  const top = GROUND.waterTop, bot = GROUND.waterBottom;
  g.fillStyle = K.water;
  g.fillRect(0, top, BACK_W, bot - top);
  const r = rng(91);
  for (let y = top; y < bot; y += P) {
    let x = -((y / P) % 2) * 12;
    while (x < BACK_W) {
      const len = Math.min(P * (2 + Math.floor(r() * 5)), BACK_W - x);
      g.fillStyle = r() < 0.5 ? "rgba(140,215,250,0.35)" : "rgba(20,110,190,0.22)";
      g.fillRect(Math.max(0, x), y, len - Math.max(0, -x), P);
      g.strokeStyle = "rgba(255,255,255,0.35)";
      g.lineWidth = 0.6;
      g.strokeRect(x + 0.3, y + 0.3, len - 0.6, P - 0.6);
      x += len;
    }
  }
  for (let y = top + 4; y < bot - 2; y += P) for (let x = 4; x < BACK_W; x += P) stud(g, x, y - 0.6, K.waterL, 2.4, 0.42);
  g.fillStyle = "rgba(255,255,255,0.5)";
  g.fillRect(0, top, BACK_W, 1.2);
  // Below the world: plain baseplate colour (in case the view goes lower).
}

/** Ground tile: front water row (186–196, translucent, covers the canoe's hull), baseplate, path, flowers. */
export const GROUND_W = 256;
export const GROUND_TOP = 186;
export function paintGroundTile(g: C2) {
  const top = GROUND.groundY;
  g.fillStyle = "rgba(56,163,224,0.55)";
  g.fillRect(0, GROUND_TOP, GROUND_W, top - GROUND_TOP);
  g.fillStyle = "rgba(255,255,255,0.5)";
  g.fillRect(0, GROUND_TOP, GROUND_W, 0.9);
  for (let x = 4; x < GROUND_W; x += P) stud(g, x, 190, K.waterL, 2.4, 0.45);
  g.fillStyle = K.base;
  g.fillRect(0, top, GROUND_W, WORLD_H - top);
  g.fillStyle = shade(K.base, 0.3);
  g.fillRect(0, top, GROUND_W, 1.4);
  for (let y = top + 5; y < WORLD_H + 2; y += P) for (let x = 4; x < GROUND_W; x += P) stud(g, x, y, K.base, 2.5);
  const py0 = GROUND.pathTop - 2, py1 = GROUND.pathBottom + 2;
  const r = rng(23);
  for (let y = py0; y < py1; y += P) {
    let x = -((Math.round(y / P)) % 3) * P;
    while (x < GROUND_W) {
      const len = Math.min(P * (2 + Math.floor(r() * 3)), GROUND_W - x);
      g.fillStyle = r() < 0.25 ? K.pathD : K.path;
      g.fillRect(Math.max(0, x), y, len - Math.max(0, -x), P);
      g.fillStyle = "rgba(255,255,255,0.45)";
      g.fillRect(Math.max(0, x) + 1, y + 0.6, len - Math.max(0, -x) - 2, 0.9);
      g.strokeStyle = shade(K.path, -0.32);
      g.lineWidth = 0.6;
      g.strokeRect(x + 0.3, y + 0.3, len - 0.6, P - 0.6);
      x += len;
    }
  }
  g.fillStyle = "rgba(0,0,0,0.12)";
  g.fillRect(0, py1, GROUND_W, 1.5);
  const fr = rng(5);
  for (let i = 0; i < 14; i++) {
    const x = 4 + Math.floor(fr() * (GROUND_W / P)) * P;
    const y = top + 5 + Math.floor(fr() * 20) * P;
    if ((y > py0 - 6 && y < py1 + 4) || y > WORLD_H - 4) continue;
    stud(g, x, y - 1, [K.red, K.yellow, K.white, "#ff7ab6"][i % 4]!, 2.7);
  }
}

export function paintCloud(g: C2) {
  brick(g, 4, 18, 72, 9, K.white, true);
  brick(g, 14, 9, 48, 9, K.white, true);
  brick(g, 26, 2, 24, 7, K.white, true);
}

/** Small brick palm for the far bank; origin = trunk base. */
export function paintFarPalm(g: C2) {
  for (let i = 0; i < 4; i++) brick(g, -2 + i * 0.6, -(i + 1) * 6, 4, 6, i % 2 ? K.brown : shade(K.brown, 0.12), false);
  g.fillStyle = shade(K.green, -0.05);
  for (const a of [-2.7, -2.0, -1.1, -0.4]) {
    g.save();
    g.translate(2.4, -25);
    g.rotate(a + Math.PI);
    rr(g, -1.6, 0, 3.2, 12, 1);
    g.restore();
    g.fill();
  }
}

/** Brick palm; origin = trunk base. */
export function paintPalm(g: C2, h: number, lean: number) {
  const seg = 9;
  const n = Math.round((h * 0.62) / seg);
  let tx = 0, ty = 0;
  for (let i = 0; i < n; i++) {
    const u = (i + 1) / n;
    const cx = lean * h * u * u * 1.2;
    const cy = -(i + 1) * seg;
    const col = i % 2 ? K.brown : shade(K.brown, 0.14);
    g.fillStyle = shade(col, -0.25);
    rr(g, cx - 4.5, cy, 9, seg, 2.2);
    g.fill();
    g.fillStyle = col;
    rr(g, cx - 4.5, cy, 8, seg - 0.8, 2.2);
    g.fill();
    g.fillStyle = "rgba(255,255,255,0.25)";
    g.fillRect(cx - 2.8, cy + 1.5, 1.1, seg - 4);
    tx = cx;
    ty = cy;
  }
  const L = h * 0.24;
  [-2.95, -2.5, -2.05, -1.1, -0.65, -0.2, 0.35, 2.8].forEach((a, i) => {
    const col = i % 2 ? K.green : K.lime;
    g.save();
    g.translate(tx, ty + 1);
    g.rotate(a);
    brick(g, 0, -3, L, 6, col, false);
    for (let s = 4; s < L - 2; s += P) stud(g, s, -3.5, col, 2.2);
    g.translate(L - 1, 0);
    g.rotate(Math.cos(a) < 0 ? -0.6 : 0.6);
    brick(g, 0, -2.5, L * 0.7, 5, col, false);
    slope(g, L * 0.7, -2.5, 5, 5, col, 1);
    g.restore();
  });
  for (const [dx, dy] of [[-3, 5], [3, 6], [0, 9]] as const) {
    g.fillStyle = shade(K.brown, -0.3);
    ell(g, tx + dx, ty + dy, 3.4, 3.4);
    g.fill();
    g.fillStyle = "rgba(255,255,255,0.35)";
    ell(g, tx + dx - 1, ty + dy - 1, 1, 1);
    g.fill();
  }
}

/** Village sign on two grey posts; origin = sign anchor (x, y) as in the prototype. */
export function paintSign(g: C2, text: string) {
  for (let i = 0; i < 4; i++) brick(g, -3, 2 + i * 9.6, 6, 9.6, i % 2 ? K.grey : shade(K.grey, 0.1), false);
  brick(g, -8, 40, 16, 4, K.greyD, true);
  brick(g, -33, -16, 66, 18, K.blue, true);
  tile(g, -29, -13, 58, 11.5, K.white, 1.2);
  g.fillStyle = K.blue;
  fitText(g, text, 54, "800", 8.5, 6);
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText(text, 0, -7);
}

/** One lamp post (lamp anchor y = top of the post); origin = (x, y). */
export function paintLampPost(g: C2) {
  g.fillStyle = "rgba(20,70,25,0.3)";
  g.fillRect(-6, 24, 14, 3);
  brick(g, -7, 20, 14, 4, K.greyD, true);
  for (let k = 0; k < 2; k++) {
    const y = 2 + k * 9;
    g.fillStyle = shade(K.brass, -0.25);
    rr(g, -3, y, 6, 9, 1.8);
    g.fill();
    g.fillStyle = K.brass;
    rr(g, -3, y, 5, 8.3, 1.8);
    g.fill();
    g.fillStyle = "rgba(255,255,255,0.45)";
    g.fillRect(-1.8, y + 1.5, 1, 5);
  }
  brick(g, -6, -1, 12, 3.5, K.brass, false);
  g.fillStyle = K.dark;
  g.fillRect(-0.6, -3, 1.2, 2);
}

const ROOF = [K.red, K.blue, K.orange, K.green];
const WALL = [K.white, "#f3e3bd", K.white, K.sky2];
const TRIM = [K.blue, K.red, K.green, K.red];
const SIGN = [K.yellow, K.white, K.yellow, K.white];

/**
 * A brick building for one place. Origin = (b.x, b.baseY): walls from x 0..w,
 * up to -wallH, roof above. The project name sits on a printed tile on the roof.
 */
export function paintBuilding(g: C2, w: number, wallH: number, roofH: number, doorDX: number, variant: number, name: string) {
  const v = ((variant % 4) + 4) % 4;
  const rows = 8;
  const bh = wallH / rows;
  const top = -wallH;
  g.fillStyle = "rgba(20,70,25,0.3)";
  g.fillRect(4, 0, w + 4, 5);
  for (let r = 0; r < rows; r++) {
    const y = -(r + 1) * bh;
    let x = -(r % 2 ? P * 1.5 : 0);
    let i = 0;
    while (x < w) {
      const len = P * (r % 3 === 0 ? 4 : 3);
      const x0 = Math.max(x, 0);
      const x1 = Math.min(x + len, w);
      const col = r === 0 ? ROOF[v]! : (i + r) % 5 === 0 ? shade(WALL[v]!, -0.06) : WALL[v]!;
      if (x1 - x0 > 1) brick(g, x0, y, x1 - x0, bh, col, r === rows - 1);
      x += len;
      i++;
    }
  }
  // Window with variant contents.
  const wx = 10, wy = top + 18, ww = Math.min(62, doorDX - 26), wh = 30;
  g.fillStyle = "#4a2f20";
  g.fillRect(wx, wy, ww, wh);
  g.fillStyle = "rgba(255,255,255,0.08)";
  g.fillRect(wx, wy, ww, 3);
  brick(g, wx - 3, wy + wh, ww + 6, 4, K.brown, true);
  const items = Math.max(1, Math.floor((ww - 8) / 16));
  for (let i = 0; i < items; i++) {
    const gx = wx + 12 + i * 16, gy = wy + wh - 1;
    if (v === 0) {
      g.fillStyle = "rgba(255,255,255,0.45)";
      g.fillRect(gx - 3, gy - 9, 6, 9);
      g.fillStyle = "#b8662a";
      g.fillRect(gx - 2.5, gy - 6, 5, 5.5);
      g.strokeStyle = "rgba(255,255,255,0.8)";
      g.lineWidth = 0.6;
      g.strokeRect(gx - 3, gy - 9, 6, 9);
    } else if (v === 1) {
      // Little brick screens.
      tile(g, gx - 6, gy - 13, 12, 9, "#9ca3af", 1);
      g.fillStyle = "#7df0ff";
      g.fillRect(gx - 4.5, gy - 11.5, 9, 6);
      g.fillStyle = "#0e7490";
      g.fillRect(gx - 3.5, gy - 10, 5, 0.8);
      g.fillRect(gx - 3.5, gy - 8, 3, 0.8);
    } else if (v === 2) {
      // Stacked books.
      const cols = [K.red, K.blue, K.yellow];
      for (let k = 0; k < 3; k++) brick(g, gx - 6 + (k % 2), gy - 3.4 * (k + 1), 11, 3.4, cols[(i + k) % 3]!, false);
    } else {
      // Fruit: round yellow and red studs in a crate.
      brick(g, gx - 6, gy - 5, 12, 5, K.brown, false);
      stud(g, gx - 3, gy - 6, i % 2 ? K.red : K.yellow, 2.6);
      stud(g, gx + 3, gy - 6, i % 2 ? K.yellow : K.orange, 2.6);
    }
  }
  brick(g, wx - 4, wy - 4, ww + 8, 4, TRIM[v]!, false);
  // Door.
  const dx = doorDX - 12;
  g.fillStyle = "#3a2418";
  g.fillRect(dx, top + 20, 24, wallH - 20);
  brick(g, dx - 4, top + 16, 32, 4, TRIM[v]!, false);
  brick(g, dx - 4, top + 20, 4, wallH - 20, TRIM[v]!, false);
  brick(g, dx + 24, top + 20, 4, wallH - 20, TRIM[v]!, false);
  // Roof: stepped bricks with slope ends.
  const roofRows = 4;
  const rh = roofH / roofRows;
  const step = Math.max(12, w * 0.12);
  for (let r = 0; r < roofRows; r++) {
    const inset = -14 + r * step;
    const x0 = inset + rh, x1 = w - inset - rh;
    const y = top - (r + 1) * rh;
    const col = r % 2 ? ROOF[v]! : shade(ROOF[v]!, 0.08);
    let x = x0;
    let i = 0;
    while (x < x1 - 1) {
      const len = Math.min(P * (i % 2 ? 4 : 3), x1 - x);
      brick(g, x, y, len, rh, col, true);
      x += len;
      i++;
    }
    slope(g, x0 - rh * 1.3, y, rh * 1.3, rh, col, -1);
    slope(g, x1, y, rh * 1.3, rh, col, 1);
  }
  // Name tile.
  const label = name.toUpperCase();
  const maxW = w - 24;
  const size = fitText(g, label, maxW - 10, "800", 9, 6.5);
  const text = clip(g, label, maxW - 10);
  const tw = Math.min(maxW, g.measureText(text).width + 12);
  const tx = w / 2 - tw / 2, ty = top - rh * 2 + 1;
  tile(g, tx, ty, tw, rh * 2 - 4, SIGN[v]!, 1.6);
  g.fillStyle = v === 1 || v === 3 ? ROOF[v]! : K.red;
  g.font = `800 ${size}px ui-sans-serif, system-ui, sans-serif`;
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText(text, w / 2, ty + rh - 1.5);
}
