import { H, LAYOUT, STATUS_COLOR, W, hash, labelAnchor, skeleton, type SceneFrame, type VillagerFrame } from "../scene";
import type { StyleProto } from "../types";

/**
 * 10 · Explainer 3D: a soft "clay toy under studio light" look, faked in 2.5D.
 * Every volume is a gradient-shaded rounded shape lit from the upper left,
 * with soft contact shadows. Static set pieces are cached once at 2×.
 */

type C = CanvasRenderingContext2D;
type P = { x: number; y: number };

export const FONT = "ui-rounded, 'Segoe UI Rounded', 'Arial Rounded MT Bold', 'Segoe UI', system-ui, sans-serif";

// ── colour helpers ───────────────────────────────────────────────────────────

const shadeCache = new Map<string, string>();
/** Lighten (k > 0, towards white) or darken (k < 0, towards warm black) a #rrggbb colour. */
export function shade(hex: string, k: number): string {
  const key = hex + k;
  const hit = shadeCache.get(key);
  if (hit) return hit;
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  if (k >= 0) { r += (255 - r) * k; g += (250 - g) * k; b += (240 - b) * k; }
  else { const m = 1 + k; r = r * m + 40 * -k; g = g * m + 20 * -k; b = b * m + 20 * -k; }
  const h2 = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, "0");
  const out = `#${h2(r)}${h2(g)}${h2(b)}`;
  shadeCache.set(key, out);
  return out;
}

// ── soft-volume primitives ───────────────────────────────────────────────────

export function rrect(c: C, x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.min(r, w / 2, h / 2);
  c.beginPath();
  c.moveTo(x + rr, y);
  c.arcTo(x + w, y, x + w, y + h, rr);
  c.arcTo(x + w, y + h, x, y + h, rr);
  c.arcTo(x, y + h, x, y, rr);
  c.arcTo(x, y, x + w, y, rr);
  c.closePath();
}

/** A shaded sphere, key light from the upper left. */
export function ball(c: C, x: number, y: number, r: number, col: string, lite = 0.5, dark = -0.32) {
  const g = c.createRadialGradient(x - r * 0.38, y - r * 0.42, r * 0.08, x, y, r * 1.05);
  g.addColorStop(0, shade(col, lite));
  g.addColorStop(0.55, col);
  g.addColorStop(1, shade(col, dark));
  c.fillStyle = g;
  c.beginPath();
  c.arc(x, y, r, 0, Math.PI * 2);
  c.fill();
}

/** A rounded box with a soft vertical gradient and a light top rim. */
export function softBox(c: C, x: number, y: number, w: number, h: number, r: number, col: string, lite = 0.28, dark = -0.18) {
  const g = c.createLinearGradient(x, y, x + w * 0.25, y + h);
  g.addColorStop(0, shade(col, lite));
  g.addColorStop(0.45, col);
  g.addColorStop(1, shade(col, dark));
  c.fillStyle = g;
  rrect(c, x, y, w, h, r);
  c.fill();
}

/** A capsule limb through points, with a thin highlight on the lit side. */
export function capsule(c: C, pts: P[], w: number, col: string) {
  c.lineCap = "round";
  c.lineJoin = "round";
  c.strokeStyle = shade(col, -0.12);
  c.lineWidth = w;
  c.beginPath();
  pts.forEach((p, i) => (i ? c.lineTo(p.x, p.y) : c.moveTo(p.x, p.y)));
  c.stroke();
  c.strokeStyle = shade(col, 0.1);
  c.lineWidth = w * 0.62;
  c.beginPath();
  pts.forEach((p, i) => (i ? c.lineTo(p.x - w * 0.12, p.y - w * 0.08) : c.moveTo(p.x - w * 0.12, p.y - w * 0.08)));
  c.stroke();
  c.strokeStyle = shade(col, 0.42);
  c.globalAlpha = 0.55;
  c.lineWidth = w * 0.22;
  c.beginPath();
  pts.forEach((p, i) => (i ? c.lineTo(p.x - w * 0.24, p.y - w * 0.16) : c.moveTo(p.x - w * 0.24, p.y - w * 0.16)));
  c.stroke();
  c.globalAlpha = 1;
}

/** A soft contact shadow (blurred ellipse). */
export function shadow(c: C, x: number, y: number, rx: number, ry: number, a: number) {
  c.save();
  c.translate(x, y);
  c.scale(1, ry / rx);
  const g = c.createRadialGradient(0, 0, 0, 0, 0, rx);
  g.addColorStop(0, `rgba(96,58,40,${a})`);
  g.addColorStop(0.55, `rgba(96,58,40,${a * 0.55})`);
  g.addColorStop(1, "rgba(96,58,40,0)");
  c.fillStyle = g;
  c.beginPath();
  c.arc(0, 0, rx, 0, Math.PI * 2);
  c.fill();
  c.restore();
}

// ── cached layers ────────────────────────────────────────────────────────────

function layer(w: number, h: number, paint: (c: C) => void): HTMLCanvasElement {
  const cv = document.createElement("canvas");
  cv.width = w * 2;
  cv.height = h * 2;
  const c = cv.getContext("2d")!;
  c.scale(2, 2);
  paint(c);
  return cv;
}

let backLayer: HTMLCanvasElement | null = null;
let frontLayer: HTMLCanvasElement | null = null;
let overLayer: HTMLCanvasElement | null = null;
let cloudSprite: HTMLCanvasElement | null = null;

const SUN = { x: 104, y: 50 };

