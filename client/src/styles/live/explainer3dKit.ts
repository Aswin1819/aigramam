/**
 * Explainer 3D helpers: sprite caching shared by both places, and the
 * Bengaluru scenery (f.theme === "bengaluru") in the same soft clay-toy look:
 * a pastel skyline, a rounded metro train on a viaduct over park greenery,
 * a road with autos and a bus, gulmohar trees, and city buildings per variant.
 * Everything static is cached in offscreen canvases with "blr" keys, separate
 * from the Kerala caches in explainer3d.ts.
 *
 * Also the subagent companions (both places): small clay helpers (0.7x a
 * villager) in the parent's palette, lightened, with a mint cap; a soft tether
 * while on an errand, a bobbing clay icon bubble while working, puffs,
 * hand-over sparkles, "?" / "!" bubbles and tiny labels.
 */
import { hash, skeleton } from "../scene";
import { FONT, ball, bush, capsule, clayVillager, flower, paintCloud, rrect, shade, shadow, softBox, steam } from "../protos/explainer3d";
import { GROUND, WORLD_H, type LiveCompanion, type LiveFrame, type LivePlace, type LiveVillager, type ViewRect } from "./types";

type C = CanvasRenderingContext2D;

export const TILE = 640;
export const CACHE_SCALE = 3;

export interface Sprite { cv: HTMLCanvasElement; x: number; y: number; w: number; h: number }

/** Paint something (in world units) into an offscreen canvas covering [x, x+w] × [y, y+h]. */
export function makeSprite(x: number, y: number, w: number, h: number, paint: (c: C) => void, scale = CACHE_SCALE): Sprite {
  const cv = document.createElement("canvas");
  cv.width = Math.ceil(w * scale);
  cv.height = Math.ceil(h * scale);
  const c = cv.getContext("2d")!;
  c.scale(scale, scale);
  c.translate(-x, -y);
  paint(c);
  return { cv, x, y, w, h };
}
/** Tiles get +0.5 width so neighbours overlap and no hairline seam shows. */
export const blit = (ctx: C, s: Sprite, dx = 0, seam = 0) => ctx.drawImage(s.cv, s.x + dx, s.y, s.w + seam, s.h);

export function fitText(c: C, text: string, maxW: number): string {
  if (c.measureText(text).width <= maxW) return text;
  let t = text;
  while (t.length > 1 && c.measureText(`${t}…`).width > maxW) t = t.slice(0, -1);
  return `${t}…`;
}

// ── Bengaluru: layout constants ──────────────────────────────────────────────

const DECK_TOP = GROUND.waterTop - 4; // viaduct deck top (train wheels sit here)
const DECK_H = 11;
const LANE_FAR = GROUND.pathTop + 20;
const LANE_NEAR = GROUND.pathBottom - 10;

// ── Bengaluru: tiles ─────────────────────────────────────────────────────────

let skyTile: Sprite | null = null;
let viaductTile: Sprite | null = null;
let groundTile: Sprite | null = null;
let cloudSprite: Sprite | null = null;
let trainSprite: Sprite | null = null;
const autoSprites: Sprite[] = [];
const busSprites: Sprite[] = [];

function paintSky(c: C) {
  const wt = GROUND.waterTop;
  const sky = c.createLinearGradient(0, 0, 0, wt);
  sky.addColorStop(0, "#8fc9e6");
  sky.addColorStop(0.55, "#c7e5ee");
  sky.addColorStop(1, "#fbe7d2");
  c.fillStyle = sky;
  c.fillRect(0, 0, TILE, wt + 8);
  // A hazy, blurred far skyline (depth of field), wrapped so the tile repeats.
  c.filter = "blur(1.4px)";
  const far: [number, number, number][] = [
    [20, 26, 48], [60, 20, 34], [104, 30, 62], [150, 22, 40], [196, 28, 54], [240, 18, 30], [282, 32, 70],
    [330, 24, 44], [372, 20, 36], [414, 30, 58], [458, 22, 42], [500, 26, 66], [548, 20, 38], [592, 28, 50],
  ];
  for (const [x0, w, h] of far) for (const x of [x0 - TILE, x0, x0 + TILE]) {
    const g = c.createLinearGradient(x, 0, x + w, 0);
    g.addColorStop(0, "#dbe8f0");
    g.addColorStop(1, "#bcd2e0");
    c.fillStyle = g;
    rrect(c, x, wt + 6 - h, w, h + 4, 6);
    c.fill();
  }
  c.filter = "none";
}

function paintViaduct(c: C) {
  const wt = GROUND.waterTop, wb = GROUND.waterBottom;
  // Park greenery behind the pillars.
  const lg = c.createLinearGradient(0, wt + 6, 0, wb + 8);
  lg.addColorStop(0, "#b5dfc0");
  lg.addColorStop(1, "#9fd3a8");
  c.fillStyle = lg;
  c.fillRect(0, wt + 10, TILE, wb - wt);
  for (let i = 0; i < 26; i++) {
    const x0 = (i / 26) * TILE + hash(i + 500) * 10;
    for (const x of [x0 - TILE, x0, x0 + TILE]) {
      const r = 10 + hash(i + 520) * 8;
      const y = wt + 22 + hash(i + 540) * 8;
      const col = hash(i + 560) > 0.5 ? "#8fcf9a" : "#7fc28e";
      ball(c, x, y, r, col, 0.4, -0.18);
      if (hash(i + 580) > 0.6) ball(c, x + r * 0.4, y - r * 0.5, 2.4, "#f4866a", 0.5, -0.2);
    }
  }
  for (let i = 0; i < 16; i++) {
    const x0 = hash(i + 600) * TILE;
    for (const x of [x0 - TILE, x0, x0 + TILE]) bush(c, x, wb - 2, 0.7 + hash(i + 620) * 0.3, "#86cc8c");
  }
  // Pillars with rounded T caps, every 160 units.
  for (let x = 40; x < TILE + 160; x += 160) {
    for (const px of [x - TILE, x]) {
      shadow(c, px + 3, wb + 2, 12, 3, 0.3);
      const g = c.createLinearGradient(px - 6, 0, px + 6, 0);
      g.addColorStop(0, "#f4f1ec");
      g.addColorStop(0.5, "#ddd8d0");
      g.addColorStop(1, "#bdb6ac");
      c.fillStyle = g;
      rrect(c, px - 6, DECK_TOP + DECK_H - 2, 12, wb - DECK_TOP - DECK_H + 8, 4);
      c.fill();
      softBox(c, px - 14, DECK_TOP + DECK_H - 3, 28, 7, 3.5, "#e3ded6", 0.3, -0.18);
    }
  }
  // Deck: a long rounded beam with a lilac stripe.
  shadow(c, TILE / 2, DECK_TOP + DECK_H + 6, TILE * 0.7, 3, 0.2);
  softBox(c, -6, DECK_TOP, TILE + 12, DECK_H, 5, "#ece8e2", 0.35, -0.16);
  c.fillStyle = "#a98bd8";
  c.fillRect(-6, DECK_TOP + 5.2, TILE + 12, 2.2);
  c.fillStyle = "rgba(255,255,255,0.7)";
  c.fillRect(-6, DECK_TOP + 1, TILE + 12, 0.9);
  // Parapet posts.
  c.fillStyle = "#d8d2c8";
  for (let x = 4; x < TILE; x += 16) {
    rrect(c, x, DECK_TOP - 3, 2, 4, 1);
    c.fill();
  }
}

