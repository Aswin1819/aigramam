/**
 * PS2, live village version. Same look as the Style-lab prototype
 * (protos/ps2.ts): flat-shaded low-poly meshes from mini3d, faked brick/tile
 * textures, fog, snapped (wobbly) vertices, all drawn into a low-res buffer
 * (~200 px tall) and upscaled soft-then-hard, with a crisp game HUD on top.
 *
 * Generalised for the live world:
 * - Every object is seen by its own front-on camera (camera x = object x), so
 *   static things are cached once as sprites (per place / palm / lamp) and
 *   simply placed at their world x. Panning never re-renders scenery.
 * - Sky, hills, water and ground are one 640-unit tile built from
 *   screen-space columns, so it repeats seamlessly across any world width.
 * - Villagers and the canoe are rendered each frame (≈45 faces each).
 */
import { hash, poseOf, rng, type Pose, type VillagerFrame } from "../scene";
import {
  R3, add, box, boxBetween, cylinder, desat, ground, hex, madd, makeCamera, mixRGB, mul, norm, obox, poly, project, rgba, rig, sub,
  type Camera, type Look, type Poly, type RGB, type Tex, type V3,
} from "../protos/mini3d";
import { asVillagerFrame } from "./reference";
import { GROUND, LIVE_STATUS_COLOR, WORLD_H, type LiveFrame, type LivePlace, type LiveStyle, type LiveVillager, type ViewRect } from "./types";

const TILE = 640;
/** Low-res buffer height in pixels (the "console" resolution). */
const BH = 240;
/** Sprite resolution (pixels per world unit) for cached scenery. */
const SPR = 1.5;

const BASE = makeCamera({ fov: 40, horizonY: GROUND.waterTop, height: 170 });
/** The front-on camera that looks straight at world x. */
const camAt = (x: number): Camera => ({ ...BASE, pos: [x, BASE.pos[1], BASE.pos[2]], cx: x });

const FOG: RGB = [158, 166, 168];
const LOOK: Look = {
  light: norm([-0.45, 0.75, -0.55]),
  lightColor: [0.72, 0.66, 0.56],
  ambient: [0.46, 0.47, 0.52],
  fog: { color: FOG, near: 420, k: 0.2, max: 0.82 },
  snap: 1 / SPR,
  seam: 0.9,
};
const mute = (s: string, k = 0.3): RGB => desat(hex(s), k);

// ── textures (screen space, clipped to the face) ────────────────────────────
function bbox(pts: number[]) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (let i = 0; i < pts.length; i += 2) {
    x0 = Math.min(x0, pts[i]); x1 = Math.max(x1, pts[i]);
    y0 = Math.min(y0, pts[i + 1]); y1 = Math.max(y1, pts[i + 1]);
  }
  return { x0, y0, x1, y1 };
}
const brick = (row: number, col: number, alpha = 0.32): Tex => (ctx, pts, fog) => {
  const b = bbox(pts);
  ctx.fillStyle = `rgba(52,26,16,${alpha * (1 - fog)})`;
  let k = 0;
  for (let y = Math.floor(b.y0 / row) * row; y < b.y1; y += row, k++) {
    ctx.fillRect(b.x0, y, b.x1 - b.x0, 1);
    for (let x = b.x0 + ((k % 2) * col) / 2; x < b.x1; x += col) ctx.fillRect(x, y, 1, row);
  }
};
const tiles = (alpha = 0.4): Tex => (ctx, pts, fog) => {
  const b = bbox(pts);
  ctx.fillStyle = `rgba(40,14,8,${alpha * (1 - fog)})`;
  for (let y = b.y0; y < b.y1; y += 4) ctx.fillRect(b.x0, y, b.x1 - b.x0, 1);
  for (let x = b.x0; x < b.x1; x += 6) ctx.fillRect(x, b.y0, 0.8, b.y1 - b.y0);
};
const planks: Tex = (ctx, pts, fog) => {
  const b = bbox(pts);
  ctx.fillStyle = `rgba(30,18,10,${0.35 * (1 - fog)})`;
  for (let x = b.x0; x < b.x1; x += 5) ctx.fillRect(x, b.y0, 0.8, b.y1 - b.y0);
};
const thatch: Tex = (ctx, pts, fog) => {
  const b = bbox(pts);
  ctx.fillStyle = `rgba(60,40,10,${0.35 * (1 - fog)})`;
  for (let y = b.y0; y < b.y1; y += 3) for (let x = b.x0 + (y % 6); x < b.x1; x += 4) ctx.fillRect(x, y, 0.8, 2.4);
};
const speckle = (seed: number, light: string, dark: string, n = 6): Tex => (ctx, pts) => {
  const b = bbox(pts);
  const r = rng(seed);
  for (let i = 0; i < n; i++) {
    ctx.fillStyle = i % 2 ? light : dark;
    ctx.fillRect(b.x0 + r() * (b.x1 - b.x0), b.y0 + r() * (b.y1 - b.y0), 2, 2);
  }
};

// ── sprites ─────────────────────────────────────────────────────────────────
interface Sprite { c: HTMLCanvasElement; x: number; y: number; w: number; h: number }
/** Renders `draw` (world units) for the world rect (x, y, w, h) into a cached canvas. */
function sprite(x: number, y: number, w: number, h: number, draw: (g: CanvasRenderingContext2D) => void, ppu = SPR): Sprite {
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.ceil(w * ppu));
  c.height = Math.max(1, Math.ceil(h * ppu));
  const g = c.getContext("2d")!;
  g.setTransform(ppu, 0, 0, ppu, -x * ppu, -y * ppu);
  draw(g);
  return { c, x, y, w, h };
}
const put = (g: CanvasRenderingContext2D, s: Sprite, dx: number) => g.drawImage(s.c, s.x + dx, s.y, s.w, s.h);

function renderPolys(g: CanvasRenderingContext2D, cam: Camera, ps: Poly[], look: Look = LOOK) {
  const r3 = new R3(cam, look);
  r3.add(ps);
  r3.render(g);
}