function paintBack(c: C) {
  // Sky: soft studio blue fading to warm cream at the horizon.
  const sky = c.createLinearGradient(0, 0, 0, LAYOUT.horizonY);
  sky.addColorStop(0, "#8fc9e6");
  sky.addColorStop(0.55, "#c7e5ee");
  sky.addColorStop(1, "#fbe7d2");
  c.fillStyle = sky;
  c.fillRect(0, 0, W, LAYOUT.horizonY + 2);
  // Sun with a big warm halo.
  const halo = c.createRadialGradient(SUN.x, SUN.y, 6, SUN.x, SUN.y, 120);
  halo.addColorStop(0, "rgba(255,240,200,0.9)");
  halo.addColorStop(0.25, "rgba(255,228,180,0.45)");
  halo.addColorStop(1, "rgba(255,228,180,0)");
  c.fillStyle = halo;
  c.fillRect(0, 0, 300, 200);
  ball(c, SUN.x, SUN.y, 15, "#ffe39a", 0.7, -0.08);

  // Far hills, slightly blurred (shallow depth of field).
  c.filter = "blur(1.2px)";
  const hill = (pts: [number, number, number][], col: string) => {
    for (const [x, r, k] of pts) {
      const g = c.createRadialGradient(x - r * 0.3, LAYOUT.horizonY - r * k - r * 0.3, 2, x, LAYOUT.horizonY, r * 1.2);
      g.addColorStop(0, shade(col, 0.3));
      g.addColorStop(1, col);
      c.fillStyle = g;
      c.beginPath();
      c.ellipse(x, LAYOUT.horizonY + 2, r, r * k, 0, Math.PI, 0);
      c.fill();
    }
  };
  hill([[60, 90, 0.32], [230, 120, 0.26], [420, 110, 0.3], [600, 100, 0.34]], "#b9d9d6");
  hill([[140, 70, 0.3], [330, 80, 0.24], [510, 75, 0.28]], "#9fd0b5");
  // Far palms: little rounded lollipop palms.
  for (const x of LAYOUT.farPalms) {
    const b = LAYOUT.horizonY + 1;
    capsule(c, [{ x, y: b }, { x: x + 2, y: b - 18 }, { x: x + 3, y: b - 30 }], 2.4, "#a98f73");
    for (let i = 0; i < 5; i++) {
      const a = Math.PI + (i / 4) * Math.PI;
      c.fillStyle = i % 2 ? "#7fc39b" : "#8fcfa6";
      c.beginPath();
      c.ellipse(x + 3 + Math.cos(a) * 7, b - 30 + Math.sin(a) * 3 + 3, 7.5, 3.2, a + Math.PI / 2 + Math.PI / 2, 0, Math.PI * 2);
      c.fill();
    }
    ball(c, x + 3, b - 31, 3, "#7fc39b");
  }
  c.filter = "none";

  // Water: glossy sky-coloured band.
  const wt = LAYOUT.waterTop, wb = LAYOUT.waterBottom;
  const wg = c.createLinearGradient(0, wt, 0, wb);
  wg.addColorStop(0, "#bfe4ec");
  wg.addColorStop(0.35, "#8ccde0");
  wg.addColorStop(1, "#5fb3d2");
  c.fillStyle = wg;
  c.fillRect(0, wt, W, wb - wt + 4);
  // Soft reflection of the hills right under the horizon.
  const rg = c.createLinearGradient(0, wt, 0, wt + 12);
  rg.addColorStop(0, "rgba(120,190,160,0.45)");
  rg.addColorStop(1, "rgba(120,190,160,0)");
  c.fillStyle = rg;
  c.fillRect(0, wt, W, 12);
  // Sun path glint.
  const sg = c.createRadialGradient(SUN.x, wt + 18, 1, SUN.x, wt + 18, 70);
  sg.addColorStop(0, "rgba(255,250,230,0.55)");
  sg.addColorStop(1, "rgba(255,250,230,0)");
  c.save();
  c.translate(0, wt + 18);
  c.scale(1, 0.25);
  c.translate(0, -(wt + 18));
  c.fillStyle = sg;
  c.fillRect(0, wt - 60, 260, 140);
  c.restore();
}

export function palm(c: C, x: number, baseY: number, h: number, lean: number) {
  const topX = x + lean * h, topY = baseY - h;
  const cx = x + lean * h * 0.2, cy = baseY - h * 0.5;
  shadow(c, x + 6, baseY + 1, 18, 4, 0.35);
  // Chunky trunk of stacked rounded rings.
  const n = Math.round(h / 5.5);
  const sc = Math.sqrt(h / 150);
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const px = (1 - t) * (1 - t) * x + 2 * (1 - t) * t * cx + t * t * topX;
    const py = (1 - t) * (1 - t) * baseY + 2 * (1 - t) * t * cy + t * t * topY;
    const r = (7.5 - t * 2.6) * sc;
    const col = i % 2 ? "#c08a5e" : "#b27b51";
    const g = c.createRadialGradient(px - r * 0.45, py - r * 0.2, 0.5, px, py, r * 1.1);
    g.addColorStop(0, shade(col, 0.4));
    g.addColorStop(0.6, col);
    g.addColorStop(1, shade(col, -0.3));
    c.fillStyle = g;
    c.beginPath();
    c.ellipse(px, py, r, r * 0.72, 0, 0, Math.PI * 2);
    c.fill();
  }
  // Fronds: fat rounded leaves, back ones darker.
  const L = h * 0.38;
  const fronds: [number, number][] = [
    [-Math.PI / 2 - 0.45, -0.2], [-Math.PI / 2 + 0.5, -0.2], [Math.PI + 0.15, -0.1], [-0.15, -0.1],
    [Math.PI - 0.55, 0.05], [0.55, 0.05], [Math.PI / 2 + 0.25, 0.1], [Math.PI / 2 - 0.35, 0.12],
  ];
  for (const [a, depth] of fronds) {
    const dx = Math.cos(a), dy = Math.sin(a);
    const tip = { x: topX + dx * L, y: topY + dy * L * 0.55 + L * 0.42 };
    const mid = { x: topX + dx * L * 0.55, y: topY + dy * L * 0.4 - L * 0.12 };
    const len = Math.hypot(tip.x - topX, tip.y - topY) || 1;
    const nx = -(tip.y - topY) / len, ny = (tip.x - topX) / len;
    const wdt = L * 0.17;
    const col = depth < 0 ? "#5fa86a" : depth > 0.08 ? "#6cb873" : "#79c47c";
    const g = c.createLinearGradient(topX, topY, tip.x, tip.y);
    g.addColorStop(0, shade(col, 0.35));
    g.addColorStop(0.5, col);
    g.addColorStop(1, shade(col, -0.22));
    c.fillStyle = g;
    c.beginPath();
    c.moveTo(topX, topY);
    c.quadraticCurveTo(mid.x + nx * wdt, mid.y + ny * wdt, tip.x, tip.y);
    c.quadraticCurveTo(mid.x - nx * wdt, mid.y - ny * wdt, topX, topY);
    c.fill();
    c.strokeStyle = shade(col, 0.45);
    c.globalAlpha = 0.6;
    c.lineWidth = 0.9;
    c.beginPath();
    c.moveTo(topX, topY);
    c.quadraticCurveTo(mid.x, mid.y, tip.x, tip.y);
    c.stroke();
    c.globalAlpha = 1;
  }
  ball(c, topX - 3, topY + 4, 3.6 * sc + 0.6, "#9a7a3a");
  ball(c, topX + 3, topY + 5, 3.6 * sc + 0.6, "#8f6f33");
  ball(c, topX, topY + 7, 3.6 * sc + 0.6, "#a5853f");
  ball(c, topX, topY, 4.5 * sc, "#7fc87f");
}

export function bush(c: C, x: number, y: number, s: number, col = "#7cc58a") {
  shadow(c, x, y + 1, 16 * s, 3.5 * s, 0.32);
  ball(c, x - 8 * s, y - 5 * s, 7 * s, shade(col, -0.06), 0.45, -0.16);
  ball(c, x + 8 * s, y - 5 * s, 6.5 * s, col, 0.45, -0.16);
  ball(c, x, y - 9 * s, 9 * s, col, 0.45, -0.16);
}

export function flower(c: C, x: number, y: number, col: string) {
  c.strokeStyle = "#6aa86c";
  c.lineWidth = 1;
  c.beginPath();
  c.moveTo(x, y);
  c.lineTo(x, y - 5);
  c.stroke();
  ball(c, x, y - 6, 2.2, col, 0.55, -0.2);
}

export function tumbler(c: C, x: number, y: number, s = 1) {
  // Glass of chaya: amber tea, foam top, glass highlight. (x, y) = bottom centre.
  c.fillStyle = "rgba(255,255,255,0.45)";
  c.beginPath();
  c.moveTo(x - 3.4 * s, y - 9 * s);
  c.lineTo(x - 2.6 * s, y);
  c.lineTo(x + 2.6 * s, y);
  c.lineTo(x + 3.4 * s, y - 9 * s);
  c.closePath();
  c.fill();
  const g = c.createLinearGradient(x - 3 * s, 0, x + 3 * s, 0);
  g.addColorStop(0, "#e2a868");
  g.addColorStop(1, "#b9773e");
  c.fillStyle = g;
  c.beginPath();
  c.moveTo(x - 3.1 * s, y - 6.5 * s);
  c.lineTo(x - 2.6 * s, y - 0.4 * s);
  c.lineTo(x + 2.6 * s, y - 0.4 * s);
  c.lineTo(x + 3.1 * s, y - 6.5 * s);
  c.closePath();
  c.fill();
  c.fillStyle = "#f6dcb3";
  c.beginPath();
  c.ellipse(x, y - 6.6 * s, 3.1 * s, 1 * s, 0, 0, Math.PI * 2);
  c.fill();
  c.strokeStyle = "rgba(255,255,255,0.85)";
  c.lineWidth = 0.8 * s;
  c.lineCap = "round";
  c.beginPath();
  c.moveTo(x - 2.4 * s, y - 8 * s);
  c.lineTo(x - 1.9 * s, y - 1.5 * s);
  c.stroke();
}

