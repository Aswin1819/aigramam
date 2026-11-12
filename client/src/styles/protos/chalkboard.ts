import { BODY, H, LAYOUT, W, boil, hash, labelAnchor, rng, skeleton, type SceneFrame, type VillagerFrame } from "../scene";
import type { StyleProto } from "../types";

/**
 * 2 · Chalkboard: the village drawn in chalk on a green slate, inside a wooden
 * frame with a chalk tray. Rough, slightly broken strokes (a cached "board
 * tooth" mask knocks holes out of every stroke), a few chalk colours, hand
 * lettering and doodled notes. Lines boil at 8 fps like hand-drawn animation.
 */

type P = [number, number];
type Ctx = CanvasRenderingContext2D;

const HAND = `"Segoe Print", "Comic Sans MS", cursive`;
const BOARD = "#2d4b3a";
const WHITE = "#f4f2e8";
const YELLOW = "#f7e38a";
const PINK = "#f7a6c1";
const BLUE = "#a6d8f5";
const LIME = "#c9f09a";
const ORANGE = "#f9bd85";

/** Board inner area (inside the wooden frame), and the tray. */
const IN = { x0: 10, y0: 10, x1: W - 10, y1: 342 };
const SCALE = 2;
const BOIL_FPS = 8;

// ── chalk primitives ─────────────────────────────────────────────────────────

/** Jitter for point i of stroke `seed` in boil frame k (via the shared boil()). */
const jit = (seed: number, k: number, amp: number) => boil(seed, k / BOIL_FPS, amp, BOIL_FPS);

interface ChalkOpts {
  c: string;
  w?: number;
  a?: number;
  amp?: number;
  seed: number;
  k: number;
  close?: boolean;
  fill?: string;
  fillA?: number;
  /** Chance of a small break in the stroke (default 0.05). */
  gaps?: number;
}

/** Densify + boil a polyline, then draw it as a chalk stroke (two passes, with breaks). */
function chalk(ctx: Ctx, src: P[], o: ChalkOpts) {
  const pts = o.close ? [...src, src[0]] : src;
  const amp = o.amp ?? 0.7;
  const out: P[] = [];
  let n = 0;
  for (let i = 0; i < pts.length; i++) {
    const [x, y] = pts[i];
    if (i > 0) {
      const [px, py] = pts[i - 1];
      const len = Math.hypot(x - px, y - py);
      const steps = Math.max(1, Math.ceil(len / 9));
      for (let s = 1; s < steps; s++) {
        const u = s / steps;
        n++;
        out.push([px + (x - px) * u + jit(o.seed * 31 + n, o.k, amp), py + (y - py) * u + jit(o.seed * 31 + n + 0.5, o.k, amp)]);
      }
    }
    n++;
    out.push([x + jit(o.seed * 31 + n, o.k, amp), y + jit(o.seed * 31 + n + 0.5, o.k, amp)]);
  }
  if (out.length < 2) return;
  const a = o.a ?? 0.92;
  const w = o.w ?? 1.5;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  if (o.fill) {
    ctx.globalAlpha = o.fillA ?? 0.3;
    ctx.fillStyle = o.fill;
    ctx.beginPath();
    out.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.fill();
  }
  // Main pass, with the odd break where the chalk skipped.
  const gaps = o.gaps ?? 0.05;
  ctx.globalAlpha = a;
  ctx.strokeStyle = o.c;
  ctx.lineWidth = w;
  ctx.beginPath();
  ctx.moveTo(out[0][0], out[0][1]);
  for (let i = 1; i < out.length; i++) {
    if (hash(o.seed * 3.1 + i * 1.37 + o.k * 0.71) < gaps) ctx.moveTo(out[i][0], out[i][1]);
    else ctx.lineTo(out[i][0], out[i][1]);
  }
  ctx.stroke();
  // Thin second pass, slightly offset: the doubled edge of a chalk stick.
  ctx.globalAlpha = a * 0.4;
  ctx.lineWidth = w * 0.55;
  ctx.beginPath();
  out.forEach(([x, y], i) => (i ? ctx.lineTo(x + 0.6, y - 0.45) : ctx.moveTo(x + 0.6, y - 0.45)));
  ctx.stroke();
  ctx.globalAlpha = 1;
}

function quad(a: P, c: P, b: P, n = 8): P[] {
  const out: P[] = [];
  for (let i = 0; i <= n; i++) {
    const u = i / n, v = 1 - u;
    out.push([v * v * a[0] + 2 * v * u * c[0] + u * u * b[0], v * v * a[1] + 2 * v * u * c[1] + u * u * b[1]]);
  }
  return out;
}

/** A hand-drawn loop: slightly uneven radius and an overshoot past the start. */
function loop(cx: number, cy: number, rx: number, ry: number, seed: number, n = 16, over = 0.35): P[] {
  const out: P[] = [];
  const a0 = hash(seed) * Math.PI * 2;
  for (let i = 0; i <= n; i++) {
    const a = a0 + (i / n) * (Math.PI * 2 + over);
    const r = 1 + (i / n) * 0.06;
    out.push([cx + Math.cos(a) * rx * r, cy + Math.sin(a) * ry * r]);
  }
  return out;
}

function arrow(ctx: Ctx, from: P, to: P, bend: number, c: string, seed: number, k: number, w = 1.2) {
  const mx = (from[0] + to[0]) / 2, my = (from[1] + to[1]) / 2;
  const dx = to[0] - from[0], dy = to[1] - from[1];
  const len = Math.hypot(dx, dy) || 1;
  const ctrl: P = [mx - (dy / len) * bend, my + (dx / len) * bend];
  chalk(ctx, quad(from, ctrl, to, 8), { c, w, seed, k, amp: 0.5, gaps: 0 });
  const ang = Math.atan2(to[1] - ctrl[1], to[0] - ctrl[0]);
  const h = 5;
  chalk(ctx, [[to[0] - Math.cos(ang - 0.5) * h, to[1] - Math.sin(ang - 0.5) * h], to, [to[0] - Math.cos(ang + 0.5) * h, to[1] - Math.sin(ang + 0.5) * h]], { c, w, seed: seed + 7, k, amp: 0.3, gaps: 0 });
}

