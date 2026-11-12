/**
 * Kerala Backwaters: illustrated placeholder art (original, CC0).
 * Layers are static scenery; anything that moves (palms, clouds, boats,
 * ducks, nets, lamps) is a separate decor sprite animated by the engine.
 */
import path from "node:path";
import { Img, rgba, shade, withAlpha, linear, radial, rng, hashNoise, quad, cubic, mixc } from "./raster.mjs";

const W = 1920, H = 1080;
const C = {
  hillFar: rgba("#5f8f8a"), hillNear: rgba("#3f6f5e"), haze: rgba("#cfe3dc"),
  leaf: rgba("#2f7d3f"), leafDark: rgba("#1d5a2c"), leafLight: rgba("#5aa64a"), trunk: rgba("#7a5a3a"), trunkDark: rgba("#4d3622"),
  coconut: rgba("#6b8f2a"), waterDeep: rgba("#0e5a63"), waterMid: rgba("#1c7b80"), waterFar: rgba("#5ea8a3"),
  grass: rgba("#4f9a3c"), grassDark: rgba("#2f6e2a"), grassLight: rgba("#7cc153"), sand: rgba("#c9a46a"), wetSand: rgba("#8f7448"),
  laterite: rgba("#b0563a"), lateriteDark: rgba("#7d3524"), stone: rgba("#9d8f80"),
  wood: rgba("#6e4326"), woodDark: rgba("#432713"), woodLight: rgba("#9a6a3e"), straw: rgba("#d8b26a"), strawDark: rgba("#a9803f"),
  white: rgba("#f3eee2"), tile: rgba("#b0482c"), tileDark: rgba("#7a2c18"), copper: rgba("#4f8f7a"), brass: rgba("#d9a83a"), brassDark: rgba("#8a6418"),
  hibiscus: rgba("#e0303a"), marigold: rgba("#f2a019"), pot: rgba("#9b4e2b"),
};

// ── Shared pieces ────────────────────────────────────────────────────────────
function palmCrown(img, cx, cy, size, r, tint = 0) {
  const fronds = 13;
  for (let i = 0; i < fronds; i++) {
    const ang = -Math.PI / 2 + (i / (fronds - 1) - 0.5) * Math.PI * 1.55 + (r() - 0.5) * 0.25;
    const len = size * (0.75 + r() * 0.35);
    const droop = size * (0.35 + r() * 0.25) * Math.abs(Math.cos(ang));
    const tip = [cx + Math.cos(ang) * len, cy + Math.sin(ang) * len * 0.55 + droop];
    const mid = [cx + Math.cos(ang) * len * 0.55, cy + Math.sin(ang) * len * 0.55 - size * 0.12];
    const spine = quad([cx, cy], mid, tip, 18);
    const col = mixc(i % 3 === 0 ? C.leafDark : i % 3 === 1 ? C.leaf : C.leafLight, C.leafDark, tint);
    for (let k = 2; k < spine.length; k++) {
      const [px, py] = spine[k];
      const [qx, qy] = spine[k - 1];
      const dir = Math.atan2(py - qy, px - qx);
      const ll = size * 0.2 * Math.sin((k / spine.length) * Math.PI) + 3;
      for (const side of [-1, 1]) {
        const a = dir + side * 1.15;
        img.taper([[px, py], [px + Math.cos(a) * ll * 0.6, py + Math.sin(a) * ll * 0.6 + ll * 0.25], [px + Math.cos(a) * ll, py + Math.sin(a) * ll + ll * 0.55]], 2.2, 0.4, col);
      }
    }
    img.taper(spine, 3, 0.8, shade(col, -0.25));
  }
  for (let i = 0; i < 5; i++) img.circle(cx + (r() - 0.5) * size * 0.18, cy + size * 0.06 + r() * size * 0.06, size * 0.045, shade(C.coconut, (r() - 0.5) * 0.3));
}

