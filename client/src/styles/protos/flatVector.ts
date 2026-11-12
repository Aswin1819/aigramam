import { H, LAYOUT, STATUS_COLOR, W, hash, labelAnchor, rng, skeleton, type SceneFrame, type VillagerFrame } from "../scene";
import type { StyleProto } from "../types";

/**
 * 6 · Flat Vector: a clean explainer illustration at dusk. Flat shapes with no
 * outlines, a navy/indigo palette with warm accents, soft light cones, long
 * shadows and rounded characters. Smooth motion with small ambient drifts.
 */

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
  wall: "#d9774f",
  wallShade: "#b85f3f",
  roof: "#7a2e45",
  roofLight: "#913a55",
  leaf: "#1f7a6a",
  leafDark: "#155a50",
  trunk: "#5b3b5e",
  brass: "#d39b4e",
};

/** One offscreen canvas at 2× logical resolution, painted once. */
function makeLayer(paint: (c: CanvasRenderingContext2D) => void): HTMLCanvasElement {
  const cv = document.createElement("canvas");
  cv.width = W * 2;
  cv.height = H * 2;
  const c = cv.getContext("2d")!;
  c.scale(2, 2);
  paint(c);
  return cv;
}

let bgLayer: HTMLCanvasElement | null = null;
let shopLayer: HTMLCanvasElement | null = null;

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

function farPalm(c: CanvasRenderingContext2D, x: number, base: number, h: number) {
  c.fillStyle = C.farPalm;
  c.beginPath();
  c.moveTo(x - 1.6, base);
  c.lineTo(x + 2 - 0.8, base - h);
  c.lineTo(x + 2 + 0.8, base - h);
  c.lineTo(x + 1.6, base);
  c.fill();
  for (let i = 0; i < 6; i++) leaf(c, x + 2, base - h, -Math.PI + (i / 5) * Math.PI + 0.25 * Math.sin(i * 3), h * 0.42, 3);
}