function text(ctx: Ctx, s: string, x: number, y: number, size: number, c: string, k: number, seed: number, opts: { a?: number; align?: CanvasTextAlign; bold?: boolean } = {}) {
  ctx.font = `${opts.bold ? "700" : "400"} ${size}px ${HAND}`;
  ctx.textAlign = opts.align ?? "left";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = c;
  const a = opts.a ?? 0.95;
  const bx = jit(seed, k, 0.35), by = jit(seed + 0.3, k, 0.35);
  ctx.globalAlpha = a;
  ctx.fillText(s, x + bx, y + by);
  ctx.globalAlpha = a * 0.35;
  ctx.fillText(s, x + bx + 0.5, y + by - 0.4);
  ctx.globalAlpha = 1;
}

// ── cached layers (made lazily, once, at 2×) ─────────────────────────────────

function makeCanvas() {
  const c = document.createElement("canvas");
  c.width = W * SCALE;
  c.height = H * SCALE;
  const g = c.getContext("2d")!;
  g.setTransform(SCALE, 0, 0, SCALE, 0, 0);
  return { c, g };
}

/** The slate: colour variation, old eraser swipes, ghost writing, fine grain. */
function makeBoard() {
  const { c, g } = makeCanvas();
  g.fillStyle = BOARD;
  g.fillRect(0, 0, W, H);
  const lin = g.createLinearGradient(0, 0, W, H);
  lin.addColorStop(0, "rgba(255,255,255,0.03)");
  lin.addColorStop(1, "rgba(0,0,0,0.08)");
  g.fillStyle = lin;
  g.fillRect(0, 0, W, H);
  const vig = g.createRadialGradient(W / 2, H / 2, 120, W / 2, H / 2, 420);
  vig.addColorStop(0, "rgba(0,0,0,0)");
  vig.addColorStop(1, "rgba(0,0,0,0.28)");
  g.fillStyle = vig;
  g.fillRect(0, 0, W, H);
  // Eraser swipes: broad, blurred, faint arcs of leftover dust.
  const r = rng(202);
  g.filter = "blur(7px)";
  g.lineCap = "round";
  for (let i = 0; i < 9; i++) {
    const x = 40 + r() * 560, y = 30 + r() * 280, len = 70 + r() * 120;
    g.strokeStyle = `rgba(230,240,230,${0.035 + r() * 0.04})`;
    g.lineWidth = 18 + r() * 16;
    g.beginPath();
    g.moveTo(x, y);
    g.quadraticCurveTo(x + len / 2, y - 14 + r() * 28, x + len, y + (r() - 0.5) * 30);
    g.stroke();
  }
  g.filter = "blur(1.2px)";
  // Ghost writing from an earlier lesson, half rubbed out.
  g.fillStyle = "rgba(240,240,230,0.07)";
  g.font = `400 18px ${HAND}`;
  g.fillText("x² + y² = r²", 380, 128);
  g.font = `400 13px ${HAND}`;
  g.fillText("homework p.42", 170, 92);
  g.fillText("3 × 7 = 21", 520, 300);
  g.filter = "none";
  // Grain: tiny light and dark specks.
  for (let i = 0; i < 9000; i++) {
    const x = r() * W, y = r() * H;
    g.fillStyle = r() < 0.5 ? `rgba(255,255,255,${0.02 + r() * 0.05})` : `rgba(0,0,0,${0.04 + r() * 0.06})`;
    g.fillRect(x, y, 0.5 + r() * 0.6, 0.5 + r() * 0.6);
  }
  return c;
}

/** "Board tooth": specks punched out of every chalk stroke (destination-out). */
function makeTooth() {
  const c = document.createElement("canvas");
  c.width = W * SCALE;
  c.height = H * SCALE;
  const g = c.getContext("2d")!;
  const r = rng(77);
  for (let i = 0; i < 26000; i++) {
    const x = r() * c.width, y = r() * c.height, s = 0.6 + r() * 1.6;
    g.fillStyle = `rgba(0,0,0,${0.25 + r() * 0.6})`;
    g.fillRect(x, y, s, s);
  }
  // Short drag streaks, along the hand's usual direction.
  g.lineWidth = 0.8;
  for (let i = 0; i < 2500; i++) {
    const x = r() * c.width, y = r() * c.height, l = 2 + r() * 5;
    g.strokeStyle = `rgba(0,0,0,${0.2 + r() * 0.4})`;
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + l, y - l * 0.35);
    g.stroke();
  }
  return c;
}

