/**
 * Bengaluru Tech Park: illustrated placeholder art (original, CC0).
 * Layers are static scenery (skyline, metro viaduct, park, street); anything
 * that moves or lights up (trees, the metro train, autos, steam, signals,
 * lit windows at night) is a separate decor sprite animated by the engine.
 * Every building, vehicle and sign here is generic: no real brands or places.
 */
import path from "node:path";
import { Img, rgba, shade, withAlpha, linear, radial, rng, hashNoise, quad, cubic, mixc } from "./raster.mjs";

const W = 1920, H = 1080;
/** Where things sit in the world (shared with world.json). */
const Y = { deckTop: 392, deck: 408, deckBot: 436, parkTop: 540, farWalk: 656, farKerb: 760, road: 772, lane: 826, nearKerb: 880, nearWalk: 892 };
const C = {
  haze: rgba("#c9d7e2"), glassA: rgba("#4f7fa3"), glassB: rgba("#86b6d4"), glassDark: rgba("#2c4f6c"),
  concrete: rgba("#cfc9bf"), concreteDark: rgba("#948e85"), concreteLight: rgba("#e6e1d8"),
  leaf: rgba("#3f7d3a"), leafDark: rgba("#24552a"), leafLight: rgba("#73a94f"), trunk: rgba("#6b5340"), trunkDark: rgba("#433224"),
  bloom: rgba("#e94e24"), bloomLight: rgba("#f6893a"), jacaranda: rgba("#9c7fd0"), pinkPuff: rgba("#f0a3b8"),
  asphalt: rgba("#4d5058"), asphaltDark: rgba("#3e4047"), paver: rgba("#b8aea2"), paverRed: rgba("#b0715a"), kerbY: rgba("#f2c230"), kerbB: rgba("#26262a"),
  grass: rgba("#5c9a3e"), grassDark: rgba("#3b7330"), grassLight: rgba("#86c15a"),
  autoGreen: rgba("#2f8a4c"), autoYellow: rgba("#f2c230"), hood: rgba("#1f1f22"),
  steel: rgba("#c9cfd4"), steelDark: rgba("#8a9299"), brass: rgba("#d9a83a"), brassDark: rgba("#8a6418"),
  wood: rgba("#7a4c2a"), woodDark: rgba("#4a2c16"), woodLight: rgba("#a8743f"), tile: rgba("#b2502e"), tileDark: rgba("#7a2f18"),
  violet: rgba("#6b4fa0"), white: rgba("#f4f1ea"), skin: rgba("#8d5a34"), dark: rgba("#1d2228"),
  warm: rgba("#ffd27a"), cool: rgba("#d8ecff"),
};

// ── Shared pieces ────────────────────────────────────────────────────────────
function cloud(w, h, seed) {
  const r = rng(seed);
  const img = new Img(w, h, 2);
  const paint = linear(0, h * 0.1, 0, h * 0.95, [[0, rgba("#ffffff")], [0.6, rgba("#f3f4fb")], [1, rgba("#bcc3d6")]]);
  for (let i = 0; i < 12; i++) img.circle(w * (0.12 + r() * 0.76), h * (0.5 + r() * 0.22), h * (0.14 + r() * 0.2), paint);
  img.circle(w * 0.42, h * 0.42, h * 0.3, paint);
  img.circle(w * 0.62, h * 0.46, h * 0.24, paint);
  img.ellipse(w * 0.5, h * 0.7, w * 0.42, h * 0.14, paint);
  img.blur(1.4);
  return img;
}

function glow(size, color) {
  const img = new Img(size, size, 1);
  img.circle(size / 2, size / 2, size / 2, radial(size / 2, size / 2, size / 2, [[0, withAlpha(color, 0.95)], [0.28, withAlpha(color, 0.45)], [1, withAlpha(color, 0)]]));
  return img;
}

/** Lit window pane on a lights overlay: bright core + soft halo. */
function litPane(L, x, y, w, h, col, a = 1) {
  L.rect(x - 2, y - 2, w + 4, h + 4, withAlpha(col, 0.25 * a));
  L.rect(x, y, w, h, withAlpha(col, 0.85 * a));
}

/** Small potted plant. */
function pot(img, x, y, s = 1, seed = 1) {
  const r = rng(seed);
  img.fillPoly([[x - 9 * s, y - 16 * s], [x + 9 * s, y - 16 * s], [x + 7 * s, y], [x - 7 * s, y]], linear(0, y - 16 * s, 0, y, [[0, rgba("#c06a3e")], [1, rgba("#8a4424")]]));
  for (let i = 0; i < 9; i++) {
    const a = -Math.PI / 2 + (r() - 0.5) * 2.2, len = (12 + r() * 12) * s;
    img.taper([[x, y - 15 * s], [x + Math.cos(a) * len, y - 15 * s + Math.sin(a) * len]], 4 * s, 0.6, i % 2 ? C.leaf : C.leafLight);
  }
}

/** A string of small bulbs hanging between two points. */
function bulbs(img, L, x0, y0, x1, y1, sag, n, cols) {
  const pts = quad([x0, y0], [(x0 + x1) / 2, Math.max(y0, y1) + sag], [x1, y1], 20);
  img.stroke(pts, 1, rgba("#2a2a2a", 0.8));
  const q = quad([x0, y0], [(x0 + x1) / 2, Math.max(y0, y1) + sag], [x1, y1], n + 1);
  for (let i = 1; i <= n; i++) {
    const [x, y] = q[i], col = cols[i % cols.length];
    img.circle(x, y + 2, 2.2, shade(col, -0.1));
    if (L) { L.circle(x, y + 2, 6, withAlpha(col, 0.35)); L.circle(x, y + 2, 2.6, withAlpha(shade(col, 0.4), 1)); }
  }
}

/** Auto-rickshaw facing right, drawn in a 110×84 box at (ox, oy) scaled by s. */
function drawAuto(img, ox, oy, s = 1, { passenger = false, seed = 1 } = {}) {
  const r = rng(seed);
  const P = (pts) => pts.map(([x, y]) => [ox + x * s, oy + y * s]);
  const at = (x, y) => [ox + x * s, oy + y * s];
  img.ellipse(...at(56, 82), 50 * s, 4 * s, rgba("#000000", 0.22));
  // Wheels
  for (const [x, y, rr] of [[28, 71, 11], [93, 73, 9.5]]) {
    img.circle(...at(x, y), rr * s, rgba("#1b1b1d"));
    img.circle(...at(x, y), rr * 0.5 * s, rgba("#9aa0a6"));
  }
  // Lower body (green) and rear
  img.fillPoly(P([[8, 46], [74, 46], [84, 50], [86, 66], [40, 66], [38, 70], [16, 70], [10, 62]]), linear(0, oy + 46 * s, 0, oy + 70 * s, [[0, shade(C.autoGreen, 0.12)], [1, shade(C.autoGreen, -0.25)]]));
  // Open side with seat
  img.fillPoly(P([[14, 28], [70, 28], [74, 46], [12, 46]]), rgba("#2b2b2e"));
  img.rect(...at(16, 38), 26 * s, 8 * s, rgba("#3c3c40"));
  // Front cowl (yellow)
  img.fillPoly(P([[72, 24], [88, 26], [98, 40], [104, 56], [100, 68], [86, 68], [84, 50], [74, 46]]), linear(ox + 72 * s, 0, ox + 104 * s, 0, [[0, shade(C.autoYellow, -0.12)], [0.6, C.autoYellow], [1, shade(C.autoYellow, -0.2)]]));
  img.fillPoly(P([[78, 26], [88, 27], [95, 38], [80, 38]]), rgba("#a9d4e6", 0.9));
  img.circle(...at(101, 50), 3 * s, rgba("#fff6c8"));
  img.stroke(P([[10, 50], [84, 52]]), 2.2 * s, C.autoYellow);
  // Hood (black canvas) with yellow trim
  img.fillPoly(P([[8, 30], [10, 14], [20, 8], [70, 8], [80, 14], [82, 28], [72, 30]]), linear(0, oy + 8 * s, 0, oy + 30 * s, [[0, shade(C.hood, 0.18)], [1, C.hood]]));
  img.stroke(P([[10, 29], [80, 27]]), 2.4 * s, C.autoYellow);
  img.stroke(P([[12, 30], [12, 46]]), 2.5 * s, C.hood);
  // Driver in a khaki uniform
  img.rect(...at(62, 30), 11 * s, 16 * s, rgba("#c8b47c"));
  img.circle(...at(68, 26), 4.6 * s, C.skin);
  img.ellipse(...at(68, 22.5), 4.8 * s, 2.4 * s, rgba("#1c1c1c"));
  img.stroke(P([[70, 36], [80, 38]]), 2.4 * s, C.skin);
  if (passenger) {
    const shirt = [rgba("#d24d57"), rgba("#4f7fd0"), rgba("#e0a23a")][Math.floor(r() * 3)];
    img.rect(...at(26, 30), 13 * s, 14 * s, shirt);
    img.circle(...at(32, 26), 4.8 * s, shade(C.skin, 0.12));
    img.ellipse(...at(32, 22.4), 5 * s, 2.6 * s, rgba("#202020"));
  }
}

function auto(passenger, seed) {
  const img = new Img(112, 86, 3);
  drawAuto(img, 1, 1, 1, { passenger, seed });
  return img;
}

// ── Trees (decor, sway) ──────────────────────────────────────────────────────
function canopyPuffs(img, cx, cy, rx, ry, n, r, cols, size = [0.16, 0.3]) {
  for (let i = 0; i < n; i++) {
    const a = r() * Math.PI * 2, d = Math.sqrt(r());
    const x = cx + Math.cos(a) * rx * d, y = cy + Math.sin(a) * ry * d;
    const rr = rx * (size[0] + r() * (size[1] - size[0]));
    const t = (y - (cy - ry)) / (2 * ry);
    const col = mixc(cols[0], cols[1], Math.max(0, Math.min(1, t * 0.9 + (r() - 0.5) * 0.3)));
    img.circle(x, y, rr, linear(0, y - rr, 0, y + rr, [[0, shade(col, 0.12)], [1, shade(col, -0.18)]]));
  }
}