function paintBackground(c: CanvasRenderingContext2D) {
  // Dusk sky.
  const g = c.createLinearGradient(0, 0, 0, LAYOUT.horizonY);
  g.addColorStop(0, C.skyTop);
  g.addColorStop(0.5, C.skyMid);
  g.addColorStop(0.82, C.skyLow);
  g.addColorStop(1, C.skyGlow);
  c.fillStyle = g;
  c.fillRect(0, 0, W, LAYOUT.horizonY);

  // Stars (static; flat vector keeps them quiet).
  const r = rng(61);
  for (let i = 0; i < 46; i++) {
    const x = r() * W, y = r() * 92, s = 0.5 + r() * 0.9;
    c.fillStyle = `rgba(255,240,210,${0.25 + r() * 0.5})`;
    c.beginPath();
    c.arc(x, y, s * 0.6, 0, Math.PI * 2);
    c.fill();
  }

  // Moon with soft halo rings.
  for (const [rad, a] of [[44, 0.05], [30, 0.08], [22, 0.12]] as const) {
    c.fillStyle = `rgba(251,238,193,${a})`;
    c.beginPath();
    c.arc(560, 52, rad, 0, Math.PI * 2);
    c.fill();
  }
  c.fillStyle = C.moon;
  c.beginPath();
  c.arc(560, 52, 15, 0, Math.PI * 2);
  c.fill();
  c.fillStyle = "rgba(214,196,150,0.55)";
  for (const [dx, dy, rr] of [[-5, -3, 3], [4, 5, 2.2], [6, -6, 1.5]] as const) {
    c.beginPath();
    c.arc(560 + dx, 52 + dy, rr, 0, Math.PI * 2);
    c.fill();
  }

  // Rolling hills on the far bank.
  c.fillStyle = C.hillFar;
  c.beginPath();
  c.moveTo(0, LAYOUT.horizonY);
  for (let x = 0; x <= W; x += 20) c.lineTo(x, LAYOUT.horizonY - 14 - 9 * Math.sin(x * 0.011) - 5 * Math.sin(x * 0.031 + 1));
  c.lineTo(W, LAYOUT.horizonY);
  c.fill();
  c.fillStyle = C.hillNear;
  c.beginPath();
  c.moveTo(0, LAYOUT.horizonY);
  for (let x = 0; x <= W; x += 20) c.lineTo(x, LAYOUT.horizonY - 5 - 4 * Math.sin(x * 0.017 + 2));
  c.lineTo(W, LAYOUT.horizonY);
  c.fill();
  for (const x of LAYOUT.farPalms) farPalm(c, x, LAYOUT.horizonY - 3, 30);

  // Backwater.
  const wg = c.createLinearGradient(0, LAYOUT.waterTop, 0, LAYOUT.waterBottom);
  wg.addColorStop(0, "#4a3f84");
  wg.addColorStop(0.25, C.water);
  wg.addColorStop(1, C.waterDeep);
  c.fillStyle = wg;
  c.fillRect(0, LAYOUT.waterTop, W, LAYOUT.waterBottom - LAYOUT.waterTop);

  // Ground, the dirt path, the near edge.
  c.fillStyle = C.ground;
  c.fillRect(0, LAYOUT.groundY, W, H - LAYOUT.groundY);
  c.fillStyle = "#33356e";
  c.fillRect(0, LAYOUT.groundY, W, 4);
  c.fillStyle = C.pathEdge;
  c.beginPath();
  c.roundRect(-20, 300, W + 40, 44, 22);
  c.fill();
  c.fillStyle = C.path;
  c.beginPath();
  c.roundRect(-20, 303, W + 40, 38, 19);
  c.fill();
  c.fillStyle = C.groundFront;
  c.fillRect(0, 348, W, H - 348);
  // A few flat grass tufts and pebbles.
  const r2 = rng(17);
  for (let i = 0; i < 22; i++) {
    const x = r2() * W, y = 206 + r2() * 88;
    c.fillStyle = r2() > 0.5 ? "#2f3f70" : "#34336f";
    c.beginPath();
    c.ellipse(x, y, 3 + r2() * 4, 1.2 + r2(), 0, 0, Math.PI * 2);
    c.fill();
  }
}