function paintGround(c: C) {
  const gy = GROUND.groundY, pt = GROUND.pathTop, pb = GROUND.pathBottom;
  // Lawn strip, then soft paver footpath.
  const lg = c.createLinearGradient(0, gy, 0, gy + 18);
  lg.addColorStop(0, "#a9dbb0");
  lg.addColorStop(1, "#c4e4b0");
  c.fillStyle = lg;
  c.fillRect(0, gy - 6, TILE, 24);
  c.strokeStyle = "rgba(255,255,240,0.6)";
  c.lineWidth = 1.4;
  c.beginPath();
  c.moveTo(0, gy);
  c.lineTo(TILE, gy);
  c.stroke();
  const pavers = (y0: number, y1: number) => {
    const pg = c.createLinearGradient(0, y0, 0, y1);
    pg.addColorStop(0, "#efe4d6");
    pg.addColorStop(1, "#e6d6c4");
    c.fillStyle = pg;
    c.fillRect(0, y0, TILE, y1 - y0);
    for (let r = 0, y = y0 + 1; y < y1 - 2; r++, y += 9) for (let x = (r % 2) * 8 - 8; x < TILE; x += 16) {
      const k = hash(r * 97 + x) * 0.08 - 0.04;
      c.fillStyle = shade("#ecdccb", k);
      rrect(c, x + 0.8, y + 0.8, 14.4, 7.4, 2.6);
      c.fill();
      c.fillStyle = "rgba(255,255,255,0.35)";
      c.fillRect(x + 3, y + 1.6, 9, 0.8);
    }
  };
  pavers(gy + 18, pt - 6);
  pavers(pb + 6, WORLD_H + 2);
  // Kerbs: black and yellow rounded blocks.
  const kerb = (y: number) => {
    for (let x = -8, i = 0; x < TILE; x += 16, i++) softBox(c, x + 0.5, y, 15, 6, 2.5, i % 2 ? "#f6d04d" : "#4a4d58", 0.3, -0.2);
  };
  // Road.
  const rg = c.createLinearGradient(0, pt, 0, pb);
  rg.addColorStop(0, "#8e95a6");
  rg.addColorStop(0.5, "#9ca2b2");
  rg.addColorStop(1, "#888fa0");
  c.fillStyle = rg;
  c.fillRect(0, pt, TILE, pb - pt);
  c.fillStyle = "rgba(255,255,255,0.08)";
  for (let i = 0; i < 40; i++) {
    c.beginPath();
    c.ellipse(hash(i + 700) * TILE, pt + 6 + hash(i + 720) * (pb - pt - 12), 6 + hash(i + 740) * 10, 1.2, 0, 0, Math.PI * 2);
    c.fill();
  }
  // Lane dashes.
  const mid = (pt + pb) / 2 + 2;
  for (let x = 10; x < TILE; x += 48) {
    c.fillStyle = "rgba(60,64,80,0.25)";
    rrect(c, x, mid + 0.8, 24, 3, 1.5);
    c.fill();
    c.fillStyle = "#fbf8f0";
    rrect(c, x, mid - 1, 24, 3, 1.5);
    c.fill();
  }
  kerb(pt - 6);
  kerb(pb);
}

function paintTrain(c: C) {
  // Four rounded cars, nose to the right; (0,0) = bottom centre of the train.
  const carW = 44, gap = 3, n = 4, h = 19;
  const total = n * carW + (n - 1) * gap;
  shadow(c, 0, -1, total / 2, 2.5, 0.25);
  for (let i = 0; i < n; i++) {
    const x = -total / 2 + i * (carW + gap);
    const y = -h - 2;
    if (i > 0) softBox(c, x - gap - 1, y + 5, gap + 2, h - 9, 1, "#7a7f8f");
    softBox(c, x, y, carW, h, i === 0 || i === n - 1 ? 8 : 5, "#f1f2f6", 0.4, -0.14);
    // Lilac stripe.
    c.fillStyle = "#a98bd8";
    c.fillRect(x + 2, y + h - 7, carW - 4, 2.6);
    // Windows.
    for (let k = 0; k < 4; k++) {
      const wx = x + 4 + k * 10;
      const g = c.createLinearGradient(wx, y + 4, wx + 8, y + 11);
      g.addColorStop(0, "#9bc3e0");
      g.addColorStop(1, "#4f6a8c");
      c.fillStyle = g;
      rrect(c, wx, y + 4, 8, 7.5, 2.5);
      c.fill();
      c.fillStyle = "rgba(255,255,255,0.6)";
      c.fillRect(wx + 1.5, y + 5, 2.5, 0.9);
    }
    ball(c, x + 9, -1.6, 2, "#4a4d58", 0.4, -0.2);
    ball(c, x + carW - 9, -1.6, 2, "#4a4d58", 0.4, -0.2);
  }
  // Front windscreen and a headlight.
  const fx = total / 2;
  c.fillStyle = "#4f6a8c";
  rrect(c, fx - 6, -h + 1, 5, 9, 2.5);
  c.fill();
  ball(c, fx - 2.5, -6, 1.5, "#fff3c4", 0.6, -0.1);
  // Pantograph.
  capsule(c, [{ x: -total / 2 + carW * 1.5, y: -h - 2 }, { x: -total / 2 + carW * 1.5 + 5, y: -h - 7 }, { x: -total / 2 + carW * 1.5 + 10, y: -h - 2 }], 1.2, "#7a7f8f");
}

function paintAuto(c: C, body: string) {
  // Facing right; (0,0) = ground under the middle.
  shadow(c, 0, 0, 20, 3.6, 0.38);
  softBox(c, -18, -22, 25, 17, 7, body, 0.35, -0.2);
  softBox(c, 3, -21, 15, 16, 7, "#f7d65a", 0.35, -0.2);
  // Windscreen and canopy.
  c.fillStyle = "#cfe8f5";
  rrect(c, 6, -31, 7, 11, 3);
  c.fill();
  capsule(c, [{ x: -15, y: -21 }, { x: -15, y: -31 }], 2, "#3a3d47");
  capsule(c, [{ x: 12, y: -20 }, { x: 11, y: -31 }], 1.6, "#3a3d47");
  softBox(c, -19, -38, 34, 9, 5, "#3a3d47", 0.3, -0.2);
  c.fillStyle = "rgba(20,20,30,0.18)";
  rrect(c, -13, -29, 18, 9, 3);
  c.fill();
  ball(c, 17, -13, 2.2, "#fff6c9", 0.6, -0.1);
  ball(c, -11, -4, 4.4, "#2f3138", 0.35, -0.2);
  ball(c, 12, -4, 4.4, "#2f3138", 0.35, -0.2);
  ball(c, -11, -4, 1.6, "#c9ccd4", 0.4, -0.1);
  ball(c, 12, -4, 1.6, "#c9ccd4", 0.4, -0.1);
}

function paintBus(c: C) {
  shadow(c, 0, 0, 42, 4.5, 0.38);
  softBox(c, -40, -36, 80, 32, 9, "#7cc8c0", 0.35, -0.2);
  c.fillStyle = "#fbf3e2";
  c.fillRect(-38, -14, 76, 3);
  for (let i = 0; i < 6; i++) {
    const g = c.createLinearGradient(0, -31, 0, -20);
    g.addColorStop(0, "#cfe8f5");
    g.addColorStop(1, "#7fa6c2");
    c.fillStyle = g;
    rrect(c, -34 + i * 11.5, -31, 9.5, 11, 3);
    c.fill();
  }
  softBox(c, 30, -31, 8, 20, 3, "#e6f0f4", 0.3, -0.15);
  ball(c, 38, -9, 2, "#fff6c9", 0.6, -0.1);
  for (const x of [-26, 24]) {
    ball(c, x, -4, 5, "#2f3138", 0.35, -0.2);
    ball(c, x, -4, 1.8, "#c9ccd4", 0.4, -0.1);
  }
}

// ── Bengaluru: far towers (from f.farPalms) ──────────────────────────────────