/** Rain tree: a wide umbrella of leaves on a spreading trunk, with pink puff flowers. */
function rainTree(w, h, seed) {
  const r = rng(seed);
  const img = new Img(w, h, 2);
  const bx = w / 2, by = h - 2;
  const trunkPaint = linear(bx - 20, 0, bx + 20, 0, [[0, C.trunkDark], [0.5, C.trunk], [1, C.trunkDark]]);
  img.taper(quad([bx, by], [bx - 6, by - h * 0.25], [bx + 4, by - h * 0.42], 16), 30, 16, trunkPaint);
  for (const [dx, dy, wd] of [[-w * 0.3, -h * 0.66, 12], [w * 0.28, -h * 0.68, 11], [-w * 0.08, -h * 0.78, 9], [w * 0.12, -h * 0.6, 8], [-w * 0.42, -h * 0.58, 7]]) {
    img.taper(quad([bx + 2, by - h * 0.38], [bx + dx * 0.4, by + dy * 0.85], [bx + dx, by + dy], 14), wd, 3, trunkPaint);
  }
  const cy = h * 0.3;
  canopyPuffs(img, w / 2, cy, w * 0.44, h * 0.16, 70, r, [C.leafLight, C.leafDark]);
  canopyPuffs(img, w / 2, cy - h * 0.04, w * 0.34, h * 0.1, 30, r, [shade(C.leafLight, 0.12), C.leaf], [0.1, 0.2]);
  for (let i = 0; i < 26; i++) {
    const x = w * (0.12 + r() * 0.76), y = cy - h * 0.12 + r() * h * 0.22;
    img.circle(x, y, 3 + r() * 2.5, withAlpha(C.pinkPuff, 0.9));
    img.circle(x, y, 1.4, rgba("#fde2ea"));
  }
  return img;
}

/** Gulmohar: feathery green canopy covered in flame-orange blooms. */
function gulmohar(w, h, seed) {
  const r = rng(seed);
  const img = new Img(w, h, 2);
  const bx = w / 2, by = h - 2;
  const trunkPaint = linear(bx - 14, 0, bx + 14, 0, [[0, C.trunkDark], [0.5, shade(C.trunk, 0.1)], [1, C.trunkDark]]);
  img.taper(quad([bx, by], [bx + 8, by - h * 0.3], [bx - 2, by - h * 0.5], 16), 20, 11, trunkPaint);
  for (const [dx, dy] of [[-w * 0.32, -h * 0.72], [w * 0.3, -h * 0.74], [0, -h * 0.84]]) img.taper(quad([bx - 2, by - h * 0.46], [bx + dx * 0.4, by + dy * 0.9], [bx + dx, by + dy], 12), 8, 2.5, trunkPaint);
  const cy = h * 0.3;
  canopyPuffs(img, w / 2, cy, w * 0.45, h * 0.18, 60, r, [rgba("#6aa64a"), rgba("#2f6a2e")]);
  for (let i = 0; i < 90; i++) {
    const a = r() * Math.PI * 2, d = Math.sqrt(r());
    const x = w / 2 + Math.cos(a) * w * 0.42 * d, y = cy - h * 0.03 + Math.sin(a) * h * 0.16 * d;
    const col = r() < 0.5 ? C.bloom : r() < 0.6 ? C.bloomLight : rgba("#d6331c");
    img.circle(x, y, 4 + r() * 6, linear(0, y - 8, 0, y + 8, [[0, shade(col, 0.15)], [1, shade(col, -0.12)]]));
  }
  for (let i = 0; i < 30; i++) img.circle(w / 2 + (r() - 0.5) * w * 0.8, cy + (r() - 0.6) * h * 0.25, 1.6, rgba("#ffd27a"));
  return img;
}

// ── Layers ───────────────────────────────────────────────────────────────────
/** Deterministic list of skyline buildings, shared by the skyline and its night lights. */
function skylineBuildings() {
  const r = rng(101);
  const list = [];
  for (const [row, haze, hMin, hMax, gapMin, gapMax] of [[0, 0.6, 250, 400, -14, 22], [1, 0.36, 140, 270, 6, 70]]) {
    let x = -30 + r() * 20;
    while (x < W + 20) {
      const k = r();
      const kind = k < 0.42 ? "glass" : k < 0.85 ? "apt" : "slab";
      const w = kind === "slab" ? 38 + r() * 26 : kind === "glass" ? 70 + r() * 70 : 80 + r() * 80;
      const h = (hMin + r() * (hMax - hMin)) * (kind === "slab" ? 1.12 : kind === "apt" ? 0.86 : 1);
      const crown = Math.floor(r() * 4);
      const base = kind === "glass" ? [C.glassA, rgba("#5a8f9e"), rgba("#6f93b8"), rgba("#7ea6bf")][Math.floor(r() * 4)] : kind === "apt" ? [rgba("#e4d0b0"), rgba("#d9b89c"), rgba("#ece0c8"), rgba("#d7c0b0"), rgba("#e7c4b2"), rgba("#cfd6c4")][Math.floor(r() * 6)] : rgba("#9fb0bf");
      list.push({ row, haze, kind, x, w, h, top: 610 - h, crown, base, seed: Math.floor(r() * 1e6) });
      x += w + gapMin + r() * (gapMax - gapMin);
    }
  }
  return list;
}

function eachWindow(b, fn) {
  const r = rng(b.seed);
  if (b.kind === "apt") {
    const cols = Math.max(2, Math.floor(b.w / 18)), cw = b.w / cols;
    for (let y = b.top + 16; y < 600; y += 15) for (let c = 0; c < cols; c++) fn(b.x + c * cw + cw * 0.25, y, cw * 0.5, 7, r());
  } else {
    const cols = Math.max(2, Math.floor(b.w / 11)), cw = b.w / cols;
    for (let y = b.top + (b.kind === "glass" ? 22 : 10); y < 600; y += 10) for (let c = 0; c < cols; c++) fn(b.x + c * cw + 1.5, y + 1.5, cw - 3, 6, r());
  }
}

function skyline() {
  const img = new Img(W, H, 2);
  const blds = skylineBuildings();
  // A soft band of haze near the horizon and very distant ridge of buildings
  const r0 = rng(99);
  for (let x = -10; x < W; x += 24 + r0() * 30) {
    const h = 60 + r0() * 90, w = 26 + r0() * 40;
    img.rect(x, 600 - h, w, h, mixc(rgba("#8ea3b6"), C.haze, 0.72));
  }
  // Two tower cranes (construction never stops)
  for (const [cx, top, jl, jr] of [[540, 150, 120, 50], [1530, 190, 60, 130]]) {
    const col = mixc(rgba("#d9a73a"), C.haze, 0.5);
    img.rect(cx - 4, top, 8, 600 - top, col);
    for (let y = top + 6; y < 600; y += 12) img.stroke([[cx - 4, y], [cx + 4, y + 12]], 1, withAlpha(shade(col, -0.2), 0.8));
    img.rect(cx - jl, top, jl + jr, 6, col);
    for (let x = cx - jl; x < cx + jr; x += 10) img.stroke([[x, top], [x + 10, top + 6]], 0.8, withAlpha(shade(col, -0.2), 0.8));
    img.fillPoly([[cx - 6, top], [cx, top - 22], [cx + 6, top]], col);
    img.stroke([[cx, top - 22], [cx - jl + 10, top]], 0.8, withAlpha(col, 0.9));
    img.stroke([[cx, top - 22], [cx + jr - 6, top]], 0.8, withAlpha(col, 0.9));
    img.rect(cx - jl - 4, top + 2, 16, 12, shade(col, -0.25));
    img.stroke([[cx + jr - 20, top + 6], [cx + jr - 20, top + 60]], 0.8, rgba("#555555", 0.6));
  }
  for (const b of blds) {
    const hz = (c) => mixc(c, C.haze, b.haze);
    const { x, w, top } = b;
    if (b.kind === "glass") {
      img.rect(x, top, w, 610 - top, linear(x, 0, x + w, 0, [[0, hz(shade(b.base, -0.15))], [0.45, hz(shade(b.base, 0.22))], [1, hz(shade(b.base, -0.1))]]));
      img.rect(x + w * 0.78, top, w * 0.22, 610 - top, hz(shade(b.base, -0.28)), 0.6);
      for (let y = top + 10; y < 600; y += 10) img.stroke([[x, y], [x + w, y]], 0.8, withAlpha(hz(shade(b.base, -0.35)), 0.55));
      for (let xx = x + 11; xx < x + w; xx += 11) img.stroke([[xx, top], [xx, 600]], 0.6, withAlpha(hz(shade(b.base, -0.3)), 0.35));
      img.fillPoly([[x + w * 0.1, top + 40], [x + w * 0.42, top + 6], [x + w * 0.62, top + 6], [x + w * 0.3, top + 70]], withAlpha(rgba("#ffffff"), 0.16));
      const cr = hz(shade(b.base, -0.2));
      if (b.crown === 0) img.fillPoly([[x, top], [x + w, top], [x + w, top - 26], [x + w * 0.4, top]], cr);
      else if (b.crown === 1) { img.rect(x + w * 0.2, top - 16, w * 0.6, 16, cr); img.rect(x + w * 0.45, top - 44, 3, 30, cr); }
      else if (b.crown === 2) img.fillPoly([[x, top], [x + w * 0.5, top - 30], [x + w, top]], cr);
      else img.rect(x + w * 0.65, top - 34, w * 0.12, 34, cr);
    } else if (b.kind === "apt") {
      img.rect(x, top, w, 610 - top, linear(x, 0, x + w, 0, [[0, hz(b.base)], [0.8, hz(shade(b.base, 0.05))], [1, hz(shade(b.base, -0.18))]]));
      eachWindow(b, (wx, wy, ww, wh) => img.rect(wx, wy, ww, wh, hz(rgba("#5b6670"))));
      for (let y = top + 24; y < 600; y += 15) img.stroke([[x + 2, y], [x + w - 2, y]], 1.6, withAlpha(hz(shade(b.base, 0.25)), 0.9));
      img.rect(x - 2, top - 4, w + 4, 5, hz(shade(b.base, -0.12)));
      // Roof: stair core and black water tanks
      img.rect(x + w * 0.15, top - 16, w * 0.22, 14, hz(shade(b.base, -0.08)));
      for (let k = 0; k < 2 + (b.seed % 3); k++) { const tx = x + w * 0.5 + k * 13; img.rect(tx, top - 13, 10, 10, hz(rgba("#2c2f33"))); img.ellipse(tx + 5, top - 13, 5, 1.8, hz(rgba("#3c4045"))); }
    } else {
      img.rect(x, top, w, 610 - top, linear(x, 0, x + w, 0, [[0, hz(shade(b.base, -0.1))], [0.5, hz(shade(b.base, 0.2))], [1, hz(shade(b.base, -0.2))]]));
      for (let xx = x + 6; xx < x + w - 2; xx += 7) img.stroke([[xx, top + 6], [xx, 600]], 1.6, withAlpha(hz(rgba("#4c5a68")), 0.6));
      img.rect(x + w * 0.45, top - 30, 2, 30, hz(rgba("#6a7580")));
    }
  }
  return img;
}

