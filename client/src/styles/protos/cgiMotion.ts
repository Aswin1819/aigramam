import { BODY, H, LAYOUT, STATUS_COLOR, W, hash, labelAnchor, rng, skeleton, type SceneFrame, type Status, type VillagerFrame } from "../scene";
import type { StyleProto } from "../types";

/**
 * 8 · CGI Motion: a polished "animated feature" night. Smooth-shaded,
 * rim-lit villagers on wet reflective ground, volumetric light shafts,
 * glowing status rings pulsing out on the floor, holographic code panels
 * around the working villager and a softly defocused far background.
 *
 * It's a 2.5D fake: gradient-shaded volumes plus cached light layers.
 * Static layers are painted once at 2× into offscreen canvases; the far
 * layer is blurred once at cache time for depth of field.
 */

const S = 2; // cache resolution factor
const RIM = "rgba(150,236,255,";
const AMB: RGB = [6, 26, 36];
const WARM: RGB = [255, 214, 160];

type RGB = [number, number, number];
const rgbOf = (c: string): RGB => {
  const n = parseInt(c.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const mix = (a: RGB, b: RGB, k: number) =>
  `rgb(${Math.round(a[0] + (b[0] - a[0]) * k)},${Math.round(a[1] + (b[1] - a[1]) * k)},${Math.round(a[2] + (b[2] - a[2]) * k)})`;
const rgba = (c: RGB, a: number) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;

function makeCanvas(w: number, h: number) {
  const cv = document.createElement("canvas");
  cv.width = w;
  cv.height = h;
  return cv;
}

function layer(paint: (c: CanvasRenderingContext2D) => void) {
  const cv = makeCanvas(W * S, H * S);
  const c = cv.getContext("2d")!;
  c.scale(S, S);
  paint(c);
  return cv;
}

function blurred(src: HTMLCanvasElement, px: number) {
  const cv = makeCanvas(src.width, src.height);
  const c = cv.getContext("2d")!;
  c.filter = `blur(${px}px)`;
  c.drawImage(src, 0, 0);
  c.filter = "none";
  return cv;
}

/** Soft radial glow sprite (64×64) in one colour. */
const glowCache = new Map<string, HTMLCanvasElement>();
function glow(color: string) {
  let cv = glowCache.get(color);
  if (cv) return cv;
  cv = makeCanvas(64, 64);
  const c = cv.getContext("2d")!;
  const g = c.createRadialGradient(32, 32, 0, 32, 32, 32);
  const rgb = rgbOf(color);
  g.addColorStop(0, rgba(rgb, 1));
  g.addColorStop(0.25, rgba(rgb, 0.45));
  g.addColorStop(1, rgba(rgb, 0));
  c.fillStyle = g;
  c.fillRect(0, 0, 64, 64);
  glowCache.set(color, cv);
  return cv;
}

// ── far layer (blurred: sky, moon, far shore, water) ────────────────────────

function paintFar(c: CanvasRenderingContext2D) {
  const sky = c.createLinearGradient(0, 0, 0, LAYOUT.horizonY);
  sky.addColorStop(0, "#030a12");
  sky.addColorStop(0.55, "#06202b");
  sky.addColorStop(1, "#0f3d47");
  c.fillStyle = sky;
  c.fillRect(0, 0, W, LAYOUT.horizonY + 2);

  // Stars.
  const r = rng(88);
  for (let i = 0; i < 70; i++) {
    const x = r() * W, y = r() * 110, a = 0.2 + r() * 0.6;
    c.fillStyle = `rgba(200,240,255,${a})`;
    c.fillRect(x, y, 0.8, 0.8);
  }

  // Moon with a big atmospheric halo.
  const mx = 540, my = 54;
  const halo = c.createRadialGradient(mx, my, 6, mx, my, 120);
  halo.addColorStop(0, "rgba(170,240,255,0.35)");
  halo.addColorStop(0.3, "rgba(90,200,220,0.12)");
  halo.addColorStop(1, "rgba(40,120,140,0)");
  c.fillStyle = halo;
  c.fillRect(0, 0, W, LAYOUT.horizonY);
  const moon = c.createRadialGradient(mx - 3, my - 3, 1, mx, my, 13);
  moon.addColorStop(0, "#f2fdff");
  moon.addColorStop(1, "#a6dde6");
  c.fillStyle = moon;
  c.beginPath();
  c.arc(mx, my, 12, 0, Math.PI * 2);
  c.fill();

  // Clouds: soft long bands.
  for (let i = 0; i < 5; i++) {
    const y = 30 + i * 18, x = (i * 173) % W;
    const g = c.createRadialGradient(x, y, 0, x, y, 120);
    g.addColorStop(0, "rgba(60,130,145,0.14)");
    g.addColorStop(1, "rgba(60,130,145,0)");
    c.save();
    c.translate(x, y);
    c.scale(1, 0.18);
    c.translate(-x, -y);
    c.fillStyle = g;
    c.fillRect(x - 120, y - 120, 240, 240);
    c.restore();
  }

  // Distant hills and horizon haze.
  c.fillStyle = "#0a2a33";
  c.beginPath();
  c.moveTo(0, LAYOUT.horizonY);
  for (let x = 0; x <= W; x += 16) c.lineTo(x, LAYOUT.horizonY - 10 - Math.sin(x * 0.013) * 6 - Math.sin(x * 0.041 + 1) * 3);
  c.lineTo(W, LAYOUT.horizonY);
  c.fill();

  // Far palms (silhouettes with a moonlit edge).
  for (const x of LAYOUT.farPalms) {
    const h = 30 + (x % 3) * 4, top = LAYOUT.horizonY - h;
    c.strokeStyle = "#071c24";
    c.lineWidth = 2;
    c.beginPath();
    c.moveTo(x, LAYOUT.horizonY);
    c.quadraticCurveTo(x + 2, LAYOUT.horizonY - h / 2, x + 4, top);
    c.stroke();
    c.fillStyle = "#071c24";
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2;
      c.beginPath();
      c.moveTo(x + 4, top);
      c.quadraticCurveTo(x + 4 + Math.cos(a) * 8, top - 6, x + 4 + Math.cos(a) * 14, top + Math.sin(a) * 4 + 5);
      c.quadraticCurveTo(x + 4 + Math.cos(a) * 7, top - 1, x + 4, top);
      c.fill();
    }
  }
  const haze = c.createLinearGradient(0, LAYOUT.horizonY - 30, 0, LAYOUT.horizonY);
  haze.addColorStop(0, "rgba(40,130,140,0)");
  haze.addColorStop(1, "rgba(60,160,170,0.28)");
  c.fillStyle = haze;
  c.fillRect(0, LAYOUT.horizonY - 30, W, 30);

  // Backwater with the moon's reflection column.
  const wat = c.createLinearGradient(0, LAYOUT.waterTop, 0, LAYOUT.waterBottom);
  wat.addColorStop(0, "#124651");
  wat.addColorStop(1, "#051820");
  c.fillStyle = wat;
  c.fillRect(0, LAYOUT.waterTop, W, LAYOUT.waterBottom - LAYOUT.waterTop);
  const col = c.createLinearGradient(mx - 30, 0, mx + 30, 0);
  col.addColorStop(0, "rgba(160,235,250,0)");
  col.addColorStop(0.5, "rgba(160,235,250,0.3)");
  col.addColorStop(1, "rgba(160,235,250,0)");
  c.fillStyle = col;
  c.fillRect(mx - 30, LAYOUT.waterTop, 60, LAYOUT.waterBottom - LAYOUT.waterTop);
}

// ── mid layer (sharp: ground, shop, palms, sign, lamp stands) ───────────────

function palm(c: CanvasRenderingContext2D, x: number, baseY: number, h: number, lean: number) {
  const topX = x + lean * h, topY = baseY - h;
  // Trunk: tapered segments, shaded with a cyan rim on the moon side.
  const N = 14;
  for (let i = 0; i < N; i++) {
    const k0 = i / N, k1 = (i + 1) / N;
    const p = (k: number) => ({ x: x + lean * h * (0.2 * 2 * k * (1 - k) + k * k) , y: baseY - h * k });
    const a = p(k0), b = p(k1);
    const w = 6 - k0 * 3;
    c.strokeStyle = i % 2 ? "#1d2a2a" : "#233232";
    c.lineWidth = w;
    c.lineCap = "round";
    c.beginPath();
    c.moveTo(a.x, a.y);
    c.lineTo(b.x, b.y);
    c.stroke();
    c.strokeStyle = RIM + "0.45)";
    c.lineWidth = 0.8;
    c.beginPath();
    c.moveTo(a.x + w * 0.45, a.y);
    c.lineTo(b.x + w * 0.45, b.y);
    c.stroke();
  }
  // Fronds: filled leaves, dark with a moonlit top edge.
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2 + 0.2;
    const len = h * (0.34 + hash(i + x) * 0.08);
    const ex = topX + Math.cos(a) * len;
    const ey = topY + Math.sin(a) * len * 0.35 + len * 0.32;
    const mx = (topX + ex) / 2, my = Math.min(topY, ey) - len * 0.18;
    const g = c.createLinearGradient(topX, topY - 10, ex, ey);
    g.addColorStop(0, "#1b4a40");
    g.addColorStop(1, "#0a2420");
    c.fillStyle = g;
    c.beginPath();
    c.moveTo(topX, topY);
    c.quadraticCurveTo(mx, my - 4, ex, ey);
    c.quadraticCurveTo(mx, my + 5, topX, topY + 2);
    c.fill();
    c.strokeStyle = RIM + "0.35)";
    c.lineWidth = 0.6;
    c.beginPath();
    c.moveTo(topX, topY);
    c.quadraticCurveTo(mx, my - 4, ex, ey);
    c.stroke();
  }
  // Coconuts.
  for (let i = 0; i < 3; i++) {
    const g = c.createRadialGradient(topX - 2 + i * 3, topY + 3, 0.5, topX - 1 + i * 3, topY + 4, 3);
    g.addColorStop(0, "#4b5a35");
    g.addColorStop(1, "#16200f");
    c.fillStyle = g;
    c.beginPath();
    c.arc(topX - 2 + i * 3, topY + 4 + (i % 2), 2.6, 0, Math.PI * 2);
    c.fill();
  }
}