const towerCache = new Map<string, Sprite>();
function paintTower(c: C, kind: number, h: number) {
  const cx = 30, base = 60;
  const haze = (x: number, w: number) => {
    c.globalCompositeOperation = "source-atop";
    c.fillStyle = "rgba(225,236,244,0.28)";
    c.fillRect(x, 0, w, base + 2);
    c.globalCompositeOperation = "source-over";
  };
  if (kind === 0) {
    // Glass tower with a rounded crown.
    const w = 24;
    const g = c.createLinearGradient(cx - w / 2, 0, cx + w / 2, 0);
    g.addColorStop(0, "#c4e0f0");
    g.addColorStop(0.5, "#9cc6e2");
    g.addColorStop(1, "#78a7c8");
    c.fillStyle = g;
    rrect(c, cx - w / 2, base - h, w, h + 4, 8);
    c.fill();
    c.strokeStyle = "rgba(255,255,255,0.45)";
    c.lineWidth = 0.7;
    for (let x = cx - w / 2 + 6; x < cx + w / 2 - 2; x += 6) {
      c.beginPath();
      c.moveTo(x, base - h + 6);
      c.lineTo(x, base);
      c.stroke();
    }
    c.fillStyle = "rgba(255,255,255,0.3)";
    c.beginPath();
    c.moveTo(cx - w / 2, base - h * 0.4);
    c.lineTo(cx + w / 2, base - h * 0.75);
    c.lineTo(cx + w / 2, base - h * 0.62);
    c.lineTo(cx - w / 2, base - h * 0.27);
    c.fill();
    haze(cx - w / 2, w);
  } else if (kind === 1 || kind === 3) {
    // Apartment block with small windows and a water tank.
    const w = kind === 1 ? 32 : 26;
    const col = kind === 1 ? "#f3e4d2" : "#f0dbe0";
    softBox(c, cx - w / 2, base - h, w, h + 4, 5, col, 0.3, -0.15);
    for (let y = base - h + 6; y < base - 4; y += 8) for (let x = cx - w / 2 + 4; x < cx + w / 2 - 4; x += 7) {
      c.fillStyle = "#a9c7da";
      rrect(c, x, y, 4.2, 4.2, 1.4);
      c.fill();
    }
    softBox(c, cx - 5, base - h - 7, 10, 7, 3, "#5d7088", 0.35, -0.2);
    capsule(c, [{ x: cx - 3, y: base - h }, { x: cx - 3, y: base - h - 1 }], 1.4, "#8a93a3");
    haze(cx - w / 2, w);
  } else {
    // Slim lilac tower with a crane beside it.
    const w = 20;
    softBox(c, cx - w / 2, base - h, w, h + 4, 7, "#d9cdee", 0.35, -0.15);
    for (let y = base - h + 8; y < base - 4; y += 7) {
      c.fillStyle = "rgba(255,255,255,0.45)";
      c.fillRect(cx - w / 2 + 3, y, w - 6, 1.6);
    }
    const mx = cx + 18, top = base - h - 12;
    capsule(c, [{ x: mx, y: base }, { x: mx, y: top }], 2.4, "#f2c94c");
    capsule(c, [{ x: mx - 22, y: top + 2 }, { x: mx + 10, y: top + 2 }], 2, "#f2c94c");
    softBox(c, mx + 6, top + 2, 6, 4, 1.5, "#8a93a3");
    c.strokeStyle = "rgba(90,90,100,0.6)";
    c.lineWidth = 0.5;
    c.beginPath();
    c.moveTo(mx - 18, top + 3);
    c.lineTo(mx - 18, top + 18);
    c.stroke();
    haze(cx - w / 2, w + 30);
  }
}
function towerSprite(x: number): Sprite {
  const kind = Math.floor(hash(x * 0.37 + 11) * 4) % 4;
  const hb = Math.floor(hash(x * 0.53 + 3) * 6);
  const h = 38 + hb * 10;
  const key = `blr|${kind}|${hb}`;
  let s = towerCache.get(key);
  if (!s) {
    s = makeSprite(0, 0, 70, 62, (c) => paintTower(c, kind, h), 2);
    towerCache.set(key, s);
  }
  return s;
}

// ── Bengaluru: gulmohar trees (same positions as palms) ──────────────────────

const treeCache = new Map<string, Sprite>();
function paintGulmohar(c: C, p: LiveFrame["palms"][number]) {
  const h = p.h * 0.82;
  const topX = p.x + p.lean * h * 0.6, topY = p.baseY - h * 0.62;
  const cw = h * 0.5;
  shadow(c, p.x + 8, p.baseY + 1, cw * 0.8, 5, 0.32);
  capsule(c, [{ x: p.x, y: p.baseY }, { x: p.x + p.lean * h * 0.2, y: p.baseY - h * 0.3 }, { x: topX, y: topY }], 7, "#a9835f");
  capsule(c, [{ x: p.x + p.lean * h * 0.2, y: p.baseY - h * 0.32 }, { x: topX - cw * 0.45, y: topY + 4 }], 4, "#a9835f");
  capsule(c, [{ x: p.x + p.lean * h * 0.25, y: p.baseY - h * 0.38 }, { x: topX + cw * 0.5, y: topY + 6 }], 4, "#a9835f");
  const seed = p.x * 0.13;
  const greens = ["#6fb877", "#7cc584", "#88cf8c"];
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    const rr = 0.55 + hash(seed + i) * 0.45;
    const x = topX + Math.cos(a) * cw * rr * 0.85;
    const y = topY - h * 0.08 + Math.sin(a) * h * 0.13 * rr;
    ball(c, x, y, h * (0.1 + hash(seed + i + 30) * 0.04), greens[i % 3]!, 0.42, -0.2);
  }
  ball(c, topX, topY - h * 0.14, h * 0.17, "#82ca88", 0.45, -0.18);
  const blooms = ["#f2705a", "#f79a5b", "#ee5e52", "#fbb36a"];
  for (let i = 0; i < 30; i++) {
    const a = Math.PI + hash(seed + i + 60) * Math.PI;
    const rr = hash(seed + i + 90);
    const x = topX + Math.cos(a) * cw * rr;
    const y = topY - h * 0.08 + Math.sin(a) * h * 0.22 * rr + hash(seed + i + 120) * 6;
    ball(c, x, y, 2.4 + hash(seed + i + 150) * 1.8, blooms[i % 4]!, 0.55, -0.2);
  }
  // A few fallen petals around the base.
  for (let i = 0; i < 6; i++) ball(c, p.x - 14 + hash(seed + i + 200) * 34, p.baseY + 2 + hash(seed + i + 210) * 4, 1.4, blooms[i % 4]!, 0.4, -0.1);
}
function treeSprite(p: LiveFrame["palms"][number]): Sprite {
  const key = `blr|${p.x}|${p.baseY}|${p.h.toFixed(1)}|${p.lean.toFixed(3)}`;
  let s = treeCache.get(key);
  if (!s) {
    const h = p.h * 0.82, cw = h * 0.5;
    const topX = p.x + p.lean * h * 0.6;
    const x0 = Math.min(p.x, topX) - cw - 16, x1 = Math.max(p.x, topX) + cw + 16;
    const y0 = p.baseY - h * 0.62 - h * 0.35, y1 = p.baseY + 10;
    s = makeSprite(x0, y0, x1 - x0, y1 - y0, (c) => paintGulmohar(c, p), 2.5);
    if (treeCache.size > 80) treeCache.clear();
    treeCache.set(key, s);
  }
  return s;
}

// ── Bengaluru: buildings per variant ─────────────────────────────────────────

function nameBoard(c: C, p: LivePlace, cx: number, by: number, maxW: number, board: string, ink: string) {
  c.font = `800 9px ${FONT}`;
  const name = fitText(c, p.name, maxW);
  const bw = Math.max(54, c.measureText(name).width + 20);
  const bx = cx - bw / 2;
  shadow(c, cx + 2, by + 17, bw / 2, 2.5, 0.35);
  c.fillStyle = shade(board, -0.25);
  rrect(c, bx, by + 1.8, bw, 15, 7.5);
  c.fill();
  softBox(c, bx, by, bw, 15, 7.5, board, 0.4, -0.12);
  c.textAlign = "center";
  c.textBaseline = "middle";
  c.fillStyle = ink;
  c.fillText(name, cx, by + 7.9);
}