/** The skyline's office and home windows, lit at night (additive overlay). */
function skylineLights() {
  const img = new Img(W, 520, 1);
  for (const b of skylineBuildings()) {
    const col = b.kind === "apt" ? rgba("#ffcf7a") : rgba("#cfe6ff");
    const p = b.kind === "apt" ? 0.42 : 0.5;
    eachWindow(b, (wx, wy, ww, wh, rv) => {
      if (rv > p) return;
      const aboveDeck = wy + wh < Y.deckTop - 6;
      const belowDeck = wy > Y.deckBot + 36 && wy + wh < 530 && Math.abs(((wx + ww / 2 - 120) % 300 + 300) % 300 - 150) < 125;
      if (!aboveDeck && !belowDeck) return;
      img.rect(wx, wy, ww, wh, withAlpha(col, (b.row === 0 ? 0.5 : 0.75) * (0.7 + rv * 0.6)));
    });
    // Aircraft-warning light on the tall ones
    if (b.h > 300) img.circle(b.x + b.w / 2, b.top - 6, 2.5, rgba("#ff5a4a", 0.9));
  }
  return img;
}

function viaduct() {
  const img = new Img(W, H, 2);
  // Pillars with a T-shaped cap
  for (let x = 120; x < W; x += 300) {
    img.rect(x - 16, Y.deckBot, 32, 700 - Y.deckBot, linear(x - 16, 0, x + 16, 0, [[0, C.concreteDark], [0.35, C.concreteLight], [1, C.concreteDark]]));
    img.fillPoly([[x - 60, Y.deckBot], [x + 60, Y.deckBot], [x + 20, Y.deckBot + 32], [x - 20, Y.deckBot + 32]], linear(0, Y.deckBot, 0, Y.deckBot + 32, [[0, C.concrete], [1, C.concreteDark]]));
    img.rect(x - 16, Y.deckBot + 32, 32, 8, withAlpha(rgba("#000000"), 0.12));
  }
  // Deck girder and parapet
  img.rect(0, Y.deck, W, Y.deckBot - Y.deck, linear(0, Y.deck, 0, Y.deckBot, [[0, C.concreteLight], [0.6, C.concrete], [1, C.concreteDark]]));
  img.rect(0, Y.deckTop, W, Y.deck - Y.deckTop, linear(0, Y.deckTop, 0, Y.deck, [[0, rgba("#f0ece4")], [1, C.concrete]]));
  img.rect(0, Y.deckBot - 3, W, 3, withAlpha(rgba("#000000"), 0.15));
  for (let x = 0; x < W; x += 60) img.stroke([[x, Y.deckTop], [x, Y.deckBot]], 1, withAlpha(C.concreteDark, 0.55));
  // A thin violet line along the parapet (route colour, no logo)
  img.rect(0, Y.deck - 4, W, 2.5, withAlpha(C.violet, 0.85));
  // Rail electrification brackets every 120px (small posts above the parapet)
  for (let x = 30; x < W; x += 120) img.rect(x, Y.deckTop - 7, 3, 8, C.concreteDark);
  return img;
}

function park() {
  const r = rng(131);
  const img = new Img(W, H, 2);
  img.rect(0, 620, W, 80, linear(0, 620, 0, 700, [[0, rgba("#3c7434")], [1, rgba("#2b5a2a")]]));
  // Back row of canopies (darker), then front row with blooms
  for (let pass = 0; pass < 2; pass++) {
    for (let i = 0; i < 34; i++) {
      const cx = (i / 34) * W + (r() - 0.5) * 40, cy = (pass ? 610 : 585) + r() * 20;
      const rx = 48 + r() * 40, ry = 34 + r() * 18;
      if (pass) img.taper([[cx, 690], [cx + (r() - 0.5) * 10, cy + 10]], 8, 5, C.trunkDark);
      const k = r();
      const cols = pass ? [shade(C.leafLight, -0.05), C.leafDark] : [mixc(C.leaf, C.haze, 0.25), mixc(C.leafDark, C.haze, 0.2)];
      canopyPuffs(img, cx, cy, rx, ry, 16, r, cols, [0.3, 0.5]);
      if (pass && k < 0.32) for (let j = 0; j < 22; j++) img.circle(cx + (r() - 0.5) * rx * 1.6, cy - ry * 0.4 + r() * ry, 3 + r() * 4, r() < 0.5 ? C.bloom : C.bloomLight);
      else if (pass && k < 0.48) for (let j = 0; j < 22; j++) img.circle(cx + (r() - 0.5) * rx * 1.6, cy - ry * 0.4 + r() * ry, 3 + r() * 4, r() < 0.5 ? C.jacaranda : shade(C.jacaranda, 0.2));
    }
  }
  // Park railing
  img.rect(0, 646, W, 3, rgba("#2a3a30"));
  for (let x = 4; x < W; x += 9) img.rect(x, 646, 2, 16, rgba("#2a3a30", 0.85));
  return img;
}

function ground() {
  const r = rng(151);
  const img = new Img(W, H, 2);
  // Far footpath: interlocking pavers
  const pavers = (y0, y1, seed) => {
    img.rect(0, y0, W, y1 - y0, (x, y) => {
      const row = Math.floor((y - y0) / 12), off = (row % 2) * 12, col = Math.floor((x + off) / 24);
      const n = hashNoise(col, row, seed);
      const base = n < 0.12 ? C.paverRed : shade(C.paver, (n - 0.5) * 0.14);
      const gx = (x + off) % 24, gy = (y - y0) % 12;
      const grout = gx < 1.2 || gy < 1.2;
      return shade(base, grout ? -0.22 : (hashNoise(x | 0, y | 0, seed + 1) - 0.5) * 0.06);
    });
  };
  pavers(Y.farWalk, Y.farKerb, 3);
  img.rect(0, Y.farWalk, W, 6, withAlpha(rgba("#000000"), 0.12));
  // Kerbs painted black and yellow
  const kerb = (y) => {
    for (let x = 0; x < W; x += 30) img.rect(x, y, 30, 12, Math.floor(x / 30) % 2 ? C.kerbB : C.kerbY);
    img.rect(0, y, W, 3, withAlpha(rgba("#ffffff"), 0.18));
  };
  // Road
  img.rect(0, Y.road - 2, W, Y.nearKerb - Y.road + 4, (x, y) => shade(mixc(C.asphalt, C.asphaltDark, (y - Y.road) / 110), (hashNoise(x >> 1, y >> 1, 21) - 0.5) * 0.1));
  for (let i = 0; i < 40; i++) img.ellipse(r() * W, Y.road + 10 + r() * 90, 20 + r() * 40, 3 + r() * 3, withAlpha(rgba("#5c6068"), 0.35));
  // Lane markings
  for (let x = 0; x < W; x += 80) if (x < 820 || x > 1000) img.rect(x, Y.lane - 2, 44, 4, rgba("#efeee6", 0.9));
  img.rect(0, Y.road + 6, W, 2.5, rgba("#e8c84a", 0.75));
  img.rect(0, Y.nearKerb - 8, W, 2.5, rgba("#e8c84a", 0.75));
  // Zebra crossing
  for (let y = Y.road + 10, k = 0; y < Y.nearKerb - 10; y += 13, k++) {
    const inset = (Y.nearKerb - y) * 0.06;
    img.fillPoly([[838 - inset, y], [962 + inset, y], [964 + inset, y + 8], [836 - inset, y + 8]], rgba("#f4f2ea", 0.95));
  }
  img.rect(826, Y.road + 8, 3, Y.nearKerb - Y.road - 18, rgba("#f4f2ea", 0.8));
  img.rect(972, Y.road + 8, 3, Y.nearKerb - Y.road - 18, rgba("#f4f2ea", 0.8));
  // Manhole covers
  for (const [mx, my] of [[300, 852], [1500, 800]]) { img.ellipse(mx, my, 20, 6, rgba("#2e3035")); img.ellipse(mx, my, 15, 4.2, rgba("#575a60")); }
  kerb(Y.farKerb);
  kerb(Y.nearKerb);
  // Near footpath / plaza
  pavers(Y.nearKerb + 12, H, 7);
  img.rect(0, Y.nearKerb + 12, W, 6, withAlpha(rgba("#000000"), 0.12));
  // Park lawn at the bandstand end and a lawn strip at the far left
  const lawn = (x0, x1, y0) => {
    const pts = [[x0, H], ...cubic([x0, y0 + 40], [x0 + 30, y0], [x0 + 100, y0], [x0 + 160, y0], 10), [x1, y0], [x1, H]];
    img.fillPoly(pts, (x, y) => shade(mixc(C.grass, C.grassDark, Math.min(1, (y - y0) / 200) * 0.5), hashNoise(x >> 2, y >> 2, 9) * 0.12 - 0.06));
    for (let i = 0; i < 260; i++) {
      const x = x0 + 20 + r() * (x1 - x0 - 20), y = y0 + 10 + r() * (H - y0 - 10);
      img.taper([[x, y], [x + (r() - 0.5) * 6, y - 6 - r() * 9]], 2, 0.3, r() < 0.5 ? C.grassLight : C.grassDark, 0.85);
    }
    for (let i = 0; i < 14; i++) {
      const cx = x0 + 40 + r() * (x1 - x0 - 60), cy = y0 + 30 + r() * (H - y0 - 40);
      const col = [rgba("#f2a019"), rgba("#e0303a"), rgba("#f4f0e0"), rgba("#c06ad8")][i % 4];
      for (let k = 0; k < 5; k++) img.circle(cx + (r() - 0.5) * 26, cy + (r() - 0.5) * 10, 3, col);
    }
  };
  lawn(1590, W, 935);
  // Fallen gulmohar petals and leaves on the footpaths
  for (let i = 0; i < 260; i++) {
    const y = r() < 0.4 ? Y.farWalk + 8 + r() * 70 : Y.nearWalk + 6 + r() * 200;
    const x = r() * W;
    img.circle(x, y, 1.6 + r() * 1.4, r() < 0.7 ? withAlpha(C.bloom, 0.85) : withAlpha(rgba("#c7a046"), 0.8));
  }
  // Tree pits on the near footpath
  for (const tx of [560, 1260]) {
    img.rect(tx - 26, 918, 52, 16, rgba("#6b4a33"));
    img.rect(tx - 26, 918, 52, 3, rgba("#4a3020"));
  }
  return img;
}