// Palm at local x = 0 (front-on camera there).
function palmPolys(cam: Camera, baseY: number, h: number, lean: number, seed: number, segs = 4, fronds = 7): Poly[] {
  const g = ground(cam, 0, baseY);
  const s = g.s;
  const out: Poly[] = [];
  const trunk: RGB = [118, 100, 80];
  const P = (t: number): V3 => add(g.p, [lean * h * s * t * t, h * s * t, 0]);
  for (let i = 0; i < segs; i++) out.push(...cylinder(P(i / segs), P((i + 1) / segs), (3.4 - i * 0.35) * s, (3.4 - (i + 1) * 0.35) * s, 5, mixRGB(trunk, [90, 76, 60], (i % 2) * 0.5), undefined, { top: false }));
  const top = P(1);
  const L = h * 0.36 * s;
  for (let k = 0; k < fronds; k++) {
    const a = (k / fronds) * Math.PI * 2 + seed;
    const dir: V3 = [Math.cos(a), 0, Math.sin(a) * 0.85];
    const sd = norm([-dir[2], 0, dir[0]]);
    const col: RGB = mixRGB([64, 104, 58], [96, 122, 62], hash(seed * 9 + k));
    const node = (u: number): V3 => madd(madd(top, dir, L * u), [0, 1, 0], L * (0.32 * Math.sin(Math.PI * u * 0.9) - 0.6 * u * u));
    const wid = (u: number) => L * 0.15 * Math.sin(Math.PI * (0.12 + 0.88 * u)) + L * 0.02;
    for (let i = 0; i < 3; i++) {
      const u0 = i / 3, u1 = (i + 1) / 3;
      const a0 = node(u0), a1 = node(u1);
      out.push(poly([madd(a0, sd, -wid(u0)), madd(a0, sd, wid(u0)), madd(a1, sd, wid(u1)), madd(a1, sd, -wid(u1))], col, { double: true }));
    }
    out.push(poly([madd(node(1), sd, -wid(1)), madd(node(1), sd, wid(1)), node(1.12)], col, { double: true }));
  }
  for (let k = 0; k < 3; k++) {
    const a = k * 2.1 + seed;
    const c = add(top, [Math.cos(a) * 2.6 * s, -3 * s, Math.sin(a) * 2.6 * s]);
    out.push(...box(add(c, [-1.6 * s, -1.6 * s, -1.6 * s]), add(c, [1.6 * s, 1.6 * s, 1.6 * s]), [92, 70, 40]));
  }
  return out;
}

const palmCache = new Map<string, Sprite>();
function palmSprite(baseY: number, h: number, lean: number): Sprite {
  const key = `${baseY}|${h.toFixed(1)}|${lean.toFixed(3)}`;
  let sp = palmCache.get(key);
  if (!sp) {
    const cam = camAt(0);
    const seed = hash(baseY * 3.1 + h) * 6;
    const ps = palmPolys(cam, baseY, h, lean, seed);
    const reach = h * 0.55;
    sp = sprite(-reach + Math.min(0, lean * h), baseY - h * 1.25, reach * 2 + Math.abs(lean * h), h * 1.25 + 14, (g) => renderPolys(g, cam, ps));
    palmCache.set(key, sp);
  }
  return sp;
}

let farPalm: Sprite | null = null;
function farPalmSprite() {
  if (!farPalm) {
    const cam = camAt(0);
    const ps = palmPolys(cam, 155, 34, 0.05, 1.3, 2, 5);
    farPalm = sprite(-24, 110, 48, 48, (g) => renderPolys(g, cam, ps), 1);
  }
  return farPalm;
}

let lampSp: { sp: Sprite; topY: number } | null = null;
function lampSprite(y: number) {
  if (!lampSp) {
    const cam = camAt(0);
    const g0 = ground(cam, 0, y + 22);
    const s = g0.s, b = g0.p;
    const brass: RGB = [182, 146, 74];
    const ps = [
      ...cylinder(b, add(b, [0, 3 * s, 0]), 6 * s, 3.5 * s, 6, brass),
      ...cylinder(add(b, [0, 3 * s, 0]), add(b, [0, 19 * s, 0]), 1.3 * s, 1.1 * s, 5, brass, undefined, { top: false }),
      ...cylinder(add(b, [0, 10 * s, 0]), add(b, [0, 12 * s, 0]), 2.4 * s, 2.4 * s, 5, brass),
      ...cylinder(add(b, [0, 19 * s, 0]), add(b, [0, 22 * s, 0]), 1.5 * s, 5.5 * s, 6, brass),
    ];
    const top = project(cam, add(b, [0, 22 * s, 0]));
    lampSp = { sp: sprite(-10, y - 6, 20, 34, (g) => renderPolys(g, cam, ps)), topY: top.y };
  }
  return lampSp;
}

let signSp: { sp: Sprite; text: { x: number; y: number } } | null = null;
function signSprite(sy: number) {
  if (!signSp) {
    const cam = camAt(0);
    const g0 = ground(cam, 0, sy + 40);
    const s = g0.s, b = g0.p;
    const ps = [
      ...box(add(b, [-1.6 * s, 0, -1.6 * s]), add(b, [1.6 * s, 40 * s, 1.6 * s]), [110, 80, 52], { tex: planks }),
      ...box(add(b, [-31 * s, 37 * s, -3.2 * s]), add(b, [31 * s, 53 * s, -1.4 * s]), [70, 52, 36]),
      ...box(add(b, [-29 * s, 38.5 * s, -3.6 * s]), add(b, [29 * s, 51.5 * s, -3.2 * s]), [214, 196, 150]),
    ];
    const c = project(cam, add(b, [0, 45 * s, -3.6 * s]));
    signSp = { sp: sprite(-36, sy - 20, 72, 64, (g) => renderPolys(g, cam, ps)), text: { x: c.x, y: c.y } };
  }
  return signSp;
}

// ── places ──────────────────────────────────────────────────────────────────
const VARIANTS = [
  { wall: "#b8704e", wallTex: brick(4, 10), roof: "#a2533a", roofTex: tiles(), board: [58, 74, 60] as RGB },
  { wall: "#d6cfbb", wallTex: speckle(5, "rgba(255,255,255,0.4)", "rgba(80,70,60,0.25)", 30), roof: "#5f5a62", roofTex: tiles(0.5), board: [110, 40, 36] as RGB },
  { wall: "#7f9db0", wallTex: brick(5, 14, 0.2), roof: "#9a4a34", roofTex: tiles(), board: [40, 52, 80] as RGB },
  { wall: "#8c6440", wallTex: planks, roof: "#9a8150", roofTex: thatch, board: [60, 44, 28] as RGB },
];
interface PlaceSprite { sp: Sprite; board: { x: number; y: number; w: number }; apex: { x: number; y: number } }
const placeCache = new Map<string, PlaceSprite>();

