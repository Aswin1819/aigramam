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

// ── Bengaluru: the same bricks, a city setting ──────────────────────────────

export const KB = {
  paver: "#c7c1b4", paverB: "#b88f78", hedge: "#2f8f3f", hedgeL: "#4caf50",
  asphalt: "#4b5059", asphaltL: "#5a606a", kerbY: "#f7c52b", kerbK: "#2a2d33",
  glass: "#4f9fd8", glassL: "#8fd0f5", glassD: "#2f6fa8", concrete: "#d8d3c8", concreteD: "#aba496",
  purple: "#7c4dcc", apart: "#efe9dc", apartB: "#f3d9b1", haze: "#c3d6e8", hazeD: "#adc4da",
  bloom: "#ff4f1f", bloom2: "#ff8a1a", leaf: "#2f8f3f", leafL: "#58b846", trunk: "#7a5236",
  autoG: "#2f9a4f", autoY: "#f7c52b", hood: "#22252b", bus: "#1f9e8f",
  brickR: "#b4553a", brickRD: "#94402b", steel: "#c9cfd6", streetGreen: "#1f7a43",
};

/** Bengaluru sky tile (0..waterTop): the style's sky plus a hazy low skyline of brick blocks. */
export function paintBlrSkyTile(g: C2) {
  const sky = g.createLinearGradient(0, 0, 0, GROUND.waterTop);
  sky.addColorStop(0, K.sky);
  sky.addColorStop(1, K.skyLow);
  g.fillStyle = sky;
  g.fillRect(0, 0, BACK_W, GROUND.waterTop);
  const r = rng(311);
  let x = 0;
  while (x < BACK_W) {
    const w = P * (3 + Math.floor(r() * 4));
    const ww = Math.min(w, BACK_W - x);
    const h = 18 + Math.floor(r() * 5) * 6;
    const col = r() < 0.5 ? KB.haze : KB.hazeD;
    g.fillStyle = col;
    g.fillRect(x, GROUND.waterTop - h, ww, h);
    g.fillStyle = "rgba(255,255,255,0.35)";
    for (let wy = GROUND.waterTop - h + 4; wy < GROUND.waterTop - 3; wy += 6)
      for (let wx = x + 3; wx < x + ww - 3; wx += 6) g.fillRect(wx, wy, 2.5, 2.5);
    g.strokeStyle = shade(col, -0.18);
    g.lineWidth = 0.6;
    g.strokeRect(x + 0.3, GROUND.waterTop - h + 0.3, ww - 0.6, h - 0.6);
    x += ww + (r() < 0.3 ? P : 0);
  }
}

/** Deck top (train wheels) and deck bottom of the metro viaduct in the water band. */
export const DECK_TOP = 152;
export const DECK_BOT = 164;
/** Bengaluru band tile (waterTop..waterBottom): park greenery and the metro viaduct. Repeats. */
export function paintBlrBandTile(g: C2) {
  const bot = GROUND.waterBottom;
  // Park greenery: stacks of green bricks, a few red blooms.
  const r = rng(77);
  for (let x = -8; x < BACK_W; x += 28 + Math.floor(r() * 3) * 6) {
    const w = 30 + Math.floor(r() * 3) * 8;
    const col = r() < 0.5 ? KB.leaf : KB.leafL;
    const cx = Math.max(0, Math.min(x, BACK_W - w));
    const ht = 14 + Math.floor(r() * 3) * 5;
    brick(g, cx, bot - ht + 8, w, ht - 8, col, false);
    brick(g, cx + 6, bot - ht, w - 12, 8, col, true);
    if (r() < 0.45) stud(g, cx + 10 + r() * (w - 20), bot - ht - 1.5, KB.bloom, 2.5);
  }
  // Pillars (T-shaped), every 128 units.
  for (let px = 64; px < BACK_W; px += 128) {
    brick(g, px - 6, DECK_BOT, 12, bot - DECK_BOT, KB.concrete, false);
    g.fillStyle = "rgba(0,0,0,0.1)";
    g.fillRect(px + 2, DECK_BOT, 4, bot - DECK_BOT);
    brick(g, px - 14, DECK_BOT, 28, 4, KB.concreteD, false);
  }
  // Deck: a long concrete beam of bricks with a purple stripe.
  let x = 0, i = 0;
  while (x < BACK_W) {
    const len = Math.min(P * (i % 2 ? 6 : 8), BACK_W - x);
    brick(g, x, DECK_TOP, len, DECK_BOT - DECK_TOP, i % 3 ? KB.concrete : shade(KB.concrete, -0.05), false);
    x += len;
    i++;
  }
  g.fillStyle = KB.purple;
  g.fillRect(0, DECK_TOP + 5, BACK_W, 2.4);
  g.fillStyle = "rgba(255,255,255,0.5)";
  g.fillRect(0, DECK_TOP + 0.4, BACK_W, 0.9);
  g.fillStyle = KB.concreteD;
  g.fillRect(0, DECK_TOP, BACK_W, 1);
}