function paintMid(c: CanvasRenderingContext2D) {
  const gy = LAYOUT.groundY;
  // Wet ground: dark, glossy, with a lighter sheen near the bank.
  const gr = c.createLinearGradient(0, gy, 0, H);
  gr.addColorStop(0, "#0d2c33");
  gr.addColorStop(0.35, "#081d23");
  gr.addColorStop(1, "#040e12");
  c.fillStyle = gr;
  c.fillRect(0, gy, W, H - gy);
  // Bank edge highlight.
  c.fillStyle = "rgba(120,220,230,0.22)";
  c.fillRect(0, gy, W, 1);
  // Stone path band where Kuttan walks.
  const path = c.createLinearGradient(0, 300, 0, 350);
  path.addColorStop(0, "rgba(40,80,88,0)");
  path.addColorStop(0.5, "rgba(40,80,88,0.25)");
  path.addColorStop(1, "rgba(40,80,88,0)");
  c.fillStyle = path;
  c.fillRect(0, 300, W, 50);
  // Puddles reflecting the sky.
  const r = rng(31);
  for (let i = 0; i < 14; i++) {
    const x = r() * W, y = 210 + r() * 140, rx = 14 + r() * 40;
    c.save();
    c.translate(x, y);
    c.scale(1, 0.16);
    const g = c.createRadialGradient(0, 0, 0, 0, 0, rx);
    g.addColorStop(0, "rgba(90,180,195,0.16)");
    g.addColorStop(1, "rgba(90,180,195,0)");
    c.fillStyle = g;
    c.beginPath();
    c.arc(0, 0, rx, 0, Math.PI * 2);
    c.fill();
    c.restore();
  }

  // Tea shop.
  const sh = LAYOUT.shop, base = sh.y + sh.h;
  // Contact shadow.
  c.fillStyle = "rgba(0,0,0,0.45)";
  c.beginPath();
  c.ellipse(sh.x + sh.w / 2, base + 2, sh.w * 0.6, 6, 0, 0, Math.PI * 2);
  c.fill();
  const wall = c.createLinearGradient(sh.x, 0, sh.x + sh.w, 0);
  wall.addColorStop(0, "#2a4744");
  wall.addColorStop(1, "#13292b");
  c.fillStyle = wall;
  c.fillRect(sh.x, sh.y, sh.w, sh.h);
  // Wall ambient occlusion under the eaves.
  const ao = c.createLinearGradient(0, sh.y, 0, sh.y + 16);
  ao.addColorStop(0, "rgba(0,0,0,0.6)");
  ao.addColorStop(1, "rgba(0,0,0,0)");
  c.fillStyle = ao;
  c.fillRect(sh.x, sh.y, sh.w, 16);
  // Moonlit right edge.
  c.fillStyle = RIM + "0.4)";
  c.fillRect(sh.x + sh.w - 1, sh.y, 1, sh.h);

  // Serving window with warm interior.
  const wx = sh.x + 8, wy = sh.y + 24, ww = 62, wh = 26;
  const inner = c.createLinearGradient(0, wy, 0, wy + wh);
  inner.addColorStop(0, "#ffb860");
  inner.addColorStop(1, "#b9541c");
  c.fillStyle = inner;
  c.fillRect(wx, wy, ww, wh);
  // Kettle and jars in silhouette.
  c.fillStyle = "rgba(60,24,10,0.75)";
  c.beginPath();
  c.ellipse(wx + 48, wy + 17, 7, 6, 0, 0, Math.PI * 2);
  c.fill();
  c.fillRect(wx + 42, wy + 8, 12, 3);
  for (let i = 0; i < 4; i++) c.fillRect(wx + 6 + i * 7, wy + 6, 5, 9);
  // Counter.
  const counter = c.createLinearGradient(0, wy + wh, 0, wy + wh + 5);
  counter.addColorStop(0, "#8a5a33");
  counter.addColorStop(1, "#3b2414");
  c.fillStyle = counter;
  c.fillRect(wx - 3, wy + wh - 1, ww + 6, 5);
  // Glasses on the counter.
  for (let i = 0; i < 3; i++) {
    const gx = wx + 10 + i * 12;
    c.fillStyle = "rgba(255,230,190,0.55)";
    c.fillRect(gx - 2, wy + wh - 8, 4, 7);
    c.fillStyle = "#c87a3a";
    c.fillRect(gx - 2, wy + wh - 5, 4, 4);
  }
  // Door: lit doorway.
  const dx = sh.doorX;
  const door = c.createLinearGradient(0, sh.y + 22, 0, base);
  door.addColorStop(0, "#ffcf86");
  door.addColorStop(1, "#c4621f");
  c.fillStyle = door;
  c.fillRect(dx - 12, sh.y + 22, 24, base - sh.y - 22);
  c.fillStyle = "#1a1210";
  c.fillRect(dx - 13, sh.y + 21, 26, 1.5);
  c.fillRect(dx - 13, sh.y + 21, 1.5, base - sh.y - 21);
  c.fillRect(dx + 11.5, sh.y + 21, 1.5, base - sh.y - 21);
  // Small side window.
  c.fillStyle = "#e48f3e";
  c.fillRect(sh.x + sh.w - 46, sh.y + 26, 26, 16);
  c.strokeStyle = "#1a1210";
  c.lineWidth = 1.2;
  c.strokeRect(sh.x + sh.w - 46, sh.y + 26, 26, 16);
  c.beginPath();
  c.moveTo(sh.x + sh.w - 33, sh.y + 26);
  c.lineTo(sh.x + sh.w - 33, sh.y + 42);
  c.stroke();

  // Roof: tiled slope, warm-dark with a moonlit ridge.
  const rl = sh.x - 14, rr = sh.x + sh.w + 14, ry = sh.y + 4, top = sh.y - sh.roofH;
  const roof = c.createLinearGradient(0, top, 0, ry);
  roof.addColorStop(0, "#5a2b20");
  roof.addColorStop(1, "#2a120d");
  c.fillStyle = roof;
  c.beginPath();
  c.moveTo(rl, ry);
  c.lineTo(sh.x + sh.w / 2, top);
  c.lineTo(rr, ry);
  c.closePath();
  c.fill();
  c.save();
  c.clip();
  for (let i = 1; i < 8; i++) {
    const y = top + i * 5.4;
    c.fillStyle = "rgba(0,0,0,0.35)";
    c.fillRect(rl, y, rr - rl, 1);
    c.fillStyle = "rgba(255,170,120,0.08)";
    c.fillRect(rl, y + 1, rr - rl, 1);
  }
  // Right slope catches moonlight.
  const ms = c.createLinearGradient(sh.x + sh.w / 2, 0, rr, 0);
  ms.addColorStop(0, "rgba(120,220,235,0)");
  ms.addColorStop(1, "rgba(120,220,235,0.18)");
  c.fillStyle = ms;
  c.fillRect(sh.x + sh.w / 2, top, rr - sh.x - sh.w / 2, ry - top);
  c.restore();
  c.strokeStyle = RIM + "0.7)";
  c.lineWidth = 1;
  c.beginPath();
  c.moveTo(sh.x + sh.w / 2, top);
  c.lineTo(rr, ry);
  c.stroke();
  c.fillStyle = "rgba(0,0,0,0.55)";
  c.fillRect(rl, ry, rr - rl, 2);

  // Emissive board.
  c.fillStyle = "#1a0f0a";
  c.fillRect(sh.x + 12, sh.y + 7, 60, 13);
  c.save();
  c.shadowColor = "#ffb35c";
  c.shadowBlur = 8;
  c.font = "700 7.5px ui-sans-serif, system-ui, sans-serif";
  c.textAlign = "center";
  c.fillStyle = "#ffd9a0";
  c.fillText("CHAYA KADA", sh.x + 42, sh.y + 16.5);
  c.restore();

  // Warm light spill and its reflection on the wet ground.
  c.save();
  c.globalCompositeOperation = "lighter";
  const spill = c.createRadialGradient(dx, base + 4, 2, dx, base + 4, 60);
  spill.addColorStop(0, "rgba(255,160,70,0.35)");
  spill.addColorStop(1, "rgba(255,160,70,0)");
  c.fillStyle = spill;
  c.save();
  c.translate(dx, base + 4);
  c.scale(1, 0.35);
  c.translate(-dx, -(base + 4));
  c.fillRect(dx - 60, base - 56, 120, 120);
  c.restore();
  c.globalAlpha = 0.5;
  for (const [x0, w0] of [[dx - 10, 20], [wx + 4, ww - 8], [sh.x + sh.w - 44, 22]] as const) {
    c.drawImage(glow("#ff9a3a"), x0 - 4, base - 20, w0 + 8, 80);
  }
  c.globalAlpha = 1;
  c.restore();

  // Palms.
  for (const p of LAYOUT.palms) {
    c.fillStyle = "rgba(0,0,0,0.4)";
    c.beginPath();
    c.ellipse(p.x, p.baseY + 1, 10, 2.5, 0, 0, Math.PI * 2);
    c.fill();
    palm(c, p.x, p.baseY, p.h, p.lean);
  }

  // Sign post with an emissive cyan board.
  const sg = LAYOUT.sign;
  c.fillStyle = "rgba(0,0,0,0.4)";
  c.beginPath();
  c.ellipse(sg.x, sg.y + 40, 8, 2, 0, 0, Math.PI * 2);
  c.fill();
  const post = c.createLinearGradient(sg.x - 2, 0, sg.x + 2, 0);
  post.addColorStop(0, "#3b4a4a");
  post.addColorStop(1, "#141d1f");
  c.fillStyle = post;
  c.fillRect(sg.x - 1.8, sg.y, 3.6, 40);
  c.fillStyle = "#0b1a1f";
  c.beginPath();
  c.roundRect(sg.x - 32, sg.y - 14, 64, 17, 3);
  c.fill();
  c.strokeStyle = "rgba(94,234,212,0.8)";
  c.lineWidth = 0.8;
  c.stroke();
  c.save();
  c.shadowColor = "#5eead4";
  c.shadowBlur = 10;
  c.font = "800 8.5px ui-sans-serif, system-ui, sans-serif";
  c.textAlign = "center";
  c.fillStyle = "#c9fff6";
  c.fillText(sg.text, sg.x, sg.y - 2.5);
  c.restore();
  c.save();
  c.globalCompositeOperation = "lighter";
  c.globalAlpha = 0.35;
  c.drawImage(glow("#5eead4"), sg.x - 26, sg.y + 26, 52, 50);
  c.globalAlpha = 1;
  c.restore();

  // Brass lamp stands (nilavilakku), unlit; flames are per frame.
  const L = LAYOUT.lamps;
  for (let i = 0; i < L.count; i++) {
    const x = L.x0 + i * L.dx, y = L.y;
    c.fillStyle = "rgba(0,0,0,0.45)";
    c.beginPath();
    c.ellipse(x, y + 23, 8, 2, 0, 0, Math.PI * 2);
    c.fill();
    const brass = c.createLinearGradient(x - 6, 0, x + 6, 0);
    brass.addColorStop(0, "#c08a35");
    brass.addColorStop(0.45, "#6b4a1c");
    brass.addColorStop(1, "#2a1c0a");
    c.fillStyle = brass;
    c.beginPath();
    c.ellipse(x, y + 21, 6.5, 2.2, 0, 0, Math.PI * 2);
    c.fill();
    c.fillRect(x - 1.2, y + 2, 2.4, 19);
    c.beginPath();
    c.ellipse(x, y + 10, 2.6, 1.2, 0, 0, Math.PI * 2);
    c.fill();
    c.beginPath();
    c.moveTo(x - 6, y);
    c.quadraticCurveTo(x, y + 6, x + 6, y);
    c.closePath();
    c.fill();
    c.strokeStyle = RIM + "0.5)";
    c.lineWidth = 0.6;
    c.beginPath();
    c.moveTo(x + 1.2, y + 3);
    c.lineTo(x + 1.2, y + 20);
    c.stroke();
  }
}