function palm(w, h, seed, lean) {
  const r = rng(seed);
  const img = new Img(w, h, 3);
  const base = [w / 2, h - 2];
  const top = [w / 2 + lean * w * 0.28, h * 0.28];
  const trunk = quad(base, [w / 2 + lean * w * 0.05, h * 0.65], top, 30);
  img.taper(trunk, w * 0.085, w * 0.05, linear(0, 0, w, 0, [[0, C.trunkDark], [0.5, C.trunk], [1, C.trunkDark]]));
  for (let i = 2; i < trunk.length - 1; i += 2) {
    const [x, y] = trunk[i];
    const ww = w * (0.085 - (0.035 * i) / trunk.length);
    img.stroke([[x - ww / 2, y], [x + ww / 2, y + 1.5]], 1.4, withAlpha(C.trunkDark, 0.6));
  }
  palmCrown(img, top[0], top[1], w * 0.48, r);
  return img;
}

function cloud(w, h, seed) {
  const r = rng(seed);
  const img = new Img(w, h, 2);
  const puffs = [];
  for (let i = 0; i < 9; i++) puffs.push([w * (0.15 + r() * 0.7), h * (0.45 + r() * 0.3), h * (0.18 + r() * 0.2)]);
  puffs.push([w * 0.5, h * 0.42, h * 0.33]);
  const paint = linear(0, h * 0.15, 0, h * 0.9, [[0, rgba("#ffffff")], [0.55, rgba("#f4f1ff")], [1, rgba("#b8b3cf")]]);
  for (const [x, y, rr] of puffs) img.circle(x, y, rr, paint);
  img.rect(w * 0.12, h * 0.6, w * 0.76, h * 0.2, paint);
  img.blur(1.2);
  return img;
}

function glow(size, color) {
  const img = new Img(size, size, 1);
  img.circle(size / 2, size / 2, size / 2, radial(size / 2, size / 2, size / 2, [[0, withAlpha(color, 0.95)], [0.3, withAlpha(color, 0.45)], [1, withAlpha(color, 0)]]));
  return img;
}

// ── Layers ───────────────────────────────────────────────────────────────────
function farHills() {
  const img = new Img(W, H, 2);
  const ridge = (base, amp, f, col, haze) => {
    const pts = [[0, H]];
    for (let x = 0; x <= W; x += 8) pts.push([x, base - Math.sin(x / f) * amp - Math.sin(x / (f * 0.37) + 1) * amp * 0.35 - Math.sin(x / (f * 2.3)) * amp * 0.6]);
    pts.push([W, H]);
    img.fillPoly(pts, linear(0, base - amp * 2, 0, base + 60, [[0, mixc(col, C.haze, haze)], [1, mixc(col, C.haze, haze + 0.35)]]));
  };
  ridge(470, 34, 210, C.hillFar, 0.45);
  ridge(505, 22, 150, C.hillNear, 0.25);
  return img;
}

function treeline() {
  const r = rng(21);
  const img = new Img(W, H, 2);
  // Far bank strip and bushes
  const bank = [[0, H]];
  for (let x = 0; x <= W; x += 6) bank.push([x, 552 + Math.sin(x / 70) * 3]);
  bank.push([W, H]);
  img.fillPoly(bank, linear(0, 540, 0, 580, [[0, rgba("#2c5e33")], [1, rgba("#1f4627")]]));
  for (let i = 0; i < 90; i++) {
    const x = r() * W, y = 548 + r() * 6, rr = 10 + r() * 22;
    img.circle(x, y, rr, linear(0, y - rr, 0, y + rr, [[0, rgba("#3f8a43")], [1, rgba("#1f4a28")]]));
  }
  // Distant palms (small, slightly hazy)
  for (let i = 0; i < 46; i++) {
    const x = 10 + i * 42 + (r() - 0.5) * 24, base = 552, h = 70 + r() * 70, lean = (r() - 0.5) * 0.5;
    const top = [x + lean * h * 0.3, base - h];
    img.taper(quad([x, base], [x + lean * h * 0.05, base - h * 0.5], top, 12), 4, 2.5, rgba("#5a4a33"));
    const crown = new Img(0, 0, 2);
    void crown;
    palmCrown(img, top[0], top[1], 22 + r() * 10, r, 0.35);
  }
  img.mask((x, y) => (y > 560 ? 1 : 1));
  return img;
}