/** Skyline building for a far-bank slot: 0 glass tower, 1 apartment block with water tanks, 2 glass slab, 3 under construction with a crane. */
export function towerOf(x: number): { kind: number; h: number; w: number } {
  const a = hash(x * 0.137 + 3.1), b = hash(x * 0.711 + 9.4);
  const kind = a < 0.34 ? 0 : a < 0.72 ? 1 : a < 0.9 ? 2 : 3;
  const h = kind === 0 ? 70 + Math.round(b * 5) * 10 : kind === 1 ? 40 + Math.round(b * 4) * 8 : kind === 2 ? 50 + Math.round(b * 4) * 8 : 50 + Math.round(b * 2) * 10;
  const w = kind === 1 ? 40 : kind === 2 ? 46 : 32;
  return { kind, h, w };
}

/** One skyline building; origin = base centre (on the waterTop line). */
export function paintTower(g: C2, kind: number, h: number, w: number) {
  const x0 = -w / 2;
  if (kind === 1) {
    const rows = Math.floor(h / 8);
    for (let r = 0; r < rows; r++) brick(g, x0, -(r + 1) * 8, w, 8, r % 2 ? KB.apart : KB.apartB, r === rows - 1);
    for (let r = 1; r < rows - 1; r++) for (let c = 0; c < 4; c++) {
      g.fillStyle = (r + c) % 3 ? "#5b7fa6" : "#3d5f86";
      g.fillRect(x0 + 4 + c * ((w - 8) / 4), -(r + 1) * 8 + 2, (w - 8) / 4 - 3, 4);
    }
    const tt = -rows * 8 - 2;
    for (const tx of [x0 + 7, x0 + w - 13]) {
      brick(g, tx, tt - 7, 7, 7, "#2a2d33", false);
      stud(g, tx + 3.5, tt - 7.5, "#2a2d33", 2.6);
    }
    return;
  }
  if (kind === 3) {
    const rows = Math.floor(h / 10);
    for (let r = 0; r < rows; r++) {
      const y = -(r + 1) * 10;
      brick(g, x0, y + 7, w, 3, KB.concreteD, false);
      brick(g, x0, y, 3, 7, KB.concrete, false);
      brick(g, x0 + w - 3, y, 3, 7, KB.concrete, false);
      if (r < rows - 2) { g.fillStyle = "rgba(70,90,110,0.35)"; g.fillRect(x0 + 3, y, w - 6, 7); }
    }
    const top = -rows * 10;
    const mx = x0 + w - 8;
    for (let y = top; y > top - 34; y -= 6) brick(g, mx, y - 6, 5, 6, K.yellow, false);
    brick(g, mx - 34, top - 40, 52, 4, K.yellow, false);
    brick(g, mx + 12, top - 38, 8, 6, K.greyD, false);
    g.strokeStyle = K.ink;
    g.lineWidth = 0.6;
    g.beginPath();
    g.moveTo(mx - 24, top - 36);
    g.lineTo(mx - 24, top - 16);
    g.stroke();
    brick(g, mx - 27, top - 16, 6, 4, K.red, false);
    return;
  }
  const rows = Math.floor(h / 6);
  for (let r = 0; r < rows; r++) {
    const y = -(r + 1) * 6;
    const col = r % 2 ? KB.glass : shade(KB.glass, 0.08);
    brick(g, x0, y, w, 6, col, false);
    g.fillStyle = "rgba(255,255,255,0.28)";
    for (let c = x0 + 4; c < x0 + w - 2; c += 8) g.fillRect(c, y + 1.5, 4, 3);
  }
  const top = -rows * 6;
  g.fillStyle = "rgba(255,255,255,0.22)";
  g.beginPath();
  g.moveTo(x0 + 2, top);
  g.lineTo(x0 + w * 0.45, top);
  g.lineTo(x0 + 2, top * 0.4);
  g.closePath();
  g.fill();
  if (kind === 0) {
    brick(g, x0 + 4, top - 6, w - 8, 6, KB.glassD, true);
    g.fillStyle = K.greyD;
    g.fillRect(-0.8, top - 20, 1.6, 14);
    stud(g, 0, top - 21, K.red, 1.8);
  } else {
    brick(g, x0, top - 5, w, 5, KB.concreteD, true);
  }
}

