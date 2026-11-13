/**
 * Toy Brick, live village version: the Style-lab prototype (protos/toyBrick.ts)
 * generalised to any number of places and villagers. A studded baseplate,
 * stepped brick hills and translucent water plates that tile across any world
 * width; one brick building per project with its name on a roof tile; blocky
 * jointed toy figures; label tiles; 10 fps stop-motion with a tiny per-frame
 * jitter. Generic toy bricks only: no brand names or logos.
 *
 * f.theme "bengaluru" swaps the scenery, same bricks: a skyline of glass and
 * apartment towers, a metro viaduct with a brick train, paver footpaths and an
 * asphalt road with autos and a bus, gulmohar trees, city buildings per
 * variant, a green street sign and street lights.
 */
import { hash, poseOf } from "../scene";
import { asVillagerFrame } from "./reference";
import {
  BACK_W, DECK_TOP, TAU, GROUND_TOP, GROUND_W, K, METRO_CAR_W, STREET_BULB, blit, blrTop, brick, clip, drawAuto, drawBus,
  drawMetroCar, ell, jit, makeSprite, paintBackTile, paintBlrBandTile, paintBlrBuilding, paintBlrGroundTile, paintBlrSign,
  paintBlrSkyTile, paintBuilding, paintCloud, paintFarPalm, paintGroundTile, paintGulmohar, paintLampPost, paintPalm,
  paintSign, paintStreetLight, paintTower, rr, seedOf, shade, slope, stud, tile, towerOf,
  type C2, type Sprite,
} from "./toyBrickKit";
import { GROUND, WORLD_H, type LiveCompanion, type LiveFrame, type LivePlace, type LiveStyle, type LiveVillager, type ViewRect } from "./types";
import { PROP_LOOKS, drawStations } from "./stationKit";

const FPS = 10;

// ── cached sprites ──────────────────────────────────────────────────────────

let backTile: Sprite | null = null;
let groundTile: Sprite | null = null;
let cloud: Sprite | null = null;
let farPalm: Sprite | null = null;
let lampPost: Sprite | null = null;
const palmSprites = new Map<string, Sprite>();
const buildingSprites = new Map<string, Sprite>();
const signSprites = new Map<string, Sprite>();

function statics() {
  if (!backTile) backTile = makeSprite(BACK_W, WORLD_H, 0, 0, paintBackTile);
  if (!groundTile) groundTile = makeSprite(GROUND_W, WORLD_H - GROUND_TOP, 0, -GROUND_TOP, paintGroundTile);
  if (!cloud) cloud = makeSprite(80, 30, 0, 0, paintCloud);
  if (!farPalm) farPalm = makeSprite(34, 40, 17, 34, paintFarPalm);
  if (!lampPost) lampPost = makeSprite(20, 34, 10, 6, paintLampPost);
}

function palmSprite(h: number, lean: number): Sprite {
  const key = `${Math.round(h)}|${lean.toFixed(3)}`;
  let s = palmSprites.get(key);
  if (!s) {
    const reach = h * 0.55;
    const topX = lean * h * 1.2;
    const left = Math.min(0, topX) - reach - 6;
    const right = Math.max(0, topX) + reach + 6;
    const up = h * 0.62 + h * 0.4 + 8;
    s = makeSprite(right - left, up + 6, -left, up, (g) => paintPalm(g, h, lean));
    if (palmSprites.size > 64) palmSprites.clear();
    palmSprites.set(key, s);
  }
  return s;
}

function buildingSprite(p: LivePlace): Sprite {
  const b = p.building;
  const key = `${p.name}|${p.variant}|${b.w}|${b.wallH}|${b.roofH}|${b.doorX - b.x}`;
  let s = buildingSprites.get(key);
  if (!s) {
    const pad = 24;
    const up = b.wallH + b.roofH + 8;
    s = makeSprite(b.w + pad * 2, up + 8, pad, up, (g) => paintBuilding(g, b.w, b.wallH, b.roofH, b.doorX - b.x, p.variant, p.name));
    if (buildingSprites.size > 64) buildingSprites.clear();
    buildingSprites.set(key, s);
  }
  return s;
}

function signSprite(text: string): Sprite {
  let s = signSprites.get(text);
  if (!s) {
    s = makeSprite(76, 66, 38, 20, (g) => paintSign(g, text));
    signSprites.set(text, s);
  }
  return s;
}

// ── Bengaluru sprites (separate caches from Kerala's) ───────────────────────

let blrSky: Sprite | null = null;
let blrBand: Sprite | null = null;
let blrGround: Sprite | null = null;
let streetLight: Sprite | null = null;
const treeSprites = new Map<string, Sprite>();
const towerSprites = new Map<string, Sprite>();
const blrBuildingSprites = new Map<string, Sprite>();
const blrSignSprites = new Map<string, Sprite>();

function blrStatics() {
  if (!blrSky) blrSky = makeSprite(BACK_W, GROUND.waterTop, 0, 0, paintBlrSkyTile);
  if (!blrBand) blrBand = makeSprite(BACK_W, GROUND.waterBottom - GROUND.waterTop, 0, 0, (g) => { g.translate(0, -GROUND.waterTop); paintBlrBandTile(g); });
  if (!blrGround) blrGround = makeSprite(GROUND_W, WORLD_H - GROUND_TOP, 0, -GROUND_TOP, paintBlrGroundTile);
  if (!streetLight) streetLight = makeSprite(28, 52, 10, 24, paintStreetLight);
}

function treeSprite(h: number, lean: number): Sprite {
  const key = `${Math.round(h)}|${lean.toFixed(3)}`;
  let s = treeSprites.get(key);
  if (!s) {
    const reach = h * 0.45 + 8;
    const topX = lean * h * 0.6;
    const left = Math.min(0, topX) - reach;
    const right = Math.max(0, topX) + reach;
    const up = h * 0.42 + 60;
    s = makeSprite(right - left, up + 6, -left, up, (g) => paintGulmohar(g, h, lean));
    if (treeSprites.size > 64) treeSprites.clear();
    treeSprites.set(key, s);
  }
  return s;
}