function sideWall(c: C, R: number, top: number, base: number, col: string) {
  const sg = c.createLinearGradient(R, 0, R + 12, 0);
  sg.addColorStop(0, shade(col, -0.12));
  sg.addColorStop(1, shade(col, -0.22));
  c.fillStyle = sg;
  c.beginPath();
  c.moveTo(R - 2, top + 6);
  c.lineTo(R + 12, top);
  c.lineTo(R + 12, base - 7);
  c.lineTo(R - 2, base);
  c.closePath();
  c.fill();
}

function glassPane(c: C, x: number, y: number, w: number, h: number, r: number) {
  const g = c.createLinearGradient(x, y, x + w, y + h);
  g.addColorStop(0, "#d8f1f6");
  g.addColorStop(0.5, "#9fd4e6");
  g.addColorStop(1, "#7cbcd6");
  c.fillStyle = g;
  rrect(c, x, y, w, h, r);
  c.fill();
  c.strokeStyle = "rgba(255,255,255,0.7)";
  c.lineWidth = 1.2;
  c.lineCap = "round";
  c.beginPath();
  c.moveTo(x + 2.5, y + h - 3);
  c.lineTo(x + Math.min(w * 0.5, 7), y + 3);
  c.stroke();
}

function door(c: C, dx: number, top: number, base: number, col: string) {
  c.fillStyle = "rgba(60,50,40,0.22)";
  rrect(c, dx - 13.5, top - 1.5, 27, base - top, 8);
  c.fill();
  softBox(c, dx - 12, top, 24, base - top - 2, 7, col, 0.3, -0.2);
}

function awning(c: C, x: number, y: number, w: number, a: string, b: string) {
  const n = Math.max(4, Math.round(w / 12));
  const sw = w / n;
  softBox(c, x - 2, y - 3, w + 4, 6, 3, shade(a, -0.1));
  for (let i = 0; i < n; i++) {
    const col = i % 2 ? b : a;
    const g = c.createLinearGradient(0, y, 0, y + 14);
    g.addColorStop(0, shade(col, 0.25));
    g.addColorStop(1, shade(col, -0.12));
    c.fillStyle = g;
    c.beginPath();
    c.moveTo(x + i * sw, y);
    c.lineTo(x + (i + 1) * sw, y);
    c.lineTo(x + (i + 1) * sw, y + 10);
    c.arc(x + (i + 0.5) * sw, y + 10, sw / 2, 0, Math.PI);
    c.closePath();
    c.fill();
  }
}

function paintGlassOffice(c: C, p: LivePlace) {
  const b = p.building;
  const L = b.x + 4, R = b.x + b.w - 4, base = b.baseY;
  const top = base - b.wallH - b.roofH + 6;
  shadow(c, (L + R) / 2 + 6, base + 2, b.w * 0.62, 9, 0.38);
  sideWall(c, R, top, base, "#9cc6e2");
  softBox(c, L, top, R - L, base - top, 10, "#8fbfe0", 0.35, -0.18);
  // Glass grid: deep frames with glossy panes.
  const cols = 4, rows = 2;
  const gx0 = L + 8, gy0 = top + 24, gw = R - L - 16, gh = base - 44 - gy0;
  const pw = gw / cols, ph = gh / rows;
  for (let r = 0; r < rows; r++) for (let k = 0; k < cols; k++) {
    softBox(c, gx0 + k * pw + 1, gy0 + r * ph + 1, pw - 3, ph - 3, 4, "#5f8fb6", 0.15, -0.2);
    glassPane(c, gx0 + k * pw + 3, gy0 + r * ph + 3, pw - 7, ph - 7, 3);
  }
  // Diagonal sheen.
  c.save();
  rrect(c, L, top, R - L, base - top, 10);
  c.clip();
  c.fillStyle = "rgba(255,255,255,0.22)";
  c.beginPath();
  c.moveTo(L, base - 40);
  c.lineTo(L + 60, top);
  c.lineTo(L + 82, top);
  c.lineTo(L + 22, base - 40);
  c.fill();
  c.restore();
  // Roof rim and antenna.
  softBox(c, L - 3, top - 3, R - L + 6, 7, 3.5, "#d6e6ef", 0.35, -0.15);
  capsule(c, [{ x: R - 18, y: top - 2 }, { x: R - 18, y: top - 18 }], 1.6, "#8a93a3");
  ball(c, R - 18, top - 19, 2.2, "#ff8a7a", 0.6, -0.1);
  // Entrance canopy and glass doors.
  softBox(c, b.doorX - 24, base - 42, 48, 6, 3, "#e9eef2", 0.35, -0.15);
  door(c, b.doorX, base - 36, base, "#7fb6d2");
  c.fillStyle = "rgba(255,255,255,0.6)";
  c.fillRect(b.doorX - 0.6, base - 34, 1.2, 30);
  softBox(c, L - 4, base - 8, R - L + 8, 10, 4, "#c9d3dc");
  bush(c, L - 10, base + 6, 1.0, "#86cc8c");
  bush(c, R + 16, base + 6, 0.8, "#7cc58a");
  nameBoard(c, p, (L + R) / 2, top + 6, b.w - 30, "#2f5f8a", "#ffffff");
}

function paintDarshini(c: C, p: LivePlace) {
  const b = p.building;
  const L = b.x, R = b.x + b.w, base = b.baseY, top = base - b.wallH;
  const upper = top - b.roofH + 10;
  const wall = "#fbe9c8";
  shadow(c, (L + R) / 2 + 6, base + 2, b.w * 0.62, 9, 0.38);
  bush(c, L - 14, base + 6, 1.0, "#86cc8c");
  sideWall(c, R, upper, base, wall);
  softBox(c, L, upper, b.w, base - upper, 6, wall, 0.3, -0.08);
  // Upper floor: arched windows and a little balcony rail.
  for (let i = 0; i < 3; i++) {
    const wx = L + 22 + i * ((b.w - 44) / 2) - 9;
    softBox(c, wx - 2, upper + 6, 22, 22, 9, "#e7cfa8", 0.2, -0.1);
    glassPane(c, wx + 1, upper + 9, 16, 17, 7);
  }
  softBox(c, L + 6, upper + 28, b.w - 12, 4, 2, "#c9a77a");
  // Signboard band.
  nameBoard(c, p, (L + R) / 2, top - 2, b.w - 30, "#2f8a6a", "#ffffff");
  // Striped awning over the counter.
  const oL = L + 8, oR = b.doorX - 20, oT = top + 30, oB = top + 50;
  awning(c, oL - 4, oT - 14, oR - oL + 8, "#f39a85", "#fff4e6");
  // Counter opening with steel tumblers and a big coffee urn.
  const op = c.createLinearGradient(0, oT, 0, oB);
  op.addColorStop(0, "#5a4a3f");
  op.addColorStop(1, "#86705c");
  c.fillStyle = op;
  rrect(c, oL, oT, oR - oL, oB - oT, 6);
  c.fill();
  for (let i = 0; i < 4; i++) softBox(c, oL + 6 + i * 7, oT + 6, 5, 7, 1.5, "#d7dde4", 0.5, -0.2);
  softBox(c, oL - 2, oB + 5, oR - oL + 4, 12, 3, shade(wall, -0.06), 0.2, -0.15);
  softBox(c, oL - 5, oB - 2, oR - oL + 10, 7, 3.5, "#c7ced6", 0.45, -0.2);
  const ux = oR - 9;
  shadow(c, ux, oB - 1, 8, 2, 0.35);
  ball(c, ux, oB - 8, 7, "#d5dbe2", 0.6, -0.3);
  softBox(c, ux - 5, oB - 17, 10, 4, 2, "#b9c1ca");
  ball(c, ux, oB - 18, 2, "#e8edf2");
  for (let i = 0; i < 2; i++) {
    const tx = oL + 12 + i * 12;
    softBox(c, tx - 3, oB - 9, 6, 8, 1.6, "#dfe4ea", 0.55, -0.2);
    c.fillStyle = "#c98b52";
    c.beginPath();
    c.ellipse(tx, oB - 8.6, 2.6, 0.9, 0, 0, Math.PI * 2);
    c.fill();
  }
  // Door and a menu board.
  door(c, b.doorX, top + 26, base, "#c07c52");
  softBox(c, b.doorX - 18, base - 4, 36, 7, 3.5, "#f0c8a8");
  const wL = b.doorX + 18, wR = R - 6;
  if (wR - wL > 18) {
    softBox(c, wL, top + 28, wR - wL, 30, 6, "#3f6b55", 0.2, -0.2);
    c.strokeStyle = "rgba(255,255,240,0.8)";
    c.lineWidth = 1.2;
    c.lineCap = "round";
    for (let i = 0; i < 4; i++) {
      c.beginPath();
      c.moveTo(wL + 5, top + 35 + i * 6);
      c.lineTo(wR - 5 - (i % 2) * 8, top + 35 + i * 6);
      c.stroke();
    }
  }
  softBox(c, L - 4, base - 8, b.w + 8, 10, 4, "#dc9f7c");
  flower(c, R + 18, base + 4, "#f9a8c4");
  flower(c, R + 24, base + 6, "#fde68a");
}

