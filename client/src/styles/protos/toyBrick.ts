import { H, LAYOUT, STATUS_COLOR, W, hash, labelAnchor, poseOf, rng, type SceneFrame, type VillagerFrame } from "../scene";
import type { StyleProto } from "../types";

/**
 * 9 · Toy Brick: the village built from generic plastic toy bricks and shot
 * stop-motion. A studded green baseplate, brick-stacked tea shop, palms, sign
 * and lamps with visible seams and stud rows, translucent blue water plates and
 * a brick canoe. Villagers are blocky jointed toy figures (cylinder head with a
 * stud, trapezoid torso, block legs swinging from the hip, C-shaped hands).
 * Runs at 10 fps with a tiny per-frame jitter, like hand-moved figures.
 * No brand names, no logos, nothing printed on the studs.
 */

type C2 = CanvasRenderingContext2D;
const TAU = Math.PI * 2;
const P = 8; // stud pitch, logical units
const FPS = 10;

// Bright primary toy palette.
const K = {
  sky: "#dcefff", skyLow: "#f4fbff",
  base: "#3dab4a", path: "#e9d29a", pathD: "#d8bc7c",
  water: "#38a3e0", waterL: "#7fd0f5",
  red: "#e3342f", yellow: "#f7c52b", blue: "#2563d9", white: "#f6f3ea", tan: "#e9d29a",
  brown: "#8a5a2f", dark: "#3b2a22", grey: "#a7aeb8", greyD: "#6b7280", green: "#2fa84f", lime: "#7ccf3c",
  brass: "#f2b311", flame: "#ff9a1f", ink: "#1f2430",
};

// ── colour + shape helpers ───────────────────────────────────────────────────

const shadeCache = new Map<string, string>();
/** Mix a #rrggbb colour toward white (k > 0) or black (k < 0). */
function shade(hex: string, k: number): string {
  const key = hex + k;
  const hit = shadeCache.get(key);
  if (hit) return hit;
  const n = parseInt(hex.slice(1), 16);
  const t = k < 0 ? 0 : 255;
  const a = Math.abs(k);
  const ch = (c: number) => Math.round(c + (t - c) * a);
  const out = `rgb(${ch((n >> 16) & 255)},${ch((n >> 8) & 255)},${ch(n & 255)})`;
  shadeCache.set(key, out);
  return out;
}

function rr(ctx: C2, x: number, y: number, w: number, h: number, r: number) {
  const q = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + q, y);
  ctx.arcTo(x + w, y, x + w, y + h, q);
  ctx.arcTo(x + w, y + h, x, y + h, q);
  ctx.arcTo(x, y + h, x, y, q);
  ctx.arcTo(x, y, x + w, y, q);
  ctx.closePath();
}

function ell(ctx: C2, x: number, y: number, rx: number, ry: number) {
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, 0, 0, TAU);
}