/** Bengaluru ground tile (from GROUND_TOP): hedge strip, paver baseplate, kerbs, the asphalt road. */
export function paintBlrGroundTile(g: C2) {
  const top = GROUND.groundY;
  brick(g, 0, GROUND_TOP, GROUND_W, top - GROUND_TOP, KB.hedge, false);
  for (let x = 4; x < GROUND_W; x += P) stud(g, x, GROUND_TOP + 2, (x - 4) / P % 7 === 3 ? KB.bloom : KB.hedgeL, 2.4);
  g.fillStyle = KB.paver;
  g.fillRect(0, top, GROUND_W, WORLD_H - top);
  g.fillStyle = shade(KB.paver, 0.3);
  g.fillRect(0, top, GROUND_W, 1.4);
  const py0 = GROUND.pathTop - 2, py1 = GROUND.pathBottom + 2;
  for (let y = top + 5; y < WORLD_H + 2; y += P) {
    if (y > py0 - 6 && y < py1 + 6) continue;
    const band = Math.floor((y - top) / P);
    for (let x = 4; x < GROUND_W; x += P) {
      const c = band % 4 === 1 ? KB.paverB : (Math.floor(x / (P * 2)) + band) % 2 ? KB.paver : shade(KB.paver, -0.05);
      stud(g, x, y, c, 2.5);
    }
  }
  const fr = rng(17);
  for (let i = 0; i < 3; i++) {
    const lx = 16 + i * 84 + Math.floor(fr() * 3) * P, ly = top + 20 + Math.floor(fr() * 4) * P;
    brick(g, lx, ly, P * 4, 6, KB.leafL, true);
    stud(g, lx + 4 + Math.floor(fr() * 3) * P, ly - 1.5, [K.red, K.yellow, "#ff7ab6"][i % 3]!, 2.6);
  }
  g.fillStyle = KB.asphalt;
  g.fillRect(0, py0, GROUND_W, py1 - py0);
  g.strokeStyle = shade(KB.asphalt, -0.3);
  g.lineWidth = 0.6;
  const half = (py1 - py0) / 2;
  for (let x = 0; x < GROUND_W; x += 64) g.strokeRect(x + 0.3, py0 + 0.3, 63.4, half - 0.6);
  for (let x = -32; x < GROUND_W; x += 64) g.strokeRect(x + 0.3, py0 + half + 0.3, 63.4, half - 0.6);
  g.fillStyle = "rgba(255,255,255,0.08)";
  g.fillRect(0, py0 + 1, GROUND_W, 1.2);
  const mid = py0 + half;
  for (let x = 8; x < GROUND_W; x += 48) tile(g, x, mid - 1.6, 24, 3, K.white, 0.8);
  for (const ky of [py0 - 4, py1]) for (let x = 0; x < GROUND_W; x += 16) brick(g, x, ky, 16, 4, (x / 16) % 2 ? KB.kerbK : KB.kerbY, false);
  g.fillStyle = "rgba(0,0,0,0.14)";
  g.fillRect(0, py1 + 4, GROUND_W, 1.5);
}