function towerSprite(kind: number, h: number, w: number): Sprite {
  const key = `${kind}|${h}|${w}`;
  let s = towerSprites.get(key);
  if (!s) {
    const up = h + 46;
    s = makeSprite(w + 60, up + 2, w / 2 + 40, up, (g) => paintTower(g, kind, h, w));
    towerSprites.set(key, s);
  }
  return s;
}

function blrBuildingSprite(p: LivePlace): Sprite {
  const b = p.building;
  const key = `${p.name}|${p.variant}|${b.w}|${b.wallH}|${b.roofH}|${b.doorX - b.x}`;
  let s = blrBuildingSprites.get(key);
  if (!s) {
    const pad = 24;
    const up = blrTop(p.variant, b.wallH, b.roofH) + 24;
    s = makeSprite(b.w + pad * 2, up + 8, pad, up, (g) => paintBlrBuilding(g, b.w, b.wallH, b.roofH, b.doorX - b.x, p.variant, p.name));
    if (blrBuildingSprites.size > 64) blrBuildingSprites.clear();
    blrBuildingSprites.set(key, s);
  }
  return s;
}

function blrSignSprite(text: string): Sprite {
  let s = blrSignSprites.get(text);
  if (!s) {
    s = makeSprite(80, 68, 40, 22, (g) => paintBlrSign(g, text));
    blrSignSprites.set(text, s);
  }
  return s;
}

/** The metro train on the viaduct: 3 brick cars centred on f.canoeX, heading right. */
function metro(ctx: C2, f: LiveFrame, k: number) {
  const y = DECK_TOP - 1.2 + jit(k, 44, 0.3);
  const cx = f.canoeX + jit(k, 41, 0.5);
  for (let i = 0; i < 3; i++) drawMetroCar(ctx, cx + (i - 1) * METRO_CAR_W, y, i === 2 ? 1 : i === 0 ? -1 : 0);
}

const LANE_A = GROUND.pathTop + 22;
const LANE_B = GROUND.pathBottom - 6;
const TRAFFIC = [
  { kind: "auto", lane: LANE_A, dir: 1, speed: 26, off: 40 },
  { kind: "auto", lane: LANE_B, dir: -1, speed: 21, off: 330 },
  { kind: "bus", lane: LANE_A, dir: 1, speed: 15, off: 620 },
  { kind: "auto", lane: LANE_B, dir: -1, speed: 31, off: 900 },
] as const;

function trafficX(f: LiveFrame, i: number) {
  const v = TRAFFIC[i]!;
  const span = f.worldW + 240;
  const t = f.reducedMotion ? 0 : f.t;
  const u = (((v.off + (i * f.worldW) / TRAFFIC.length + t * v.speed) % span) + span) % span;
  return v.dir === 1 ? u - 120 : f.worldW + 120 - u;
}

function zebra(ctx: C2, f: LiveFrame) {
  const x = f.sign.x + 62;
  for (let i = 0; i < 6; i++) tile(ctx, x + i * 9, GROUND.pathTop + 2, 5.5, GROUND.pathBottom - GROUND.pathTop - 4, K.white, 0.8);
}

function kites(ctx: C2, f: LiveFrame, x0: number, x1: number) {
  const KS = 720;
  for (let i = Math.floor((x0 - 60) / KS); i * KS < x1 + 60; i++) {
    if (hash(i * 2.3 + 0.7) < 0.25) continue;
    const bob = f.reducedMotion ? 0 : Math.sin(f.t * 1.3 + i) * 3;
    const kx = i * KS + 240 + hash(i * 4.1) * 300, ky = 34 + hash(i * 6.7) * 30 + bob;
    const col = [K.red, K.yellow, "#ff7ab6", K.orange][Math.abs(i) % 4]!;
    ctx.save();
    ctx.translate(kx, ky);
    ctx.rotate(0.25 + (f.reducedMotion ? 0 : Math.sin(f.t * 1.7 + i) * 0.08));
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.moveTo(0, -9); ctx.lineTo(7, 0); ctx.lineTo(0, 10); ctx.lineTo(-7, 0);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = shade(col, -0.4);
    ctx.lineWidth = 0.6;
    ctx.stroke();
    ctx.fillStyle = "rgba(255,255,255,0.35)";
    ctx.beginPath();
    ctx.moveTo(0, -9); ctx.lineTo(7, 0); ctx.lineTo(0, 0);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    ctx.strokeStyle = "rgba(60,60,70,0.55)";
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.moveTo(kx, ky + 9);
    ctx.quadraticCurveTo(kx + 6, ky + 30, kx - 14, ky + 52);
    ctx.stroke();
    for (let j = 0; j < 3; j++) stud(ctx, kx - 2 - j * 3, ky + 13 + j * 4, j % 2 ? K.white : col, 1.4);
  }
}

// ── dynamic pieces ──────────────────────────────────────────────────────────

function canoe(ctx: C2, f: LiveFrame, k: number) {
  const x = f.canoeX + jit(k, 41, 0.5), y = 178 + jit(k, 42, 0.4);
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(jit(k, 43, 0.012));
  const paddle = f.reducedMotion ? 0 : Math.sin(f.t * 2.4);
  ctx.strokeStyle = K.brown;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-2 + paddle * 4, -18);
  ctx.lineTo(8 - paddle * 6, 6);
  ctx.stroke();
  ctx.fillStyle = K.orange;
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
  brick(ctx, -20, -6, 40, 6, K.brown, true);
  slope(ctx, -28, -6, 8, 6, K.brown, -1);
  slope(ctx, 20, -6, 8, 6, K.brown, 1);
  brick(ctx, -16, 0, 32, 6, shade(K.brown, -0.15), false);
  ctx.restore();
}