/** Wooden frame and the chalk tray with sticks, an eraser and dust. */
function makeFrame() {
  const { c, g } = makeCanvas();
  const wood = (x: number, y: number, w: number, h: number, vertical: boolean, seed: number) => {
    const grd = vertical ? g.createLinearGradient(x, 0, x + w, 0) : g.createLinearGradient(0, y, 0, y + h);
    grd.addColorStop(0, "#9a6a3e");
    grd.addColorStop(0.5, "#7d5230");
    grd.addColorStop(1, "#5e3b20");
    g.fillStyle = grd;
    g.fillRect(x, y, w, h);
    const r = rng(seed);
    g.lineWidth = 0.5;
    for (let i = 0; i < (vertical ? 4 : 5); i++) {
      g.strokeStyle = `rgba(40,20,8,${0.25 + r() * 0.25})`;
      g.beginPath();
      if (vertical) {
        const gx = x + 1.5 + r() * (w - 3);
        g.moveTo(gx, y);
        for (let yy = y; yy <= y + h; yy += 20) g.lineTo(gx + Math.sin(yy * 0.05 + i) * 0.8, yy);
      } else {
        const gy = y + 1.5 + r() * (h - 3);
        g.moveTo(x, gy);
        for (let xx = x; xx <= x + w; xx += 20) g.lineTo(xx, gy + Math.sin(xx * 0.04 + i * 2) * 0.8);
      }
      g.stroke();
    }
  };
  wood(0, 0, W, IN.y0, false, 1);
  wood(0, 0, IN.x0, IN.y1, true, 2);
  wood(IN.x1, 0, W - IN.x1, IN.y1, true, 3);
  // Mitre lines and inner shadow.
  g.strokeStyle = "rgba(30,15,5,0.5)";
  g.lineWidth = 0.6;
  g.beginPath();
  g.moveTo(0, 0); g.lineTo(IN.x0, IN.y0);
  g.moveTo(W, 0); g.lineTo(IN.x1, IN.y0);
  g.stroke();
  g.strokeStyle = "rgba(0,0,0,0.45)";
  g.lineWidth = 1.6;
  g.strokeRect(IN.x0 + 0.8, IN.y0 + 0.8, IN.x1 - IN.x0 - 1.6, IN.y1 - IN.y0 - 1.6);
  g.strokeStyle = "rgba(255,220,170,0.25)";
  g.lineWidth = 0.6;
  g.strokeRect(0.4, 0.4, W - 0.8, H - 0.8);
  // Tray: top surface, then the front lip.
  const top = g.createLinearGradient(0, IN.y1, 0, 350);
  top.addColorStop(0, "#4a2e18");
  top.addColorStop(1, "#6e4626");
  g.fillStyle = top;
  g.fillRect(0, IN.y1, W, 8);
  wood(0, 350, W, 10, false, 4);
  g.fillStyle = "rgba(255,225,180,0.25)";
  g.fillRect(0, 350, W, 0.8);
  // Chalk dust along the tray.
  const r = rng(91);
  for (let i = 0; i < 500; i++) {
    const x = r() * W, y = IN.y1 + 1 + r() * 7;
    g.fillStyle = `rgba(240,240,230,${0.1 + r() * 0.3})`;
    g.fillRect(x, y, 0.6 + r(), 0.5 + r() * 0.5);
  }
  // Chalk sticks (with a rounded, worn end) and a felt eraser.
  const stick = (x: number, len: number, col: string, tilt: number) => {
    g.save();
    g.translate(x, 346);
    g.rotate(tilt);
    g.fillStyle = "rgba(0,0,0,0.35)";
    g.beginPath();
    g.roundRect(0.6, -1.2, len, 4, 2);
    g.fill();
    g.fillStyle = col;
    g.beginPath();
    g.roundRect(0, -2, len, 4, 2);
    g.fill();
    g.fillStyle = "rgba(255,255,255,0.45)";
    g.fillRect(1.5, -1.6, len - 3, 1);
    g.restore();
  };
  stick(46, 22, WHITE, -0.02);
  stick(78, 12, WHITE, 0.05);
  stick(118, 20, YELLOW, 0.01);
  stick(160, 18, PINK, -0.04);
  stick(198, 9, BLUE, 0.08);
  stick(578, 20, BLUE, 0.02);
  // Eraser: wooden back on grey felt.
  g.fillStyle = "rgba(0,0,0,0.35)";
  g.fillRect(452, 343.5, 52, 8);
  g.fillStyle = "#b9b4a8";
  g.fillRect(450, 345, 50, 3.5);
  g.fillStyle = "#8b5a2b";
  g.fillRect(450, 341, 50, 4.5);
  g.fillStyle = "rgba(255,255,255,0.25)";
  g.fillRect(452, 341.6, 46, 0.8);
  g.fillStyle = "rgba(240,240,230,0.4)";
  g.fillRect(450, 348, 50, 0.8);
  return c;
}

// ── scenery (three boiling drawings, cached) ─────────────────────────────────

function palm(g: Ctx, x: number, baseY: number, h: number, lean: number, seed: number, k: number, small = false) {
  const top: P = [x + lean * h, baseY - h];
  const ctrl: P = [x + lean * h * 0.15, baseY - h * 0.5];
  const w = small ? 0 : 3;
  chalk(g, quad([x - w, baseY], [ctrl[0] - w * 0.6, ctrl[1]], [top[0] - 1, top[1] + 2], 10), { c: WHITE, seed, k, w: small ? 1 : 1.4, a: small ? 0.45 : 0.9 });
  if (!small) {
    chalk(g, quad([x + w, baseY], [ctrl[0] + w * 0.6, ctrl[1]], [top[0] + 1, top[1] + 2], 10), { c: WHITE, seed: seed + 1, k, w: 1.4 });
    // Trunk rings.
    for (let i = 1; i < 9; i++) {
      const u = i / 9;
      const px = (1 - u) * (1 - u) * x + 2 * (1 - u) * u * ctrl[0] + u * u * top[0];
      const py = (1 - u) * (1 - u) * baseY + 2 * (1 - u) * u * ctrl[1] + u * u * top[1];
      const rw = w * (1 - u * 0.4);
      chalk(g, [[px - rw, py], [px + rw, py + 1.5]], { c: WHITE, seed: seed + 10 + i, k, w: 0.8, a: 0.55, amp: 0.3, gaps: 0 });
    }
  }
  const fronds = small ? 5 : 7;
  for (let i = 0; i < fronds; i++) {
    const a = Math.PI + (i / (fronds - 1)) * Math.PI + (hash(seed + i) - 0.5) * 0.3;
    const len = h * (small ? 0.42 : 0.36) * (0.85 + hash(seed * 2 + i) * 0.3);
    const ex = top[0] + Math.cos(a) * len;
    const ey = top[1] + Math.sin(a) * len * 0.45 + len * 0.45;
    const mid: P = [(top[0] + ex) / 2, Math.min(top[1], ey) - len * 0.18];
    const pts = quad(top, mid, [ex, ey], 6);
    chalk(g, pts, { c: WHITE, seed: seed + 30 + i, k, w: small ? 0.9 : 1.3, a: small ? 0.45 : 0.85 });
    if (!small) {
      // Leaflet ticks hanging off each frond.
      for (let j = 2; j < pts.length; j++) {
        const [fx, fy] = pts[j];
        chalk(g, [[fx, fy], [fx + (ex > top[0] ? 2 : -2), fy + 6]], { c: LIME, seed: seed + 60 + i * 10 + j, k, w: 0.8, a: 0.55, amp: 0.3, gaps: 0 });
      }
    }
  }
  if (!small) {
    for (let i = 0; i < 3; i++) chalk(g, loop(top[0] - 4 + i * 4, top[1] + 4 + (i % 2) * 2, 2.4, 2.4, seed + 90 + i, 8, 0.2), { c: YELLOW, seed: seed + 90 + i, k, w: 1, fill: YELLOW, fillA: 0.35, amp: 0.2 });
  }
}