/** Gulmohar / rain tree; origin = trunk base. Brick trunk, stepped canopy crowned with red-orange bloom studs. */
export function paintGulmohar(g: C2, h: number, lean: number) {
  const seg = 8;
  const n = Math.max(3, Math.round((h * 0.42) / seg));
  let tx = 0, ty = 0;
  for (let i = 0; i < n; i++) {
    const u = (i + 1) / n;
    const cx = lean * h * u * u * 0.6;
    const cy = -(i + 1) * seg;
    brick(g, cx - 4.5, cy, 9, seg, i % 2 ? KB.trunk : shade(KB.trunk, 0.14), false);
    tx = cx;
    ty = cy;
  }
  for (const a of [-0.7, 0.7]) {
    g.save(); g.translate(tx, ty + 6); g.rotate(a); brick(g, -2.5, -14, 5, 14, KB.trunk, false); g.restore();
  }
  const W = h * 0.82;
  const layers = [0.55, 0.85, 1, 0.92, 0.7];
  const lh = 9;
  const r = rng(Math.round(h * 7 + lean * 1000) + 5);
  const base = ty + 2;
  const widths = layers.map((l) => Math.round((W * l) / P) * P);
  for (let li = 0; li < layers.length; li++) {
    const lw = widths[li]!;
    const y = base - (layers.length - li) * lh;
    const x0 = tx - lw / 2;
    let x = x0, j = 0;
    while (x < x0 + lw - 1) {
      const len = Math.min(P * (2 + ((j + li) % 3)), x0 + lw - x);
      const bloomy = r() < (li < 2 ? 0.5 : 0.28);
      const col = bloomy ? (r() < 0.6 ? KB.bloom : KB.bloom2) : (j + li) % 2 ? KB.leaf : KB.leafL;
      brick(g, x, y, len, lh, col, false);
      x += len;
      j++;
    }
    const prev = li === 0 ? 0 : widths[li - 1]!;
    for (let sx = x0 + P / 2; sx < x0 + lw; sx += P) {
      if (li > 0 && Math.abs(sx - tx) < prev / 2 - 1) continue;
      const c = r() < 0.6 ? (r() < 0.5 ? KB.bloom : KB.bloom2) : KB.leafL;
      stud(g, sx, y - 1.5, c, 2.5);
    }
  }
}

/** Green street sign on grey posts; origin = sign anchor (x, y). */
export function paintBlrSign(g: C2, text: string) {
  for (const px of [-24, 20.5]) for (let i = 0; i < 4; i++) brick(g, px, 2 + i * 9.6, 3.5, 9.6, i % 2 ? K.grey : shade(K.grey, 0.1), false);
  brick(g, -30, 40, 60, 4, K.greyD, true);
  brick(g, -35, -18, 70, 21, KB.streetGreen, true);
  g.strokeStyle = K.white;
  g.lineWidth = 1;
  rr(g, -31, -14, 62, 13, 1.6);
  g.stroke();
  g.fillStyle = K.white;
  fitText(g, text, 54, "800", 8.5, 6);
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText(text, 0, -7.4);
}