function paintBrickLoft(c: C, p: LivePlace) {
  const b = p.building;
  const L = b.x, R = b.x + b.w, base = b.baseY;
  const top = base - b.wallH - b.roofH + 12;
  const wall = "#e7a68c";
  shadow(c, (L + R) / 2 + 6, base + 2, b.w * 0.62, 9, 0.38);
  sideWall(c, R, top, base, wall);
  softBox(c, L, top, b.w, base - top, 6, wall, 0.25, -0.12);
  // Soft brick courses.
  c.save();
  rrect(c, L, top, b.w, base - top, 6);
  c.clip();
  c.strokeStyle = "rgba(255,235,220,0.45)";
  c.lineWidth = 0.8;
  for (let y = top + 5, r = 0; y < base; y += 5, r++) {
    c.beginPath();
    c.moveTo(L, y);
    c.lineTo(R, y);
    c.stroke();
    for (let x = L + (r % 2) * 6; x < R; x += 12) {
      c.beginPath();
      c.moveTo(x, y - 5);
      c.lineTo(x, y);
      c.stroke();
    }
  }
  c.restore();
  // Roof parapet with a water tank and a planter.
  softBox(c, L - 3, top - 4, b.w + 6, 7, 3.5, "#d48a70", 0.3, -0.18);
  softBox(c, R - 34, top - 20, 18, 16, 5, "#4b5563", 0.35, -0.2);
  capsule(c, [{ x: R - 33, y: top - 4 }, { x: R - 17, y: top - 4 }], 2, "#6b7280");
  softBox(c, L + 10, top - 12, 18, 8, 3, "#b9774f");
  bush(c, L + 19, top - 10, 0.55, "#7cc58a");
  // Two rows of big arched steel windows.
  const nw = 3, ww = (b.w - 24) / nw;
  for (const [y, hh] of [[top + 28, 26], [base - 44, 24]] as const) for (let i = 0; i < nw; i++) {
    const x = L + 12 + i * ww;
    if (y > top + 40 && Math.abs(x + ww / 2 - b.doorX) < ww * 0.7) continue;
    softBox(c, x + 1, y - 2, ww - 4, hh + 4, 9, "#3f5560", 0.25, -0.2);
    glassPane(c, x + 3.5, y, ww - 9, hh, 7);
    c.strokeStyle = "rgba(63,85,96,0.75)";
    c.lineWidth = 1;
    c.beginPath();
    c.moveTo(x + 1 + (ww - 4) / 2, y);
    c.lineTo(x + 1 + (ww - 4) / 2, y + hh);
    c.moveTo(x + 3.5, y + hh / 2);
    c.lineTo(x + ww - 5.5, y + hh / 2);
    c.stroke();
  }
  door(c, b.doorX, base - 40, base, "#3f5560");
  glassPane(c, b.doorX - 8, base - 36, 16, 26, 5);
  softBox(c, L - 4, base - 8, b.w + 8, 10, 4, "#c98a72");
  bush(c, L - 12, base + 6, 0.9, "#86cc8c");
  flower(c, R + 18, base + 4, "#fde68a");
  nameBoard(c, p, (L + R) / 2, top + 7, b.w - 30, "#fde68a", "#6b4a10");
}

function paintKiosk(c: C, p: LivePlace) {
  const b = p.building;
  const L = b.x + 8, R = b.x + b.w - 8, base = b.baseY, top = base - b.wallH + 10;
  const wall = "#cdeee0";
  shadow(c, (L + R) / 2 + 6, base + 2, b.w * 0.6, 9, 0.38);
  // Board on posts above the shop.
  const by = top - b.roofH + 2;
  capsule(c, [{ x: L + 16, y: top }, { x: L + 16, y: by + 8 }], 2.6, "#8a93a3");
  capsule(c, [{ x: R - 16, y: top }, { x: R - 16, y: by + 8 }], 2.6, "#8a93a3");
  sideWall(c, R, top, base, wall);
  softBox(c, L, top, R - L, base - top, 7, wall, 0.3, -0.1);
  softBox(c, L - 3, top - 3, R - L + 6, 7, 3.5, "#9fd8c4", 0.3, -0.18);
  // Shop front with shelves of colourful goods.
  const oL = L + 6, oR = b.doorX - 18, oT = top + 22, oB = base - 18;
  c.fillStyle = "#5a4a5f";
  rrect(c, oL, oT, oR - oL, oB - oT, 6);
  c.fill();
  const goods = ["#f9a8c4", "#fde68a", "#a7e3c8", "#c4b5fd", "#fdba74", "#93c5fd"];
  for (let s = 0; s < 3; s++) {
    const sy = oT + 12 + s * 11;
    if (sy > oB - 2) break;
    for (let x = oL + 4, i = 0; x < oR - 6; x += 6, i++) softBox(c, x, sy - 7, 5, 7, 1.5, goods[(i + s * 2 + p.variant) % 6]!, 0.45, -0.15);
    softBox(c, oL + 2, sy, oR - oL - 4, 2.4, 1, "#d9c2a8");
  }
  softBox(c, oL - 3, oB - 2, oR - oL + 6, 8, 3.5, "#f2c27b", 0.35, -0.2);
  awning(c, L - 4, top + 6, R - L + 8, "#5fb3a3", "#fff4e6");
  // Half-raised roller shutter at the door.
  door(c, b.doorX, top + 26, base, "#7c8796");
  softBox(c, b.doorX - 12, top + 26, 24, 22, 6, "#c9d0d8", 0.35, -0.2);
  c.strokeStyle = "rgba(90,100,115,0.5)";
  c.lineWidth = 0.8;
  for (let y = top + 30; y < top + 47; y += 3.5) {
    c.beginPath();
    c.moveTo(b.doorX - 10, y);
    c.lineTo(b.doorX + 10, y);
    c.stroke();
  }
  // A small cooler on the right.
  const kx = b.doorX + 18;
  if (R - 6 - kx > 14) {
    softBox(c, kx, base - 38, Math.min(26, R - 6 - kx), 36, 5, "#f4f6f8", 0.35, -0.15);
    glassPane(c, kx + 3, base - 34, Math.min(26, R - 6 - kx) - 6, 22, 4);
  }
  softBox(c, L - 4, base - 8, R - L + 8, 10, 4, "#b8c4c0");
  flower(c, R + 14, base + 4, "#f9a8c4");
  bush(c, L - 10, base + 6, 0.8, "#86cc8c");
  nameBoard(c, p, (L + R) / 2, by, b.w - 30, "#f6d04d", "#3b3020");
}

