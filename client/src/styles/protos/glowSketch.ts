import { BODY, H, LAYOUT, W, boil, hash, labelAnchor, rng, skeleton, type SceneFrame, type VillagerFrame } from "../scene";
import type { StyleProto } from "../types";

/**
 * 3 · Glow Sketch: thin warm-gold line art glowing on near-black, a spotlight
 * that follows the working villager, dashed light outlines for the scenery.
 *
 * Cheap glow: every stroke is a Path2D drawn three times with "lighter"
 * compositing (wide/faint, medium, thin/bright). The static scenery is drawn
 * once into a 2× offscreen canvas plus a blurred copy (ctx.filter, once), and
 * each frame just blits those two images. No per-frame shadowBlur.
 */

const BG = "#07060a";
const GOLD = "255,200,120";
const GOLD_HOT = "255,232,180";
const RED = "255,96,64";

type RGB = string;

/** Glowing stroke: halo, inner halo, core. Assumes "lighter" compositing. */
function glow(ctx: CanvasRenderingContext2D, p: Path2D, rgb: RGB = GOLD, w = 1, a = 1, dash?: number[]) {
  ctx.setLineDash(dash ?? []);
  ctx.strokeStyle = `rgba(${rgb},${0.1 * a})`;
  ctx.lineWidth = w * 6;
  ctx.stroke(p);
  ctx.strokeStyle = `rgba(${rgb},${0.24 * a})`;
  ctx.lineWidth = w * 2.6;
  ctx.stroke(p);
  ctx.strokeStyle = `rgba(${GOLD_HOT},${0.85 * a})`;
  ctx.lineWidth = w * 0.8;
  ctx.stroke(p);
  ctx.setLineDash([]);
}

function poly(pts: [number, number][], close = false, p = new Path2D()) {
  pts.forEach(([x, y], i) => (i ? p.lineTo(x, y) : p.moveTo(x, y)));
  if (close) p.closePath();
  return p;
}

function palmPath(x: number, baseY: number, h: number, lean: number) {
  const p = new Path2D();
  const topX = x + lean * h;
  const topY = baseY - h;
  p.moveTo(x, baseY);
  p.quadraticCurveTo(x + lean * h * 0.2, baseY - h * 0.5, topX, topY);
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2 + 0.3;
    const len = h * 0.34;
    const ex = topX + Math.cos(a) * len;
    const ey = topY + Math.sin(a) * len * 0.42 + len * 0.28;
    p.moveTo(topX, topY);
    p.quadraticCurveTo((topX + ex) / 2, topY - 9, ex, ey);
  }
  return p;
}

// ── static layer (drawn once, 2×) ───────────────────────────────────────────

let staticSharp: HTMLCanvasElement | null = null;
let staticBlur: HTMLCanvasElement | null = null;