/** Street light; origin = (x, lamp row y). The bulb sits at STREET_BULB relative to it. */
export const STREET_BULB = { x: 9, y: -15.5 };
export function paintStreetLight(g: C2) {
  g.fillStyle = "rgba(20,30,25,0.25)";
  g.fillRect(-6, 24, 14, 3);
  brick(g, -6, 20, 12, 4, K.greyD, true);
  for (let k = 0; k < 5; k++) {
    const y = -18 + k * 7.6;
    g.fillStyle = shade(K.grey, -0.25);
    rr(g, -2.2, y, 4.4, 7.6, 1.4);
    g.fill();
    g.fillStyle = K.grey;
    rr(g, -2.2, y, 3.6, 7, 1.4);
    g.fill();
  }
  brick(g, -2, -22, 16, 3.5, K.greyD, false);
  brick(g, 4, -19, 10, 3, shade(K.greyD, -0.15), false);
  g.fillStyle = "#e9edf2";
  rr(g, 6, -16.4, 6, 2, 1);
  g.fill();
}

/** Height of a Bengaluru building above its base (for the urgent beacon). */
export function blrTop(variant: number, wallH: number, roofH: number): number {
  const v = ((variant % 4) + 4) % 4;
  return v === 0 ? wallH + roofH + 20 : v === 2 ? wallH + roofH * 0.5 + 26 : v === 1 ? wallH + 18 : wallH + roofH * 0.6 + 4;
}

function nameBoard(g: C2, name: string, cx: number, y: number, maxW: number, h: number, bg: string, fg: string) {
  const label = name.toUpperCase();
  const size = fitText(g, label, maxW - 10, "800", 9, 6.5);
  const text = clip(g, label, maxW - 10);
  const tw = Math.min(maxW, g.measureText(text).width + 12);
  tile(g, cx - tw / 2, y, tw, h, bg, 1.6);
  g.fillStyle = fg;
  g.font = `800 ${size}px ui-sans-serif, system-ui, sans-serif`;
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText(text, cx, y + h / 2 + 0.3);
}

function brickWall(g: C2, x0: number, w: number, rows: number, bh: number, col: (r: number, i: number) => string, studTop: boolean) {
  for (let r = 0; r < rows; r++) {
    const y = -(r + 1) * bh;
    let x = x0 - (r % 2 ? P * 1.5 : 0);
    let i = 0;
    while (x < x0 + w) {
      const len = P * (r % 3 === 0 ? 4 : 3);
      const a = Math.max(x, x0), b = Math.min(x + len, x0 + w);
      if (b - a > 1) brick(g, a, y, b - a, bh, col(r, i), studTop && r === rows - 1);
      x += len;
      i++;
    }
  }
}

function awning(g: C2, x: number, y: number, w: number, a: string, b: string) {
  const n = Math.max(3, Math.round(w / 10));
  const sw = w / n;
  for (let i = 0; i < n; i++) {
    const col = i % 2 ? a : b;
    brick(g, x + i * sw, y, sw, 5, col, false);
  }
  for (let i = 0; i < n; i++) {
    g.fillStyle = shade(i % 2 ? a : b, -0.1);
    g.beginPath();
    g.moveTo(x + i * sw, y + 5); g.lineTo(x + (i + 1) * sw, y + 5); g.lineTo(x + (i + 0.5) * sw, y + 9);
    g.closePath();
    g.fill();
  }
  brick(g, x - 2, y - 3, w + 4, 3, shade(a, -0.2), true);
}

/**
 * A Bengaluru building for one place, same footprint as the tea shop:
 * 0 glass office, 1 darshini cafe, 2 brick co-working loft, 3 kiosk with an awning.
 * Origin = (b.x, b.baseY). The project name is on a signboard.
 */