function water() {
  const r = rng(31);
  const img = new Img(W, H, 2);
  const top = 552, bottom = 800;
  img.rect(0, top, W, bottom - top, linear(0, top, 0, bottom, [[0, C.waterFar], [0.35, C.waterMid], [1, C.waterDeep]]));
  // Reflection of the far bank / palms (dark, soft band)
  const refl = new Img(W, 160, 2);
  for (let i = 0; i < 46; i++) {
    const x = 10 + i * 42 + (r() - 0.5) * 24, hh = 40 + r() * 50;
    refl.rect(x - 3, 0, 6, hh, rgba("#1d3f30", 0.6));
    refl.ellipse(x, hh, 22, 10, rgba("#1d3f30", 0.5));
  }
  refl.rect(0, 0, W, 18, rgba("#1d3f30", 0.55));
  refl.blur(4);
  img.draw(refl, 0, top, 0.85);
  // Ripple lines
  for (let i = 0; i < 260; i++) {
    const y = top + 12 + Math.pow(r(), 0.8) * (bottom - top - 20);
    const x = r() * W, len = 8 + ((y - top) / (bottom - top)) * 40 * r();
    img.stroke([[x, y], [x + len, y]], 1 + (y - top) / 160, rgba("#bfe5df", 0.18 + r() * 0.2));
  }
  // Water hyacinth clusters
  for (let i = 0; i < 16; i++) {
    const cx = r() * W, cy = 600 + r() * 180, n = 5 + Math.floor(r() * 7);
    for (let k = 0; k < n; k++) {
      const x = cx + (r() - 0.5) * 50, y = cy + (r() - 0.5) * 10;
      img.ellipse(x, y, 9, 4.5, linear(x, y - 5, x, y + 5, [[0, C.leafLight], [1, C.leafDark]]));
      if (r() < 0.35) img.circle(x + 2, y - 5, 2.4, rgba("#c58df0"));
    }
  }
  return img;
}

function shimmer() {
  const r = rng(41);
  const img = new Img(W, 260, 2);
  for (let i = 0; i < 180; i++) {
    const y = Math.pow(r(), 0.7) * 248 + 6, x = r() * W, len = 6 + (y / 260) * 34 * r();
    const pts = [[x, y], [x + len, y]];
    img.stroke(pts, 1 + y / 200, rgba("#ffffff", 0.22 + r() * 0.25));
    if (x + len > W) img.stroke([[x - W, y], [x + len - W, y]], 1 + y / 200, rgba("#ffffff", 0.3)); // tile seamlessly
  }
  return img;
}

function ground() {
  const r = rng(51);
  const img = new Img(W, H, 2);
  const shoreY = (x) => 790 + Math.sin(x / 120) * 10 + Math.sin(x / 41) * 4;
  const shore = [[0, H]];
  for (let x = 0; x <= W; x += 4) shore.push([x, shoreY(x)]);
  shore.push([W, H]);
  // Wet sand edge then grass
  img.fillPoly(shore, linear(0, 780, 0, 820, [[0, C.wetSand], [1, C.sand]]));
  const grass = [[0, H]];
  for (let x = 0; x <= W; x += 4) grass.push([x, shoreY(x) + 14 + Math.sin(x / 33) * 3]);
  grass.push([W, H]);
  img.fillPoly(grass, (x, y) => {
    const n = hashNoise(x >> 2, y >> 2, 7) * 0.12 - 0.06;
    return shade(mixc(C.grass, C.grassDark, Math.min(1, Math.max(0, (y - 820) / 260)) * 0.55), n);
  });
  // Laterite path from the ghat to the bottom
  const path_ = [...cubic([900, 806], [880, 880], [820, 960], [760, H], 20), ...cubic([1170, H], [1080, 960], [1030, 880], [1020, 806], 20)];
  img.fillPoly(path_, (x, y) => shade(mixc(C.laterite, C.lateriteDark, hashNoise(x >> 3, y >> 3, 3) * 0.35), (hashNoise(x, y, 9) - 0.5) * 0.08));
  for (let i = 0; i < 60; i++) {
    const t = r(), y = 812 + t * (H - 812), half = 60 + t * 140, x = 960 + (r() - 0.5) * half * 1.6 - t * 40;
    img.ellipse(x, y, 6 + r() * 8, 3 + r() * 3, shade(C.stone, (r() - 0.5) * 0.3), 0.9);
  }
  // Grass tufts and blades
  for (let i = 0; i < 900; i++) {
    const x = r() * W, y = 815 + Math.pow(r(), 0.9) * (H - 815);
    if (x > 760 && x < 1170 && y > 820 && Math.abs(x - (960 - (y - 806) * 0.25)) < 80 + (y - 806) * 0.5) continue;
    const hgt = 6 + r() * 12 * (0.6 + (y - 800) / 400);
    const col = r() < 0.5 ? C.grassLight : C.grassDark;
    img.taper([[x, y], [x + (r() - 0.5) * 6, y - hgt]], 2.2, 0.3, col, 0.85);
  }
  // Flowers
  for (let i = 0; i < 26; i++) {
    const cx = r() * W, cy = 840 + r() * 220;
    if (cx > 760 && cx < 1170) continue;
    const col = r() < 0.5 ? C.hibiscus : C.marigold;
    for (let k = 0; k < 5; k++) {
      const x = cx + (r() - 0.5) * 30, y = cy + (r() - 0.5) * 12;
      img.circle(x, y, 3.2, col);
      img.circle(x, y, 1.2, rgba("#ffe58a"));
    }
  }
  // Shore reeds
  for (let i = 0; i < 140; i++) {
    const x = r() * W, y = shoreY(x) + 10;
    img.taper([[x, y], [x + (r() - 0.5) * 8, y - 14 - r() * 16]], 2, 0.3, r() < 0.5 ? C.leaf : C.leafDark);
  }
  return img;
}