function buildStatic() {
  const c = document.createElement("canvas");
  c.width = W * 2;
  c.height = H * 2;
  const g = c.getContext("2d")!;
  g.scale(2, 2);
  g.lineCap = "round";
  g.lineJoin = "round";
  g.globalCompositeOperation = "lighter";

  // Faint stars.
  const r = rng(31);
  for (let i = 0; i < 70; i++) {
    const x = r() * W, y = r() * 135, s = r();
    g.fillStyle = `rgba(${GOLD},${0.08 + s * 0.22})`;
    g.fillRect(x, y, s > 0.85 ? 1.4 : 0.9, s > 0.85 ? 1.4 : 0.9);
  }
  // Moon: a thin glowing crescent.
  const moon = new Path2D();
  moon.arc(548, 50, 13, -1.1, 2.2);
  moon.arc(553, 46, 11, 1.95, -0.85, true);
  glow(g, moon, GOLD, 1, 0.8);

  // Horizon and ground lines.
  glow(g, poly([[0, LAYOUT.waterTop], [W, LAYOUT.waterTop]]), GOLD, 0.8, 0.55);
  glow(g, poly([[0, LAYOUT.groundY], [W, LAYOUT.groundY]]), GOLD, 0.8, 0.45, [2, 5]);

  // Far palms: dotted, faint.
  for (const x of LAYOUT.farPalms) glow(g, palmPath(x, LAYOUT.waterTop, 34, 0.05), GOLD, 0.7, 0.45, [1.5, 3]);

  // Floor: a perspective grid of dots fading towards the viewer.
  for (let row = 0; row < 7; row++) {
    const y = 300 + row * 8.5;
    const gap = 10 + row * 2.4;
    g.fillStyle = `rgba(${GOLD},${0.05 + row * 0.035})`;
    for (let x = (row % 2) * gap * 0.5; x < W; x += gap) g.fillRect(x, y, 1.1, 1.1);
  }

  // Tea shop: dashed outline, roof with rafters, door, counter, board.
  const sh = LAYOUT.shop;
  const base = sh.y + sh.h;
  const dash = [5, 3];
  glow(g, poly([[sh.x, base], [sh.x, sh.y], [sh.x + sh.w, sh.y], [sh.x + sh.w, base]]), GOLD, 1, 0.9, dash);
  glow(g, poly([[sh.x - 14, sh.y + 4], [sh.x + sh.w / 2, sh.y - sh.roofH], [sh.x + sh.w + 14, sh.y + 4]]), GOLD, 1.1, 1, dash);
  const tiles = new Path2D();
  for (let i = 1; i < 6; i++) poly([[sh.x - 14 + i * 13, sh.y + 4 - i * 7.4], [sh.x + sh.w + 14 - i * 13, sh.y + 4 - i * 7.4]], false, tiles);
  glow(g, tiles, GOLD, 0.6, 0.4, [1.5, 4]);
  glow(g, poly([[sh.doorX - 12, base], [sh.doorX - 12, sh.y + 22], [sh.doorX + 12, sh.y + 22], [sh.doorX + 12, base]]), GOLD, 0.9, 0.8, [3, 2.5]);
  const board = new Path2D();
  board.rect(sh.x + 14, sh.y + 8, 52, 12);
  glow(g, board, GOLD, 0.8, 0.8);
  const counter = poly([[sh.x + 8, sh.y + 46], [sh.x + 66, sh.y + 46]]);
  for (let i = 0; i < 3; i++) {
    const gx = sh.x + 20 + i * 14;
    poly([[gx - 2, sh.y + 39], [gx - 1.5, sh.y + 46], [gx + 1.5, sh.y + 46], [gx + 2, sh.y + 39]], false, counter);
  }
  glow(g, counter, GOLD, 0.8, 0.8);
  g.font = "600 7px ui-sans-serif, system-ui, sans-serif";
  g.textAlign = "center";
  g.fillStyle = `rgba(${GOLD_HOT},0.85)`;
  g.fillText("CHAYA KADA", sh.x + 40, sh.y + 16.5);

  // Near palms: dotted trunks and fronds.
  for (const p of LAYOUT.palms) glow(g, palmPath(p.x, p.baseY, p.h, p.lean), GOLD, 1, 0.85, [2.5, 3]);

  // Sign post.
  const S = LAYOUT.sign;
  const sign = poly([[S.x, S.y + 40], [S.x, S.y + 2]]);
  sign.rect(S.x - 32, S.y - 12, 64, 14);
  glow(g, sign, GOLD, 0.9, 0.9);
  g.font = "600 8px ui-sans-serif, system-ui, sans-serif";
  g.fillStyle = `rgba(${GOLD_HOT},0.9)`;
  g.fillText(S.text, S.x, S.y - 2);

  // Lamp stands (flames are dynamic).
  const L = LAYOUT.lamps;
  const lamps = new Path2D();
  for (let i = 0; i < L.count; i++) {
    const x = L.x0 + i * L.dx;
    poly([[x, L.y + 22], [x, L.y]], false, lamps);
    poly([[x - 6, L.y + 22], [x + 6, L.y + 22]], false, lamps);
    poly([[x - 5, L.y], [x - 3, L.y + 3], [x + 3, L.y + 3], [x + 5, L.y]], false, lamps);
  }
  glow(g, lamps, GOLD, 0.9, 0.85);

  // The small "GRAMAM" title near the top.
  g.font = "500 7px ui-sans-serif, system-ui, sans-serif";
  g.fillStyle = `rgba(${GOLD},0.38)`;
  const title = "G R A M A M";
  g.fillText(title, W / 2, 18);
  glow(g, poly([[W / 2 - 40, 22], [W / 2 - 26, 22]]), GOLD, 0.5, 0.4);
  glow(g, poly([[W / 2 + 26, 22], [W / 2 + 40, 22]]), GOLD, 0.5, 0.4);

  // Blurred copy for the soft bloom.
  const b = document.createElement("canvas");
  b.width = W;
  b.height = H;
  const bg = b.getContext("2d")!;
  bg.filter = "blur(3px)";
  bg.drawImage(c, 0, 0, W, H);
  staticSharp = c;
  staticBlur = b;
}