/** Builds a place's building at local x (building left = 0), seen by a camera at its centre. */
function placeSprite(p: LivePlace): PlaceSprite {
  const b = p.building;
  const key = `${p.variant}|${b.w}|${b.wallH}|${b.roofH}|${b.baseY}|${b.doorX - b.x}`;
  const hit = placeCache.get(key);
  if (hit) return hit;
  const V = VARIANTS[p.variant % 4]!;
  const cam = camAt(b.w / 2);
  const g0 = ground(cam, 0, b.baseY), g1 = ground(cam, b.w, b.baseY);
  const s = g0.s, z0 = g0.p[2], x0 = g0.p[0], x1 = g1.p[0];
  const D = 64 * s, h = b.wallH * s;
  const X = (lx: number) => x0 + lx * s;
  const out: Poly[] = [];
  out.push(...box([x0, 0, z0], [x1, h, z0 + D], mute(V.wall, 0.35), { tex: V.wallTex }));
  out.push(...box([x0 - 3 * s, 0, z0 - 3 * s], [x1 + 3 * s, 5 * s, z0 + D], [120, 112, 100], { tex: brick(3, 14, 0.25) }));
  const door = b.doorX - b.x;
  const dX0 = X(door - 12), dX1 = X(door + 12), dTop = (b.wallH - 22) * s;
  out.push(...box([dX0 - 2 * s, 5 * s, z0 - 1.2 * s], [dX1 + 2 * s, dTop + 2 * s, z0 - 0.2 * s], [96, 66, 40], { tex: planks }));
  out.push(...box([dX0, 5 * s, z0 - 1.6 * s], [dX1, dTop, z0 - 1.2 * s], [36, 28, 24], { flat: true }));
  // Window on the wider side of the door.
  const right = b.w - door > door;
  const wA = right ? door + 22 : 10, wB = right ? Math.min(b.w - 8, door + 50) : Math.max(18, door - 22);
  if (wB - wA > 14) {
    const wX0 = X(wA), wX1 = X(wB);
    out.push(...box([wX0 - 2 * s, 30 * s, z0 - 1 * s], [wX1 + 2 * s, 50 * s, z0 - 0.2 * s], [96, 66, 40]));
    out.push(...box([wX0, 32 * s, z0 - 1.4 * s], [wX1, 48 * s, z0 - 1 * s], [44, 36, 30], { flat: true }));
    for (let i = 1; i < 3; i++) out.push(...box([wX0 + ((wX1 - wX0) * i) / 3 - 1 * s, 32 * s, z0 - 2.2 * s], [wX0 + ((wX1 - wX0) * i) / 3 + 1 * s, 48 * s, z0 - 1.4 * s], [110, 78, 48]));
  }
  // Counter with tea glasses on the other side (variant 0 and 2 are tea shops; others get crates).
  const cA = right ? 6 : door + 16, cB = right ? door - 16 : b.w - 6;
  if (cB - cA > 20) {
    const cH = 24 * s;
    if (p.variant % 2 === 0) {
      out.push(...box([X(cA), 0, z0 - 16 * s], [X(cB), cH, z0], [122, 86, 54], { tex: planks }));
      out.push(...box([X(cA) - 1.5 * s, cH, z0 - 17 * s], [X(cB) + 1.5 * s, cH + 2 * s, z0 + 0.5 * s], [150, 112, 70]));
      for (let i = 0; i < 3; i++) {
        const gb: V3 = [X(cA + 10 + i * 12), cH + 2 * s, z0 - 8 * s];
        out.push(...cylinder(gb, add(gb, [0, 7 * s, 0]), 2 * s, 2.5 * s, 6, [176, 116, 64]));
      }
    } else {
      for (let i = 0; i < 2; i++) {
        const cx = X(cA + 8 + i * 22);
        out.push(...box([cx, 0, z0 - 18 * s], [cx + 16 * s, (14 + i * 4) * s, z0 - 4 * s], [128, 98, 60], { tex: planks }));
      }
    }
  }
  // Posts and gable roof.
  const zF = z0 - 12 * s, eave = h - 4 * s;
  for (const px of [x0 - 8 * s, x1 + 8 * s]) out.push(...box([px - 2 * s, 0, zF - 2 * s], [px + 2 * s, eave, zF + 2 * s], [104, 74, 46], { tex: planks }));
  const eL = x0 - 14 * s, eR = x1 + 14 * s, apexX = (x0 + x1) / 2, apexY = h + b.roofH * s;
  const zB = z0 + D + 10 * s;
  const roof = mute(V.roof, 0.3);
  const slope = (ex: number) => {
    const q = poly([[ex, eave, zF], [apexX, apexY, zF], [apexX, apexY, zB], [ex, eave, zB]], roof, { tex: V.roofTex, double: true });
    if (q.n[1] < 0) q.n = mul(q.n, -1);
    return q;
  };
  out.push(slope(eL), slope(eR));
  out.push(poly([[eL + 4 * s, eave + 1 * s, zF + 0.6 * s], [eR - 4 * s, eave + 1 * s, zF + 0.6 * s], [apexX, apexY - 3 * s, zF + 0.6 * s]], [176, 150, 112], { tex: planks }, [0, 0, -1]));
  out.push(...boxBetween([eL, eave, zF - 0.8 * s], [apexX, apexY, zF - 0.8 * s], [0, 0, 1], 3 * s, 2 * s, [92, 60, 38]));
  out.push(...boxBetween([apexX, apexY, zF - 0.8 * s], [eR, eave, zF - 0.8 * s], [0, 0, 1], 3 * s, 2 * s, [92, 60, 38]));

  // Name board standing on the ridge (rooftop signage), clear of the nameplates below.
  const half = Math.min(b.w * 0.5, 64) * s, zS = zF + 6 * s;
  const by0 = apexY + 3 * s, by1 = apexY + 19 * s;
  for (const sx of [-0.6, 0.6]) out.push(...box([apexX + sx * half - 1.2 * s, apexY - 6 * s, zS - 1 * s], [apexX + sx * half + 1.2 * s, by0, zS + 1 * s], [92, 60, 38]));
  out.push(...box([apexX - half - 2 * s, by0 - 1.5 * s, zS - 2 * s], [apexX + half + 2 * s, by1 + 1.5 * s, zS], [70, 52, 36]));
  out.push(...box([apexX - half, by0, zS - 2.6 * s], [apexX + half, by1, zS - 2 * s], V.board));
  const bc = project(cam, [apexX, (by0 + by1) / 2, zS - 2.6 * s]);
  const bl = project(cam, [apexX - half, (by0 + by1) / 2, zS - 2.6 * s]), br = project(cam, [apexX + half, (by0 + by1) / 2, zS - 2.6 * s]);
  const ap = project(cam, [apexX, by1, zS]);
  const top = b.baseY - b.wallH - b.roofH - 34;
  const sp = sprite(-34, top, b.w + 68, b.baseY + 16 - top, (g) => renderPolys(g, cam, out));
  const res: PlaceSprite = { sp, board: { x: bc.x, y: bc.y, w: br.x - bl.x }, apex: { x: ap.x, y: ap.y } };
  placeCache.set(key, res);
  return res;
}

