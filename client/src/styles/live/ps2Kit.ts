/**
 * PS2 live style kit: the shared low-poly helpers (camera, look, textures,
 * cached sprites) and the Bengaluru scenery (skyline, metro viaduct + train,
 * road + autos, gulmohars, city buildings, street lights, street sign).
 * Same rendering rules as Kerala: flat-shaded mini3d meshes, fog, snapped
 * vertices, every static object cached once as a sprite seen by its own
 * front-on camera.
 */
import { hash, rng } from "../scene";
import {
  R3, add, box, boxBetween, cylinder, desat, ellipsoid, ground, hex, makeCamera, mixRGB, norm, poly, project, rgba,
  type Camera, type Look, type Poly, type RGB, type Tex, type V3,
} from "../protos/mini3d";
import { GROUND, WORLD_H, type LiveFrame, type LivePlace, type ViewRect } from "./types";

export const TILE = 640;
/** Sprite resolution (pixels per world unit) for cached scenery. */
export const SPR = 1.5;

const BASE = makeCamera({ fov: 40, horizonY: GROUND.waterTop, height: 170 });
/** The front-on camera that looks straight at world x. */
export const camAt = (x: number): Camera => ({ ...BASE, pos: [x, BASE.pos[1], BASE.pos[2]], cx: x });

export const FOG: RGB = [158, 166, 168];
export const LOOK: Look = {
  light: norm([-0.45, 0.75, -0.55]),
  lightColor: [0.72, 0.66, 0.56],
  ambient: [0.46, 0.47, 0.52],
  fog: { color: FOG, near: 420, k: 0.2, max: 0.82 },
  snap: 1 / SPR,
  seam: 0.9,
};
export const mute = (s: string, k = 0.3): RGB => desat(hex(s), k);

// ── textures (screen space, clipped to the face) ────────────────────────────
export function bbox(pts: number[]) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (let i = 0; i < pts.length; i += 2) {
    x0 = Math.min(x0, pts[i]); x1 = Math.max(x1, pts[i]);
    y0 = Math.min(y0, pts[i + 1]); y1 = Math.max(y1, pts[i + 1]);
  }
  return { x0, y0, x1, y1 };
}
export const brick = (row: number, col: number, alpha = 0.32): Tex => (ctx, pts, fog) => {
  const b = bbox(pts);
  ctx.fillStyle = `rgba(52,26,16,${alpha * (1 - fog)})`;
  let k = 0;
  for (let y = Math.floor(b.y0 / row) * row; y < b.y1; y += row, k++) {
    ctx.fillRect(b.x0, y, b.x1 - b.x0, 1);
    for (let x = b.x0 + ((k % 2) * col) / 2; x < b.x1; x += col) ctx.fillRect(x, y, 1, row);
  }
};
export const tiles = (alpha = 0.4): Tex => (ctx, pts, fog) => {
  const b = bbox(pts);
  ctx.fillStyle = `rgba(40,14,8,${alpha * (1 - fog)})`;
  for (let y = b.y0; y < b.y1; y += 4) ctx.fillRect(b.x0, y, b.x1 - b.x0, 1);
  for (let x = b.x0; x < b.x1; x += 6) ctx.fillRect(x, b.y0, 0.8, b.y1 - b.y0);
};
export const planks: Tex = (ctx, pts, fog) => {
  const b = bbox(pts);
  ctx.fillStyle = `rgba(30,18,10,${0.35 * (1 - fog)})`;
  for (let x = b.x0; x < b.x1; x += 5) ctx.fillRect(x, b.y0, 0.8, b.y1 - b.y0);
};
export const speckle = (seed: number, light: string, dark: string, n = 6): Tex => (ctx, pts) => {
  const b = bbox(pts);
  const r = rng(seed);
  for (let i = 0; i < n; i++) {
    ctx.fillStyle = i % 2 ? light : dark;
    ctx.fillRect(b.x0 + r() * (b.x1 - b.x0), b.y0 + r() * (b.y1 - b.y0), 2, 2);
  }
};
/** Curtain-wall glass: mullion grid plus one diagonal sky reflection. */
const glass = (step = 9, row = 6): Tex => (ctx, pts, fog) => {
  const b = bbox(pts);
  const w = b.x1 - b.x0, h = b.y1 - b.y0;
  ctx.fillStyle = `rgba(222,238,250,${0.3 * (1 - fog)})`;
  for (let y = b.y0 + row; y < b.y1; y += row) ctx.fillRect(b.x0, y, w, 0.8);
  for (let x = b.x0 + step; x < b.x1; x += step) ctx.fillRect(x, b.y0, 0.8, h);
  ctx.fillStyle = `rgba(255,255,255,${0.14 * (1 - fog)})`;
  ctx.beginPath();
  ctx.moveTo(b.x0 + w * 0.15, b.y1);
  ctx.lineTo(b.x0 + w * 0.42, b.y0);
  ctx.lineTo(b.x0 + w * 0.58, b.y0);
  ctx.lineTo(b.x0 + w * 0.31, b.y1);
  ctx.fill();
};
/** Rows of small windows (apartment blocks). */
const windows = (dark: string, sx = 5, sy = 6): Tex => (ctx, pts) => {
  const b = bbox(pts);
  ctx.fillStyle = dark;
  for (let y = b.y0 + 2; y < b.y1 - 3; y += sy) for (let x = b.x0 + 1.5; x < b.x1 - 2; x += sx) ctx.fillRect(x, y, sx * 0.5, sy * 0.45);
};
/** Window band split by body-coloured pillars (bus, metro car). */
const pillars = (col: string, step: number): Tex => (ctx, pts) => {
  const b = bbox(pts);
  ctx.fillStyle = col;
  for (let x = b.x0 + step * 0.7; x < b.x1 - 1; x += step) ctx.fillRect(x, b.y0, Math.max(0.8, step * 0.18), b.y1 - b.y0);
};
const shutter: Tex = (ctx, pts, fog) => {
  const b = bbox(pts);
  ctx.fillStyle = `rgba(40,44,48,${0.4 * (1 - fog)})`;
  for (let y = b.y0; y < b.y1; y += 1.6) ctx.fillRect(b.x0, y, b.x1 - b.x0, 0.5);
};
const pavers = (seed: number): Tex => (ctx, pts, fog) => {
  const b = bbox(pts);
  ctx.fillStyle = `rgba(70,62,56,${0.3 * (1 - fog)})`;
  const h = b.y1 - b.y0;
  ctx.fillRect(b.x0, b.y0, b.x1 - b.x0, 0.6);
  for (let x = b.x0 + (seed % 2) * 5; x < b.x1; x += 10) ctx.fillRect(x, b.y0, 0.6, h);
  const r = rng(seed);
  for (let i = 0; i < 4; i++) {
    ctx.fillStyle = i % 2 ? "rgba(220,206,190,0.35)" : "rgba(90,80,70,0.3)";
    ctx.fillRect(b.x0 + r() * (b.x1 - b.x0), b.y0 + r() * h, 2, 1.5);
  }
};