// ── dynamic pieces ──────────────────────────────────────────────────────────

function spotlight(ctx: CanvasRenderingContext2D, v: VillagerFrame, t: number) {
  const x = v.x, y = v.y;
  const breathe = 0.85 + 0.15 * Math.sin(t * 1.7);
  const topX = x * 0.6 + W * 0.2; // source sits up high, a little toward centre
  const cone = new Path2D();
  cone.moveTo(topX - 12, 0);
  cone.lineTo(topX + 12, 0);
  cone.lineTo(x + 40, y + 2);
  cone.lineTo(x - 40, y + 2);
  cone.closePath();
  const lg = ctx.createLinearGradient(0, 0, 0, y);
  lg.addColorStop(0, `rgba(${GOLD},${0.07 * breathe})`);
  lg.addColorStop(0.6, `rgba(${GOLD},${0.11 * breathe})`);
  lg.addColorStop(1, `rgba(${GOLD},${0.2 * breathe})`);
  ctx.fillStyle = lg;
  ctx.fill(cone);
  // Pool of light on the floor and the glowing ring under his feet.
  const rg = ctx.createRadialGradient(x, y, 2, x, y, 44);
  rg.addColorStop(0, `rgba(${GOLD},${0.22 * breathe})`);
  rg.addColorStop(1, `rgba(${GOLD},0)`);
  ctx.fillStyle = rg;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(1, 0.24);
  ctx.translate(-x, -y);
  ctx.fillRect(x - 46, y - 46, 92, 92);
  ctx.restore();
  const ring = new Path2D();
  ring.ellipse(x, y + 1, 30, 6.5, 0, 0, Math.PI * 2);
  glow(ctx, ring, GOLD, 1, 0.7 + 0.3 * breathe);
  const ring2 = new Path2D();
  ring2.ellipse(x, y + 1, 38, 8.5, 0, 0, Math.PI * 2);
  glow(ctx, ring2, GOLD, 0.6, 0.35 * breathe, [2, 4]);
}