function makeScenery(k: number) {
  const { c, g } = makeCanvas();
  // Title, subtitle, lesson annotation.
  text(g, "Gramam 101", 28, 46, 24, WHITE, k, 1, { bold: true });
  chalk(g, [[26, 54], [80, 56], [140, 53], [176, 56]], { c: YELLOW, seed: 2, k, w: 1.8, amp: 0.8 });
  text(g, "lesson 1: agents in the village", 30, 72, 9.5, WHITE, k, 3, { a: 0.6 });
  text(g, "Approve > Wait ☺", 452, 42, 15, PINK, k, 4);
  chalk(g, [[452, 50], [520, 52], [598, 49]], { c: PINK, seed: 5, k, w: 1.1, a: 0.7 });
  text(g, "12 Nov", 560, 24, 8.5, WHITE, k, 6, { a: 0.5 });
  // Sun with rays.
  chalk(g, loop(300, 56, 13, 13, 7, 18), { c: YELLOW, seed: 7, k, w: 1.6, fill: YELLOW, fillA: 0.18 });
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2 + 0.2;
    chalk(g, [[300 + Math.cos(a) * 18, 56 + Math.sin(a) * 18], [300 + Math.cos(a) * 25, 56 + Math.sin(a) * 25]], { c: YELLOW, seed: 8 + i, k, w: 1.2, amp: 0.4, gaps: 0 });
  }
  // Progress box frame (fill is drawn live).
  text(g, "Kuttan's task", 430, 76, 9, BLUE, k, 9, { a: 0.85 });
  chalk(g, [[430, 82], [550, 82], [550, 94], [430, 94]], { c: WHITE, seed: 10, k, w: 1.1, close: true, a: 0.8 });

  // Horizon and far bank.
  chalk(g, [[IN.x0 + 2, LAYOUT.horizonY], [IN.x1 - 2, LAYOUT.horizonY]], { c: WHITE, seed: 11, k, w: 1, a: 0.55, amp: 0.9 });
  for (const x of LAYOUT.farPalms) palm(g, x, LAYOUT.horizonY, 30, 0.08, 200 + x, k, true);
  chalk(g, [[IN.x0 + 2, LAYOUT.groundY], [IN.x1 - 2, LAYOUT.groundY]], { c: WHITE, seed: 12, k, w: 1.3, a: 0.8, amp: 0.9 });
  // Grass ticks and the path.
  const r = rng(33);
  for (let i = 0; i < 26; i++) {
    const x = 20 + r() * 600, y = 204 + r() * 120;
    if (x > 60 && x < 250 && y < 275) continue;
    chalk(g, [[x, y], [x + 1.5, y - 4], [x + 3, y]], { c: LIME, seed: 40 + i, k, w: 0.8, a: 0.45, amp: 0.3, gaps: 0 });
  }
  for (let x = 24; x < 616; x += 26) chalk(g, [[x, 337], [x + 14, 336.5]], { c: WHITE, seed: 70 + x, k, w: 1, a: 0.4, amp: 0.4, gaps: 0 });

  // Tea shop.
  const sh = LAYOUT.shop;
  const base = sh.y + sh.h;
  chalk(g, [[sh.x, base], [sh.x, sh.y], [sh.x + sh.w, sh.y], [sh.x + sh.w, base]], { c: WHITE, seed: 100, k, w: 1.6 });
  const eL: P = [sh.x - 16, sh.y + 4], eR: P = [sh.x + sh.w + 16, sh.y + 4];
  const rL: P = [sh.x + 26, sh.y - sh.roofH], rR: P = [sh.x + sh.w - 26, sh.y - sh.roofH];
  chalk(g, [eL, rL, rR, eR], { c: ORANGE, seed: 101, k, w: 1.6, close: true, fill: ORANGE, fillA: 0.12 });
  // Roof tiles: rows and hatching.
  for (let i = 1; i < 4; i++) {
    const u = i / 4;
    chalk(g, [[eL[0] + (rL[0] - eL[0]) * u, eL[1] + (rL[1] - eL[1]) * u], [eR[0] + (rR[0] - eR[0]) * u, eR[1] + (rR[1] - eR[1]) * u]], { c: ORANGE, seed: 102 + i, k, w: 0.9, a: 0.6 });
  }
  for (let i = 1; i < 16; i++) {
    const u = i / 16;
    const bx = eL[0] + (eR[0] - eL[0]) * u, tx = rL[0] + (rR[0] - rL[0]) * u;
    chalk(g, [[bx, eL[1] - 1], [tx + 3, rL[1] + 2]], { c: ORANGE, seed: 110 + i, k, w: 0.6, a: 0.35, amp: 0.4, gaps: 0.1 });
  }
  // Door, signboard, counter with glasses, a price note.
  chalk(g, [[sh.doorX - 13, base], [sh.doorX - 13, sh.y + 24], [sh.doorX + 13, sh.y + 24], [sh.doorX + 13, base]], { c: WHITE, seed: 130, k, w: 1.3, fill: "#000", fillA: 0.12 });
  chalk(g, [[sh.x + 4, sh.y - 26], [sh.x + 66, sh.y - 26], [sh.x + 66, sh.y - 11], [sh.x + 4, sh.y - 11]], { c: YELLOW, seed: 131, k, w: 1.1, close: true, fill: BOARD, fillA: 0.95 });
  text(g, "CHAYA KADA", sh.x + 35, sh.y - 15, 8.5, YELLOW, k, 132, { align: "center", bold: true });
  chalk(g, [[sh.x + 6, sh.y + 48], [sh.x + 72, sh.y + 48]], { c: WHITE, seed: 133, k, w: 1.4 });
  for (let i = 0; i < 3; i++) {
    const gx = sh.x + 20 + i * 15;
    chalk(g, [[gx - 3, sh.y + 39], [gx - 2, sh.y + 47], [gx + 2, sh.y + 47], [gx + 3, sh.y + 39]], { c: WHITE, seed: 134 + i, k, w: 1, fill: ORANGE, fillA: 0.25, amp: 0.3, gaps: 0 });
  }
  text(g, "chaya 10/-", sh.x + 40, sh.y + 64, 8, WHITE, k, 140, { a: 0.65, align: "center" });

  // Palms.
  LAYOUT.palms.forEach((p, i) => palm(g, p.x, p.baseY, p.h, p.lean, 300 + i * 100, k));

  // Sign.
  const sg = LAYOUT.sign;
  chalk(g, [[sg.x, sg.y + 42], [sg.x, sg.y + 2]], { c: WHITE, seed: 150, k, w: 1.5 });
  chalk(g, [[sg.x - 33, sg.y - 14], [sg.x + 33, sg.y - 14], [sg.x + 33, sg.y + 3], [sg.x - 33, sg.y + 3]], { c: WHITE, seed: 151, k, w: 1.3, close: true, fill: "#000", fillA: 0.08 });
  text(g, sg.text, sg.x, sg.y - 2, 9.5, WHITE, k, 152, { align: "center", bold: true });

  // Lamp posts (nilavilakku): base, stem, bowl. Flames are drawn live.
  const L = LAYOUT.lamps;
  for (let i = 0; i < L.count; i++) {
    const x = L.x0 + i * L.dx;
    chalk(g, [[x - 7, L.y + 24], [x + 7, L.y + 24], [x + 3, L.y + 20], [x - 3, L.y + 20]], { c: YELLOW, seed: 160 + i, k, w: 1, close: true, fill: YELLOW, fillA: 0.2, amp: 0.3 });
    chalk(g, [[x, L.y + 20], [x, L.y + 2]], { c: YELLOW, seed: 170 + i, k, w: 1.2, amp: 0.3 });
    chalk(g, quad([x - 6, L.y], [x, L.y + 6], [x + 6, L.y], 4), { c: YELLOW, seed: 180 + i, k, w: 1.1, amp: 0.3, gaps: 0 });
  }
  return c;
}