// ── Props ────────────────────────────────────────────────────────────────────
function houseboat() {
  const w = 380, h = 170, img = new Img(w, h, 3);
  // Hull with upturned ends
  // Gunwale along the top, then the curved bottom back to the bow
  const hull = [...cubic([6, 86], [60, 104], [320, 104], [374, 84], 24), ...cubic([374, 84], [336, 136], [240, 148], [190, 148], 16), ...cubic([190, 148], [140, 148], [44, 136], [6, 86], 16)];
  img.fillPoly(hull, linear(0, 96, 0, 150, [[0, C.woodLight], [0.4, C.wood], [1, C.woodDark]]));
  for (let k = 0; k < 4; k++) img.stroke(cubic([40 + k * 14, 106 + k * 9], [110, 116 + k * 8], [270, 116 + k * 8], [340 - k * 14, 104 + k * 9], 24), 1.2, withAlpha(C.woodDark, 0.55));
  img.stroke(cubic([10, 98], [100, 112], [280, 112], [370, 94], 24), 4, C.woodLight);
  // Canopy (arched thatch)
  const canopy = [...cubic([58, 104], [62, 40], [120, 22], [190, 22], 20), ...cubic([190, 22], [262, 22], [318, 40], [322, 104], 20)];
  img.fillPoly(canopy, linear(0, 22, 0, 104, [[0, shade(C.straw, 0.15)], [0.7, C.straw], [1, C.strawDark]]));
  // Thatch strands follow the arch (top of canopy ≈ parabola from the ends up to y=24)
  for (let x = 68; x < 314; x += 7) img.stroke([[x, 26 + ((x - 190) / 128) ** 2 * 76], [x - 3, 103]], 1, withAlpha(C.strawDark, 0.5));
  for (let y = 40; y < 100; y += 12) img.stroke(cubic([62, y + 6], [120, y - 4], [260, y - 4], [318, y + 6], 20), 1, withAlpha(shade(C.straw, 0.3), 0.6));
  img.stroke(cubic([58, 104], [62, 40], [120, 22], [190, 22], 20), 3, C.strawDark);
  img.stroke(cubic([190, 22], [262, 22], [318, 40], [322, 104], 20), 3, C.strawDark);
  // Windows with curtains
  for (const x of [96, 150, 204, 258]) {
    img.rect(x, 62, 34, 30, C.woodDark);
    img.rect(x + 3, 65, 28, 24, rgba("#2a1a10"));
    img.rect(x + 3, 65, 9, 24, rgba("#c0392b", 0.85));
    img.rect(x + 22, 65, 9, 24, rgba("#c0392b", 0.85));
  }
  // Deck, railing, lantern
  img.rect(30, 98, 320, 6, C.woodDark);
  for (let x = 34; x <= 346; x += 14) img.rect(x, 88, 2.5, 12, C.woodLight);
  img.stroke([[32, 88], [348, 88]], 2, C.woodLight);
  img.circle(334, 70, 5, C.brass);
  img.stroke([[334, 58], [334, 64]], 1.5, C.brassDark);
  return img;
}