export function paintBlrBuilding(g: C2, w: number, wallH: number, roofH: number, doorDX: number, variant: number, name: string) {
  const v = ((variant % 4) + 4) % 4;
  g.fillStyle = "rgba(20,30,25,0.28)";
  g.fillRect(4, 0, w + 4, 5);
  const top = -wallH;
  const dx = doorDX - 12;
  if (v === 0) {
    // Glass office: concrete lobby, blue glass floors, frame columns, rooftop parapet + plant room.
    const H = blrTop(0, wallH, roofH);
    const x0 = 8, ww = w - 16;
    const rows = Math.floor((H - 29) / 7);
    const roofY = -24 - rows * 7;
    for (let r = 0; r < rows; r++) {
      const y = -24 - (r + 1) * 7;
      brick(g, x0, y, ww, 7, r % 2 ? KB.glass : shade(KB.glass, 0.07), false);
      g.fillStyle = "rgba(255,255,255,0.3)";
      for (let c = x0 + 6; c < x0 + ww - 6; c += 12) g.fillRect(c, y + 1.6, 7, 3.6);
    }
    for (const cx of [x0, x0 + ww / 2 - 2, x0 + ww - 4]) brick(g, cx, roofY, 4, rows * 7, KB.concreteD, false);
    g.fillStyle = "rgba(255,255,255,0.16)";
    g.beginPath();
    g.moveTo(x0 + 4, roofY);
    g.lineTo(x0 + ww * 0.4, roofY);
    g.lineTo(x0 + 4, -40);
    g.closePath();
    g.fill();
    brick(g, x0 - 3, roofY - 5, ww + 6, 5, K.greyD, true);
    brick(g, w - 44, roofY - 15, 20, 10, K.grey, true);
    brick(g, x0, -24, ww, 24, KB.concrete, false);
    g.fillStyle = KB.glassD;
    g.fillRect(dx - 2, -20, 28, 20);
    g.fillStyle = "rgba(255,255,255,0.45)";
    g.fillRect(dx + 11.4, -20, 1.2, 20);
    g.fillRect(dx + 1, -18, 1, 14);
    g.fillStyle = KB.glassD;
    g.fillRect(x0 + 6, -18, Math.max(10, dx - x0 - 14), 12);
    nameBoard(g, name, w / 2, roofY + 6, ww - 8, 14, K.white, KB.glassD);
    return;
  }
  if (v === 1) {
    // Darshini: cream brick walls, steel counter with tumblers, striped awning, water tank, roof board.
    brickWall(g, 0, w, 8, wallH / 8, (r, i) => (r === 0 ? KB.purple : (i + r) % 5 === 0 ? shade("#f3e3bd", -0.06) : "#f3e3bd"), false);
    const cw = Math.min(72, doorDX - 24);
    g.fillStyle = "#3a2a20";
    g.fillRect(8, top + 20, cw, wallH - 40);
    for (let i = 0; i < Math.floor((cw - 6) / 14); i++) {
      const gx = 16 + i * 14;
      brick(g, gx - 3, -30, 6, 8, KB.steel, false);
      g.fillStyle = "#9a5a2a";
      g.fillRect(gx - 2, -29, 4, 2);
    }
    brick(g, 4, -22, cw + 8, 14, KB.steel, true);
    g.fillStyle = "rgba(255,255,255,0.6)";
    g.fillRect(6, -18, cw + 4, 1);
    awning(g, 4, top + 9, cw + 8, K.red, K.white);
    g.fillStyle = "#3a2418";
    g.fillRect(dx, top + 22, 24, wallH - 22);
    brick(g, dx - 4, top + 18, 32, 4, K.red, false);
    brick(g, dx - 4, top + 22, 4, wallH - 22, K.red, false);
    brick(g, dx + 24, top + 22, 4, wallH - 22, K.red, false);
    brick(g, -4, top - 4, w + 8, 4, shade("#f3e3bd", -0.12), true);
    brick(g, w - 26, top - 18, 14, 14, "#2a2d33", false);
    stud(g, w - 19, top - 18.5, "#2a2d33", 3);
    nameBoard(g, name, w / 2 - 10, top - 20, w - 50, 16, K.yellow, K.red);
    return;
  }
  if (v === 2) {
    // Co-working loft: red brick, big dark-green framed windows, rooftop plants, dark name board over the door.
    const H = wallH + roofH * 0.5;
    const rows = Math.round(H / 7);
    brickWall(g, 0, w, rows, H / rows, (r, i) => ((i + r) % 4 === 0 ? KB.brickRD : KB.brickR), false);
    const wins = [-H + 9, -H / 2 + 1];
    for (const wy of wins) {
      for (let wx = 10; wx + 22 < w - 4; wx += 30) {
        if (wy === wins[1] && wx + 26 > dx - 4 && wx < dx + 28) continue;
        brick(g, wx - 2, wy - 2, 26, 22, "#1f5a3a", false);
        g.fillStyle = "#2c4d63";
        g.fillRect(wx, wy, 22, 18);
        g.fillStyle = "#1f5a3a";
        g.fillRect(wx + 10.4, wy, 1.2, 18);
        g.fillRect(wx, wy + 8.4, 22, 1.2);
        g.fillStyle = "rgba(255,255,255,0.3)";
        g.fillRect(wx + 2, wy + 2, 1, 5);
      }
    }
    g.fillStyle = "#2a2d33";
    g.fillRect(dx, -26, 24, 26);
    g.fillStyle = "#4a6a80";
    g.fillRect(dx + 3, -23, 18, 10);
    brick(g, dx - 4, -30, 32, 4, "#1f5a3a", false);
    brick(g, -3, -H - 4, w + 6, 4, KB.brickRD, true);
    for (const px of [4, w - 12]) {
      brick(g, px, -H - 10, 8, 6, K.orange, false);
      stud(g, px + 4, -H - 11, K.lime, 3);
    }
    brick(g, 26, -H - 10, 4, 6, K.greyD, false);
    brick(g, w - 30, -H - 10, 4, 6, K.greyD, false);
    nameBoard(g, name, w / 2, -H - 25, w - 30, 15, "#1f2430", K.white);
    return;
  }
  // Kiosk / shop: pale walls, shelves of colourful goods, striped awning, a signboard on posts.
  const H = blrTop(3, wallH, roofH);
  brickWall(g, 4, w - 8, 8, wallH / 8, (r, i) => (r === 0 ? K.blue : (i + r) % 5 === 0 ? shade(K.sky2, -0.06) : K.sky2), false);
  const ww = Math.min(76, doorDX - 24);
  g.fillStyle = "#3a2a20";
  g.fillRect(12, top + 20, ww, wallH - 30);
  const cols = [K.red, K.yellow, K.blue, K.green, K.orange];
  for (let sh = 0; sh < 3; sh++) {
    const sy = top + 28 + sh * 13;
    if (sy > -16) break;
    for (let i = 0; i < Math.floor((ww - 4) / 7); i++) brick(g, 14 + i * 7, sy, 5, 7, cols[(i + sh * 2) % 5]!, false);
    brick(g, 12, sy + 7, ww, 2.5, K.brown, false);
  }
  awning(g, 8, top + 8, ww + 8, K.blue, K.white);
  g.fillStyle = "#3a2418";
  g.fillRect(dx, top + 22, 24, wallH - 22);
  brick(g, dx - 4, top + 18, 32, 4, K.blue, false);
  brick(g, dx - 4, top + 22, 4, wallH - 22, K.blue, false);
  brick(g, dx + 24, top + 22, 4, wallH - 22, K.blue, false);
  brick(g, 0, top - 4, w, 4, K.greyD, true);
  brick(g, 22, -H + 14, 4, H - wallH - 18, K.greyD, false);
  brick(g, w - 26, -H + 14, 4, H - wallH - 18, K.greyD, false);
  nameBoard(g, name, w / 2, -H, w - 16, 16, K.white, K.blue);
}