// ── sprites ─────────────────────────────────────────────────────────────────
export interface Sprite { c: HTMLCanvasElement; x: number; y: number; w: number; h: number }
/** Renders `draw` (world units) for the world rect (x, y, w, h) into a cached canvas. */
export function sprite(x: number, y: number, w: number, h: number, draw: (g: CanvasRenderingContext2D) => void, ppu = SPR): Sprite {
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.ceil(w * ppu));
  c.height = Math.max(1, Math.ceil(h * ppu));
  const g = c.getContext("2d")!;
  g.setTransform(ppu, 0, 0, ppu, -x * ppu, -y * ppu);
  draw(g);
  return { c, x, y, w, h };
}
export const put = (g: CanvasRenderingContext2D, s: Sprite, dx: number) => g.drawImage(s.c, s.x + dx, s.y, s.w, s.h);

export function renderPolys(g: CanvasRenderingContext2D, cam: Camera, ps: Poly[], look: Look = LOOK) {
  const r3 = new R3(cam, look);
  r3.add(ps);
  r3.render(g);
}

export interface PlaceSprite {
  sp: Sprite;
  board: { x: number; y: number; w: number };
  apex: { x: number; y: number };
  /** Bengaluru darshini: where the tea urn steams (local to building x). */
  steam?: { x: number; y: number };
}

/** Axis-aligned box in local units (scaled by s around origin o); corners in any order. */
function boxer(o: V3, s: number, dir = 1) {
  return (ax: number, ay: number, az: number, bx: number, by: number, bz: number, col: RGB, opt?: Poly["o"]): Poly[] => {
    const x0 = o[0] + Math.min(ax * dir, bx * dir) * s, x1 = o[0] + Math.max(ax * dir, bx * dir) * s;
    return box([x0, o[1] + Math.min(ay, by) * s, o[2] + Math.min(az, bz) * s], [x1, o[1] + Math.max(ay, by) * s, o[2] + Math.max(az, bz) * s], col, opt);
  };
}

// ═══ Bengaluru ═══════════════════════════════════════════════════════════════
/** The metro viaduct sits at this ground depth (screen y) in the backwater band. */
const VIA_SY = 186;
const DECK_BOT = 44, DECK_TOP = 60;
/** Less fog on the viaduct and train so the metro reads clearly. */
const VIA_FOG = { color: FOG, near: 420, k: 0.12, max: 0.2 };
const VIA_LOOK: Look = { ...LOOK, fog: VIA_FOG };
const ROAD_TOP = GROUND.pathTop + 5, ROAD_BOT = GROUND.pathBottom - 1;
const LANES = [{ sy: 304, dir: 1 as const }, { sy: 332, dir: -1 as const }];

// ── background: sky tile (behind the skyline) ───────────────────────────────
let blrSky: Sprite | null = null;
export function blrSkySprite(): Sprite {
  if (blrSky) return blrSky;
  blrSky = sprite(0, 0, TILE, 160, (ctx) => {
    const bands = 14;
    for (let i = 0; i < bands; i++) {
      const t = i / (bands - 1);
      ctx.fillStyle = rgba(mixRGB([96, 124, 156], FOG, Math.pow(t, 1.4)));
      ctx.fillRect(0, (i * 152) / bands, TILE, 152 / bands + 1);
    }
    ctx.fillStyle = rgba(FOG);
    ctx.fillRect(0, 151, TILE, 9);
    ctx.fillStyle = "rgba(240,226,190,0.55)";
    ctx.beginPath();
    for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; ctx.lineTo(500 + Math.cos(a) * 14, 62 + Math.sin(a) * 14); }
    ctx.fill();
    const r = rng(57);
    for (let c = 0; c < 5; c++) {
      const cx = r() * TILE, cy = 22 + r() * 56, cw = 46 + r() * 64;
      const al = 0.5 + r() * 0.2;
      const hs = Array.from({ length: 7 }, () => r() * 10);
      for (const off of [-TILE, 0, TILE]) {
        ctx.fillStyle = `rgba(220,224,222,${al})`;
        ctx.beginPath();
        ctx.moveTo(off + cx - cw / 2, cy + 6);
        for (let k = 0; k <= 6; k++) ctx.lineTo(off + cx - cw / 2 + (k / 6) * cw, cy - 4 - hs[k]! * Math.sin((k / 6) * Math.PI));
        ctx.lineTo(off + cx + cw / 2, cy + 6);
        ctx.fill();
      }
    }
    // Far haze: a band of faint block silhouettes along the horizon (wraps across the tile).
    for (const [seed, col, maxH] of [[71, [136, 148, 158], 40], [72, [124, 136, 146], 24]] as [number, RGB, number][]) {
      const q = rng(seed);
      ctx.fillStyle = rgba(col);
      for (let x = 0; x < TILE;) {
        const w = 10 + q() * 22, h = 6 + q() * maxH;
        for (const off of [-TILE, 0, TILE]) ctx.fillRect(off + x, 152 - h, w, h + 2);
        x += w + q() * 8;
      }
    }
  }, 1);
  return blrSky;
}