const placeCache = new Map<string, Sprite>();
function placeSprite(p: LivePlace): Sprite {
  const b = p.building;
  const key = `blr|${p.id}|${p.name}|${p.variant}|${b.x}|${b.w}|${b.baseY}|${b.wallH}|${b.roofH}|${b.doorX}`;
  let s = placeCache.get(key);
  if (!s) {
    const x0 = b.x - 40, y0 = b.baseY - b.wallH - b.roofH - 24;
    const paint = [paintGlassOffice, paintDarshini, paintBrickLoft, paintKiosk][p.variant % 4]!;
    s = makeSprite(x0, y0, b.w + 80, b.baseY + 24 - y0, (c) => paint(c, p));
    if (placeCache.size > 40) placeCache.clear();
    placeCache.set(key, s);
  }
  return s;
}

// ── Bengaluru: per-frame bits ────────────────────────────────────────────────

function drawStreetSign(c: C, s: LiveFrame["sign"]) {
  shadow(c, s.x + 4, s.y + 41, 12, 3, 0.35);
  capsule(c, [{ x: s.x, y: s.y + 40 }, { x: s.x, y: s.y }], 4, "#9aa3b2");
  c.fillStyle = "#23704f";
  rrect(c, s.x - 33, s.y - 13, 66, 20, 8);
  c.fill();
  softBox(c, s.x - 33, s.y - 15, 66, 19, 8, "#3fae7a", 0.3, -0.15);
  c.strokeStyle = "rgba(255,255,255,0.9)";
  c.lineWidth = 1;
  rrect(c, s.x - 30, s.y - 12.5, 60, 14, 6);
  c.stroke();
  c.font = `800 8.5px ${FONT}`;
  c.textAlign = "center";
  c.textBaseline = "middle";
  c.fillStyle = "#ffffff";
  c.fillText(s.text, s.x, s.y - 5.5);
}

function drawZebra(c: C, x: number) {
  const pt = GROUND.pathTop, pb = GROUND.pathBottom;
  for (let y = pt + 3; y < pb - 4; y += 8) {
    c.fillStyle = "rgba(60,64,80,0.2)";
    rrect(c, x - 18, y + 1.2, 36, 4, 2);
    c.fill();
    c.fillStyle = "#fbf8f0";
    rrect(c, x - 18, y, 36, 4, 2);
    c.fill();
  }
}

function drawStreetLights(c: C, f: LiveFrame) {
  const L = f.lamps;
  for (let i = 0; i < L.count; i++) {
    const x = L.x0 + i * L.dx;
    shadow(c, x + 3, L.y + 23, 8, 2.2, 0.38);
    softBox(c, x - 4, L.y + 17, 8, 6, 2.5, "#7c8796", 0.35, -0.2);
    capsule(c, [{ x, y: L.y + 18 }, { x, y: L.y - 4 }], 2.4, "#9aa3b2");
    const lit = i < L.lit;
    const gy = L.y - 8;
    if (lit) {
      const fl = f.reducedMotion ? 1 : 1 + 0.06 * Math.sin(f.t * 5 + i * 2.1);
      c.globalCompositeOperation = "lighter";
      const g = c.createRadialGradient(x, gy, 0, x, gy, 16 * fl);
      g.addColorStop(0, "rgba(255,210,120,0.55)");
      g.addColorStop(1, "rgba(255,190,100,0)");
      c.fillStyle = g;
      c.fillRect(x - 17, gy - 17, 34, 34);
      c.globalCompositeOperation = "source-over";
    }
    ball(c, x, gy, 4.6, lit ? "#ffe39a" : "#e6eef5", lit ? 0.7 : 0.5, lit ? -0.05 : -0.2);
    softBox(c, x - 4, gy - 6.5, 8, 2.6, 1.3, "#7c8796");
  }
}

function drawKite(c: C, x: number, y: number, t: number, col: string, tail: string) {
  const sw = Math.sin(t * 1.3 + x * 0.01) * 0.18;
  c.save();
  c.translate(x, y + Math.sin(t * 0.9 + x) * 3);
  c.rotate(sw);
  c.strokeStyle = "rgba(255,255,255,0.75)";
  c.lineWidth = 0.6;
  c.beginPath();
  c.moveTo(0, 9);
  c.quadraticCurveTo(14, 40, 34, 80);
  c.stroke();
  const g = c.createLinearGradient(-7, -9, 7, 9);
  g.addColorStop(0, shade(col, 0.35));
  g.addColorStop(1, shade(col, -0.15));
  c.fillStyle = g;
  c.beginPath();
  c.moveTo(0, -10);
  c.quadraticCurveTo(8, -2, 7, 0);
  c.quadraticCurveTo(4, 5, 0, 9);
  c.quadraticCurveTo(-4, 5, -7, 0);
  c.quadraticCurveTo(-8, -2, 0, -10);
  c.fill();
  c.strokeStyle = "rgba(255,255,255,0.6)";
  c.lineWidth = 0.7;
  c.beginPath();
  c.moveTo(0, -10);
  c.lineTo(0, 9);
  c.moveTo(-7, 0);
  c.lineTo(7, 0);
  c.stroke();
  for (let i = 0; i < 3; i++) ball(c, Math.sin(t * 2 + i) * 2, 12 + i * 4, 1.4, tail, 0.5, -0.1);
  c.restore();
}

/** Vehicles on the road: [lane y, speed (units/s, sign = direction), offset, kind (0..2 autos, 3 bus)]. */
const TRAFFIC: [number, number, number, number][] = [
  [LANE_FAR, 22, 0, 0], [LANE_FAR, 17, 0.55, 1], [LANE_NEAR, -26, 0.2, 2], [LANE_NEAR, -15, 0.7, 3],
];
const AUTO_BODY = ["#7fcf8a", "#8fd49a", "#74c28a"];

function drawTraffic(c: C, f: LiveFrame, inView: (x: number, pad: number) => boolean) {
  const span = f.worldW + 240;
  for (const [y, sp, off, kind] of TRAFFIC) {
    const x = ((((f.reducedMotion ? 0 : f.t) * sp + off * span) % span) + span) % span - 120;
    if (!inView(x, 60)) continue;
    const dir = sp >= 0 ? 0 : 1;
    const s = kind === 3 ? busSprites[dir]! : autoSprites[kind * 2 + dir]!;
    const bob = f.reducedMotion ? 0 : Math.sin(f.t * 9 + off * 10) * 0.35;
    c.drawImage(s.cv, x + s.x, y + s.y + bob, s.w, s.h);
  }
}

function flipped(x: number, y: number, w: number, h: number, paint: (c: C) => void, flip: boolean): Sprite {
  // Sprites are anchored at (0,0) = ground under the middle; s.x/s.y are offsets.
  return makeSprite(x, y, w, h, (c) => {
    if (flip) c.scale(-1, 1);
    paint(c);
  }, 2.5);
}

function ensure() {
  if (skyTile) return;
  skyTile = makeSprite(0, 0, TILE, GROUND.waterTop + 8, paintSky, 2.5);
  viaductTile = makeSprite(0, DECK_TOP - 6, TILE, GROUND.waterBottom + 8 - (DECK_TOP - 6), paintViaduct, 2.5);
  groundTile = makeSprite(0, GROUND.groundY - 6, TILE, WORLD_H - GROUND.groundY + 8, paintGround, 2.5);
  cloudSprite = makeSprite(0, 0, 90, 44, paintCloud, 2);
  trainSprite = makeSprite(-100, -32, 200, 34, paintTrain, 2.5);
  for (let k = 0; k < 3; k++) for (const flip of [false, true]) autoSprites.push(flipped(-24, -42, 48, 46, (c) => paintAuto(c, AUTO_BODY[k]!), flip));
  for (const flip of [false, true]) busSprites.push(flipped(-46, -40, 92, 46, paintBus, flip));
}