/** A brick auto-rickshaw; origin = ground between the wheels; dir 1 = facing right. */
export function drawAuto(g: C2, x: number, y: number, dir: 1 | -1) {
  g.save();
  g.translate(x, y);
  g.scale(dir, 1);
  g.fillStyle = "rgba(0,0,0,0.25)";
  ell(g, 0, 0.5, 18, 2.6);
  g.fill();
  brick(g, -15, -11, 26, 7, KB.autoG, false);
  slope(g, 11, -11, 6, 7, KB.autoG, 1);
  brick(g, -15, -19, 22, 8, KB.autoY, false);
  slope(g, 7, -19, 7, 8, KB.autoY, 1);
  g.fillStyle = "#9fdcf5";
  g.beginPath();
  g.moveTo(7.8, -18.4); g.lineTo(12.8, -12); g.lineTo(7.8, -12);
  g.closePath();
  g.fill();
  g.fillStyle = "#1f2430";
  g.fillRect(-10, -18, 12, 6);
  brick(g, -16, -24, 26, 5, KB.hood, true);
  for (const wx of [-10, 9]) {
    g.fillStyle = "#1a1c20";
    ell(g, wx, -2.8, 3.4, 3.4);
    g.fill();
    g.fillStyle = K.grey;
    ell(g, wx, -2.8, 1.3, 1.3);
    g.fill();
  }
  stud(g, 15.5, -9.5, "#fff3a8", 1.4);
  g.restore();
}