// ── Props ────────────────────────────────────────────────────────────────────
/** Each prop returns [image, nightLights] of the same size. */
function techPark() {
  const w = 300, h = 480, img = new Img(w, h, 2), L = new Img(w, h, 2);
  const r = rng(201);
  img.ellipse(150, 474, 146, 7, rgba("#000000", 0.2));
  const top = 50, bot = 400, x0 = 44, x1 = 246;
  img.rect(x0, top, x1 - x0, bot - top, linear(x0, 0, x1, 0, [[0, rgba("#2f5d82")], [0.4, rgba("#7fb3d6")], [0.55, rgba("#5f95bd")], [1, rgba("#2e5a7c")]]));
  img.rect(x0, top, x1 - x0, bot - top, linear(0, top, 0, bot, [[0, rgba("#ffffff", 0.18)], [1, rgba("#000000", 0.12)]]));
  img.fillPoly([[x1, top + 14], [x1 + 34, top + 34], [x1 + 34, bot], [x1, bot]], linear(x1, 0, x1 + 34, 0, [[0, rgba("#24486a")], [1, rgba("#1b3753")]]));
  for (let y = top + 14; y < bot; y += 14) {
    img.stroke([[x0, y], [x1, y]], 1.4, rgba("#22415c", 0.7));
    img.stroke([[x1, y + 6], [x1 + 34, y + 10]], 1, rgba("#132a40", 0.6));
  }
  for (let x = x0 + 14; x < x1; x += 14) img.stroke([[x, top], [x, bot]], 0.9, rgba("#22415c", 0.45));
  img.fillPoly([[x0 + 20, top + 120], [x0 + 110, top + 10], [x0 + 150, top + 10], [x0 + 60, top + 170]], rgba("#ffffff", 0.14));
  img.fillPoly([[x0 + 80, top + 300], [x0 + 190, top + 170], [x0 + 202, top + 190], [x0 + 100, top + 330]], rgba("#ffffff", 0.08));
  // Crown: slanted glass crest and a fin
  img.fillPoly([[x0 - 4, top], [x1 + 4, top], [x1 + 4, top - 30], [x0 + 70, top - 4]], linear(0, top - 30, 0, top, [[0, rgba("#9ccbe6")], [1, rgba("#3f6f95")]]));
  img.rect(x1 - 30, 6, 8, top - 6, rgba("#d8dde3"));
  img.circle(x1 - 26, 6, 3, rgba("#ff5a4a"));
  // Sign band (blank board; the place name shows as a label)
  img.rect(x0 + 24, top + 16, 130, 22, rgba("#16283a"));
  img.rect(x0 + 30, top + 23, 8, 8, rgba("#5fd0c8"));
  img.rect(x0 + 44, top + 24, 98, 3, rgba("#c8d8e6", 0.8)); img.rect(x0 + 44, top + 30, 70, 2, rgba("#c8d8e6", 0.5));
  // Office lights at night
  for (let y = top + 44; y < bot - 6; y += 14) for (let x = x0 + 2; x < x1 - 4; x += 14) if (r() < 0.42) litPane(L, x + 1, y + 2, 11, 9, r() < 0.7 ? C.cool : C.warm, 0.7);
  for (let y = top + 50; y < bot - 6; y += 14) if (r() < 0.5) litPane(L, x1 + 6, y, 24, 7, C.cool, 0.5);
  L.rect(x0 + 24, top + 16, 130, 22, withAlpha(rgba("#5fd0c8"), 0.25));
  // Podium and lobby
  img.rect(14, bot, 272, 72, linear(0, bot, 0, 472, [[0, C.concreteLight], [1, C.concrete]]));
  img.rect(80, 416, 140, 56, linear(0, 416, 0, 472, [[0, rgba("#33505f")], [1, rgba("#1d2f3a")]]));
  for (let x = 80; x <= 220; x += 28) img.rect(x - 1.5, 416, 3, 56, rgba("#c9d2d8"));
  img.rect(4, bot - 6, 292, 12, rgba("#f2efe8"));
  img.rect(4, bot + 6, 292, 3, withAlpha(rgba("#000000"), 0.15));
  L.rect(82, 418, 136, 52, withAlpha(C.warm, 0.6));
  for (const px of [36, 264]) pot(img, px, 470, 1.3, px);
  for (const bx of [64, 236]) { img.rect(bx - 3, 456, 6, 16, rgba("#5a5f66")); img.rect(bx - 4, 454, 8, 3, rgba("#f2c230")); }
  return [img, L];
}

function coworking() {
  const w = 270, h = 300, img = new Img(w, h, 3), L = new Img(w, h, 2);
  img.ellipse(135, 294, 130, 6, rgba("#000000", 0.2));
  // Brick building
  img.rect(20, 60, 230, 230, (x, y) => {
    const row = Math.floor(y / 7), off = (row % 2) * 8, gx = (x + off) % 16, gy = y % 7;
    const base = shade(rgba("#a8593a"), (hashNoise(Math.floor((x + off) / 16), row, 31) - 0.5) * 0.2);
    return gx < 1 || gy < 1 ? rgba("#d8c2a8") : base;
  });
  img.rect(20, 60, 230, 230, linear(20, 0, 250, 0, [[0, rgba("#000000", 0)], [1, rgba("#000000", 0.15)]]));
  img.rect(14, 52, 242, 10, rgba("#e8ddd0"));
  // Rooftop pergola, plants, water tank
  for (const x of [40, 110, 180]) img.rect(x, 22, 5, 30, C.woodDark);
  img.rect(30, 20, 160, 5, C.wood);
  for (let x = 36; x < 190; x += 12) img.rect(x, 17, 3, 8, C.woodLight);
  bulbs(img, L, 40, 26, 185, 26, 8, 9, [C.warm]);
  pot(img, 58, 52, 1, 3); pot(img, 150, 52, 1.1, 4);
  img.rect(205, 18, 32, 34, rgba("#2c2f33")); img.ellipse(221, 18, 16, 4, rgba("#3c4045"));
  // Steel-framed windows (two floors)
  for (const wy of [76, 146]) for (const wx of [36, 112, 188]) {
    img.rect(wx - 3, wy - 3, 56, 58, rgba("#3a2a22"));
    img.rect(wx, wy, 50, 52, linear(0, wy, 0, wy + 52, [[0, rgba("#5d8f98")], [1, rgba("#2f5560")]]));
    for (let gx = wx + 12.5; gx < wx + 50; gx += 12.5) img.rect(gx - 0.8, wy, 1.6, 52, rgba("#1d1d1d"));
    for (let gy = wy + 13; gy < wy + 52; gy += 13) img.rect(wx, gy - 0.8, 50, 1.6, rgba("#1d1d1d"));
    img.fillPoly([[wx + 4, wy + 30], [wx + 24, wy + 4], [wx + 32, wy + 4], [wx + 10, wy + 36]], rgba("#ffffff", 0.18));
    if ((wx + wy) % 3 !== 0) litPane(L, wx, wy, 50, 52, C.warm, 0.65);
  }
  // Ground floor shopfront
  img.rect(28, 214, 214, 76, rgba("#1f2a2c"));
  img.rect(32, 222, 206, 66, linear(0, 222, 0, 288, [[0, rgba("#7fa9ad")], [1, rgba("#3c5f63")]]));
  for (const x of [80, 135, 190]) img.rect(x - 2, 222, 4, 66, rgba("#1f2a2c"));
  img.rect(118, 236, 34, 52, rgba("#2a3638"));
  // Desks seen through the glass
  for (const dx of [50, 168]) { img.rect(dx, 262, 46, 4, C.woodLight); img.rect(dx + 14, 250, 16, 11, rgba("#22272b")); }
  L.rect(32, 222, 206, 66, withAlpha(C.warm, 0.55));
  // Sign board with a neon accent
  img.rect(70, 200, 130, 16, rgba("#203a33"));
  img.stroke([[78, 208], [90, 208]], 3, rgba("#7fe0b0"));
  img.rect(96, 205, 96, 2.5, rgba("#e8efe9", 0.8)); img.rect(96, 210, 60, 2, rgba("#e8efe9", 0.5));
  L.stroke([[78, 208], [90, 208]], 7, withAlpha(rgba("#7fe0b0"), 0.6));
  pot(img, 24, 292, 1.2, 9); pot(img, 246, 292, 1.2, 10);
  return [img, L];
}