// ── light: volumetric shafts, fog, vignette, foreground bokeh ───────────────

function paintShafts(c: CanvasRenderingContext2D) {
  c.globalCompositeOperation = "lighter";
  // Moonbeams slanting down from the upper right.
  const beams = [
    { x: 520, w: 50, dx: -190, a: 0.07 },
    { x: 600, w: 34, dx: -170, a: 0.05 },
    { x: 430, w: 26, dx: -200, a: 0.045 },
  ];
  for (const b of beams) {
    const g = c.createLinearGradient(b.x, 0, b.x + b.dx, H);
    g.addColorStop(0, `rgba(140,230,245,${b.a})`);
    g.addColorStop(0.7, `rgba(140,230,245,${b.a * 0.6})`);
    g.addColorStop(1, "rgba(140,230,245,0)");
    c.fillStyle = g;
    c.beginPath();
    c.moveTo(b.x, 0);
    c.lineTo(b.x + b.w, 0);
    c.lineTo(b.x + b.w * 2.2 + b.dx, H);
    c.lineTo(b.x + b.dx, H);
    c.closePath();
    c.fill();
  }
  // Warm cone falling out of the shop door.
  const sh = LAYOUT.shop, base = sh.y + sh.h;
  const g = c.createLinearGradient(sh.doorX, sh.y + 22, sh.doorX + 30, base + 40);
  g.addColorStop(0, "rgba(255,170,80,0.16)");
  g.addColorStop(1, "rgba(255,170,80,0)");
  c.fillStyle = g;
  c.beginPath();
  c.moveTo(sh.doorX - 12, sh.y + 22);
  c.lineTo(sh.doorX + 12, sh.y + 22);
  c.lineTo(sh.doorX + 60, base + 44);
  c.lineTo(sh.doorX - 30, base + 44);
  c.closePath();
  c.fill();
  // Low ground fog.
  const fog = c.createLinearGradient(0, LAYOUT.groundY - 8, 0, LAYOUT.groundY + 50);
  fog.addColorStop(0, "rgba(80,170,180,0)");
  fog.addColorStop(0.3, "rgba(80,170,180,0.09)");
  fog.addColorStop(1, "rgba(80,170,180,0)");
  c.fillStyle = fog;
  c.fillRect(0, LAYOUT.groundY - 8, W, 60);
}