// ── background: front tile (park, viaduct, pavement, road) ────────────────
let blrFront: Sprite | null = null;
export function blrFrontSprite(): Sprite {
  if (blrFront) return blrFront;
  blrFront = sprite(0, 100, TILE, WORLD_H - 100, (ctx) => {
    const cam = camAt(TILE / 2);
    const r3 = new R3(cam, LOOK);
    const strip = (syNear: number, syFar: number, col: (i: number) => RGB, tex?: (i: number) => Tex, COL = 40) => {
      for (let i = 0; i < TILE / COL; i++) {
        const xa = i * COL, xb = (i + 1) * COL;
        r3.add([{ v: [ground(cam, xa, syNear).p, ground(cam, xb, syNear).p, ground(cam, xb, syFar).p, ground(cam, xa, syFar).p], n: [0, 1, 0], c: col(i), o: tex ? { tex: tex(i) } : undefined }]);
      }
    };
    // Park lawn under the viaduct.
    const lawn = [196, 189, 182, 175, 168, 162, 156, 150.2];
    for (let k = 0; k < lawn.length - 1; k++) strip(lawn[k]!, lawn[k + 1]!, (i) => mixRGB([82, 116, 66], [74, 106, 60], hash(i * 3 + k * 17)), (i) => speckle(i + k * 31, "rgba(150,170,100,0.4)", "rgba(40,64,36,0.35)", 5));
    // Hedge at the park edge, then pavers.
    strip(202, 196, (i) => mixRGB([58, 92, 52], [66, 100, 56], hash(i * 1.3)));
    const pav = [284, 270, 254, 240, 228, 218, 209, 202];
    for (let k = 0; k < pav.length - 1; k++) strip(pav[k]!, pav[k + 1]!, (i) => mixRGB([168, 156, 140], [156, 144, 130], hash(i * 0.37 + k * 11.3)), (i) => pavers(i + k * 97));
    // Black-and-yellow kerbs, asphalt road with a dashed centre line, far pavement.
    const kerb = (a: number, b: number) => strip(a, b, (i) => (i % 2 ? [36, 36, 38] : [214, 178, 44]), undefined, 20);
    kerb(ROAD_TOP, GROUND.pathTop);
    const road = [ROAD_BOT, 330, 317, 314, 300, ROAD_TOP];
    for (let k = 0; k < road.length - 1; k++) {
      const dash = road[k] === 317;
      strip(road[k]!, road[k + 1]!, (i) => (dash && i % 2 === 0 ? [214, 210, 196] : mixRGB([72, 74, 78], [64, 66, 70], hash(i * 0.7 + k * 5))), dash ? undefined : (i) => speckle(i + k * 53, "rgba(140,140,140,0.35)", "rgba(30,30,30,0.35)", 6));
    }
    kerb(GROUND.pathBottom + 4, ROAD_BOT);
    const near = [WORLD_H + 12, 356, GROUND.pathBottom + 4];
    for (let k = 0; k < near.length - 1; k++) strip(near[k]!, near[k + 1]!, (i) => mixRGB([168, 156, 140], [156, 144, 130], hash(i * 0.5 + k * 7)), (i) => pavers(i * 3 + k));
    r3.render(ctx);

    // Park trees behind the viaduct (each seen by its own camera; copies wrap the tile).
    const r = rng(83);
    for (let x = 14; x < TILE; x += 30 + r() * 26) {
      const sz = 9 + r() * 7, red = r() < 0.35, sy = 162 + r() * 8, sd = r();
      for (const off of [-TILE, 0, TILE]) {
        if (x + off < -30 || x + off > TILE + 30) continue;
        const c = camAt(x + off);
        const g0 = ground(c, x + off, sy);
        const s = g0.s, b = g0.p;
        const ps: Poly[] = [...cylinder(b, add(b, [0, sz * 0.8 * s, 0]), 1.4 * s, 1 * s, 4, [96, 82, 70], undefined, { top: false })];
        const col: RGB = red ? mixRGB([200, 84, 44], [222, 112, 52], sd) : mixRGB([70, 112, 60], [88, 124, 66], sd);
        ps.push(...ellipsoid(add(b, [0, sz * 1.2 * s, 0]), [sz * 0.75 * s, sz * 0.55 * s, sz * 0.6 * s], 6, 3, col));
        renderPolys(ctx, c, ps);
      }
    }
    // Viaduct piers (own camera each), then the deck in screen-straight columns.
    for (let i = 0; i < 8; i++) {
      const px = 40 + i * 80;
      const c = camAt(px);
      const g0 = ground(c, px, VIA_SY);
      const B = boxer(g0.p, g0.s);
      renderPolys(ctx, c, [
        ...B(-4, 0, -4, 4, DECK_BOT - 4, 4, [178, 174, 166]),
        ...B(-10, DECK_BOT - 4, -6, 10, DECK_BOT, 6, [164, 160, 152]),
      ], VIA_LOOK);
    }
    const d3 = new R3(cam, VIA_LOOK);
    const g0 = ground(cam, TILE / 2, VIA_SY);
    const s = g0.s, zf = g0.p[2] - 6 * s, zb = g0.p[2] + 6 * s;
    for (let i = 0; i < TILE / 40; i++) {
      const xa = ground(cam, i * 40, VIA_SY).p[0], xb = ground(cam, (i + 1) * 40, VIA_SY).p[0];
      const q = (y0: number, y1: number, z: number, c: RGB, e = 0): Poly => ({ v: [[xa, y0 * s, z], [xb, y0 * s, z], [xb, y1 * s, z], [xa, y1 * s, z]], n: [0, 0, -1], c, o: e ? { emissive: e } : undefined });
      d3.add([
        q(DECK_BOT, DECK_TOP, zf, [166, 160, 152]),
        { v: [[xa, DECK_BOT * s, zf], [xb, DECK_BOT * s, zf], [xb, DECK_BOT * s, zb], [xa, DECK_BOT * s, zb]], n: [0, -1, 0], c: [96, 94, 90] },
        { v: [[xa, DECK_TOP * s, zf], [xb, DECK_TOP * s, zf], [xb, DECK_TOP * s, zb], [xa, DECK_TOP * s, zb]], n: [0, 1, 0], c: [150, 146, 140] },
      ]);
      d3.add([q(DECK_BOT + 3, DECK_BOT + 6.5, zf - 0.4 * s, [132, 70, 182], 0.45), q(DECK_TOP - 2, DECK_TOP + 1.2, zf - 0.2 * s, [228, 224, 216])], 1);
    }
    d3.render(ctx);
  }, 1);
  return blrFront;
}

// ── skyline (one tower per far-palm position) ───────────────────────────────
const SKY_LOOK: Look = { ...LOOK, fog: { color: FOG, near: 420, k: 0.1, max: 0.36 } };
const towerCache = new Map<string, Sprite>();
export function towerSprite(x: number): Sprite {
  const kind = Math.floor(hash(x * 0.37 + 1) * 10);
  const hq = Math.floor(hash(x * 1.7 + 3) * 5);
  const key = `${kind}|${hq}`;
  let sp = towerCache.get(key);
  if (sp) return sp;
  const cam = camAt(0);
  const g0 = ground(cam, 0, 154);
  const B = boxer(g0.p, g0.s);
  const s = g0.s, b = g0.p;
  const ps: Poly[] = [];
  const H = 50 + hq * 14;
  const tank = (lx: number, top: number) => ps.push(...cylinder(add(b, [lx * s, top * s, 4 * s]), add(b, [lx * s, (top + 4) * s, 4 * s]), 2.4 * s, 2.4 * s, 6, [44, 46, 50]));
  let reach = 30;
  if (kind <= 2 || kind === 9) {
    // Glass tech tower (kind 9: shorter office slab).
    const w = kind === 9 ? 22 : 14 + hq * 2, h = kind === 9 ? H * 0.6 : H + 16;
    const col: RGB = kind === 1 ? [88, 130, 150] : kind === 2 ? [96, 140, 132] : [92, 120, 160];
    ps.push(...B(-w, 0, 0, w, h, w * 1.4, col, { tex: glass(5, 4) }));
    ps.push(...B(-w + 2, h, 2, w - 2, h + 4, w * 1.4 - 2, [160, 166, 170]));
    if (kind === 0) ps.push(...B(-1, h + 4, 6, 1, h + 14, 8, [170, 170, 170]));
  } else if (kind <= 5) {
    // Apartment block with water tanks.
    const w = 18 + (kind - 3) * 3, h = H * 0.75;
    const col: RGB = kind === 3 ? [214, 200, 178] : kind === 4 ? [206, 178, 170] : [196, 196, 186];
    ps.push(...B(-w, 0, 0, w, h, 26, col, { tex: windows("rgba(60,66,76,0.55)", 5, 6) }));
    ps.push(...B(-w - 1, h, -1, w + 1, h + 2, 27, [150, 146, 140]));
    tank(-w * 0.5, h + 2);
    tank(w * 0.4, h + 2);
  } else if (kind <= 7) {
    // Slender stepped tower.
    const h = H + 26;
    ps.push(...B(-12, 0, 0, 12, h * 0.7, 20, [110, 132, 156], { tex: glass(5, 4) }));
    ps.push(...B(-8, h * 0.7, 3, 8, h, 16, [124, 146, 168], { tex: glass(5, 4) }));
  } else {
    // Construction: a half-built frame and a tower crane.
    const h = H * 0.8;
    ps.push(...B(-16, 0, 0, 16, h, 24, [150, 148, 142], { tex: windows("rgba(50,50,52,0.6)", 6, 5) }));
    for (let y = 8; y < h; y += 8) ps.push(...B(-17, y - 1, -1, 17, y, 25, [176, 172, 164]));
    const yel: RGB = [214, 170, 40];
    const top = h + 34;
    ps.push(...B(18, 0, 4, 21, top, 7, yel));
    ps.push(...B(-14, top - 2, 4.5, 52, top, 6.5, yel));
    ps.push(...B(8, top - 5, 4, 15, top - 2, 7, [90, 90, 92]));
    ps.push(...boxBetween(add(b, [19.5 * s, (top + 7) * s, 5.5 * s]), add(b, [50 * s, top * s, 5.5 * s]), [0, 0, 1], 0.5 * s, 0.5 * s, yel));
    ps.push(...B(19, top, 5, 20, top + 7, 6, yel));
    ps.push(...B(40, top - 22, 5.2, 40.6, top - 2, 5.8, [60, 60, 60]));
    reach = 56;
  }
  const topY = 154 - H - 70;
  sp = sprite(-reach, topY, reach * 2, 160 - topY, (g) => renderPolys(g, cam, ps, SKY_LOOK), 1);
  towerCache.set(key, sp);
  return sp;
}