function metroStation() {
  const w = 340, h = 400, d = h - 330, img = new Img(w, h, 2), L = new Img(w, h, 2);
  img.ellipse(170, 324 + d, 160, 7, rgba("#000000", 0.2));
  // Elevated hall: curved roof, glass walls, slab with a violet line
  img.fillPoly([...cubic([4, 40], [40, 4], [300, 4], [336, 40], 30)], linear(0, 4, 0, 40, [[0, rgba("#f4f4f2")], [1, rgba("#b8bec4")]]));
  for (let x = 30; x < 320; x += 24) img.stroke([[x, 12 + Math.pow((x - 170) / 170, 2) * 26], [x, 40]], 1.2, rgba("#8a9299", 0.7));
  img.rect(10, 40, 320, 88, linear(0, 40, 0, 128, [[0, rgba("#9ec6d6")], [1, rgba("#4e7d92")]]));
  for (let x = 10; x <= 330; x += 32) img.rect(x - 1.5, 40, 3, 88, rgba("#d8dde2"));
  img.rect(10, 82, 320, 2, rgba("#d8dde2"));
  img.fillPoly([[30, 120], [120, 44], [150, 44], [60, 120]], rgba("#ffffff", 0.14));
  img.rect(4, 126, 332, 22, linear(0, 126, 0, 148, [[0, C.concreteLight], [1, C.concreteDark]]));
  img.rect(4, 132, 332, 4, C.violet);
  for (let x = 12; x < 330; x += 32) litPane(L, x + 2, 44, 28, 36, C.cool, 0.6);
  // Columns
  for (const x of [60, 280]) img.rect(x - 12, 148, 24, 170 + d, linear(x - 12, 0, x + 12, 0, [[0, C.concreteDark], [0.4, C.concreteLight], [1, C.concreteDark]]));
  // Covered stairway rising from the street
  const stair = [[100, 318 + d], [210, 148], [240, 148], [140, 318 + d]];
  img.fillPoly(stair, linear(100, 0, 240, 0, [[0, rgba("#9aa3aa")], [1, rgba("#c7ccd0")]]));
  for (let k = 1; k < 28; k++) { const t = k / 28; img.stroke([[100 + 110 * t, 318 + d - (170 + d) * t], [140 + 100 * t, 318 + d - (170 + d) * t]], 1.2, rgba("#6e767d", 0.8)); }
  img.stroke([[96, 300 + d], [206, 132]], 2.5, rgba("#d8dde2"));
  img.fillPoly([[96, 300 + d], [206, 132], [206, 150], [96, 318 + d]], rgba("#bfe0ec", 0.35));
  img.stroke([[144, 300 + d], [244, 132]], 2.5, rgba("#d8dde2"));
  // Street entrance with a canopy and doors
  img.rect(214, 236 + d, 122, 10, rgba("#f2efe8"));
  img.rect(214, 246 + d, 122, 4, C.violet);
  img.rect(224, 250 + d, 104, 70, rgba("#2a3a46"));
  for (const x of [234, 262, 290, 318]) img.rect(x, 254 + d, 2, 64, rgba("#c9d2d8"));
  L.rect(224, 250 + d, 104, 70, withAlpha(C.cool, 0.5));
  // Wayfinding totem with a train pictogram
  img.rect(20, 220 + d, 8, 100, rgba("#5a5f66"));
  img.rect(8, 200 + d, 32, 44, C.violet);
  img.rect(12, 212 + d, 24, 12, rgba("#ffffff")); img.rect(14, 214 + d, 6, 5, C.violet); img.rect(22, 214 + d, 6, 5, C.violet); img.rect(30, 214 + d, 4, 5, C.violet);
  img.circle(17, 227 + d, 2, rgba("#ffffff")); img.circle(31, 227 + d, 2, rgba("#ffffff"));
  L.rect(8, 200 + d, 32, 44, withAlpha(rgba("#b39cff"), 0.45));
  return [img, L];
}

function bookshop() {
  const w = 250, h = 250, img = new Img(w, h, 3), L = new Img(w, h, 2);
  const r = rng(231);
  img.ellipse(125, 244, 120, 6, rgba("#000000", 0.2));
  // Upper floor: cream walls, arched windows, green shutters, a small balcony
  img.rect(16, 30, 218, 120, linear(0, 30, 0, 150, [[0, rgba("#f1e6cc")], [1, rgba("#ddcca8")]]));
  img.rect(10, 22, 230, 10, rgba("#c9b48c"));
  img.fillPoly([[10, 22], [125, 4], [240, 22]], linear(0, 4, 0, 22, [[0, C.tile], [1, C.tileDark]]));
  for (const x of [46, 112, 178]) {
    img.rect(x, 54, 28, 46, rgba("#3a4a40"));
    img.circle(x + 14, 54, 14, rgba("#3a4a40"));
    img.rect(x - 10, 50, 10, 52, rgba("#3f7a5a")); img.rect(x + 28, 50, 10, 52, rgba("#3f7a5a"));
    for (let y = 54; y < 100; y += 5) { img.stroke([[x - 10, y], [x, y]], 0.8, rgba("#2a5a40")); img.stroke([[x + 28, y], [x + 38, y]], 0.8, rgba("#2a5a40")); }
    litPane(L, x + 2, 56, 24, 42, C.warm, 0.6);
  }
  img.rect(90, 104, 72, 4, rgba("#3a3a3a"));
  for (let x = 92; x < 162; x += 6) img.rect(x, 108, 1.5, 14, rgba("#3a3a3a"));
  img.rect(90, 120, 72, 3, rgba("#3a3a3a"));
  // Tiled awning over the shopfront
  img.fillPoly([[4, 152], [246, 152], [236, 128], [14, 128]], linear(0, 128, 0, 152, [[0, shade(C.tile, 0.1)], [1, C.tileDark]]));
  for (let x = 16; x < 240; x += 9) img.stroke([[x, 129], [x - 2, 151]], 1, withAlpha(C.tileDark, 0.7));
  // Sign board
  img.rect(40, 132, 170, 16, rgba("#5a1e1e"));
  img.rect(46, 137, 6, 6, rgba("#f2c230")); img.rect(58, 138, 120, 2.5, rgba("#f4e6c8", 0.85)); img.rect(58, 143, 80, 2, rgba("#f4e6c8", 0.5));
  // Shop: rolled-up shutter, shelves of books
  img.rect(16, 152, 218, 88, rgba("#d9c8a2"));
  img.rect(26, 156, 198, 10, linear(0, 156, 0, 166, [[0, rgba("#9aa0a6")], [1, rgba("#5f656b")]]));
  img.rect(30, 166, 190, 74, rgba("#3a2617"));
  for (let sy = 172; sy < 236; sy += 16) {
    img.rect(30, sy + 13, 190, 3, C.woodLight);
    for (let x = 32; x < 216;) {
      const bw = 3 + r() * 5, bh = 9 + r() * 4;
      img.rect(x, sy + 13 - bh, bw, bh, rgba(["#c0392b", "#2e86c1", "#f2c230", "#27ae60", "#8e44ad", "#e67e22", "#ecf0f1", "#16a085"][Math.floor(r() * 8)]));
      x += bw + 0.8;
    }
  }
  L.rect(30, 166, 190, 74, withAlpha(C.warm, 0.5));
  // Display table with stacked books, and a chalkboard easel
  img.rect(70, 214, 110, 6, C.wood); img.rect(76, 220, 4, 20, C.woodDark); img.rect(170, 220, 4, 20, C.woodDark);
  for (let k = 0; k < 6; k++) { const bx = 78 + k * 16; for (let j = 0; j < 2 + (k % 3); j++) img.rect(bx, 210 - j * 5, 13, 4.5, rgba(["#c0392b", "#2e86c1", "#f2c230", "#27ae60", "#ecf0f1"][(k + j) % 5])); }
  img.fillPoly([[200, 240], [214, 196], [244, 196], [246, 240]], rgba("#2b2b2b"));
  img.stroke([[200, 240], [214, 196]], 3, C.wood); img.stroke([[246, 240], [244, 196]], 3, C.wood);
  for (let k = 0; k < 4; k++) img.rect(216, 204 + k * 8, 20 - k * 3, 2, rgba("#f4f4f4", 0.75));
  return [img, L];
}

function startupGarage() {
  const w = 280, h = 230, img = new Img(w, h, 3), L = new Img(w, h, 2);
  img.ellipse(140, 224, 134, 6, rgba("#000000", 0.2));
  // Painted wall with a geometric mural
  img.rect(10, 40, 260, 184, rgba("#e9e1d2"));
  img.fillPoly([[10, 224], [10, 140], [70, 90], [120, 224]], rgba("#f2a65a", 0.75));
  img.fillPoly([[180, 224], [270, 120], [270, 224]], rgba("#5fb0a8", 0.75));
  img.circle(236, 80, 24, rgba("#f2c230", 0.8));
  img.rect(4, 32, 272, 10, rgba("#cfc6b6"));
  // Roof: solar panel and a satellite dish
  img.fillPoly([[30, 32], [40, 10], [120, 10], [110, 32]], rgba("#2a3c5c"));
  for (let x = 48; x < 120; x += 14) img.stroke([[x, 10], [x - 8, 32]], 0.8, rgba("#8fa8d0", 0.7));
  img.stroke([[40, 21], [116, 21]], 0.8, rgba("#8fa8d0", 0.7));
  img.ellipse(220, 22, 12, 9, rgba("#d8dde2"), 1, -0.5); img.rect(219, 26, 3, 8, rgba("#8a9299"));
  // Raised roller shutter and the room inside
  img.rect(54, 92, 172, 132, rgba("#2b2f36"));
  img.rect(54, 84, 172, 14, linear(0, 84, 0, 98, [[0, rgba("#b5bcc3")], [1, rgba("#6f777f")]]));
  for (let y = 86; y < 98; y += 3) img.stroke([[54, y], [226, y]], 0.6, rgba("#4c535a"));
  img.rect(62, 104, 156, 120, linear(0, 104, 0, 224, [[0, rgba("#3c4450")], [1, rgba("#2a3038")]]));
  // Whiteboard with sticky notes
  img.rect(72, 112, 70, 44, rgba("#f4f6f6"));
  for (const [nx, ny, c] of [[78, 118, "#f7d84a"], [92, 118, "#f59fb0"], [106, 120, "#8fd6f0"], [80, 136, "#9fe39a"], [120, 132, "#f7d84a"]]) img.rect(nx, ny, 10, 10, rgba(c));
  img.stroke([[96, 146], [134, 140]], 1.2, rgba("#3060c0"));
  // Desk, two monitors, a bean bag
  img.rect(140, 176, 72, 5, C.woodLight); img.rect(144, 181, 3, 40, C.woodDark); img.rect(206, 181, 3, 40, C.woodDark);
  for (const mx of [150, 180]) { img.rect(mx, 150, 26, 18, rgba("#111418")); img.rect(mx + 2, 152, 22, 14, rgba("#4fa3d8")); img.rect(mx + 11, 168, 4, 8, rgba("#555")); L.rect(mx, 148, 26, 22, withAlpha(rgba("#8fd0ff"), 0.85)); }
  img.ellipse(96, 212, 22, 13, rgba("#d0573a"));
  L.rect(62, 104, 156, 120, withAlpha(C.warm, 0.35));
  // Sign: a little rocket on a round board
  img.circle(140, 62, 17, rgba("#203040"));
  img.fillPoly([[140, 49], [146, 60], [146, 70], [134, 70], [134, 60]], rgba("#f4f1ea"));
  img.fillPoly([[134, 66], [129, 73], [134, 72]], rgba("#f2a65a")); img.fillPoly([[146, 66], [151, 73], [146, 72]], rgba("#f2a65a"));
  img.circle(140, 59, 2.3, rgba("#5fb0a8"));
  L.circle(140, 62, 22, withAlpha(rgba("#ffd27a"), 0.35));
  bulbs(img, L, 14, 46, 266, 46, 14, 14, [C.warm, rgba("#ff9a6a"), rgba("#9fe0ff")]);
  // A scooter parked outside and a plant
  const sx = 240, sy = 222;
  img.circle(sx - 18, sy - 9, 9, rgba("#1b1b1d")); img.circle(sx + 20, sy - 9, 9, rgba("#1b1b1d"));
  img.fillPoly([[sx - 28, sy - 14], [sx + 4, sy - 16], [sx + 16, sy - 36], [sx + 22, sy - 36], [sx + 26, sy - 12], [sx - 26, sy - 6]], rgba("#3a7fc0"));
  img.rect(sx - 22, sy - 24, 26, 7, rgba("#1d1d1d"));
  img.stroke([[sx + 18, sy - 36], [sx + 14, sy - 46]], 2.5, rgba("#555")); img.stroke([[sx + 8, sy - 46], [sx + 20, sy - 46]], 2.5, rgba("#333"));
  pot(img, 30, 224, 1.3, 12);
  return [img, L];
}