/** One stud seen from slightly above: dark side, lit top, glossy highlight. Plain, nothing printed. */
function stud(ctx: C2, cx: number, cy: number, color: string, rx = 2.6, alpha = 1) {
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

/** A brick in elevation: bevels, a glossy streak, seam outline and studs on top. */
function brick(ctx: C2, x: number, y: number, w: number, h: number, color: string, studs = true) {
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

/** A sloped brick end (triangle), used for roofs and the canoe. dir 1 = slope goes down to the right. */
function slope(ctx: C2, x: number, y: number, w: number, h: number, color: string, dir: 1 | -1) {
  ctx.fillStyle = shade(color, -0.1);
  ctx.beginPath();
  if (dir === 1) { ctx.moveTo(x, y); ctx.lineTo(x + w, y + h); ctx.lineTo(x, y + h); }
  else { ctx.moveTo(x + w, y); ctx.lineTo(x + w, y + h); ctx.lineTo(x, y + h); }
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = shade(color, -0.42);
  ctx.lineWidth = 0.6;
  ctx.stroke();
  // Grip lines on the slope face.
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
function tile(ctx: C2, x: number, y: number, w: number, h: number, color: string, edge = 2) {
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

// ── static layers (built once, 2× resolution) ───────────────────────────────

let backLayer: HTMLCanvasElement | null = null;
let frontLayer: HTMLCanvasElement | null = null;
let cloudImg: HTMLCanvasElement | null = null;

function makeLayer(w: number, h: number, paint: (g: C2) => void): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = w * 2;
  c.height = h * 2;
  const g = c.getContext("2d")!;
  g.scale(2, 2);
  paint(g);
  return c;
}

/** Small brick palm for the far shore. */
function farPalm(g: C2, x: number, baseY: number) {
  for (let i = 0; i < 4; i++) brick(g, x - 2 + i * 0.6, baseY - (i + 1) * 6, 4, 6, i % 2 ? K.brown : shade(K.brown, 0.12), false);
  const tx = x + 2.4, ty = baseY - 25;
  g.fillStyle = shade(K.green, -0.05);
  for (const a of [-2.7, -2.0, -1.1, -0.4]) {
    g.save();
    g.translate(tx, ty);
    g.rotate(a + Math.PI / 2 + 1.57);
    rr(g, -1.6, 0, 3.2, 12, 1);
    g.restore();
    g.fill();
  }
}

function paintBack(g: C2) {
  // Sky.
  const sky = g.createLinearGradient(0, 0, 0, LAYOUT.horizonY);
  sky.addColorStop(0, K.sky);
  sky.addColorStop(1, K.skyLow);
  g.fillStyle = sky;
  g.fillRect(0, 0, W, LAYOUT.horizonY);
  // Sun: a round yellow plate with four studs.
  g.fillStyle = shade(K.yellow, -0.3);
  ell(g, 578, 50, 19, 19);
  g.fill();
  g.fillStyle = K.yellow;
  ell(g, 578, 48, 19, 19);
  g.fill();
  g.fillStyle = "rgba(255,255,255,0.45)";
  ell(g, 571, 40, 6, 4);
  g.fill();
  for (const [dx, dy] of [[-5, -5], [5, -5], [-5, 5], [5, 5]]) stud(g, 578 + dx, 46 + dy, K.yellow, 3);

  // Stepped brick hills behind the shore.
  const hills = [
    { x: 0, w: 150, rows: 3 }, { x: 170, w: 120, rows: 2 }, { x: 330, w: 200, rows: 4 }, { x: 560, w: 100, rows: 2 },
  ];
  for (const hl of hills) {
    for (let r = 0; r < hl.rows; r++) {
      const inset = r * 16;
      const col = r % 2 ? "#9fd88a" : "#8fcf78";
      brick(g, hl.x + inset, LAYOUT.horizonY - (r + 1) * 6, hl.w - inset * 2, 6, col, r === hl.rows - 1);
    }
  }
  for (const x of LAYOUT.farPalms) farPalm(g, x, LAYOUT.horizonY);

  // Water: translucent blue plates seen from above, seams and glassy studs.
  const top = LAYOUT.waterTop, bot = LAYOUT.waterBottom;
  g.fillStyle = K.water;
  g.fillRect(0, top, W, bot - top);
  const r = rng(91);
  for (let y = top; y < bot; y += P) {
    let x = -((y / P) % 2) * 12;
    while (x < W) {
      const len = P * (2 + Math.floor(r() * 5));
      g.fillStyle = r() < 0.5 ? "rgba(140,215,250,0.35)" : "rgba(20,110,190,0.22)";
      g.fillRect(x, y, len, P);
      g.strokeStyle = "rgba(255,255,255,0.35)";
      g.lineWidth = 0.6;
      g.strokeRect(x + 0.3, y + 0.3, len - 0.6, P - 0.6);
      x += len;
    }
  }
  for (let y = top + 4; y < bot - 2; y += P) {
    for (let x = 4; x < W; x += P) stud(g, x, y - 0.6, K.waterL, 2.4, 0.42);
  }
  g.fillStyle = "rgba(255,255,255,0.5)";
  g.fillRect(0, top, W, 1.2);
}

function palm(g: C2, x: number, baseY: number, h: number, lean: number) {
  const seg = 9;
  const n = Math.round(h * 0.62 / seg);
  let tx = x, ty = baseY;
  for (let i = 0; i < n; i++) {
    const u = (i + 1) / n;
    const cx = x + lean * h * u * u * 1.2;
    const cy = baseY - (i + 1) * seg;
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
  // Leaves: long green plates with a stud row, two segments each, drooping.
  const L = h * 0.24;
  const leaves = [-2.95, -2.5, -2.05, -1.1, -0.65, -0.2, 0.35, 2.8];
  leaves.forEach((a, i) => {
    const col = i % 2 ? K.green : K.lime;
    g.save();
    g.translate(tx, ty + 1);
    g.rotate(a);
    brick(g, 0, -3, L, 6, col, false);
    for (let s = 4; s < L - 2; s += P) stud(g, s, -3.5, col, 2.2);
    g.translate(L - 1, 0);
    const droop = Math.cos(a) < 0 ? -0.6 : 0.6;
    g.rotate(droop);
    brick(g, 0, -2.5, L * 0.7, 5, col, false);
    slope(g, L * 0.7, -2.5, 5, 5, col, 1);
    g.restore();
  });
  // Coconuts: round brown studs.
  for (const [dx, dy] of [[-3, 5], [3, 6], [0, 9]]) {
    g.fillStyle = shade(K.brown, -0.3);
    ell(g, tx + dx, ty + dy, 3.4, 3.4);
    g.fill();
    g.fillStyle = "rgba(255,255,255,0.35)";
    ell(g, tx + dx - 1, ty + dy - 1, 1, 1);
    g.fill();
  }
}

function shop(g: C2) {
  const s = LAYOUT.shop;
  const base = s.y + s.h;
  const rows = 8;
  const bh = s.h / rows;
  // Shadow on the baseplate.
  g.fillStyle = "rgba(20,70,25,0.3)";
  g.fillRect(s.x + 4, base, s.w + 4, 5);
  // Walls in running bond.
  for (let r = 0; r < rows; r++) {
    const y = base - (r + 1) * bh;
    let x = s.x - (r % 2 ? P * 1.5 : 0);
    let i = 0;
    while (x < s.x + s.w) {
      const len = P * (r % 3 === 0 ? 4 : 3);
      const x0 = Math.max(x, s.x);
      const x1 = Math.min(x + len, s.x + s.w);
      const col = r === 0 ? K.red : (i + r) % 5 === 0 ? shade(K.white, -0.06) : K.white;
      if (x1 - x0 > 1) brick(g, x0, y, x1 - x0, bh, col, r === rows - 1);
      x += len;
      i++;
    }
  }
  // Serving window: dark interior, counter plate, three glass cups.
  const wx = s.x + 10, wy = s.y + 18, ww = 62, wh = 30;
  g.fillStyle = "#4a2f20";
  g.fillRect(wx, wy, ww, wh);
  g.fillStyle = "rgba(255,255,255,0.08)";
  g.fillRect(wx, wy, ww, 3);
  brick(g, wx - 3, wy + wh, ww + 6, 4, K.brown, true);
  for (let i = 0; i < 3; i++) {
    const gx = wx + 14 + i * 16, gy = wy + wh - 1;
    g.fillStyle = "rgba(255,255,255,0.45)";
    g.fillRect(gx - 3, gy - 9, 6, 9);
    g.fillStyle = "#b8662a";
    g.fillRect(gx - 2.5, gy - 6, 5, 5.5);
    g.strokeStyle = "rgba(255,255,255,0.8)";
    g.lineWidth = 0.6;
    g.strokeRect(gx - 3, gy - 9, 6, 9);
  }
  // Window frame bricks.
  brick(g, wx - 4, wy - 4, ww + 8, 4, K.blue, false);
  // Door: brown frame, dark opening.
  const dx = s.doorX - 12;
  g.fillStyle = "#3a2418";
  g.fillRect(dx, s.y + 20, 24, base - s.y - 20);
  brick(g, dx - 4, s.y + 16, 32, 4, K.blue, false);
  brick(g, dx - 4, s.y + 20, 4, base - s.y - 20, K.blue, false);
  brick(g, dx + 24, s.y + 20, 4, base - s.y - 20, K.blue, false);
  // Hanging banana bunch (yellow round plates) at the window.
  for (let i = 0; i < 4; i++) {
    g.fillStyle = K.yellow;
    ell(g, wx + ww - 7, wy + 6 + i * 3.4, 3.2 - i * 0.4, 1.7);
    g.fill();
  }
  // Roof: stepped red bricks with slope ends, studs on every exposed step.
  const roofRows = 4;
  const rh = s.roofH / roofRows;
  for (let r = 0; r < roofRows; r++) {
    const inset = -14 + r * 20;
    const x0 = s.x + inset + rh, x1 = s.x + s.w - inset - rh;
    const y = s.y - (r + 1) * rh;
    const col = r % 2 ? K.red : shade(K.red, 0.08);
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
  // Sign tile on the roof face: "CHAYA KADA".
  const tx = s.x + s.w / 2 - 34, ty = s.y - rh * 2 + 1;
  tile(g, tx, ty, 68, rh * 2 - 4, K.yellow, 1.6);
  g.fillStyle = K.red;
  g.font = "800 9px ui-sans-serif, system-ui, sans-serif";
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText("CHAYA KADA", tx + 34, ty + rh - 1.5);
}

function sign(g: C2) {
  const s = LAYOUT.sign;
  for (let i = 0; i < 4; i++) brick(g, s.x - 3, s.y + 2 + i * 9.6, 6, 9.6, i % 2 ? K.grey : shade(K.grey, 0.1), false);
  brick(g, s.x - 8, s.y + 40, 16, 4, K.greyD, true);
  brick(g, s.x - 33, s.y - 16, 66, 18, K.blue, true);
  tile(g, s.x - 29, s.y - 13, 58, 11.5, K.white, 1.2);
  g.fillStyle = K.blue;
  g.font = "800 8.5px ui-sans-serif, system-ui, sans-serif";
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText(s.text, s.x, s.y - 7);
}

function lampPosts(g: C2) {
  const L = LAYOUT.lamps;
  for (let i = 0; i < L.count; i++) {
    const x = L.x0 + i * L.dx;
    g.fillStyle = "rgba(20,70,25,0.3)";
    g.fillRect(x - 6, L.y + 24, 14, 3);
    brick(g, x - 7, L.y + 20, 14, 4, K.greyD, true);
    for (let k = 0; k < 2; k++) {
      const y = L.y + 2 + k * 9;
      g.fillStyle = shade(K.brass, -0.25);
      rr(g, x - 3, y, 6, 9, 1.8);
      g.fill();
      g.fillStyle = K.brass;
      rr(g, x - 3, y, 5, 8.3, 1.8);
      g.fill();
      g.fillStyle = "rgba(255,255,255,0.45)";
      g.fillRect(x - 1.8, y + 1.5, 1, 5);
    }
    brick(g, x - 6, L.y - 1, 12, 3.5, K.brass, false);
    g.fillStyle = K.dark;
    g.fillRect(x - 0.6, L.y - 3, 1.2, 2);
  }
}

function paintFront(g: C2) {
  const top = LAYOUT.groundY;
  // The baseplate.
  g.fillStyle = K.base;
  g.fillRect(0, top, W, H - top);
  g.fillStyle = shade(K.base, 0.3);
  g.fillRect(0, top, W, 1.4);
  for (let y = top + 5; y < H + 2; y += P) {
    for (let x = 4; x < W; x += P) stud(g, x, y, K.base, 2.5);
  }
  // Path: smooth tan tiles (no studs) in a running pattern.
  const py0 = 282, py1 = 346;
  const r = rng(23);
  for (let y = py0; y < py1; y += P) {
    let x = -((y / P) % 3) * P;
    while (x < W) {
      const len = P * (2 + Math.floor(r() * 3));
      g.fillStyle = r() < 0.25 ? K.pathD : K.path;
      g.fillRect(x, y, len, P);
      g.fillStyle = "rgba(255,255,255,0.45)";
      g.fillRect(x + 1, y + 0.6, len - 2, 0.9);
      g.strokeStyle = shade(K.path, -0.32);
      g.lineWidth = 0.6;
      g.strokeRect(x + 0.3, y + 0.3, len - 0.6, P - 0.6);
      x += len;
    }
  }
  g.fillStyle = "rgba(0,0,0,0.12)";
  g.fillRect(0, py1, W, 1.5);
  // Flowers: 1×1 round plates scattered on the grass.
  const fr = rng(5);
  for (let i = 0; i < 26; i++) {
    const x = 4 + Math.floor(fr() * 80) * P;
    const y = top + 5 + Math.floor(fr() * 10) * P;
    if (y > py0 - 6 && y < py1 + 4) continue;
    stud(g, x, y - 1, [K.red, K.yellow, K.white, "#ff7ab6"][i % 4], 2.7);
  }
  // Translucent front water row over the canoe's hull.
  g.fillStyle = "rgba(56,163,224,0.55)";
  g.fillRect(0, 186, W, LAYOUT.waterBottom - 186);
  g.fillStyle = "rgba(255,255,255,0.5)";
  g.fillRect(0, 186, W, 0.9);
  for (let x = 4; x < W; x += P) stud(g, x, 190, K.waterL, 2.4, 0.45);

  // Objects, back to front.
  const [pL, pM, pR] = LAYOUT.palms;
  palm(g, pM.x, pM.baseY, pM.h, pM.lean);
  palm(g, pR.x, pR.baseY, pR.h, pR.lean);
  palm(g, pL.x, pL.baseY, pL.h, pL.lean);
  sign(g);
  shop(g);
  lampPosts(g);
}

function makeCloud(): HTMLCanvasElement {
  return makeLayer(80, 30, (g) => {
    brick(g, 4, 18, 72, 9, K.white, true);
    brick(g, 14, 9, 48, 9, K.white, true);
    brick(g, 26, 2, 24, 7, K.white, true);
  });
}

// ── dynamic pieces ──────────────────────────────────────────────────────────

/** Frame-index jitter: tiny, deterministic, changes every stop-motion frame. */
function jit(k: number, seed: number, amp: number) {
  return (hash(k * 1.37 + seed * 19.3) - 0.5) * 2 * amp;
}

function canoe(ctx: C2, f: SceneFrame, k: number) {
  const x = f.canoeX + jit(k, 41, 0.5), y = 178 + jit(k, 42, 0.4);
  const rot = jit(k, 43, 0.012);
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  // Rower: a small blocky figure.
  const paddle = Math.sin(f.t * 2.4);
  ctx.strokeStyle = K.brown;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-2 + paddle * 4, -18);
  ctx.lineTo(8 - paddle * 6, 6);
  ctx.stroke();
  ctx.fillStyle = "#f59e0b";
  ctx.beginPath();
  ctx.moveTo(-6, -6); ctx.lineTo(6, -6); ctx.lineTo(4, -15); ctx.lineTo(-4, -15);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "#7a4a30";
  rr(ctx, -4, -23, 8, 8, 2);
  ctx.fill();
  ctx.fillRect(-2, -25, 4, 2);
  ctx.fillStyle = K.ink;
  ctx.fillRect(0.8, -20, 1, 1);
  // Hull: brown bricks with slope ends, studs along the gunwale.
  brick(ctx, -20, -6, 40, 6, K.brown, true);
  slope(ctx, -28, -6, 8, 6, K.brown, -1);
  slope(ctx, 20, -6, 8, 6, K.brown, 1);
  brick(ctx, -16, 0, 32, 6, shade(K.brown, -0.15), false);
  slope(ctx, -22, 0, 6, 6, shade(K.brown, -0.15), 1 as 1);
  ctx.restore();
}

function flames(ctx: C2, f: SceneFrame, k: number) {
  const L = LAYOUT.lamps;
  for (let i = 0; i < L.count; i++) {
    const lit = Math.max(0, Math.min(1, f.lampsLit - i));
    if (lit <= 0) continue;
    const x = L.x0 + i * L.dx + jit(k, 60 + i, 0.4);
    const y = L.y - 1;
    const hgt = 12 * (0.85 + 0.15 * hash(k * 0.7 + i)) * (0.4 + 0.6 * lit);
    ctx.globalAlpha = 0.22 * lit;
    ctx.fillStyle = "#ffd36b";
    ell(ctx, x, y - hgt * 0.5, 11, 11);
    ctx.fill();
    ctx.globalAlpha = 0.85 * lit;
    ctx.fillStyle = K.flame;
    ctx.beginPath();
    ctx.moveTo(x - 3.2, y);
    ctx.quadraticCurveTo(x - 3.4, y - hgt * 0.6, x, y - hgt);
    ctx.quadraticCurveTo(x + 3.4, y - hgt * 0.6, x + 3.2, y);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#fff3a8";
    ell(ctx, x - 0.6, y - hgt * 0.35, 1.2, hgt * 0.22);
    ctx.fill();
    ctx.globalAlpha = 1;
  }
}

function steam(ctx: C2, f: SceneFrame, k: number) {
  const s = LAYOUT.shop;
  for (let i = 0; i < 3; i++) {
    const gx = s.x + 24 + i * 16;
    for (let j = 0; j < 2; j++) {
      const u = ((f.t * 0.6 + i * 0.33 + j * 0.5) % 1);
      const y = s.y + 36 - u * 16;
      const x = gx + Math.sin(u * 6 + i) * 1.5 + jit(k, i * 7 + j, 0.3);
      ctx.globalAlpha = 0.7 * (1 - u);
      ctx.fillStyle = "#ffffff";
      ell(ctx, x, y, 2.2, 1.4);
      ctx.fill();
    }
  }
  ctx.globalAlpha = 1;
}

// ── villagers: blocky jointed toy figures ───────────────────────────────────

const LEG = 20;

function limbOutline(ctx: C2, color: string) {
  ctx.strokeStyle = shade(color, -0.45);
  ctx.lineWidth = 0.6;
  ctx.stroke();
}

function leg(ctx: C2, px: number, hipY: number, a: number, color: string) {
  ctx.save();
  ctx.translate(px, hipY);
  ctx.rotate(-a);
  ctx.fillStyle = color;
  rr(ctx, -3.8, -0.5, 7.6, LEG - 2.5, 1);
  ctx.fill();
  limbOutline(ctx, color);
  // Foot block, sticking forward.
  ctx.fillStyle = shade(color, -0.08);
  rr(ctx, -3.8, LEG - 4, 10, 4, 1);
  ctx.fill();
  limbOutline(ctx, color);
  ctx.fillStyle = "rgba(255,255,255,0.3)";
  ctx.fillRect(-2.4, 1.5, 1, LEG - 7);
  ctx.restore();
}

/** Arm: a rounded block rotating stiffly at the shoulder, ending in a C-shaped hand. Returns the hand position. */
function arm(ctx: C2, px: number, py: number, a: number, sleeve: string, skin: string) {
  ctx.save();
  ctx.translate(px, py);
  ctx.rotate(-a);
  ctx.fillStyle = sleeve;
  rr(ctx, -2.7, -2.2, 5.4, 13.5, 2.6);
  ctx.fill();
  limbOutline(ctx, sleeve);
  ctx.fillStyle = "rgba(255,255,255,0.3)";
  ctx.fillRect(-1.5, 0, 0.9, 8);
  ctx.strokeStyle = skin;
  ctx.lineWidth = 2.1;
  ctx.beginPath();
  ctx.arc(0, 13.8, 2.3, 0.35 * Math.PI, 2.65 * Math.PI);
  ctx.stroke();
  ctx.restore();
  return { x: px + Math.sin(a) * 13.8, y: py + Math.cos(a) * 13.8 };
}

function figure(ctx: C2, v: VillagerFrame, k: number) {
  const p = poseOf(v);
  const seed = v.id.charCodeAt(0);
  const jx = jit(k, seed, 0.55), jy = jit(k, seed + 3, 0.35), jr = jit(k, seed + 7, 0.022);
  // Contact shadow on the baseplate.
  ctx.fillStyle = `rgba(15,60,20,${0.32 - v.jump * 0.16})`;
  ell(ctx, v.x + 1, v.y + 0.5, 12 - v.jump * 4, 2.8);
  ctx.fill();

  ctx.save();
  ctx.translate(v.x + jx, v.y + jy);
  ctx.rotate(jr);
  ctx.scale(v.facing, 1);

  const hipY = -LEG + p.bob;
  const torsoTop = hipY - 4 - 21;
  const shoulderY = torsoTop + 2.5;
  const celebrating = v.status === "finished" && v.jump > 0.02;
  let aF = p.armF * 1.3, aB = p.armB * 1.3;
  if (v.carry === "laptop") { aF = 1.35; aB = 1.15; }
  else if (v.carry === "glass") { aF = 1.15; }
  if (celebrating) { aF = 2.75; aB = 2.55; }
  const sleeveB = shade(v.shirt, -0.2);

  // Back arm and back leg behind the body.
  arm(ctx, -5.5, shoulderY, aB, sleeveB, shade(v.skin, -0.15));
  leg(ctx, -1.6, hipY, p.legB, shade(v.mundu, -0.16));
  leg(ctx, 1.6, hipY, p.legF, v.mundu);
  // Hip piece.
  ctx.fillStyle = shade(v.mundu, -0.06);
  rr(ctx, -8, hipY - 4.5, 16, 6, 1);
  ctx.fill();
  limbOutline(ctx, v.mundu);
  // Mundu fold: a printed line on the hip piece.
  ctx.fillStyle = shade(v.mundu, -0.3);
  ctx.fillRect(-8, hipY - 4.5, 16, 1);

  // Trapezoid torso.
  ctx.beginPath();
  ctx.moveTo(-10, hipY - 4);
  ctx.lineTo(10, hipY - 4);
  ctx.lineTo(6.5, torsoTop);
  ctx.lineTo(-6.5, torsoTop);
  ctx.closePath();
  ctx.fillStyle = v.shirt;
  ctx.fill();
  limbOutline(ctx, v.shirt);
  ctx.fillStyle = shade(v.shirt, -0.14);
  ctx.beginPath();
  ctx.moveTo(4, hipY - 4);
  ctx.lineTo(10, hipY - 4);
  ctx.lineTo(6.5, torsoTop);
  ctx.lineTo(3, torsoTop);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "rgba(255,255,255,0.35)";
  ctx.fillRect(-5.5, torsoTop + 3, 1.2, 13);
  // Printed collar and buttons.
  ctx.strokeStyle = shade(v.shirt, -0.4);
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  ctx.moveTo(-3.2, torsoTop);
  ctx.lineTo(0, torsoTop + 5);
  ctx.lineTo(3.2, torsoTop);
  ctx.stroke();
  ctx.fillStyle = shade(v.shirt, -0.4);
  for (let i = 0; i < 2; i++) ctx.fillRect(-0.5, torsoTop + 8 + i * 5, 1.1, 1.1);

  // Neck and cylinder head with a stud.
  ctx.fillStyle = shade(v.skin, -0.2);
  ctx.fillRect(-2.8, torsoTop - 2, 5.6, 2.2);
  const hy = torsoTop - 13.5;
  if (v.id === "b") {
    // Hair bun piece behind the head.
    ctx.fillStyle = "#1c1410";
    ell(ctx, -6.5, hy + 4, 3.6, 3.6);
    ctx.fill();
  }
  ctx.fillStyle = v.skin;
  rr(ctx, -6.5, hy, 13, 12, 3.6);
  ctx.fill();
  limbOutline(ctx, v.skin);
  ctx.fillStyle = shade(v.skin, -0.14);
  rr(ctx, 3, hy + 0.6, 3.2, 10.8, 3);
  ctx.fill();
  ctx.fillStyle = "rgba(255,255,255,0.4)";
  ctx.fillRect(-4.6, hy + 2.2, 1.4, 7);
  // Hair print across the top edge.
  ctx.fillStyle = "#1c1410";
  rr(ctx, -6.5, hy, 13, 3, 2.5);
  ctx.fill();
  // Stud.
  ctx.fillStyle = shade(v.skin, -0.25);
  ctx.fillRect(-3, hy - 2.6, 6, 2.8);
  ctx.fillStyle = shade(v.skin, 0.1);
  ell(ctx, 0, hy - 2.6, 3, 1.1);
  ctx.fill();
  // Printed face (looking the way the figure faces).
  ctx.fillStyle = K.ink;
  ell(ctx, 0.6, hy + 5.6, 0.85, 1.05);
  ctx.fill();
  ell(ctx, 4.4, hy + 5.6, 0.85, 1.05);
  ctx.fill();
  ctx.strokeStyle = K.ink;
  ctx.lineWidth = 0.75;
  ctx.beginPath();
  if (v.status === "waiting") ctx.arc(2.6, hy + 9.6, 1.4, 1.15 * Math.PI, 1.85 * Math.PI); // small worried mouth
  else ctx.arc(2.6, hy + 7.4, 2.4, 0.15 * Math.PI, 0.85 * Math.PI);
  ctx.stroke();
  if (v.id === "a" || v.id === "c") {
    ctx.fillStyle = "#1c1410";
    rr(ctx, 0.4, hy + 7.4, 4.4, 1.1, 0.5);
    ctx.fill();
  } else {
    ctx.fillStyle = K.red;
    ell(ctx, 2.5, hy + 3.9, 0.7, 0.7);
    ctx.fill();
  }

  // Front arm and what it carries.
  if (v.carry === "laptop") {
    const h = { x: 5.5 + Math.sin(aF) * 13.8, y: shoulderY + Math.cos(aF) * 13.8 };
    // Base plate (dark grey) with studs, screen tile standing up, glowing.
    ctx.fillStyle = "#4b5563";
    rr(ctx, h.x - 7, h.y - 2.5, 17, 3, 0.8);
    ctx.fill();
    ctx.save();
    ctx.translate(h.x - 6, h.y - 2.5);
    ctx.rotate(-0.25);
    tile(ctx, -1, -12, 14, 11, "#9ca3af", 1);
    ctx.fillStyle = "#7df0ff";
    ctx.fillRect(1, -10, 10, 7.5);
    ctx.fillStyle = "#0e7490";
    ctx.fillRect(2, -8.6, 6, 0.9);
    ctx.fillRect(2, -6.6, 4, 0.9);
    ctx.fillRect(3, -4.6, 5, 0.9);
    ctx.restore();
  }
  const hand = arm(ctx, 5.5, shoulderY, aF, v.shirt, v.skin);
  if (v.carry === "glass") {
    // Clear round brick with tea, held in the C-hand.
    const gx = hand.x + 0.5, gy = hand.y + 2;
    ctx.fillStyle = "rgba(255,255,255,0.5)";
    rr(ctx, gx - 3, gy - 9, 6, 9.5, 1);
    ctx.fill();
    ctx.fillStyle = "rgba(180,95,35,0.9)";
    ctx.fillRect(gx - 2.5, gy - 6, 5, 6);
    ctx.strokeStyle = "rgba(255,255,255,0.9)";
    ctx.lineWidth = 0.6;
    rr(ctx, gx - 3, gy - 9, 6, 9.5, 1);
    ctx.stroke();
    ctx.fillStyle = "rgba(255,255,255,0.8)";
    ctx.fillRect(gx - 2.2, gy - 8, 0.8, 6);
  }
  ctx.restore();
}

// ── labels on flat brick tiles ──────────────────────────────────────────────

function label(ctx: C2, v: VillagerFrame, f: SceneFrame, k: number) {
  const a = labelAnchor(v);
  const urgent = v.status === "waiting";
  const nameFont = "800 7px ui-sans-serif, system-ui, sans-serif";
  const textFont = "650 8.5px ui-sans-serif, system-ui, sans-serif";
  ctx.font = nameFont;
  const nw = ctx.measureText(v.name.toUpperCase()).width;
  ctx.font = textFont;
  const lw = ctx.measureText(v.label).width;
  const w = Math.max(nw, lw) + 22;
  const h = 22;
  const seed = v.id.charCodeAt(0) + 100;
  const cx = a.x + jit(k, seed, 0.4);
  const by = a.y + 6 + jit(k, seed + 1, 0.3);
  const x0 = Math.round(cx - w / 2), y0 = by - h;

  // A 1×1 round stem from the tile down toward the head.
  ctx.fillStyle = shade(K.grey, -0.1);
  ctx.fillRect(cx - 1.2, by + 2, 2.4, 6);

  ctx.save();
  if (urgent) {
    const sc = 1 + 0.05 * f.pulse;
    ctx.translate(cx, by);
    ctx.scale(sc, sc);
    ctx.translate(-cx, -by);
    ctx.globalAlpha = 0.18 + 0.3 * f.pulse;
    ctx.fillStyle = STATUS_COLOR.waiting;
    rr(ctx, x0 - 4, y0 - 4, w + 8, h + 10, 5);
    ctx.fill();
    ctx.globalAlpha = 1;
  }
  const base = urgent ? (f.pulse > 0.5 ? "#ef3b30" : "#c9271e") : K.white;
  tile(ctx, x0, y0, w, h, base, 2.4);
  // Status block: a coloured 1×2 tile on the left.
  const sc = urgent ? K.yellow : STATUS_COLOR[v.status];
  ctx.fillStyle = shade(sc, -0.3);
  rr(ctx, x0 + 3, y0 + 3.6, 8, h - 6, 1.5);
  ctx.fill();
  ctx.fillStyle = sc;
  rr(ctx, x0 + 3, y0 + 3, 8, h - 6.6, 1.5);
  ctx.fill();
  if (urgent) {
    ctx.fillStyle = K.ink;
    ctx.font = "900 10px ui-sans-serif, system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("!", x0 + 7, y0 + h / 2);
  }
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.font = nameFont;
  ctx.fillStyle = urgent ? "rgba(255,255,255,0.85)" : "#6b7280";
  ctx.fillText(v.name.toUpperCase(), x0 + 15, y0 + 9);
  ctx.font = textFont;
  ctx.fillStyle = urgent ? "#ffffff" : K.ink;
  ctx.fillText(v.label, x0 + 15, y0 + 18.5);
  ctx.restore();
}

// ── progress: a brick row being built ──────────────────────────────────────

function progress(ctx: C2, f: SceneFrame, k: number) {
  const x0 = 104, y = 349, n = 32, bw = 16;
  // Label tile.
  tile(ctx, 14, 343, 84, 13, K.white, 1.6);
  ctx.fillStyle = K.ink;
  ctx.font = "750 7.5px ui-sans-serif, system-ui, sans-serif";
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillText(`KUTTAN'S TASK ${Math.round(f.progress * 100)}%`, 19, 349.8);
  // Empty sockets on a dark grey plate.
  ctx.fillStyle = "#5b6470";
  ctx.fillRect(x0 - 2, y + 4, n * bw + 4, 5);
  ctx.fillStyle = "rgba(255,255,255,0.25)";
  ctx.fillRect(x0 - 2, y + 4, n * bw + 4, 0.8);
  const exact = f.progress * n;
  const done = Math.floor(exact);
  const col = "#14b8a6";
  for (let i = 0; i < n; i++) {
    const x = x0 + i * bw;
    if (i < done) brick(ctx, x, y - 1, bw, 5, col, true);
    else if (i === done) {
      // The next brick drops in, one stop-motion step at a time.
      const frac = exact - done;
      const lift = Math.round((1 - frac) * 4) * 2.5 + jit(k, 77, 0.3);
      ctx.globalAlpha = 0.35 + 0.65 * frac;
      brick(ctx, x, y - 1 - lift, bw, 5, col, true);
      ctx.globalAlpha = 1;
    } else {
      for (let s = 0; s < 2; s++) stud(ctx, x + 4 + s * P, y + 3.4, "#5b6470", 2.3);
    }
  }
}

export const toyBrick: StyleProto = {
  id: "toy-brick",
  n: 9,
  name: "Toy Brick",
  blurb: "A world of generic plastic bricks: studded baseplate, brick-stacked shop, palms and lamps, translucent water plates. Blocky jointed figures, shot stop-motion at 10 fps with a tiny hand-moved jitter.",
  fps: FPS,
  bg: "#dcefff",
  draw(ctx, f) {
    const k = Math.round(f.t * FPS);
    if (!backLayer) backLayer = makeLayer(W, H, paintBack);
    if (!frontLayer) frontLayer = makeLayer(W, H, paintFront);
    if (!cloudImg) cloudImg = makeCloud();

    ctx.drawImage(backLayer, 0, 0, W, H);
    // Brick clouds drifting across, stepping per frame.
    const clouds = [{ x: 40, y: 22, s: 1 }, { x: 300, y: 50, s: 0.75 }, { x: 470, y: 14, s: 0.9 }];
    for (const c of clouds) {
      const span = W + 120;
      const x = (((c.x + f.drift * c.s) % span) + span) % span - 100;
      ctx.drawImage(cloudImg, x, c.y, 80 * c.s, 30 * c.s);
    }
    // Water glints sliding along the plates.
    ctx.fillStyle = "rgba(255,255,255,0.75)";
    for (let i = 0; i < 9; i++) {
      const gx = ((i * 83 + f.t * (10 + (i % 3) * 4)) % (W + 30)) - 15;
      const gy = LAYOUT.waterTop + 6 + (i % 4) * 9;
      ctx.fillRect(Math.round(gx / 2) * 2, gy, 8, 1.2);
    }
    canoe(ctx, f, k);
    ctx.drawImage(frontLayer, 0, 0, W, H);
    steam(ctx, f, k);
    flames(ctx, f, k);

    const vs = [...f.villagers].sort((a, b) => a.y - b.y);
    for (const v of vs) figure(ctx, v, k);
    for (const v of vs) label(ctx, v, f, k);
    progress(ctx, f, k);
  },
};