/** Everything behind the villagers for Bengaluru (sky to street furniture). */
export function drawBengaluruScene(ctx: C, f: LiveFrame, view: ViewRect) {
  ensure();
  const vx0 = view.x, vx1 = view.x + view.w;
  const inView = (x: number, pad: number) => x > vx0 - pad && x < vx1 + pad;
  const t = f.t;
  const still = f.reducedMotion;

  ctx.fillStyle = "#8fc9e6";
  ctx.fillRect(vx0, view.y, view.w, Math.max(0, -view.y) + 1);
  ctx.fillStyle = "#e6d6c4";
  ctx.fillRect(vx0, WORLD_H - 1, view.w, Math.max(0, view.y + view.h - WORLD_H) + 1);
  const t0 = Math.floor(vx0 / TILE) * TILE;
  for (let x = t0; x < vx1; x += TILE) blit(ctx, skyTile!, x, 0.5);

  // Sun with a warm halo (screen-fixed, far away).
  const sx = vx0 + view.w * 0.16, sy = 50;
  const halo = ctx.createRadialGradient(sx, sy, 6, sx, sy, 120);
  halo.addColorStop(0, "rgba(255,240,200,0.9)");
  halo.addColorStop(0.25, "rgba(255,228,180,0.45)");
  halo.addColorStop(1, "rgba(255,228,180,0)");
  ctx.fillStyle = halo;
  ctx.fillRect(sx - 120, sy - 120, 240, GROUND.waterTop - sy + 120);
  ball(ctx, sx, sy, 15, "#ffe39a", 0.7, -0.08);

  const cl: [number, number, number][] = [[60, 18, 1.0], [300, 40, 0.8], [470, 12, 1.15], [620, 56, 0.65]];
  for (let x = t0 - TILE; x < vx1; x += TILE) for (const [cx0, cy, s] of cl) {
    const cx = x + ((((cx0 + f.drift * (0.4 + s * 0.3)) % TILE) + TILE) % TILE);
    if (cx + 90 * s < vx0 || cx > vx1) continue;
    ctx.drawImage(cloudSprite!.cv, cx, cy, 90 * s, 44 * s);
  }
  // Skyline from the far-bank positions, then kites.
  for (const x of f.farPalms) if (inView(x, 70)) {
    const s = towerSprite(x);
    ctx.drawImage(s.cv, x - 30, GROUND.waterTop + 10 - 60, 70, 62);
  }
  for (let x = t0; x < vx1; x += TILE) {
    drawKite(ctx, x + 200, 34, still ? 0 : t, "#f58aa8", "#fde68a");
    drawKite(ctx, x + 520, 58, still ? 0 : t + 2, "#fbb36a", "#a7e3c8");
  }

  // Viaduct with park greenery, and the metro train on it.
  for (let x = t0; x < vx1; x += TILE) blit(ctx, viaductTile!, x, 0.5);
  if (inView(f.canoeX, 110)) {
    const s = trainSprite!;
    ctx.drawImage(s.cv, f.canoeX + s.x, DECK_TOP + s.y, s.w, s.h);
  }

  for (let x = t0; x < vx1; x += TILE) blit(ctx, groundTile!, x, 0.5);
  const zx = f.sign.x + 70;
  if (inView(zx, 30)) drawZebra(ctx, zx);

  for (const p of f.palms) if (inView(p.x, 90)) blit(ctx, treeSprite(p));
  if (inView(f.sign.x, 50)) drawStreetSign(ctx, f.sign);
  for (const p of f.places) {
    const b = p.building;
    if (!inView(b.x + b.w / 2, b.w / 2 + 50)) continue;
    blit(ctx, placeSprite(p));
    if (!still && p.variant % 4 === 1) {
      const oL = b.x + 8, oB = b.baseY - b.wallH + 50;
      for (let i = 0; i < 2; i++) steam(ctx, t, oL + 12 + i * 12, oB - 10, i + p.variant);
    }
    if (p.urgent > 0) {
      const pulse = still ? 0.5 : f.pulse;
      const g = ctx.createRadialGradient(b.doorX, b.baseY - 22, 2, b.doorX, b.baseY - 22, 34);
      g.addColorStop(0, `rgba(255,110,90,${0.25 + 0.25 * pulse})`);
      g.addColorStop(1, "rgba(255,110,90,0)");
      ctx.fillStyle = g;
      ctx.fillRect(b.doorX - 34, b.baseY - 56, 68, 68);
      const rx = b.x + b.w / 2, ry = b.baseY - b.wallH - b.roofH - 14 - (still ? 0 : Math.abs(Math.sin(t * Math.PI * 1.2)) * 4);
      ball(ctx, rx, ry, 7, "#ff4d3f", 0.5, -0.25);
      ctx.font = `900 10px ${FONT}`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = "#fff";
      ctx.fillText("!", rx, ry + 0.5);
    }
  }
  if (inView(f.lamps.x0 + (f.lamps.count * f.lamps.dx) / 2, 140)) drawStreetLights(ctx, f);
  drawTraffic(ctx, f, inView);
}

// ── subagent companions ──────────────────────────────────────────────────────

/** Companions are drawn at this fraction of a villager's size. */
export const COMP_SCALE = 0.7;
/** At most this many companion figures per villager; the rest become a "+N" ball. */
export const COMP_MAX = 4;
const EMOJI_FONT = `"Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", ${FONT}`;
const CAP = "#a5e8f5";

/** Per-companion hop memory, so a landing squashes and wobbles a little. */
const compHop = new Map<string, { lastAir: number }>();
function compSquash(id: string, jump: number, t: number): number {
  let st = compHop.get(id);
  if (jump > 0.02) {
    if (!st) {
      if (compHop.size > 300) compHop.clear();
      st = { lastAir: t };
      compHop.set(id, st);
    }
    st.lastAir = t;
    return 1 + Math.min(0.14, jump * 0.35); // stretch in the air
  }
  if (st) {
    const d = t - st.lastAir;
    if (d < 0.6) return 1 - 0.22 * Math.exp(-d * 8) * Math.cos(d * 24);
    if (d > 4) compHop.delete(id);
  }
  return 1;
}

/** Soft tether from the parent to a companion on an errand: hidden at its side, fading as it goes far. */
export function drawCompanionTether(c: C, v: LiveVillager, k: LiveCompanion, t: number, still: boolean) {
  if (k.away <= 0.001) return;
  const a = 0.65 * (1 - 0.55 * Math.min(1, k.away)) * Math.min(1, k.away * 6) * k.alpha * v.alpha;
  if (a <= 0.01) return;
  const x0 = v.x, y0 = v.y - 22, x1 = k.x, y1 = k.y - 16;
  const mx = (x0 + x1) / 2, my = Math.max(y0, y1) + 8 + Math.abs(x1 - x0) * 0.06;
  c.save();
  c.globalAlpha = a;
  c.lineCap = "round";
  c.strokeStyle = "rgba(255,255,255,0.9)";
  c.lineWidth = 2.4;
  c.beginPath();
  c.moveTo(x0, y0);
  c.quadraticCurveTo(mx, my, x1, y1);
  c.stroke();
  c.strokeStyle = "#45bccb";
  c.lineWidth = 1.1;
  c.setLineDash([3, 3.5]);
  c.lineDashOffset = still ? 0 : -t * 8;
  c.stroke();
  c.setLineDash([]);
  c.restore();
}