// ── repeating background tile (sky, hills, far bank, water, ground) ─────────
let bgTile: Sprite | null = null;
function bgSprite(): Sprite {
  if (bgTile) return bgTile;
  bgTile = sprite(0, 0, TILE, WORLD_H, (ctx) => {
    const bands = 14;
    for (let i = 0; i < bands; i++) {
      const t = i / (bands - 1);
      ctx.fillStyle = rgba(mixRGB([92, 116, 146], FOG, Math.pow(t, 1.4)));
      ctx.fillRect(0, (i * 152) / bands, TILE, 152 / bands + 1);
    }
    ctx.fillStyle = "rgba(240,226,190,0.55)";
    ctx.beginPath();
    for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; ctx.lineTo(500 + Math.cos(a) * 14, 70 + Math.sin(a) * 14); }
    ctx.fill();
    const r = rng(44);
    for (let c = 0; c < 4; c++) {
      const cx = r() * TILE, cy = 30 + r() * 60, cw = 50 + r() * 60;
      const al = 0.45 + r() * 0.2;
      const hs = Array.from({ length: 7 }, () => r() * 9);
      for (const off of [-TILE, 0, TILE]) {
        ctx.fillStyle = `rgba(214,218,216,${al})`;
        ctx.beginPath();
        ctx.moveTo(off + cx - cw / 2, cy + 6);
        for (let k = 0; k <= 6; k++) ctx.lineTo(off + cx - cw / 2 + (k / 6) * cw, cy - 4 - hs[k]! * Math.sin((k / 6) * Math.PI));
        ctx.lineTo(off + cx + cw / 2, cy + 6);
        ctx.fill();
      }
    }
    // Hills: periodic (sines whose periods divide the tile).
    for (const [k, col] of [[0, [124, 138, 140]], [1, [110, 128, 122]]] as [number, RGB][]) {
      ctx.fillStyle = rgba(col);
      ctx.beginPath();
      ctx.moveTo(0, 152);
      for (let x = 0; x <= TILE; x += 20) {
        const n = Math.sin((x / TILE) * Math.PI * 2 * 3 + k * 2) * 0.5 + Math.sin((x / TILE) * Math.PI * 2 * 7 + k) * 0.3;
        ctx.lineTo(x, 150 - (k ? 8 : 16) - n * (k ? 6 : 10));
      }
      ctx.lineTo(TILE, 152);
      ctx.fill();
    }
    const cam = camAt(TILE / 2);
    const r3 = new R3(cam, LOOK);
    // Columns in screen space (straight, vertical) so the tile repeats seamlessly.
    const COL = 40;
    const strip = (syNear: number, syFar: number, col: (i: number) => RGB, tex?: (i: number) => Tex) => {
      for (let i = 0; i < TILE / COL; i++) {
        const xa = i * COL, xb = (i + 1) * COL;
        r3.add([{ v: [ground(cam, xa, syNear).p, ground(cam, xb, syNear).p, ground(cam, xb, syFar).p, ground(cam, xa, syFar).p], n: [0, 1, 0], c: col(i), o: tex ? { tex: tex(i) } : undefined }]);
      }
    };
    strip(156, 150.6, () => [92, 112, 80]);
    const waterRows = [196, 189, 182, 175, 168, 162, 156];
    for (let k = 0; k < waterRows.length - 1; k++) strip(waterRows[k]!, waterRows[k + 1]!, (i) => mixRGB([54, 92, 98], [66, 104, 108], hash(i * 3 + k * 17)));
    const rows = [372, 356, 344, 330, 314, 298, 284, 270, 254, 240, 228, 218, 209, 202, 196];
    for (let k = 0; k < rows.length - 1; k++) {
      const path = rows[k]! <= GROUND.pathBottom && rows[k]! > GROUND.pathTop;
      const shore = rows[k + 1] === 196;
      strip(rows[k]!, rows[k + 1]!, (i) => {
        const n = hash(i * 0.37 + k * 11.3);
        return shore ? mixRGB([120, 112, 84], [108, 100, 76], n) : path ? mixRGB([150, 128, 96], [138, 116, 86], n) : mixRGB([96, 122, 70], [86, 112, 64], (i + k) % 2 ? n * 0.4 : 0.6 + n * 0.4);
      }, (i) => (path ? speckle(i + k * 97, "rgba(190,170,140,0.5)", "rgba(80,64,48,0.35)", 6) : speckle(i + k * 97, "rgba(150,170,100,0.45)", "rgba(40,64,36,0.4)", 8)));
    }
    r3.render(ctx);
  }, 1);
  return bgTile;
}

// ── dynamic: canoe, villagers, markers, flames ─────────────────────────────
function snapLook(px: number): Look {
  return { ...LOOK, snap: px };
}