function teaShop() {
  const w = 280, h = 240, img = new Img(w, h, 3);
  img.ellipse(140, 232, 130, 8, rgba("#000000", 0.18));
  img.rect(30, 110, 220, 120, linear(0, 110, 0, 230, [[0, C.white], [1, shade(C.white, -0.12)]]));
  img.rect(30, 110, 220, 16, shade(C.white, -0.18));
  // Tiled roof
  const roof = [[6, 116], [60, 34], [220, 34], [274, 116]];
  img.fillPoly(roof, linear(0, 34, 0, 116, [[0, shade(C.tile, 0.1)], [1, C.tileDark]]));
  for (let y = 44; y < 116; y += 9) {
    const t = (y - 34) / 82, x0 = 60 - 54 * t, x1 = 220 + 54 * t;
    img.stroke([[x0, y], [x1, y]], 1.6, withAlpha(C.tileDark, 0.8));
    for (let x = x0 + ((y / 9) % 2) * 6; x < x1; x += 12) img.stroke([[x, y - 8], [x, y]], 0.8, withAlpha(C.tileDark, 0.5));
  }
  img.stroke([[60, 34], [220, 34]], 4, C.tileDark);
  // Posts and counter
  for (const x of [40, 236]) img.rect(x, 112, 8, 118, linear(x, 0, x + 8, 0, [[0, C.woodLight], [1, C.wood]]));
  img.rect(54, 160, 172, 12, linear(0, 160, 0, 172, [[0, C.woodLight], [1, C.wood]]));
  img.rect(58, 172, 164, 56, shade(C.wood, -0.1));
  for (let x = 66; x < 216; x += 18) img.stroke([[x, 176], [x, 224]], 1, withAlpha(C.woodDark, 0.7));
  // Glass jars of snacks
  const snacks = ["#e3a63b", "#c1592b", "#f2d16b", "#8a5a2b"];
  snacks.forEach((s, i) => {
    const x = 74 + i * 26;
    img.rect(x, 138, 20, 22, rgba("#dff3f5", 0.55));
    img.rect(x + 2, 146, 16, 13, rgba(s));
    img.rect(x - 1, 134, 22, 5, rgba("#c9c9c9"));
  });
  // Brass samovar (tea urn)
  img.ellipse(196, 150, 15, 18, linear(181, 0, 211, 0, [[0, C.brassDark], [0.35, shade(C.brass, 0.35)], [1, C.brassDark]]));
  img.rect(186, 126, 20, 12, linear(186, 0, 206, 0, [[0, C.brassDark], [0.4, C.brass], [1, C.brassDark]]));
  img.circle(196, 124, 5, C.brass);
  img.stroke([[211, 154], [222, 158]], 2.5, C.brassDark);
  // Hanging bananas
  for (let k = 0; k < 7; k++) img.ellipse(84 + (k % 4) * 6, 124 + Math.floor(k / 4) * 9, 4, 9, rgba("#f2d13b"), 1, 0.3);
  img.stroke([[90, 112], [90, 120]], 1.5, C.woodDark);
  // Bench
  img.rect(70, 206, 140, 7, C.woodLight);
  img.rect(78, 212, 5, 18, C.wood);
  img.rect(196, 212, 5, 18, C.wood);
  // Sign board
  img.rect(96, 92, 88, 22, C.woodDark);
  img.rect(99, 95, 82, 16, rgba("#2f6e5a"));
  for (let k = 0; k < 4; k++) img.circle(112 + k * 18, 103, 4, rgba("#f3eee2", 0.85));
  return img;
}

