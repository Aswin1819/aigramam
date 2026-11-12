import { H, LAYOUT, STATUS_COLOR, W, hash, labelAnchor, skeleton, type SceneFrame, type VillagerFrame } from "../scene";
import type { StyleProto } from "../types";

/**
 * 5 · Comic Art: a comic book page. The village fills the main panel; below,
 * a close-up of Ammini asking for approval and a close-up of Kuttan's laptop.
 * Halftone skies, thick black ink, flat bright fills, captions, speech
 * bubbles and sound effects. Animated on twos (12 fps).
 */

const INK = "#111";
const PAPER = "#fffdf3";
const FONT = "'Comic Sans MS', 'Segoe UI Black', 'Arial Black', sans-serif";

/** Main panel and how the scene maps into it (a slight crop of the sky). */
const P1 = { x: 6, y: 6, w: 628, h: 242 };
const S = P1.w / W;
const Y0 = 97;
/** Bottom row: Ammini close-up (left), laptop close-up (right). */
const P2 = { x: 6, y: 256, w: 410, h: 98 };
const P3 = { x: 424, y: 256, w: 210, h: 98 };

function makeLayer(paint: (c: CanvasRenderingContext2D) => void): HTMLCanvasElement {
  const cv = document.createElement("canvas");
  cv.width = W * 2;
  cv.height = H * 2;
  const c = cv.getContext("2d")!;
  c.scale(2, 2);
  paint(c);
  return cv;
}
let pageLayer: HTMLCanvasElement | null = null;
/** Near palms on their own transparent layer, so the canoe passes behind them. */
let palmLayer: HTMLCanvasElement | null = null;

function paintPalms(c: CanvasRenderingContext2D) {
  c.beginPath();
  c.rect(P1.x, P1.y, P1.w, P1.h);
  c.clip();
  toScene(c);
  for (const p of LAYOUT.palms) palm(c, p.x, p.baseY, p.h, p.lean);
}

function toScene(c: CanvasRenderingContext2D) {
  c.translate(P1.x, P1.y);
  c.scale(S, S);
  c.translate(0, -Y0);
}

/** Fill the current path, then ink it. */
function ink(c: CanvasRenderingContext2D, fill: string, lw = 1.8) {
  c.fillStyle = fill;
  c.fill();
  c.strokeStyle = INK;
  c.lineWidth = lw;
  c.lineJoin = "round";
  c.lineCap = "round";
  c.stroke();
}

/** Halftone dots on an offset grid; radius from a function of position. */
function halftone(c: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, step: number, color: string, rad: (x: number, y: number) => number) {
  c.fillStyle = color;
  let row = 0;
  for (let y = y0; y <= y1; y += step * 0.866, row++) {
    c.beginPath();
    for (let x = x0 + (row % 2) * step * 0.5; x <= x1; x += step) {
      const r = rad(x, y);
      if (r <= 0.05) continue;
      c.moveTo(x + r, y);
      c.arc(x, y, r, 0, Math.PI * 2);
    }
    c.fill();
  }
}

function frond(c: CanvasRenderingContext2D, x: number, y: number, ang: number, len: number, wid: number) {
  const ex = x + Math.cos(ang) * len, ey = y + Math.sin(ang) * len;
  const nx = -Math.sin(ang) * wid, ny = Math.cos(ang) * wid;
  const mx = (x + ex) / 2, my = (y + ey) / 2 - len * 0.15;
  c.beginPath();
  c.moveTo(x, y);
  c.quadraticCurveTo(mx + nx, my + ny, ex, ey);
  c.quadraticCurveTo(mx - nx, my - ny, x, y);
  c.closePath();
}

function palm(c: CanvasRenderingContext2D, x: number, baseY: number, h: number, lean: number) {
  const topX = x + lean * h, topY = baseY - h;
  const cx = x + lean * h * 0.2;
  c.beginPath();
  c.moveTo(x - 5, baseY);
  c.quadraticCurveTo(cx - 3.5, baseY - h * 0.5, topX - 2.5, topY);
  c.lineTo(topX + 2.5, topY);
  c.quadraticCurveTo(cx + 3.5, baseY - h * 0.5, x + 5, baseY);
  c.closePath();
  ink(c, "#c0702c", 2);
  c.strokeStyle = INK;
  c.lineWidth = 1;
  for (let k = 1; k < 9; k++) {
    const u = k / 9;
    const px = (1 - u) * (1 - u) * x + 2 * u * (1 - u) * cx + u * u * topX;
    const w = 4.5 * (1 - u * 0.45);
    c.beginPath();
    c.moveTo(px - w, baseY - h * u + 1.5);
    c.lineTo(px + w, baseY - h * u - 0.5);
    c.stroke();
  }
  for (let i = 0; i < 8; i++) {
    const a = -Math.PI + (i / 7) * Math.PI;
    const droop = Math.abs(Math.cos(a)) * 0.6 * Math.sign(Math.cos(a));
    frond(c, topX, topY, a + droop, h * (i % 2 ? 0.33 : 0.4), 8);
    ink(c, i % 2 ? "#1f9a46" : "#35c25a", 1.8);
  }
  c.beginPath();
  c.arc(topX, topY + 3, 3.4, 0, Math.PI * 2);
  ink(c, "#8a4b1f", 1.4);
}