// ── live layer pieces ────────────────────────────────────────────────────────

const SHIRT_CHALK: Record<string, string> = { a: WHITE, b: PINK, c: BLUE };
const MUNDU_CHALK: Record<string, string> = { a: WHITE, b: YELLOW, c: WHITE };

function villager(ctx: Ctx, v: VillagerFrame, k: number, i: number) {
  const s = skeleton(v);
  const sd = 500 + i * 100;
  const shirt = SHIRT_CHALK[v.id] ?? WHITE;
  const mundu = MUNDU_CHALK[v.id] ?? WHITE;
  const f = v.facing;
  // Shadow scuff on the ground (smaller in the air).
  const sw = 10 - v.jump * 5;
  chalk(ctx, [[v.x - sw, v.y + 2], [v.x + sw, v.y + 2]], { c: WHITE, seed: sd, k, w: 1, a: 0.3, amp: 0.3, gaps: 0 });
  // Legs below the mundu.
  chalk(ctx, [[s.kneeB.x, s.kneeB.y], [s.footB.x, s.footB.y], [s.footB.x + f * 3, s.footB.y]], { c: WHITE, seed: sd + 1, k, w: 1.4, amp: 0.35, gaps: 0 });
  chalk(ctx, [[s.kneeF.x, s.kneeF.y], [s.footF.x, s.footF.y], [s.footF.x + f * 3, s.footF.y]], { c: WHITE, seed: sd + 2, k, w: 1.4, amp: 0.35, gaps: 0 });
  // Mundu: rubbed-in chalk with an outline, to just below the knees.
  const kl = Math.min(s.kneeF.x, s.kneeB.x) - 3, kr = Math.max(s.kneeF.x, s.kneeB.x) + 3;
  const ky = Math.max(s.kneeF.y, s.kneeB.y) + 4;
  chalk(ctx, [[s.hip.x - 5.5, s.hip.y - 2], [s.hip.x + 5.5, s.hip.y - 2], [kr, ky], [kl, ky]], { c: mundu, seed: sd + 3, k, w: 1.1, close: true, fill: mundu, fillA: 0.3, amp: 0.4 });
  // Shirt.
  chalk(ctx, [[s.neck.x - 5.5, s.neck.y + 1.5], [s.neck.x + 5.5, s.neck.y + 1.5], [s.hip.x + 5, s.hip.y - 1], [s.hip.x - 5, s.hip.y - 1]], { c: shirt, seed: sd + 4, k, w: 1.3, close: true, fill: shirt, fillA: 0.4, amp: 0.4 });
  // Arms.
  chalk(ctx, [[s.shoulder.x, s.shoulder.y], [s.elbowB.x, s.elbowB.y], [s.handB.x, s.handB.y]], { c: WHITE, seed: sd + 5, k, w: 1.3, amp: 0.35, gaps: 0 });
  chalk(ctx, [[s.shoulder.x, s.shoulder.y], [s.elbowF.x, s.elbowF.y], [s.handF.x, s.handF.y]], { c: WHITE, seed: sd + 6, k, w: 1.3, amp: 0.35, gaps: 0 });
  // Head, hair and a face.
  const hr = BODY.head * 0.72;
  chalk(ctx, loop(s.head.x, s.head.y, hr, hr * 1.05, sd + 7, 14), { c: WHITE, seed: sd + 7, k, w: 1.4, amp: 0.3, gaps: 0 });
  chalk(ctx, quad([s.head.x - hr, s.head.y - 2], [s.head.x - f * 2, s.head.y - hr - 4], [s.head.x + hr, s.head.y - 2], 6), { c: WHITE, seed: sd + 8, k, w: 2, a: 0.7, amp: 0.4 });
  if (v.id === "b") chalk(ctx, loop(s.head.x - f * (hr + 2), s.head.y - 1, 2.8, 2.8, sd + 9, 8), { c: WHITE, seed: sd + 9, k, w: 1.2, fill: WHITE, fillA: 0.5, amp: 0.2 });
  ctx.fillStyle = WHITE;
  ctx.globalAlpha = 0.9;
  ctx.fillRect(s.head.x + f * 2.6 - 0.7, s.head.y - 1, 1.4, 1.6);
  ctx.globalAlpha = 1;
  const smile = v.status === "finished" ? 2.2 : v.status === "waiting" ? -0.6 : 0.8;
  chalk(ctx, quad([s.head.x + f * 0.6, s.head.y + 3], [s.head.x + f * 2.2, s.head.y + 3 + smile], [s.head.x + f * 4, s.head.y + 2.6], 3), { c: WHITE, seed: sd + 10, k, w: 0.8, amp: 0.15, gaps: 0 });

  if (v.carry === "laptop") {
    // Open laptop: base in the hand, screen tilted up with lines of code.
    const hx = s.handF.x, hy = s.handF.y;
    chalk(ctx, [[hx - f * 12, hy], [hx + f * 4, hy]], { c: WHITE, seed: sd + 11, k, w: 1.6, amp: 0.25, gaps: 0 });
    const sc: P[] = [[hx - f * 12, hy], [hx - f * 15, hy - 11], [hx + f * 1, hy - 11], [hx + f * 4, hy]];
    chalk(ctx, sc, { c: BLUE, seed: sd + 12, k, w: 1.2, fill: BLUE, fillA: 0.25, amp: 0.25, gaps: 0 });
    for (let j = 0; j < 3; j++) {
      const ly = hy - 8 + j * 2.6;
      const l0 = hx - f * (12 - j), l1 = hx - f * (12 - j - 4 - hash(j + k) * 6);
      chalk(ctx, [[l0, ly], [l1, ly]], { c: WHITE, seed: sd + 13 + j, k, w: 0.7, a: 0.7, amp: 0.1, gaps: 0 });
    }
  } else if (v.carry === "glass") {
    const hx = s.handF.x, hy = s.handF.y;
    chalk(ctx, [[hx - 3, hy - 9], [hx - 2.2, hy + 1], [hx + 2.2, hy + 1], [hx + 3, hy - 9]], { c: WHITE, seed: sd + 14, k, w: 1.1, amp: 0.2, gaps: 0 });
    chalk(ctx, [[hx - 2.4, hy - 5], [hx - 2.1, hy + 0.5], [hx + 2.1, hy + 0.5], [hx + 2.4, hy - 5]], { c: ORANGE, seed: sd + 15, k, w: 0.8, close: true, fill: ORANGE, fillA: 0.55, amp: 0.15, gaps: 0 });
    for (let j = 0; j < 2; j++) {
      const pts: P[] = [];
      for (let q = 0; q < 4; q++) pts.push([hx - 1 + j * 2.5 + Math.sin(q * 1.6 + j) * 1.5, hy - 11 - q * 3.4]);
      chalk(ctx, pts, { c: WHITE, seed: sd + 16 + j, k, w: 0.8, a: 0.5, amp: 0.8, gaps: 0 });
    }
  }
}