// ── gulmohar / rain trees (at the palms' positions) ─────────────────────────
const treeCache = new Map<string, Sprite>();
export function treeSprite(baseY: number, h: number, lean: number): Sprite {
  const key = `${baseY}|${h.toFixed(1)}|${lean.toFixed(3)}`;
  let sp = treeCache.get(key);
  if (sp) return sp;
  const cam = camAt(0);
  const seed = hash(baseY * 3.1 + h);
  const g0 = ground(cam, 0, baseY);
  const s = g0.s, b = g0.p;
  const ht = h * 0.82;
  const out: Poly[] = [];
  const bark: RGB = [100, 86, 74];
  const fork: V3 = add(b, [lean * ht * 0.4 * s, ht * 0.42 * s, 0]);
  out.push(...cylinder(b, fork, 4.2 * s, 3 * s, 5, bark, undefined, { top: false }));
  const rain = seed > 0.72;
  const r = rng(Math.floor(seed * 1e6));
  const W = ht * 0.46;
  for (let k = 0; k < 3; k++) {
    const tip: V3 = add(fork, [(k - 1) * W * 0.55 * s, ht * (0.22 + (k === 1 ? 0.12 : 0)) * s, (r() - 0.5) * 8 * s]);
    out.push(...boxBetween(fork, tip, [0, 0, 1], 2.4 * s, 2.4 * s, bark));
  }
  const n = 11;
  for (let k = 0; k < n; k++) {
    const u = (k / (n - 1)) * 2 - 1;
    const cx = u * W + (r() - 0.5) * 8;
    const cy = ht * (0.86 - 0.22 * u * u) + (r() - 0.5) * 8;
    const cz = (r() - 0.5) * W * 0.6;
    const rad = ht * (0.15 + r() * 0.05);
    const red = !rain && r() < 0.72;
    const col: RGB = red ? mixRGB([206, 72, 38], [236, 120, 48], r()) : mixRGB([66, 108, 56], [92, 128, 64], r());
    out.push(...ellipsoid(add(b, [(lean * ht * 0.4 + cx) * s, cy * s, cz * s]), [rad * s, rad * 0.62 * s, rad * 0.8 * s], 6, 3, col));
  }
  const reach = W + ht * 0.25;
  sp = sprite(-reach + Math.min(0, lean * ht), baseY - ht * 1.12, reach * 2 + Math.abs(lean * ht), ht * 1.12 + 14, (g) => renderPolys(g, cam, out));
  treeCache.set(key, sp);
  return sp;
}

// ── street lights ───────────────────────────────────────────────────────────
let blrLamp: { sp: Sprite; head: { x: number; y: number } } | null = null;
export function blrLampSprite(y: number) {
  if (!blrLamp) {
    const cam = camAt(0);
    const g0 = ground(cam, 0, y + 22);
    const s = g0.s, b = g0.p;
    const B = boxer(b, s);
    const steel: RGB = [112, 118, 124];
    const ps = [
      ...cylinder(b, add(b, [0, 2 * s, 0]), 2.6 * s, 2.2 * s, 6, [90, 94, 98]),
      ...cylinder(add(b, [0, 2 * s, 0]), add(b, [0, 34 * s, 0]), 1.1 * s, 0.8 * s, 5, steel, undefined, { top: false }),
      ...boxBetween(add(b, [0, 33 * s, 0]), add(b, [9 * s, 35 * s, 0]), [0, 0, 1], 1 * s, 1 * s, steel),
      ...B(5, 33.5, -1.8, 12, 35.5, 1.8, [70, 74, 80]),
      ...B(6, 33, -1.4, 11, 33.5, 1.4, [250, 236, 190], { emissive: 0.6 }),
    ];
    const hd = project(cam, add(b, [8.5 * s, 33 * s, 0]));
    blrLamp = { sp: sprite(-8, y - 18, 26, 46, (g) => renderPolys(g, cam, ps)), head: { x: hd.x, y: hd.y } };
  }
  return blrLamp;
}

export function blrGlow(g: CanvasRenderingContext2D, f: LiveFrame, view: ViewRect) {
  const L = f.lamps;
  const ls = blrLampSprite(L.y);
  for (let i = 0; i < Math.min(L.count, L.lit); i++) {
    const x = L.x0 + i * L.dx + ls.head.x, y = ls.head.y;
    if (x < view.x - 30 || x > view.x + view.w + 30) continue;
    g.globalCompositeOperation = "lighter";
    const gr = g.createRadialGradient(x, y + 2, 0, x, y + 2, 18);
    gr.addColorStop(0, "rgba(255,236,170,0.55)");
    gr.addColorStop(1, "rgba(255,210,120,0)");
    g.fillStyle = gr;
    g.fillRect(x - 20, y - 16, 40, 40);
    g.fillStyle = "rgba(255,226,150,0.14)";
    g.beginPath();
    g.ellipse(x, L.y + 24, 13, 3, 0, 0, Math.PI * 2);
    g.fill();
    g.globalCompositeOperation = "source-over";
    g.fillStyle = "#fff4cc";
    g.fillRect(x - 2.5, y - 0.6, 5, 1.6);
  }
}