function canoe(g: CanvasRenderingContext2D, f: LiveFrame, look: Look) {
  const cam = camAt(f.canoeX);
  const gr = ground(cam, f.canoeX, 178);
  const s = gr.s, b = gr.p;
  const P = (x: number, y: number, z: number): V3 => add(b, [x * s, y * s, z * s]);
  const wood: RGB = [96, 66, 42], inner: RGB = [70, 48, 32];
  const r3 = new R3(cam, look);
  r3.begin(gr.z);
  r3.add([poly([P(-22, 6, 0), P(-14, 3, 5), P(14, 3, 5), P(22, 6, 0), P(16, -1.5, 0), P(-16, -1.5, 0)], inner, { double: true }, [0, 0.3, -1])]);
  r3.add([{ v: [P(-14, 2, -5), P(14, 2, -5), P(14, 2, 5), P(-14, 2, 5)], n: [0, 1, 0], c: inner }]);
  const row = f.reducedMotion ? 0 : Math.sin(f.t * 2.2);
  r3.add(box(P(-3, 2, -2.5), P(3, 13, 2.5), [150, 70, 60]));
  r3.add(box(P(-2.6, 13, -2.4), P(2.6, 18.5, 2.4), [116, 80, 58]));
  r3.add(box(P(-2.8, 17.5, -2.6), P(2.8, 19.5, 2.6), [40, 32, 28]));
  r3.add(boxBetween(P(-1 + row * 6, 15, -4), P(4 + row * 9, -3, -6), [0, 0, 1], 1.4 * s, 1.4 * s, [130, 100, 66]));
  r3.add([poly([P(-22, 6, 0), P(-14, 3, -5), P(14, 3, -5), P(22, 6, 0), P(16, -1.5, 0), P(-16, -1.5, 0)], wood, { double: true }, [0, -0.2, -1])]);
  r3.end();
  r3.render(g);
}

function villagerPose(v: VillagerFrame, idle: boolean): Pose {
  const p = poseOf(v);
  if (idle && !v.moving) return { ...p, armF: 0.25, armB: 0.2 }; // hands folded, calm
  if (v.jump <= 0.02) return p;
  const k = Math.min(1, v.jump * 1.6);
  return { ...p, legF: 0.55 * k, kneeF: 1.1 * k, legB: -0.15 * k, kneeB: 0.9 * k };
}

function villager(g: CanvasRenderingContext2D, lv: LiveVillager, f: LiveFrame, look: Look, lod: boolean) {
  const v = asVillagerFrame(lv);
  const cam = camAt(v.x);
  const R = rig(cam, v, { turn: 0.5, pose: villagerPose(v, lv.status === "idle") });
  const { j, s, side, fwd, up } = R;
  if (v.jump > 0.02) {
    const k = Math.min(1, v.jump * 1.6);
    const arm = (ang: number): [[number, number], [number, number]] => {
      const dx = Math.sin(ang), dy = -Math.cos(ang);
      const e: [number, number] = [j.shoulder[0] + dx * R.body.upperArm, j.shoulder[1] + dy * R.body.upperArm];
      return [e, [e[0] + dx * R.body.forearm, e[1] + dy * R.body.forearm]];
    };
    [j.elbowF, j.handF] = arm(0.3 + 2.5 * k);
    [j.elbowB, j.handB] = arm(-0.3 - 2.5 * k);
  }
  const L = (p: [number, number], z: number) => R.w([p[0], p[1], z]);
  const shirt = mute(v.shirt), mundu = mute(v.mundu), skin = mute(v.skin, 0.15);
  const hair = mute(lv.hair, 0.2), sandal: RGB = [70, 50, 36];
  const AX: [V3, V3, V3] = [fwd, up, side];
  const r3 = new R3(cam, look);

  g.globalAlpha = lv.alpha;
  // Blob shadow, and a selection / hover ring on the ground.
  const sh = (1 - v.jump * 0.5) * 9 * s;
  const ring = (rad: number): V3[] => Array.from({ length: 10 }, (_, i) => { const a = (i / 10) * Math.PI * 2; return add(R.base, [Math.cos(a) * rad, 0.4, Math.sin(a) * rad * 0.8]); });
  r3.add([{ v: ring(sh), n: [0, 1, 0], c: [20, 24, 20], o: { alpha: 0.5 - v.jump * 0.25, flat: true } }], -1);
  if (lv.selected || lv.hovered) {
    const pts = ring(15 * s).map((q) => project(cam, q));
    r3.custom(0, (c) => {
      c.strokeStyle = lv.selected ? `rgba(255,215,94,${0.75 + 0.25 * f.pulse})` : "rgba(230,236,255,0.6)";
      c.lineWidth = lv.selected ? 2 : 1.2;
      c.beginPath();
      pts.forEach((q, i) => (i ? c.lineTo(q.x, q.y) : c.moveTo(q.x, q.y)));
      c.closePath();
      c.stroke();
    }, -1);
  }

  r3.begin(R.z);
  const limb = (a: [number, number], b: [number, number], z: number, wv: number, col: RGB) => r3.add(boxBetween(L(a, z), L(b, z), side, wv * s, wv * s, col));
  if (!lod) {
    limb(j.shoulder, j.elbowB, -6.5, 3.8, shirt);
    limb(j.elbowB, j.handB, -6.5, 3.2, skin);
  }
  limb(j.hip, j.kneeB, -3.2, 4.8, mundu);
  limb(j.kneeB, j.footB, -3.2, 3.8, skin);
  if (!lod) r3.add(obox(L([j.footB[0] + 1.8, j.footB[1] + 1], -3.2), AX, [3.2 * s, 1 * s, 2 * s], sandal));
  limb(j.hip, j.kneeF, 3.2, 4.8, mundu);
  limb(j.kneeF, j.footF, 3.2, 3.8, skin);
  if (!lod) r3.add(obox(L([j.footF[0] + 1.8, j.footF[1] + 1], 3.2), AX, [3.2 * s, 1 * s, 2 * s], sandal));
  r3.add(obox(L([0.3, j.hip[1] - 4], 0), AX, [6 * s, 7 * s, 6.6 * s], mundu));
  r3.add(boxBetween(L([j.hip[0], j.hip[1] + 2], 0), L(j.neck, 0), side, 11 * s, 10 * s, shirt));
  r3.add(obox(L([j.head[0], j.head[1] - 0.5], 0), AX, [4.4 * s, 5 * s, 4.2 * s], skin));
  r3.add(obox(L([j.head[0] - 0.8, j.head[1] + 3.6], 0), AX, [4.8 * s, 1.8 * s, 4.6 * s], hair));
  if (!lod) {
    r3.add(obox(L([j.head[0] - 3.4, j.head[1] + 0.5], 0), AX, [1.6 * s, 4 * s, 4.5 * s], hair));
    r3.add(obox(L([j.head[0] + 4.8, j.head[1] - 0.5], 0), AX, [0.8 * s, 1.2 * s, 0.9 * s], mixRGB(skin, [0, 0, 0], 0.15)));
  }
  limb(j.shoulder, j.elbowF, 6.5, 3.8, shirt);
  limb(j.elbowF, j.handF, 6.5, 3.2, skin);
  if (lod) {
    // Far away: a single block for whatever is carried.
    if (v.carry) r3.add(obox(L(j.handF, 4), AX, [3.5 * s, 2.5 * s, 3 * s], v.carry === "laptop" ? [90, 170, 190] : [206, 140, 74]));
  } else if (v.carry === "laptop") {
    const hp = L([j.handF[0] - 4, j.handF[1] + 1], 2);
    r3.add(obox(hp, AX, [6 * s, 0.8 * s, 5 * s], [70, 72, 78]));
    const hinge = madd(hp, fwd, 6 * s, up, 0.8 * s);
    const lidTop = madd(hinge, fwd, 3 * s, up, 9.5 * s);
    r3.add(boxBetween(hinge, lidTop, side, 1 * s, 10 * s, [88, 92, 100]));
    const n = norm(sub(mul(fwd, -1), mul(up, 0.3)));
    const q = (a: V3, k: number) => madd(madd(a, side, k * 4.2 * s), n, 0.7 * s);
    r3.add([{ v: [q(hinge, -1), q(hinge, 1), q(lidTop, 1), q(lidTop, -1)], n, c: [90, 170, 190], o: { emissive: 0.9 } }]);
  } else if (v.carry === "glass") {
    const gb = L([j.handF[0], j.handF[1] - 2], 6.5);
    r3.add(cylinder(gb, madd(gb, up, 9 * s), 2.4 * s, 3 * s, 6, [206, 140, 74]));
    r3.add(cylinder(madd(gb, up, 9 * s), madd(gb, up, 10 * s), 3 * s, 3.1 * s, 6, [236, 214, 170]));
  }
  // Subagents: little blocky helpers trotting behind.
  for (let i = 0; i < (lod ? 0 : Math.min(3, lv.helpers)); i++) {
    const hx = -14 - i * 9, bobY = v.moving ? Math.abs(Math.sin(v.phase * Math.PI * 2 + i)) * 2 : 0;
    r3.add(obox(R.w([hx, 6 + bobY, -4]), AX, [3 * s, 5 * s, 3 * s], mute(lv.shirt, 0.5)));
    r3.add(obox(R.w([hx + 0.5, 14 + bobY, -4]), AX, [2.6 * s, 2.6 * s, 2.6 * s], skin));
  }
  r3.end();
  r3.render(g);
  g.globalAlpha = 1;
}