function villager(ctx: CanvasRenderingContext2D, v: VillagerFrame, f: SceneFrame) {
  const s = skeleton(v);
  const urgent = v.status === "waiting";
  const rgb = urgent ? RED : GOLD;
  const a = urgent ? 0.75 + 0.25 * f.pulse : 1;
  const body = new Path2D();
  poly([[s.footB.x, s.footB.y], [s.kneeB.x, s.kneeB.y], [s.hip.x, s.hip.y], [s.kneeF.x, s.kneeF.y], [s.footF.x, s.footF.y]], false, body);
  poly([[s.hip.x, s.hip.y], [s.neck.x, s.neck.y]], false, body);
  poly([[s.handB.x, s.handB.y], [s.elbowB.x, s.elbowB.y], [s.shoulder.x, s.shoulder.y], [s.elbowF.x, s.elbowF.y], [s.handF.x, s.handF.y]], false, body);
  body.moveTo(s.head.x + BODY.head * 0.75, s.head.y);
  body.arc(s.head.x, s.head.y, BODY.head * 0.75, 0, Math.PI * 2);
  // Mundu: a light outline from the waist to the shins.
  const mx = (s.kneeF.x + s.kneeB.x) / 2;
  const mundu = poly([[s.hip.x - 6, s.hip.y - 2], [mx - 8, s.hip.y + 19], [mx + 8, s.hip.y + 19], [s.hip.x + 6, s.hip.y - 2]], true);
  glow(ctx, body, rgb, 1.15, a);
  glow(ctx, mundu, rgb, 0.7, a * 0.6, [2, 2]);

  if (v.carry === "laptop") {
    const lx = s.handF.x, ly = s.handF.y;
    const lap = poly([[lx - 10, ly - 1], [lx + 9, ly - 1]]);
    poly([[lx - 9 * v.facing, ly - 1], [lx - 13 * v.facing, ly - 12], [lx + 1 * v.facing, ly - 12], [lx + 4 * v.facing, ly - 1]], false, lap);
    glow(ctx, lap, GOLD, 0.9, 1);
    // Screen light with a tiny progress line.
    const sx = Math.min(lx - 12 * v.facing, lx + 1 * v.facing) + 2, sy = ly - 10;
    ctx.fillStyle = `rgba(${GOLD},0.16)`;
    ctx.fillRect(sx, sy, 10, 7);
    ctx.fillStyle = `rgba(${GOLD_HOT},0.9)`;
    ctx.fillRect(sx + 1, sy + 5, 8 * f.progress, 1);
  } else if (v.carry === "glass") {
    const gx = s.handF.x, gy = s.handF.y;
    const gl = poly([[gx - 2.5, gy - 7], [gx - 2, gy + 1], [gx + 2.5, gy + 1], [gx + 3, gy - 7]]);
    glow(ctx, gl, GOLD, 0.8, 1);
    const steam = new Path2D();
    steam.moveTo(gx, gy - 9);
    for (let k = 1; k <= 4; k++) steam.lineTo(gx + Math.sin(f.t * 3 + k) * 1.4, gy - 9 - k * 3.5);
    glow(ctx, steam, GOLD, 0.5, 0.5);
  }

  if (urgent) {
    // Urgent red-gold halo pulsing around her.
    const cx = v.x, cy = v.y - BODY.height * 0.5;
    const rg = ctx.createRadialGradient(cx, cy, 4, cx, cy, 46);
    rg.addColorStop(0, `rgba(${RED},${0.1 + 0.14 * f.pulse})`);
    rg.addColorStop(0.6, `rgba(255,150,70,${0.04 + 0.06 * f.pulse})`);
    rg.addColorStop(1, "rgba(255,90,60,0)");
    ctx.fillStyle = rg;
    ctx.fillRect(cx - 46, cy - 46, 92, 92);
    const ring = new Path2D();
    ring.ellipse(v.x, v.y + 1, 18 + f.pulse * 6, 4 + f.pulse * 1.4, 0, 0, Math.PI * 2);
    glow(ctx, ring, RED, 1, 0.5 + 0.5 * f.pulse);
  } else if (v.status === "finished") {
    // Soft shadow ring that shrinks as he leaves the ground, plus sparks at the top of a hop.
    const k = 1 - v.jump * 0.5;
    const ring = new Path2D();
    ring.ellipse(v.x, v.y + 1, 14 * k, 3 * k, 0, 0, Math.PI * 2);
    glow(ctx, ring, GOLD, 0.7, 0.5 * k);
    if (v.jump > 0.5) {
      for (let i = 0; i < 5; i++) {
        const ang = (i / 5) * Math.PI * 2 + f.t;
        const d = 14 + v.jump * 8;
        ctx.fillStyle = `rgba(${GOLD_HOT},${(v.jump - 0.5) * 1.6})`;
        ctx.fillRect(s.head.x + Math.cos(ang) * d - 0.8, s.head.y + Math.sin(ang) * d - 0.8, 1.6, 1.6);
      }
    }
  }
}

