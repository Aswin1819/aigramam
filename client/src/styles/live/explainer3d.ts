/**
 * Explainer 3D, live village version: the soft clay-toy look of the
 * prototype (protos/explainer3d.ts) drawing the real village. Scenery is
 * cached: a 640-wide sky/water tile and a ground tile repeated across the
 * view, one sprite per palm, one per place's building (keyed by name and
 * variant). Villagers, badges, flames, canoe and steam are drawn per frame.
 */
import { hash } from "../scene";
import {
  FONT, ball, badgeHeight, bush, canoe, capsule, clayBadge, clayVillager, flower, paintCloud, palm, rrect, shade, shadow, softBox, steam, tumbler,
} from "../protos/explainer3d";
import { asVillagerFrame } from "./reference";
import {
  COMP_MAX, TILE, blit, drawBengaluruScene, drawCompanionFigure, drawCompanionLabels, drawCompanionMore, drawCompanionOverlay, drawCompanionTether,
  fitText, makeSprite, type Box, type Sprite,
} from "./explainer3dKit";
import { GROUND, WORLD_H, type LiveFrame, type LivePlace, type LiveStatus, type LiveCompanion, type LiveStyle, type LiveVillager, type ViewRect } from "./types";

type C = CanvasRenderingContext2D;

// ── tiles ────────────────────────────────────────────────────────────────────

let skyTile: Sprite | null = null;
let groundTile: Sprite | null = null;
let cloudSprite: Sprite | null = null;
let farPalmSprite: Sprite | null = null;

function paintSkyTile(c: C) {
  const wt = GROUND.waterTop, wb = GROUND.waterBottom;
  const sky = c.createLinearGradient(0, 0, 0, wt);
  sky.addColorStop(0, "#8fc9e6");
  sky.addColorStop(0.55, "#c7e5ee");
  sky.addColorStop(1, "#fbe7d2");
  c.fillStyle = sky;
  c.fillRect(0, 0, TILE, wt + 2);
  // Hills, wrapped so the tile repeats seamlessly; slightly blurred (depth of field).
  c.filter = "blur(1.2px)";
  const hill = (pts: [number, number, number][], col: string) => {
    for (const [x0, r, k] of pts) for (const x of [x0 - TILE, x0, x0 + TILE]) {
      const g = c.createRadialGradient(x - r * 0.3, wt - r * k - r * 0.3, 2, x, wt, r * 1.2);
      g.addColorStop(0, shade(col, 0.3));
      g.addColorStop(1, col);
      c.fillStyle = g;
      c.beginPath();
      c.ellipse(x, wt + 2, r, r * k, 0, Math.PI, 0);
      c.fill();
    }
  };
  hill([[60, 90, 0.32], [230, 120, 0.26], [420, 110, 0.3], [600, 100, 0.34]], "#b9d9d6");
  hill([[140, 70, 0.3], [330, 80, 0.24], [510, 75, 0.28]], "#9fd0b5");
  c.filter = "none";
  const wg = c.createLinearGradient(0, wt, 0, wb);
  wg.addColorStop(0, "#bfe4ec");
  wg.addColorStop(0.35, "#8ccde0");
  wg.addColorStop(1, "#5fb3d2");
  c.fillStyle = wg;
  c.fillRect(0, wt, TILE, wb - wt + 8);
  const rg = c.createLinearGradient(0, wt, 0, wt + 12);
  rg.addColorStop(0, "rgba(120,190,160,0.45)");
  rg.addColorStop(1, "rgba(120,190,160,0)");
  c.fillStyle = rg;
  c.fillRect(0, wt, TILE, 12);
}

const pathTopY = (x: number) => GROUND.pathTop - 4 + 4 * Math.sin((x / TILE) * Math.PI * 4) + 2 * Math.sin((x / TILE) * Math.PI * 6);
const pathBotY = (x: number) => GROUND.pathBottom + 8 + 3 * Math.sin((x / TILE) * Math.PI * 2 + 1);