function marker(g: CanvasRenderingContext2D, x: number, y: number, f: LiveFrame, look: Look) {
  // Spinning low-poly "quest" diamond over a place that needs the person.
  const cam = camAt(x);
  const gr = ground(cam, x, 272);
  const s = gr.s;
  const c: V3 = [gr.p[0], (272 - y) * s + (f.reducedMotion ? 0 : Math.sin(f.t * 3) * 3 * s), gr.p[2]];
  const a = f.reducedMotion ? 0.6 : f.t * 2.4;
  const rr = 7 * s, hh = 11 * s;
  const eq: V3[] = [0, 1, 2, 3].map((i) => add(c, [Math.cos(a + (i * Math.PI) / 2) * rr, 0, Math.sin(a + (i * Math.PI) / 2) * rr]));
  const top = add(c, [0, hh, 0]), bot = add(c, [0, -hh, 0]);
  const col: RGB = mixRGB([200, 40, 36], [255, 90, 79], f.pulse);
  const ps: Poly[] = [];
  for (let i = 0; i < 4; i++) {
    const p0 = eq[i]!, p1 = eq[(i + 1) % 4]!;
    for (const tip of [top, bot]) {
      const q = poly([p0, p1, tip], col, { emissive: 0.35 });
      const m = mul(add(add(p0, p1), tip), 1 / 3);
      if (q.n[0] * (m[0] - c[0]) + q.n[1] * (m[1] - c[1]) + q.n[2] * (m[2] - c[2]) < 0) q.n = mul(q.n, -1);
      ps.push(q);
    }
  }
  const r3 = new R3(cam, look);
  r3.add(ps);
  r3.render(g);
}

function flames(g: CanvasRenderingContext2D, f: LiveFrame, view: ViewRect) {
  const L = f.lamps;
  const ls = lampSprite(L.y);
  for (let i = 0; i < L.count; i++) {
    if (i >= L.lit) continue;
    const x = L.x0 + i * L.dx;
    if (x < view.x - 30 || x > view.x + view.w + 30) continue;
    const y = ls.topY;
    const fl = 1 + (f.reducedMotion ? 0 : (hash(i * 7 + Math.floor(f.t * 15)) - 0.5) * 0.35);
    g.globalCompositeOperation = "lighter";
    const gr = g.createRadialGradient(x, y - 4, 0, x, y - 4, 16);
    gr.addColorStop(0, "rgba(255,170,70,0.55)");
    gr.addColorStop(1, "rgba(255,120,40,0)");
    g.fillStyle = gr;
    g.fillRect(x - 18, y - 22, 36, 36);
    g.fillStyle = "rgba(255,150,60,0.12)";
    g.beginPath();
    g.ellipse(x, y + 24, 12, 3, 0, 0, Math.PI * 2);
    g.fill();
    g.globalCompositeOperation = "source-over";
    const h = 9 * fl;
    g.fillStyle = "#ff8a2a";
    g.beginPath(); g.moveTo(x, y - h); g.lineTo(x + 2.5, y - 2); g.lineTo(x, y); g.lineTo(x - 2.5, y - 2); g.fill();
    g.fillStyle = "#ffe08a";
    g.beginPath(); g.moveTo(x, y - h * 0.6); g.lineTo(x + 1.2, y - 2); g.lineTo(x, y); g.lineTo(x - 1.2, y - 2); g.fill();
  }
}

function shimmer(g: CanvasRenderingContext2D, f: LiveFrame, view: ViewRect, px: number) {
  const t = f.reducedMotion ? 0 : f.t;
  const t0 = Math.floor(view.x / TILE) * TILE;
  for (let tx = t0; tx < view.x + view.w; tx += TILE) {
    const r = rng(91);
    for (let i = 0; i < 18; i++) {
      const y = 158 + r() * 36;
      const sp = 6 + r() * 10;
      const w = 6 + r() * 14 * ((y - 150) / 46);
      const x = tx + (((r() * (TILE + 40) + t * sp) % (TILE + 40)) - 20);
      g.fillStyle = `rgba(190,214,210,${0.18 + 0.12 * Math.sin(t * 2 + i)})`;
      g.fillRect(Math.round(x / px) * px, Math.round(y / px) * px, Math.max(px, Math.round(w / px) * px), px);
    }
  }
}