function darshini() {
  const w = 310, h = 270, img = new Img(w, h, 3), L = new Img(w, h, 2);
  img.ellipse(155, 264, 150, 7, rgba("#000000", 0.2));
  // Building and upper wall
  img.rect(10, 20, 290, 244, linear(0, 20, 0, 264, [[0, rgba("#8fd0c2")], [1, rgba("#62a99a")]]));
  img.rect(4, 14, 302, 10, rgba("#e8ede6"));
  for (const x of [30, 120, 210]) { img.rect(x, 32, 70, 34, rgba("#2f4a48")); for (let k = 1; k < 4; k++) img.rect(x + k * 17.5, 32, 2, 34, rgba("#9cc8bf")); litPane(L, x + 2, 34, 66, 30, C.warm, 0.45); }
  // Big painted board: banana leaf with an idli plate and a coffee tumbler (no lettering)
  img.rect(14, 74, 282, 56, rgba("#a8241e"));
  img.rect(18, 78, 274, 48, linear(0, 78, 0, 126, [[0, rgba("#ffd84a")], [1, rgba("#f2b81e")]]));
  img.fillPoly([...cubic([30, 112], [50, 84], [100, 82], [128, 100], 12), ...cubic([128, 100], [104, 122], [54, 124], [30, 112], 12)], rgba("#3f9a3a"));
  img.stroke(cubic([32, 111], [60, 100], [96, 98], [126, 100], 12), 1.2, rgba("#2a6a28"));
  for (const [ix, iy] of [[62, 104], [80, 100], [98, 104]]) { img.ellipse(ix, iy, 9, 5, rgba("#fbf7ee")); img.ellipse(ix, iy - 1.5, 6, 2, rgba("#ffffff")); }
  img.fillPoly([[248, 86], [266, 86], [263, 114], [251, 114]], linear(248, 0, 266, 0, [[0, rgba("#9aa3aa")], [0.4, rgba("#f2f4f6")], [1, rgba("#8a9299")]]));
  img.ellipse(257, 116, 16, 4, rgba("#b8bfc5"));
  for (let k = 0; k < 3; k++) img.stroke(cubic([253 + k * 4, 82], [249 + k * 4, 76], [259 + k * 4, 72], [255 + k * 4, 66], 8), 1.5, rgba("#ffffff", 0.8));
  for (let x = 140; x < 230; x += 12) img.rect(x, 96 + ((x / 12) % 2) * 3, 8, 3, rgba("#7a1a14", 0.85));
  // Striped awning
  img.fillPoly([[2, 156], [308, 156], [296, 132], [14, 132]], (x, y) => (Math.floor(x / 18) % 2 ? rgba("#f4f1ea") : rgba("#d9472f")));
  img.fillPoly([[2, 156], [308, 156], [308, 162], [2, 162]], rgba("#a8241e"));
  for (let x = 2; x < 308; x += 18) img.circle(x + 9, 162, 9, Math.floor(x / 18) % 2 ? rgba("#f4f1ea") : rgba("#d9472f"));
  // Mango-leaf toran with marigolds over the entrance
  for (let x = 20; x < 292; x += 11) { img.fillPoly([[x, 172], [x + 4, 172], [x + 2, 188]], rgba("#3f8a34")); img.circle(x + 7.5, 174, 3, rgba("#f2a019")); }
  // Interior and counter
  img.rect(14, 172, 282, 92, rgba("#3a2a20"));
  L.rect(14, 172, 282, 92, withAlpha(C.warm, 0.5));
  for (let x = 20; x < 292; x += 11) L.circle(x + 7.5, 174, 5, withAlpha(rgba("#ffcf6a"), 0.5));
  img.rect(14, 182, 282, 4, rgba("#5a4030"));
  // Menu board
  img.rect(24, 192, 46, 50, rgba("#1f2422")); img.rect(26, 194, 42, 46, rgba("#2c3430"));
  for (let k = 0; k < 6; k++) { img.rect(30, 200 + k * 7, 22, 2, rgba("#f4f1ea", 0.8)); img.rect(56, 200 + k * 7, 8, 2, rgba("#f2c230", 0.8)); }
  // Idli steamer, dosa on the tawa, vada pile, tumbler stack
  img.rect(84, 196, 30, 34, linear(84, 0, 114, 0, [[0, C.steelDark], [0.4, rgba("#eef1f3")], [1, C.steelDark]]));
  img.ellipse(99, 196, 15, 4, rgba("#d8dde2"));
  img.ellipse(140, 226, 26, 5, rgba("#2b2b2b"));
  img.ellipse(140, 224, 22, 3.5, rgba("#d99a4a"));
  for (let k = 0; k < 6; k++) img.circle(178 + (k % 3) * 9, 222 - Math.floor(k / 3) * 6, 5, rgba("#b8732e"));
  for (let k = 0; k < 4; k++) for (let j = 0; j <= k; j++) img.rect(212 + j * 9 - k * 4.5 + 12, 222 - (3 - k) * 9, 7, 8, linear(0, 0, 7, 0, [[0, C.steelDark], [0.5, rgba("#f2f4f6")], [1, C.steelDark]]));
  // Steel counter
  img.rect(76, 230, 220, 34, linear(0, 230, 0, 264, [[0, rgba("#e8ecef")], [0.2, C.steel], [1, C.steelDark]]));
  img.rect(76, 230, 220, 3, rgba("#ffffff"));
  for (let x = 96; x < 296; x += 40) img.rect(x, 234, 1.5, 28, rgba("#8a9299", 0.6));
  // A standing table (darshinis are stand-and-eat) at the front
  img.rect(30, 236, 34, 4, C.steel); img.rect(45, 240, 4, 24, C.steelDark); img.ellipse(47, 263, 12, 2.5, C.steelDark);
  img.ellipse(42, 235, 8, 2, rgba("#ffffff")); img.rect(54, 228, 6, 8, C.steel);
  return [img, L];
}

function filterKaapi() {
  const w = 200, h = 220, img = new Img(w, h, 3), L = new Img(w, h, 2);
  img.ellipse(100, 214, 94, 6, rgba("#000000", 0.2));
  // Canopy umbrella-roof
  img.fillPoly([[4, 66], [100, 20], [196, 66]], (x, y) => (Math.floor(Math.atan2(x - 100, y - 10) * 6) % 2 ? rgba("#f4f1ea") : rgba("#2f7a5a")));
  img.stroke([[4, 66], [196, 66]], 3, rgba("#1f5a40"));
  img.circle(100, 18, 4, C.brass);
  for (const x of [22, 178]) img.rect(x - 3, 66, 6, 146, rgba("#5a5f66"));
  // Kiosk box
  img.rect(14, 136, 172, 78, linear(0, 136, 0, 214, [[0, rgba("#3e7fb0")], [1, rgba("#2a5a80")]]));
  img.rect(10, 128, 180, 10, C.woodLight);
  for (let x = 30; x < 180; x += 30) img.rect(x, 142, 22, 66, rgba("#336c96"));
  // Little board with a cup icon
  img.rect(60, 76, 80, 22, rgba("#3a2214"));
  img.fillPoly([[90, 81], [104, 81], [102, 94], [92, 94]], rgba("#f4f1ea")); img.ellipse(97, 95, 9, 2, rgba("#d8dde2"));
  img.rect(108, 85, 26, 2.5, rgba("#f2c230", 0.8)); img.rect(66, 85, 18, 2.5, rgba("#f2c230", 0.8));
  bulbs(img, L, 8, 68, 192, 68, 10, 10, [C.warm]);
  // Big brass decoction filter, milk vessel on a stove with a blue flame
  img.rect(30, 92, 26, 18, linear(30, 0, 56, 0, [[0, C.brassDark], [0.4, shade(C.brass, 0.35)], [1, C.brassDark]]));
  img.rect(28, 108, 30, 22, linear(28, 0, 58, 0, [[0, C.brassDark], [0.4, shade(C.brass, 0.3)], [1, C.brassDark]]));
  img.ellipse(43, 92, 13, 3, shade(C.brass, 0.3)); img.circle(43, 88, 3, C.brassDark);
  img.rect(120, 122, 44, 6, rgba("#2b2b2b"));
  for (let k = 0; k < 5; k++) img.fillPoly([[126 + k * 8, 122], [129 + k * 8, 114], [132 + k * 8, 122]], rgba("#4aa0ff", 0.9));
  L.ellipse(142, 120, 22, 6, withAlpha(rgba("#6ab8ff"), 0.6));
  img.rect(122, 92, 40, 30, linear(122, 0, 162, 0, [[0, C.steelDark], [0.35, rgba("#f2f4f6")], [1, C.steelDark]]));
  img.ellipse(142, 92, 20, 4, rgba("#e8ecef")); img.ellipse(142, 92, 16, 3, rgba("#f6efe0"));
  // Tumbler-and-davara sets along the counter
  for (let k = 0; k < 5; k++) {
    const x = 66 + k * 11;
    img.ellipse(x, 128, 6, 1.8, C.steelDark);
    img.fillPoly([[x - 3.5, 116], [x + 3.5, 116], [x + 3, 127], [x - 3, 127]], linear(x - 4, 0, x + 4, 0, [[0, C.steelDark], [0.5, rgba("#f4f6f8")], [1, C.steelDark]]));
  }
  L.rect(14, 70, 172, 60, withAlpha(C.warm, 0.25));
  return [img, L];
}