function paintShop(c: C) {
  const sh = LAYOUT.shop;
  const base = sh.y + sh.h;
  shadow(c, sh.x + sh.w / 2 + 6, base + 2, sh.w * 0.62, 9, 0.38);
  // Side wall (gives the box depth).
  const sg = c.createLinearGradient(sh.x + sh.w, 0, sh.x + sh.w + 12, 0);
  sg.addColorStop(0, "#e2b996");
  sg.addColorStop(1, "#d3a685");
  c.fillStyle = sg;
  c.beginPath();
  c.moveTo(sh.x + sh.w - 2, sh.y + 6);
  c.lineTo(sh.x + sh.w + 12, sh.y);
  c.lineTo(sh.x + sh.w + 12, base - 7);
  c.lineTo(sh.x + sh.w - 2, base);
  c.closePath();
  c.fill();
  // Front wall.
  softBox(c, sh.x, sh.y + 2, sh.w, sh.h - 2, 5, "#f8dcc0", 0.3, -0.08);
  const ao = c.createLinearGradient(0, sh.y + 4, 0, sh.y + 18);
  ao.addColorStop(0, "rgba(140,70,40,0.32)");
  ao.addColorStop(1, "rgba(140,70,40,0)");
  c.fillStyle = ao;
  c.fillRect(sh.x, sh.y + 4, sh.w + 12, 14);
  // Plinth.
  softBox(c, sh.x - 4, base - 8, sh.w + 8, 10, 4, "#dc8f6c");
  // Counter opening with a warm interior and jars.
  const op = c.createLinearGradient(0, 224, 0, 246);
  op.addColorStop(0, "#5a3326");
  op.addColorStop(1, "#8a5640");
  c.fillStyle = op;
  rrect(c, 80, 224, 64, 22, 6);
  c.fill();
  const jars = ["#f9a8c4", "#a7e3c8", "#fde68a"];
  jars.forEach((col, i) => {
    const jx = 92 + i * 13;
    c.fillStyle = "rgba(255,255,255,0.35)";
    rrect(c, jx - 4, 228, 8, 10, 3);
    c.fill();
    ball(c, jx, 235, 3, col);
    softBox(c, jx - 3, 226.5, 6, 2.5, 1.2, "#e9c08c");
  });
  // Counter slab and front.
  softBox(c, 78, 251, 68, 12, 3, "#efc49d", 0.2, -0.15);
  softBox(c, 74, 244, 76, 7, 3.5, "#c98a5c", 0.35, -0.2);
  // Brass tea urn.
  shadow(c, 136, 245, 8, 2, 0.35);
  ball(c, 136, 238, 7, "#e7b54e", 0.6, -0.3);
  softBox(c, 131, 229, 10, 4, 2, "#d9a23f");
  ball(c, 136, 228, 2, "#f0c869");
  // Glasses on the counter.
  for (let i = 0; i < 3; i++) tumbler(c, 92 + i * 13, 244.5, 0.9);
  // Board.
  shadow(c, 112, 223, 30, 2, 0.25);
  softBox(c, 82, 208, 60, 13, 6.5, "#8fd8c4", 0.4, -0.15);
  c.font = `800 7.4px ${FONT}`;
  c.textAlign = "center";
  c.textBaseline = "middle";
  c.fillStyle = "#2e5d55";
  c.fillText("CHAYA KADA", 112, 214.8);
  // Door: arched wooden panels.
  const dx = sh.doorX;
  c.fillStyle = "rgba(120,60,30,0.25)";
  rrect(c, dx - 13.5, 220.5, 27, 50, 11);
  c.fill();
  softBox(c, dx - 12, 222, 24, 48, 10, "#c07c52", 0.3, -0.2);
  softBox(c, dx - 8, 228, 7, 16, 3, "#ad6c45", -0.05, -0.2);
  softBox(c, dx + 1, 228, 7, 16, 3, "#ad6c45", -0.05, -0.2);
  softBox(c, dx - 8, 248, 16, 16, 3, "#ad6c45", -0.05, -0.2);
  ball(c, dx + 7.5, 247, 1.6, "#f0c869");
  softBox(c, dx - 18, 266, 36, 7, 3.5, "#e9b896");
  // Window with a sky reflection and a flower box.
  softBox(c, 184, 220, 44, 28, 9, "#fff4e6", 0.2, -0.1);
  const gl = c.createLinearGradient(188, 224, 222, 246);
  gl.addColorStop(0, "#d8f1f6");
  gl.addColorStop(0.5, "#9fd4e6");
  gl.addColorStop(1, "#7cbcd6");
  c.fillStyle = gl;
  rrect(c, 188, 224, 36, 20, 6);
  c.fill();
  c.strokeStyle = "rgba(255,255,255,0.75)";
  c.lineWidth = 2;
  c.lineCap = "round";
  c.beginPath();
  c.moveTo(194, 240);
  c.lineTo(202, 228);
  c.moveTo(201, 241);
  c.lineTo(207, 232);
  c.stroke();
  softBox(c, 206 - 1, 224, 2, 20, 1, "#fff4e6", 0, 0);
  ["#f9a8c4", "#fde68a", "#f9a8c4", "#c4b5fd", "#fde68a"].forEach((col, i) => ball(c, 188 + i * 9, 247, 3, col, 0.55, -0.2));
  softBox(c, 183, 248, 46, 7, 3.5, "#d98a64");

  // Roof: rows of rounded barrel tiles.
  const rt = sh.y - sh.roofH, rb = sh.y + 8;
  const l0 = sh.x - 16, r0 = sh.x + sh.w + 16, l1 = sh.x + 24, r1 = sh.x + sh.w - 24;
  c.save();
  c.beginPath();
  c.moveTo(l1 - 2, rt);
  c.lineTo(r1 + 2, rt);
  c.lineTo(r0, rb);
  c.lineTo(l0, rb);
  c.closePath();
  c.fillStyle = "#b95f3e";
  c.fill();
  c.clip();
  const rows = 6;
  for (let r = 0; r < rows; r++) {
    const y0 = rt - 2 + (r * (rb - rt)) / rows;
    const k = (y0 - rt) / (rb - rt);
    const xl = l1 + (l0 - l1) * k - 6, xr = r1 + (r0 - r1) * k + 6;
    for (let x = xl + (r % 2) * 4.5; x < xr; x += 9) {
      const g = c.createLinearGradient(x, 0, x + 9, 0);
      g.addColorStop(0, "#f6b089");
      g.addColorStop(0.45, "#e48b63");
      g.addColorStop(1, "#b9603f");
      c.fillStyle = g;
      rrect(c, x, y0, 8.6, 10.5, 4.3);
      c.fill();
    }
  }
  c.restore();
  // Ridge and eave thickness.
  capsule(c, [{ x: l1 - 2, y: rt }, { x: r1 + 2, y: rt }], 6, "#c96a46");
  ball(c, l1 - 3, rt, 4.2, "#d27450");
  ball(c, r1 + 3, rt, 4.2, "#d27450");
  softBox(c, l0 - 2, rb - 1, r0 - l0 + 4, 6, 3, "#a9553a", 0.25, -0.2);
}