function temple() {
  const w = 360, h = 320, img = new Img(w, h, 3);
  img.ellipse(180, 312, 170, 10, rgba("#000000", 0.18));
  // Laterite platform with steps
  img.rect(14, 262, 332, 50, linear(0, 262, 0, 312, [[0, C.laterite], [1, C.lateriteDark]]));
  for (let x = 20; x < 340; x += 24) for (let y = 266; y < 310; y += 12) img.rect(x + ((y / 12) % 2) * 12, y, 22, 10, (xx, yy) => shade(C.laterite, (hashNoise(xx >> 2, yy >> 2, 5) - 0.5) * 0.2));
  for (let k = 0; k < 4; k++) img.rect(150 - k * 6, 270 + k * 10, 60 + k * 12, 10, shade(C.stone, -0.05 * k));
  // Walls and wooden lattice
  img.rect(46, 150, 268, 114, linear(0, 150, 0, 264, [[0, C.white], [1, shade(C.white, -0.15)]]));
  for (let x = 56; x < 306; x += 22) img.rect(x, 162, 10, 96, linear(x, 0, x + 10, 0, [[0, C.woodLight], [1, C.woodDark]]));
  img.rect(158, 186, 44, 76, rgba("#2a160c"));
  img.rect(162, 190, 36, 72, linear(0, 190, 0, 262, [[0, rgba("#5a2a12")], [1, rgba("#2a160c")]]));
  // Lower roof (sloping tiles with upturned eaves)
  const lower = [...cubic([4, 160], [40, 150], [70, 112], [100, 96], 12), [260, 96], ...cubic([260, 96], [290, 112], [320, 150], [356, 160], 12)];
  img.fillPoly(lower, linear(0, 96, 0, 160, [[0, shade(C.tile, 0.08)], [1, C.tileDark]]));
  for (let y = 104; y < 156; y += 8) img.stroke([[10 + (160 - y) * 1.4, y], [350 - (160 - y) * 1.4, y]], 1.2, withAlpha(C.tileDark, 0.7));
  // Upper roof (copper)
  const upper = [...cubic([70, 100], [96, 90], [120, 56], [140, 44], 12), [220, 44], ...cubic([220, 44], [240, 56], [264, 90], [290, 100], 12)];
  img.fillPoly(upper, linear(0, 44, 0, 100, [[0, shade(C.copper, 0.2)], [1, shade(C.copper, -0.25)]]));
  for (let y = 52; y < 98; y += 7) img.stroke([[74 + (100 - y) * 1.2, y], [286 - (100 - y) * 1.2, y]], 1, withAlpha(shade(C.copper, -0.4), 0.6));
  // Golden finial
  img.rect(176, 20, 8, 26, linear(176, 0, 184, 0, [[0, C.brassDark], [0.5, shade(C.brass, 0.3)], [1, C.brassDark]]));
  img.circle(180, 18, 6, shade(C.brass, 0.2));
  img.circle(180, 30, 7, C.brass);
  // Small lamps along the base (lit at night by glow decor)
  for (let k = 0; k < 7; k++) {
    const x = 60 + k * 40;
    img.rect(x - 2, 252, 4, 10, C.brassDark);
    img.ellipse(x, 251, 5, 2, C.brass);
  }
  return img;
}

function deepastambham() {
  const w = 70, h = 210, img = new Img(w, h, 3);
  img.rect(15, 196, 40, 12, C.stone);
  img.rect(30, 24, 10, 174, linear(30, 0, 40, 0, [[0, C.brassDark], [0.4, shade(C.brass, 0.3)], [1, C.brassDark]]));
  for (let k = 0; k < 8; k++) {
    const y = 40 + k * 20, rr = 26 - k * 2.2;
    img.ellipse(35, y, rr, 4, linear(0, y - 4, 0, y + 4, [[0, shade(C.brass, 0.25)], [1, C.brassDark]]));
  }
  img.circle(35, 20, 7, C.brass);
  return img;
}

function netsPlatform() {
  const w = 220, h = 90, img = new Img(w, h, 3);
  img.rect(10, 40, 200, 12, linear(0, 40, 0, 52, [[0, C.woodLight], [1, C.wood]]));
  for (let x = 20; x < 210; x += 30) img.rect(x, 50, 7, 38, linear(x, 0, x + 7, 0, [[0, C.wood], [1, C.woodDark]]));
  for (let k = 0; k < 6; k++) img.ellipse(40 + k * 28, 36, 10, 6, shade(C.stone, (k % 3) * 0.08 - 0.08));
  return img;
}