/** A brick city bus; origin = ground between the wheels. */
export function drawBus(g: C2, x: number, y: number, dir: 1 | -1) {
  g.save();
  g.translate(x, y);
  g.scale(dir, 1);
  g.fillStyle = "rgba(0,0,0,0.25)";
  ell(g, 0, 0.5, 38, 3);
  g.fill();
  brick(g, -36, -14, 70, 11, KB.bus, false);
  brick(g, -36, -30, 70, 16, K.white, false);
  slope(g, 34, -30, 5, 27, K.white, 1);
  g.fillStyle = KB.bus;
  g.fillRect(-36, -17, 70, 2.4);
  g.fillStyle = "#2c4d63";
  for (let wx = -32; wx < 24; wx += 11) g.fillRect(wx, -28, 8, 8);
  g.fillStyle = "#9fdcf5";
  g.fillRect(27, -28, 7, 9);
  brick(g, -37, -34, 72, 4, shade(KB.bus, -0.1), true);
  for (const wx of [-24, 22]) {
    g.fillStyle = "#1a1c20";
    ell(g, wx, -3, 4, 4);
    g.fill();
    g.fillStyle = K.grey;
    ell(g, wx, -3, 1.5, 1.5);
    g.fill();
  }
  g.restore();
}

/** One metro car, origin = centre on the deck top; nose 1/-1 adds a sloped nose on that side. */
export const METRO_CAR_W = 46;
export function drawMetroCar(g: C2, x: number, y: number, nose: -1 | 0 | 1, lit = false) {
  const w = 44, h = 21;
  const x0 = x - w / 2;
  brick(g, x0, y - h, w, h - 3, "#eef0f4", false);
  brick(g, x0, y - 10, w, 7, KB.purple, false);
  g.fillStyle = lit ? "#ffe39a" : "#2c4d63";
  for (let wx = x0 + 5; wx < x0 + w - 6; wx += 10) g.fillRect(wx, y - h + 4, 7, 6);
  g.fillStyle = "rgba(255,255,255,0.35)";
  for (let wx = x0 + 5; wx < x0 + w - 6; wx += 10) g.fillRect(wx + 1, y - h + 4.6, 1, 4);
  brick(g, x0 + 1, y - h - 3, w - 2, 3, "#c4c9d1", true);
  if (nose) {
    const nx = nose === 1 ? x0 + w : x0 - 8;
    slope(g, nx, y - h, 8, h - 3, "#eef0f4", nose === 1 ? 1 : -1);
    g.fillStyle = KB.purple;
    g.fillRect(nx, y - 10, 8, 7);
    g.fillStyle = "#fff3a8";
    g.fillRect(nose === 1 ? nx + 3 : nx + 2, y - 8, 3, 2);
  }
  g.fillStyle = "#2a2d33";
  g.fillRect(x0 + 4, y - 3, 11, 3);
  g.fillRect(x0 + w - 15, y - 3, 11, 3);
}