function autoStand() {
  const w = 300, h = 180, img = new Img(w, h, 3);
  img.ellipse(150, 174, 146, 6, rgba("#000000", 0.18));
  // Shelter: two posts and a yellow sloping sheet roof
  for (const x of [40, 260]) img.rect(x - 3, 40, 6, 134, rgba("#3a3f45"));
  img.fillPoly([[20, 46], [280, 30], [284, 40], [24, 58]], linear(0, 30, 0, 58, [[0, shade(C.autoYellow, 0.1)], [1, shade(C.autoYellow, -0.3)]]));
  for (let x = 30; x < 280; x += 12) img.stroke([[x, 46 - (x - 20) * 0.06], [x + 2, 57 - (x - 20) * 0.06]], 0.8, rgba("#9a7a10", 0.7));
  // Stand board (black with yellow border) and an auto pictogram
  img.rect(110, 4, 84, 30, rgba("#f2c230")); img.rect(113, 7, 78, 24, rgba("#1d1d1f"));
  img.rect(140, 34, 4, 8, rgba("#3a3f45")); img.rect(160, 34, 4, 8, rgba("#3a3f45"));
  drawAuto(img, 119, 9, 0.2);
  img.rect(146, 14, 40, 2.5, rgba("#f2c230", 0.85)); img.rect(146, 20, 28, 2, rgba("#f2c230", 0.6));
  // Bench and two parked autos
  img.rect(110, 136, 90, 6, rgba("#6a6f75")); img.rect(116, 142, 4, 30, rgba("#4a4f55")); img.rect(190, 142, 4, 30, rgba("#4a4f55"));
  drawAuto(img, 6, 96, 0.92, { seed: 3 });
  drawAuto(img, 192, 98, 0.9, { seed: 4 });
  return img;
}

function busStop() {
  const w = 270, h = 210, img = new Img(w, h, 3), L = new Img(w, h, 2);
  img.ellipse(135, 204, 130, 6, rgba("#000000", 0.18));
  // Curved roof on a steel frame
  img.fillPoly(cubic([6, 40], [60, 14], [210, 14], [264, 40], 20).concat([[264, 50], [6, 50]]), linear(0, 18, 0, 50, [[0, rgba("#e6e9ec")], [1, rgba("#8f979e")]]));
  img.rect(6, 48, 258, 4, rgba("#2f7a5a"));
  L.rect(10, 50, 250, 6, withAlpha(C.cool, 0.6));
  for (const x of [20, 250]) img.rect(x - 3, 50, 6, 152, rgba("#5a6168"));
  // Back glass panel and an advert lightbox (a landscape, no text)
  img.rect(26, 60, 160, 110, rgba("#bfe0ec", 0.35));
  img.rect(26, 60, 160, 3, rgba("#5a6168"));
  img.rect(190, 60, 54, 110, rgba("#3a4048"));
  img.rect(194, 64, 46, 102, linear(0, 64, 0, 166, [[0, rgba("#ffb46a")], [0.55, rgba("#ff7d6a")], [1, rgba("#5a3a7a")]]));
  img.circle(217, 98, 10, rgba("#fff1b0"));
  img.fillPoly([[194, 166], [194, 130], [212, 116], [228, 134], [240, 122], [240, 166]], rgba("#3a2a5a"));
  L.rect(194, 64, 46, 102, withAlpha(rgba("#ffd2a0"), 0.75));
  // Route board with coloured route lines
  img.rect(34, 70, 70, 50, rgba("#1d2a33"));
  for (const [k, c] of [[0, "#f2c230"], [1, "#5fd0c8"], [2, "#f07a5a"], [3, "#a0d468"]]) { img.rect(40, 78 + k * 10, 10, 5, rgba(c)); img.rect(54, 79 + k * 10, 44, 2.5, rgba("#e8eef2", 0.8)); }
  L.rect(34, 70, 70, 50, withAlpha(C.cool, 0.4));
  // Bench and a bin
  img.rect(40, 152, 140, 8, rgba("#7a8188")); img.rect(48, 160, 4, 36, rgba("#5a6168")); img.rect(168, 160, 4, 36, rgba("#5a6168"));
  img.rect(30, 140, 150, 4, rgba("#7a8188"));
  img.rect(204, 172, 20, 30, rgba("#2f7a5a")); img.rect(202, 170, 24, 4, rgba("#3c8f6a"));
  return [img, L];
}

function bandstand() {
  const w = 260, h = 280, img = new Img(w, h, 3), L = new Img(w, h, 2);
  img.ellipse(130, 274, 126, 7, rgba("#000000", 0.2));
  // Stone plinth with steps
  img.fillPoly([[16, 244], [244, 244], [236, 272], [24, 272]], linear(0, 244, 0, 272, [[0, rgba("#d6cfc2")], [1, rgba("#a59c8c")]]));
  for (let k = 0; k < 3; k++) img.rect(100 - k * 6, 248 + k * 8, 60 + k * 12, 8, shade(rgba("#cfc7b8"), -0.05 * k));
  // Columns and railing
  const cols = [34, 74, 112, 148, 186, 226];
  for (const x of cols) img.rect(x - 4, 116, 8, 128, linear(x - 4, 0, x + 4, 0, [[0, rgba("#1f4a3a")], [0.4, rgba("#4f8a70")], [1, rgba("#1f4a3a")]]));
  img.rect(30, 214, 200, 4, rgba("#1f4a3a")); img.rect(30, 236, 200, 3, rgba("#1f4a3a"));
  for (let x = 32; x < 230; x += 7) img.rect(x, 218, 1.6, 18, rgba("#2f5a48"));
  // Ornamental frieze
  img.rect(18, 104, 224, 14, rgba("#f4ede0"));
  for (let x = 24; x < 238; x += 12) img.fillPoly([[x, 118], [x + 6, 126], [x + 12, 118]], rgba("#f4ede0"));
  for (let x = 24; x < 238; x += 12) img.circle(x + 6, 111, 2.2, rgba("#b2502e"));
  // Roof: a red pagoda-like cone with white trim and a finial
  img.fillPoly([...cubic([6, 106], [60, 92], [100, 60], [130, 22], 16), ...cubic([130, 22], [160, 60], [200, 92], [254, 106], 16)], linear(0, 22, 0, 106, [[0, rgba("#c9533a")], [1, rgba("#8a2c1c")]]));
  for (let k = 1; k < 6; k++) { const t = k / 6; img.stroke([[130 - 124 * t, 22 + 84 * t], [130 + 124 * t, 22 + 84 * t]], 0, rgba("#000", 0)); }
  for (let k = -5; k <= 5; k++) img.stroke(quad([130, 24], [130 + k * 14, 70], [130 + k * 24, 106], 10), 1, rgba("#6a1c10", 0.5));
  img.stroke(cubic([6, 106], [60, 92], [100, 60], [130, 22], 16), 2, rgba("#f4ede0"));
  img.stroke(cubic([130, 22], [160, 60], [200, 92], [254, 106], 16), 2, rgba("#f4ede0"));
  img.rect(127, 4, 6, 20, C.brass); img.circle(130, 6, 5, shade(C.brass, 0.2));
  // Hanging lamp inside and bulbs along the eaves
  img.stroke([[130, 118], [130, 150]], 1, rgba("#333"));
  img.fillPoly([[122, 150], [138, 150], [134, 166], [126, 166]], rgba("#d9a83a"));
  L.circle(130, 160, 40, withAlpha(C.warm, 0.35)); L.circle(130, 158, 8, withAlpha(C.warm, 1));
  for (let x = 24; x < 238; x += 16) { img.circle(x + 6, 128, 2.4, rgba("#f6e6b0")); L.circle(x + 6, 128, 6, withAlpha(C.warm, 0.5)); L.circle(x + 6, 128, 2.6, withAlpha(rgba("#fff3c8"), 1)); }
  return [img, L];
}

function pushcart() {
  const w = 160, h = 150, img = new Img(w, h, 3);
  img.ellipse(80, 145, 70, 5, rgba("#000000", 0.18));
  // Umbrella
  img.fillPoly([...cubic([10, 40], [40, 4], [120, 4], [150, 40], 20)], (x) => (Math.floor(x / 20) % 2 ? rgba("#f2c230") : rgba("#d9472f")));
  img.rect(78, 38, 4, 60, rgba("#5a5f66"));
  // Cart
  img.rect(20, 96, 120, 10, C.woodLight); img.rect(24, 106, 112, 18, C.wood);
  img.circle(44, 130, 13, rgba("#2a2a2a")); img.circle(44, 130, 5, rgba("#8a9299"));
  img.circle(116, 130, 13, rgba("#2a2a2a")); img.circle(116, 130, 5, rgba("#8a9299"));
  img.stroke([[136, 104], [156, 92]], 3, C.woodDark);
  // Mangoes, bananas, guavas
  const r = rng(301);
  for (let i = 0; i < 16; i++) img.ellipse(28 + r() * 104, 90 + r() * 6, 6, 5, [rgba("#f2a019"), rgba("#f2c230"), rgba("#7fbf3f"), rgba("#e85a2a")][i % 4]);
  for (let k = 0; k < 5; k++) img.ellipse(40 + k * 6, 80, 3.5, 9, rgba("#f2d13b"), 1, 0.3);
  return img;
}