function paintGrade(c: CanvasRenderingContext2D) {
  const v = c.createRadialGradient(W / 2, H * 0.55, H * 0.35, W / 2, H * 0.55, W * 0.62);
  v.addColorStop(0, "rgba(0,0,0,0)");
  v.addColorStop(1, "rgba(0,6,10,0.62)");
  c.fillStyle = v;
  c.fillRect(0, 0, W, H);
  // Foreground out-of-focus leaves in the top-left corner.
  c.fillStyle = "rgba(2,10,10,0.85)";
  for (let i = 0; i < 5; i++) {
    c.save();
    c.translate(-10 + i * 16, -6 + i * 7);
    c.rotate(0.5 + i * 0.22);
    c.beginPath();
    c.ellipse(0, 0, 34, 7, 0, 0, Math.PI * 2);
    c.fill();
    c.restore();
  }
  // Warm bokeh discs at the bottom right.
  const r = rng(5);
  for (let i = 0; i < 6; i++) {
    const x = 590 + r() * 60, y = 330 + r() * 40, rad = 6 + r() * 8;
    c.fillStyle = `rgba(255,180,90,${0.06 + r() * 0.08})`;
    c.beginPath();
    c.arc(x, y, rad, 0, Math.PI * 2);
    c.fill();
  }
}

interface Layers { far: HTMLCanvasElement; mid: HTMLCanvasElement; shafts: HTMLCanvasElement; grade: HTMLCanvasElement }
let layers: Layers | null = null;
function getLayers(): Layers {
  if (!layers) {
    const gradeSharp = layer(paintGrade);
    // Only the corner elements need defocus; the vignette is smooth anyway.
    layers = {
      far: blurred(layer(paintFar), 3),
      mid: layer(paintMid),
      shafts: blurred(layer(paintShafts), 4),
      grade: blurred(gradeSharp, 10),
    };
  }
  return layers;
}

// ── villagers: smooth-shaded capsules with a cyan rim light ─────────────────

interface Pal { skinD: string; skin: string; skinH: string; shirtD: string; shirt: string; shirtH: string; munduD: string; mundu: string }
const palCache = new Map<string, Pal>();
function palOf(v: VillagerFrame): Pal {
  let p = palCache.get(v.id);
  if (p) return p;
  const sk = rgbOf(v.skin), sh = rgbOf(v.shirt), mu = rgbOf(v.mundu);
  p = {
    skinD: mix(sk, AMB, 0.5), skin: mix(sk, AMB, 0.15), skinH: mix(sk, WARM, 0.3),
    shirtD: mix(sh, AMB, 0.6), shirt: mix(sh, AMB, 0.25), shirtH: mix(sh, WARM, 0.15),
    munduD: mix(mu, AMB, 0.6), mundu: mix(mu, AMB, 0.3),
  };
  palCache.set(v.id, p);
  return p;
}

type Pt = { x: number; y: number };