function fishingNet() {
  // Pivot (rotation origin) at bottom-left; the arm reaches up and over the water
  const w = 300, h = 300, img = new Img(w, h, 3);
  const base = [20, 290];
  const apex = [150, 40];
  img.stroke([base, apex], 6, C.woodDark);
  img.stroke([[60, 290], apex], 4, C.wood);
  img.stroke([apex, [292, 150]], 4, C.wood);
  img.stroke([apex, [210, 210]], 3, C.wood);
  // Ropes and counterweights
  img.stroke([apex, [40, 120]], 1.4, rgba("#d8c9a8"));
  for (let k = 0; k < 4; k++) img.ellipse(40 + k * 8, 122 + k * 14, 7, 6, C.stone);
  // Net (catenary mesh)
  const left = [210, 210], right = [292, 150];
  for (let k = 0; k <= 8; k++) {
    const t = k / 8;
    const a = [left[0] + (right[0] - left[0]) * t, left[1] + (right[1] - left[1]) * t];
    img.stroke(quad(apex, [a[0] - 10, a[1] - 40], a, 10), 0.9, rgba("#f0e8d8", 0.75));
  }
  img.stroke(quad(left, [255, 255], right, 16), 1.2, rgba("#f0e8d8", 0.85));
  for (let k = 1; k < 5; k++) img.stroke(quad([210 + k * 6, 210 - k * 10], [250, 235 - k * 12], [292 - k * 4, 150 + k * 6], 14), 0.8, rgba("#f0e8d8", 0.6));
  return img;
}

function ghat() {
  const w = 280, h = 110, img = new Img(w, h, 3);
  for (let k = 0; k < 5; k++) img.rect(20 + k * 8, 20 + k * 16, 240 - k * 16, 16, (x, y) => shade(mixc(C.laterite, C.stone, 0.35), (hashNoise(x >> 2, y >> 2, 11) - 0.5) * 0.15 - k * 0.04));
  // A canoe tied at the steps
  const canoe = [...cubic([60, 92], [100, 108], [180, 108], [230, 90], 16), [222, 100], ...cubic([222, 100], [180, 112], [100, 112], [68, 100], 16)];
  img.fillPoly(canoe, linear(0, 90, 0, 112, [[0, C.woodLight], [1, C.woodDark]]));
  img.stroke([[150, 96], [116, 70]], 2.5, C.woodDark);
  return img;
}

function toddyShop() {
  const w = 260, h = 220, img = new Img(w, h, 3);
  img.ellipse(130, 212, 120, 8, rgba("#000000", 0.18));
  img.rect(28, 100, 204, 110, linear(0, 100, 0, 210, [[0, rgba("#d9b48a")], [1, rgba("#b08860")]]));
  // Coconut-leaf thatch roof
  const roof = [[2, 108], [130, 28], [258, 108]];
  img.fillPoly(roof, linear(0, 28, 0, 108, [[0, shade(C.straw, -0.05)], [1, shade(C.strawDark, -0.15)]]));
  for (let i = 0; i < 70; i++) {
    const t = i / 70, x = 10 + t * 240, y0 = 108 - (1 - Math.abs(t - 0.5) * 2) * 78;
    img.stroke([[x, y0 + 4], [x + 4, 112]], 1.2, withAlpha(C.strawDark, 0.7));
  }
  img.rect(104, 140, 52, 70, C.woodDark);
  img.rect(40, 130, 40, 30, rgba("#2a1a10"));
  img.rect(180, 130, 40, 30, rgba("#2a1a10"));
  for (let k = 0; k < 5; k++) img.ellipse(48 + k * 40, 204, 12, 11, linear(0, 194, 0, 214, [[0, shade(C.pot, 0.15)], [1, shade(C.pot, -0.25)]]));
  img.rect(80, 84, 100, 22, C.woodDark);
  img.rect(84, 88, 92, 14, rgba("#e8d9b0"));
  return img;
}

function hut() {
  const w = 190, h = 170, img = new Img(w, h, 3);
  img.ellipse(95, 164, 86, 6, rgba("#000000", 0.18));
  img.rect(26, 78, 138, 86, linear(0, 78, 0, 164, [[0, rgba("#e2c9a0")], [1, rgba("#b99a6e")]]));
  const roof = [[0, 86], [95, 14], [190, 86]];
  img.fillPoly(roof, linear(0, 14, 0, 86, [[0, C.straw], [1, C.strawDark]]));
  for (let i = 0; i < 46; i++) {
    const t = i / 46, x = 6 + t * 178;
    img.stroke([[x, 86 - (1 - Math.abs(t - 0.5) * 2) * 66], [x + 3, 90]], 1, withAlpha(C.strawDark, 0.7));
  }
  img.rect(80, 108, 30, 56, C.woodDark);
  img.rect(40, 104, 24, 20, rgba("#2a1a10"));
  return img;
}

