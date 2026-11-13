import { BODY, hash, rng, skeleton } from "../scene";
import { asVillagerFrame } from "./reference";
import { blrPlace, blrScene, blrSky, blrSteamSpots, companionFigure, companionHandover, companionLabel, companionTether } from "./flatVectorKit";
import { GROUND, WORLD_H, type LiveCompanion, type LiveFrame, type LivePlace, type LiveStyle, type LiveVillager, type ViewRect } from "./types";
import { PROP_LOOKS, drawStations } from "./stationKit";

/**
 * 6 · Flat Vector, live village version. A clean explainer illustration at
 * dusk: flat shapes with no outlines, a navy/indigo palette with warm accents,
 * soft light cones, long shadows, rounded villagers and pill labels.
 *
 * Caching: the sky/hills/water/ground band is one 640-wide tile (painted once
 * at 2×, periodic so it repeats seamlessly); each place's building, street lamp
 * and light cones are one offscreen canvas keyed by variant + name.
 * Bengaluru (f.theme) swaps the scenery via ./flatVectorKit.ts; villagers,
 * labels, moon, clouds and HUD are shared.
 */

const TILE = 640;
const FONT = "ui-sans-serif, system-ui, sans-serif";

const C = {
  skyTop: "#141638",
  skyMid: "#2a2866",
  skyLow: "#6b3f7c",
  skyGlow: "#e9886a",
  hillFar: "#3a2f6e",
  hillNear: "#2c285f",
  farPalm: "#221d52",
  water: "#2e2f70",
  waterDeep: "#1f2158",
  ground: "#2a2b62",
  groundFront: "#212255",
  path: "#3a3674",
  pathEdge: "#45407f",
  warm: "#ffcf7a",
  warmDeep: "#ffb057",
  moon: "#fbeec1",
  navy: "#1b1d48",
  ink: "#1a1530",
  leaf: "#1f7a6a",
  leafDark: "#155a50",
  trunk: "#5b3b5e",
  brass: "#d39b4e",
  post: "#4b3a66",
};

/** Per-variant building palettes and props. */
const VARIANTS = [
  { wall: "#d9774f", roof: "#7a2e45", roofLight: "#913a55", ridge: "#5e2236", prop: "tea" },
  { wall: "#c9a24a", roof: "#5a3a2a", roofLight: "#6e4a36", ridge: "#432a1e", prop: "windows" },
  { wall: "#7f93c4", roof: "#2f3b6e", roofLight: "#3a4882", ridge: "#232c55", prop: "awning" },
  { wall: "#b5577a", roof: "#6b2c4a", roofLight: "#81365a", ridge: "#52203a", prop: "plants" },
] as const;

// ── offscreen caches ─────────────────────────────────────────────────────────

function makeCanvas(w: number, h: number, paint: (c: CanvasRenderingContext2D) => void): HTMLCanvasElement {
  const cv = document.createElement("canvas");
  cv.width = Math.ceil(w * 2);
  cv.height = Math.ceil(h * 2);
  const c = cv.getContext("2d")!;
  c.scale(2, 2);
  paint(c);
  return cv;
}

let tileLayer: HTMLCanvasElement | null = null;
const placeCache = new Map<string, HTMLCanvasElement>();
/** Place canvas extent relative to the building's left x / world y. */
const PL = { dx: -96, y: 140, w: 360, h: 212 };

function leaf(c: CanvasRenderingContext2D, x: number, y: number, ang: number, len: number, wid: number) {
  const ex = x + Math.cos(ang) * len;
  const ey = y + Math.sin(ang) * len;
  const nx = -Math.sin(ang) * wid;
  const ny = Math.cos(ang) * wid;
  const mx = (x + ex) / 2;
  const my = (y + ey) / 2 - len * 0.12;
  c.beginPath();
  c.moveTo(x, y);
  c.quadraticCurveTo(mx + nx, my + ny, ex, ey);
  c.quadraticCurveTo(mx - nx, my - ny, x, y);
  c.fill();
}

/** One seamless 640-wide band: sky, stars, hills, water, ground and path. */
function paintTile(c: CanvasRenderingContext2D) {
  const hy = GROUND.waterTop;
  const g = c.createLinearGradient(0, 0, 0, hy);
  g.addColorStop(0, C.skyTop);
  g.addColorStop(0.5, C.skyMid);
  g.addColorStop(0.82, C.skyLow);
  g.addColorStop(1, C.skyGlow);
  c.fillStyle = g;
  c.fillRect(0, 0, TILE, hy);

  const r = rng(61);
  for (let i = 0; i < 46; i++) {
    const x = r() * TILE, y = r() * 92, s = 0.5 + r() * 0.9;
    c.fillStyle = `rgba(255,240,210,${0.25 + r() * 0.5})`;
    c.beginPath();
    c.arc(x, y, s * 0.6, 0, Math.PI * 2);
    c.fill();
  }

  // Hills use whole periods over the tile so it repeats seamlessly.
  const k = (n: number) => (n * Math.PI * 2) / TILE;
  c.fillStyle = C.hillFar;
  c.beginPath();
  c.moveTo(0, hy);
  for (let x = 0; x <= TILE; x += 8) c.lineTo(x, hy - 14 - 9 * Math.sin(x * k(1)) - 5 * Math.sin(x * k(3) + 1));
  c.lineTo(TILE, hy);
  c.fill();
  c.fillStyle = C.hillNear;
  c.beginPath();
  c.moveTo(0, hy);
  for (let x = 0; x <= TILE; x += 8) c.lineTo(x, hy - 5 - 4 * Math.sin(x * k(2) + 2));
  c.lineTo(TILE, hy);
  c.fill();

  const wg = c.createLinearGradient(0, GROUND.waterTop, 0, GROUND.waterBottom);
  wg.addColorStop(0, "#4a3f84");
  wg.addColorStop(0.25, C.water);
  wg.addColorStop(1, C.waterDeep);
  c.fillStyle = wg;
  c.fillRect(0, GROUND.waterTop, TILE, GROUND.waterBottom - GROUND.waterTop);

  c.fillStyle = C.ground;
  c.fillRect(0, GROUND.groundY, TILE, WORLD_H - GROUND.groundY);
  c.fillStyle = "#33356e";
  c.fillRect(0, GROUND.groundY, TILE, 4);
  c.fillStyle = C.pathEdge;
  c.fillRect(0, GROUND.pathTop - 3, TILE, GROUND.pathBottom - GROUND.pathTop + 6);
  c.fillStyle = C.path;
  c.fillRect(0, GROUND.pathTop, TILE, GROUND.pathBottom - GROUND.pathTop);
  c.fillStyle = C.groundFront;
  c.fillRect(0, GROUND.pathBottom + 3, TILE, WORLD_H - GROUND.pathBottom - 3);
  const r2 = rng(17);
  for (let i = 0; i < 22; i++) {
    const x = r2() * (TILE - 16) + 8, y = 206 + r2() * (GROUND.pathTop - 216);
    c.fillStyle = r2() > 0.5 ? "#2f3f70" : "#34336f";
    c.beginPath();
    c.ellipse(x, y, 3 + r2() * 4, 1.2 + r2(), 0, 0, Math.PI * 2);
    c.fill();
  }
  for (let i = 0; i < 14; i++) {
    const x = r2() * (TILE - 10) + 5, y = GROUND.pathTop + 6 + r2() * 48;
    c.fillStyle = "rgba(255,255,255,0.05)";
    c.beginPath();
    c.ellipse(x, y, 2 + r2() * 3, 0.8, 0, 0, Math.PI * 2);
    c.fill();
  }
}