function label(ctx: Ctx, v: VillagerFrame, f: SceneFrame, k: number, i: number) {
  const { x, y } = labelAnchor(v);
  const sd = 900 + i * 50;
  const urgent = v.status === "waiting";
  const col = urgent ? PINK : v.status === "finished" ? LIME : BLUE;
  ctx.font = `400 10px ${HAND}`;
  const tw = Math.max(ctx.measureText(v.label).width, 40);
  // Erased patch behind the words, so they read over the drawing.
  ctx.fillStyle = BOARD;
  ctx.globalAlpha = 0.88;
  ctx.beginPath();
  ctx.roundRect(x - tw / 2 - 6, y - 26, tw + 12, 32, 6);
  ctx.fill();
  ctx.globalAlpha = 1;
  text(ctx, v.name, x, y - 13, 10.5, WHITE, k, sd, { align: "center", bold: true });
  if (urgent) {
    const a = 0.55 + 0.45 * f.pulse;
    text(ctx, v.label, x, y, 10, PINK, k, sd + 1, { align: "center", a });
    // A scribbled ring around it that throbs, plus "!!" at the side.
    const grow = 1 + f.pulse * 0.06;
    ctx.globalAlpha = 1;
    chalk(ctx, loop(x, y - 9, (tw / 2 + 10) * grow, 18 * grow, sd + 2, 22, 0.5), { c: PINK, seed: sd + 2, k, w: 1.2 + f.pulse * 0.9, a: 0.45 + 0.5 * f.pulse, amp: 0.8 });
    text(ctx, "!!", x + tw / 2 + 14, y - 6, 15, PINK, k, sd + 3, { bold: true, a });
  } else {
    text(ctx, v.label, x, y, 10, col, k, sd + 1, { align: "center" });
    chalk(ctx, [[x - tw / 2, y + 3.5], [x + tw / 2, y + 3.5]], { c: col, seed: sd + 4, k, w: 0.9, a: 0.55, amp: 0.4 });
  }
  if (v.status === "working") {
    // A tiny progress bar under the working label.
    const bx = x - 20, by = y + 7;
    chalk(ctx, [[bx, by], [bx + 40, by], [bx + 40, by + 3.5], [bx, by + 3.5]], { c: WHITE, seed: sd + 5, k, w: 0.7, close: true, a: 0.6, amp: 0.2, gaps: 0 });
    ctx.fillStyle = BLUE;
    ctx.globalAlpha = 0.8;
    ctx.fillRect(bx + 0.6, by + 0.6, 38.8 * f.progress, 2.3);
    ctx.globalAlpha = 1;
  }
}