function banana() {
  const w = 170, h = 210, img = new Img(w, h, 3);
  img.taper([[85, 208], [86, 110]], 14, 9, linear(70, 0, 100, 0, [[0, rgba("#6f8f3a")], [1, rgba("#4a6a28")]]));
  const leaves = [[-1.9, 78], [-1.3, 92], [-0.6, 84], [0.1, 70], [-2.5, 70]];
  for (const [a, len] of leaves) {
    const tip = [85 + Math.cos(a) * len, 110 + Math.sin(a) * len * 0.9];
    const ctrl = [85 + Math.cos(a) * len * 0.5, 110 + Math.sin(a) * len * 0.5 - 20];
    const spine = quad([85, 112], ctrl, tip, 14);
    const left = [], right = [];
    spine.forEach(([x, y], i) => {
      const wd = Math.sin((i / (spine.length - 1)) * Math.PI) * 18;
      left.push([x - wd * Math.sin(a + 1.57) * 0.5, y - wd * 0.6]);
      right.push([x + wd * Math.sin(a + 1.57) * 0.5, y + wd * 0.6]);
    });
    img.fillPoly([...left, ...right.reverse()], linear(0, 30, 0, 160, [[0, C.leafLight], [1, C.leaf]]));
    img.stroke(spine, 1.5, shade(C.leaf, -0.3));
  }
  return img;
}

function duck() {
  const img = new Img(40, 26, 4);
  img.ellipse(18, 16, 14, 7, linear(0, 9, 0, 23, [[0, rgba("#ffffff")], [1, rgba("#d6d2c8")]]));
  img.circle(30, 9, 5.5, rgba("#ffffff"));
  img.ellipse(36, 10, 4, 1.8, rgba("#f2a019"));
  img.circle(31, 8, 1.1, rgba("#1b1b1b"));
  img.ellipse(14, 14, 7, 3, rgba("#e8e4da"), 1, -0.2);
  return img;
}

function canoeRower() {
  const w = 190, h = 90, img = new Img(w, h, 3);
  const hull = [...cubic([4, 66], [40, 84], [150, 84], [186, 62], 16), [178, 72], ...cubic([178, 72], [150, 88], [40, 88], [12, 74], 16)];
  img.fillPoly(hull, linear(0, 62, 0, 88, [[0, C.woodLight], [1, C.woodDark]]));
  // Rower: lungi, shirt, towel on head
  img.rect(90, 46, 16, 22, rgba("#3d6fb0"));
  img.rect(88, 62, 20, 10, rgba("#2e8b57"));
  img.circle(98, 38, 7, rgba("#8d5524"));
  img.ellipse(98, 32, 8, 3.5, rgba("#f3eee2"));
  img.stroke([[104, 52], [140, 30], [70, 84]], 2.2, C.woodDark);
  img.ellipse(70, 84, 8, 3, C.woodDark);
  return img;
}

// ── Build ────────────────────────────────────────────────────────────────────
export function buildKerala(outDir) {
  const out = (n) => path.join(outDir, n);
  console.log("Kerala Backwaters:");
  farHills().save(out("far_hills.png"));
  treeline().save(out("treeline.png"));
  water().save(out("water.png"));
  shimmer().save(out("water_shimmer.png"));
  ground().save(out("ground.png"));
  houseboat().save(out("houseboat.png"));
  teaShop().save(out("tea_shop.png"));
  temple().save(out("temple.png"));
  deepastambham().save(out("deepastambham.png"));
  netsPlatform().save(out("nets_platform.png"));
  fishingNet().save(out("fishing_net.png"));
  ghat().save(out("ghat.png"));
  toddyShop().save(out("toddy_shop.png"));
  hut().save(out("hut.png"));
  banana().save(out("banana.png"));
  palm(240, 460, 61, 0.35).save(out("palm_a.png"));
  palm(240, 420, 62, -0.45).save(out("palm_b.png"));
  palm(220, 380, 63, 0.1).save(out("palm_c.png"));
  cloud(360, 130, 71).save(out("cloud_a.png"));
  cloud(300, 110, 72).save(out("cloud_b.png"));
  cloud(420, 150, 73).save(out("cloud_c.png"));
  duck().save(out("duck.png"));
  canoeRower().save(out("canoe_rower.png"));
  glow(160, rgba("#ffc861")).save(out("glow_warm.png"));
  glow(90, rgba("#fff1b0")).save(out("glow_small.png"));
}