function label(ctx: CanvasRenderingContext2D, v: VillagerFrame, f: SceneFrame) {
  const { x, y } = labelAnchor(v);
  const urgent = v.status === "waiting";
  ctx.textAlign = "center";
  ctx.font = "600 9px ui-sans-serif, system-ui, sans-serif";
  const tw = ctx.measureText(v.label).width;
  // Dark backing so text stays readable over glow, with a glowing frame.
  ctx.globalCompositeOperation = "source-over";
  ctx.fillStyle = "rgba(7,6,10,0.72)";
  ctx.fillRect(x - tw / 2 - 6, y - 21, tw + 12, 26);
  ctx.globalCompositeOperation = "lighter";
  const frame = new Path2D();
  frame.rect(x - tw / 2 - 6, y - 21, tw + 12, 26);
  if (urgent) glow(ctx, frame, RED, 0.8, 0.45 + 0.55 * f.pulse);
  else glow(ctx, frame, GOLD, 0.6, 0.35, [2, 3]);
  const tick = poly([[x, y + 5], [x, y + 11]]);
  glow(ctx, tick, urgent ? RED : GOLD, 0.7, urgent ? 0.4 + 0.6 * f.pulse : 0.6);
  ctx.font = "500 7.5px ui-sans-serif, system-ui, sans-serif";
  ctx.fillStyle = urgent ? `rgba(255,170,130,0.9)` : `rgba(${GOLD},0.75)`;
  ctx.fillText(v.name.toUpperCase(), x, y - 12);
  ctx.font = "600 9px ui-sans-serif, system-ui, sans-serif";
  ctx.fillStyle = urgent ? `rgba(255,${120 + 60 * f.pulse},${90 + 40 * f.pulse},${0.7 + 0.3 * f.pulse})` : `rgba(${GOLD_HOT},0.95)`;
  ctx.fillText(v.label, x, y);
}