function paintSign(c: C) {
  const s = LAYOUT.sign;
  shadow(c, s.x + 4, s.y + 41, 12, 3, 0.35);
  capsule(c, [{ x: s.x, y: s.y + 40 }, { x: s.x, y: s.y }], 4.5, "#b27b51");
  shadow(c, s.x + 3, s.y + 6, 30, 3, 0.2);
  c.fillStyle = "#c2865c";
  rrect(c, s.x - 31, s.y - 13, 62, 19, 9);
  c.fill();
  softBox(c, s.x - 31, s.y - 15, 62, 18, 9, "#f4c194", 0.35, -0.12);
  c.font = `800 8.5px ${FONT}`;
  c.textAlign = "center";
  c.textBaseline = "middle";
  c.fillStyle = "#7a3f22";
  c.fillText(s.text, s.x, s.y - 5.5);
}

function paintLamps(c: C) {
  const L = LAYOUT.lamps;
  for (let i = 0; i < L.count; i++) {
    const x = L.x0 + i * L.dx;
    shadow(c, x + 3, L.y + 23, 9, 2.4, 0.4);
    const brass = "#e3b04b";
    c.fillStyle = shade(brass, -0.3);
    c.beginPath();
    c.ellipse(x, L.y + 22, 6.5, 2.6, 0, 0, Math.PI * 2);
    c.fill();
    const bg = c.createLinearGradient(x - 6, 0, x + 6, 0);
    bg.addColorStop(0, shade(brass, 0.5));
    bg.addColorStop(0.5, brass);
    bg.addColorStop(1, shade(brass, -0.3));
    c.fillStyle = bg;
    c.beginPath();
    c.ellipse(x, L.y + 21, 6.5, 2.4, 0, 0, Math.PI * 2);
    c.fill();
    capsule(c, [{ x, y: L.y + 20 }, { x, y: L.y + 2 }], 2.8, brass);
    ball(c, x, L.y + 12, 2.6, brass, 0.6);
    c.fillStyle = shade(brass, -0.25);
    c.beginPath();
    c.ellipse(x, L.y + 1, 6, 2.4, 0, 0, Math.PI);
    c.fill();
    c.fillStyle = bg;
    c.beginPath();
    c.ellipse(x, L.y, 6, 2, 0, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = "#6b4a2a";
    c.beginPath();
    c.arc(x, L.y - 0.6, 0.9, 0, Math.PI * 2);
    c.fill();
  }
}

function paintFront(c: C) {
  // Grassy bank → warm sand foreground.
  const gy = LAYOUT.groundY;
  const gg = c.createLinearGradient(0, gy, 0, H);
  gg.addColorStop(0, "#a9dbb0");
  gg.addColorStop(0.35, "#c4e4b0");
  gg.addColorStop(0.7, "#ecdcb0");
  gg.addColorStop(1, "#f3d4b0");
  c.fillStyle = gg;
  c.beginPath();
  c.moveTo(0, gy + 2);
  for (let x = 0; x <= W; x += 32) c.quadraticCurveTo(x + 16, gy - 3, x + 32, gy + 1);
  c.lineTo(W, H);
  c.lineTo(0, H);
  c.closePath();
  c.fill();
  // Bright rim along the water's edge.
  c.strokeStyle = "rgba(255,255,240,0.6)";
  c.lineWidth = 1.4;
  c.beginPath();
  c.moveTo(0, gy + 2);
  for (let x = 0; x <= W; x += 32) c.quadraticCurveTo(x + 16, gy - 3, x + 32, gy + 1);
  c.stroke();
  // Sandy path: a soft raised band.
  const py = LAYOUT.pathY;
  const pg = c.createLinearGradient(0, py - 30, 0, py + 22);
  pg.addColorStop(0, "#e6c7a0");
  pg.addColorStop(0.18, "#f7e2c6");
  pg.addColorStop(1, "#f1d2b0");
  c.fillStyle = pg;
  c.beginPath();
  c.moveTo(0, py - 18);
  c.bezierCurveTo(160, py - 34, 360, py - 16, W, py - 26);
  c.lineTo(W, py + 20);
  c.bezierCurveTo(400, py + 26, 200, py + 16, 0, py + 22);
  c.closePath();
  c.fill();
  // Stepping pebbles.
  const r = (n: number) => hash(n);
  for (let i = 0; i < 14; i++) {
    const x = 20 + i * 45 + r(i) * 20, y = py + 12 + r(i + 40) * 6;
    shadow(c, x + 1, y + 1.5, 7, 2, 0.25);
    c.fillStyle = "#efe4d6";
    c.beginPath();
    c.ellipse(x, y, 5 + r(i + 9) * 3, 2 + r(i + 7), 0, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = "rgba(255,255,255,0.7)";
    c.beginPath();
    c.ellipse(x - 1.5, y - 0.8, 2.5, 0.8, 0, 0, Math.PI * 2);
    c.fill();
  }
  // Grass tufts on the bank.
  for (let i = 0; i < 26; i++) {
    const x = r(i + 100) * W, y = 206 + r(i + 200) * 80;
    if (x > 60 && x < 260 && y < 280) continue;
    c.fillStyle = r(i + 300) > 0.5 ? "#8dcc94" : "#9ed5a0";
    c.beginPath();
    c.ellipse(x, y, 4, 1.6, 0, 0, Math.PI * 2);
    c.fill();
  }

  // Palm behind the sign first, then the set.
  const [pL, pM, pR] = LAYOUT.palms;
  palm(c, pM.x, pM.baseY, pM.h, pM.lean);
  paintShop(c);
  bush(c, 262, 276, 0.9);
  bush(c, 56, 278, 1.1, "#86cc8c");
  bush(c, 392, 270, 0.85, "#7fc490");
  flower(c, 250, 284, "#f9a8c4");
  flower(c, 274, 286, "#fde68a");
  flower(c, 380, 280, "#c4b5fd");
  flower(c, 404, 279, "#f9a8c4");
  paintSign(c);
  paintLamps(c);
  palm(c, pR.x, pR.baseY, pR.h, pR.lean);
  palm(c, pL.x, pL.baseY, pL.h, pL.lean);
  bush(c, 610, 352, 1.3, "#7fc68c");
  bush(c, 14, 354, 1.2, "#86cc8c");
}

function paintOver(c: C) {
  // Warm sunlight falling from the upper left, and a soft studio vignette.
  const lg = c.createLinearGradient(0, 0, W * 0.6, H);
  lg.addColorStop(0, "rgba(255,232,190,0.16)");
  lg.addColorStop(1, "rgba(255,232,190,0)");
  c.fillStyle = lg;
  c.fillRect(0, 0, W, H);
  const v = c.createRadialGradient(W / 2, H * 0.45, H * 0.35, W / 2, H * 0.5, W * 0.62);
  v.addColorStop(0, "rgba(120,70,50,0)");
  v.addColorStop(1, "rgba(120,70,50,0.2)");
  c.fillStyle = v;
  c.fillRect(0, 0, W, H);
}

export function paintCloud(c: C) {
  const puffs: [number, number, number][] = [[22, 26, 12], [38, 18, 15], [56, 22, 13], [70, 28, 9], [44, 30, 11]];
  c.fillStyle = "#fff";
  for (const [x, y, r] of puffs) {
    c.beginPath();
    c.arc(x, y, r, 0, Math.PI * 2);
    c.fill();
  }
  c.globalCompositeOperation = "source-atop";
  const g = c.createLinearGradient(0, 6, 0, 40);
  g.addColorStop(0, "#ffffff");
  g.addColorStop(0.55, "#fdf6f0");
  g.addColorStop(1, "#d9d4ec");
  c.fillStyle = g;
  c.fillRect(0, 0, 90, 44);
  for (const [x, y, r] of puffs) {
    const hg = c.createRadialGradient(x - r * 0.4, y - r * 0.5, 0, x - r * 0.4, y - r * 0.5, r);
    hg.addColorStop(0, "rgba(255,255,255,0.9)");
    hg.addColorStop(1, "rgba(255,255,255,0)");
    c.fillStyle = hg;
    c.fillRect(x - r * 1.4, y - r * 1.5, r * 2, r * 2);
  }
  c.globalCompositeOperation = "source-over";
}

// ── dynamic pieces ───────────────────────────────────────────────────────────

export function canoe(c: C, cx: number, t: number) {
  const f = { t };
  const x = cx, y = 178 + Math.sin(t * 1.8) * 0.8;
  const hull = (cc: C) => {
    cc.beginPath();
    cc.moveTo(x - 26, y - 5);
    cc.quadraticCurveTo(x - 20, y + 6, x, y + 6);
    cc.quadraticCurveTo(x + 20, y + 6, x + 26, y - 5);
    cc.quadraticCurveTo(x, y + 0.5, x - 26, y - 5);
    cc.closePath();
  };
  // Reflection.
  c.save();
  c.globalAlpha = 0.22;
  c.translate(0, 2 * (y + 6));
  c.scale(1, -1);
  hull(c);
  c.fillStyle = "#4b6f80";
  c.fill();
  c.restore();
  // Ripple ring.
  c.strokeStyle = "rgba(255,255,255,0.5)";
  c.lineWidth = 0.8;
  c.beginPath();
  c.ellipse(x, y + 6, 28 + Math.sin(f.t * 2) * 1.5, 2.6, 0, 0, Math.PI * 2);
  c.stroke();
  // Rower: a little clay figure with a paddle.
  const pa = Math.sin(f.t * 2.4);
  capsule(c, [{ x: x + 3, y: y - 12 }, { x: x + 10 + pa * 4, y: y + 6 }], 1.6, "#b27b51");
  ball(c, x, y - 7, 5, "#3fa8a0");
  ball(c, x, y - 16, 4.6, "#8a5a3c");
  c.fillStyle = "#2a1d17";
  c.beginPath();
  c.arc(x - 0.6, y - 17, 4.7, Math.PI * 1.02, Math.PI * 1.98);
  c.fill();
  capsule(c, [{ x: x + 2, y: y - 9 }, { x: x + 6 + pa * 2, y: y - 6 }], 2.4, "#8a5a3c");
  // Hull.
  hull(c);
  const g = c.createLinearGradient(0, y - 5, 0, y + 6);
  g.addColorStop(0, "#d9935e");
  g.addColorStop(1, "#8f5232");
  c.fillStyle = g;
  c.fill();
  c.strokeStyle = "rgba(255,230,200,0.75)";
  c.lineWidth = 1;
  c.beginPath();
  c.moveTo(x - 24, y - 4.3);
  c.quadraticCurveTo(x, y + 0.9, x + 24, y - 4.3);
  c.stroke();
}

function water(c: C, f: SceneFrame) {
  // Glossy moving highlights.
  c.fillStyle = "rgba(255,255,255,0.55)";
  for (let i = 0; i < 12; i++) {
    const sp = 6 + hash(i) * 8;
    const x = ((hash(i + 20) * W + f.t * sp) % (W + 40)) - 20;
    const y = LAYOUT.waterTop + 8 + hash(i + 50) * 34;
    const w = 6 + hash(i + 70) * 12;
    const a = 0.35 + 0.35 * Math.sin(f.t * 1.3 + i);
    c.globalAlpha = a;
    c.beginPath();
    c.ellipse(x, y, w, 0.9, 0, 0, Math.PI * 2);
    c.fill();
  }
  c.globalAlpha = 1;
}

function clouds(c: C, f: SceneFrame) {
  const spr = cloudSprite!;
  const list: [number, number, number][] = [[60, 18, 1.0], [300, 40, 0.8], [470, 12, 1.15], [620, 56, 0.65]];
  for (const [x0, y, s] of list) {
    const x = ((x0 + f.drift * (0.4 + s * 0.3)) % (W + 120)) - 100;
    c.drawImage(spr, x, y, 90 * s, 44 * s);
  }
}

export function steam(c: C, t: number, x: number, y: number, seed: number) {
  c.strokeStyle = "rgba(255,255,255,0.75)";
  c.lineWidth = 1.2;
  c.lineCap = "round";
  for (let k = 0; k < 2; k++) {
    const ph = (t * 0.7 + seed * 0.37 + k * 0.5) % 1;
    c.globalAlpha = Math.sin(ph * Math.PI) * 0.75;
    const yy = y - ph * 10;
    c.beginPath();
    c.moveTo(x + Math.sin((t + k) * 3 + seed) * 1.2, yy);
    c.quadraticCurveTo(x + 2.5 * Math.sin(t * 2 + seed + k), yy - 3, x + Math.sin(t * 2.6 + k) * 1.5, yy - 6);
    c.stroke();
  }
  c.globalAlpha = 1;
}

function flames(c: C, f: SceneFrame) {
  const L = LAYOUT.lamps;
  for (let i = 0; i < L.count; i++) {
    const lit = Math.max(0, Math.min(1, f.lampsLit - i));
    if (lit <= 0) continue;
    const x = L.x0 + i * L.dx, y = L.y - 1;
    const fl = 1 + 0.12 * Math.sin(f.t * 11 + i * 2.1) + 0.06 * Math.sin(f.t * 23 + i);
    const s = (0.4 + 0.6 * lit) * fl;
    c.globalCompositeOperation = "lighter";
    const g = c.createRadialGradient(x, y - 4, 0, x, y - 4, 16 * s);
    g.addColorStop(0, `rgba(255,190,90,${0.5 * lit})`);
    g.addColorStop(1, "rgba(255,170,80,0)");
    c.fillStyle = g;
    c.fillRect(x - 17, y - 21, 34, 34);
    c.globalCompositeOperation = "source-over";
    const fg = c.createRadialGradient(x, y - 2, 0.3, x, y - 4 * s, 6 * s);
    fg.addColorStop(0, "#fffbe0");
    fg.addColorStop(0.45, "#ffd166");
    fg.addColorStop(1, "#ff8a3d");
    c.fillStyle = fg;
    c.globalAlpha = lit;
    c.beginPath();
    c.moveTo(x, y - 10 * s);
    c.bezierCurveTo(x + 3.4 * s, y - 4 * s, x + 3 * s, y, x, y);
    c.bezierCurveTo(x - 3 * s, y, x - 3.4 * s, y - 4 * s, x, y - 10 * s);
    c.fill();
    c.globalAlpha = 1;
  }
}

/** Raghu's squash & stretch (scaleY) from the scene clock: anticipation, stretch in the air, squash on landing, wobble settle. */
export function hopScaleY(t: number): number {
  const hop = ((t % 2.4) + 2.4) % 2.4;
  if (hop < 0.9) {
    const u = (hop / 0.45) % 1;
    const c = 1 - Math.sin(Math.PI * u);
    return 1 + Math.sin(Math.PI * Math.min(1, c * 1.4)) * 0.12 - Math.pow(c, 10) * 0.28;
  }
  if (hop < 1.6) {
    const d = hop - 0.9;
    return 1 - 0.28 * Math.exp(-d * 7) * Math.cos(d * 22);
  }
  if (hop > 2.15) {
    const a = (hop - 2.15) / 0.25;
    return 1 - 0.28 * a * a;
  }
  return 1;
}

function armRaise(t: number): number {
  const hop = ((t % 2.4) + 2.4) % 2.4;
  if (hop < 0.95) return 1;
  if (hop < 1.3) return 1 - (hop - 0.95) / 0.35;
  if (hop > 2.2) return (hop - 2.2) / 0.2;
  return 0;
}

export interface ClayOpts {
  /** Celebrating (arms up while hopping). */
  happy: boolean;
  /** Needs the person: worried brows and a waving free hand. */
  waiting: boolean;
  hair: string;
  /** Hair bun with jasmine (else a moustache). */
  bun: boolean;
  /** Squash & stretch scale Y (1 = none), and 0..1 arm raise for the celebration. */
  sy: number;
  raise: number;
}

/** A big-headed clay villager with capsule limbs, standing on (v.x, v.y). */
export function clayVillager(c: C, v: VillagerFrame, t: number, o: ClayOpts) {
  const s = skeleton(v);
  const fc = v.facing;
  const { happy, waiting } = o;

  // Contact shadow stays on the ground and shrinks as he rises.
  const air = Math.max(0, -s.p.bob) / 26;
  const sy = o.sy;
  const sx = 1 + (1 - sy) * 0.9;
  shadow(c, v.x + 2, v.y + 1, 15 * (1 - air * 0.4) * sx, 3.8 * (1 - air * 0.3), 0.42 * (1 - air * 0.5));

  c.save();
  const pivotY = v.y + s.p.bob;
  c.translate(v.x, pivotY);
  c.scale(sx, sy);
  c.translate(-v.x, -pivotY);

  // Arms: Raghu throws his up while hopping; Ammini waves for attention.
  const lim = (o: P, ang: number, len: number): P => ({ x: o.x + Math.sin(ang) * len * fc, y: o.y + Math.cos(ang) * len });
  const sh: P = { x: s.shoulder.x, y: s.shoulder.y + 1 };
  let elbowB = s.elbowB, handB = s.handB, elbowF = s.elbowF, handF = s.handF;
  if (happy) {
    const k = o.raise;
    // A "hooray" V: elbows out to the sides, hands up beside the head.
    const eF = s.p.armF + (1.85 - s.p.armF) * k, eB = s.p.armB + (-1.85 - s.p.armB) * k;
    elbowF = lim(sh, eF, 10);
    handF = lim(elbowF, eF + 0.6 * k, 9);
    elbowB = lim(sh, eB, 10);
    handB = lim(elbowB, eB - 0.6 * k, 9);
  } else if (waiting) {
    const a = -2.5 + Math.sin(t * 7) * 0.25;
    elbowB = lim(sh, -1.9, 10);
    handB = lim(elbowB, a, 9);
  }

  const skin = v.skin;
  // Back arm and back leg (in shade).
  capsule(c, [sh, elbowB], 5, shade(v.shirt, -0.12));
  capsule(c, [elbowB, handB], 4, shade(skin, -0.12));
  ball(c, handB.x, handB.y, 2.6, shade(skin, -0.1));
  const hipB = { x: s.hip.x - fc * 1.5, y: s.hip.y };
  capsule(c, [hipB, s.kneeB, s.footB], 5.4, shade(skin, -0.15));
  ball(c, s.footB.x + fc * 2, s.footB.y - 0.5, 3.2, "#7a4a33", 0.4);
  // Front leg.
  const hipF = { x: s.hip.x + fc * 1.5, y: s.hip.y };
  capsule(c, [hipF, s.kneeF, s.footF], 5.6, skin);
  ball(c, s.footF.x + fc * 2, s.footF.y - 0.5, 3.3, "#8a5639", 0.4);

  // Mundu: a soft wrapped cloth to the knees, with a gold kasavu border.
  const ky = Math.max(s.kneeF.y, s.kneeB.y) + 3;
  const kl = Math.min(s.kneeF.x, s.kneeB.x, s.hip.x) - 5.5, kr = Math.max(s.kneeF.x, s.kneeB.x, s.hip.x) + 5.5;
  const mg = c.createLinearGradient(s.hip.x - 9, s.hip.y - 3, s.hip.x + 7, ky + 2);
  mg.addColorStop(0, shade(v.mundu, 0.4));
  mg.addColorStop(0.5, v.mundu);
  mg.addColorStop(1, shade(v.mundu, -0.22));
  c.fillStyle = mg;
  c.beginPath();
  c.moveTo(s.hip.x - 8, s.hip.y - 4);
  c.lineTo(s.hip.x + 8, s.hip.y - 4);
  c.quadraticCurveTo(kr + 1, (s.hip.y + ky) / 2, kr, ky - 2);
  c.quadraticCurveTo((kl + kr) / 2, ky + 3, kl, ky - 2);
  c.quadraticCurveTo(kl - 1, (s.hip.y + ky) / 2, s.hip.x - 8, s.hip.y - 4);
  c.fill();
  c.strokeStyle = "#e0ab45";
  c.lineWidth = 1.6;
  c.beginPath();
  c.moveTo(kr - 0.5, ky - 2.5);
  c.quadraticCurveTo((kl + kr) / 2, ky + 2.2, kl + 0.5, ky - 2.5);
  c.stroke();

  // Torso: a rounded, shaded shirt volume.
  const tx = (s.neck.x + s.hip.x) / 2, top = s.neck.y - 1, bot = s.hip.y + 1;
  const tg = c.createRadialGradient(tx - 4, top + 5, 1, tx, (top + bot) / 2, 17);
  tg.addColorStop(0, shade(v.shirt, 0.45));
  tg.addColorStop(0.5, v.shirt);
  tg.addColorStop(1, shade(v.shirt, -0.28));
  c.fillStyle = tg;
  rrect(c, tx - 8.5, top, 17, bot - top, 7.5);
  c.fill();

  // Neck and big round head.
  const hc = { x: s.head.x + fc * 0.5, y: s.neck.y - 10.5 };
  capsule(c, [{ x: s.neck.x, y: s.neck.y + 1 }, { x: hc.x, y: hc.y + 6 }], 5, shade(skin, -0.1));
  if (o.bun) {
    ball(c, hc.x - fc * 11, hc.y - 3, 5.2, o.hair, 0.35);
    for (let i = 0; i < 4; i++) ball(c, hc.x - fc * (11 + Math.cos(i * 1.4) * 5.5), hc.y - 3 + Math.sin(i * 1.4) * 5.5, 1.3, "#fffaf0", 0.2, -0.15);
  }
  ball(c, hc.x - fc * 3.5, hc.y + 1.5, 2.8, skin);
  ball(c, hc.x, hc.y, 12, skin, 0.42, -0.3);
  // Hair cap, clipped to the head.
  c.save();
  c.beginPath();
  c.arc(hc.x, hc.y, 12.2, 0, Math.PI * 2);
  c.clip();
  const hg = c.createRadialGradient(hc.x - 4, hc.y - 10, 0.5, hc.x, hc.y - 5, 14);
  hg.addColorStop(0, shade(o.hair, 0.28));
  hg.addColorStop(0.5, o.hair);
  hg.addColorStop(1, shade(o.hair, -0.35));
  c.fillStyle = hg;
  c.beginPath();
  c.ellipse(hc.x - fc * 4, hc.y - 8.5, 15, 9.5, fc * 0.25, 0, Math.PI * 2);
  c.fill();
  c.restore();
  // Face: dot eyes, blush, small mouth.
  const ex = hc.x + fc * 5, ey = hc.y + 1.5 + (v.carry === "laptop" ? 1 : 0);
  c.fillStyle = "#2a1d17";
  c.strokeStyle = "#2a1d17";
  c.lineWidth = 1.3;
  c.lineCap = "round";
  if (happy && (sy !== 1 || o.raise > 0)) {
    for (const d of [-3, 3.2]) {
      c.beginPath();
      c.arc(ex + d, ey + 0.8, 1.6, Math.PI * 1.1, Math.PI * 1.9);
      c.stroke();
    }
  } else {
    for (const d of [-3, 3.2]) {
      c.beginPath();
      c.arc(ex + d, ey, 1.55, 0, Math.PI * 2);
      c.fill();
    }
    c.fillStyle = "#fff";
    for (const d of [-3, 3.2]) {
      c.beginPath();
      c.arc(ex + d - 0.5, ey - 0.6, 0.5, 0, Math.PI * 2);
      c.fill();
    }
  }
  if (waiting) {
    c.lineWidth = 0.9;
    for (const d of [-3, 3.2]) {
      c.beginPath();
      c.moveTo(ex + d - 1.6, ey - 3.2 + (d > 0 ? 0.6 : 0) * fc);
      c.lineTo(ex + d + 1.6, ey - 3.2 - (d > 0 ? 0.6 : 0) * fc);
      c.stroke();
    }
  }
  c.fillStyle = "rgba(255,120,120,0.35)";
  c.beginPath();
  c.ellipse(hc.x + fc * 9, hc.y + 5, 2.4, 1.5, 0, 0, Math.PI * 2);
  c.fill();
  c.beginPath();
  c.ellipse(hc.x + fc * 1.5, hc.y + 5.2, 2.2, 1.4, 0, 0, Math.PI * 2);
  c.fill();
  if (!o.bun) {
    c.fillStyle = "#2a1d17";
    rrect(c, ex - 3, ey + 3.4, 6.2, 1.8, 0.9);
    c.fill();
  }
  c.fillStyle = "#7a2f2a";
  c.strokeStyle = "#5a2a22";
  c.lineWidth = 0.9;
  c.beginPath();
  if (happy) {
    c.arc(ex, ey + 6, 2.3, 0, Math.PI);
    c.fill();
  } else if (waiting) {
    c.arc(ex, ey + 6.4, 1.1, 0, Math.PI * 2);
    c.fill();
  } else {
    c.arc(ex, ey + 5.2, 1.6, Math.PI * 0.15, Math.PI * 0.85);
    c.stroke();
  }

  // Front arm and what they carry.
  if (v.carry === "laptop") {
    const hx = handF.x, hy = handF.y;
    // Laptop base slab.
    c.fillStyle = "#9aa3b3";
    rrect(c, hx - 11, hy - 1, 22, 3.6, 1.8);
    c.fill();
    softBox(c, hx - 11, hy - 2, 22, 3, 1.5, "#dfe4ec", 0.4, -0.1);
    // Lid, back facing the camera, softly glowing at the edge.
    const lg = c.createLinearGradient(hx, hy - 16, hx + fc * 12, hy);
    lg.addColorStop(0, "#f2f5fa");
    lg.addColorStop(1, "#b9c2d0");
    c.fillStyle = lg;
    c.beginPath();
    c.moveTo(hx - fc * 3, hy - 2);
    c.lineTo(hx + fc * 11, hy - 2);
    c.lineTo(hx + fc * 13, hy - 16);
    c.lineTo(hx + fc * 0, hy - 16);
    c.closePath();
    c.fill();
    c.strokeStyle = "rgba(94,234,212,0.9)";
    c.lineWidth = 1;
    c.beginPath();
    c.moveTo(hx - fc * 3, hy - 2);
    c.lineTo(hx, hy - 16);
    c.stroke();
    ball(c, hx + fc * 6, hy - 9, 1.6, "#cfd6e0", 0.6, -0.1);
    // Screen light on his face.
    c.globalCompositeOperation = "lighter";
    const gl = c.createRadialGradient(hc.x + fc * 9, hc.y + 3, 0, hc.x + fc * 9, hc.y + 3, 12);
    gl.addColorStop(0, `rgba(94,234,212,${0.18 + 0.05 * Math.sin(t * 5)})`);
    gl.addColorStop(1, "rgba(94,234,212,0)");
    c.fillStyle = gl;
    c.fillRect(hc.x - 6, hc.y - 12, 30, 30);
    c.globalCompositeOperation = "source-over";
    capsule(c, [sh, elbowF], 5, v.shirt);
    capsule(c, [elbowF, handF], 4.2, skin);
    ball(c, hx, hy + 0.5, 2.7, skin);
  } else if (v.carry === "glass") {
    capsule(c, [sh, elbowF], 5, v.shirt);
    capsule(c, [elbowF, handF], 4.2, skin);
    tumbler(c, handF.x + fc * 1, handF.y + 1, 1.1);
    steam(c, t, handF.x + fc * 1, handF.y - 9, 4);
    ball(c, handF.x, handF.y - 1, 2.8, skin);
  } else {
    capsule(c, [sh, elbowF], 5, v.shirt);
    capsule(c, [elbowF, handF], 4.2, skin);
    ball(c, handF.x, handF.y, 2.8, skin);
  }
  c.restore();
}

function confetti(c: C, v: VillagerFrame, f: SceneFrame) {
  const hop = ((f.t % 2.4) + 2.4) % 2.4;
  if (hop > 1.5) return;
  const cols = ["#f9a8c4", "#fde68a", "#a7e3c8", "#c4b5fd", "#fdba74"];
  for (let i = 0; i < 12; i++) {
    const a = -Math.PI / 2 + (hash(i + 3) - 0.5) * 2.4;
    const sp = 40 + hash(i + 9) * 40;
    const t = hop;
    const x = v.x + Math.cos(a) * sp * t;
    const y = v.y - 66 + Math.sin(a) * sp * t + 70 * t * t;
    c.globalAlpha = Math.max(0, 1 - t / 1.5);
    ball(c, x, y, 1.8, cols[i % cols.length], 0.6, -0.2);
  }
  c.globalAlpha = 1;
}

const BADGE = {
  working: { base: "#c6f0e5", ink: "#1f5b52", sub: "#2f7468" },
  waiting: { base: "#ff7566", ink: "#ffffff", sub: "#fff1ee" },
  finished: { base: "#dcf5b0", ink: "#3d5a14", sub: "#4d6b1f" },
} as const;

export interface BadgeSpec {
  /** Pointer x and the badge's top y. */
  cx: number;
  top: number;
  name: string;
  label: string;
  /** Optional text at the right of the name row (e.g. "42%"). */
  right?: string;
  /** Optional 0..1 progress bar row. */
  progress?: number;
  base: string;
  ink: string;
  sub: string;
  dot: string;
  urgent: boolean;
  pulse: number;
  t: number;
  /** Keep the badge inside [minX, maxX]. */
  minX: number;
  maxX: number;
}

export function badgeHeight(hasProgress: boolean) {
  return hasProgress ? 32 : 26;
}

/** A soft, glossy 3D badge with a pointer under it; urgent ones pulse and get a "!" bubble. */
export function clayBadge(c: C, b: BadgeSpec) {
  const work = b.progress !== undefined;
  c.font = `800 8.5px ${FONT}`;
  const nameW = c.measureText(b.name).width + (b.right ? c.measureText(b.right).width + 8 : 0);
  c.font = `600 7.6px ${FONT}`;
  const labW = c.measureText(b.label).width;
  const w = Math.max(nameW + 12, labW) + 16;
  const h = badgeHeight(work);
  let x = b.cx - w / 2;
  x = Math.max(b.minX, Math.min(b.maxX - w, x));
  const y = b.top;
  const a = { x: b.cx, y: y + h + 2 };

  c.save();
  if (b.urgent) {
    const k = 1 + 0.05 * b.pulse;
    c.translate(a.x, a.y + 4);
    c.scale(k, k);
    c.translate(-a.x, -(a.y + 4));
    const e = 2 + 5 * b.pulse;
    c.strokeStyle = `rgba(255,90,79,${0.55 * (1 - b.pulse) + 0.1})`;
    c.lineWidth = 2;
    rrect(c, x - e, y - e, w + e * 2, h + e * 2, h / 2 + e);
    c.stroke();
  }
  shadow(c, x + w / 2 + 2, y + h + 4, w * 0.5, 3.5, 0.3);
  c.fillStyle = shade(b.base, -0.28);
  rrect(c, x, y + 2.2, w, h, 9);
  c.fill();
  c.fillStyle = shade(b.base, -0.05);
  c.beginPath();
  c.moveTo(a.x - 5, y + h - 1);
  c.quadraticCurveTo(a.x, y + h + 8, a.x + 5, y + h - 1);
  c.fill();
  softBox(c, x, y, w, h, 9, b.base, 0.35, -0.08);
  const gg = c.createLinearGradient(0, y, 0, y + h * 0.5);
  gg.addColorStop(0, "rgba(255,255,255,0.65)");
  gg.addColorStop(1, "rgba(255,255,255,0)");
  c.fillStyle = gg;
  rrect(c, x + 3, y + 1.5, w - 6, h * 0.42, 6);
  c.fill();
  ball(c, x + 10, y + 9, 3, b.dot, 0.5, -0.25);
  c.textBaseline = "middle";
  c.textAlign = "left";
  c.font = `800 8.5px ${FONT}`;
  c.fillStyle = b.ink;
  c.fillText(b.name, x + 16, y + 9.3);
  if (b.right) {
    c.textAlign = "right";
    c.font = `700 7.4px ${FONT}`;
    c.fillStyle = b.sub;
    c.fillText(b.right, x + w - 8, y + 9.3);
  }
  c.textAlign = "left";
  c.font = `600 7.6px ${FONT}`;
  c.fillStyle = b.sub;
  c.fillText(b.label, x + 8, y + 19);
  if (work) {
    const bx = x + 8, by = y + 24.5, bw = w - 16;
    c.fillStyle = "rgba(31,91,82,0.16)";
    rrect(c, bx, by, bw, 4, 2);
    c.fill();
    const pw = Math.max(4, bw * b.progress!);
    const pg = c.createLinearGradient(0, by, 0, by + 4);
    pg.addColorStop(0, "#8ff3df");
    pg.addColorStop(1, "#2bb39c");
    c.fillStyle = pg;
    rrect(c, bx, by, pw, 4, 2);
    c.fill();
  }
  if (b.urgent) {
    const bob = -Math.abs(Math.sin(b.t * Math.PI * 1.2)) * 3;
    const bx = x + w - 2, by = y - 1 + bob;
    ball(c, bx, by, 6.5, "#ff4d3f", 0.5, -0.25);
    c.font = `900 9px ${FONT}`;
    c.textAlign = "center";
    c.fillStyle = "#fff";
    c.fillText("!", bx, by + 0.5);
  }
  c.restore();
}

function badge(c: C, v: VillagerFrame, f: SceneFrame) {
  const a = labelAnchor(v);
  const st = BADGE[v.status];
  const work = v.status === "working";
  clayBadge(c, {
    cx: a.x, top: a.y - badgeHeight(work) - 2, name: v.name, label: v.label,
    right: work ? `${Math.round(f.progress * 100)}%` : undefined, progress: work ? f.progress : undefined,
    base: st.base, ink: st.ink, sub: st.sub, dot: v.status === "waiting" ? "#ffffff" : STATUS_COLOR[v.status],
    urgent: v.status === "waiting", pulse: f.pulse, t: f.t, minX: 4, maxX: W - 4,
  });
}

function progressTrack(c: C, f: SceneFrame) {
  const x = 20, y = 352, w = W - 40;
  c.fillStyle = "rgba(150,100,70,0.22)";
  rrect(c, x, y, w, 5, 2.5);
  c.fill();
  const pg = c.createLinearGradient(0, y, 0, y + 5);
  pg.addColorStop(0, "#9af5e2");
  pg.addColorStop(1, "#2bb39c");
  c.fillStyle = pg;
  rrect(c, x, y, Math.max(5, w * f.progress), 5, 2.5);
  c.fill();
  ball(c, x + Math.max(5, w * f.progress) - 2.5, y + 2.5, 3.6, "#5eead4", 0.6, -0.2);
}

export const explainer3d: StyleProto = {
  id: "explainer-3d",
  n: 10,
  name: "Explainer 3D",
  blurb: "Soft clay-toy 3D under warm studio light: rounded gradient-shaded volumes, big-headed villagers with capsule limbs and dot eyes, soft contact shadows, bouncy squash-and-stretch hops and glossy 3D badges.",
  bg: "#f3e6d6",
  draw(ctx, f) {
    if (!backLayer) {
      backLayer = layer(W, H, paintBack);
      frontLayer = layer(W, H, paintFront);
      overLayer = layer(W, H, paintOver);
      cloudSprite = layer(90, 44, paintCloud);
    }
    ctx.drawImage(backLayer, 0, 0, W, H);
    clouds(ctx, f);
    water(ctx, f);
    canoe(ctx, f.canoeX, f.t);
    ctx.drawImage(frontLayer!, 0, 0, W, H);

    // Steam from the glasses on the counter.
    for (let i = 0; i < 3; i++) steam(ctx, f.t, 92 + i * 13, 236, i);
    flames(ctx, f);

    // Villagers back to front, then confetti and badges on top.
    const vs = [...f.villagers].sort((a, b) => a.y - b.y);
    for (const v of vs) {
      const happy = v.status === "finished";
      clayVillager(ctx, v, f.t, { happy, waiting: v.status === "waiting", hair: "#2a1d17", bun: v.id === "b", sy: happy ? hopScaleY(f.t) : 1, raise: happy ? armRaise(f.t) : 0 });
    }
    for (const v of vs) if (v.status === "finished") confetti(ctx, v, f);
    progressTrack(ctx, f);
    ctx.drawImage(overLayer!, 0, 0, W, H);
    for (const v of vs) badge(ctx, v, f);
  },
};