function capsule(ctx: CanvasRenderingContext2D, pts: Pt[], w: number, dark: string, mid: string, rimA: number) {
  const path = new Path2D();
  pts.forEach((p, i) => (i ? path.lineTo(p.x, p.y) : path.moveTo(p.x, p.y)));
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = dark;
  ctx.lineWidth = w;
  ctx.stroke(path);
  ctx.save();
  ctx.translate(-w * 0.16, -w * 0.08);
  ctx.strokeStyle = mid;
  ctx.lineWidth = w * 0.55;
  ctx.stroke(path);
  ctx.restore();
  ctx.save();
  ctx.translate(w * 0.42, -0.2);
  ctx.strokeStyle = RIM + rimA + ")";
  ctx.lineWidth = 0.7;
  ctx.stroke(path);
  ctx.restore();
}

const lerp = (a: Pt, b: Pt, k: number) => ({ x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k });

function villager(ctx: CanvasRenderingContext2D, v: VillagerFrame, f: SceneFrame, rimTint: string) {
  const s = skeleton(v);
  const p = palOf(v);
  const fc = v.facing;
  let { elbowF, handF, elbowB, handB } = s;
  // Raghu throws his arms up on each hop.
  if (v.status === "finished" && v.jump > 0.05) {
    const k = Math.min(1, v.jump * 1.6);
    elbowF = { x: s.shoulder.x + 5 * k + 1, y: s.shoulder.y - 8 * k + 3 };
    handF = { x: s.shoulder.x + 8 * k, y: s.shoulder.y - 17 * k + 6 };
    elbowB = { x: s.shoulder.x - 5 * k - 1, y: s.shoulder.y - 8 * k + 3 };
    handB = { x: s.shoulder.x - 8 * k, y: s.shoulder.y - 17 * k + 6 };
  }

  // Back arm and back leg (in shade).
  capsule(ctx, [s.shoulder, elbowB], 3.6, p.shirtD, p.shirtD, 0.2);
  capsule(ctx, [elbowB, handB], 2.8, p.skinD, p.skinD, 0.2);
  capsule(ctx, [s.hip, s.kneeB, s.footB], 3.8, p.skinD, p.skinD, 0.25);
  capsule(ctx, [s.hip, s.kneeF, s.footF], 4, p.skinD, p.skin, 0.55);
  // Feet.
  for (const ft of [s.footB, s.footF]) {
    ctx.fillStyle = "#1a1210";
    ctx.beginPath();
    ctx.ellipse(ft.x + fc * 1.6, ft.y - 0.6, 3, 1.3, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // Mundu: wrapped cloth from waist to mid-shin, swinging with the legs.
  const mF = lerp(s.kneeF, s.footF, 0.45), mB = lerp(s.kneeB, s.footB, 0.45);
  const lo = mF.x < mB.x ? mF : mB, hi = mF.x < mB.x ? mB : mF;
  const mg = ctx.createLinearGradient(s.hip.x - 7, 0, s.hip.x + 7, 0);
  mg.addColorStop(0, p.mundu);
  mg.addColorStop(1, p.munduD);
  ctx.fillStyle = mg;
  ctx.beginPath();
  ctx.moveTo(s.hip.x - 5.5, s.hip.y - 3);
  ctx.lineTo(s.hip.x + 5.5, s.hip.y - 3);
  ctx.quadraticCurveTo(hi.x + 4, (s.hip.y + hi.y) / 2, hi.x + 3.2, hi.y);
  ctx.lineTo(lo.x - 3.2, lo.y);
  ctx.quadraticCurveTo(lo.x - 4, (s.hip.y + lo.y) / 2, s.hip.x - 5.5, s.hip.y - 3);
  ctx.fill();
  ctx.strokeStyle = RIM + "0.5)";
  ctx.lineWidth = 0.7;
  ctx.beginPath();
  ctx.moveTo(s.hip.x + 5.5, s.hip.y - 3);
  ctx.quadraticCurveTo(hi.x + 4, (s.hip.y + hi.y) / 2, hi.x + 3.2, hi.y);
  ctx.stroke();
  // Kasavu border at the hem.
  ctx.strokeStyle = "rgba(230,180,80,0.85)";
  ctx.lineWidth = 0.9;
  ctx.beginPath();
  ctx.moveTo(lo.x - 3.2, lo.y - 1);
  ctx.lineTo(hi.x + 3.2, hi.y - 1);
  ctx.stroke();

  // Torso: rounded, lit from the warm left, cyan rim on the right.
  const n = s.neck, h = s.hip;
  const tg = ctx.createLinearGradient(n.x - 7, 0, n.x + 7, 0);
  tg.addColorStop(0, p.shirtH);
  tg.addColorStop(0.55, p.shirt);
  tg.addColorStop(1, p.shirtD);
  ctx.fillStyle = tg;
  ctx.strokeStyle = tg;
  ctx.lineWidth = 2.4;
  ctx.lineJoin = "round";
  ctx.beginPath();
  ctx.moveTo(n.x - 5.5, n.y + 1.5);
  ctx.lineTo(n.x + 5.5, n.y + 1.5);
  ctx.lineTo(h.x + 5, h.y - 2);
  ctx.lineTo(h.x - 5, h.y - 2);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.strokeStyle = rimTint;
  ctx.lineWidth = 0.9;
  ctx.beginPath();
  ctx.moveTo(n.x + 6.6, n.y + 1.5);
  ctx.lineTo(h.x + 6.1, h.y - 2);
  ctx.stroke();
  // Neck.
  capsule(ctx, [n, { x: n.x + fc * 0.3, y: n.y - 3 }], 3.2, p.skinD, p.skin, 0.3);

  // Head: shaded sphere, hair cap, rim.
  const hd = s.head, R = 6.2;
  const hg = ctx.createRadialGradient(hd.x - 2, hd.y - 2, 0.5, hd.x, hd.y, R + 1);
  hg.addColorStop(0, p.skinH);
  hg.addColorStop(0.6, p.skin);
  hg.addColorStop(1, p.skinD);
  ctx.fillStyle = hg;
  ctx.beginPath();
  ctx.arc(hd.x, hd.y, R, 0, Math.PI * 2);
  ctx.fill();
  // Hair (back-weighted), with a bun for Ammini.
  ctx.fillStyle = "#0d0907";
  ctx.beginPath();
  ctx.arc(hd.x - fc * 0.8, hd.y - 0.8, R + 0.4, Math.PI * (fc > 0 ? 0.95 : 1.2), Math.PI * (fc > 0 ? 1.8 : 2.05));
  ctx.lineTo(hd.x - fc * 0.8, hd.y);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(hd.x - fc * 2.5, hd.y - 1, R * 0.8, Math.PI * 0.5 + (fc > 0 ? Math.PI * 0.5 : -Math.PI * 0.5), Math.PI * 1.5 + (fc > 0 ? Math.PI * 0.5 : -Math.PI * 0.5));
  ctx.fill();
  if (v.id === "b") {
    ctx.beginPath();
    ctx.arc(hd.x - fc * 6.5, hd.y + 1, 3, 0, Math.PI * 2);
    ctx.fill();
  }
  // Eye and a hint of brow on the facing side.
  ctx.fillStyle = "#120a06";
  ctx.beginPath();
  ctx.arc(hd.x + fc * 3.4, hd.y - 0.2, 0.75, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = rimTint;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(hd.x, hd.y, R - 0.3, -Math.PI * 0.45, Math.PI * 0.25);
  ctx.stroke();

  // Front arm (lit).
  capsule(ctx, [s.shoulder, elbowF], 3.8, p.shirtD, p.shirtH, 0.6);
  capsule(ctx, [elbowF, handF], 2.9, p.skinD, p.skin, 0.55);
  ctx.fillStyle = p.skin;
  ctx.beginPath();
  ctx.arc(handF.x, handF.y, 1.6, 0, Math.PI * 2);
  ctx.fill();

  // Props.
  if (v.carry === "laptop") {
    const hx = handF.x, hy = handF.y;
    // Base.
    ctx.strokeStyle = "#3a464c";
    ctx.lineWidth = 1.8;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(hx - fc * 6, hy);
    ctx.lineTo(hx + fc * 7, hy);
    ctx.stroke();
    // Lid, open towards Kuttan; its screen glows cyan on him.
    ctx.strokeStyle = "#20292d";
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.moveTo(hx + fc * 7, hy);
    ctx.lineTo(hx + fc * 10, hy - 11);
    ctx.stroke();
    ctx.strokeStyle = "rgba(160,255,240,0.95)";
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(hx + fc * 6, hy - 1);
    ctx.lineTo(hx + fc * 8.8, hy - 10.5);
    ctx.stroke();
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.globalAlpha = 0.55 + 0.1 * Math.sin(f.t * 9);
    ctx.drawImage(glow(STATUS_COLOR.working), hx - 14, hy - 22, 28, 28);
    ctx.restore();
  } else if (v.carry === "glass") {
    const gx = handF.x, gy = handF.y;
    ctx.fillStyle = "rgba(220,240,240,0.35)";
    ctx.beginPath();
    ctx.moveTo(gx - 2.4, gy - 7);
    ctx.lineTo(gx + 2.4, gy - 7);
    ctx.lineTo(gx + 1.9, gy + 1);
    ctx.lineTo(gx - 1.9, gy + 1);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#c27b3a";
    ctx.fillRect(gx - 2.1, gy - 4.5, 4.2, 5.2);
    ctx.fillStyle = "rgba(255,255,255,0.7)";
    ctx.fillRect(gx - 1.9, gy - 6.5, 0.7, 6.5);
    // Steam.
    ctx.strokeStyle = "rgba(220,240,240,0.28)";
    ctx.lineWidth = 0.9;
    for (let k = 0; k < 2; k++) {
      ctx.beginPath();
      ctx.moveTo(gx - 1 + k * 2, gy - 8);
      for (let j = 1; j <= 5; j++) ctx.lineTo(gx - 1 + k * 2 + Math.sin(f.t * 3 + j * 1.3 + k * 2) * 1.6, gy - 8 - j * 2.6);
      ctx.stroke();
    }
  }
}

// ── floor rings, holo panels, labels ───────────────────────────────────────

function rings(ctx: CanvasRenderingContext2D, v: VillagerFrame, f: SceneFrame) {
  const col = STATUS_COLOR[v.status];
  const urgent = v.status === "waiting";
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  // Core glow pool.
  ctx.globalAlpha = urgent ? 0.5 + 0.5 * f.pulse : 0.6;
  ctx.drawImage(glow(col), v.x - 26, v.y - 8, 52, 16);
  ctx.strokeStyle = col;
  const speed = urgent ? 1.2 : 0.55;
  for (let k = 0; k < 3; k++) {
    const ph = (f.t * speed + k / 3) % 1;
    const r = 7 + ph * (urgent ? 30 : 24);
    ctx.globalAlpha = (1 - ph) * (urgent ? 0.95 : 0.7);
    ctx.lineWidth = 1.3 - ph * 0.6;
    ctx.beginPath();
    ctx.ellipse(v.x, v.y, r, r * 0.26, 0, 0, Math.PI * 2);
    ctx.stroke();
  }
  // Fixed inner ring.
  ctx.globalAlpha = 0.9;
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  ctx.ellipse(v.x, v.y, 9, 2.4, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

function holoPanel(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, skew: number, f: SceneFrame, kind: "code" | "task") {
  const C = "94,234,212";
  ctx.save();
  ctx.translate(x, y);
  ctx.transform(1, skew, 0, 1, 0, 0);
  ctx.globalAlpha = 0.88 + 0.12 * Math.sin(f.t * 21 + x);
  ctx.globalCompositeOperation = "lighter";
  const bg = ctx.createLinearGradient(0, 0, 0, h);
  bg.addColorStop(0, `rgba(${C},0.16)`);
  bg.addColorStop(1, `rgba(${C},0.04)`);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = `rgba(${C},0.65)`;
  ctx.lineWidth = 0.5;
  ctx.strokeRect(0, 0, w, h);
  // Corner brackets.
  ctx.strokeStyle = `rgba(200,255,245,0.9)`;
  ctx.lineWidth = 0.8;
  for (const [cx, cy, sx, sy] of [[0, 0, 1, 1], [w, 0, -1, 1], [0, h, 1, -1], [w, h, -1, -1]] as const) {
    ctx.beginPath();
    ctx.moveTo(cx + sx * 4, cy);
    ctx.lineTo(cx, cy);
    ctx.lineTo(cx, cy + sy * 4);
    ctx.stroke();
  }
  ctx.font = "600 4.6px ui-monospace, Consolas, monospace";
  ctx.textAlign = "left";
  ctx.fillStyle = "rgba(210,255,248,0.95)";
  if (kind === "code") {
    ctx.fillText("auth.ts", 2.5, 5.5);
    ctx.save();
    ctx.beginPath();
    ctx.rect(1, 7.5, w - 2, h - 9);
    ctx.clip();
    const step = 3.2, scroll = f.t * 7;
    const first = Math.floor(scroll / step);
    for (let i = 0; i < 9; i++) {
      const li = first + i;
      const yy = 9 + i * step - (scroll % step);
      const ind = (hash(li * 3.1) * 3) | 0;
      const len = 6 + hash(li) * (w - 14);
      const hue = hash(li * 7.7);
      ctx.fillStyle = hue < 0.55 ? `rgba(${C},0.85)` : hue < 0.8 ? "rgba(255,255,255,0.7)" : "rgba(255,190,110,0.85)";
      ctx.fillRect(3 + ind * 3, yy, len, 1.3);
    }
    ctx.restore();
  } else {
    ctx.fillText("TASK", 2.5, 5.5);
    ctx.textAlign = "right";
    ctx.fillText(`${Math.round(f.progress * 100)}%`, w - 2.5, 5.5);
    ctx.fillStyle = `rgba(${C},0.25)`;
    ctx.fillRect(2.5, 9, w - 5, 3);
    ctx.fillStyle = `rgba(${C},0.95)`;
    ctx.fillRect(2.5, 9, (w - 5) * f.progress, 3);
    // Little test bars.
    for (let i = 0; i < 5; i++) {
      const hh = 2 + hash(i + Math.floor(f.t * 2)) * 6;
      ctx.fillStyle = i < f.progress * 6 ? "rgba(163,230,53,0.85)" : `rgba(${C},0.4)`;
      ctx.fillRect(3 + i * ((w - 6) / 5), h - 2 - hh, (w - 6) / 5 - 1.5, hh);
    }
  }
  // Scanline sweep.
  const sy = ((f.t * 0.7 + x * 0.01) % 1) * h;
  ctx.fillStyle = `rgba(${C},0.25)`;
  ctx.fillRect(0, sy, w, 0.8);
  ctx.restore();
}

function label(ctx: CanvasRenderingContext2D, v: VillagerFrame, f: SceneFrame) {
  const a = labelAnchor(v);
  const urgent = v.status === "waiting";
  const col = STATUS_COLOR[v.status];
  const crgb = rgbOf(col);
  ctx.font = "500 8.5px ui-sans-serif, system-ui, sans-serif";
  const text = urgent ? "! " + v.label : v.label;
  const tw = ctx.measureText(text).width;
  const name = v.name.toUpperCase();
  ctx.font = "800 7px ui-sans-serif, system-ui, sans-serif";
  const nw = ctx.measureText(name).width;
  const pw = nw + tw + 18, ph = 13, py = a.y - 6;
  // Keep clear of the shop's glowing board.
  const board = LAYOUT.shop.x + 76;
  let px = a.x - pw / 2;
  if (py < LAYOUT.shop.y + 22 && px < board && px + pw > LAYOUT.shop.x) px = board;

  ctx.save();
  if (urgent) {
    ctx.shadowColor = col;
    ctx.shadowBlur = 6 + 8 * f.pulse;
  }
  ctx.fillStyle = urgent ? `rgba(70,10,10,${0.72 + 0.2 * f.pulse})` : "rgba(4,18,24,0.78)";
  ctx.beginPath();
  ctx.roundRect(px, py, pw, ph, 6.5);
  ctx.fill();
  ctx.restore();
  ctx.strokeStyle = rgba(crgb, urgent ? 0.5 + 0.5 * f.pulse : 0.65);
  ctx.lineWidth = urgent ? 1 : 0.7;
  ctx.beginPath();
  ctx.roundRect(px, py, pw, ph, 6.5);
  ctx.stroke();
  // Top glass highlight.
  ctx.fillStyle = "rgba(255,255,255,0.07)";
  ctx.fillRect(px + 5, py + 1, pw - 10, 4);

  // Name in the status colour, a hairline divider, then the action.
  ctx.textAlign = "left";
  ctx.font = "800 7px ui-sans-serif, system-ui, sans-serif";
  ctx.fillStyle = rgba(crgb, 0.98);
  ctx.fillText(name, px + 6.5, py + 9);
  ctx.fillStyle = rgba(crgb, 0.4);
  ctx.fillRect(px + 9.5 + nw, py + 3, 0.7, ph - 6);
  ctx.font = "500 8.5px ui-sans-serif, system-ui, sans-serif";
  ctx.fillStyle = urgent ? `rgba(255,${200 + 55 * f.pulse},${190 + 65 * f.pulse},1)` : "rgba(235,250,250,0.96)";
  ctx.fillText(text, px + 12.5 + nw, py + 9.3);

  // Thin leader to the head.
  ctx.strokeStyle = rgba(crgb, urgent ? 0.3 + 0.6 * f.pulse : 0.5);
  ctx.lineWidth = 0.7;
  ctx.beginPath();
  ctx.moveTo(a.x, py + ph);
  ctx.lineTo(a.x, py + ph + 5);
  ctx.stroke();
}

function rimFor(s: Status, f: SceneFrame) {
  if (s === "waiting") return `rgba(255,110,100,${0.55 + 0.4 * f.pulse})`;
  if (s === "finished") return "rgba(190,255,140,0.75)";
  return RIM + "0.8)";
}

// ── the frame ───────────────────────────────────────────────────────────────

export const cgiMotion: StyleProto = {
  id: "cgi-motion",
  n: 8,
  name: "CGI Motion",
  blurb: "Cinematic CGI night: rim-lit smooth-shaded villagers on wet reflective ground, light shafts, pulsing status rings and holographic code panels, with a softly defocused background.",
  bg: "#04121a",
  draw(ctx, f) {
    const Lr = getLayers();
    const t = f.t;
    ctx.drawImage(Lr.far, 0, 0, W, H);

    // Water shimmer: moving glints, strongest under the moon.
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (let i = 0; i < 26; i++) {
      const y = LAYOUT.waterTop + 4 + hash(i) * 40;
      const x = ((hash(i + 50) * W + t * (6 + hash(i + 9) * 10)) % (W + 40)) - 20;
      const nearMoon = Math.max(0, 1 - Math.abs(x - 540) / 90);
      const a = (0.08 + nearMoon * 0.45) * (0.5 + 0.5 * Math.sin(t * 2 + i));
      ctx.fillStyle = `rgba(170,240,255,${a})`;
      ctx.fillRect(x, y, 6 + hash(i + 3) * 10, 0.7);
    }
    ctx.restore();

    // Canoe with a rower, its reflection and wake.
    const cx = f.canoeX, cy = 178, bob = Math.sin(t * 1.7) * 0.6;
    const hull = (c: CanvasRenderingContext2D) => {
      const g = c.createLinearGradient(0, cy - 3, 0, cy + 4);
      g.addColorStop(0, "#5a3a22");
      g.addColorStop(1, "#1b0f08");
      c.fillStyle = g;
      c.beginPath();
      c.moveTo(cx - 24, cy - 4);
      c.quadraticCurveTo(cx, cy + 7, cx + 24, cy - 4);
      c.lineTo(cx + 18, cy - 1);
      c.lineTo(cx - 18, cy - 1);
      c.closePath();
      c.fill();
      // Rower.
      c.fillStyle = "#0e1a1e";
      c.beginPath();
      c.ellipse(cx - 2, cy - 7, 3, 6, 0, 0, Math.PI * 2);
      c.fill();
      c.beginPath();
      c.arc(cx - 2, cy - 15, 2.6, 0, Math.PI * 2);
      c.fill();
      c.strokeStyle = "#2a1c10";
      c.lineWidth = 1;
      const sw = Math.sin(t * 2) * 4;
      c.beginPath();
      c.moveTo(cx + 2 + sw * 0.3, cy - 14);
      c.lineTo(cx + 10 + sw, cy + 6);
      c.stroke();
    };
    ctx.save();
    ctx.translate(0, bob);
    ctx.save();
    ctx.globalAlpha = 0.28;
    ctx.translate(0, 2 * cy + 4);
    ctx.scale(1, -1);
    hull(ctx);
    ctx.restore();
    hull(ctx);
    ctx.strokeStyle = RIM + "0.75)";
    ctx.lineWidth = 0.7;
    ctx.beginPath();
    ctx.moveTo(cx - 18, cy - 1);
    ctx.lineTo(cx + 24, cy - 4);
    ctx.stroke();
    ctx.restore();
    ctx.strokeStyle = "rgba(160,235,250,0.3)";
    ctx.lineWidth = 0.6;
    for (let k = 1; k <= 3; k++) {
      ctx.beginPath();
      ctx.ellipse(cx - 20 - k * 7, cy + 3, 6 + k * 3, 1, 0, 0, Math.PI * 2);
      ctx.stroke();
    }

    ctx.drawImage(Lr.mid, 0, 0, W, H);

    // Volumetric shafts, slowly breathing.
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.globalAlpha = 0.75 + 0.25 * Math.sin(t * 0.7);
    ctx.drawImage(Lr.shafts, 0, 0, W, H);
    ctx.restore();

    // Lamp flames, glow and their streaks on the wet ground.
    const L = LAYOUT.lamps;
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (let i = 0; i < L.count; i++) {
      const lit = Math.max(0, Math.min(1, f.lampsLit - i));
      if (lit <= 0) continue;
      const x = L.x0 + i * L.dx, y = L.y;
      const fl = 1 + Math.sin(t * 13 + i * 2.1) * 0.08 + Math.sin(t * 7.3 + i) * 0.06;
      ctx.globalAlpha = lit * 0.75;
      ctx.drawImage(glow("#ffb050"), x - 22, y - 26, 44, 44);
      ctx.globalAlpha = lit * 0.35;
      ctx.drawImage(glow("#ff9a3a"), x - 5, y + 24, 10, 46);
      ctx.globalAlpha = lit;
      const fg = ctx.createLinearGradient(0, y - 10 * fl, 0, y);
      fg.addColorStop(0, "rgba(255,240,180,0)");
      fg.addColorStop(0.4, "rgba(255,220,140,1)");
      fg.addColorStop(1, "rgba(255,120,40,1)");
      ctx.fillStyle = fg;
      ctx.beginPath();
      ctx.moveTo(x - 2.2, y - 0.5);
      ctx.quadraticCurveTo(x - 1.5, y - 6 * fl, x + Math.sin(t * 5 + i) * 0.8, y - 10 * fl);
      ctx.quadraticCurveTo(x + 1.5, y - 6 * fl, x + 2.2, y - 0.5);
      ctx.fill();
    }
    ctx.restore();

    // Counter steam.
    const sh = LAYOUT.shop;
    ctx.strokeStyle = "rgba(255,230,200,0.22)";
    ctx.lineWidth = 1;
    for (let i = 0; i < 3; i++) {
      const gx = sh.x + 18 + i * 12, gy = sh.y + 41;
      ctx.beginPath();
      ctx.moveTo(gx, gy);
      for (let k = 1; k <= 4; k++) ctx.lineTo(gx + Math.sin(t * 2.4 + k + i * 2) * 1.6, gy - k * 3.2);
      ctx.stroke();
    }

    // Floor rings first (they sit on the ground).
    for (const v of f.villagers) rings(ctx, v, f);

    // Reflections, contact shadows, then the villagers.
    for (const v of f.villagers) {
      ctx.save();
      ctx.globalAlpha = 0.2;
      ctx.translate(0, 2 * v.y + 1);
      ctx.scale(1, -1);
      villager(ctx, v, f, rimFor(v.status, f));
      ctx.restore();
      const lift = v.jump;
      ctx.fillStyle = `rgba(0,0,0,${0.55 - lift * 0.3})`;
      ctx.beginPath();
      ctx.ellipse(v.x, v.y, 9 - lift * 3, 2.2 - lift * 0.6, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    for (const v of f.villagers) villager(ctx, v, f, rimFor(v.status, f));

    // Holographic panels around the working villager.
    const k = f.villagers.find((v) => v.status === "working");
    if (k) {
      const s = skeleton(k);
      const fy = k.y - 70 + Math.sin(t * 1.8) * 1.5;
      const lx = k.x - 50, rx = k.x + 14;
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      ctx.strokeStyle = "rgba(94,234,212,0.18)";
      ctx.lineWidth = 0.5;
      for (const [px, py] of [[lx + 36, fy + 12], [rx, fy + 12]] as const) {
        ctx.beginPath();
        ctx.moveTo(s.handF.x, s.handF.y - 4);
        ctx.lineTo(px, py);
        ctx.stroke();
      }
      ctx.restore();
      holoPanel(ctx, lx, fy, 36, 26, 0.08, f, "code");
      holoPanel(ctx, rx, fy - 2, 34, 22, -0.08, f, "task");
    }

    // Raghu's success sparks at the top of each hop.
    const rg = f.villagers.find((v) => v.status === "finished");
    if (rg && rg.jump > 0.4) {
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      const top = rg.y - BODY.height - rg.jump * 26;
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2 + t;
        const r = 14 + rg.jump * 8;
        ctx.globalAlpha = rg.jump * 0.8;
        ctx.drawImage(glow(STATUS_COLOR.finished), rg.x + Math.cos(a) * r - 3, top + 30 + Math.sin(a) * r * 0.6 - 3, 6, 6);
      }
      ctx.restore();
    }

    // Dust motes drifting through the light.
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (let i = 0; i < 34; i++) {
      const x = (hash(i * 1.3) * W + t * (2 + hash(i) * 5)) % W;
      const y = (hash(i * 2.9) * 300 + t * (1.5 + hash(i + 4) * 3)) % 320 + 20;
      ctx.fillStyle = `rgba(190,245,255,${0.12 + 0.25 * Math.abs(Math.sin(t * 0.9 + i))})`;
      ctx.fillRect(x, y, 1, 1);
    }
    ctx.restore();

    for (const v of f.villagers) label(ctx, v, f);

    // Grade: vignette and defocused foreground.
    ctx.drawImage(Lr.grade, 0, 0, W, H);

    // Progress HUD.
    const hx = 18, hy = 340, hw = 150;
    ctx.fillStyle = "rgba(4,18,24,0.7)";
    ctx.beginPath();
    ctx.roundRect(hx, hy, hw, 13, 4);
    ctx.fill();
    ctx.strokeStyle = "rgba(94,234,212,0.45)";
    ctx.lineWidth = 0.6;
    ctx.stroke();
    ctx.font = "600 6.5px ui-sans-serif, system-ui, sans-serif";
    ctx.textAlign = "left";
    ctx.fillStyle = "rgba(200,255,248,0.9)";
    ctx.fillText(`KUTTAN · auth.ts  ${Math.round(f.progress * 100)}%`, hx + 5, hy + 8.8);
    ctx.fillStyle = "rgba(94,234,212,0.2)";
    ctx.fillRect(hx + 98, hy + 5, 46, 3);
    ctx.save();
    ctx.shadowColor = "#5eead4";
    ctx.shadowBlur = 4;
    ctx.fillStyle = STATUS_COLOR.working;
    ctx.fillRect(hx + 98, hy + 5, 46 * f.progress, 3);
    ctx.restore();
  },
};