// ── street sign ─────────────────────────────────────────────────────────────
let blrSign: { sp: Sprite; text: { x: number; y: number } } | null = null;
export function blrSignSprite(sy: number) {
  if (!blrSign) {
    const cam = camAt(0);
    const g0 = ground(cam, 0, sy + 40);
    const s = g0.s, b = g0.p;
    const B = boxer(b, s);
    const steel: RGB = [120, 126, 132];
    const ps = [
      ...cylinder(add(b, [-24 * s, 0, -2 * s]), add(b, [-24 * s, 52 * s, -2 * s]), 1.3 * s, 1.1 * s, 5, steel),
      ...cylinder(add(b, [24 * s, 0, -2 * s]), add(b, [24 * s, 52 * s, -2 * s]), 1.3 * s, 1.1 * s, 5, steel),
      ...B(-31, 37, -3.2, 31, 53, -1.4, [226, 230, 226]),
      ...B(-29.5, 38.5, -3.6, 29.5, 51.5, -3.2, [34, 108, 66]),
    ];
    const c = project(cam, add(b, [0, 45 * s, -3.6 * s]));
    blrSign = { sp: sprite(-36, sy - 20, 72, 64, (g) => renderPolys(g, cam, ps)), text: { x: c.x, y: c.y } };
  }
  return blrSign;
}

// ── city buildings (one per place) ──────────────────────────────────────────
const BOARDS: RGB[] = [[34, 52, 86], [118, 40, 36], [52, 74, 60], [70, 48, 30]];
const blrPlaceCache = new Map<string, PlaceSprite>();
export function blrPlaceSprite(p: LivePlace): PlaceSprite {
  const b = p.building;
  const key = `${p.variant}|${b.w}|${b.wallH}|${b.roofH}|${b.baseY}|${b.doorX - b.x}`;
  const hit = blrPlaceCache.get(key);
  if (hit) return hit;
  const v = p.variant % 4;
  const cam = camAt(b.w / 2);
  const g0 = ground(cam, 0, b.baseY);
  const s = g0.s;
  const B = boxer(g0.p, s);
  const w = b.w, D = 64, door = b.doorX - b.x;
  const right = w - door > door;
  const cA = right ? 8 : door + 18, cB = right ? door - 18 : w - 8;
  const out: Poly[] = [];
  const P = (lx: number, ly: number, lz: number): V3 => add(g0.p, [lx * s, ly * s, lz * s]);
  /** Striped awning sloping out from the wall. */
  const awning = (x0: number, x1: number, yWall: number, yOut: number, out_: number, a: RGB, c: RGB) => {
    const n = Math.max(4, Math.round((x1 - x0) / 10));
    for (let i = 0; i < n; i++) {
      const u0 = x0 + ((x1 - x0) * i) / n, u1 = x0 + ((x1 - x0) * (i + 1)) / n;
      const q = poly([P(u0, yOut, -out_), P(u1, yOut, -out_), P(u1, yWall, -0.5), P(u0, yWall, -0.5)], i % 2 ? c : a, { double: true });
      if (q.n[1] < 0) q.n = [-q.n[0], -q.n[1], -q.n[2]];
      out.push(q);
    }
    out.push(...B(x0, yOut - 3, -out_ - 0.6, x1, yOut, -out_, a));
  };
  let roofTop: number;
  let steam: V3 | null = null;
  if (v === 0) {
    // Glass office.
    const H = b.wallH + b.roofH * 0.8;
    out.push(...B(-3, 0, -3, w + 3, 5, D, [128, 126, 120]));
    out.push(...B(2, 5, 0, w - 2, H, D, [86, 126, 160], { tex: glass(9, 6) }));
    for (let i = 1; i < 5; i++) out.push(...B((w * i) / 5 - 1, 5, -1.2, (w * i) / 5 + 1, H, 0, [176, 182, 186]));
    out.push(...B(0, H - 6, -1.6, w, H, D, [156, 162, 166]));
    out.push(...B(4, H, 4, w - 4, H + 3, D - 4, [132, 132, 130]));
    out.push(...B(door - 12, 5, -1.4, door + 12, 30, -1.2, [40, 52, 64], { flat: true }));
    out.push(...B(door - 20, 30, -16, door + 20, 33, 0, [188, 190, 192]));
    for (const sx of [-18, 18]) out.push(...B(door + sx - 0.8, 0, -15, door + sx + 0.8, 30, -13.4, [120, 124, 128]));
    out.push(...B(cA, 0, -12, Math.min(cB, cA + 30), 8, -2, [92, 88, 82]));
    out.push(...B(cA + 1, 8, -11, Math.min(cB, cA + 30) - 1, 13, -3, [70, 112, 58], { tex: speckle(7, "rgba(150,190,100,0.6)", "rgba(30,60,30,0.5)", 12) }));
    roofTop = H + 3;
  } else if (v === 1) {
    // Darshini café: open front, steel counter, tea urns, awning.
    const H = b.wallH;
    out.push(...B(-3, 0, -3, w + 3, 4, D, [140, 132, 120]));
    out.push(...B(0, 4, 0, w, H, D, [224, 214, 182], { tex: speckle(5, "rgba(255,255,255,0.4)", "rgba(80,70,60,0.25)", 30) }));
    out.push(...B(-2, H, -2, w + 2, H + 5, D, [204, 194, 162]));
    out.push(...B(0, H - 4, -1, w, H, 0, [58, 118, 80]));
    out.push(...B(8, 4, -0.6, w - 8, 46, -0.2, [46, 38, 32], { flat: true }));
    for (let i = 0; i < 3; i++) {
      const wx = w * (0.2 + 0.3 * i);
      out.push(...B(wx - 11, 56, -1, wx + 11, 66, 0, [96, 100, 104]));
      out.push(...B(wx - 9.5, 57.5, -1.4, wx + 9.5, 64.5, -1, [50, 62, 70], { flat: true }));
    }
    awning(-4, w + 4, 52, 44, 18, [198, 92, 48], [232, 214, 178]);
    if (cB - cA > 24) {
      out.push(...B(cA, 0, -16, cB, 24, 0, [170, 178, 186], { tex: shutter }));
      out.push(...B(cA - 1.5, 24, -17, cB + 1.5, 26, 0.5, [206, 212, 218]));
      const ux = cA + 12;
      out.push(...cylinder(P(ux, 26, -8), P(ux, 38, -8), 4.6 * s, 4.2 * s, 7, [200, 204, 210]));
      out.push(...cylinder(P(ux, 38, -8), P(ux, 40, -8), 2 * s, 1 * s, 6, [120, 122, 126]));
      out.push(...cylinder(P(ux + 13, 26, -8), P(ux + 13, 33, -8), 3.4 * s, 3.4 * s, 7, [186, 190, 196]));
      for (let i = 0; i < 3; i++) out.push(...cylinder(P(ux + 24 + i * 6, 26, -10), P(ux + 24 + i * 6, 31, -10), 1.6 * s, 2 * s, 6, [176, 116, 64]));
      steam = P(ux, 41, -8);
    }
    roofTop = H + 5;
  } else if (v === 2) {
    // Brick co-working loft: steel-framed windows, rooftop water tank.
    const H = b.wallH + 12;
    out.push(...B(-3, 0, -3, w + 3, 4, D, [120, 112, 104]));
    out.push(...B(0, 4, 0, w, H, D, [156, 86, 62], { tex: brick(4, 10, 0.3) }));
    out.push(...B(-2, H - 3, -2, w + 2, H, D, [110, 72, 58]));
    const n = Math.max(2, Math.floor(w / 34));
    for (const [y0, y1, low] of [[10, 34, true], [44, 70, false]] as [number, number, boolean][]) {
      for (let i = 0; i < n; i++) {
        const cx = (w * (i + 0.5)) / n;
        if (low && Math.abs(cx - door) < 26) continue;
        out.push(...B(cx - 12, y0 - 1, -1, cx + 12, y1 + 1, 0, [42, 46, 50]));
        out.push(...B(cx - 11, y0, -1.4, cx + 11, y1, -1, [74, 104, 124], { tex: glass(7, 6) }));
        out.push(...B(cx - 0.6, y0, -1.8, cx + 0.6, y1, -1.4, [42, 46, 50]));
      }
    }
    out.push(...B(door - 12, 4, -1, door + 12, 33, 0, [42, 46, 50]));
    out.push(...B(door - 10.5, 4, -1.4, door + 10.5, 31.5, -1, [52, 44, 40], { tex: planks }));
    out.push(...cylinder(P(w - 22, H, 30), P(w - 22, H + 11, 30), 7 * s, 7 * s, 7, [40, 42, 46]));
    for (let i = 0; i < 3; i++) out.push(...B(10 + i * 14, H, 2, 18 + i * 14, H + 6, 8, [74, 116, 60], { tex: speckle(i + 3, "rgba(150,190,100,0.6)", "rgba(30,60,30,0.5)", 8) }));
    roofTop = H;
  } else {
    // Kiosk / corner shop: rolling shutter, striped awning, crates.
    const H = b.wallH - 10;
    out.push(...B(-3, 0, -3, w + 3, 4, D, [140, 132, 120]));
    out.push(...B(0, 4, 0, w, H, D, [98, 152, 150], { tex: speckle(9, "rgba(255,255,255,0.3)", "rgba(40,70,70,0.3)", 26) }));
    out.push(...B(-2, H, -2, w + 2, H + 4, D, [224, 218, 204]));
    out.push(...B(10, 4, -0.6, w - 10, 36, -0.2, [40, 34, 30], { flat: true }));
    out.push(...B(10, 36, -0.8, w - 10, 50, 0, [156, 162, 166], { tex: shutter }));
    const pal: RGB[] = [[210, 70, 60], [230, 190, 60], [70, 140, 200], [90, 170, 90]];
    for (let row = 0; row < 3; row++) for (let i = 0; i < Math.floor((w - 24) / 9); i++) {
      out.push(...B(14 + i * 9, 8 + row * 9, -1, 20 + i * 9, 14 + row * 9, -0.6, pal[(i + row * 3) % 4]!));
    }
    awning(-3, w + 3, 54, 46, 20, [204, 58, 52], [236, 230, 214]);
    if (cB - cA > 20) for (let i = 0; i < 2; i++) {
      const cx = cA + 6 + i * 20;
      out.push(...B(cx, 0, -18, cx + 16, 12 + i * 3, -4, [128, 98, 60], { tex: planks }));
      out.push(...B(cx + 1, 12 + i * 3, -17, cx + 15, 14 + i * 3, -5, i ? [230, 150, 40] : [120, 170, 60]));
    }
    roofTop = H + 4;
  }
  // Name board on the roof.
  const half = Math.min(w * 0.5, 64), zS = -6;
  const by0 = roofTop + 3, by1 = roofTop + 19, cx = w / 2;
  for (const sx of [-0.6, 0.6]) out.push(...B(cx + sx * half - 1.2, roofTop - 2, zS - 1, cx + sx * half + 1.2, by0, zS + 1, [70, 74, 80]));
  out.push(...B(cx - half - 2, by0 - 1.5, zS - 2, cx + half + 2, by1 + 1.5, zS, [48, 50, 56]));
  out.push(...B(cx - half, by0, zS - 2.6, cx + half, by1, zS - 2, BOARDS[v]!));
  const bc = project(cam, P(cx, (by0 + by1) / 2, zS - 2.6));
  const bl = project(cam, P(cx - half, (by0 + by1) / 2, zS - 2.6)), br = project(cam, P(cx + half, (by0 + by1) / 2, zS - 2.6));
  const ap = project(cam, P(cx, by1, zS));
  const top = b.baseY - by1 - 24;
  const sp = sprite(-34, top, w + 68, b.baseY + 16 - top, (g) => renderPolys(g, cam, out));
  const st = steam ? project(cam, steam) : null;
  const res: PlaceSprite = { sp, board: { x: bc.x, y: bc.y, w: br.x - bl.x }, apex: { x: ap.x, y: ap.y }, steam: st ? { x: st.x, y: st.y } : undefined };
  blrPlaceCache.set(key, res);
  return res;
}