// ── HUD (crisp, drawn on the main canvas in world units) ───────────────────
function bevel(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, edge: string, lw = 1) {
  ctx.fillStyle = "rgba(12,18,40,0.8)";
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = "rgba(255,255,255,0.35)";
  ctx.fillRect(x, y, w, lw * 0.8);
  ctx.fillRect(x, y, lw * 0.8, h);
  ctx.fillStyle = "rgba(0,0,0,0.6)";
  ctx.fillRect(x, y + h - lw * 0.8, w, lw * 0.8);
  ctx.fillRect(x + w - lw * 0.8, y, lw * 0.8, h);
  ctx.strokeStyle = edge;
  ctx.lineWidth = lw;
  ctx.strokeRect(x - lw / 2, y - lw / 2, w + lw, h + lw);
}

const NAME_FONT = "bold 7.5px Verdana, Tahoma, sans-serif";
const TEXT_FONT = "bold 8px Verdana, Tahoma, sans-serif";

function plate(ctx: CanvasRenderingContext2D, v: LiveVillager, f: LiveFrame) {
  const urgent = v.urgent;
  const err = v.status === "error";
  const idle = v.status === "idle";
  ctx.globalAlpha = v.alpha * (idle && !v.selected && !v.hovered ? 0.78 : 1);
  ctx.font = TEXT_FONT;
  const lead = urgent || err ? 13 : 0;
  const tw = ctx.measureText(v.label).width + lead;
  ctx.font = NAME_FONT;
  const nw = ctx.measureText(v.name).width + (v.helpers > 0 ? 18 : 0);
  const w = Math.max(tw, nw) + 13;
  const h = 22;
  const x = v.labelX - w / 2, y = v.labelY;
  const edge = urgent ? `rgba(255,90,79,${0.45 + 0.55 * f.pulse})` : v.selected ? "#ffd75e" : v.hovered ? "rgba(230,236,255,0.9)" : "rgba(160,170,200,0.55)";
  bevel(ctx, x, y, w, h, edge, v.selected || urgent ? 1.4 : 1);
  ctx.fillStyle = v.color;
  ctx.fillRect(x + 1, y + 1, 2.5, h - 2);
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.font = NAME_FONT;
  ctx.fillStyle = idle ? "#c9c3a0" : "#ffd75e";
  ctx.fillText(v.name, x + 7, y + 9);
  if (v.helpers > 0) {
    const bx = x + w - 17;
    ctx.fillStyle = "rgba(94,234,212,0.25)";
    ctx.fillRect(bx, y + 2.5, 13, 8);
    ctx.fillStyle = "#9ff5e6";
    ctx.font = "bold 6px Verdana, Tahoma, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(`+${v.helpers}`, bx + 6.5, y + 8.8);
    ctx.textAlign = "left";
  }
  ctx.font = TEXT_FONT;
  let tx = x + 7;
  if (urgent || err) {
    ctx.fillStyle = urgent ? `rgba(255,90,79,${0.6 + 0.4 * f.pulse})` : "#f87171";
    ctx.fillRect(tx, y + 12, 9.5, 8.5);
    ctx.fillStyle = "#fff";
    ctx.textAlign = "center";
    ctx.fillText(urgent ? "!" : "×", tx + 4.75, y + 19.2);
    ctx.textAlign = "left";
    tx += 13;
  }
  ctx.fillStyle = urgent ? `rgb(255,${190 + 65 * (1 - f.pulse)},${180 + 75 * (1 - f.pulse)})` : err ? "#fecaca" : idle ? "#b8bfcc" : "#f2f4ff";
  ctx.fillText(v.label, tx, y + 19);
  if (v.linked) {
    ctx.fillStyle = "#5eead4";
    ctx.beginPath();
    ctx.arc(x + w - 2.5, y + 2.5, 1.8, 0, Math.PI * 2);
    ctx.fill();
  }
  // Pointer down toward the head.
  ctx.fillStyle = "rgba(12,18,40,0.8)";
  ctx.beginPath();
  ctx.moveTo(v.labelX - 3.5, y + h);
  ctx.lineTo(v.labelX + 3.5, y + h);
  ctx.lineTo(v.labelX, y + h + 4.5);
  ctx.fill();
  ctx.globalAlpha = 1;
}

function boardText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxW: number, fill: string, size: number) {
  let s = size;
  ctx.font = `bold ${s}px Verdana, Tahoma, sans-serif`;
  let tw = ctx.measureText(text).width;
  if (tw > maxW) { s = Math.max(4.5, (s * maxW) / tw); ctx.font = `bold ${s}px Verdana, Tahoma, sans-serif`; tw = ctx.measureText(text).width; }
  let t = text;
  while (tw > maxW && t.length > 3) { t = t.slice(0, -2) + "…"; tw = ctx.measureText(t).width; }
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "rgba(0,0,0,0.5)";
  ctx.fillText(t, x + 0.5, y + 0.5);
  ctx.fillStyle = fill;
  ctx.fillText(t, x, y);
  ctx.textBaseline = "alphabetic";
}

function statusBar(ctx: CanvasRenderingContext2D, f: LiveFrame, view: ViewRect) {
  // Screen-fixed, top-left under the top bar (the session panel owns the bottom-left); sized in CSS pixels.
  const tr = ctx.getTransform();
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const upc = dpr / tr.d; // world units per CSS pixel
  ctx.save();
  ctx.translate(view.x, view.y);
  ctx.scale(upc, upc);
  const x = 16, y = 78, w = 236, h = 26;
  bevel(ctx, x, y, w, h, "rgba(160,170,200,0.6)", 1.5);
  ctx.font = "bold 11px Verdana, Tahoma, sans-serif";
  ctx.textAlign = "left";
  ctx.fillStyle = "#ffd75e";
  ctx.fillText("WORKING", x + 8, y + 17);
  const bx = x + 78, bw = 104, segs = Math.max(1, Math.min(12, f.total));
  ctx.fillStyle = "rgba(0,0,0,0.6)";
  ctx.fillRect(bx, y + 8, bw, 11);
  for (let i = 0; i < segs; i++) {
    if (i >= (f.total > 12 ? Math.round((f.working / f.total) * 12) : f.working)) break;
    const sw = bw / segs;
    const gr = ctx.createLinearGradient(0, y + 9, 0, y + 18);
    gr.addColorStop(0, "#9ff5e6");
    gr.addColorStop(1, "#1f9e8c");
    ctx.fillStyle = gr;
    ctx.fillRect(bx + 1 + i * sw, y + 9, sw - 2, 9);
  }
  ctx.fillStyle = "#f2f4ff";
  ctx.textAlign = "right";
  ctx.fillText(`${f.working}/${f.total}`, x + w - 8, y + 17);
  ctx.restore();
}