/** One place: long shadow, door light, building, roof sign with the project name, street lamp and its cone. */
function paintPlace(c: CanvasRenderingContext2D, p: LivePlace) {
  const b = p.building;
  const V = VARIANTS[p.variant % 4]!;
  const top = b.baseY - b.wallH;
  const base = b.baseY;
  c.textAlign = "center";
  c.textBaseline = "middle";

  // Long shadow towards the lower left.
  c.fillStyle = "rgba(10,10,40,0.28)";
  c.beginPath();
  c.moveTo(b.x, base);
  c.lineTo(b.x + b.w, base);
  c.lineTo(b.x + b.w - 60, base + 20);
  c.lineTo(b.x - 60, base + 20);
  c.fill();

  // Warm light spilling from the door.
  const lg = c.createLinearGradient(0, base, 0, base + 60);
  lg.addColorStop(0, "rgba(255,190,110,0.38)");
  lg.addColorStop(1, "rgba(255,190,110,0)");
  c.fillStyle = lg;
  c.beginPath();
  c.moveTo(b.doorX - 13, base);
  c.lineTo(b.doorX + 13, base);
  c.lineTo(b.doorX + 50, base + 60);
  c.lineTo(b.doorX - 50, base + 60);
  c.fill();

  // Walls with a flat shaded side.
  c.fillStyle = V.wall;
  c.fillRect(b.x, top, b.w, b.wallH);
  c.fillStyle = "rgba(0,0,0,0.16)";
  c.fillRect(b.x + b.w - 20, top, 20, b.wallH);
  c.fillStyle = "rgba(0,0,0,0.12)";
  c.fillRect(b.x, base - 6, b.w, 6);

  // Window with glow (right of the door).
  const wx = b.doorX + 18, wy = top + 20;
  const glow = c.createRadialGradient(wx + 9, wy + 9, 2, wx + 9, wy + 9, 30);
  glow.addColorStop(0, "rgba(255,207,122,0.35)");
  glow.addColorStop(1, "rgba(255,207,122,0)");
  c.fillStyle = glow;
  c.fillRect(wx - 22, wy - 22, 62, 62);
  c.fillStyle = C.warm;
  c.beginPath();
  c.roundRect(wx, wy, 18, 18, 3);
  c.fill();
  c.fillStyle = "rgba(0,0,0,0.22)";
  c.fillRect(wx + 8.2, wy, 1.6, 18);

  // Door with warm interior.
  c.fillStyle = C.warmDeep;
  c.beginPath();
  c.roundRect(b.doorX - 13, top + 22, 26, b.wallH - 22, [8, 8, 0, 0]);
  c.fill();
  c.fillStyle = "rgba(255,230,170,0.6)";
  c.beginPath();
  c.roundRect(b.doorX - 9, top + 27, 18, 14, 6);
  c.fill();

  // Variant props on the left wall.
  if (V.prop === "tea") {
    c.fillStyle = "#8a3f2f";
    c.fillRect(b.doorX - 13, top + 52, 26, 6);
    c.beginPath();
    c.roundRect(b.x + 6, top + 46, 64, 7, 3);
    c.fill();
    c.fillStyle = "rgba(0,0,0,0.18)";
    c.fillRect(b.x + 6, top + 53, 64, b.wallH - 53);
    for (let i = 0; i < 3; i++) {
      const gx = b.x + 20 + i * 14;
      c.fillStyle = "rgba(255,255,255,0.55)";
      c.beginPath();
      c.moveTo(gx - 3, top + 38);
      c.lineTo(gx + 3, top + 38);
      c.lineTo(gx + 2.2, top + 46);
      c.lineTo(gx - 2.2, top + 46);
      c.fill();
      c.fillStyle = "#c8873a";
      c.fillRect(gx - 2.5, top + 41, 5, 5);
    }
  } else if (V.prop === "windows") {
    for (let i = 0; i < 2; i++) {
      const x = b.x + 12 + i * 32;
      c.fillStyle = C.warm;
      c.beginPath();
      c.roundRect(x, top + 22, 22, 24, [11, 11, 2, 2]);
      c.fill();
      c.fillStyle = "rgba(0,0,0,0.22)";
      c.fillRect(x + 10.2, top + 22, 1.6, 24);
      c.fillRect(x, top + 33, 22, 1.4);
    }
    c.fillStyle = "rgba(0,0,0,0.14)";
    c.fillRect(b.x + 8, top + 50, 58, 4);
  } else if (V.prop === "awning") {
    for (let i = 0; i < 6; i++) {
      c.fillStyle = i % 2 ? "#f6f4ff" : "#e05a4a";
      c.beginPath();
      c.roundRect(b.x + 4 + i * 11, top + 28, 11, 12, [0, 0, 5.5, 5.5]);
      c.fill();
    }
    c.fillStyle = "#4a3a5e";
    c.beginPath();
    c.roundRect(b.x + 6, top + 48, 62, 7, 3);
    c.fill();
    const fruit = ["#ffb057", "#a3e635", "#ff7a59", "#ffd166"];
    for (let i = 0; i < 8; i++) {
      c.fillStyle = fruit[i % 4]!;
      c.beginPath();
      c.arc(b.x + 11 + i * 7.5, top + 46, 3, 0, Math.PI * 2);
      c.fill();
    }
  } else {
    c.fillStyle = C.warm;
    c.beginPath();
    c.roundRect(b.x + 18, top + 22, 34, 20, 4);
    c.fill();
    c.fillStyle = "rgba(0,0,0,0.2)";
    c.fillRect(b.x + 34.2, top + 22, 1.6, 20);
    for (let i = 0; i < 3; i++) {
      const px = b.x + 14 + i * 22;
      c.fillStyle = C.leaf;
      for (let j = 0; j < 4; j++) leaf(c, px, base - 9, -Math.PI / 2 + (j - 1.5) * 0.45, 12, 3);
      c.fillStyle = "#a8573a";
      c.beginPath();
      c.roundRect(px - 5, base - 10, 10, 10, [1, 1, 3, 3]);
      c.fill();
    }
  }

  // Roof: flat trapezoid in bands, with a ridge.
  c.fillStyle = V.roof;
  c.beginPath();
  c.moveTo(b.x - 16, top + 4);
  c.lineTo(b.x + 26, top - b.roofH);
  c.lineTo(b.x + b.w - 26, top - b.roofH);
  c.lineTo(b.x + b.w + 16, top + 4);
  c.closePath();
  c.fill();
  c.fillStyle = V.roofLight;
  for (let i = 0; i < 4; i++) {
    const y0 = top - b.roofH + 6 + i * 10;
    const kk = (y0 - (top - b.roofH)) / (b.roofH + 4);
    const xl = b.x + 26 - 42 * kk;
    const xr = b.x + b.w - 26 + 42 * kk;
    c.fillRect(xl, y0, xr - xl, 3);
  }
  c.fillStyle = V.ridge;
  c.beginPath();
  c.roundRect(b.x + 22, top - b.roofH - 3, b.w - 44, 5, 2.5);
  c.fill();
  c.fillStyle = "rgba(0,0,0,0.2)";
  c.fillRect(b.x, top + 4, b.w, 3);

  // Sign: a cream pill on the roof face with the project's name.
  c.font = `800 8.5px ${FONT}`;
  const sw = Math.min(b.w + 10, c.measureText(p.name).width + 18);
  const sx = b.x + b.w / 2, sy = top - b.roofH - 3; // on the ridge, clear of villager tags
  c.fillStyle = "rgba(10,10,40,0.3)";
  c.beginPath();
  c.roundRect(sx - sw / 2 + 1.5, sy - 8 + 2, sw, 16, 8);
  c.fill();
  c.fillStyle = "#fbe8c8";
  c.beginPath();
  c.roundRect(sx - sw / 2, sy - 8, sw, 16, 8);
  c.fill();
  c.fillStyle = C.navy;
  c.fillText(p.name, sx, sy + 0.6, sw - 12);

  // Street lamp to the right, its cone falling across the path.
  const lx = b.x + b.w + 30, ly = top + 26, lb = base + 12;
  const cone = c.createLinearGradient(0, ly, 0, GROUND.pathBottom);
  cone.addColorStop(0, "rgba(255,214,140,0.4)");
  cone.addColorStop(1, "rgba(255,214,140,0.02)");
  c.fillStyle = cone;
  c.beginPath();
  c.moveTo(lx + 9, ly + 3);
  c.lineTo(lx + 17, ly + 3);
  c.lineTo(lx + 50, GROUND.pathBottom);
  c.lineTo(lx - 24, GROUND.pathBottom);
  c.fill();
  c.fillStyle = "rgba(255,214,140,0.15)";
  c.beginPath();
  c.ellipse(lx + 13, GROUND.pathBottom - 6, 38, 6, 0, 0, Math.PI * 2);
  c.fill();
  c.fillStyle = "rgba(10,10,40,0.28)";
  c.beginPath();
  c.moveTo(lx - 2, lb);
  c.lineTo(lx + 2, lb);
  c.lineTo(lx - 40, lb + 10);
  c.lineTo(lx - 43, lb + 9);
  c.fill();
  c.fillStyle = C.post;
  c.beginPath();
  c.roundRect(lx - 1.8, ly - 6, 3.6, lb - ly + 6, 1.8);
  c.roundRect(lx - 1, ly - 6, 15, 2.6, 1.3);
  c.roundRect(lx - 4, lb - 4, 8, 5, 2);
  c.fill();
  c.fillStyle = "#3a2d55";
  c.beginPath();
  c.moveTo(lx + 7, ly - 4);
  c.lineTo(lx + 19, ly - 4);
  c.lineTo(lx + 17, ly + 1);
  c.lineTo(lx + 9, ly + 1);
  c.fill();
  const bulb = c.createRadialGradient(lx + 13, ly + 2, 0.5, lx + 13, ly + 2, 16);
  bulb.addColorStop(0, "rgba(255,226,160,0.6)");
  bulb.addColorStop(1, "rgba(255,226,160,0)");
  c.fillStyle = bulb;
  c.fillRect(lx - 3, ly - 14, 32, 32);
  c.fillStyle = "#fff1c9";
  c.beginPath();
  c.ellipse(lx + 13, ly + 2, 4, 2.2, 0, 0, Math.PI * 2);
  c.fill();
}