function paintPage(c: CanvasRenderingContext2D) {
  c.fillStyle = PAPER;
  c.fillRect(0, 0, W, H);

  // ── main panel, in scene units ──
  c.save();
  c.beginPath();
  c.rect(P1.x, P1.y, P1.w, P1.h);
  c.clip();
  toScene(c);
  // Sky: light blue with blue halftone dots growing toward the horizon.
  c.fillStyle = "#a8dcff";
  c.fillRect(0, Y0 - 10, W, LAYOUT.horizonY - Y0 + 10);
  halftone(c, 0, Y0 - 4, W, LAYOUT.horizonY, 5.2, "#5aa9ea", (_x, y) => 0.4 + 1.5 * ((y - Y0) / (LAYOUT.horizonY - Y0)));
  // Far bank with palm silhouettes.
  c.beginPath();
  c.moveTo(0, LAYOUT.horizonY + 1);
  for (let x = 0; x <= W; x += 16) c.lineTo(x, LAYOUT.horizonY - 6 - 4 * Math.sin(x * 0.03));
  c.lineTo(W, LAYOUT.horizonY + 1);
  c.closePath();
  ink(c, "#2c8a4e", 1.6);
  for (const x of LAYOUT.farPalms) {
    c.beginPath();
    c.moveTo(x - 1.5, LAYOUT.horizonY - 6);
    c.lineTo(x + 1, LAYOUT.horizonY - 34);
    c.lineTo(x + 3, LAYOUT.horizonY - 34);
    c.lineTo(x + 1.5, LAYOUT.horizonY - 6);
    c.closePath();
    ink(c, "#7a4a22", 1.2);
    for (let i = 0; i < 6; i++) {
      frond(c, x + 2, LAYOUT.horizonY - 34, -Math.PI + (i / 5) * Math.PI + (i < 3 ? 0.3 : -0.3) * 1.4, 13, 3.5);
      ink(c, "#2c8a4e", 1.1);
    }
  }
  // Backwater: flat blue, darker dots, ink wave ticks.
  c.fillStyle = "#2f86e6";
  c.fillRect(0, LAYOUT.waterTop, W, LAYOUT.waterBottom - LAYOUT.waterTop);
  halftone(c, 0, LAYOUT.waterTop + 2, W, LAYOUT.waterBottom, 4.6, "#1f64c0", (x, y) => 0.5 + 0.9 * ((y - LAYOUT.waterTop) / 46) + 0.2 * Math.sin(x * 0.05));
  c.strokeStyle = INK;
  c.lineWidth = 1.6;
  c.beginPath();
  c.moveTo(0, LAYOUT.waterTop);
  c.lineTo(W, LAYOUT.waterTop);
  c.stroke();
  c.strokeStyle = "#fff";
  c.lineWidth = 1.4;
  for (let i = 0; i < 16; i++) {
    const x = hash(i * 3.3) * W, y = LAYOUT.waterTop + 8 + hash(i * 7.1) * 32;
    c.beginPath();
    c.moveTo(x, y);
    c.quadraticCurveTo(x + 5, y - 3, x + 10, y);
    c.quadraticCurveTo(x + 15, y - 3, x + 20, y);
    c.stroke();
  }
  // Ground: grass, then a laterite path with orange dots.
  c.fillStyle = "#7fd14f";
  c.fillRect(0, LAYOUT.groundY, W, H - LAYOUT.groundY);
  halftone(c, 0, LAYOUT.groundY + 2, W, 300, 5, "#5fb33a", (_x, y) => 1.4 - (y - LAYOUT.groundY) / 90);
  c.beginPath();
  c.moveTo(-10, 302);
  c.bezierCurveTo(200, 296, 420, 306, W + 10, 300);
  c.lineTo(W + 10, H + 10);
  c.lineTo(-10, H + 10);
  c.closePath();
  ink(c, "#f6b56b", 2);
  halftone(c, 0, 300, W, H, 4.6, "#e48a3a", (_x, y) => 0.3 + (y - 300) / 40);
  c.strokeStyle = INK;
  c.lineWidth = 1.8;
  c.beginPath();
  c.moveTo(0, LAYOUT.groundY);
  c.lineTo(W, LAYOUT.groundY);
  c.stroke();

  // Tea shop.
  const sh = LAYOUT.shop;
  const base = sh.y + sh.h;
  c.fillStyle = "rgba(0,0,0,0.0)";
  halftone(c, sh.x - 4, base, sh.x + sh.w + 20, base + 14, 3.2, "rgba(20,60,10,0.75)", (x, y) => (y - base < 12 - (x - sh.x - sh.w) * 0.1 ? 1.1 : 0));
  c.beginPath();
  c.rect(sh.x, sh.y, sh.w, sh.h);
  ink(c, "#ffd23f", 2.4);
  halftone(c, sh.x + sh.w - 24, sh.y + 2, sh.x + sh.w - 2, base - 2, 3.4, "#e0a400", () => 1);
  c.beginPath();
  c.moveTo(sh.x - 16, sh.y + 4);
  c.lineTo(sh.x + 26, sh.y - sh.roofH);
  c.lineTo(sh.x + sh.w - 26, sh.y - sh.roofH);
  c.lineTo(sh.x + sh.w + 16, sh.y + 4);
  c.closePath();
  ink(c, "#ef3b3b", 2.4);
  c.strokeStyle = INK;
  c.lineWidth = 1.1;
  for (let i = 1; i < 5; i++) {
    const y = sh.y - sh.roofH + i * 8.4;
    const k = i / 5;
    c.beginPath();
    c.moveTo(sh.x + 26 - 42 * k, y);
    c.lineTo(sh.x + sh.w - 26 + 42 * k, y);
    c.stroke();
  }
  for (let i = 0; i < 12; i++) {
    const x = sh.x - 6 + i * 16;
    c.beginPath();
    c.moveTo(x, sh.y + 2);
    c.lineTo(x + 2, sh.y - 5);
    c.stroke();
  }
  // Door with warm interior and hatching.
  c.beginPath();
  c.rect(sh.doorX - 12, sh.y + 22, 24, sh.h - 22);
  ink(c, "#ff9f1c", 2);
  c.strokeStyle = "rgba(17,17,17,0.6)";
  c.lineWidth = 0.8;
  for (let i = 0; i < 6; i++) {
    c.beginPath();
    c.moveTo(sh.doorX - 12, sh.y + 30 + i * 7);
    c.lineTo(sh.doorX - 12 + 9, sh.y + 22 + i * 7);
    c.stroke();
  }
  // Window.
  c.beginPath();
  c.rect(sh.x + 112, sh.y + 16, 24, 18);
  ink(c, "#9fe3ff", 2);
  c.beginPath();
  c.moveTo(sh.x + 124, sh.y + 16);
  c.lineTo(sh.x + 124, sh.y + 34);
  c.stroke();
  // Board.
  c.beginPath();
  c.rect(sh.x + 10, sh.y + 8, 66, 15);
  ink(c, "#fff", 2);
  c.fillStyle = INK;
  c.font = `900 8px ${FONT}`;
  c.textAlign = "center";
  c.textBaseline = "middle";
  c.fillText("CHAYA KADA", sh.x + 43, sh.y + 16);
  // Counter with tea glasses.
  c.beginPath();
  c.rect(sh.x + 6, sh.y + 46, 66, 6);
  ink(c, "#9b4a22", 1.8);
  for (let i = 0; i < 3; i++) {
    const gx = sh.x + 20 + i * 14;
    c.beginPath();
    c.moveTo(gx - 3, sh.y + 37);
    c.lineTo(gx + 3, sh.y + 37);
    c.lineTo(gx + 2.2, sh.y + 46);
    c.lineTo(gx - 2.2, sh.y + 46);
    c.closePath();
    ink(c, "#e8f6ff", 1.2);
    c.fillStyle = "#c8742a";
    c.fillRect(gx - 2.3, sh.y + 41, 4.6, 4.4);
  }

  // Sign.
  const s = LAYOUT.sign;
  c.beginPath();
  c.rect(s.x - 2.5, s.y, 5, 40);
  ink(c, "#9b4a22", 1.6);
  c.beginPath();
  c.rect(s.x - 34, s.y - 16, 68, 18);
  ink(c, "#fff", 2.2);
  c.fillStyle = "#e11d2e";
  c.font = `900 9.5px ${FONT}`;
  c.fillText(s.text, s.x, s.y - 6.5);

  // Lamp posts.
  const L = LAYOUT.lamps;
  for (let i = 0; i < L.count; i++) {
    const x = L.x0 + i * L.dx;
    c.beginPath();
    c.rect(x - 1.8, L.y, 3.6, 22);
    ink(c, "#f4b400", 1.3);
    c.beginPath();
    c.rect(x - 6, L.y + 19, 12, 4);
    ink(c, "#f4b400", 1.3);
    c.beginPath();
    c.moveTo(x - 6, L.y - 1);
    c.quadraticCurveTo(x, L.y + 5, x + 6, L.y - 1);
    c.closePath();
    ink(c, "#f4b400", 1.3);
  }
  c.restore();

  // ── bottom-left panel: Ammini close-up background (pink halftone + burst) ──
  c.save();
  c.beginPath();
  c.rect(P2.x, P2.y, P2.w, P2.h);
  c.clip();
  c.fillStyle = "#ffd3dc";
  c.fillRect(P2.x, P2.y, P2.w, P2.h);
  const fx = P2.x + 74, fy = P2.y + 62;
  halftone(c, P2.x, P2.y, P2.x + P2.w, P2.y + P2.h, 5, "#ff6f91", (x, y) => Math.min(2.2, Math.hypot(x - fx, y - fy) / 110));
  c.fillStyle = "rgba(255,255,255,0.75)";
  for (let i = 0; i < 22; i++) {
    const a = (i / 22) * Math.PI * 2;
    const a2 = a + 0.06;
    c.beginPath();
    c.moveTo(fx + Math.cos(a) * 46, fy + Math.sin(a) * 46);
    c.lineTo(fx + Math.cos(a) * 400, fy + Math.sin(a) * 400);
    c.lineTo(fx + Math.cos(a2) * 400, fy + Math.sin(a2) * 400);
    c.closePath();
    c.fill();
  }
  c.restore();

  // ── bottom-right panel: yellow halftone ──
  c.save();
  c.beginPath();
  c.rect(P3.x, P3.y, P3.w, P3.h);
  c.clip();
  c.fillStyle = "#fff07a";
  c.fillRect(P3.x, P3.y, P3.w, P3.h);
  halftone(c, P3.x, P3.y, P3.x + P3.w, P3.y + P3.h, 5, "#ffc61a", (x) => 0.5 + ((x - P3.x) / P3.w) * 1.6);
  c.restore();
}