function lampFlames(ctx: Ctx, f: SceneFrame, k: number) {
  const L = LAYOUT.lamps;
  for (let i = 0; i < L.count; i++) {
    const lit = Math.max(0, Math.min(1, f.lampsLit - i));
    if (lit <= 0) continue;
    const x = L.x0 + i * L.dx;
    const h = (6 + 3 * lit) * (1 + jit(700 + i, k, 0.12));
    chalk(ctx, [[x - 2.4, L.y - 1], [x - 1.2, L.y - h * 0.6], [x, L.y - h], [x + 1.4, L.y - h * 0.55], [x + 2.4, L.y - 1]], { c: YELLOW, seed: 710 + i, k, w: 1, close: true, fill: YELLOW, fillA: 0.6 * lit, a: lit, amp: 0.25, gaps: 0 });
    if (lit > 0.6) {
      for (let j = 0; j < 3; j++) {
        const a = -Math.PI / 2 + (j - 1) * 0.75;
        chalk(ctx, [[x + Math.cos(a) * (h + 2), L.y - 3 + Math.sin(a) * (h + 2)], [x + Math.cos(a) * (h + 6), L.y - 3 + Math.sin(a) * (h + 6)]], { c: YELLOW, seed: 720 + i * 3 + j, k, w: 0.9, a: 0.7 * lit, amp: 0.5, gaps: 0 });
      }
    }
  }
  text(ctx, `lamps lit: ${Math.floor(f.lampsLit)}/${L.count}`, L.x0 + 2 * L.dx, L.y + 36, 8, YELLOW, k, 730, { align: "center", a: 0.7 });
}

function water(ctx: Ctx, f: SceneFrame, k: number) {
  for (let row = 0; row < 4; row++) {
    const y = LAYOUT.waterTop + 9 + row * 9.5;
    const gap = 54 + row * 10;
    const off = (f.t * (6 + row * 3)) % gap;
    for (let x = IN.x0 - gap + off + row * 17; x < IN.x1; x += gap) {
      const x0 = Math.max(IN.x0 + 2, x), x1 = Math.min(IN.x1 - 2, x + 22);
      if (x1 - x0 < 6) continue;
      chalk(ctx, quad([x0, y], [(x0 + x1) / 2, y - 2.5], [x1, y], 4), { c: BLUE, seed: 800 + row * 40 + Math.round((x - off) / gap), k, w: 1, a: 0.55, amp: 0.4, gaps: 0 });
    }
  }
}

function canoe(ctx: Ctx, f: SceneFrame, k: number) {
  const cx = f.canoeX, cy = 180;
  if (cx < -40 || cx > W + 40) return;
  chalk(ctx, [[cx - 26, cy - 5], [cx - 18, cy + 3], [cx + 18, cy + 3], [cx + 26, cy - 5], [cx, cy - 1]], { c: ORANGE, seed: 850, k, w: 1.4, close: true, fill: ORANGE, fillA: 0.3, amp: 0.4 });
  // Rower with a paddle that dips.
  const dip = Math.sin(f.t * 2.4);
  chalk(ctx, [[cx - 2, cy - 2], [cx - 2, cy - 13]], { c: WHITE, seed: 851, k, w: 1.3, amp: 0.3, gaps: 0 });
  chalk(ctx, loop(cx - 2, cy - 16.5, 3.2, 3.4, 852, 10), { c: WHITE, seed: 852, k, w: 1.2, amp: 0.2, gaps: 0 });
  chalk(ctx, [[cx + 10 + dip * 3, cy - 18], [cx + 2 - dip * 3, cy + 8]], { c: YELLOW, seed: 853, k, w: 1.1, amp: 0.3, gaps: 0 });
  chalk(ctx, [[cx - 2, cy - 9], [cx + 6 + dip * 2, cy - 11]], { c: WHITE, seed: 854, k, w: 1.1, amp: 0.2, gaps: 0 });
  // Wake.
  chalk(ctx, [[cx - 30, cy + 5], [cx - 44, cy + 6]], { c: BLUE, seed: 855, k, w: 0.9, a: 0.6, amp: 0.4, gaps: 0 });
}

function clouds(ctx: Ctx, f: SceneFrame, k: number) {
  const span = IN.x1 - IN.x0 + 120;
  [[90, 100, 1], [380, 92, 0.7], [560, 118, 1.1]].forEach(([x0, y, sz], i) => {
    const x = IN.x0 - 60 + ((((x0 + f.drift * (0.5 + i * 0.2)) % span) + span) % span);
    const pts: P[] = [];
    const bumps = 4;
    for (let b = 0; b < bumps; b++) {
      const bx = x - 22 * sz + (b + 0.5) * (44 * sz / bumps);
      const r = (7 + (b % 2) * 3) * sz;
      for (let q = 0; q <= 5; q++) {
        const a = Math.PI + (q / 5) * Math.PI;
        pts.push([bx + Math.cos(a) * r * 0.75, y + Math.sin(a) * r]);
      }
    }
    pts.push([x + 22 * sz, y + 2]);
    pts.push([x - 22 * sz, y + 2]);
    chalk(ctx, pts, { c: WHITE, seed: 870 + i, k, w: 1.1, a: 0.6, amp: 0.4, close: true });
  });
}