function placeLayer(p: LivePlace): HTMLCanvasElement {
  const key = `${p.variant}|${p.name}|${p.building.w}|${p.building.wallH}`;
  let cv = placeCache.get(key);
  if (!cv) {
    if (placeCache.size > 48) placeCache.clear();
    const ox = p.building.x + PL.dx;
    cv = makeCanvas(PL.w, PL.h, (c) => {
      c.translate(-ox, -PL.y);
      paintPlace(c, p);
    });
    placeCache.set(key, cv);
  }
  return cv;
}

// ── per-frame pieces ─────────────────────────────────────────────────────────

function farPalm(ctx: CanvasRenderingContext2D, x: number, base: number, h: number) {
  ctx.fillStyle = C.farPalm;
  ctx.beginPath();
  ctx.moveTo(x - 1.6, base);
  ctx.lineTo(x + 1.2, base - h);
  ctx.lineTo(x + 2.8, base - h);
  ctx.lineTo(x + 1.6, base);
  ctx.fill();
  for (let i = 0; i < 6; i++) leaf(ctx, x + 2, base - h, -Math.PI + (i / 5) * Math.PI + 0.25 * Math.sin(i * 3), h * 0.42, 3);
}

function palm(ctx: CanvasRenderingContext2D, x: number, baseY: number, h: number, lean: number, t: number, seed: number) {
  const topX = x + lean * h;
  const topY = baseY - h;
  ctx.fillStyle = "rgba(10,10,40,0.22)";
  ctx.beginPath();
  ctx.moveTo(x - 3, baseY);
  ctx.lineTo(x + 3, baseY);
  ctx.lineTo(x - h * 0.55, baseY + h * 0.14);
  ctx.lineTo(x - h * 0.6, baseY + h * 0.12);
  ctx.fill();
  ctx.fillStyle = C.trunk;
  ctx.beginPath();
  ctx.moveTo(x - 4.5, baseY);
  ctx.quadraticCurveTo(x + lean * h * 0.2 - 3, baseY - h * 0.5, topX - 2, topY);
  ctx.lineTo(topX + 2, topY);
  ctx.quadraticCurveTo(x + lean * h * 0.2 + 3, baseY - h * 0.5, x + 4.5, baseY);
  ctx.fill();
  ctx.fillStyle = "rgba(255,255,255,0.08)";
  for (let k = 1; k < 9; k++) {
    const u = k / 9;
    const px = (1 - u) * (1 - u) * x + 2 * u * (1 - u) * (x + lean * h * 0.2) + u * u * topX;
    ctx.fillRect(px - 3.5 * (1 - u * 0.5), baseY - h * u, 7 * (1 - u * 0.5), 1.3);
  }
  const sway = Math.sin(t * 0.9 + seed) * 0.05;
  for (let i = 0; i < 8; i++) {
    const a = -Math.PI + (i / 7) * Math.PI + sway + (i % 2 ? 0.2 : -0.1);
    const droop = Math.abs(Math.cos(a)) * 0.55;
    ctx.fillStyle = i % 2 ? C.leafDark : C.leaf;
    leaf(ctx, topX, topY, a + droop * Math.sign(Math.cos(a)), h * (i % 2 ? 0.34 : 0.4), 9);
  }
  ctx.fillStyle = "#6e4a3a";
  for (let i = 0; i < 3; i++) {
    ctx.beginPath();
    ctx.arc(topX - 3 + i * 3, topY + 4, 2.4, 0, Math.PI * 2);
    ctx.fill();
  }
}