/** Darshini steam: a few pixel puffs rising and fading. */
export function steamPuffs(g: CanvasRenderingContext2D, x: number, y: number, f: LiveFrame, px: number) {
  const t = f.reducedMotion ? 0.4 : f.t;
  for (let i = 0; i < 4; i++) {
    const u = (t * 0.6 + i / 4) % 1;
    const sx = x + Math.sin(u * 6 + i) * 2.5, sy = y - u * 20;
    const r = (1.6 + u * 3) ;
    g.fillStyle = `rgba(240,240,236,${0.5 * (1 - u)})`;
    g.fillRect(Math.round((sx - r) / px) * px, Math.round((sy - r) / px) * px, Math.max(px, Math.round((r * 2) / px) * px), Math.max(px, Math.round((r * 1.4) / px) * px));
  }
}

// ── per-frame: metro train, traffic, zebra crossing, kites ─────────────────
export function metroTrain(g: CanvasRenderingContext2D, f: LiveFrame, look: Look) {
  const cam = camAt(f.canoeX);
  const gr = ground(cam, f.canoeX, VIA_SY);
  const B = boxer(gr.p, gr.s);
  const ps: Poly[] = [];
  const L = 40, gap = 1.5, n = 4, x0 = -(n * L + (n - 1) * gap) / 2;
  const y0 = DECK_TOP + 2.2;
  for (let i = 0; i < n; i++) {
    const a = x0 + i * (L + gap), e = a + L;
    ps.push(...B(a + 3, DECK_TOP + 0.2, -3, e - 3, y0, 3, [46, 48, 52]));
    ps.push(...B(a, y0, -4.5, e, y0 + 11, 4.5, [204, 208, 214]));
    ps.push(...B(a + 2, y0 + 4.6, -4.9, e - 2, y0 + 9, -4.5, [40, 54, 72], { tex: pillars("rgba(204,208,214,0.95)", 7), emissive: 0.3 }));
    ps.push(...B(a, y0 + 1.4, -4.9, e, y0 + 3.2, -4.5, [132, 70, 182], { emissive: 0.35 }));
    ps.push(...B(a + 1, y0 + 11, -3.8, e - 1, y0 + 12.6, 3.8, [168, 172, 178]));
  }
  const end = x0 + n * L + (n - 1) * gap;
  ps.push(...B(x0 - 0.5, y0 + 4.6, -3.4, x0, y0 + 9.4, 3.4, [36, 44, 56]));
  ps.push(...B(end, y0 + 4.6, -3.4, end + 0.5, y0 + 9.4, 3.4, [36, 44, 56]));
  ps.push(...B(end, y0 + 1.6, -3, end + 0.6, y0 + 3, -1.4, [255, 240, 190], { emissive: 0.8 }));
  renderPolys(g, cam, ps, { ...look, fog: VIA_FOG });
}