function flame(ctx: C2, x: number, y: number, k: number, i: number) {
  const hgt = 12 * (0.85 + 0.15 * hash(k * 0.7 + i));
  ctx.globalAlpha = 0.22;
  ctx.fillStyle = "#ffd36b";
  ell(ctx, x, y - hgt * 0.5, 11, 11);
  ctx.fill();
  ctx.globalAlpha = 0.85;
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

function placeExtras(ctx: C2, p: LivePlace, f: LiveFrame, k: number, blr = false) {
  const b = p.building;
  const top = b.baseY - b.wallH;
  // Steam from the darshini's steel tumblers (Bengaluru café variant).
  if (blr && p.variant === 1 && !f.reducedMotion) {
    const cw = Math.min(72, b.doorX - b.x - 24);
    const items = Math.floor((cw - 6) / 14);
    for (let i = 0; i < items; i++) {
      const gx = b.x + 16 + i * 14;
      for (let j = 0; j < 2; j++) {
        const u = (f.t * 0.6 + i * 0.33 + j * 0.5) % 1;
        ctx.globalAlpha = 0.75 * (1 - u);
        ctx.fillStyle = "#ffffff";
        ell(ctx, gx + Math.sin(u * 6 + i) * 1.5 + jit(k, i * 7 + j, 0.3), b.baseY - 33 - u * 16, 2.2, 1.4);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  }
  // Steam from the tea glasses (tea-shop variant).
  if (!blr && p.variant === 0 && !f.reducedMotion) {
    const items = Math.max(1, Math.floor((Math.min(62, b.doorX - b.x - 26) - 8) / 16));
    for (let i = 0; i < items; i++) {
      const gx = b.x + 22 + i * 16;
      for (let j = 0; j < 2; j++) {
        const u = (f.t * 0.6 + i * 0.33 + j * 0.5) % 1;
        ctx.globalAlpha = 0.7 * (1 - u);
        ctx.fillStyle = "#ffffff";
        ell(ctx, gx + Math.sin(u * 6 + i) * 1.5 + jit(k, i * 7 + j, 0.3), top + 36 - u * 16, 2.2, 1.4);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  }
  // Someone here needs the person: a red beacon brick on the roof ridge, pulsing.
  if (p.urgent > 0) {
    const bx = b.x + b.w / 2, by = blr ? b.baseY - blrTop(p.variant, b.wallH, b.roofH) - 8 : top - b.roofH - 2;
    ctx.globalAlpha = 0.2 + 0.35 * f.pulse;
    ctx.fillStyle = "#ff5a4f";
    ell(ctx, bx, by - 6, 14 + 4 * f.pulse, 11 + 3 * f.pulse);
    ctx.fill();
    ctx.globalAlpha = 1;
    brick(ctx, bx - 4, by - 2, 8, 3, K.greyD, false);
    ctx.fillStyle = f.pulse > 0.5 ? "#ff5a4f" : "#c9271e";
    rr(ctx, bx - 3.5, by - 10, 7, 8.5, 2.5);
    ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,0.6)";
    ctx.fillRect(bx - 2, by - 8.5, 1.1, 5);
    ctx.fillStyle = "#fff";
    ctx.font = "900 6.5px ui-sans-serif, system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("!", bx + 0.3, by - 5.6);
  }
}

// ── villagers: blocky jointed toy figures ───────────────────────────────────

const LEG = 20;

function outline(ctx: C2, color: string) {
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
  outline(ctx, color);
  ctx.fillStyle = shade(color, -0.08);
  rr(ctx, -3.8, LEG - 4, 10, 4, 1);
  ctx.fill();
  outline(ctx, color);
  ctx.fillStyle = "rgba(255,255,255,0.3)";
  ctx.fillRect(-2.4, 1.5, 1, LEG - 7);
  ctx.restore();
}

function arm(ctx: C2, px: number, py: number, a: number, sleeve: string, skin: string) {
  ctx.save();
  ctx.translate(px, py);
  ctx.rotate(-a);
  ctx.fillStyle = sleeve;
  rr(ctx, -2.7, -2.2, 5.4, 13.5, 2.6);
  ctx.fill();
  outline(ctx, sleeve);
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

/** Head top above the feet, for stems and marks. */
function headTop(v: LiveVillager) {
  return v.y - LEG - 4 - 21 - 2 - 13.5 - 2.6 - v.jump * 26;
}

function figure(ctx: C2, v: LiveVillager, f: LiveFrame, k: number, cap?: string) {
  const vf = asVillagerFrame(v);
  const p = poseOf(vf);
  const seed = seedOf(v.id);
  const amp = f.reducedMotion ? 0 : 1;
  const jx = jit(k, seed, 0.55) * amp, jy = jit(k, seed + 3, 0.35) * amp, jr = jit(k, seed + 7, 0.022) * amp;

  // Selection / hover ring: a round tile under the feet.
  if (v.selected || v.hovered) {
    ctx.fillStyle = v.selected ? "rgba(255,255,255,0.85)" : "rgba(255,255,255,0.45)";
    ell(ctx, v.x, v.y + 1, 17, 5);
    ctx.fill();
    ctx.strokeStyle = v.selected ? K.yellow : "rgba(255,255,255,0.9)";
    ctx.lineWidth = v.selected ? 1.6 : 1;
    ell(ctx, v.x, v.y + 1, 17, 5);
    ctx.stroke();
  }
  ctx.fillStyle = `rgba(15,60,20,${0.32 - v.jump * 0.16})`;
  ell(ctx, v.x + 1, v.y + 0.5, 12 - v.jump * 4, 2.8);
  ctx.fill();

  ctx.save();
  ctx.translate(v.x + jx, v.y + jy);
  ctx.rotate(jr);
  ctx.scale(v.facing, 1);

  const idle = v.status === "idle";
  const hipY = -LEG + p.bob;
  const torsoTop = hipY - 4 - 21;
  const shoulderY = torsoTop + 2.5;
  const celebrating = v.status === "finished" && v.jump > 0.02;
  let aF = p.armF * 1.3, aB = p.armB * 1.3;
  if (v.carry === "laptop") { aF = 1.35; aB = 1.15; }
  else if (v.carry === "glass") aF = 1.15;
  if (idle) { aF = 0.05; aB = -0.05; }
  if (celebrating) { aF = 2.75; aB = 2.55; }

  arm(ctx, -5.5, shoulderY, aB, shade(v.shirt, -0.2), shade(v.skin, -0.15));
  leg(ctx, -1.6, hipY, p.legB, shade(v.mundu, -0.16));
  leg(ctx, 1.6, hipY, p.legF, v.mundu);
  ctx.fillStyle = shade(v.mundu, -0.06);
  rr(ctx, -8, hipY - 4.5, 16, 6, 1);
  ctx.fill();
  outline(ctx, v.mundu);
  ctx.fillStyle = shade(v.mundu, -0.3);
  ctx.fillRect(-8, hipY - 4.5, 16, 1);

  // Trapezoid torso with printed collar and buttons.
  ctx.beginPath();
  ctx.moveTo(-10, hipY - 4);
  ctx.lineTo(10, hipY - 4);
  ctx.lineTo(6.5, torsoTop);
  ctx.lineTo(-6.5, torsoTop);
  ctx.closePath();
  ctx.fillStyle = v.shirt;
  ctx.fill();
  outline(ctx, v.shirt);
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
  ctx.strokeStyle = shade(v.shirt, -0.4);
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  ctx.moveTo(-3.2, torsoTop);
  ctx.lineTo(0, torsoTop + 5);
  ctx.lineTo(3.2, torsoTop);
  ctx.stroke();
  ctx.fillStyle = shade(v.shirt, -0.4);
  for (let i = 0; i < 2; i++) ctx.fillRect(-0.5, torsoTop + 8 + i * 5, 1.1, 1.1);

  // Cylinder head with a stud.
  ctx.fillStyle = shade(v.skin, -0.2);
  ctx.fillRect(-2.8, torsoTop - 2, 5.6, 2.2);
  const hy = torsoTop - 13.5;
  const bun = seed % 2 === 0;
  if (bun) {
    ctx.fillStyle = v.hair;
    ell(ctx, -6.5, hy + 4, 3.6, 3.6);
    ctx.fill();
  }
  ctx.fillStyle = v.skin;
  rr(ctx, -6.5, hy, 13, 12, 3.6);
  ctx.fill();
  outline(ctx, v.skin);
  ctx.fillStyle = shade(v.skin, -0.14);
  rr(ctx, 3, hy + 0.6, 3.2, 10.8, 3);
  ctx.fill();
  ctx.fillStyle = "rgba(255,255,255,0.4)";
  ctx.fillRect(-4.6, hy + 2.2, 1.4, 7);
  ctx.fillStyle = v.hair;
  rr(ctx, -6.5, hy, 13, 3, 2.5);
  ctx.fill();
  ctx.fillStyle = shade(v.skin, -0.25);
  ctx.fillRect(-3, hy - 2.6, 6, 2.8);
  ctx.fillStyle = shade(v.skin, 0.1);
  ell(ctx, 0, hy - 2.6, 3, 1.1);
  ctx.fill();
  // Printed face.
  ctx.fillStyle = K.ink;
  if (idle) {
    // Calm, half-closed eyes.
    ctx.fillRect(-0.2, hy + 5.4, 1.8, 0.7);
    ctx.fillRect(3.6, hy + 5.4, 1.8, 0.7);
  } else {
    ell(ctx, 0.6, hy + 5.6, 0.85, 1.05);
    ctx.fill();
    ell(ctx, 4.4, hy + 5.6, 0.85, 1.05);
    ctx.fill();
  }
  ctx.strokeStyle = K.ink;
  ctx.lineWidth = 0.75;
  ctx.beginPath();
  if (v.urgent || v.status === "error") ctx.arc(2.6, hy + 9.6, 1.4, 1.15 * Math.PI, 1.85 * Math.PI);
  else if (idle) { ctx.moveTo(1.4, hy + 8.6); ctx.lineTo(3.8, hy + 8.6); }
  else ctx.arc(2.6, hy + 7.4, 2.4, 0.15 * Math.PI, 0.85 * Math.PI);
  ctx.stroke();
  if (bun) {
    ctx.fillStyle = K.red;
    ell(ctx, 2.5, hy + 3.9, 0.7, 0.7);
    ctx.fill();
  } else {
    ctx.fillStyle = v.hair;
    rr(ctx, 0.4, hy + 7.4, 4.4, 1.1, 0.5);
    ctx.fill();
  }

  // Helper companions wear a little round work cap (a 1×1 dome brick with a stud).
  if (cap) {
    ctx.fillStyle = cap;
    ctx.beginPath();
    ctx.ellipse(0, hy + 1.2, 7.6, 5.4, 0, Math.PI, TAU);
    ctx.closePath();
    ctx.fill();
    outline(ctx, cap);
    ctx.fillStyle = shade(cap, -0.12);
    rr(ctx, -2, hy, 11, 2.2, 1);
    ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,0.5)";
    ctx.fillRect(-4.2, hy - 2.6, 1.3, 2.6);
    stud(ctx, 0, hy - 4.6, cap, 2.2);
  }

  // Front arm and what it carries.
  if (v.carry === "laptop") {
    const h = { x: 5.5 + Math.sin(aF) * 13.8, y: shoulderY + Math.cos(aF) * 13.8 };
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
  }
  ctx.restore();

  // Error: a red cross tile floating by the head.
  if (v.status === "error") {
    const ex = v.x + 11, ey = headTop(v) + 2;
    tile(ctx, ex - 4.5, ey - 4.5, 9, 9, "#e3342f", 1.2);
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(ex - 2, ey - 2); ctx.lineTo(ex + 2, ey + 2);
    ctx.moveTo(ex + 2, ey - 2); ctx.lineTo(ex - 2, ey + 2);
    ctx.stroke();
  }
}

// ── companions (subagents): small helper figures doing their work ──────────

const C_SCALE = 0.7;
const MAX_COMPANIONS = 4;
/** Head top (cap stud) above a companion's feet, without jump. */
const C_HEAD = (LEG + 4 + 21 + 2 + 13.5 + 2.6 + 4.6) * C_SCALE;
const EMOJI_FONT = "7.5px 'Segoe UI Emoji', 'Apple Color Emoji', 'Noto Color Emoji', sans-serif";
const C_LABEL_FONT = "700 5.4px ui-sans-serif, system-ui, sans-serif";
/** Work caps for helpers: bright toy colours, picked per companion. */
const CAPS = [K.yellow, K.orange, "#14b8a6", "#ff7ab6"];

/** Mix a #rrggbb colour toward white, staying hex (so the figure's own shading still works). */
function lighten(hex: string, a: number): string {
  if (!/^#[0-9a-fA-F]{6}$/.test(hex)) return hex;
  const n = parseInt(hex.slice(1), 16);
  const ch = (c: number) => Math.round(c + (255 - c) * a).toString(16).padStart(2, "0");
  return `#${ch((n >> 16) & 255)}${ch((n >> 8) & 255)}${ch(n & 255)}`;
}

type Comp = LiveCompanion & { parent: LiveVillager; a: number };

/** The parent's figure at companion size: lighter clothes (the cap is added by figure()). */
const asFigure = (c: Comp): LiveVillager => ({
  ...c.parent,
  id: `${c.parent.id}/${c.id}`,
  status: "working",
  urgent: c.activity === "error",
  x: 0, y: 0, facing: c.facing, moving: c.moving, phase: c.phase, jump: c.jump,
  shirt: lighten(c.parent.shirt, 0.3), mundu: lighten(c.parent.mundu, 0.22),
  carry: undefined, helpers: 0, companions: [], selected: false, hovered: false, alpha: c.a,
});

const companionsOf = (v: LiveVillager) => (v.companions.length > MAX_COMPANIONS ? v.companions.slice(0, MAX_COMPANIONS) : v.companions);

/** A chain of tiny round studs from the parent to a companion out on an errand. */
function tether(ctx: C2, c: Comp) {
  if (c.away <= 0.02) return;
  const v = c.parent;
  const ax = v.x, ay = v.y - 26 - v.jump * 26, bx = c.x, by = c.y - 20 * C_SCALE - c.jump * 26 * C_SCALE;
  const d = Math.hypot(bx - ax, by - ay);
  const n = Math.max(2, Math.floor(d / 6));
  ctx.globalAlpha = c.a * Math.min(1, c.away * 1.5) * 0.7;
  const col = v.color.startsWith("#") ? v.color : K.yellow;
  for (let i = 1; i < n; i++) {
    const u = i / n;
    const sag = Math.sin(u * Math.PI) * Math.min(8, d * 0.06);
    stud(ctx, ax + (bx - ax) * u, ay + (by - ay) * u + sag, i % 2 ? col : K.white, 1.3);
  }
  ctx.globalAlpha = 1;
}

function sparkle(ctx: C2, x: number, y: number, r: number, color: string) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x, y - r); ctx.lineTo(x + r * 0.28, y - r * 0.28); ctx.lineTo(x + r, y); ctx.lineTo(x + r * 0.28, y + r * 0.28);
  ctx.lineTo(x, y + r); ctx.lineTo(x - r * 0.28, y + r * 0.28); ctx.lineTo(x - r, y); ctx.lineTo(x - r * 0.28, y - r * 0.28);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = "rgba(120,80,0,0.45)";
  ctx.lineWidth = 0.4;
  ctx.stroke();
}

/** A little brick tile with an emoji (ink = null) or a bold glyph on it. */
function iconTile(ctx: C2, x: number, y: number, text: string, color: string, ink: string | null) {
  tile(ctx, x - 5.5, y - 5.5, 11, 10, color, 1.4);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  if (ink) {
    ctx.fillStyle = ink;
    ctx.font = "900 8px ui-sans-serif, system-ui, sans-serif";
  } else {
    ctx.fillStyle = K.ink;
    ctx.font = EMOJI_FONT;
  }
  ctx.fillText(text, x, y + 0.4);
}

function companion(ctx: C2, c: Comp, f: LiveFrame, k: number) {
  const seed = seedOf(c.id);
  ctx.globalAlpha = c.a;
  ctx.save();
  ctx.translate(c.x, c.y);
  ctx.scale(C_SCALE, C_SCALE);
  figure(ctx, asFigure(c), f, k, CAPS[seed % CAPS.length]);
  ctx.restore();

  const head = c.y - C_HEAD - c.jump * 26 * C_SCALE;
  // Busy: little puffs (white and yellow sawdust) popping off the hands.
  if (c.activity === "busy" && !f.reducedMotion) {
    for (let i = 0; i < 3; i++) {
      const u = (((f.t * 1.4 + i / 3 + hash(seed + i)) % 1) + 1) % 1;
      ctx.globalAlpha = c.a * 0.85 * (1 - u);
      ctx.fillStyle = i === 1 ? K.yellow : "#ffffff";
      const px = c.x + c.facing * (7 + u * 6) + Math.sin(u * 7 + i) * 2 + jit(k, seed + i, 0.4);
      ell(ctx, px, c.y - 14 - u * 14, 1.6 + u * 1.4, 1.3 + u);
      ctx.fill();
    }
    ctx.globalAlpha = c.a;
  }
  // Working: the activity icon on a brick tile, bobbing over the head.
  if (c.working) {
    const bob = f.reducedMotion ? 0 : Math.sin(f.t * 4 + seed) * 1.6 + jit(k, seed + 5, 0.3);
    iconTile(ctx, c.x, head - 8 + bob, c.icon, K.white, null);
  } else if (c.activity === "wait") {
    const bob = f.reducedMotion ? 0 : Math.sin(f.t * 2.5 + seed);
    iconTile(ctx, c.x, head - 8 + bob, "?", K.white, K.blue);
  } else if (c.activity === "error") {
    iconTile(ctx, c.x, head - 8, "!", K.red, "#ffffff");
  } else if (c.activity === "leaving") {
    for (let i = 0; i < 4; i++) {
      const ang = (i / 4) * TAU + (f.reducedMotion ? 0 : f.t * 3);
      const r = 7 + (k % 3);
      sparkle(ctx, c.x + Math.cos(ang) * r, head + 2 + Math.sin(ang) * r * 0.7, 2.2 + (i % 2), i % 2 ? K.yellow : "#ffffff");
    }
  }
  ctx.globalAlpha = 1;
}

/** Hand-over burst at the parent when an errand ends. */
function handover(ctx: C2, c: Comp) {
  if (c.handover <= 0) return;
  const v = c.parent;
  const u = 1 - c.handover;
  const cx = v.x, cy = v.y - 34 - v.jump * 26;
  ctx.globalAlpha = c.a * c.handover;
  for (let i = 0; i < 7; i++) {
    const ang = (i / 7) * TAU + seedOf(c.id) * 0.1;
    const r = 6 + u * 16;
    sparkle(ctx, cx + Math.cos(ang) * r, cy + Math.sin(ang) * r * 0.75, 2.8 - u, i % 2 ? K.yellow : "#ffffff");
  }
  stud(ctx, cx, cy - 2 - u * 6, K.yellow, 2.6);
  ctx.globalAlpha = 1;
}

/** A tiny label tile under a companion's feet. */
function companionLabel(ctx: C2, c: Comp) {
  ctx.font = C_LABEL_FONT;
  const text = clip(ctx, c.label, 92);
  const w = ctx.measureText(text).width + 6;
  const x0 = Math.round(c.x - w / 2), y0 = c.y + 3;
  ctx.globalAlpha = c.a * 0.95;
  tile(ctx, x0, y0, w, 7.5, c.activity === "error" ? "#fde2e1" : K.white, 1);
  ctx.fillStyle = c.activity === "error" ? "#b91c1c" : K.ink;
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillText(text, x0 + 3, y0 + 4);
  ctx.globalAlpha = 1;
}

/** "+N" brick for helpers beyond the first four. */
function moreBadge(ctx: C2, v: LiveVillager) {
  const n = v.companions.length - MAX_COMPANIONS;
  if (n <= 0) return;
  const x = v.x - v.facing * 18, y = v.y - 4;
  ctx.globalAlpha = v.alpha;
  brick(ctx, x - 6, y, 12, 6, K.yellow, true);
  ctx.fillStyle = K.ink;
  ctx.font = "800 5.5px ui-sans-serif, system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(`+${n}`, x, y + 3.4);
  ctx.globalAlpha = 1;
}

// ── labels on flat brick tiles ──────────────────────────────────────────────

const NAME_FONT = "800 7px ui-sans-serif, system-ui, sans-serif";
const TEXT_FONT = "650 8.5px ui-sans-serif, system-ui, sans-serif";

function label(ctx: C2, v: LiveVillager, f: LiveFrame, k: number, stemOnly = false) {
  const urgent = v.urgent;
  const idle = v.status === "idle";
  ctx.font = NAME_FONT;
  const name = clip(ctx, v.name.toUpperCase(), 150);
  const nw = ctx.measureText(name).width;
  ctx.font = TEXT_FONT;
  const text = clip(ctx, v.label, 160);
  const lw = ctx.measureText(text).width;
  const w = Math.max(nw, lw) + 22 + (v.linked ? 6 : 0);
  const h = 22;
  const seed = seedOf(v.id) + 100;
  const amp = f.reducedMotion ? 0 : 1;
  const cx = v.labelX + jit(k, seed, 0.4) * amp;
  const y0 = v.labelY + jit(k, seed + 1, 0.3) * amp;
  const x0 = Math.round(cx - w / 2);
  const by = y0 + h + 2;

  // A 1×1 round stem from the tile down toward the head.
  const ht = headTop(v);
  if (stemOnly) {
    if (ht - by > 1 && ht - by < 60) {
      ctx.fillStyle = shade(K.grey, -0.1);
      ctx.fillRect(cx - 1.2, by, 2.4, ht - by - 1);
      ctx.fillStyle = "rgba(255,255,255,0.4)";
      ctx.fillRect(cx - 0.8, by, 0.7, ht - by - 1);
    }
    return;
  }

  ctx.save();
  if (urgent) {
    const sc = 1 + 0.05 * f.pulse;
    ctx.translate(cx, by);
    ctx.scale(sc, sc);
    ctx.translate(-cx, -by);
    ctx.globalAlpha = (0.18 + 0.3 * f.pulse) * v.alpha;
    ctx.fillStyle = "#ff5a4f";
    rr(ctx, x0 - 4, y0 - 4, w + 8, h + 10, 5);
    ctx.fill();
    ctx.globalAlpha = v.alpha;
  }
  if (v.selected) {
    ctx.fillStyle = K.yellow;
    rr(ctx, x0 - 2.5, y0 - 2.5, w + 5, h + 7, 4);
    ctx.fill();
  } else if (v.hovered) {
    ctx.fillStyle = "rgba(255,255,255,0.9)";
    rr(ctx, x0 - 2, y0 - 2, w + 4, h + 6, 4);
    ctx.fill();
  }
  const base = urgent ? (f.pulse > 0.5 ? "#ef3b30" : "#c9271e") : v.status === "error" ? "#fde2e1" : idle ? "#e5e7eb" : K.white;
  tile(ctx, x0, y0, w, h, base, 2.4);
  const sc = urgent ? K.yellow : v.color.startsWith("#") ? v.color : "#94a3b8";
  ctx.fillStyle = shade(sc, -0.3);
  rr(ctx, x0 + 3, y0 + 3.6, 8, h - 6, 1.5);
  ctx.fill();
  ctx.fillStyle = sc;
  rr(ctx, x0 + 3, y0 + 3, 8, h - 6.6, 1.5);
  ctx.fill();
  if (urgent || v.status === "error") {
    ctx.fillStyle = urgent ? K.ink : "#fff";
    ctx.font = "900 10px ui-sans-serif, system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("!", x0 + 7, y0 + h / 2);
  }
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.font = NAME_FONT;
  ctx.fillStyle = urgent ? "rgba(255,255,255,0.85)" : idle ? "#9ca3af" : "#6b7280";
  ctx.fillText(name, x0 + 15, y0 + 9);
  ctx.font = TEXT_FONT;
  ctx.fillStyle = urgent ? "#ffffff" : v.status === "error" ? "#b91c1c" : idle ? "#6b7280" : K.ink;
  ctx.fillText(text, x0 + 15, y0 + 18.5);
  // Linked to the mod: a small teal stud in the corner.
  if (v.linked) stud(ctx, x0 + w - 6, y0 + 5, "#14b8a6", 2.2);
  ctx.restore();
}

// ── HUD: a brick row being built, screen-fixed top-left ─────────────────────

function hud(ctx: C2, f: LiveFrame, k: number) {
  if (f.total <= 0) return;
  const dpr = Math.min(2, (typeof window !== "undefined" && window.devicePixelRatio) || 1);
  ctx.save();
  ctx.setTransform(dpr * 1.5, 0, 0, dpr * 1.5, 0, 0);
  const x = 10, y = 56; // css px / 1.5 → about (15, 84) on screen, below the top bar
  const n = Math.min(12, f.total);
  const done = Math.round((f.working / f.total) * n);
  const text = `AT WORK ${f.working} / ${f.total}`;
  ctx.font = "800 7.5px ui-sans-serif, system-ui, sans-serif";
  const tw = ctx.measureText(text).width + 12;
  tile(ctx, x, y, tw, 12, K.white, 1.6);
  ctx.fillStyle = K.ink;
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillText(text, x + 6, y + 6.4);
  const rx = x + tw + 6, ry = y + 4;
  ctx.fillStyle = "#5b6470";
  ctx.fillRect(rx - 2, ry + 4, n * 10 + 4, 5);
  for (let i = 0; i < n; i++) {
    const bx = rx + i * 10;
    if (i < done) brick(ctx, bx, ry - 1 + (i === done - 1 ? jit(k, 77, 0.4) : 0), 10, 5, "#14b8a6", false);
    else stud(ctx, bx + 5, ry + 3.4, "#5b6470", 2.3);
  }
  ctx.restore();
}

// ── the style ───────────────────────────────────────────────────────────────

export const toyBrickLive: LiveStyle = {
  id: "toy-brick",
  name: "Toy Brick",
  blurb: "Plastic-brick world with stop-motion villagers.",
  fps: FPS,
  bg: "#dcefff",
  lighting: "day",
  draw(ctx, f, view: ViewRect) {
    if (f.theme === "bengaluru") return drawBengaluru(ctx, f, view);
    statics();
    const k = Math.round(f.t * FPS);
    const x0 = view.x, x1 = view.x + view.w;
    const inView = (x: number, pad = 120) => x > x0 - pad && x < x1 + pad;

    // Fill beyond the world's top and bottom.
    if (view.y < 0) {
      ctx.fillStyle = K.sky;
      ctx.fillRect(x0 - 1, view.y - 1, view.w + 2, -view.y + 1);
    }
    if (view.y + view.h > WORLD_H) {
      ctx.fillStyle = shade(K.base, -0.08);
      ctx.fillRect(x0 - 1, WORLD_H - 1, view.w + 2, view.y + view.h - WORLD_H + 2);
    }

    // Back tiles: sky, hills, water.
    for (let tx = Math.floor(x0 / BACK_W) * BACK_W; tx < x1; tx += BACK_W) blit(ctx, backTile!, tx, 0);
    // Brick clouds, drifting per stop-motion frame.
    const CS = 260;
    const drift = f.reducedMotion ? 0 : f.drift;
    for (let i = Math.floor((x0 - drift - 100) / CS); i * CS + drift < x1 + 20; i++) {
      const hv = hash(i * 3.17 + 1);
      if (hv < 0.3) continue;
      const s = 0.7 + hash(i * 5.3) * 0.35;
      ctx.drawImage(cloud!.img, i * CS + drift + hash(i * 7.1) * 80, 10 + hash(i * 9.7) * 50, 80 * s, 30 * s);
    }
    for (const x of f.farPalms) if (inView(x, 30)) blit(ctx, farPalm!, x, GROUND.waterTop);
    // Water glints.
    if (!f.reducedMotion) {
      ctx.fillStyle = "rgba(255,255,255,0.75)";
      const GS = 70;
      for (let i = Math.floor(x0 / GS) - 1; i * GS < x1; i++) {
        const gx = i * GS + ((f.t * (10 + (Math.abs(i) % 3) * 4)) % GS);
        ctx.fillRect(Math.round(gx / 2) * 2, GROUND.waterTop + 6 + (Math.abs(i) % 4) * 9, 8, 1.2);
      }
    }
    if (inView(f.canoeX, 40)) canoe(ctx, f, k);
    // Ground tiles: front water row, baseplate, path.
    for (let tx = Math.floor(x0 / GROUND_W) * GROUND_W; tx < x1; tx += GROUND_W) blit(ctx, groundTile!, tx, 0);

    // Scenery back to front by base y.
    type Item = { y: number; draw: () => void };
    const items: Item[] = [];
    for (const p of f.palms) if (inView(p.x, p.h)) items.push({ y: p.baseY, draw: () => blit(ctx, palmSprite(p.h, p.lean), p.x, p.baseY) });
    if (inView(f.sign.x, 60)) items.push({ y: f.sign.y + 40, draw: () => blit(ctx, signSprite(f.sign.text), f.sign.x, f.sign.y) });
    for (const p of f.places) {
      const b = p.building;
      if (!inView(b.x + b.w / 2, b.w)) continue;
      items.push({ y: b.baseY, draw: () => { blit(ctx, buildingSprite(p), b.x, b.baseY); placeExtras(ctx, p, f, k); } });
    }
    const L = f.lamps;
    for (let i = 0; i < L.count; i++) {
      const x = L.x0 + i * L.dx;
      if (!inView(x, 20)) continue;
      items.push({ y: L.y + 24, draw: () => { blit(ctx, lampPost!, x, L.y); if (i < L.lit) flame(ctx, x + jit(k, 60 + i, 0.4), L.y - 1, k, i); } });
    }
    items.sort((a, b) => a.y - b.y);
    for (const it of items) it.draw();
    drawPeople(ctx, f, k, inView, view);
  },
};

/** Villagers and their companions (back-to-front by y), then labels; selected label last; the HUD. Shared by both places. */
function drawPeople(ctx: C2, f: LiveFrame, k: number, inView: (x: number, pad?: number) => boolean, view: ViewRect) {
  drawStations(ctx, f, view, PROP_LOOKS.toy);
  const zoomed = view.w < 700;
  type Body = { y: number; v: LiveVillager; c: Comp | null };
  const bodies: Body[] = [];
  const comps: Comp[] = [];
  for (const v of f.villagers) {
    if (v.alpha <= 0) continue;
    if (inView(v.x, 60)) bodies.push({ y: v.y, v, c: null });
    for (const c of companionsOf(v)) {
      const a = c.alpha * v.alpha;
      if (a <= 0.01 || !inView(c.x, 40)) continue;
      const cc: Comp = { ...c, parent: v, a };
      comps.push(cc);
      bodies.push({ y: c.y, v, c: cc });
    }
  }
  bodies.sort((a, b) => a.y - b.y);
  // Tethers lie behind everyone.
  for (const c of comps) tether(ctx, c);
  for (const b of bodies) {
    if (b.c) { companion(ctx, b.c, f, k); continue; }
    ctx.globalAlpha = b.v.alpha;
    figure(ctx, b.v, f, k);
    ctx.globalAlpha = 1;
    moreBadge(ctx, b.v);
  }
  for (const c of comps) handover(ctx, c);
  // Companion labels: only for the selected/hovered villager's helpers, or when zoomed in.
  for (const c of comps) if (zoomed || c.parent.selected || c.parent.hovered) companionLabel(ctx, c);
  // Label stems first, so no stem crosses another villager's tile.
  for (const v of f.villagers) {
    if (!inView(v.labelX, 120) || v.alpha <= 0) continue;
    ctx.globalAlpha = v.alpha;
    label(ctx, v, f, k, true);
    ctx.globalAlpha = 1;
  }
  let sel: LiveVillager | null = null;
  for (const v of f.villagers) {
    if (!inView(v.labelX, 120) || v.alpha <= 0) continue;
    if (v.selected) { sel = v; continue; }
    ctx.globalAlpha = v.alpha;
    label(ctx, v, f, k);
    ctx.globalAlpha = 1;
  }
  if (sel) {
    ctx.globalAlpha = sel.alpha;
    label(ctx, sel, f, k);
    ctx.globalAlpha = 1;
  }
  hud(ctx, f, k);
}

// ── Bengaluru: same bricks, city scenery ────────────────────────────────────

function drawBengaluru(ctx: C2, f: LiveFrame, view: ViewRect) {
  statics();
  blrStatics();
  const k = Math.round(f.t * FPS);
  const x0 = view.x, x1 = view.x + view.w;
  const inView = (x: number, pad = 120) => x > x0 - pad && x < x1 + pad;

  if (view.y < 0) {
    ctx.fillStyle = K.sky;
    ctx.fillRect(x0 - 1, view.y - 1, view.w + 2, -view.y + 1);
  }
  if (view.y + view.h > WORLD_H) {
    ctx.fillStyle = PAVER_BELOW;
    ctx.fillRect(x0 - 1, WORLD_H - 1, view.w + 2, view.y + view.h - WORLD_H + 2);
  }

  // Sky with a hazy far city.
  for (let tx = Math.floor(x0 / BACK_W) * BACK_W; tx < x1; tx += BACK_W) blit(ctx, blrSky!, tx, 0);
  const CS = 260;
  const drift = f.reducedMotion ? 0 : f.drift;
  for (let i = Math.floor((x0 - drift - 100) / CS); i * CS + drift < x1 + 20; i++) {
    const hv = hash(i * 3.17 + 1);
    if (hv < 0.3) continue;
    const s = 0.7 + hash(i * 5.3) * 0.35;
    ctx.drawImage(cloud!.img, i * CS + drift + hash(i * 7.1) * 80, 10 + hash(i * 9.7) * 50, 80 * s, 30 * s);
  }
  // Skyline towers at the far-bank slots.
  for (const x of f.farPalms) {
    if (!inView(x, 70)) continue;
    const t = towerOf(x);
    blit(ctx, towerSprite(t.kind, t.h, t.w), x, GROUND.waterTop);
  }
  kites(ctx, f, x0, x1);
  // Metro viaduct band, then the train on the deck.
  for (let tx = Math.floor(x0 / BACK_W) * BACK_W; tx < x1; tx += BACK_W) blit(ctx, blrBand!, tx, GROUND.waterTop);
  if (inView(f.canoeX, 110)) metro(ctx, f, k);
  // Footpath, kerbs and road.
  for (let tx = Math.floor(x0 / GROUND_W) * GROUND_W; tx < x1; tx += GROUND_W) blit(ctx, blrGround!, tx, 0);
  if (inView(f.sign.x + 90, 60)) zebra(ctx, f);

  type Item = { y: number; draw: () => void };
  const items: Item[] = [];
  for (const p of f.palms) if (inView(p.x, p.h)) items.push({ y: p.baseY, draw: () => blit(ctx, treeSprite(p.h, p.lean), p.x, p.baseY) });
  if (inView(f.sign.x, 60)) items.push({ y: f.sign.y + 40, draw: () => blit(ctx, blrSignSprite(f.sign.text), f.sign.x, f.sign.y) });
  for (const p of f.places) {
    const b = p.building;
    if (!inView(b.x + b.w / 2, b.w)) continue;
    items.push({ y: b.baseY, draw: () => { blit(ctx, blrBuildingSprite(p), b.x, b.baseY); placeExtras(ctx, p, f, k, true); } });
  }
  const L = f.lamps;
  for (let i = 0; i < L.count; i++) {
    const x = L.x0 + i * L.dx;
    if (!inView(x, 20)) continue;
    items.push({ y: L.y + 24, draw: () => { blit(ctx, streetLight!, x, L.y); if (i < L.lit) bulb(ctx, x + STREET_BULB.x, L.y + STREET_BULB.y, k, i); } });
  }
  for (let i = 0; i < TRAFFIC.length; i++) {
    const v = TRAFFIC[i]!;
    const x = trafficX(f, i);
    if (!inView(x, 60)) continue;
    const y = v.lane + jit(k, 90 + i, 0.3);
    items.push({ y: v.lane, draw: () => (v.kind === "bus" ? drawBus(ctx, x, y, v.dir) : drawAuto(ctx, x, y, v.dir)) });
  }
  items.sort((a, b) => a.y - b.y);
  for (const it of items) it.draw();
  drawPeople(ctx, f, k, inView, view);
}

const PAVER_BELOW = "#b8b2a5";

/** A lit street-light bulb: warm glow plus a bright lens. */
function bulb(ctx: C2, x: number, y: number, k: number, i: number) {
  const a = 0.85 + 0.15 * hash(k * 0.7 + i);
  ctx.globalAlpha = 0.25 * a;
  ctx.fillStyle = "#ffd36b";
  ell(ctx, x, y + 3, 12, 9);
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.fillStyle = "#fff3a8";
  rr(ctx, x - 3, y - 1, 6, 2.4, 1);
  ctx.fill();
}