function steam(ctx: CanvasRenderingContext2D, x: number, y: number, t: number, seed: number) {
  ctx.strokeStyle = "rgba(255,240,220,0.32)";
  ctx.lineWidth = 1.6;
  ctx.lineCap = "round";
  for (let k = 0; k < 2; k++) {
    const ph = (t * 0.6 + k * 0.5 + seed * 0.37) % 1;
    const yy = y - ph * 12;
    ctx.globalAlpha = Math.sin(ph * Math.PI);
    ctx.beginPath();
    ctx.moveTo(x, yy);
    ctx.bezierCurveTo(x + 3, yy - 3, x - 3, yy - 5, x + Math.sin(t * 2 + seed) * 1.5, yy - 9);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

/** Smoothed "arms up" level per finished villager, so arms don't flick between hops. */
const cheer = new Map<string, { k: number; t: number }>();

function idHash(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return h >>> 0;
}

function villager(ctx: CanvasRenderingContext2D, v: LiveVillager, t: number, pulse: number) {
  const s = skeleton(asVillagerFrame(v));
  const f = v.facing;
  const idle = v.status === "idle";

  // Selection: a soft spotlight from above plus a ring; hover: a lighter ring.
  if (v.selected) {
    const sg = ctx.createLinearGradient(0, v.y - 110, 0, v.y + 4);
    sg.addColorStop(0, "rgba(255,244,214,0)");
    sg.addColorStop(1, "rgba(255,244,214,0.3)");
    ctx.fillStyle = sg;
    ctx.beginPath();
    ctx.moveTo(v.x - 6, v.y - 110);
    ctx.lineTo(v.x + 6, v.y - 110);
    ctx.lineTo(v.x + 22, v.y + 3);
    ctx.lineTo(v.x - 22, v.y + 3);
    ctx.fill();
  }
  if (v.selected || v.hovered) {
    ctx.fillStyle = v.selected ? "rgba(255,244,214,0.55)" : "rgba(255,244,214,0.25)";
    ctx.beginPath();
    ctx.ellipse(v.x, v.y + 1, 17, 5, 0, 0, Math.PI * 2);
    ctx.ellipse(v.x, v.y + 1, 13.5, 3.4, 0, 0, Math.PI * 2, true);
    ctx.fill("evenodd");
  }

  // Long shadow to the lower left, flattening as the villager jumps.
  ctx.save();
  ctx.translate(v.x, v.y);
  ctx.transform(1, 0, 1.1, -0.22, 0, 0);
  ctx.fillStyle = `rgba(10,10,40,${0.26 * (1 - v.jump * 0.5)})`;
  ctx.beginPath();
  ctx.roundRect(-7, 2, 14, 56, 6);
  ctx.moveTo(7, 64);
  ctx.arc(0, 64, 7, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  ctx.fillStyle = "rgba(10,10,40,0.3)";
  ctx.beginPath();
  ctx.ellipse(v.x, v.y + 1, 10 - v.jump * 4, 2.4, 0, 0, Math.PI * 2);
  ctx.fill();

  // Cheer: arms swing up in a V while a finished villager hops.
  const c0 = cheer.get(v.id) ?? { k: 0, t };
  // Rise fast while hopping, fall slowly, so the brief jump = 0 between hops doesn't drop the arms.
  const target = v.status === "finished" && v.jump > 0 ? 1 : 0;
  const dt = Math.max(0, Math.min(0.1, t - c0.t));
  const k = target > c0.k ? Math.min(1, c0.k + dt * 8) : Math.max(0, c0.k - dt * 2.5);
  cheer.set(v.id, { k, t });
  if (cheer.size > 200) cheer.clear();
  if (k > 0) {
    const mix = (a: { x: number; y: number }, b: { x: number; y: number }) => ({ x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k });
    s.elbowF = mix(s.elbowF, { x: s.shoulder.x + f * 7, y: s.shoulder.y - 6 });
    s.handF = mix(s.handF, { x: s.shoulder.x + f * 11, y: s.shoulder.y - 16 });
    s.elbowB = mix(s.elbowB, { x: s.shoulder.x - f * 7, y: s.shoulder.y - 6 });
    s.handB = mix(s.handB, { x: s.shoulder.x - f * 11, y: s.shoulder.y - 16 });
  }

  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  const limb = (pts: { x: number; y: number }[], col: string, w: number) => {
    ctx.strokeStyle = col;
    ctx.lineWidth = w;
    ctx.beginPath();
    pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
    ctx.stroke();
  };
  const shade = "rgba(0,0,0,0.18)";

  limb([s.hip, s.kneeB, s.footB], v.skin, 4.4);
  limb([s.hip, s.kneeB, s.footB], shade, 4.4);
  limb([s.hip, s.kneeF, s.footF], v.skin, 4.4);
  limb([s.shoulder, s.elbowB, s.handB], v.skin, 3.6);
  limb([s.shoulder, s.elbowB, s.handB], shade, 3.6);
  limb([s.shoulder, s.elbowB], v.shirt, 4.4);

  // Mundu.
  const kneeY = (s.kneeF.y + s.kneeB.y) / 2;
  const left = Math.min(s.kneeF.x, s.kneeB.x) - 5;
  const right = Math.max(s.kneeF.x, s.kneeB.x) + 5;
  ctx.fillStyle = v.mundu;
  ctx.beginPath();
  ctx.moveTo(s.hip.x - 7, s.hip.y - 3);
  ctx.lineTo(s.hip.x + 7, s.hip.y - 3);
  ctx.quadraticCurveTo(right + 1, kneeY - 2, right, kneeY + 6);
  ctx.lineTo(left, kneeY + 6);
  ctx.quadraticCurveTo(left - 1, kneeY - 2, s.hip.x - 7, s.hip.y - 3);
  ctx.fill();
  ctx.fillStyle = shade;
  ctx.fillRect(left, kneeY + 3.5, right - left, 2.5);

  // Torso.
  const tx = (s.neck.x + s.hip.x) / 2;
  ctx.fillStyle = v.shirt;
  ctx.beginPath();
  ctx.roundRect(tx - 7.5, s.neck.y - 1, 15, s.hip.y - s.neck.y + 1, [6, 6, 3, 3]);
  ctx.fill();
  ctx.fillStyle = "rgba(0,0,0,0.13)";
  ctx.beginPath();
  ctx.roundRect(f > 0 ? tx - 7.5 : tx + 1.5, s.neck.y - 1, 6, s.hip.y - s.neck.y + 1, f > 0 ? [6, 0, 0, 3] : [0, 6, 3, 0]);
  ctx.fill();

  // Head: circle, flat hair cap (bun for some), eye; a smile when finished.
  const hx = s.head.x, hy = s.head.y;
  ctx.fillStyle = v.skin;
  ctx.fillRect(s.neck.x - 2, s.neck.y - 4, 4, 5);
  ctx.beginPath();
  ctx.arc(hx, hy, 7.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = v.hair;
  ctx.beginPath();
  ctx.arc(hx - f * 0.6, hy - 0.8, 7.4, Math.PI * 1.02, Math.PI * 1.98);
  ctx.fill();
  if (idHash(v.id) % 3 === 0) {
    ctx.beginPath();
    ctx.arc(hx - f * 6.5, hy - 1, 3.6, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = C.ink;
  if (idle) {
    ctx.fillRect(hx + f * 3.6 - 1, hy + 0.4, 2, 0.8); // calm, half-closed eye
  } else {
    ctx.beginPath();
    ctx.arc(hx + f * 3.6, hy + 0.6, 0.95, 0, Math.PI * 2);
    ctx.fill();
  }
  if (v.status === "finished") {
    ctx.strokeStyle = C.ink;
    ctx.lineWidth = 0.9;
    ctx.beginPath();
    ctx.arc(hx + f * 3, hy + 2.5, 1.8, 0.2, Math.PI - 0.2);
    ctx.stroke();
  }

  limb([s.elbowF, s.handF], v.skin, 3.6);
  limb([s.shoulder, s.elbowF], v.shirt, 4.4);

  if (v.carry === "laptop") {
    const lx = s.handF.x, ly = s.handF.y;
    const gl = ctx.createRadialGradient(lx, ly - 6, 1, lx, ly - 6, 16);
    gl.addColorStop(0, "rgba(94,234,212,0.35)");
    gl.addColorStop(1, "rgba(94,234,212,0)");
    ctx.fillStyle = gl;
    ctx.fillRect(lx - 16, ly - 22, 32, 32);
    const hx0 = lx + f * 9, hy0 = ly - 1;
    ctx.fillStyle = "#3b3f6b";
    ctx.beginPath();
    ctx.moveTo(hx0, hy0);
    ctx.lineTo(hx0 + f * 4, hy0 - 14);
    ctx.lineTo(hx0 + f * 1.4, hy0 - 14.6);
    ctx.lineTo(hx0 - f * 2.4, hy0);
    ctx.fill();
    ctx.fillStyle = "#5eead4";
    ctx.beginPath();
    ctx.moveTo(hx0 - f * 2.2, hy0 - 1.6);
    ctx.lineTo(hx0 + f * 1.2, hy0 - 13.4);
    ctx.lineTo(hx0 + f * 0.2, hy0 - 13.4);
    ctx.lineTo(hx0 - f * 3.2, hy0 - 1.6);
    ctx.fill();
    ctx.fillStyle = "#cfd4ea";
    ctx.beginPath();
    ctx.roundRect(lx - 10, ly - 1.5, 20, 3, 1.5);
    ctx.fill();
    ctx.fillStyle = "#9aa1c4";
    ctx.fillRect(lx - 9, ly + 0.4, 18, 1.1);
  } else if (v.carry === "glass") {
    const gx = s.handF.x, gy = s.handF.y;
    ctx.fillStyle = "rgba(255,255,255,0.6)";
    ctx.beginPath();
    ctx.moveTo(gx - 3.2, gy - 8);
    ctx.lineTo(gx + 3.2, gy - 8);
    ctx.lineTo(gx + 2.4, gy + 1);
    ctx.lineTo(gx - 2.4, gy + 1);
    ctx.fill();
    ctx.fillStyle = "#c8873a";
    ctx.fillRect(gx - 2.7, gy - 4.5, 5.4, 5.5);
    ctx.fillStyle = v.skin;
    ctx.beginPath();
    ctx.arc(gx, gy - 1, 2, 0, Math.PI * 2);
    ctx.fill();
    steam(ctx, gx, gy - 9, t, idHash(v.id) % 7);
  }

  // Error: a red "!" badge beside the head.
  if (v.status === "error") {
    const ex = hx + f * 10, ey = hy - 9;
    ctx.fillStyle = "#f87171";
    ctx.beginPath();
    ctx.arc(ex, ey, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.font = `900 7.5px ${FONT}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("!", ex, ey + 0.4);
  }

  void pulse;
}

/** Companions drawn as figures per villager; the rest show as "+N" on the name pill. */
const MAX_COMPS = 4;
const extraComps = (v: LiveVillager) => Math.max(0, v.companions.length - MAX_COMPS);

/** Depth-sorted draw list (villagers and their companions by feet y), reused across frames. */
type Drawable = { y: number; v: LiveVillager; c: LiveCompanion | null };
const drawList: Drawable[] = [];

const widthCache = new Map<string, number>();
function textW(ctx: CanvasRenderingContext2D, font: string, s: string) {
  const key = font + "|" + s;
  let w = widthCache.get(key);
  if (w === undefined) {
    if (widthCache.size > 600) widthCache.clear();
    ctx.font = font;
    w = ctx.measureText(s).width;
    widthCache.set(key, w);
  }
  return w;
}

const F_LABEL = `600 9px ${FONT}`;
const F_NAME = `800 7px ${FONT}`;

/** Pill tag: navy name pill on top, label pill with a status dot below (~27 units tall). */
function tag(ctx: CanvasRenderingContext2D, v: LiveVillager, f: LiveFrame) {
  const urgent = v.urgent;
  const x = v.labelX;
  const top = v.labelY;
  const dim = v.status === "idle" && !v.selected && !v.hovered;
  ctx.globalAlpha = v.alpha;
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";

  const tw = Math.min(170, textW(ctx, F_LABEL, v.label));
  const lh = 14;
  const lw = 20 + tw + 8;
  const ly = top + 13 + lh / 2;
  const lx = x - lw / 2;

  // Stalk down to the head when the label sits well above it.
  const headTop = v.y - BODY.height - 2 - v.jump * 26;
  if (headTop - (ly + lh / 2) > 8) {
    ctx.strokeStyle = urgent ? "rgba(255,90,79,0.55)" : "rgba(246,244,255,0.28)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, ly + lh / 2 + 4);
    ctx.lineTo(v.x, headTop);
    ctx.stroke();
  }

  if (urgent) {
    const grow = 2 + f.pulse * 6;
    ctx.fillStyle = `rgba(255,90,79,${0.32 * (1 - f.pulse) + 0.06})`;
    ctx.beginPath();
    ctx.roundRect(lx - grow, ly - lh / 2 - grow, lw + grow * 2, lh + grow * 2, lh / 2 + grow);
    ctx.fill();
  }
  if (v.selected) {
    ctx.fillStyle = "rgba(255,244,214,0.9)";
    ctx.beginPath();
    ctx.roundRect(lx - 2, ly - lh / 2 - 2, lw + 4, lh + 4, lh / 2 + 2);
    ctx.fill();
  }
  ctx.fillStyle = "rgba(8,8,32,0.35)";
  ctx.beginPath();
  ctx.roundRect(lx + 1.5, ly - lh / 2 + 2, lw, lh, lh / 2);
  ctx.fill();
  const pill = urgent ? `rgb(255,${74 + 34 * f.pulse},${64 + 30 * f.pulse})` : v.status === "error" ? "#ffe4e4" : dim ? "#bdbad3" : "#f6f4ff";
  ctx.fillStyle = pill;
  ctx.beginPath();
  ctx.moveTo(x - 4, ly + lh / 2 - 0.5);
  ctx.lineTo(x + 4, ly + lh / 2 - 0.5);
  ctx.lineTo(x, ly + lh / 2 + 4);
  ctx.fill();
  ctx.beginPath();
  ctx.roundRect(lx, ly - lh / 2, lw, lh, lh / 2);
  ctx.fill();

  const dx = lx + 9;
  if (urgent) {
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.arc(dx, ly, 3.3 + f.pulse * 0.8, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#e0342b";
    ctx.beginPath();
    ctx.arc(dx, ly, 2, 0, Math.PI * 2);
    ctx.fill();
  } else {
    // Darker shades of the status colours so the dot reads on the light pill.
    const dot: Record<string, string> = { working: "#14b8a6", turn: "#e09a1a", idle: "#6b7194", finished: "#65a30d", error: "#dc2626" };
    ctx.fillStyle = dot[v.status] ?? v.color;
    ctx.beginPath();
    ctx.arc(dx, ly, 3, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = urgent ? "#fff" : v.status === "error" ? "#991b1b" : dim ? "#3b3d66" : C.navy;
  ctx.font = F_LABEL;
  ctx.fillText(v.label, lx + 16, ly + 0.5, 170);

  // Name pill: navy with the name in the status colour; link dot and helper count.
  const nw = textW(ctx, F_NAME, v.name) + 12 + (v.linked ? 7 : 0) + (extraComps(v) ? 12 : 0);
  const ny = top + 5.5;
  const nx = x - nw / 2;
  ctx.fillStyle = C.navy;
  ctx.beginPath();
  ctx.roundRect(nx, ny - 5.5, nw, 11, 5.5);
  ctx.fill();
  ctx.fillStyle = v.color;
  ctx.font = F_NAME;
  ctx.fillText(v.name, nx + 6, ny + 0.4);
  let ex = nx + 6 + textW(ctx, F_NAME, v.name) + 3;
  if (v.linked) {
    ctx.fillStyle = "#f6f4ff";
    ctx.beginPath();
    ctx.arc(ex + 2.5, ny, 2, 0, Math.PI * 2);
    ctx.fill();
    ex += 7;
  }
  if (extraComps(v)) {
    ctx.fillStyle = "#5eead4";
    ctx.font = `700 6.5px ${FONT}`;
    ctx.fillText(`+${extraComps(v)}`, ex + 1, ny + 0.4);
  }
  ctx.globalAlpha = 1;
}

/** Screen-fixed HUD pill: how many sessions are at work. Kept below the top bar. */
function hud(ctx: CanvasRenderingContext2D, f: LiveFrame, view: ViewRect) {
  if (f.total === 0) return;
  const m = ctx.getTransform();
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const ppu = Math.hypot(m.a, m.b) / dpr; // CSS px per world unit
  if (!(ppu > 0)) return;
  ctx.save();
  ctx.translate(view.x, view.y);
  ctx.scale(1 / ppu, 1 / ppu);
  const text = `${f.working} of ${f.total} at work`;
  ctx.font = `700 12px ${FONT}`;
  const w = ctx.measureText(text).width + 34 + 70;
  const x = 16, y = 80, h = 26;
  ctx.fillStyle = "rgba(27,29,72,0.82)";
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, h / 2);
  ctx.fill();
  ctx.fillStyle = "#5eead4";
  ctx.beginPath();
  ctx.arc(x + 14, y + h / 2, 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#f6f4ff";
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillText(text, x + 25, y + h / 2 + 0.5);
  const bx = x + w - 76, bw = 62;
  ctx.fillStyle = "rgba(246,244,255,0.18)";
  ctx.beginPath();
  ctx.roundRect(bx, y + h / 2 - 2.5, bw, 5, 2.5);
  ctx.fill();
  ctx.fillStyle = "#5eead4";
  ctx.beginPath();
  ctx.roundRect(bx, y + h / 2 - 2.5, Math.max(5, (bw * f.working) / f.total), 5, 2.5);
  ctx.fill();
  ctx.restore();
}

/** Pulsing red badge on the roof sign: "n need you". */
function urgentBadge(ctx: CanvasRenderingContext2D, f: LiveFrame, p: LivePlace) {
  const b = p.building;
  const top = b.baseY - b.wallH;
  const bx = b.x + b.w / 2, by = top - b.roofH - 20;
  const txt = `${p.urgent} need${p.urgent > 1 ? "" : "s"} you`;
  ctx.font = `800 7px ${FONT}`;
  const w = textW(ctx, `800 7px ${FONT}`, txt) + 14;
  ctx.fillStyle = `rgba(255,90,79,${0.25 * (1 - f.pulse)})`;
  ctx.beginPath();
  const g = 2 + f.pulse * 4;
  ctx.roundRect(bx - w / 2 - g, by - 6 - g, w + g * 2, 12 + g * 2, 6 + g);
  ctx.fill();
  ctx.fillStyle = "#ff5a4f";
  ctx.beginPath();
  ctx.roundRect(bx - w / 2, by - 6, w, 12, 6);
  ctx.fill();
  ctx.fillStyle = "#fff";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(txt, bx, by + 0.4);
}

export const flatVectorLive: LiveStyle = {
  id: "flat-vector",
  name: "Flat Vector",
  blurb: "Clean flat explainer illustration at dusk: no outlines, navy with warm accents, soft light cones and long shadows.",
  bg: "#1e2147",
  lighting: "dusk",
  draw(ctx, f, view) {
    const blr = f.theme === "bengaluru";
    const t = f.t;
    const calm = f.reducedMotion;
    const at = calm ? 0 : t; // ambient time
    const x0 = view.x, x1 = view.x + view.w;
    const inView = (x: number, pad = 120) => x > x0 - pad && x < x1 + pad;

    // 1. Background: sky above the tile, ground below, tiles across the view.
    if (blr) blrSky(ctx, view);
    else {
    if (!tileLayer) tileLayer = makeCanvas(TILE, WORLD_H, paintTile);
    ctx.fillStyle = C.skyTop;
    ctx.fillRect(x0 - 1, view.y - 1, view.w + 2, Math.max(0, -view.y) + 2);
    ctx.fillStyle = C.groundFront;
    ctx.fillRect(x0 - 1, WORLD_H - 1, view.w + 2, Math.max(0, view.y + view.h - WORLD_H) + 2);
    for (let k = Math.floor(x0 / TILE); k * TILE < x1; k++) ctx.drawImage(tileLayer, k * TILE, 0, TILE + 0.5, WORLD_H);
    }

    // 2. Moon: fixed in the sky (very far away), so it stays in view.
    const mx = x0 + view.w * 0.84, my = 52;
    for (const [rad, a] of [[44, 0.05], [30, 0.08], [22, 0.12]] as const) {
      ctx.fillStyle = `rgba(251,238,193,${a})`;
      ctx.beginPath();
      ctx.arc(mx, my, rad, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = C.moon;
    ctx.beginPath();
    ctx.arc(mx, my, 15, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "rgba(214,196,150,0.55)";
    for (const [dx, dy, rr] of [[-5, -3, 3], [4, 5, 2.2], [6, -6, 1.5]] as const) {
      ctx.beginPath();
      ctx.arc(mx + dx, my + dy, rr, 0, Math.PI * 2);
      ctx.fill();
    }

    // 3. Drifting pill clouds (indexed across the view, so they tile forever).
    const drift = calm ? 0 : f.drift * 0.5;
    ctx.fillStyle = "rgba(70,62,140,0.55)";
    const CS = 230;
    for (let k = Math.floor((x0 - drift) / CS) - 1; k * CS + drift < x1 + CS; k++) {
      const x = k * CS + drift + hash(k * 3.1) * 90;
      const y = 22 + hash(k * 9.7) * 60;
      const w = 50 + hash(k * 5.3) * 40;
      ctx.beginPath();
      ctx.roundRect(x, y, w, 9, 4.5);
      ctx.roundRect(x + w * 0.2, y - 6, w * 0.45, 9, 4.5);
      ctx.fill();
    }

    if (blr) {
      // Bengaluru: skyline, metro, trees, road and traffic, sign; places; street lights.
      blrScene(ctx, f, view, at, "back");
      for (const p of f.places) {
        const b = p.building;
        if (!inView(b.x + b.w / 2, 230)) continue;
        blrPlace(ctx, p);
        for (const [i, sp] of blrSteamSpots(p).entries()) steam(ctx, sp.x, sp.y, at, i + p.variant);
        if (p.urgent > 0) urgentBadge(ctx, f, p);
      }
      blrScene(ctx, f, view, at, "front");
    } else {
    // 4. Far palms on the far bank.
    for (const x of f.farPalms) if (inView(x, 30)) farPalm(ctx, x, GROUND.waterTop - 3, 30);

    // 5. Water shimmer bands, the moon's broken reflection.
    for (let r = 0; r < 7; r++) {
      const y = GROUND.waterTop + 6 + r * 6;
      const sp = at * (6 + (r % 3) * 4);
      const SP = 110;
      for (let k = Math.floor((x0 - sp) / SP) - 1; k * SP + sp < x1 + 10; k++) {
        const x = k * SP + sp + hash(k * 4.1 + r * 13) * 60;
        ctx.fillStyle = `rgba(150,150,230,${0.12 + 0.1 * Math.sin(at * 1.3 + k + r)})`;
        ctx.beginPath();
        ctx.roundRect(x, y + (k % 2) * 3, 18 + hash(k + r * 7) * 26, 1.6, 0.8);
        ctx.fill();
      }
    }
    for (let i = 0; i < 6; i++) {
      const y = GROUND.waterTop + 4 + i * 6.5;
      const w = 22 - i * 2.4 + Math.sin(at * 2 + i * 1.7) * 3;
      ctx.fillStyle = `rgba(251,238,193,${0.5 - i * 0.06})`;
      ctx.beginPath();
      ctx.roundRect(mx - w / 2 + Math.sin(at * 1.4 + i) * 2, y, w, 2, 1);
      ctx.fill();
    }

    // 6. Canoe with rower, and its soft reflection.
    if (inView(f.canoeX, 40)) {
      const cx = f.canoeX, cy = 178;
      for (const flip of [1, -1]) {
        ctx.save();
        if (flip < 0) {
          ctx.translate(0, cy * 2 + 6);
          ctx.scale(1, -1);
          ctx.globalAlpha = 0.18;
        }
        ctx.fillStyle = "#4a2f45";
        ctx.beginPath();
        ctx.moveTo(cx - 25, cy - 3);
        ctx.quadraticCurveTo(cx, cy + 9, cx + 25, cy - 3);
        ctx.lineTo(cx + 20, cy);
        ctx.lineTo(cx - 20, cy);
        ctx.fill();
        ctx.fillStyle = "#6e4352";
        ctx.fillRect(cx - 20, cy - 1, 40, 2);
        ctx.fillStyle = "#e3d2b0";
        ctx.beginPath();
        ctx.roundRect(cx - 4, cy - 14, 8, 13, 3.5);
        ctx.fill();
        ctx.fillStyle = "#7a5040";
        ctx.beginPath();
        ctx.arc(cx, cy - 17, 3.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = "#2a1a2a";
        ctx.lineWidth = 1.4;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(cx - 3, cy - 13);
        ctx.lineTo(cx + 13, cy + 5 + Math.sin(at * 2) * 2);
        ctx.stroke();
        ctx.restore();
      }
    }

    // 7. Palms (behind buildings: their bases sit further back).
    f.palms.forEach((p, i) => {
      if (inView(p.x, p.h * 0.6)) palm(ctx, p.x, p.baseY, p.h, p.lean, at, i * 1.7);
    });

    // 8. Village sign.
    const s = f.sign;
    if (inView(s.x, 60)) {
      ctx.fillStyle = "rgba(10,10,40,0.28)";
      ctx.beginPath();
      ctx.ellipse(s.x - 18, s.y + 41, 22, 3, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = C.post;
      ctx.beginPath();
      ctx.roundRect(s.x - 2, s.y, 4, 41, 2);
      ctx.fill();
      ctx.fillStyle = C.navy;
      ctx.beginPath();
      ctx.roundRect(s.x - 34, s.y - 15, 68, 17, 8.5);
      ctx.fill();
      ctx.fillStyle = C.warm;
      ctx.font = `800 8.5px ${FONT}`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(s.text, s.x, s.y - 6.2);
    }

    // 9. Places: cached building + lamp; steam and the urgent badge per frame.
    for (const p of f.places) {
      const b = p.building;
      if (!inView(b.x + b.w / 2, 230)) continue;
      ctx.drawImage(placeLayer(p), b.x + PL.dx, PL.y, PL.w, PL.h);
      const top = b.baseY - b.wallH;
      if (VARIANTS[p.variant % 4]!.prop === "tea") for (let i = 0; i < 3; i++) steam(ctx, b.x + 20 + i * 14, top + 36, at, i + p.variant);
      if (p.urgent > 0) urgentBadge(ctx, f, p);
    }

    // 10. Brass lamp row: cones first, then posts and flames.
    const L = f.lamps;
    for (let i = 0; i < L.count; i++) {
      const x = L.x0 + i * L.dx;
      if (!inView(x, 30)) continue;
      const lit = i < L.lit;
      if (lit) {
        const flick = 0.9 + 0.1 * Math.sin(at * 9 + i * 2.1);
        const cg = ctx.createLinearGradient(0, L.y - 2, 0, L.y + 30);
        cg.addColorStop(0, `rgba(255,200,120,${0.32 * flick})`);
        cg.addColorStop(1, "rgba(255,200,120,0)");
        ctx.fillStyle = cg;
        ctx.beginPath();
        ctx.moveTo(x - 3, L.y - 2);
        ctx.lineTo(x + 3, L.y - 2);
        ctx.lineTo(x + 15, L.y + 30);
        ctx.lineTo(x - 15, L.y + 30);
        ctx.fill();
        ctx.fillStyle = "rgba(255,200,120,0.16)";
        ctx.beginPath();
        ctx.ellipse(x, L.y + 23, 14, 3.5, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = "rgba(10,10,40,0.25)";
      ctx.beginPath();
      ctx.moveTo(x - 4, L.y + 22);
      ctx.lineTo(x + 4, L.y + 22);
      ctx.lineTo(x - 18, L.y + 28);
      ctx.lineTo(x - 22, L.y + 27);
      ctx.fill();
      ctx.fillStyle = C.brass;
      ctx.beginPath();
      ctx.roundRect(x - 1.5, L.y, 3, 22, 1.5);
      ctx.roundRect(x - 6, L.y + 19, 12, 3.5, 1.75);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(x - 6, L.y - 1);
      ctx.quadraticCurveTo(x, L.y + 5, x + 6, L.y - 1);
      ctx.fill();
      ctx.fillStyle = "#a8763a";
      ctx.fillRect(x + 0.3, L.y, 1.2, 19);
      if (lit) {
        const fl = 1 + 0.12 * Math.sin(at * 11 + i * 1.3);
        const hg = ctx.createRadialGradient(x, L.y - 4, 0.5, x, L.y - 4, 12);
        hg.addColorStop(0, "rgba(255,210,130,0.55)");
        hg.addColorStop(1, "rgba(255,210,130,0)");
        ctx.fillStyle = hg;
        ctx.fillRect(x - 12, L.y - 16, 24, 24);
        ctx.fillStyle = C.warmDeep;
        ctx.beginPath();
        ctx.moveTo(x, L.y - 9 * fl);
        ctx.quadraticCurveTo(x + 3.5, L.y - 2, x, L.y - 0.5);
        ctx.quadraticCurveTo(x - 3.5, L.y - 2, x, L.y - 9 * fl);
        ctx.fill();
        ctx.fillStyle = "#fff3c4";
        ctx.beginPath();
        ctx.ellipse(x, L.y - 2.6, 1.2, 2.2, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    }

    drawStations(ctx, f, view, PROP_LOOKS.flat);
    // 11. Villagers and their subagent companions back-to-front (by feet y),
    //     tethers and hand-over bursts underneath, then tags (selected/hovered last).
    drawList.length = 0;
    for (const v of f.villagers) {
      if (v.alpha <= 0) continue;
      if (inView(v.x, 40)) drawList.push({ y: v.y, v, c: null });
      const n = Math.min(MAX_COMPS, v.companions.length);
      for (let i = 0; i < n; i++) {
        const c = v.companions[i];
        if (c.alpha > 0 && inView(c.x, 40)) drawList.push({ y: c.y, v, c });
      }
    }
    drawList.sort((a, b) => a.y - b.y || (a.c ? 1 : 0) - (b.c ? 1 : 0));
    for (const v of f.villagers) {
      if (v.alpha <= 0 || !inView(v.x, 220)) continue;
      const n = Math.min(MAX_COMPS, v.companions.length);
      for (let i = 0; i < n; i++) companionTether(ctx, v, v.companions[i], at);
    }
    for (const d of drawList) {
      if (d.c) companionFigure(ctx, d.v, d.c, t, calm);
      else {
        ctx.globalAlpha = d.v.alpha;
        villager(ctx, d.v, t, f.pulse);
        ctx.globalAlpha = 1;
      }
    }
    for (const v of f.villagers) {
      if (v.alpha <= 0 || !inView(v.x, 220)) continue;
      const n = Math.min(MAX_COMPS, v.companions.length);
      for (let i = 0; i < n; i++) companionHandover(ctx, v, v.companions[i]);
    }
    // Companion labels: tiny pills under their feet, only when they won't clutter.
    const zoomed = view.w < 700;
    for (const v of f.villagers) {
      if (v.alpha <= 0 || !(zoomed || v.selected || v.hovered)) continue;
      const n = Math.min(MAX_COMPS, v.companions.length);
      for (let i = 0; i < n; i++) {
        const c = v.companions[i];
        if (!inView(c.x, 60)) continue;
        // Stack labels of companions standing close together.
        let row = 0;
        for (let j = 0; j < i; j++) if (Math.abs(v.companions[j].x - c.x) < 40 && Math.abs(v.companions[j].y - c.y) < 10) row++;
        companionLabel(ctx, v, c, row);
      }
    }
    const front: LiveVillager[] = [];
    for (const v of f.villagers) {
      if (!inView(v.labelX, 120) || v.alpha <= 0) continue;
      if (v.selected || v.hovered) front.push(v);
      else tag(ctx, v, f);
    }
    for (const v of front) tag(ctx, v, f);
    ctx.textBaseline = "alphabetic";

    // 12. HUD: sessions at work (replaces the prototype's progress bar).
    hud(ctx, f, view);
  },
};