function paintShop(c: CanvasRenderingContext2D) {
  const sh = LAYOUT.shop;
  const base = sh.y + sh.h;

  // Long shadow towards the lower left (moon is up and to the right).
  c.fillStyle = "rgba(10,10,40,0.28)";
  c.beginPath();
  c.moveTo(sh.x, base);
  c.lineTo(sh.x + sh.w, base);
  c.lineTo(sh.x + sh.w - 70, base + 26);
  c.lineTo(sh.x - 70, base + 26);
  c.fill();

  // Warm light spilling from the door onto the ground (a soft cone).
  const lg = c.createLinearGradient(0, base, 0, base + 46);
  lg.addColorStop(0, "rgba(255,190,110,0.38)");
  lg.addColorStop(1, "rgba(255,190,110,0)");
  c.fillStyle = lg;
  c.beginPath();
  c.moveTo(sh.doorX - 13, base);
  c.lineTo(sh.doorX + 13, base);
  c.lineTo(sh.doorX + 46, base + 46);
  c.lineTo(sh.doorX - 46, base + 46);
  c.fill();

  // Walls with a flat shaded side.
  c.fillStyle = C.wall;
  c.fillRect(sh.x, sh.y, sh.w, sh.h);
  c.fillStyle = C.wallShade;
  c.fillRect(sh.x + sh.w - 22, sh.y, 22, sh.h);
  c.fillStyle = "rgba(0,0,0,0.12)";
  c.fillRect(sh.x, base - 6, sh.w, 6);

  // Roof: a flat trapezoid in bands, with a ridge.
  c.fillStyle = C.roof;
  c.beginPath();
  c.moveTo(sh.x - 16, sh.y + 4);
  c.lineTo(sh.x + 26, sh.y - sh.roofH);
  c.lineTo(sh.x + sh.w - 26, sh.y - sh.roofH);
  c.lineTo(sh.x + sh.w + 16, sh.y + 4);
  c.closePath();
  c.fill();
  c.fillStyle = C.roofLight;
  for (let i = 0; i < 4; i++) {
    const y0 = sh.y - sh.roofH + 6 + i * 10;
    const k = (y0 - (sh.y - sh.roofH)) / (sh.roofH + 4);
    const xl = sh.x + 26 - 42 * k;
    const xr = sh.x + sh.w - 26 + 42 * k;
    c.fillRect(xl, y0, xr - xl, 3);
  }
  c.fillStyle = "#5e2236";
  c.beginPath();
  c.roundRect(sh.x + 22, sh.y - sh.roofH - 3, sh.w - 44, 5, 2.5);
  c.fill();
  c.fillStyle = "rgba(0,0,0,0.2)";
  c.fillRect(sh.x, sh.y + 4, sh.w, 3);

  // Window glow and window.
  const wx = sh.x + 96, wy = sh.y + 18;
  const glow = c.createRadialGradient(wx + 12, wy + 10, 2, wx + 12, wy + 10, 34);
  glow.addColorStop(0, "rgba(255,207,122,0.35)");
  glow.addColorStop(1, "rgba(255,207,122,0)");
  c.fillStyle = glow;
  c.fillRect(wx - 30, wy - 30, 84, 80);
  c.fillStyle = C.warm;
  c.beginPath();
  c.roundRect(wx + 18, wy, 22, 18, 3);
  c.fill();
  c.fillStyle = C.wallShade;
  c.fillRect(wx + 28.3, wy, 1.6, 18);

  // Open door with warm interior and a silhouetted counter.
  c.fillStyle = C.warmDeep;
  c.beginPath();
  c.roundRect(sh.doorX - 13, sh.y + 22, 26, sh.h - 22, [8, 8, 0, 0]);
  c.fill();
  c.fillStyle = "rgba(255,230,170,0.6)";
  c.beginPath();
  c.roundRect(sh.doorX - 9, sh.y + 27, 18, 14, 6);
  c.fill();
  c.fillStyle = "#8a3f2f";
  c.fillRect(sh.doorX - 13, sh.y + 52, 26, 6);

  // Board as a cream pill.
  c.fillStyle = "#fbe8c8";
  c.beginPath();
  c.roundRect(sh.x + 10, sh.y + 9, 64, 15, 7.5);
  c.fill();
  c.fillStyle = C.navy;
  c.font = "700 7.5px ui-sans-serif, system-ui, sans-serif";
  c.textAlign = "center";
  c.textBaseline = "middle";
  c.fillText("CHAYA KADA", sh.x + 42, sh.y + 16.8);

  // Counter (left) with three tea glasses.
  c.fillStyle = "#8a3f2f";
  c.beginPath();
  c.roundRect(sh.x + 6, sh.y + 46, 64, 7, 3);
  c.fill();
  c.fillStyle = "rgba(0,0,0,0.18)";
  c.fillRect(sh.x + 6, sh.y + 53, 64, 21);
  for (let i = 0; i < 3; i++) {
    const gx = sh.x + 20 + i * 14;
    c.fillStyle = "rgba(255,255,255,0.55)";
    c.beginPath();
    c.moveTo(gx - 3, sh.y + 38);
    c.lineTo(gx + 3, sh.y + 38);
    c.lineTo(gx + 2.2, sh.y + 46);
    c.lineTo(gx - 2.2, sh.y + 46);
    c.fill();
    c.fillStyle = "#c8873a";
    c.fillRect(gx - 2.5, sh.y + 41, 5, 5);
  }

  // Street lamp beside the shop, its cone falling across the path.
  const slx = 256, sly = 230;
  const cone = c.createLinearGradient(0, sly, 0, 338);
  cone.addColorStop(0, "rgba(255,214,140,0.42)");
  cone.addColorStop(1, "rgba(255,214,140,0.02)");
  c.fillStyle = cone;
  c.beginPath();
  c.moveTo(slx + 9, sly + 3);
  c.lineTo(slx + 17, sly + 3);
  c.lineTo(slx + 48, 338);
  c.lineTo(slx - 22, 338);
  c.fill();
  c.fillStyle = "rgba(255,214,140,0.16)";
  c.beginPath();
  c.ellipse(slx + 13, 334, 36, 6, 0, 0, Math.PI * 2);
  c.fill();
  c.fillStyle = "rgba(10,10,40,0.28)";
  c.beginPath();
  c.moveTo(slx - 2, 300);
  c.lineTo(slx + 2, 300);
  c.lineTo(slx - 44, 312);
  c.lineTo(slx - 47, 311);
  c.fill();
  c.fillStyle = "#4b3a66";
  c.beginPath();
  c.roundRect(slx - 1.8, sly - 6, 3.6, 306 - sly, 1.8);
  c.roundRect(slx - 1, sly - 6, 15, 2.6, 1.3);
  c.roundRect(slx - 4, 296, 8, 5, 2);
  c.fill();
  c.fillStyle = "#3a2d55";
  c.beginPath();
  c.moveTo(slx + 7, sly - 4);
  c.lineTo(slx + 19, sly - 4);
  c.lineTo(slx + 17, sly + 1);
  c.lineTo(slx + 9, sly + 1);
  c.fill();
  const bulb = c.createRadialGradient(slx + 13, sly + 2, 0.5, slx + 13, sly + 2, 16);
  bulb.addColorStop(0, "rgba(255,226,160,0.6)");
  bulb.addColorStop(1, "rgba(255,226,160,0)");
  c.fillStyle = bulb;
  c.fillRect(slx - 3, sly - 14, 32, 32);
  c.fillStyle = "#fff1c9";
  c.beginPath();
  c.ellipse(slx + 13, sly + 2, 4, 2.2, 0, 0, Math.PI * 2);
  c.fill();

  // Sign post (static part).
  const s = LAYOUT.sign;
  c.fillStyle = "rgba(10,10,40,0.28)";
  c.beginPath();
  c.ellipse(s.x - 18, s.y + 41, 22, 3, 0, 0, Math.PI * 2);
  c.fill();
  c.fillStyle = "#4b3a66";
  c.beginPath();
  c.roundRect(s.x - 2, s.y, 4, 41, 2);
  c.fill();
  c.fillStyle = C.navy;
  c.beginPath();
  c.roundRect(s.x - 34, s.y - 15, 68, 17, 8.5);
  c.fill();
  c.fillStyle = C.warm;
  c.font = "800 8.5px ui-sans-serif, system-ui, sans-serif";
  c.fillText(s.text, s.x, s.y - 6.2);
}