function paintGroundTile(c: C) {
  const gy = GROUND.groundY;
  const gg = c.createLinearGradient(0, gy, 0, WORLD_H);
  gg.addColorStop(0, "#a9dbb0");
  gg.addColorStop(0.35, "#c4e4b0");
  gg.addColorStop(0.7, "#ecdcb0");
  gg.addColorStop(1, "#f3d4b0");
  const bank = () => {
    c.beginPath();
    c.moveTo(0, gy + 2);
    for (let x = 0; x < TILE; x += 32) c.quadraticCurveTo(x + 16, gy - 3, x + 32, gy + 1);
  };
  c.fillStyle = gg;
  bank();
  c.lineTo(TILE, WORLD_H + 2);
  c.lineTo(0, WORLD_H + 2);
  c.closePath();
  c.fill();
  c.strokeStyle = "rgba(255,255,240,0.6)";
  c.lineWidth = 1.4;
  bank();
  c.stroke();
  // Sandy path band (periodic edges).
  const pg = c.createLinearGradient(0, GROUND.pathTop - 8, 0, GROUND.pathBottom + 10);
  pg.addColorStop(0, "#e6c7a0");
  pg.addColorStop(0.15, "#f7e2c6");
  pg.addColorStop(1, "#f1d2b0");
  c.fillStyle = pg;
  c.beginPath();
  c.moveTo(0, pathTopY(0));
  for (let x = 8; x <= TILE; x += 8) c.lineTo(x, pathTopY(x));
  for (let x = TILE; x >= 0; x -= 8) c.lineTo(x, pathBotY(x));
  c.closePath();
  c.fill();
  for (let i = 0; i < 14; i++) {
    const x = 20 + i * 45 + hash(i) * 14, y = pathBotY(x) - 6 + hash(i + 40) * 4;
    shadow(c, x + 1, y + 1.5, 7, 2, 0.25);
    c.fillStyle = "#efe4d6";
    c.beginPath();
    c.ellipse(x, y, 5 + hash(i + 9) * 3, 2 + hash(i + 7), 0, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = "rgba(255,255,255,0.7)";
    c.beginPath();
    c.ellipse(x - 1.5, y - 0.8, 2.5, 0.8, 0, 0, Math.PI * 2);
    c.fill();
  }
  for (let i = 0; i < 30; i++) {
    const x = 6 + hash(i + 100) * (TILE - 12), y = 206 + hash(i + 200) * 70;
    c.fillStyle = hash(i + 300) > 0.5 ? "#8dcc94" : "#9ed5a0";
    c.beginPath();
    c.ellipse(x, y, 4, 1.6, 0, 0, Math.PI * 2);
    c.fill();
  }
}

function paintFarPalm(c: C) {
  const x = 20, b = 40;
  capsule(c, [{ x, y: b }, { x: x + 2, y: b - 18 }, { x: x + 3, y: b - 30 }], 2.4, "#a98f73");
  for (let i = 0; i < 5; i++) {
    const a = Math.PI + (i / 4) * Math.PI;
    c.fillStyle = i % 2 ? "#7fc39b" : "#8fcfa6";
    c.beginPath();
    c.ellipse(x + 3 + Math.cos(a) * 7, b - 30 + Math.sin(a) * 3 + 3, 7.5, 3.2, a + Math.PI, 0, Math.PI * 2);
    c.fill();
  }
  ball(c, x + 3, b - 31, 3, "#7fc39b");
}

// ── per-place and per-palm sprites ───────────────────────────────────────────

const palmCache = new Map<string, Sprite>();
function palmSprite(p: LiveFrame["palms"][number]): Sprite {
  const key = `${p.x}|${p.baseY}|${p.h.toFixed(1)}|${p.lean.toFixed(3)}`;
  let s = palmCache.get(key);
  if (!s) {
    const topX = p.x + p.lean * p.h, L = p.h * 0.38;
    const x0 = Math.min(p.x, topX) - L - 24, x1 = Math.max(p.x, topX) + L + 24;
    const y0 = p.baseY - p.h - L * 0.8, y1 = p.baseY + 8;
    s = makeSprite(x0, y0, x1 - x0, y1 - y0, (c) => palm(c, p.x, p.baseY, p.h, p.lean), 2.5);
    if (palmCache.size > 80) palmCache.clear();
    palmCache.set(key, s);
  }
  return s;
}

const PALETTES = [
  { roof: ["#f6b089", "#e48b63", "#b9603f"], ridge: "#c96a46", wall: "#f8dcc0", board: "#8fd8c4", boardInk: "#2e5d55", door: "#c07c52", plinth: "#dc8f6c" },
  { roof: ["#b7d8f2", "#86b6e0", "#5b8fc0"], ridge: "#6f9fcf", wall: "#fbe9c8", board: "#fbc4a8", boardInk: "#7a3a22", door: "#a87a5a", plinth: "#d9a27a" },
  { roof: ["#b9e8c6", "#82cc9a", "#55a874"], ridge: "#66b583", wall: "#fde4dc", board: "#fde68a", boardInk: "#6b4a10", door: "#c48a5c", plinth: "#e3a184" },
  { roof: ["#e2cdf6", "#bea0e6", "#9474c4"], ridge: "#a688d6", wall: "#f9e7cf", board: "#bfe9f7", boardInk: "#1f4e66", door: "#b9774f", plinth: "#d8977a" },
] as const;

function paintBuilding(c: C, p: LivePlace) {
  const b = p.building;
  const pal = PALETTES[p.variant % 4]!;
  const L = b.x, R = b.x + b.w, base = b.baseY, top = base - b.wallH;
  shadow(c, (L + R) / 2 + 6, base + 2, b.w * 0.62, 9, 0.38);
  bush(c, L - 14, base + 6, 1.0, "#86cc8c");
  // Side wall for depth.
  const sg = c.createLinearGradient(R, 0, R + 12, 0);
  sg.addColorStop(0, shade(pal.wall, -0.12));
  sg.addColorStop(1, shade(pal.wall, -0.2));
  c.fillStyle = sg;
  c.beginPath();
  c.moveTo(R - 2, top + 6);
  c.lineTo(R + 12, top);
  c.lineTo(R + 12, base - 7);
  c.lineTo(R - 2, base);
  c.closePath();
  c.fill();
  softBox(c, L, top + 2, b.w, b.wallH - 2, 5, pal.wall, 0.3, -0.08);
  const ao = c.createLinearGradient(0, top + 4, 0, top + 18);
  ao.addColorStop(0, "rgba(140,70,40,0.32)");
  ao.addColorStop(1, "rgba(140,70,40,0)");
  c.fillStyle = ao;
  c.fillRect(L, top + 4, b.w + 12, 14);
  softBox(c, L - 4, base - 8, b.w + 8, 10, 4, pal.plinth);

  // Counter opening with jars, slab, urn and glasses (left of the door).
  const oL = L + 8, oR = b.doorX - 20, oT = top + 30, oB = top + 50;
  const op = c.createLinearGradient(0, oT, 0, oB);
  op.addColorStop(0, "#5a3326");
  op.addColorStop(1, "#8a5640");
  c.fillStyle = op;
  rrect(c, oL, oT, oR - oL, oB - oT, 6);
  c.fill();
  const jars = ["#f9a8c4", "#a7e3c8", "#fde68a"];
  jars.forEach((col, i) => {
    const jx = oL + 10 + i * 12;
    c.fillStyle = "rgba(255,255,255,0.35)";
    rrect(c, jx - 4, oT + 4, 8, 10, 3);
    c.fill();
    ball(c, jx, oT + 10, 3, col);
    softBox(c, jx - 3, oT + 2.5, 6, 2.5, 1.2, "#e9c08c");
  });
  softBox(c, oL - 2, oB + 5, oR - oL + 4, 12, 3, shade(pal.wall, -0.06), 0.2, -0.15);
  softBox(c, oL - 5, oB - 2, oR - oL + 10, 7, 3.5, "#c98a5c", 0.35, -0.2);
  const ux = oR - 9;
  shadow(c, ux, oB - 1, 8, 2, 0.35);
  ball(c, ux, oB - 8, 7, "#e7b54e", 0.6, -0.3);
  softBox(c, ux - 5, oB - 17, 10, 4, 2, "#d9a23f");
  ball(c, ux, oB - 18, 2, "#f0c869");
  for (let i = 0; i < 2; i++) tumbler(c, oL + 12 + i * 12, oB - 1.5, 0.9);

  // Door.
  const dx = b.doorX;
  c.fillStyle = "rgba(120,60,30,0.25)";
  rrect(c, dx - 13.5, top + 24.5, 27, b.wallH - 24, 11);
  c.fill();
  softBox(c, dx - 12, top + 26, 24, b.wallH - 26, 10, pal.door, 0.3, -0.2);
  const panel = shade(pal.door, -0.1);
  softBox(c, dx - 8, top + 32, 7, 16, 3, panel, -0.05, -0.2);
  softBox(c, dx + 1, top + 32, 7, 16, 3, panel, -0.05, -0.2);
  softBox(c, dx - 8, top + 52, 16, 16, 3, panel, -0.05, -0.2);
  ball(c, dx + 7.5, top + 51, 1.6, "#f0c869");
  softBox(c, dx - 18, base - 4, 36, 7, 3.5, shade(pal.plinth, 0.3));

  // Round-cornered window with a flower box (right of the door).
  const wL = dx + 18, wR = R - 6;
  if (wR - wL > 18) {
    softBox(c, wL, top + 28, wR - wL, 26, 9, "#fff4e6", 0.2, -0.1);
    const gl = c.createLinearGradient(wL + 4, top + 32, wR - 4, top + 50);
    gl.addColorStop(0, "#d8f1f6");
    gl.addColorStop(0.5, "#9fd4e6");
    gl.addColorStop(1, "#7cbcd6");
    c.fillStyle = gl;
    rrect(c, wL + 4, top + 32, wR - wL - 8, 18, 6);
    c.fill();
    c.strokeStyle = "rgba(255,255,255,0.75)";
    c.lineWidth = 2;
    c.lineCap = "round";
    c.beginPath();
    c.moveTo(wL + 9, top + 46);
    c.lineTo(wL + 16, top + 35);
    c.stroke();
    const cols = ["#f9a8c4", "#fde68a", "#c4b5fd", "#f9a8c4"];
    for (let i = 0, n = Math.floor((wR - wL) / 9); i < n; i++) ball(c, wL + 5 + i * 9, top + 55, 3, cols[(i + p.variant) % 4]!, 0.55, -0.2);
    softBox(c, wL - 1, top + 56, wR - wL + 2, 7, 3.5, pal.plinth);
  }

  // Roof of rounded barrel tiles.
  const rt = top - b.roofH, rb = top + 8;
  const l0 = L - 16, r0 = R + 16, l1 = L + 24, r1 = R - 24;
  c.save();
  c.beginPath();
  c.moveTo(l1 - 2, rt);
  c.lineTo(r1 + 2, rt);
  c.lineTo(r0, rb);
  c.lineTo(l0, rb);
  c.closePath();
  c.fillStyle = pal.roof[2];
  c.fill();
  c.clip();
  const rows = 6;
  for (let r = 0; r < rows; r++) {
    const y0 = rt - 2 + (r * (rb - rt)) / rows;
    const k = (y0 - rt) / (rb - rt);
    const xl = l1 + (l0 - l1) * k - 6, xr = r1 + (r0 - r1) * k + 6;
    for (let x = xl + (r % 2) * 4.5; x < xr; x += 9) {
      const g = c.createLinearGradient(x, 0, x + 9, 0);
      g.addColorStop(0, pal.roof[0]);
      g.addColorStop(0.45, pal.roof[1]);
      g.addColorStop(1, pal.roof[2]);
      c.fillStyle = g;
      rrect(c, x, y0, 8.6, 10.5, 4.3);
      c.fill();
    }
  }
  c.restore();
  capsule(c, [{ x: l1 - 2, y: rt }, { x: r1 + 2, y: rt }], 6, pal.ridge);
  ball(c, l1 - 3, rt, 4.2, shade(pal.ridge, 0.1));
  ball(c, r1 + 3, rt, 4.2, shade(pal.ridge, 0.1));
  softBox(c, l0 - 2, rb - 1, r0 - l0 + 4, 6, 3, shade(pal.roof[2], -0.12), 0.25, -0.2);

  // Name board with the project name, mounted on the roof (stays visible above the villagers' badges).
  c.font = `800 9px ${FONT}`;
  const name = fitText(c, p.name, b.w - 30);
  const bw = Math.max(54, c.measureText(name).width + 20);
  const bx = (L + R) / 2 - bw / 2, by = rt + b.roofH * 0.3;
  shadow(c, (L + R) / 2 + 2, by + 17, bw / 2, 2.5, 0.35);
  c.fillStyle = shade(pal.board, -0.25);
  rrect(c, bx, by + 1.8, bw, 15, 7.5);
  c.fill();
  softBox(c, bx, by, bw, 15, 7.5, pal.board, 0.4, -0.12);
  c.textAlign = "center";
  c.textBaseline = "middle";
  c.fillStyle = pal.boardInk;
  c.fillText(name, (L + R) / 2, by + 7.9);

  flower(c, R + 18, base + 4, "#f9a8c4");
  flower(c, R + 24, base + 6, "#fde68a");
}

const placeCache = new Map<string, Sprite>();
function placeSprite(p: LivePlace): Sprite {
  const b = p.building;
  const key = `${p.id}|${p.name}|${p.variant}|${b.x}|${b.w}|${b.baseY}|${b.wallH}|${b.roofH}|${b.doorX}`;
  let s = placeCache.get(key);
  if (!s) {
    const x0 = b.x - 40, y0 = b.baseY - b.wallH - b.roofH - 12;
    s = makeSprite(x0, y0, b.w + 80, b.baseY + 24 - y0, (c) => paintBuilding(c, p));
    if (placeCache.size > 40) placeCache.clear();
    placeCache.set(key, s);
  }
  return s;
}

// ── dynamic bits ─────────────────────────────────────────────────────────────

function drawSign(c: C, s: LiveFrame["sign"]) {
  shadow(c, s.x + 4, s.y + 41, 12, 3, 0.35);
  capsule(c, [{ x: s.x, y: s.y + 40 }, { x: s.x, y: s.y }], 4.5, "#b27b51");
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

function drawLamps(c: C, f: LiveFrame) {
  const L = f.lamps;
  for (let i = 0; i < L.count; i++) {
    const x = L.x0 + i * L.dx;
    const brass = "#e3b04b";
    shadow(c, x + 3, L.y + 23, 9, 2.4, 0.4);
    const bg = c.createLinearGradient(x - 6, 0, x + 6, 0);
    bg.addColorStop(0, shade(brass, 0.5));
    bg.addColorStop(0.5, brass);
    bg.addColorStop(1, shade(brass, -0.3));
    c.fillStyle = shade(brass, -0.3);
    c.beginPath();
    c.ellipse(x, L.y + 22, 6.5, 2.6, 0, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = bg;
    c.beginPath();
    c.ellipse(x, L.y + 21, 6.5, 2.4, 0, 0, Math.PI * 2);
    c.fill();
    capsule(c, [{ x, y: L.y + 20 }, { x, y: L.y + 2 }], 2.8, brass);
    ball(c, x, L.y + 12, 2.6, brass, 0.6);
    c.fillStyle = bg;
    c.beginPath();
    c.ellipse(x, L.y, 6, 2, 0, 0, Math.PI * 2);
    c.fill();
    if (i >= L.lit) continue;
    const y = L.y - 1;
    const fl = f.reducedMotion ? 1 : 1 + 0.12 * Math.sin(f.t * 11 + i * 2.1) + 0.06 * Math.sin(f.t * 23 + i);
    c.globalCompositeOperation = "lighter";
    const g = c.createRadialGradient(x, y - 4, 0, x, y - 4, 16 * fl);
    g.addColorStop(0, "rgba(255,190,90,0.5)");
    g.addColorStop(1, "rgba(255,170,80,0)");
    c.fillStyle = g;
    c.fillRect(x - 17, y - 21, 34, 34);
    c.globalCompositeOperation = "source-over";
    const fg = c.createRadialGradient(x, y - 2, 0.3, x, y - 4 * fl, 6 * fl);
    fg.addColorStop(0, "#fffbe0");
    fg.addColorStop(0.45, "#ffd166");
    fg.addColorStop(1, "#ff8a3d");
    c.fillStyle = fg;
    c.beginPath();
    c.moveTo(x, y - 10 * fl);
    c.bezierCurveTo(x + 3.4 * fl, y - 4 * fl, x + 3 * fl, y, x, y);
    c.bezierCurveTo(x - 3 * fl, y, x - 3.4 * fl, y - 4 * fl, x, y - 10 * fl);
    c.fill();
  }
}

/** Per-villager hop memory, so landings squash and wobble after the hop ends. */
const hopState = new Map<string, { lastAir: number; start: number }>();

function hopShape(v: LiveVillager, t: number): { sy: number; raise: number; age: number } {
  let st = hopState.get(v.id);
  if (v.jump > 0) {
    if (!st || t - st.lastAir > 1.2) st = { lastAir: t, start: t };
    st.lastAir = t;
    hopState.set(v.id, st);
    const c = 1 - v.jump;
    return { sy: 1 + Math.sin(Math.PI * Math.min(1, c * 1.4)) * 0.12 - Math.pow(c, 10) * 0.28, raise: 1, age: t - st.start };
  }
  if (st) {
    const d = t - st.lastAir;
    if (d < 0.8) return { sy: 1 - 0.28 * Math.exp(-d * 7) * Math.cos(d * 22), raise: Math.max(0, 1 - d / 0.35), age: t - st.start };
    if (d > 5) hopState.delete(v.id);
  }
  return { sy: 1, raise: 0, age: 99 };
}

function confetti(c: C, v: LiveVillager, age: number) {
  if (age > 1.5) return;
  const cols = ["#f9a8c4", "#fde68a", "#a7e3c8", "#c4b5fd", "#fdba74"];
  c.globalAlpha = Math.max(0, 1 - age / 1.5) * v.alpha;
  for (let i = 0; i < 12; i++) {
    const a = -Math.PI / 2 + (hash(i + 3) - 0.5) * 2.4;
    const sp = 40 + hash(i + 9) * 40;
    ball(c, v.x + Math.cos(a) * sp * age, v.y - 66 + Math.sin(a) * sp * age + 70 * age * age, 1.8, cols[i % cols.length]!, 0.6, -0.2);
  }
  c.globalAlpha = 1;
}

const BADGE: Record<LiveStatus, { base: string; ink: string; sub: string; dot: string }> = {
  working: { base: "#c6f0e5", ink: "#1f5b52", sub: "#2f7468", dot: "#5eead4" },
  approval: { base: "#ff7566", ink: "#ffffff", sub: "#fff1ee", dot: "#ffffff" },
  turn: { base: "#fde2a6", ink: "#6b4a10", sub: "#7c5a1a", dot: "#f5b33d" },
  idle: { base: "#e6eaf0", ink: "#475569", sub: "#64748b", dot: "#94a3b8" },
  finished: { base: "#dcf5b0", ink: "#3d5a14", sub: "#4d6b1f", dot: "#a3e635" },
  error: { base: "#ffd6d1", ink: "#9b1c1c", sub: "#a33a32", dot: "#f87171" },
};

function drawBadge(c: C, v: LiveVillager, f: LiveFrame, view: ViewRect) {
  const st = BADGE[v.status];
  c.globalAlpha = v.alpha * (v.status === "idle" && !v.selected && !v.hovered ? 0.8 : 1);
  if (v.selected || v.hovered) {
    // A soft spotlight halo behind the selected/hovered badge.
    c.fillStyle = v.selected ? "rgba(255,255,255,0.7)" : "rgba(255,255,255,0.4)";
    rrect(c, v.labelX - 60, v.labelY - 3, 120, badgeHeight(false) + 6, 14);
    c.fill();
  }
  clayBadge(c, {
    cx: v.labelX, top: v.labelY, name: v.name, label: v.label,
    right: v.companions.length > COMP_MAX ? `+${v.companions.length - COMP_MAX} helpers` : v.linked ? "linked" : undefined,
    base: st.base, ink: st.ink, sub: st.sub, dot: st.dot,
    urgent: v.urgent, pulse: f.reducedMotion ? 0.5 : f.pulse, t: f.reducedMotion ? 0 : f.t,
    minX: view.x + 4, maxX: view.x + view.w - 4,
  });
  c.globalAlpha = 1;
}

function hud(c: C, f: LiveFrame, view: ViewRect) {
  // Screen-fixed pill below the top bar: "N of M at work" with a glossy bar.
  const a = c.getTransform().a || 1;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const u = dpr / a; // world units per CSS pixel
  c.save();
  c.translate(view.x + 16 * u, view.y + 84 * u);
  c.scale(u * 2.2, u * 2.2);
  const text = f.total ? `${f.working} of ${f.total} at work` : "No sessions yet";
  c.font = `800 7px ${FONT}`;
  const w = c.measureText(text).width + 22;
  shadow(c, w / 2 + 2, 22, w / 2, 3, 0.25);
  c.fillStyle = "#e2c8b0";
  rrect(c, 0, 1.6, w, 20, 10);
  c.fill();
  softBox(c, 0, 0, w, 20, 10, "#fff7ee", 0.4, -0.06);
  ball(c, 8, 7, 2.6, "#5eead4", 0.5, -0.25);
  c.textAlign = "left";
  c.textBaseline = "middle";
  c.fillStyle = "#5a3a28";
  c.fillText(text, 13, 7.3);
  c.fillStyle = "rgba(150,100,70,0.2)";
  rrect(c, 6, 13, w - 12, 3.5, 1.75);
  c.fill();
  if (f.total) {
    c.fillStyle = "#2bb39c";
    rrect(c, 6, 13, Math.max(3.5, (w - 12) * (f.working / f.total)), 3.5, 1.75);
    c.fill();
  }
  c.restore();
}

/** Everything behind the villagers for Kerala (the original scenery). */
function drawKeralaScene(ctx: C, f: LiveFrame, view: ViewRect) {
  const vx0 = view.x, vx1 = view.x + view.w;
  const inView = (x: number, pad: number) => x > vx0 - pad && x < vx1 + pad;
  const t = f.t;
  const still = f.reducedMotion;
  if (!skyTile) {
    skyTile = makeSprite(0, 0, TILE, GROUND.waterBottom + 8, paintSkyTile, 2.5);
    groundTile = makeSprite(0, GROUND.groundY - 6, TILE, WORLD_H - GROUND.groundY + 8, paintGroundTile, 2.5);
    cloudSprite = makeSprite(0, 0, 90, 44, paintCloud, 2);
    farPalmSprite = makeSprite(0, 0, 40, 44, paintFarPalm, 2);
  }

  // Fill anything outside the 0..360 band, then repeat the tiles across the view.
  ctx.fillStyle = "#8fc9e6";
  ctx.fillRect(vx0, view.y, view.w, Math.max(0, -view.y) + 1);
  ctx.fillStyle = "#f3d4b0";
  ctx.fillRect(vx0, WORLD_H - 1, view.w, Math.max(0, view.y + view.h - WORLD_H) + 1);
  const t0 = Math.floor(vx0 / TILE) * TILE;
  for (let x = t0; x < vx1; x += TILE) blit(ctx, skyTile, x, 0.5);

  // Sun (far away: fixed to the screen's upper left) with a warm halo.
  const sx = vx0 + view.w * 0.16, sy = 50;
  const halo = ctx.createRadialGradient(sx, sy, 6, sx, sy, 120);
  halo.addColorStop(0, "rgba(255,240,200,0.9)");
  halo.addColorStop(0.25, "rgba(255,228,180,0.45)");
  halo.addColorStop(1, "rgba(255,228,180,0)");
  ctx.fillStyle = halo;
  ctx.fillRect(sx - 120, sy - 120, 240, GROUND.waterTop - sy + 120);
  ball(ctx, sx, sy, 15, "#ffe39a", 0.7, -0.08);

  // Clouds drift, repeating every tile.
  const cl: [number, number, number][] = [[60, 18, 1.0], [300, 40, 0.8], [470, 12, 1.15], [620, 56, 0.65]];
  for (let x = t0 - TILE; x < vx1; x += TILE) for (const [cx0, cy, s] of cl) {
    const cx = x + ((((cx0 + f.drift * (0.4 + s * 0.3)) % TILE) + TILE) % TILE);
    if (cx + 90 * s < vx0 || cx > vx1) continue;
    ctx.drawImage(cloudSprite!.cv, cx, cy, 90 * s, 44 * s);
  }
  for (const x of f.farPalms) if (inView(x, 30)) ctx.drawImage(farPalmSprite!.cv, x - 20, GROUND.waterTop + 1 - 40, 40, 44);

  // Glossy water glints.
  ctx.fillStyle = "#ffffff";
  for (let x = t0; x < vx1; x += TILE) for (let i = 0; i < 12; i++) {
    const sp = still ? 0 : 6 + hash(i) * 8;
    const gx = x + ((hash(i + 20) * TILE + t * sp) % TILE);
    ctx.globalAlpha = 0.35 + 0.35 * Math.sin(t * 1.3 + i);
    ctx.beginPath();
    ctx.ellipse(gx, GROUND.waterTop + 8 + hash(i + 50) * 34, 6 + hash(i + 70) * 12, 0.9, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  if (inView(f.canoeX, 40)) canoe(ctx, f.canoeX, still ? 0 : t);

  for (let x = t0; x < vx1; x += TILE) blit(ctx, groundTile!, x, 0.5);

  // Palms, sign, places, lamps.
  for (const p of f.palms) if (inView(p.x, 90)) blit(ctx, palmSprite(p));
  if (inView(f.sign.x, 50)) drawSign(ctx, f.sign);
  for (const p of f.places) {
    const b = p.building;
    if (!inView(b.x + b.w / 2, b.w / 2 + 50)) continue;
    blit(ctx, placeSprite(p));
    const oL = b.x + 8, oB = b.baseY - b.wallH + 50;
    if (!still) for (let i = 0; i < 2; i++) steam(ctx, t, oL + 12 + i * 12, oB - 10, i + p.variant);
    if (p.urgent > 0) {
      // Subtle alert: a pulsing coral glow at the door and a bobbing "!" on the ridge.
      const pulse = still ? 0.5 : f.pulse;
      const g = ctx.createRadialGradient(b.doorX, b.baseY - 22, 2, b.doorX, b.baseY - 22, 34);
      g.addColorStop(0, `rgba(255,110,90,${0.25 + 0.25 * pulse})`);
      g.addColorStop(1, "rgba(255,110,90,0)");
      ctx.fillStyle = g;
      ctx.fillRect(b.doorX - 34, b.baseY - 56, 68, 68);
      const rx = b.x + b.w / 2, ry = b.baseY - b.wallH - b.roofH - 12 - (still ? 0 : Math.abs(Math.sin(t * Math.PI * 1.2)) * 4);
      ball(ctx, rx, ry, 7, "#ff4d3f", 0.5, -0.25);
      ctx.font = `900 10px ${FONT}`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = "#fff";
      ctx.fillText("!", rx, ry + 0.5);
    }
  }
  if (inView(f.lamps.x0 + (f.lamps.count * f.lamps.dx) / 2, 140)) drawLamps(ctx, f);
}

export const explainer3dLive: LiveStyle = {
  id: "explainer-3d",
  name: "Explainer 3D",
  blurb: "Soft pastel 3D explainer look, bouncy rounded villagers.",
  bg: "#f3e6d6",
  lighting: "day",
  draw(ctx, f, view) {
    const vx0 = view.x, vx1 = view.x + view.w;
    const inView = (x: number, pad: number) => x > vx0 - pad && x < vx1 + pad;
    const t = f.t;
    const still = f.reducedMotion;
    if (f.theme === "bengaluru") drawBengaluruScene(ctx, f, view);
    else drawKeralaScene(ctx, f, view);

    // Companions (first COMP_MAX per villager), culled to the view.
    const comps: { v: LiveVillager; k: LiveCompanion }[] = [];
    for (const v of f.villagers) {
      if (v.alpha <= 0) continue;
      for (let i = 0; i < Math.min(COMP_MAX, v.companions.length); i++) {
        const k = v.companions[i]!;
        if (k.alpha > 0 && inView(k.x, 40)) comps.push({ v, k });
      }
    }
    // Errand tethers lie on the ground, behind every figure.
    for (const { v, k } of comps) drawCompanionTether(ctx, v, k, t, still);

    // Villagers and companions back to front (by feet y).
    const order: ({ y: number; v: LiveVillager; k?: LiveCompanion })[] = [];
    for (const v of f.villagers) if (inView(v.x, 50) && v.alpha > 0) order.push({ y: v.y, v });
    for (const { v, k } of comps) order.push({ y: k.y, v, k });
    order.sort((a, b) => a.y - b.y);
    for (const it of order) {
      if (it.k) { drawCompanionFigure(ctx, it.v, it.k, t, still); continue; }
      const v = it.v;
      const hop = hopShape(v, t);
      if (v.selected || v.hovered) {
        ctx.fillStyle = v.selected ? "rgba(255,255,255,0.55)" : "rgba(255,255,255,0.3)";
        ctx.beginPath();
        ctx.ellipse(v.x, v.y + 1, 19, 6, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = v.selected ? "#2bb39c" : "rgba(43,179,156,0.6)";
        ctx.lineWidth = v.selected ? 2 : 1.2;
        ctx.stroke();
      }
      ctx.globalAlpha = v.alpha;
      const happy = v.status === "finished" && hop.raise + (hop.sy !== 1 ? 1 : 0) > 0;
      clayVillager(ctx, asVillagerFrame(v), still ? 0 : t, {
        happy, waiting: v.urgent || v.status === "turn", hair: v.hair, bun: (hash(v.id.length * 7.3 + v.id.charCodeAt(0)) > 0.5),
        sy: still ? 1 : hop.sy, raise: hop.raise,
      });
      if (v.status === "error") {
        const ex = v.x + v.facing * 12, ey = v.y - 70;
        ball(ctx, ex, ey, 5.5, "#f25c54", 0.5, -0.25);
        ctx.font = `900 8px ${FONT}`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillStyle = "#fff";
        ctx.fillText("×", ex, ey + 0.3);
      }
      if (v.linked) ball(ctx, v.x + v.facing * 8, v.y - 46, 1.8, "#5eead4", 0.6, -0.2);
      ctx.globalAlpha = 1;
      if (v.companions.length > COMP_MAX) drawCompanionMore(ctx, v);
      if (!still && v.status === "finished") confetti(ctx, v, hop.age);
    }
    // Icons, puffs, ? / ! bubbles and hand-over sparkles float over every figure.
    for (const { v, k } of comps) drawCompanionOverlay(ctx, v, k, t, still);

    // Soft studio vignette + warm light, over the visible rect.
    const vg = ctx.createRadialGradient(vx0 + view.w / 2, view.y + view.h * 0.45, view.h * 0.4, vx0 + view.w / 2, view.y + view.h * 0.5, Math.max(view.w, view.h) * 0.65);
    vg.addColorStop(0, "rgba(120,70,50,0)");
    vg.addColorStop(1, "rgba(120,70,50,0.16)");
    ctx.fillStyle = vg;
    ctx.fillRect(vx0, view.y, view.w, view.h);

    // Badges on top; the selected one last so it comes forward.
    let sel: LiveVillager | null = null;
    for (const v of f.villagers) {
      if (!inView(v.labelX, 120) || v.alpha <= 0) continue;
      if (v.selected) { sel = v; continue; }
      drawBadge(ctx, v, f, view);
    }
    if (sel) drawBadge(ctx, sel, f, view);

    // Tiny companion labels: only for the selected/hovered villager's helpers, or when zoomed in.
    const zoomed = view.w < 700;
    const boxes: Box[] = [];
    for (const v of f.villagers) {
      if (!(zoomed || v.selected || v.hovered) || v.alpha <= 0 || v.companions.length === 0) continue;
      const ks = v.companions.slice(0, COMP_MAX).filter((k) => inView(k.x, 60));
      if (ks.length) drawCompanionLabels(ctx, v, ks, boxes);
    }
    hud(ctx, f, view);
  },
};