// ── Moving decor ─────────────────────────────────────────────────────────────
function train(lit) {
  const coachW = 150, n = 4, gap = 6, w = n * coachW + (n - 1) * gap + 4, h = 66;
  const img = new Img(w, h, 3);
  for (let i = 0; i < n; i++) {
    const x = 2 + i * (coachW + gap), x1 = x + coachW;
    const front = i === n - 1, back = i === 0;
    const body = [[x + (back ? 14 : 0), 8], [x1 - (front ? 18 : 0), 8], ...(front ? cubic([x1 - 18, 8], [x1 - 2, 10], [x1, 30], [x1, 52], 10) : [[x1, 8], [x1, 52]]), [x, 52], ...(back ? cubic([x, 52], [x, 30], [x + 2, 10], [x + 14, 8], 10) : [[x, 8]])];
    if (!lit) {
      img.fillPoly(body, linear(0, 8, 0, 52, [[0, rgba("#f2f4f6")], [0.6, rgba("#d4dadf")], [1, rgba("#9aa3aa")]]));
      img.rect(x + 2, 40, coachW - 4, 6, C.violet);
      img.rect(x + 2, 47, coachW - 4, 2, rgba("#4fae7a"));
      img.rect(x + 6, 8, coachW - 12, 3, rgba("#b8bfc5"));
      // Windows and doors
      for (let k = 0; k < 4; k++) img.rect(x + 14 + k * 34, 16, 22, 18, rgba("#2c4256"));
      for (const dx of [36, 104]) { img.rect(x + dx, 14, 14, 36, rgba("#c4cbd1")); img.rect(x + dx + 3, 17, 8, 14, rgba("#2c4256")); }
      // Bogies and wheels
      img.rect(x + 6, 52, coachW - 12, 6, rgba("#3a3f45"));
      for (const wx of [18, 36, coachW - 36, coachW - 18]) img.circle(x + wx, 60, 5, rgba("#22262a"));
      if (front) { img.fillPoly([[x1 - 16, 14], [x1 - 6, 16], [x1 - 2, 34], [x1 - 16, 34]], rgba("#2c4256")); img.circle(x1 - 4, 44, 2.5, rgba("#fff6c8")); }
      if (back) { img.fillPoly([[x + 16, 14], [x + 6, 16], [x + 2, 34], [x + 16, 34]], rgba("#2c4256")); img.circle(x + 4, 44, 2.5, rgba("#ff5a4a")); }
    } else {
      for (let k = 0; k < 4; k++) { img.rect(x + 12 + k * 34, 14, 26, 22, withAlpha(C.cool, 0.3)); img.rect(x + 14 + k * 34, 16, 22, 18, withAlpha(rgba("#ffe9a8"), 0.95)); }
      if (front) img.circle(x1 - 4, 44, 6, withAlpha(rgba("#fff6c8"), 0.9));
      if (back) img.circle(x + 4, 44, 5, withAlpha(rgba("#ff5a4a"), 0.9));
    }
    if (!lit && i < n - 1) img.rect(x1, 30, gap, 14, rgba("#3a3f45"));
  }
  return img;
}

function bus() {
  const w = 270, h = 120, img = new Img(w, h, 3);
  img.ellipse(135, 116, 124, 5, rgba("#000000", 0.22));
  img.fillPoly([[8, 14], [252, 14], ...cubic([252, 14], [264, 16], [268, 30], [268, 50], 8), [268, 100], [6, 100], [6, 18]], linear(0, 14, 0, 100, [[0, rgba("#f2efe6")], [0.45, rgba("#e8e2d2")], [0.46, rgba("#2f8f8a")], [1, rgba("#1f6a66")]]));
  img.rect(6, 54, 262, 5, rgba("#f2c230"));
  for (let x = 20; x < 220; x += 34) img.rect(x, 22, 28, 26, rgba("#2c4256"));
  img.fillPoly([[236, 22], [256, 22], [264, 34], [266, 50], [236, 50]], rgba("#2c4256"));
  img.rect(206, 60, 26, 38, rgba("#d8dde2")); img.rect(209, 63, 20, 30, rgba("#2c4256"));
  img.rect(100, 16, 70, 4, rgba("#f2a019", 0.9));
  img.circle(264, 84, 3, rgba("#fff6c8"));
  for (const wx of [50, 222]) { img.circle(wx, 100, 14, rgba("#1b1b1d")); img.circle(wx, 100, 6, rgba("#9aa0a6")); }
  // Passengers' heads in the windows
  const r = rng(321);
  for (let x = 20; x < 220; x += 34) if (r() < 0.7) { img.circle(x + 14, 40, 6, C.skin); img.ellipse(x + 14, 35, 6, 3, rgba("#1d1d1d")); }
  return img;
}

function scooter() {
  const w = 90, h = 84, img = new Img(w, h, 3);
  img.ellipse(45, 81, 38, 3, rgba("#000000", 0.2));
  img.circle(18, 70, 11, rgba("#1b1b1d")); img.circle(18, 70, 4, rgba("#9aa0a6"));
  img.circle(72, 70, 11, rgba("#1b1b1d")); img.circle(72, 70, 4, rgba("#9aa0a6"));
  img.fillPoly([[8, 64], [44, 62], [58, 38], [66, 38], [74, 64], [10, 72]], rgba("#d9472f"));
  img.rect(14, 52, 32, 8, rgba("#1d1d1d"));
  img.stroke([[64, 38], [60, 26]], 3, rgba("#555")); img.stroke([[54, 26], [66, 26]], 3, rgba("#333"));
  // Rider with a helmet
  img.stroke([[30, 52], [46, 58], [50, 70]], 6, rgba("#34405a"));
  img.fillPoly([[22, 26], [36, 26], [38, 52], [24, 52]], rgba("#e6e0d0"));
  img.stroke([[34, 32], [56, 28]], 4, rgba("#e6e0d0"));
  img.circle(31, 16, 9, rgba("#f2c230")); img.rect(31, 12, 9, 6, rgba("#2c4256"));
  return img;
}

function streetLamp() {
  const w = 70, h = 250, img = new Img(w, h, 3);
  img.rect(20, 238, 16, 10, rgba("#3c4a44"));
  img.taper([[28, 240], [28, 30]], 7, 4.5, linear(24, 0, 32, 0, [[0, rgba("#2c3a34")], [0.5, rgba("#5a7068")], [1, rgba("#2c3a34")]]));
  img.stroke(quad([28, 32], [30, 12], [56, 14], 12), 3.5, rgba("#3c4a44"));
  img.fillPoly([[46, 14], [66, 14], [62, 22], [50, 22]], rgba("#3c4a44"));
  img.ellipse(56, 22, 7, 2.2, rgba("#fff3c8"));
  return img;
}

function trafficSignal() {
  const w = 50, h = 220, img = new Img(w, h, 3);
  img.rect(19, 206, 12, 12, rgba("#3a3f45"));
  img.rect(22, 50, 6, 160, (x, y) => (Math.floor(y / 14) % 2 ? rgba("#f2f2f2") : rgba("#1d1d1d")));
  img.rect(10, 4, 30, 78, rgba("#1d1f22"));
  for (const [k, c] of [[0, "#5a1a16"], [1, "#e89a1a"], [2, "#1a4a2a"]]) {
    img.rect(8, 10 + k * 24, 34, 4, rgba("#1d1f22"));
    img.circle(25, 19 + k * 24, 8, rgba(c));
  }
  return img;
}

function kite() {
  const w = 70, h = 140, img = new Img(w, h, 3);
  img.fillPoly([[35, 4], [62, 34], [35, 72], [8, 34]], rgba("#e94e6a"));
  img.fillPoly([[35, 4], [62, 34], [35, 34]], rgba("#f2c230"));
  img.fillPoly([[8, 34], [35, 34], [35, 72]], rgba("#5fb0d8"));
  img.stroke([[35, 4], [35, 72]], 1.2, rgba("#7a4c2a")); img.stroke([[8, 34], [62, 34]], 1.2, rgba("#7a4c2a"));
  img.stroke(cubic([35, 72], [24, 92], [46, 108], [34, 136], 16), 1.2, rgba("#7a4c2a"));
  for (const [x, y] of [[30, 88], [40, 104], [36, 122]]) img.fillPoly([[x - 5, y - 3], [x + 5, y + 3], [x + 5, y - 3], [x - 5, y + 3]], rgba("#e94e6a"));
  return img;
}

function steam() {
  const w = 70, h = 130, img = new Img(w, h, 2);
  const r = rng(341);
  for (let i = 0; i < 14; i++) {
    const t = i / 14, y = h - 12 - t * (h - 30);
    img.circle(w / 2 + Math.sin(t * 7) * 10 + (r() - 0.5) * 6, y, 6 + t * 12, rgba("#ffffff", 0.32 * (1 - t * 0.7)));
  }
  img.blur(3);
  return img;
}

/** Night overlays sit under the scene's night tint, so stack them to stay bright. */
function boost(img) {
  const out = new Img(img.w, img.h, img.ss);
  out.draw(img); out.draw(img);
  return out;
}

// ── Build ────────────────────────────────────────────────────────────────────
export function buildBengaluru(outDir) {
  const out = (n) => path.join(outDir, n);
  console.log("Bengaluru Tech Park:");
  skyline().save(out("skyline.png"));
  skylineLights().save(out("skyline_lights.png"));
  viaduct().save(out("viaduct.png"));
  park().save(out("park.png"));
  ground().save(out("ground.png"));
  const props = { tech_park: techPark, coworking, metro_station: metroStation, bookshop, startup_garage: startupGarage, darshini, filter_kaapi: filterKaapi, bus_stop: busStop, bandstand };
  for (const [name, fn] of Object.entries(props)) {
    const [img, lights] = fn();
    img.save(out(`${name}.png`));
    boost(lights.blur(0.6)).save(out(`${name}_lights.png`));
  }
  autoStand().save(out("auto_stand.png"));
  pushcart().save(out("pushcart.png"));
  train(false).save(out("metro_train.png"));
  boost(train(true)).save(out("metro_train_lights.png"));
  auto(false, 1).save(out("auto_a.png"));
  auto(true, 2).save(out("auto_b.png"));
  bus().save(out("city_bus.png"));
  scooter().save(out("scooter.png"));
  rainTree(380, 430, 401).save(out("rain_tree_a.png"));
  rainTree(340, 400, 402).save(out("rain_tree_b.png"));
  gulmohar(300, 340, 411).save(out("gulmohar_a.png"));
  gulmohar(260, 300, 412).save(out("gulmohar_b.png"));
  streetLamp().save(out("street_lamp.png"));
  trafficSignal().save(out("traffic_signal.png"));
  kite().save(out("kite.png"));
  steam().save(out("steam.png"));
  cloud(380, 130, 71).save(out("cloud_a.png"));
  cloud(300, 104, 72).save(out("cloud_b.png"));
  cloud(440, 150, 73).save(out("cloud_c.png"));
  glow(160, rgba("#ffc861")).save(out("glow_warm.png"));
  glow(90, rgba("#fff1b0")).save(out("glow_small.png"));
  glow(60, rgba("#ffae1a")).save(out("glow_amber.png"));
}