interface Car { kind: "auto" | "bus"; lane: 0 | 1; sp: number; off: number }
const TRAFFIC: Car[] = [
  { kind: "auto", lane: 0, sp: 22, off: 60 },
  { kind: "auto", lane: 1, sp: 17, off: 520 },
  { kind: "bus", lane: 1, sp: 11, off: 140 },
  { kind: "auto", lane: 0, sp: 31, off: 980 },
  { kind: "auto", lane: 1, sp: 26, off: 1420 },
];
function autoPolys(B: ReturnType<typeof boxer>, s: number, o: V3, dir: number): Poly[] {
  const blk: RGB = [30, 30, 32], tyre: RGB = [26, 26, 28];
  const P = (lx: number, ly: number, lz: number): V3 => add(o, [lx * dir * s, ly * s, lz * s]);
  const wheel = (lx: number, lz: number) => cylinder(P(lx, 3, lz - 1.2), P(lx, 3, lz + 1.2), 3 * s, 3 * s, 6, tyre, undefined, { top: true, bottom: true });
  return [
    ...wheel(-8, -5.5), ...wheel(10, -0.6),
    ...B(-13, 3, -6, 7, 10, 6, [48, 128, 70]),
    ...B(-13, 10, -6, -6, 15, 6, [228, 192, 44]),
    ...B(7, 3, -3.6, 13, 15, 3.6, [228, 192, 44]),
    ...B(8, 15, -4.5, 9.2, 19.5, 4.5, [130, 160, 170]),
    ...B(-14, 19.5, -6.5, 10, 22.5, 6.5, blk),
    ...B(-14.6, 11, -6.5, -13, 22.5, 6.5, blk),
    ...B(7.6, 10, -6, 8.6, 19.5, -5, blk),
    ...B(13, 10.5, -1, 13.7, 12.8, 1, [255, 240, 190], { emissive: 0.6 }),
  ];
}
function busPolys(B: ReturnType<typeof boxer>, s: number, o: V3, dir: number): Poly[] {
  const P = (lx: number, ly: number, lz: number): V3 => add(o, [lx * dir * s, ly * s, lz * s]);
  const wheel = (lx: number) => cylinder(P(lx, 4, -8), P(lx, 4, -5.5), 4 * s, 4 * s, 7, [26, 26, 28], undefined, { top: true, bottom: true });
  return [
    ...wheel(-24), ...wheel(24),
    ...B(-34, 4, -7, 34, 13, 7, [56, 136, 112]),
    ...B(-34, 13, -7, 34, 22, 7, [50, 64, 74], { tex: pillars("rgba(220,224,214,0.95)", 9) }),
    ...B(-34, 22, -7, 34, 27, 7, [214, 216, 206]),
    ...B(33, 22.5, -5, 34.6, 26, 5, [240, 170, 60], { emissive: 0.5 }),
    ...B(34, 6, -6, 34.6, 8, -4, [255, 240, 190], { emissive: 0.6 }),
  ];
}
export function traffic(g: CanvasRenderingContext2D, f: LiveFrame, view: ViewRect, look: Look) {
  const t = f.reducedMotion ? 0 : f.t;
  const span = f.worldW + 400;
  for (const c of TRAFFIC) {
    const lane = LANES[c.lane]!;
    const x = ((((c.off + lane.dir * c.sp * t) % span) + span) % span) - 200;
    const half = c.kind === "bus" ? 40 : 18;
    if (x + half < view.x - 4 || x - half > view.x + view.w + 4) continue;
    const cam = camAt(x);
    const gr = ground(cam, x, lane.sy);
    const bob = c.kind === "auto" && !f.reducedMotion ? Math.abs(Math.sin(t * 9 + c.off)) * 0.4 * gr.s : 0;
    const o: V3 = add(gr.p, [0, bob, 0]);
    const Bo = boxer(o, gr.s, lane.dir);
    const r3 = new R3(cam, look);
    const sh = (lx: number, lz: number): V3 => add(gr.p, [lx * gr.s, 0.3, lz * gr.s]);
    r3.add([{ v: [sh(-half, -7), sh(half, -7), sh(half, 7), sh(-half, 7)], n: [0, 1, 0], c: [20, 20, 22], o: { alpha: 0.35, flat: true } }], -1);
    r3.add(c.kind === "bus" ? busPolys(Bo, gr.s, o, lane.dir) : autoPolys(Bo, gr.s, o, lane.dir));
    r3.render(g);
  }
}

/** Zebra crossing on the road near the village sign. */
export function zebra(g: CanvasRenderingContext2D, x: number, look: Look) {
  const cam = camAt(x);
  const ps: Poly[] = [];
  const n = 7;
  for (let i = 0; i < n; i++) {
    const a = ROAD_TOP + 2 + ((ROAD_BOT - ROAD_TOP - 4) * i) / n;
    const b = a + ((ROAD_BOT - ROAD_TOP - 4) / n) * 0.55;
    ps.push({ v: [ground(cam, x - 18, b).p, ground(cam, x + 18, b).p, ground(cam, x + 18, a).p, ground(cam, x - 18, a).p], n: [0, 1, 0], c: [224, 222, 212] });
  }
  renderPolys(g, cam, ps, look);
}

/** Paper kites over the city, bobbing on their strings. */
export function kites(g: CanvasRenderingContext2D, f: LiveFrame, view: ViewRect, px: number) {
  const t = f.reducedMotion ? 0 : f.t;
  const S = (v: number) => Math.round(v / px) * px;
  for (let tx = Math.floor(view.x / TILE) * TILE; tx < view.x + view.w; tx += TILE) {
    for (const [kx, ky, col] of [[150, 58, "#d4507a"], [430, 84, "#e8962f"]] as [number, number, string][]) {
      const x = tx + kx + Math.sin(t * 0.5 + kx) * 6, y = ky + Math.sin(t * 1.3 + kx) * 3;
      g.strokeStyle = "rgba(240,240,240,0.45)";
      g.lineWidth = px * 0.6;
      g.beginPath();
      g.moveTo(S(x), S(y + 8));
      g.quadraticCurveTo(x + 30, y + 60, x + 70, y + 110);
      g.stroke();
      g.fillStyle = col;
      g.beginPath();
      g.moveTo(S(x), S(y - 8)); g.lineTo(S(x + 6), S(y)); g.lineTo(S(x), S(y + 9)); g.lineTo(S(x - 6), S(y));
      g.fill();
      g.fillStyle = "rgba(255,255,255,0.35)";
      g.beginPath();
      g.moveTo(S(x), S(y - 8)); g.lineTo(S(x + 6), S(y)); g.lineTo(S(x), S(y));
      g.fill();
      g.fillStyle = col;
      for (let k = 0; k < 3; k++) g.fillRect(S(x - 1 + Math.sin(t * 3 + k) * 1.5), S(y + 10 + k * 3.5), Math.max(px, 2), Math.max(px, 2));
    }
  }
}

// ── subagent companions: tether, puffs, sparkles (low-res buffer), icons + labels (crisp) ──
const snapPx = (v: number, px: number) => Math.round(v / px) * px;