function palm(ctx: CanvasRenderingContext2D, x: number, baseY: number, h: number, lean: number, t: number, seed: number) {
  const topX = x + lean * h;
  const topY = baseY - h;
  // Long shadow on the ground.
  ctx.fillStyle = "rgba(10,10,40,0.22)";
  ctx.beginPath();
  ctx.moveTo(x - 3, baseY);
  ctx.lineTo(x + 3, baseY);
  ctx.lineTo(x - h * 0.55, baseY + h * 0.14);
  ctx.lineTo(x - h * 0.6, baseY + h * 0.12);
  ctx.fill();
  // Tapered trunk, slightly curved.
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
  // Fronds in two flat tones, swaying a little.
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

function villager(ctx: CanvasRenderingContext2D, v: VillagerFrame, t: number) {
  const s = skeleton(v);
  const f = v.facing;
  const hop = t % 2.4; // same hop window as frameAt
  const cheer = v.status === "finished" ? Math.max(0, Math.min(1, Math.min(hop, 1.1 - hop) / 0.15)) : 0;
  if (cheer > 0) {
    // Cheer: both arms swing up in a V for the whole double hop.
    const k = cheer;
    const mix = (a: { x: number; y: number }, b: { x: number; y: number }) => ({ x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k });
    s.elbowF = mix(s.elbowF, { x: s.shoulder.x + f * 7, y: s.shoulder.y - 6 });
    s.handF = mix(s.handF, { x: s.shoulder.x + f * 11, y: s.shoulder.y - 16 });
    s.elbowB = mix(s.elbowB, { x: s.shoulder.x - f * 7, y: s.shoulder.y - 6 });
    s.handB = mix(s.handB, { x: s.shoulder.x - f * 11, y: s.shoulder.y - 16 });
  }

  // Long shadow cast to the lower left, flattening as the villager jumps.
  ctx.save();
  ctx.translate(v.x, v.y);
  ctx.transform(1, 0, 1.1, -0.22, 0, 0);
  ctx.fillStyle = `rgba(10,10,40,${0.28 * (1 - v.jump * 0.5)})`;
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

  // Legs (skin), back first, slightly darker.
  limb([s.hip, s.kneeB, s.footB], v.skin, 4.4);
  limb([s.hip, s.kneeB, s.footB], shade, 4.4);
  limb([s.hip, s.kneeF, s.footF], v.skin, 4.4);
  // Back arm.
  limb([s.shoulder, s.elbowB, s.handB], v.skin, 3.6);
  limb([s.shoulder, s.elbowB, s.handB], shade, 3.6);
  limb([s.shoulder, s.elbowB], v.shirt, 4.4);

  // Mundu: rounded trapezoid from the hip to below the knees.
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

  // Torso: a rounded rect with a flat shaded back half.
  const tx = (s.neck.x + s.hip.x) / 2;
  ctx.fillStyle = v.shirt;
  ctx.beginPath();
  ctx.roundRect(tx - 7.5, s.neck.y - 1, 15, s.hip.y - s.neck.y + 1, [6, 6, 3, 3]);
  ctx.fill();
  ctx.fillStyle = "rgba(0,0,0,0.13)";
  ctx.beginPath();
  ctx.roundRect(f > 0 ? tx - 7.5 : tx + 1.5, s.neck.y - 1, 6, s.hip.y - s.neck.y + 1, f > 0 ? [6, 0, 0, 3] : [0, 6, 3, 0]);
  ctx.fill();

  // Head: circle, flat hair cap, eye.
  const hx = s.head.x, hy = s.head.y;
  ctx.fillStyle = v.skin;
  ctx.fillRect(s.neck.x - 2, s.neck.y - 4, 4, 5);
  ctx.beginPath();
  ctx.arc(hx, hy, 7.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#1a1530";
  ctx.beginPath();
  ctx.arc(hx - f * 0.6, hy - 0.8, 7.4, Math.PI * 1.02, Math.PI * 1.98);
  ctx.fill();
  if (v.id === "b") {
    // Hair bun.
    ctx.beginPath();
    ctx.arc(hx - f * 6.5, hy - 1, 3.6, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = "#1a1530";
  ctx.beginPath();
  ctx.arc(hx + f * 3.6, hy + 0.6, 0.95, 0, Math.PI * 2);
  ctx.fill();
  if (v.status === "finished") {
    ctx.strokeStyle = "#1a1530";
    ctx.lineWidth = 0.9;
    ctx.beginPath();
    ctx.arc(hx + f * 3, hy + 2.5, 1.8, 0.2, Math.PI - 0.2);
    ctx.stroke();
  }

  // Front arm.
  limb([s.elbowF, s.handF], v.skin, 3.6);
  limb([s.shoulder, s.elbowF], v.shirt, 4.4);

  if (v.carry === "laptop") {
    const lx = s.handF.x, ly = s.handF.y;
    // Screen glow on the face and a little light cone.
    const gl = ctx.createRadialGradient(lx, ly - 6, 1, lx, ly - 6, 16);
    gl.addColorStop(0, "rgba(94,234,212,0.35)");
    gl.addColorStop(1, "rgba(94,234,212,0)");
    ctx.fillStyle = gl;
    ctx.fillRect(lx - 16, ly - 22, 32, 32);
    // Lid: hinge at the far end, screen facing the villager, teal-lit.
    const hx0 = lx + f * 9, hy0 = ly - 1;
    ctx.fillStyle = "#3b3f6b";
    ctx.beginPath();
    ctx.moveTo(hx0, hy0);
    ctx.lineTo(hx0 + f * 4, hy0 - 14);
    ctx.lineTo(hx0 + f * 1.4, hy0 - 14.6);
    ctx.lineTo(hx0 - f * 2.4, hy0);
    ctx.fill();
    ctx.fillStyle = STATUS_COLOR.working;
    ctx.beginPath();
    ctx.moveTo(hx0 - f * 2.2, hy0 - 1.6);
    ctx.lineTo(hx0 + f * 1.2, hy0 - 13.4);
    ctx.lineTo(hx0 + f * 0.2, hy0 - 13.4);
    ctx.lineTo(hx0 - f * 3.2, hy0 - 1.6);
    ctx.fill();
    // Base.
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

function tag(ctx: CanvasRenderingContext2D, v: VillagerFrame, f: SceneFrame) {
  const a = labelAnchor(v);
  const urgent = v.status === "waiting";
  const working = v.status === "working";
  const col = STATUS_COLOR[v.status];
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";

  // Label pill: status dot + action text (+ percentage for the working task).
  ctx.font = "600 9px ui-sans-serif, system-ui, sans-serif";
  const tw = ctx.measureText(v.label).width;
  const pct = `${Math.round(f.progress * 100)}%`;
  ctx.font = "700 7px ui-sans-serif, system-ui, sans-serif";
  const pw = working ? ctx.measureText(pct).width + 7 : 0;
  const lh = 15;
  const lw = 20 + tw + pw + 8;
  const ly = a.y - 4;
  const lx = a.x - lw / 2;

  if (urgent) {
    // Soft expanding halo for the approval request.
    const grow = 2 + f.pulse * 6;
    ctx.fillStyle = `rgba(255,90,79,${0.32 * (1 - f.pulse) + 0.06})`;
    ctx.beginPath();
    ctx.roundRect(lx - grow, ly - lh / 2 - grow, lw + grow * 2, lh + grow * 2, lh / 2 + grow);
    ctx.fill();
  }
  // Soft drop shadow, pointer, pill.
  ctx.fillStyle = "rgba(8,8,32,0.35)";
  ctx.beginPath();
  ctx.roundRect(lx + 1.5, ly - lh / 2 + 2, lw, lh, lh / 2);
  ctx.fill();
  const pill = urgent ? `rgb(255,${74 + 34 * f.pulse},${64 + 30 * f.pulse})` : "#f6f4ff";
  ctx.fillStyle = pill;
  ctx.beginPath();
  ctx.moveTo(a.x - 4, ly + lh / 2 - 0.5);
  ctx.lineTo(a.x + 4, ly + lh / 2 - 0.5);
  ctx.lineTo(a.x, ly + lh / 2 + 4.5);
  ctx.fill();
  ctx.beginPath();
  ctx.roundRect(lx, ly - lh / 2, lw, lh, lh / 2);
  ctx.fill();

  // Status dot (white ring on the urgent pill so it still reads).
  const dx = lx + 9;
  if (urgent) {
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.arc(dx, ly, 3.4 + f.pulse * 0.8, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#e0342b";
    ctx.beginPath();
    ctx.arc(dx, ly, 2, 0, Math.PI * 2);
    ctx.fill();
  } else {
    ctx.fillStyle = working ? "#14b8a6" : "#65a30d";
    ctx.beginPath();
    ctx.arc(dx, ly, 3, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.fillStyle = urgent ? "#fff" : C.navy;
  ctx.font = "600 9px ui-sans-serif, system-ui, sans-serif";
  ctx.fillText(v.label, lx + 16, ly + 0.5);

  if (working) {
    // Percentage chip and a progress line clipped to the pill's bottom.
    ctx.fillStyle = "#0f766e";
    ctx.font = "700 7px ui-sans-serif, system-ui, sans-serif";
    ctx.fillText(pct, lx + 16 + tw + 6, ly + 0.5);
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(lx, ly - lh / 2, lw, lh, lh / 2);
    ctx.clip();
    ctx.fillStyle = "rgba(27,29,72,0.12)";
    ctx.fillRect(lx, ly + lh / 2 - 2.6, lw, 2.6);
    ctx.fillStyle = "#14b8a6";
    ctx.fillRect(lx, ly + lh / 2 - 2.6, lw * f.progress, 2.6);
    ctx.restore();
  }

  // Name pill above: navy with the name in the status colour.
  ctx.font = "800 7px ui-sans-serif, system-ui, sans-serif";
  const name = v.name.toUpperCase();
  const nw = ctx.measureText(name).width + 12;
  const ny = ly - lh / 2 - 8;
  ctx.fillStyle = C.navy;
  ctx.beginPath();
  ctx.roundRect(a.x - nw / 2, ny - 5.5, nw, 11, 5.5);
  ctx.fill();
  ctx.fillStyle = col;
  ctx.textAlign = "center";
  ctx.fillText(name, a.x, ny + 0.4);
  ctx.textBaseline = "alphabetic";
}

export const flatVector: StyleProto = {
  id: "flat-vector",
  n: 6,
  name: "Flat Vector",
  blurb: "A clean explainer illustration at dusk: flat shapes with no outlines, navy and warm accents, soft light cones and long shadows. Smooth, with small ambient drifts.",
  bg: "#1e2147",
  draw(ctx, f) {
    if (!bgLayer) bgLayer = makeLayer(paintBackground);
    if (!shopLayer) shopLayer = makeLayer(paintShop);
    const t = f.t;
    ctx.drawImage(bgLayer, 0, 0, W, H);

    // Drifting pill clouds.
    ctx.fillStyle = "rgba(70,62,140,0.55)";
    for (let i = 0; i < 4; i++) {
      const span = W + 160;
      const x = ((hash(i + 3) * span + f.drift * (0.4 + i * 0.15)) % span) - 80;
      const y = 22 + hash(i + 9) * 60;
      const w = 50 + hash(i + 5) * 40;
      ctx.beginPath();
      ctx.roundRect(x, y, w, 9, 4.5);
      ctx.roundRect(x + w * 0.2, y - 6, w * 0.45, 9, 4.5);
      ctx.fill();
    }

    // Water shimmer bands and the moon's broken reflection.
    for (let i = 0; i < 14; i++) {
      const y = LAYOUT.waterTop + 6 + (i % 7) * 6 + (i > 6 ? 3 : 0);
      const span = W + 60;
      const x = ((hash(i * 4.1) * span + t * (6 + (i % 3) * 4)) % span) - 30;
      ctx.fillStyle = `rgba(150,150,230,${0.12 + 0.1 * Math.sin(t * 1.3 + i)})`;
      ctx.beginPath();
      ctx.roundRect(x, y, 18 + hash(i) * 26, 1.6, 0.8);
      ctx.fill();
    }
    for (let i = 0; i < 6; i++) {
      const y = LAYOUT.waterTop + 4 + i * 6.5;
      const w = 22 - i * 2.4 + Math.sin(t * 2 + i * 1.7) * 3;
      ctx.fillStyle = `rgba(251,238,193,${0.5 - i * 0.06})`;
      ctx.beginPath();
      ctx.roundRect(560 - w / 2 + Math.sin(t * 1.4 + i) * 2, y, w, 2, 1);
      ctx.fill();
    }

    // Canoe with rower, and its soft reflection.
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
      ctx.lineTo(cx + 13, cy + 5 + Math.sin(t * 2) * 2);
      ctx.stroke();
      ctx.restore();
    }

    // Lamp row: light cones and pools first (behind everything on the ground).
    const L = LAYOUT.lamps;
    for (let i = 0; i < L.count; i++) {
      const lit = Math.max(0, Math.min(1, f.lampsLit - i));
      if (lit <= 0) continue;
      const x = L.x0 + i * L.dx;
      const flick = 0.9 + 0.1 * Math.sin(t * 9 + i * 2.1);
      const cg = ctx.createLinearGradient(0, L.y - 2, 0, L.y + 30);
      cg.addColorStop(0, `rgba(255,200,120,${0.32 * lit * flick})`);
      cg.addColorStop(1, "rgba(255,200,120,0)");
      ctx.fillStyle = cg;
      ctx.beginPath();
      ctx.moveTo(x - 3, L.y - 2);
      ctx.lineTo(x + 3, L.y - 2);
      ctx.lineTo(x + 15, L.y + 30);
      ctx.lineTo(x - 15, L.y + 30);
      ctx.fill();
      ctx.fillStyle = `rgba(255,200,120,${0.16 * lit})`;
      ctx.beginPath();
      ctx.ellipse(x, L.y + 23, 14, 3.5, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.drawImage(shopLayer, 0, 0, W, H);
    // Steam over the counter glasses.
    const sh = LAYOUT.shop;
    for (let i = 0; i < 3; i++) steam(ctx, sh.x + 20 + i * 14, sh.y + 36, t, i);

    // Palms.
    LAYOUT.palms.forEach((p, i) => palm(ctx, p.x, p.baseY, p.h, p.lean, t, i * 1.7));

    // Lamp posts and flames.
    for (let i = 0; i < L.count; i++) {
      const x = L.x0 + i * L.dx;
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
      const lit = Math.max(0, Math.min(1, f.lampsLit - i));
      if (lit > 0) {
        const flick = 1 + 0.12 * Math.sin(t * 11 + i * 1.3);
        ctx.globalAlpha = lit;
        const hg = ctx.createRadialGradient(x, L.y - 4, 0.5, x, L.y - 4, 12);
        hg.addColorStop(0, "rgba(255,210,130,0.55)");
        hg.addColorStop(1, "rgba(255,210,130,0)");
        ctx.fillStyle = hg;
        ctx.fillRect(x - 12, L.y - 16, 24, 24);
        ctx.fillStyle = C.warmDeep;
        ctx.beginPath();
        ctx.moveTo(x, L.y - 9 * flick);
        ctx.quadraticCurveTo(x + 3.5, L.y - 2, x, L.y - 0.5);
        ctx.quadraticCurveTo(x - 3.5, L.y - 2, x, L.y - 9 * flick);
        ctx.fill();
        ctx.fillStyle = "#fff3c4";
        ctx.beginPath();
        ctx.ellipse(x, L.y - 2.6, 1.2, 2.2, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
      }
    }

    // Villagers, then steam from Ammini's glass, then the tags on top.
    for (const v of f.villagers) villager(ctx, v, t);
    const amm = f.villagers.find((v) => v.carry === "glass");
    if (amm) {
      const s = skeleton(amm);
      steam(ctx, s.handF.x, s.handF.y - 9, t, 7);
    }
    for (const v of f.villagers) tag(ctx, v, f);

    // Soft vignette-free footer: a thin progress track for the working task.
    ctx.fillStyle = "rgba(246,244,255,0.12)";
    ctx.beginPath();
    ctx.roundRect(20, 352, W - 40, 3, 1.5);
    ctx.fill();
    ctx.fillStyle = STATUS_COLOR.working;
    ctx.beginPath();
    ctx.roundRect(20, 352, Math.max(3, (W - 40) * f.progress), 3, 1.5);
    ctx.fill();
  },
};