export const glowSketch: StyleProto = {
  id: "glow-sketch",
  n: 3,
  name: "Glow Sketch",
  blurb: "Thin warm-gold line art glowing on near-black, a spotlight that follows the working villager, dashed light outlines and drifting dust. Moody and calm; the approval glows red-gold.",
  bg: BG,
  draw(ctx, f) {
    if (!staticSharp) buildStatic();
    const t = f.t;
    ctx.save();
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.fillStyle = BG;
    ctx.fillRect(0, 0, W, H);

    // Static scenery with a gently breathing bloom.
    ctx.globalCompositeOperation = "lighter";
    ctx.globalAlpha = 0.55 + 0.25 * (0.5 + 0.5 * Math.sin(t * 1.3));
    ctx.drawImage(staticBlur!, 0, 0, W, H);
    ctx.globalAlpha = 1;
    ctx.drawImage(staticSharp!, 0, 0, W, H);

    // Water: dashed glinting lines drifting sideways.
    for (let i = 0; i < 4; i++) {
      const y = LAYOUT.waterTop + 9 + i * 9;
      const p = poly([[0, y], [W, y]]);
      ctx.lineDashOffset = -((t * (7 + i * 3)) % 60);
      glow(ctx, p, GOLD, 0.6, 0.22 + i * 0.05, [10 + i * 4, 22 + i * 6]);
    }
    ctx.lineDashOffset = 0;

    // Canoe with a rower and a dipping oar, plus its reflection glint.
    const cx = f.canoeX, cy = 178;
    const canoe = poly([[cx - 22, cy - 3], [cx - 16, cy + 3], [cx + 16, cy + 3], [cx + 22, cy - 3]]);
    poly([[cx, cy], [cx, cy - 12]], false, canoe);
    canoe.moveTo(cx + 3, cy - 15);
    canoe.arc(cx, cy - 15, 3, 0, Math.PI * 2);
    poly([[cx + 2, cy - 9], [cx + 14, cy + 6 + Math.sin(t * 2) * 2]], false, canoe);
    glow(ctx, canoe, GOLD, 0.9, 0.9);
    glow(ctx, poly([[cx - 16, cy + 7], [cx + 16, cy + 7]]), GOLD, 0.5, 0.3, [3, 3]);

    // Lamp flames: soft radial glows plus a glowing flame stroke.
    const L = LAYOUT.lamps;
    for (let i = 0; i < L.count; i++) {
      const lit = Math.max(0, Math.min(1, f.lampsLit - i));
      if (lit <= 0) continue;
      const x = L.x0 + i * L.dx;
      const fl = 1 + boil(i, t, 0.22, 12);
      const rg = ctx.createRadialGradient(x, L.y - 4, 0, x, L.y - 4, 16 * fl);
      rg.addColorStop(0, `rgba(255,190,90,${0.4 * lit})`);
      rg.addColorStop(1, "rgba(255,160,60,0)");
      ctx.fillStyle = rg;
      ctx.fillRect(x - 17, L.y - 21, 34, 34);
      const flame = new Path2D();
      flame.moveTo(x - 2, L.y - 1);
      flame.quadraticCurveTo(x, L.y - 9 * fl, x + 2, L.y - 1);
      glow(ctx, flame, "255,190,90", 0.9, lit);
    }

    // Spotlight on the working villager, then the villagers.
    const worker = f.villagers.find((v) => v.status === "working");
    if (worker) spotlight(ctx, worker, t);
    for (const v of f.villagers) villager(ctx, v, f);

    // Dust / bokeh: slow drifting motes, a few larger soft ones.
    for (let i = 0; i < 34; i++) {
      const sx = hash(i * 3.1), sy = hash(i * 7.7), sp = 0.4 + hash(i * 1.9);
      const x = ((sx * W + t * 4 * sp + Math.sin(t * 0.5 + i) * 6) % W + W) % W;
      const y = ((sy * H - t * 3 * sp) % H + H) % H;
      const tw = 0.5 + 0.5 * Math.sin(t * (0.8 + sp) + i * 2.3);
      if (i % 6 === 0) {
        const rad = 3 + sp * 3;
        const rg = ctx.createRadialGradient(x, y, 0, x, y, rad);
        rg.addColorStop(0, `rgba(${GOLD},${0.1 * tw})`);
        rg.addColorStop(1, `rgba(${GOLD},0)`);
        ctx.fillStyle = rg;
        ctx.fillRect(x - rad, y - rad, rad * 2, rad * 2);
      } else {
        ctx.fillStyle = `rgba(${GOLD},${0.08 + 0.22 * tw})`;
        ctx.fillRect(x, y, 1, 1);
      }
    }
    // Motes caught in the spotlight glint brighter.
    if (worker) {
      for (let i = 0; i < 10; i++) {
        const k = ((hash(i * 5.3) + t * 0.05 * (0.5 + hash(i))) % 1);
        const y = 20 + (1 - k) * (worker.y - 40);
        const spread = 6 + (y / worker.y) * 28;
        const topX = worker.x * 0.6 + W * 0.2;
        const lx = topX + (worker.x - topX) * (y / worker.y) + (hash(i * 9.1) - 0.5) * 2 * spread;
        ctx.fillStyle = `rgba(${GOLD_HOT},${0.25 + 0.3 * Math.abs(Math.sin(t + i))})`;
        ctx.fillRect(lx, y, 1.2, 1.2);
      }
    }

    // Labels.
    for (const v of f.villagers) label(ctx, v, f);

    // Progress: a glowing hairline with a bright head and its percentage.
    ctx.globalCompositeOperation = "lighter";
    const px0 = 40, px1 = W - 40, py = 350;
    glow(ctx, poly([[px0, py], [px1, py]]), GOLD, 0.6, 0.3, [1.5, 3]);
    const pe = px0 + (px1 - px0) * f.progress;
    glow(ctx, poly([[px0, py], [pe, py]]), GOLD, 1, 1);
    const hg = ctx.createRadialGradient(pe, py, 0, pe, py, 7);
    hg.addColorStop(0, `rgba(${GOLD_HOT},0.7)`);
    hg.addColorStop(1, `rgba(${GOLD},0)`);
    ctx.fillStyle = hg;
    ctx.fillRect(pe - 7, py - 7, 14, 14);
    ctx.font = "500 7px ui-sans-serif, system-ui, sans-serif";
    ctx.textAlign = "left";
    ctx.fillStyle = `rgba(${GOLD},0.6)`;
    ctx.fillText(`KUTTAN · auth.ts ${Math.round(f.progress * 100)}%`, px0, py - 5);

    ctx.restore();
  },
};