// ── per-frame pieces ─────────────────────────────────────────────────────────

function limb(ctx: CanvasRenderingContext2D, pts: { x: number; y: number }[], col: string, w: number) {
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  for (const [style, lw] of [[INK, w + 2.6], [col, w]] as const) {
    ctx.strokeStyle = style;
    ctx.lineWidth = lw;
    ctx.beginPath();
    pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
    ctx.stroke();
  }
}

function villager(ctx: CanvasRenderingContext2D, v: VillagerFrame, f: SceneFrame) {
  const s = skeleton(v);
  const d = v.facing;
  const frame = Math.floor(f.t * 12);

  // Ground shadow (a black ellipse, comic-style).
  ctx.fillStyle = "rgba(17,17,17,0.35)";
  ctx.beginPath();
  ctx.ellipse(v.x, v.y + 1, 11 - v.jump * 5, 2.6, 0, 0, Math.PI * 2);
  ctx.fill();

  if (v.moving) {
    // Speed lines and a dust puff behind the walker.
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1.3;
    ctx.lineCap = "round";
    for (let i = 0; i < 6; i++) {
      const y = v.y - 14 - i * 9 + hash(frame + i) * 3;
      const x0 = v.x - d * (12 + hash(i * 2 + frame) * 6);
      const len = 16 + hash(i * 5.3 + frame * 0.7) * 26;
      ctx.beginPath();
      ctx.moveTo(x0, y);
      ctx.lineTo(x0 - d * len, y);
      ctx.stroke();
    }
    for (let i = 0; i < 2; i++) {
      ctx.beginPath();
      ctx.arc(v.x - d * (10 + i * 7), v.y - 2 - i * 2, 3 - i * 0.6 + hash(frame + i) * 1.2, 0, Math.PI * 2);
      ink(ctx, "#fff", 1.1);
    }
  }

  limb(ctx, [s.shoulder, s.elbowB, s.handB], v.skin, 3.2);
  limb(ctx, [s.hip, s.kneeB, s.footB], v.skin, 3.8);
  limb(ctx, [s.hip, s.kneeF, s.footF], v.skin, 3.8);

  // Mundu.
  const kneeY = (s.kneeF.y + s.kneeB.y) / 2;
  const left = Math.min(s.kneeF.x, s.kneeB.x) - 5.5;
  const right = Math.max(s.kneeF.x, s.kneeB.x) + 5.5;
  ctx.beginPath();
  ctx.moveTo(s.hip.x - 7.5, s.hip.y - 3);
  ctx.lineTo(s.hip.x + 7.5, s.hip.y - 3);
  ctx.lineTo(right, kneeY + 6);
  ctx.lineTo(left, kneeY + 6);
  ctx.closePath();
  ink(ctx, v.mundu, 1.8);
  // Torso.
  const tx = (s.neck.x + s.hip.x) / 2;
  ctx.beginPath();
  ctx.roundRect(tx - 7.5, s.neck.y - 1, 15, s.hip.y - s.neck.y + 1, [5, 5, 2, 2]);
  ink(ctx, v.shirt, 1.8);
  // Comic shading: a block of dots on the back side of the shirt.
  ctx.fillStyle = "rgba(17,17,17,0.35)";
  for (let yy = s.neck.y + 3; yy < s.hip.y - 2; yy += 3) {
    ctx.beginPath();
    ctx.arc(tx - d * 5, yy, 0.7, 0, Math.PI * 2);
    ctx.arc(tx - d * 2.6, yy + 1.5, 0.55, 0, Math.PI * 2);
    ctx.fill();
  }

  // Head.
  const hx = s.head.x, hy = s.head.y;
  ctx.beginPath();
  ctx.arc(hx, hy, 7.6, 0, Math.PI * 2);
  ink(ctx, v.skin, 1.8);
  ctx.beginPath();
  ctx.arc(hx - d * 0.6, hy - 0.6, 7.8, Math.PI * 1.0, Math.PI * 2.0);
  ctx.closePath();
  ink(ctx, INK, 1);
  if (v.id === "b") {
    ctx.beginPath();
    ctx.arc(hx - d * 7, hy - 1, 3.6, 0, Math.PI * 2);
    ink(ctx, INK, 1);
  }
  ctx.fillStyle = "#fff";
  ctx.beginPath();
  ctx.ellipse(hx + d * 3.4, hy + 0.8, 1.7, 2, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = INK;
  ctx.beginPath();
  ctx.arc(hx + d * 3.9, hy + 1, 0.9, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = INK;
  ctx.lineWidth = 1;
  ctx.beginPath();
  if (v.status === "finished") ctx.arc(hx + d * 3.5, hy + 3.6, 2, 0.1, Math.PI - 0.1);
  else ctx.moveTo(hx + d * 2.4, hy + 4.4), ctx.lineTo(hx + d * 4.6, hy + 4.2);
  ctx.stroke();

  limb(ctx, [s.shoulder, s.elbowF, s.handF], v.skin, 3.2);
  limb(ctx, [s.shoulder, s.elbowF], v.shirt, 3.6);

  if (v.carry === "laptop") {
    const lx = s.handF.x, ly = s.handF.y;
    ctx.save();
    ctx.translate(lx - d * 9, ly - 1);
    ctx.rotate(-d * 0.35);
    ctx.beginPath();
    ctx.rect(d > 0 ? 0 : -3.4, -14, 3.4, 14);
    ink(ctx, "#5eead4", 1.3);
    ctx.restore();
    ctx.beginPath();
    ctx.rect(lx - 10, ly - 1.6, 20, 3.2);
    ink(ctx, "#cfd4e0", 1.4);
    // TAP TAP lettering near the keys.
    ctx.save();
    ctx.translate(lx + d * 22 + hash(frame) * 1.5, ly - 22 + hash(frame + 3) * 1.5);
    ctx.rotate(-0.18 + hash(frame * 1.3) * 0.08);
    ctx.font = `900 9px ${FONT}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.lineWidth = 2.6;
    ctx.strokeStyle = INK;
    ctx.strokeText("TAP TAP", 0, 0);
    ctx.fillStyle = "#ffe14d";
    ctx.fillText("TAP TAP", 0, 0);
    ctx.restore();
  } else if (v.carry === "glass") {
    const gx = s.handF.x, gy = s.handF.y;
    ctx.beginPath();
    ctx.moveTo(gx - 3.4, gy - 8.5);
    ctx.lineTo(gx + 3.4, gy - 8.5);
    ctx.lineTo(gx + 2.5, gy + 1);
    ctx.lineTo(gx - 2.5, gy + 1);
    ctx.closePath();
    ink(ctx, "#e8f6ff", 1.3);
    ctx.fillStyle = "#c8742a";
    ctx.fillRect(gx - 2.6, gy - 4.5, 5.2, 5);
    steamCurl(ctx, gx, gy - 10, f.t, 4);
  }

  if (v.status === "finished" && v.jump > 0.15) yesBurst(ctx, s.head.x - 30, s.head.y - 4, frame);
}

function steamCurl(ctx: CanvasRenderingContext2D, x: number, y: number, t: number, seed: number) {
  const k = Math.floor(t * 12) % 3;
  ctx.strokeStyle = "#fff";
  ctx.lineCap = "round";
  for (const [col, lw] of [[INK, 3], ["#fff", 1.4]] as const) {
    ctx.strokeStyle = col;
    ctx.lineWidth = lw;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.bezierCurveTo(x + 3 + k * 0.5, y - 3, x - 3, y - 6, x + (seed % 2 ? 1.5 : -1.5), y - 10 - k);
    ctx.stroke();
  }
}

function burstPath(ctx: CanvasRenderingContext2D, x: number, y: number, r1: number, r2: number, n: number, seed: number) {
  ctx.beginPath();
  for (let i = 0; i < n * 2; i++) {
    const a = (i / (n * 2)) * Math.PI * 2;
    const r = i % 2 ? r2 : r1 * (0.85 + hash(seed + i) * 0.3);
    const px = x + Math.cos(a) * r * 1.35, py = y + Math.sin(a) * r;
    i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
  }
  ctx.closePath();
}

function yesBurst(ctx: CanvasRenderingContext2D, x: number, y: number, frame: number) {
  burstPath(ctx, x, y, 15, 8, 10, frame % 4);
  ink(ctx, "#ffe14d", 1.8);
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(-0.12);
  ctx.font = `900 10px ${FONT}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#e11d2e";
  ctx.strokeStyle = INK;
  ctx.lineWidth = 0.8;
  ctx.fillText("YES!", 0, 0.5);
  ctx.strokeText("YES!", 0, 0.5);
  ctx.restore();
}

/** Name tab + label box, like a lettered caption pinned above each villager. */
function tag(ctx: CanvasRenderingContext2D, v: VillagerFrame, f: SceneFrame) {
  const a = labelAnchor(v);
  const urgent = v.status === "waiting";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `900 9px ${FONT}`;
  const w = ctx.measureText(v.label).width + 12;
  const h = 14;
  const y = a.y - 4;
  // Ammini's tag shifts right a little so it clears the CHAYA KADA board.
  const ox = urgent ? 16 : 0;
  ctx.save();
  ctx.translate(a.x + ox, y);
  if (urgent) {
    const k = 1 + 0.07 * f.pulse;
    ctx.scale(k, k);
    ctx.rotate(-0.02);
  }
  // Pointer to the head.
  ctx.beginPath();
  ctx.moveTo(-4 - ox, h / 2 - 1);
  ctx.lineTo(1 - ox, h / 2 + 7);
  ctx.lineTo(4 - ox, h / 2 - 1);
  ink(ctx, urgent ? "#ff2d2d" : "#fff", 1.6);
  // Hard drop shadow, then the box.
  ctx.fillStyle = INK;
  ctx.fillRect(-w / 2 + 2, -h / 2 + 2, w, h);
  ctx.beginPath();
  ctx.rect(-w / 2, -h / 2, w, h);
  ink(ctx, urgent ? `rgb(255,${40 + 50 * (1 - f.pulse)},${40 + 40 * (1 - f.pulse)})` : "#fff", 1.6);
  ctx.fillStyle = urgent ? "#fff" : INK;
  ctx.fillText(v.label, 0, 0.8);
  if (urgent) {
    // Alarm ticks either side.
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1.4;
    for (const sx of [-1, 1]) {
      for (let i = -1; i <= 1; i++) {
        ctx.beginPath();
        ctx.moveTo(sx * (w / 2 + 4), i * 5);
        ctx.lineTo(sx * (w / 2 + 7 + 2 * f.pulse), i * 6.5);
        ctx.stroke();
      }
    }
  }
  // Name tab (top-left), status-coloured stripe.
  ctx.font = `900 7.5px ${FONT}`;
  const name = v.name.toUpperCase();
  const nw = ctx.measureText(name).width + 10;
  const nx = -w / 2 - 3, ny = -h / 2 - 10;
  ctx.beginPath();
  ctx.rect(nx, ny, nw, 10);
  ink(ctx, INK, 1);
  ctx.fillStyle = STATUS_COLOR[v.status];
  ctx.fillRect(nx + 1.5, ny + 7.6, nw - 3, 1.4);
  ctx.fillStyle = "#ffe14d";
  ctx.textAlign = "left";
  ctx.fillText(name, nx + 5, ny + 4.6);
  ctx.restore();
}

function caption(ctx: CanvasRenderingContext2D, x: number, y: number, text: string, fill = "#ffe14d", size = 9, alignRight = false) {
  ctx.font = `900 ${size}px ${FONT}`;
  const w = ctx.measureText(text).width + 12;
  if (alignRight) x -= w;
  ctx.beginPath();
  ctx.rect(x, y, w, size + 7);
  ink(ctx, fill, 1.8);
  ctx.fillStyle = INK;
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillText(text, x + 6, y + (size + 7) / 2 + 0.5);
}

function amminiPanel(ctx: CanvasRenderingContext2D, f: SceneFrame) {
  const frame = Math.floor(f.t * 12);
  ctx.save();
  ctx.beginPath();
  ctx.rect(P2.x, P2.y, P2.w, P2.h);
  ctx.clip();
  // Urgent red tint, pulsing.
  ctx.fillStyle = `rgba(255,30,60,${0.08 + 0.22 * f.pulse})`;
  ctx.fillRect(P2.x, P2.y, P2.w, P2.h);

  const amm = f.villagers.find((v) => v.status === "waiting")!;
  const shake = f.pulse > 0.75 ? (hash(frame) - 0.5) * 2 : 0;
  const fx = P2.x + 74 + shake, fy = P2.y + 62;
  // Shoulders and blouse.
  ctx.beginPath();
  ctx.moveTo(fx - 52, P2.y + P2.h + 4);
  ctx.quadraticCurveTo(fx - 48, fy + 30, fx, fy + 28);
  ctx.quadraticCurveTo(fx + 48, fy + 30, fx + 52, P2.y + P2.h + 4);
  ctx.closePath();
  ink(ctx, amm.shirt, 2.4);
  ctx.beginPath();
  ctx.rect(fx - 7, fy + 18, 14, 14);
  ink(ctx, amm.skin, 2);
  // Bun behind the head.
  ctx.beginPath();
  ctx.arc(fx - 28, fy - 14, 12, 0, Math.PI * 2);
  ink(ctx, INK, 2);
  // Face.
  ctx.beginPath();
  ctx.ellipse(fx, fy, 27, 31, 0, 0, Math.PI * 2);
  ink(ctx, amm.skin, 2.6);
  // Halftone shading on the left cheek.
  ctx.save();
  ctx.clip();
  halftone(ctx, fx - 30, fy - 30, fx - 8, fy + 32, 3.4, "rgba(60,20,10,0.4)", (x) => Math.max(0, (fx - 8 - x) / 14));
  ctx.restore();
  // Hair: a dark cap with a centre parting.
  ctx.beginPath();
  ctx.moveTo(fx - 28, fy + 2);
  ctx.quadraticCurveTo(fx - 30, fy - 34, fx, fy - 33);
  ctx.quadraticCurveTo(fx + 30, fy - 34, fx + 28, fy + 2);
  ctx.quadraticCurveTo(fx + 20, fy - 18, fx + 1, fy - 22);
  ctx.quadraticCurveTo(fx - 18, fy - 18, fx - 28, fy + 2);
  ctx.closePath();
  ink(ctx, INK, 1.8);
  // Bindi.
  ctx.fillStyle = "#e11d2e";
  ctx.beginPath();
  ctx.arc(fx + 2, fy - 13, 2.2, 0, Math.PI * 2);
  ctx.fill();
  // Worried brows, wide eyes glancing at the bubble.
  ctx.strokeStyle = INK;
  ctx.lineWidth = 2.4;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(fx - 15, fy - 6);
  ctx.lineTo(fx - 5, fy - 10);
  ctx.moveTo(fx + 9, fy - 10);
  ctx.lineTo(fx + 19, fy - 6);
  ctx.stroke();
  for (const ex of [fx - 9, fx + 13]) {
    ctx.beginPath();
    ctx.ellipse(ex, fy - 1, 4.6, 5.4, 0, 0, Math.PI * 2);
    ink(ctx, "#fff", 1.6);
    ctx.fillStyle = INK;
    ctx.beginPath();
    ctx.arc(ex + 2, fy - 1.5, 2.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.fillRect(ex + 2.4, fy - 3.4, 1.1, 1.1);
  }
  // Nose and small "o" mouth.
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(fx + 3, fy + 2);
  ctx.lineTo(fx + 5, fy + 9);
  ctx.lineTo(fx + 2, fy + 10);
  ctx.stroke();
  ctx.beginPath();
  ctx.ellipse(fx + 3, fy + 18, 3, 3.6 + f.pulse * 0.8, 0, 0, Math.PI * 2);
  ink(ctx, "#7a1a1a", 1.6);
  // Gold earring.
  ctx.beginPath();
  ctx.arc(fx + 27, fy + 8, 3, 0, Math.PI * 2);
  ink(ctx, "#ffc61a", 1.4);
  // Sweat drop.
  const sy = fy - 18 + ((frame % 12) / 12) * 6;
  ctx.beginPath();
  ctx.moveTo(fx + 30, sy - 6);
  ctx.quadraticCurveTo(fx + 35, sy + 2, fx + 30, sy + 3);
  ctx.quadraticCurveTo(fx + 25, sy + 2, fx + 30, sy - 6);
  ink(ctx, "#8fd8ff", 1.4);
  // Worry emanata over the head.
  ctx.strokeStyle = INK;
  ctx.lineWidth = 2;
  for (let i = -2; i <= 2; i++) {
    const a = -Math.PI / 2 + i * 0.32;
    const r0 = 38 + f.pulse * 3;
    ctx.beginPath();
    ctx.moveTo(fx + Math.cos(a) * r0, fy + Math.sin(a) * r0);
    ctx.lineTo(fx + Math.cos(a) * (r0 + 7), fy + Math.sin(a) * (r0 + 7));
    ctx.stroke();
  }
  // Hand lifting the tea glass.
  const gx = fx + 44, gy = fy + 26;
  ctx.beginPath();
  ctx.moveTo(gx - 7, gy - 13);
  ctx.lineTo(gx + 7, gy - 13);
  ctx.lineTo(gx + 5, gy + 6);
  ctx.lineTo(gx - 5, gy + 6);
  ctx.closePath();
  ink(ctx, "#e8f6ff", 1.8);
  ctx.fillStyle = "#c8742a";
  ctx.fillRect(gx - 5.6, gy - 5, 11.2, 10.4);
  ctx.beginPath();
  ctx.ellipse(gx, gy + 7, 8, 6, 0, 0, Math.PI * 2);
  ink(ctx, amm.skin, 1.8);
  steamCurl(ctx, gx - 2, gy - 15, f.t, 1);
  steamCurl(ctx, gx + 3, gy - 15, f.t + 0.25, 2);

  // Speech bubble.
  const bx = P2.x + 262, by = P2.y + 42;
  ctx.beginPath();
  ctx.ellipse(bx, by, 118, 27, 0, 0, Math.PI * 2);
  ctx.moveTo(bx - 84, by + 14);
  ctx.lineTo(fx + 22, fy + 18);
  ctx.lineTo(bx - 66, by + 20);
  ctx.fillStyle = "#fff";
  ctx.fill();
  ctx.strokeStyle = INK;
  ctx.lineWidth = 2.2;
  ctx.stroke();
  ctx.beginPath();
  ctx.ellipse(bx, by, 117, 26, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.save();
  ctx.translate(bx, by + 1);
  const k = 1 + 0.05 * f.pulse;
  ctx.scale(k, k);
  ctx.font = `900 17px ${FONT}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = INK;
  ctx.fillText("Approve git push?", 0, 0);
  ctx.restore();
  ctx.restore();

  // Caption naming her state (text, not only the face).
  caption(ctx, P2.x + P2.w, P2.y + P2.h - 15, `AMMINI · ${amm.label}`.toUpperCase(), "#ffe14d", 8, true);
}

function laptopPanel(ctx: CanvasRenderingContext2D, f: SceneFrame) {
  const frame = Math.floor(f.t * 12);
  ctx.save();
  ctx.beginPath();
  ctx.rect(P3.x, P3.y, P3.w, P3.h);
  ctx.clip();
  const lx = P3.x + 22, ly = P3.y + 24;
  // Screen.
  ctx.beginPath();
  ctx.rect(lx, ly, 120, 60);
  ink(ctx, "#cfd4e0", 2.4);
  ctx.fillStyle = "#14213d";
  ctx.fillRect(lx + 5, ly + 5, 110, 50);
  ctx.font = `900 7px ${FONT}`;
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#ffe14d";
  ctx.fillText("auth.ts", lx + 9, ly + 11);
  const cols = ["#5eead4", "#ff8fab", "#fff", "#a3e635", "#8fd8ff"];
  const lines = 1 + Math.floor(f.progress * 5);
  for (let i = 0; i < 5; i++) {
    if (i >= lines) break;
    ctx.fillStyle = cols[i];
    ctx.fillRect(lx + 9 + (i % 2) * 8, ly + 18 + i * 5, 30 + hash(i * 9) * 50, 2.4);
  }
  if (frame % 6 < 3) {
    ctx.fillStyle = "#fff";
    ctx.fillRect(lx + 9 + (lines % 2) * 8 + 4, ly + 17 + lines * 5, 3, 4);
  }
  // Progress bar, lettered.
  ctx.beginPath();
  ctx.rect(lx + 9, ly + 45, 80, 6);
  ink(ctx, "#fff", 1.2);
  ctx.fillStyle = STATUS_COLOR.working;
  ctx.fillRect(lx + 9.6, ly + 45.6, 78.8 * f.progress, 4.8);
  ctx.fillStyle = "#fff";
  ctx.fillText(`${Math.round(f.progress * 100)}%`, lx + 93, ly + 48.4);
  // Keyboard base.
  ctx.beginPath();
  ctx.moveTo(lx - 10, ly + 74);
  ctx.lineTo(lx + 130, ly + 74);
  ctx.lineTo(lx + 120, ly + 62);
  ctx.lineTo(lx, ly + 62);
  ctx.closePath();
  ink(ctx, "#aab1c2", 2.2);
  // Sound effect.
  ctx.save();
  ctx.translate(P3.x + 178 + hash(frame) * 2, P3.y + 50 + hash(frame + 1) * 2);
  ctx.rotate(0.22);
  ctx.font = `900 15px ${FONT}`;
  ctx.textAlign = "center";
  ctx.lineWidth = 3.4;
  ctx.strokeStyle = INK;
  ctx.lineJoin = "round";
  for (const [i, word] of ["TAP!", "TAP!"].entries()) {
    const dy = i * 18 - 9;
    ctx.strokeText(word, 0, dy);
    ctx.fillStyle = i ? "#ff3b30" : "#2f86e6";
    ctx.fillText(word, 0, dy);
  }
  ctx.restore();
  ctx.restore();
  caption(ctx, P3.x, P3.y, "KUTTAN, HARD AT WORK", "#fff", 7.5);
}

export const comicArt: StyleProto = {
  id: "comic-art",
  n: 5,
  name: "Comic Art",
  blurb: "A comic book page: halftone skies, thick ink and flat bright fills, captions, sound effects and a close-up panel of Ammini asking for approval. On twos (12 fps).",
  fps: 12,
  bg: PAPER,
  draw(ctx, f) {
    if (!pageLayer) pageLayer = makeLayer(paintPage);
    if (!palmLayer) palmLayer = makeLayer(paintPalms);
    ctx.drawImage(pageLayer, 0, 0, W, H);
    const t = f.t;

    // ── main panel (scene units) ──
    ctx.save();
    ctx.beginPath();
    ctx.rect(P1.x, P1.y, P1.w, P1.h);
    ctx.clip();
    toScene(ctx);

    // Canoe with rower.
    const cx = f.canoeX, cy = 178;
    ctx.beginPath();
    ctx.moveTo(cx - 25, cy - 4);
    ctx.quadraticCurveTo(cx, cy + 9, cx + 25, cy - 4);
    ctx.closePath();
    ink(ctx, "#9b4a22", 1.8);
    limb(ctx, [{ x: cx - 1, y: cy - 2 }, { x: cx, y: cy - 12 }], "#fff", 4);
    ctx.beginPath();
    ctx.arc(cx, cy - 16, 3.6, 0, Math.PI * 2);
    ink(ctx, "#7a4a2a", 1.4);
    limb(ctx, [{ x: cx + 1, y: cy - 10 }, { x: cx + 14, y: cy + 5 + Math.sin(t * 2) * 2 }], "#c0702c", 1.4);

    // Near palms (cached), drawn in page units over the canoe.
    ctx.save();
    ctx.setTransform(ctx.getTransform().translate(0, Y0).scale(1 / S, 1 / S).translate(-P1.x, -P1.y));
    ctx.drawImage(palmLayer, 0, 0, W, H);
    ctx.restore();

    // Steam over the counter glasses.
    const sh = LAYOUT.shop;
    for (let i = 0; i < 3; i++) steamCurl(ctx, sh.x + 20 + i * 14, sh.y + 35, t + i * 0.3, i);

    // Lamp flames with emanata.
    const L = LAYOUT.lamps;
    for (let i = 0; i < L.count; i++) {
      const lit = Math.max(0, Math.min(1, f.lampsLit - i));
      if (lit <= 0) continue;
      const x = L.x0 + i * L.dx;
      const fl = 0.85 + 0.15 * lit + hash(Math.floor(t * 12) + i) * 0.15;
      ctx.beginPath();
      ctx.moveTo(x, L.y - 11 * fl);
      ctx.quadraticCurveTo(x + 4.5, L.y - 3, x, L.y - 0.5);
      ctx.quadraticCurveTo(x - 4.5, L.y - 3, x, L.y - 11 * fl);
      ink(ctx, lit >= 1 ? "#ff8c1a" : "#ffb347", 1.3);
      ctx.beginPath();
      ctx.ellipse(x, L.y - 3.5, 1.5, 2.6, 0, 0, Math.PI * 2);
      ctx.fillStyle = "#ffe14d";
      ctx.fill();
      if (lit >= 1) {
        ctx.strokeStyle = INK;
        ctx.lineWidth = 1.1;
        for (const a of [-2.4, -1.57, -0.74]) {
          ctx.beginPath();
          ctx.moveTo(x + Math.cos(a) * 9, L.y - 5 + Math.sin(a) * 9);
          ctx.lineTo(x + Math.cos(a) * 13, L.y - 5 + Math.sin(a) * 13);
          ctx.stroke();
        }
      }
    }

    for (const v of f.villagers) villager(ctx, v, f);
    for (const v of f.villagers) tag(ctx, v, f);
    ctx.restore();

    // Caption box, top-left of the main panel.
    caption(ctx, P1.x, P1.y, "MEANWHILE, IN THE GRAMAM…", "#ffe14d", 9);

    // ── bottom panels ──
    amminiPanel(ctx, f);
    laptopPanel(ctx, f);

    // Panel borders on top of everything.
    ctx.strokeStyle = INK;
    ctx.lineWidth = 3;
    ctx.lineJoin = "miter";
    for (const p of [P1, P2, P3]) ctx.strokeRect(p.x, p.y, p.w, p.h);
  },
};