/** The small clay helper figure (contact shadow, walk cycle, squash, fade, mint cap). */
export function drawCompanionFigure(c: C, v: LiveVillager, k: LiveCompanion, t: number, still: boolean) {
  const sy = still ? 1 : compSquash(`${v.id}/${k.id}`, k.jump, t);
  const jump = still ? 0 : k.jump;
  c.save();
  c.globalAlpha = k.alpha * v.alpha;
  c.translate(k.x, k.y);
  c.scale(COMP_SCALE, COMP_SCALE);
  const leaving = k.activity === "leaving";
  const frame = {
    id: k.id, name: k.label, status: "working" as const, x: 0, y: 0, facing: k.facing, moving: k.moving,
    phase: k.phase, jump, label: k.label,
    shirt: shade(v.shirt, 0.2), mundu: shade(v.mundu, 0.25), skin: v.skin,
    carry: k.activity === "busy" && k.working ? ("laptop" as const) : undefined,
  };
  clayVillager(c, frame, still ? 0 : t + k.phase, {
    happy: leaving, waiting: k.activity === "wait", hair: shade(v.hair, 0.12), bun: false,
    sy, raise: leaving ? Math.min(1, jump * 3) : 0,
  });
  // A mint helper cap on the head (rides the same squash) so companions read as helpers.
  const sk = skeleton(frame);
  const fc = k.facing;
  const pivot = sk.p.bob;
  c.translate(0, pivot);
  c.scale(1 + (1 - sy) * 0.9, sy);
  c.translate(0, -pivot);
  const hx = sk.head.x + fc * 0.5, hy = sk.neck.y - 10.5;
  c.save();
  c.beginPath();
  c.rect(hx - 16, hy - 18, 32, 14);
  c.clip();
  ball(c, hx, hy, 12.9, CAP, 0.55, -0.22);
  c.restore();
  softBox(c, hx - 12 + fc * 4, hy - 6, 24, 4, 2, shade(CAP, -0.12), 0.3, -0.15);
  ball(c, hx - fc * 1.5, hy - 13.5, 3, "#ffffff", 0.4, -0.15);
  c.restore();
}

function star(c: C, x: number, y: number, r: number, col: string) {
  c.fillStyle = col;
  c.beginPath();
  c.moveTo(x, y - r);
  c.quadraticCurveTo(x, y, x + r, y);
  c.quadraticCurveTo(x, y, x, y + r);
  c.quadraticCurveTo(x, y, x - r, y);
  c.quadraticCurveTo(x, y, x, y - r);
  c.fill();
}

/** A soft clay bubble with a glyph (emoji or text) inside. */
function bubble(c: C, x: number, y: number, r: number, col: string, glyph: string, ink: string, emoji: boolean) {
  shadow(c, x + 1, y + r + 1.5, r * 0.8, 1.2, 0.18);
  ball(c, x, y, r, col, 0.55, -0.18);
  c.textAlign = "center";
  c.textBaseline = "middle";
  c.font = emoji ? `${(r * 1.25).toFixed(1)}px ${EMOJI_FONT}` : `900 ${(r * (glyph.length > 1 ? 1.05 : 1.35)).toFixed(1)}px ${FONT}`;
  c.fillStyle = ink;
  c.fillText(glyph, x, y + (emoji ? 0.6 : 0.4));
}

/** Everything that floats over a companion: icon, puffs, ? / !, sparkles, and the hand-over burst at the parent. */
export function drawCompanionOverlay(c: C, v: LiveVillager, k: LiveCompanion, t: number, still: boolean) {
  const a = k.alpha * v.alpha;
  if (a <= 0.02) return;
  c.save();
  c.globalAlpha = a;
  const lift = (still ? 0 : k.jump) * 26 * COMP_SCALE;
  const headTop = k.y - 74 * COMP_SCALE - lift;
  const bobY = still ? 0 : Math.sin(t * 4 + k.x * 0.1) * 1.6;
  const bx = k.x + k.facing * 2, by = headTop - 9 + bobY;
  if (k.activity === "wait") bubble(c, bx, by, 6.2, "#fde68a", "?", "#6b4a10", false);
  else if (k.activity === "error") bubble(c, bx, by, 6.2, "#f25c54", "!", "#ffffff", false);
  else if (k.working) {
    ball(c, k.x + k.facing * 1.2, headTop - 1.5 + bobY * 0.4, 1.3, "#ffffff", 0.3, -0.1);
    bubble(c, bx, by - 1, 7.8, "#fffaf2", k.icon, "#3b2a1a", true);
  }
  if (k.activity === "busy" && k.working && !still) {
    for (let i = 0; i < 3; i++) {
      const u = (t * 0.9 + i / 3) % 1;
      const px = k.x + k.facing * (9 + u * 5) + Math.sin(t * 3 + i * 2) * 1.5;
      const py = k.y - 24 - u * 16;
      c.globalAlpha = a * (1 - u) * 0.8;
      ball(c, px, py, 1.4 + u * 2.2, "#ffffff", 0.3, -0.12);
    }
    c.globalAlpha = a;
  }
  if (k.activity === "leaving") {
    const cols = ["#fde68a", "#f9a8c4", "#a5e8f5"];
    for (let i = 0; i < 4; i++) {
      const ang = (still ? 0 : t * 3) + i * 1.57;
      const r = 9 + (i % 2) * 3;
      star(c, k.x + Math.cos(ang) * r - k.facing * 3, headTop + 8 + Math.sin(ang) * r * 0.6, 2.4 + (i % 2), cols[i % 3]!);
    }
    for (let i = 1; i <= 3; i++) star(c, k.x - k.facing * (6 + i * 7), k.y - 8 - i * 2, 2.4 - i * 0.4, "#fde68a");
  }
  c.restore();
  if (k.handover > 0) {
    // Hand-over: a burst of sparkles at the parent's hands.
    const h = k.handover, u = 1 - h;
    const cx = v.x + v.facing * 6, cy = v.y - 38;
    c.save();
    c.globalAlpha = Math.min(1, h * 1.6) * v.alpha;
    const g = c.createRadialGradient(cx, cy, 0, cx, cy, 10 + u * 8);
    g.addColorStop(0, `rgba(255,250,220,${(0.75 * h).toFixed(3)})`);
    g.addColorStop(1, "rgba(255,250,220,0)");
    c.fillStyle = g;
    c.fillRect(cx - 20, cy - 20, 40, 40);
    const cols = ["#fde68a", "#7fd6e3", "#f9a8c4", "#a7e3c8"];
    for (let i = 0; i < 8; i++) {
      const ang = (i / 8) * Math.PI * 2 + 0.3;
      const r = 4 + u * 16;
      star(c, cx + Math.cos(ang) * r, cy + Math.sin(ang) * r * 0.8, 1.6 + 1.8 * h, cols[i % 4]!);
    }
    c.restore();
  }
}

/** The "+N" clay ball for companions beyond COMP_MAX. */
export function drawCompanionMore(c: C, v: LiveVillager) {
  const n = v.companions.length - COMP_MAX;
  if (n <= 0) return;
  c.save();
  c.globalAlpha = v.alpha;
  bubble(c, v.x - v.facing * 16, v.y - 5, 6.5, CAP, `+${n}`, "#1f4e66", false);
  c.restore();
}

export interface Box { x: number; y: number; w: number; h: number }

/** Tiny labels under the companions' feet, placed greedily in rows so they don't collide (boxes is shared across villagers). */
export function drawCompanionLabels(c: C, v: LiveVillager, ks: LiveCompanion[], boxes: Box[]) {
  c.save();
  c.font = `700 5.6px ${FONT}`;
  c.textAlign = "center";
  c.textBaseline = "middle";
  const H = 8.5;
  for (const k of ks) {
    const a = k.alpha * v.alpha;
    if (a < 0.15) continue;
    const text = fitText(c, k.label, 86);
    const w = c.measureText(text).width + 8;
    const x = k.x - w / 2;
    let y = k.y + 4;
    for (let i = 0; i < 6 && boxes.some((b) => x < b.x + b.w && x + w > b.x && y < b.y + b.h && y + H > b.y); i++) y += H + 1;
    boxes.push({ x, y, w, h: H });
    c.globalAlpha = Math.min(1, a);
    c.fillStyle = "rgba(90,58,40,0.2)";
    rrect(c, x, y + 0.9, w, H, H / 2);
    c.fill();
    c.fillStyle = k.activity === "error" ? "#ffe1dc" : "rgba(255,250,242,0.95)";
    rrect(c, x, y, w, H, H / 2);
    c.fill();
    c.fillStyle = k.activity === "error" ? "#9b1c1c" : "#3d4f5c";
    c.fillText(text, k.x, y + H / 2 + 0.3);
  }
  c.restore();
}