// ── frame ───────────────────────────────────────────────────────────────────
let buf: { c: HTMLCanvasElement; g: CanvasRenderingContext2D } | null = null;
let mid: { c: HTMLCanvasElement; g: CanvasRenderingContext2D } | null = null;
function canvas(prev: { c: HTMLCanvasElement; g: CanvasRenderingContext2D } | null, w: number, h: number) {
  if (prev && prev.c.width === w && prev.c.height === h) return prev;
  const c = prev?.c ?? document.createElement("canvas");
  c.width = w;
  c.height = h;
  return { c, g: c.getContext("2d")! };
}

export const ps2Live: LiveStyle = {
  id: "ps2",
  name: "PS2",
  blurb: "Early-2000s console 3D: low-poly blocky villagers, brick and tile textures, fog, wobbly polygons and a soft low-res upscale with game-HUD nameplates.",
  fps: 30,
  bg: "#5c7088",
  draw(ctx, f, view) {
    const bw = Math.max(2, Math.round((BH * view.w) / view.h));
    buf = canvas(buf, bw, BH);
    const k = BH / view.h; // buffer pixels per world unit
    const px = 1 / k; // one buffer pixel in world units
    const g = buf.g;
    g.setTransform(k, 0, 0, k, -view.x * k, -view.y * k);
    g.imageSmoothingEnabled = false;
    g.globalAlpha = 1;
    g.globalCompositeOperation = "source-over";
    const look = snapLook(px);
    const inView = (x0: number, x1: number) => x1 > view.x - 4 && x0 < view.x + view.w + 4;

    // Background tile, repeated across the view.
    const bg = bgSprite();
    for (let tx = Math.floor(view.x / TILE) * TILE; tx < view.x + view.w; tx += TILE) g.drawImage(bg.c, tx, 0, TILE, WORLD_H);
    // The view can reach past the world's top/bottom: continue the sky and the near grass.
    if (view.y < 0) { g.fillStyle = "rgb(92,116,146)"; g.fillRect(view.x, view.y, view.w, -view.y + 0.5); }
    if (view.y + view.h > WORLD_H) { g.fillStyle = "rgb(84,108,62)"; g.fillRect(view.x, WORLD_H - 0.5, view.w, view.y + view.h - WORLD_H + 1); }
    const fp = farPalmSprite();
    for (const x of f.farPalms) if (inView(x + fp.x, x + fp.x + fp.w)) put(g, fp, x);
    shimmer(g, f, view, px);
    if (inView(f.canoeX - 30, f.canoeX + 30)) canoe(g, f, look);

    // Scenery back to front by base y: palms, sign, places, lamps.
    type D = { y: number; draw: () => void };
    const list: D[] = [];
    for (const p of f.palms) {
      const sp = palmSprite(p.baseY, p.h, p.lean);
      if (inView(p.x + sp.x, p.x + sp.x + sp.w)) list.push({ y: p.baseY, draw: () => put(g, sp, p.x) });
    }
    const sg = signSprite(f.sign.y);
    if (inView(f.sign.x + sg.sp.x, f.sign.x + sg.sp.x + sg.sp.w)) list.push({ y: f.sign.y + 40, draw: () => put(g, sg.sp, f.sign.x) });
    const shown: { p: LivePlace; ps: PlaceSprite }[] = [];
    for (const p of f.places) {
      const ps = placeSprite(p);
      const b = p.building;
      if (!inView(b.x + ps.sp.x, b.x + ps.sp.x + ps.sp.w)) continue;
      shown.push({ p, ps });
      list.push({ y: b.baseY, draw: () => put(g, ps.sp, b.x) });
    }
    const ls = lampSprite(f.lamps.y);
    for (let i = 0; i < f.lamps.count; i++) {
      const x = f.lamps.x0 + i * f.lamps.dx;
      if (inView(x - 12, x + 12)) list.push({ y: f.lamps.y + 22, draw: () => put(g, ls.sp, x) });
    }
    list.sort((a, b) => a.y - b.y);
    for (const d of list) d.draw();
    for (const { p, ps } of shown) if (p.urgent > 0) marker(g, p.building.x + ps.apex.x, ps.apex.y - 16, f, look);
    flames(g, f, view);

    for (const v of f.villagers) if (v.alpha > 0.01 && inView(v.x - 30, v.x + 30)) villager(g, v, f, look, px > 2.5);

    // Upscale: soft 2× (composite-video bleed), then hard pixels to the screen.
    mid = canvas(mid, bw * 2, BH * 2);
    mid.g.setTransform(1, 0, 0, 1, 0, 0);
    mid.g.imageSmoothingEnabled = true;
    mid.g.imageSmoothingQuality = "low";
    mid.g.drawImage(buf.c, 0, 0, bw * 2, BH * 2);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(mid.c, view.x, view.y, bw / k, view.h);
    ctx.imageSmoothingEnabled = true;
    // Faint interlace lines.
    ctx.fillStyle = "rgba(0,0,0,0.06)";
    for (let y = view.y; y < view.y + view.h; y += 2 * px) ctx.fillRect(view.x, y, view.w, px * 0.5);

    // Crisp lettering: the village sign and each place's name board.
    if (inView(f.sign.x - 40, f.sign.x + 40)) boardText(ctx, f.sign.text, f.sign.x + sg.text.x, sg.text.y, 52, "#4a3624", 7.5);
    for (const { p, ps } of shown) boardText(ctx, p.name, p.building.x + ps.board.x, ps.board.y, ps.board.w - 6, "#eadfb8", 8);

    // Nameplates (selected one last, on top), then the HUD.
    let sel: LiveVillager | null = null;
    for (const v of f.villagers) {
      if (v.alpha <= 0.01 || !inView(v.labelX - 90, v.labelX + 90)) continue;
      if (v.selected) { sel = v; continue; }
      plate(ctx, v, f);
    }
    if (sel) plate(ctx, sel, f);
    statusBar(ctx, f, view);
  },
};