/** A sagging dotted pixel tether from the parent to a companion out on an errand; fades with `away`. */
export function compTether(g: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, away: number, alpha: number, px: number) {
  const a = Math.min(1, away * 1.4) * 0.65 * alpha;
  if (a < 0.03) return;
  const d = Math.abs(x1 - x0);
  const n = Math.max(4, Math.round(d / (px * 2.2)));
  const sag = 4 + d * 0.06;
  g.fillStyle = `rgba(150,245,228,${a})`;
  for (let i = 0; i <= n; i++) {
    const u = i / n;
    const x = x0 + (x1 - x0) * u;
    const y = y0 + (y1 - y0) * u + Math.sin(u * Math.PI) * sag;
    g.fillRect(snapPx(x, px), snapPx(y, px), px, px);
  }
}

/** Little grey work puffs rising from a busy companion's hands. */
export function compPuffs(g: CanvasRenderingContext2D, x: number, y: number, t: number, seed: number, alpha: number, px: number) {
  for (let i = 0; i < 3; i++) {
    const u = (t * 0.9 + i / 3 + seed) % 1;
    const sx = x + Math.sin(u * 5 + i * 2 + seed * 9) * 3, sy = y - u * 12;
    const r = 1 + u * 2;
    g.fillStyle = `rgba(232,232,226,${0.6 * (1 - u) * alpha})`;
    g.fillRect(snapPx(sx - r, px), snapPx(sy - r, px), Math.max(px, snapPx(r * 2, px)), Math.max(px, snapPx(r * 1.5, px)));
  }
}

/** A pixel-star burst (hand-over at the parent, or a leaving companion's ✨). k: 0..1 strength. */
export function compSparkle(g: CanvasRenderingContext2D, x: number, y: number, k: number, t: number, px: number, col = "255,224,120") {
  if (k <= 0.01) return;
  const spread = 4 + (1 - k) * 10;
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + t * 1.5;
    const sx = x + Math.cos(a) * spread, sy = y + Math.sin(a) * spread * 0.8;
    const r = (i % 2 ? 1 : 1.6) * (0.6 + k);
    g.fillStyle = `rgba(${col},${Math.min(1, k * 1.3)})`;
    g.fillRect(snapPx(sx - r, px), snapPx(sy - px / 2, px), Math.max(px, snapPx(r * 2, px)), px);
    g.fillRect(snapPx(sx - px / 2, px), snapPx(sy - r, px), px, Math.max(px, snapPx(r * 2, px)));
  }
  g.fillStyle = `rgba(255,255,240,${k})`;
  g.fillRect(snapPx(x - px, px), snapPx(y - px, px), px * 2, px * 2);
}

const EMOJI_FONT = `10px "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif`;
const HUD_FONT = "bold 7px Verdana, Tahoma, sans-serif";

/**
 * A tiny game-HUD icon chip above a companion's head (crisp, main canvas).
 * kind "icon": the activity emoji in a bevelled chip; "wait": a white "?" bubble; "error": a red "!" chip.
 */
export function compBadge(ctx: CanvasRenderingContext2D, x: number, y: number, kind: "icon" | "wait" | "error", icon: string, alpha: number, pulse: number) {
  ctx.globalAlpha = alpha;
  const w = 13, h = 12, bx = x - w / 2, by = y - h;
  if (kind === "wait") {
    ctx.fillStyle = "rgba(245,247,255,0.95)";
    ctx.beginPath();
    ctx.ellipse(x, by + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(x - 2, by + h - 1); ctx.lineTo(x + 1, by + h + 3); ctx.lineTo(x + 1.5, by + h - 1.5);
    ctx.fill();
    ctx.strokeStyle = "rgba(12,18,40,0.7)";
    ctx.lineWidth = 0.6;
    ctx.beginPath();
    ctx.ellipse(x, by + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = "#1a2350";
    ctx.font = HUD_FONT;
    ctx.textAlign = "center";
    ctx.fillText("?", x, by + h - 2.2);
  } else {
    const err = kind === "error";
    ctx.fillStyle = err ? `rgba(${200 + 55 * pulse},50,44,0.95)` : "rgba(12,18,40,0.82)";
    ctx.fillRect(bx, by, w, h);
    ctx.fillStyle = "rgba(255,255,255,0.35)";
    ctx.fillRect(bx, by, w, 0.6);
    ctx.fillRect(bx, by, 0.6, h);
    ctx.fillStyle = "rgba(0,0,0,0.55)";
    ctx.fillRect(bx, by + h - 0.6, w, 0.6);
    ctx.fillRect(bx + w - 0.6, by, 0.6, h);
    ctx.strokeStyle = err ? "#ffd2cc" : "rgba(94,234,212,0.8)";
    ctx.lineWidth = 0.6;
    ctx.strokeRect(bx - 0.3, by - 0.3, w + 0.6, h + 0.6);
    ctx.textAlign = "center";
    if (err) {
      ctx.fillStyle = "#fff";
      ctx.font = HUD_FONT;
      ctx.fillText("!", x, by + h - 2.2);
    } else {
      ctx.font = EMOJI_FONT;
      ctx.textBaseline = "middle";
      ctx.fillText(icon, x, by + h / 2 + 0.5);
      ctx.textBaseline = "alphabetic";
    }
    ctx.fillStyle = err ? "rgba(200,50,44,0.95)" : "rgba(12,18,40,0.82)";
    ctx.beginPath();
    ctx.moveTo(x - 1.8, by + h); ctx.lineTo(x + 1.8, by + h); ctx.lineTo(x, by + h + 2.2);
    ctx.fill();
  }
  ctx.textAlign = "left";
  ctx.globalAlpha = 1;
}

const LABEL_FONT = "bold 5.5px Verdana, Tahoma, sans-serif";

/**
 * A tiny companion caption under its feet (crisp). `taken` holds rects already used this
 * frame; the caption steps down to avoid them and is skipped if it still collides.
 */
export function compLabel(ctx: CanvasRenderingContext2D, x: number, y: number, text: string, alpha: number, taken: { x: number; y: number; w: number; h: number }[]) {
  ctx.font = LABEL_FONT;
  const w = ctx.measureText(text).width + 5, h = 7.5;
  let ry = y + 2;
  const hit = (yy: number) => taken.some((r) => x - w / 2 < r.x + r.w && x + w / 2 > r.x && yy < r.y + r.h && yy + h > r.y);
  for (let i = 0; i < 3 && hit(ry); i++) ry += h + 0.5;
  if (hit(ry)) return;
  taken.push({ x: x - w / 2, y: ry, w, h });
  ctx.globalAlpha = alpha;
  ctx.fillStyle = "rgba(12,18,40,0.72)";
  ctx.fillRect(x - w / 2, ry, w, h);
  ctx.fillStyle = "rgba(94,234,212,0.85)";
  ctx.fillRect(x - w / 2, ry, 1.2, h);
  ctx.fillStyle = "#dff9f3";
  ctx.textAlign = "center";
  ctx.fillText(text, x + 0.6, ry + 5.6);
  ctx.textAlign = "left";
  ctx.globalAlpha = 1;
}