function steam(ctx: Ctx, k: number) {
  const sh = LAYOUT.shop;
  for (let i = 0; i < 3; i++) {
    const gx = sh.x + 20 + i * 15;
    const pts: P[] = [];
    for (let q = 0; q < 4; q++) pts.push([gx + Math.sin(q * 1.7 + i) * 1.6, sh.y + 37 - q * 3.6]);
    chalk(ctx, pts, { c: WHITE, seed: 880 + i, k, w: 0.8, a: 0.5, amp: 0.9, gaps: 0 });
  }
}

/** Teacher's notes: arrows to the laptop and the chaya, a velocity formula, a "hop!" mark. */
function notes(ctx: Ctx, f: SceneFrame, k: number) {
  const [kuttan, ammini, raghu] = f.villagers;
  const sk = skeleton(kuttan);
  const fc = kuttan.facing;
  // "laptop" note, ahead of him and below the hand.
  const lx = sk.handF.x + fc * 34, ly = sk.handF.y + 26;
  text(ctx, "laptop", lx, ly, 9, BLUE, k, 900, { align: "center" });
  arrow(ctx, [lx - fc * 12, ly - 9], [sk.handF.x + fc * 2, sk.handF.y + 3], fc * 8, BLUE, 901, k);
  // Velocity formula behind him, with a direction arrow.
  const vx = kuttan.x - fc * 52, vy = kuttan.y + 3;
  const vText = kuttan.moving ? "v = 4.2 m/s" : "v = 0 (thinking)";
  text(ctx, vText, vx, vy, 9, YELLOW, k, 902, { align: "center" });
  if (kuttan.moving) arrow(ctx, [vx - fc * 22, vy - 11], [vx + fc * 22, vy - 11], -fc * 2, YELLOW, 903, k, 1);
  // "chaya" note, below-left of Ammini, pointing at her glass.
  const sa = skeleton(ammini);
  text(ctx, "chaya", 150, 318, 9.5, ORANGE, k, 904, { align: "center" });
  arrow(ctx, [160, 306], [sa.handF.x - 1, sa.handF.y + 3], -14, ORANGE, 905, k);
  // Raghu's hop: motion arcs and a "hop!" while in the air.
  if (raghu.jump > 0.08) {
    const up = raghu.jump * 26;
    for (let j = 0; j < 3; j++) {
      const xx = raghu.x - 8 + j * 8;
      chalk(ctx, [[xx, raghu.y - up + 6], [xx, raghu.y - up + 6 + Math.min(14, up * 0.6)]], { c: LIME, seed: 910 + j, k, w: 0.9, a: 0.7, amp: 0.3, gaps: 0 });
    }
    text(ctx, "hop!", raghu.x - 34, raghu.y - 20, 9, LIME, k, 913, { align: "center", a: 0.85 });
  }
}

function progressFill(ctx: Ctx, f: SceneFrame, k: number) {
  const x0 = 432, x1 = 548, w = (x1 - x0) * f.progress;
  // Hatched chalk fill, like shading with the side of the stick.
  for (let x = x0; x < x0 + w; x += 3.2) {
    chalk(ctx, [[x, 92.5], [Math.min(x + 5, x0 + w), 83.5]], { c: BLUE, seed: 960 + Math.round(x), k, w: 1, a: 0.75, amp: 0.25, gaps: 0 });
  }
  text(ctx, `${Math.round(f.progress * 100)}%`, 550, 106, 9, WHITE, k, 961, { align: "right", a: 0.8 });
  text(ctx, "Editing auth.ts", 432, 106, 8, BLUE, k, 962, { a: 0.7 });
}

// ── assembly ─────────────────────────────────────────────────────────────────

let board: HTMLCanvasElement | null = null;
let tooth: HTMLCanvasElement | null = null;
let frame: HTMLCanvasElement | null = null;
const scenery: HTMLCanvasElement[] = [];
let live: { c: HTMLCanvasElement; g: Ctx } | null = null;

/** Knock the board's tooth out of a chalk layer. */
function applyTooth(g: Ctx) {
  g.save();
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.globalCompositeOperation = "destination-out";
  g.drawImage(tooth!, 0, 0);
  g.restore();
}

export const chalkboard: StyleProto = {
  id: "chalkboard",
  n: 2,
  name: "Chalkboard",
  blurb: "The village as a chalk lesson on a green slate: rough, broken chalk lines that boil, coloured chalk, hand-lettered labels and doodled teacher's notes.",
  fps: 12,
  bg: BOARD,
  draw(ctx, f) {
    if (!board) {
      board = makeBoard();
      tooth = makeTooth();
      frame = makeFrame();
      live = makeCanvas();
    }
    const k = Math.floor(f.t * BOIL_FPS);
    const v = ((k % 3) + 3) % 3;
    if (!scenery[v]) {
      const s = makeScenery(v);
      applyTooth(s.getContext("2d")!);
      scenery[v] = s;
    }

    ctx.drawImage(board, 0, 0, W, H);
    ctx.drawImage(scenery[v], 0, 0, W, H);

    const g = live!.g;
    g.save();
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, live!.c.width, live!.c.height);
    g.restore();
    clouds(g, f, k);
    water(g, f, k);
    canoe(g, f, k);
    steam(g, k);
    progressFill(g, f, k);
    f.villagers.forEach((vf, i) => villager(g, vf, k, i));
    notes(g, f, k);
    f.villagers.forEach((vf, i) => label(g, vf, f, k, i));
    lampFlames(g, f, k);
    applyTooth(g);
    ctx.drawImage(live!.c, 0, 0, W, H);

    ctx.drawImage(frame!, 0, 0, W, H);
  },
};
