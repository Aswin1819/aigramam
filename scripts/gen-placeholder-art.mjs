#!/usr/bin/env node
/**
 * Generates the placeholder art for the built-in worlds (simple flat shapes,
 * drawn at half size and doubled for a chunky pixel look). No dependencies:
 * a tiny rasteriser + PNG encoder using Node's zlib.
 *
 *   node scripts/gen-placeholder-art.mjs            # all worlds
 *
 * The art is original and released as CC0. Replace it with real pixel art
 * any time; world.json only needs the file names.
 */
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

// ── PNG encoder ───────────────────────────────────────────────────────────────
const CRC_TABLE = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function encodePng(w, h, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0;
    Buffer.from(rgba.buffer, rgba.byteOffset + y * w * 4, w * 4).copy(raw, y * (w * 4 + 1) + 1);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// ── Tiny rasteriser ───────────────────────────────────────────────────────────
const hex = (h, a = 255) => {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255, a];
};
const mix = (c1, c2, t) => c1.map((v, i) => Math.round(v + (c2[i] - v) * t));

class Canvas {
  constructor(w, h) {
    this.w = w;
    this.h = h;
    this.d = new Uint8ClampedArray(w * h * 4);
  }
  px(x, y, c) {
    x |= 0; y |= 0;
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const i = (y * this.w + x) * 4;
    const a = c[3] / 255;
    if (a >= 1) { this.d[i] = c[0]; this.d[i + 1] = c[1]; this.d[i + 2] = c[2]; this.d[i + 3] = 255; return; }
    const da = this.d[i + 3] / 255;
    const oa = a + da * (1 - a);
    if (oa <= 0) return;
    for (let k = 0; k < 3; k++) this.d[i + k] = (c[k] * a + this.d[i + k] * da * (1 - a)) / oa;
    this.d[i + 3] = oa * 255;
  }
  rect(x, y, w, h, c) { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.px(x + i, y + j, c); }
  vgrad(x, y, w, h, c1, c2) { for (let j = 0; j < h; j++) { const c = mix(c1, c2, j / Math.max(1, h - 1)); for (let i = 0; i < w; i++) this.px(x + i, y + j, c); } }
  ellipse(cx, cy, rx, ry, c) {
    for (let y = Math.floor(cy - ry); y <= cy + ry; y++)
      for (let x = Math.floor(cx - rx); x <= cx + rx; x++)
        if (((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1) this.px(x, y, c);
  }
  circle(cx, cy, r, c) { this.ellipse(cx, cy, r, r, c); }
  poly(pts, c) {
    const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
    for (let y = Math.floor(Math.min(...ys)); y <= Math.max(...ys); y++)
      for (let x = Math.floor(Math.min(...xs)); x <= Math.max(...xs); x++) {
        let inside = false;
        for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
          const [xi, yi] = pts[i], [xj, yj] = pts[j];
          if (yi > y + 0.5 !== yj > y + 0.5 && x + 0.5 < ((xj - xi) * (y + 0.5 - yi)) / (yj - yi) + xi) inside = !inside;
        }
        if (inside) this.px(x, y, c);
      }
  }
  line(x0, y0, x1, y1, c, t = 1) {
    const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
    for (let s = 0; s <= n; s++) this.rect(Math.round(x0 + ((x1 - x0) * s) / n - t / 2), Math.round(y0 + ((y1 - y0) * s) / n - t / 2), t, t, c);
  }
  /** Nearest-neighbour upscale for the chunky pixel look. */
  scaled(k) {
    const out = new Canvas(this.w * k, this.h * k);
    for (let y = 0; y < out.h; y++)
      for (let x = 0; x < out.w; x++) {
        const s = ((Math.floor(y / k) * this.w) + Math.floor(x / k)) * 4, t = (y * out.w + x) * 4;
        out.d[t] = this.d[s]; out.d[t + 1] = this.d[s + 1]; out.d[t + 2] = this.d[s + 2]; out.d[t + 3] = this.d[s + 3];
      }
    return out;
  }
  save(file) {
    const big = this.scaled(2);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, encodePng(big.w, big.h, big.d));
    console.log(`  ${path.relative(process.cwd(), file)}  ${big.w}×${big.h}`);
  }
}

// Deterministic pseudo-random so regenerating gives identical files.
let seed = 1;
const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);

// ── Kerala ────────────────────────────────────────────────────────────────────
function kerala(out) {
  const W = 960, H = 540; // drawn at half size; saved at 1920×1080
  const P = {
    skyTop: hex("#0f3d47"), skyBottom: hex("#f4c28c"), sun: hex("#ffd47a"),
    hill: hex("#1e4a3a"), hill2: hex("#2a5e45"),
    trunk: hex("#5a3a1f"), frond: hex("#1f6b3b"), frond2: hex("#2f8a4a"),
    water: hex("#0f6b74"), water2: hex("#167f86"), wave: hex("#4fb3aa", 200),
    bank: hex("#3f7d3a"), bank2: hex("#356b31"), path: hex("#b98a5a"), laterite: hex("#a3462c"),
    wood: hex("#6b4226"), wood2: hex("#8a5a33"), thatch: hex("#c9a35b"), thatch2: hex("#a9853f"),
    tile: hex("#8c3a22"), tile2: hex("#6e2c19"), wall: hex("#efe6d2"), brass: hex("#d4a531"), red: hex("#b3261e"),
    tin: hex("#9aa4a8"), dark: hex("#1b1b1b", 200),
  };

  seed = 7;
  const sky = new Canvas(W, H);
  sky.vgrad(0, 0, W, 300, P.skyTop, P.skyBottom);
  sky.vgrad(0, 300, W, 240, P.skyBottom, hex("#f7d6a6"));
  for (let r = 60; r > 0; r -= 6) sky.circle(760, 150, r, hex("#ffd47a", Math.round(40 + (60 - r) * 3)));
  sky.circle(760, 150, 26, P.sun);
  for (let i = 0; i < 6; i++) sky.ellipse(120 + i * 150, 70 + (i % 3) * 25, 50, 8, hex("#ffffff", 50));
  sky.save(path.join(out, "sky.png"));

  seed = 11;
  const hills = new Canvas(W, H);
  const ridge = (base, amp, col, step) => {
    const pts = [[0, H]];
    for (let x = 0; x <= W; x += step) pts.push([x, base - Math.sin(x / 90) * amp - Math.sin(x / 37) * amp * 0.3]);
    pts.push([W, H]);
    hills.poly(pts, col);
  };
  ridge(250, 18, P.hill, 8);
  ridge(272, 10, P.hill2, 6);
  const palm = (x, base, h, lean) => {
    for (let s = 0; s < h; s++) hills.rect(Math.round(x + lean * (s / h) ** 2 * h * 0.25), base - s, 3, 1, P.trunk);
    const tx = x + lean * h * 0.25, ty = base - h;
    for (let a = 0; a < 7; a++) {
      const ang = -Math.PI + (a / 6) * Math.PI + (rnd() - 0.5) * 0.3;
      const len = 18 + rnd() * 8;
      hills.line(tx, ty, tx + Math.cos(ang) * len, ty + Math.sin(ang) * len * 0.6 + 6, a % 2 ? P.frond : P.frond2, 3);
    }
    hills.circle(tx + 1, ty + 2, 3, hex("#4a3a1a"));
  };
  for (let i = 0; i < 26; i++) palm(10 + i * 37 + rnd() * 14, 285 + rnd() * 6, 40 + rnd() * 30, (rnd() - 0.5) * 0.8);
  hills.save(path.join(out, "hills.png"));

  seed = 13;
  const water = new Canvas(W, H);
  water.vgrad(0, 282, W, 110, P.water2, P.water);
  for (let i = 0; i < 70; i++) {
    const y = 290 + Math.floor(rnd() * 95), x = Math.floor(rnd() * W), len = 10 + Math.floor(rnd() * 26);
    for (let k = 0; k < len; k++) water.px((x + k) % W, y, P.wave); // wraps, so it tiles horizontally
  }
  water.save(path.join(out, "water.png"));

  seed = 17;
  const ground = new Canvas(W, H);
  const shore = [[0, H]];
  for (let x = 0; x <= W; x += 6) shore.push([x, 386 + Math.sin(x / 50) * 4]);
  shore.push([W, H]);
  ground.poly(shore, P.bank);
  ground.vgrad(0, 440, W, 100, P.bank, P.bank2);
  ground.poly([[300, H], [420, 392], [470, 392], [560, H]], P.path);
  for (let i = 0; i < 120; i++) ground.rect(Math.floor(rnd() * W), 400 + Math.floor(rnd() * 140), 2, 2, hex("#5d9e4f", 180));
  for (let i = 0; i < 30; i++) ground.rect(Math.floor(rnd() * W), 395 + Math.floor(rnd() * 140), 3, 2, P.laterite);
  ground.save(path.join(out, "ground.png"));

  // Props (drawn at half size, bottom-centre is the anchor).
  const houseboat = new Canvas(170, 70);
  houseboat.poly([[0, 46], [170, 46], [150, 66], [20, 66]], P.wood);
  houseboat.rect(10, 44, 150, 4, P.wood2);
  houseboat.poly([[18, 44], [32, 14], [138, 14], [152, 44]], P.thatch);
  for (let x = 24; x < 148; x += 8) houseboat.line(x, 16, x - 2, 43, P.thatch2, 1);
  houseboat.rect(40, 30, 14, 14, P.dark);
  houseboat.rect(80, 30, 14, 14, P.dark);
  houseboat.rect(118, 30, 14, 14, P.dark);
  houseboat.save(path.join(out, "houseboat.png"));

  const teaShop = new Canvas(120, 100);
  teaShop.rect(14, 40, 92, 58, P.wall);
  teaShop.poly([[4, 42], [60, 10], [116, 42]], P.tin);
  teaShop.rect(4, 40, 112, 4, hex("#7d878b"));
  teaShop.rect(22, 62, 76, 8, P.wood2);
  teaShop.rect(28, 50, 8, 12, P.brass); // tea urn
  teaShop.circle(32, 49, 4, P.brass);
  teaShop.rect(50, 52, 4, 10, hex("#ffffff"));
  teaShop.rect(58, 52, 4, 10, hex("#ffffff"));
  teaShop.rect(78, 70, 16, 28, P.wood);
  teaShop.save(path.join(out, "tea_shop.png"));

  const temple = new Canvas(150, 130);
  temple.rect(10, 100, 130, 30, P.laterite);
  temple.rect(26, 62, 98, 40, P.wall);
  temple.poly([[8, 66], [75, 30], [142, 66]], P.tile);
  temple.poly([[34, 40], [75, 8], [116, 40]], P.tile2);
  temple.rect(72, 0, 6, 10, P.brass);
  temple.rect(64, 76, 22, 26, P.dark);
  for (let i = 0; i < 5; i++) temple.rect(30 + i * 22, 104, 4, 10, P.brass);
  temple.save(path.join(out, "temple.png"));

  const nets = new Canvas(110, 120); // Chinese fishing nets (cheena vala)
  nets.line(10, 118, 70, 10, P.wood, 3);
  nets.line(40, 118, 70, 10, P.wood, 2);
  nets.line(70, 10, 108, 70, P.wood2, 2);
  for (let i = 0; i <= 6; i++) nets.line(70 + i * 6, 10 + i * 10, 40 + i * 11, 70 + i * 4, hex("#e8e2d0", 160), 1);
  nets.save(path.join(out, "fishing_nets.png"));

  const canoe = new Canvas(110, 30);
  canoe.poly([[0, 10], [110, 10], [92, 26], [18, 26]], P.wood);
  canoe.rect(4, 8, 102, 3, P.wood2);
  canoe.line(70, 0, 50, 22, P.wood2, 2);
  canoe.save(path.join(out, "canoe.png"));

  const toddy = new Canvas(110, 90);
  toddy.rect(10, 36, 90, 52, P.thatch2);
  toddy.poly([[0, 40], [55, 6], [110, 40]], P.thatch);
  toddy.rect(44, 56, 22, 32, P.wood);
  toddy.rect(16, 50, 18, 12, P.dark);
  toddy.save(path.join(out, "toddy_shop.png"));

  const hut = new Canvas(80, 70);
  hut.rect(10, 34, 60, 34, P.wall);
  hut.poly([[2, 38], [40, 8], [78, 38]], P.thatch);
  hut.rect(32, 46, 16, 22, P.wood);
  hut.save(path.join(out, "hut.png"));
}

const root = path.resolve(import.meta.dirname, "..", "worlds");
console.log("Generating placeholder art:");
kerala(path.join(root, "kerala", "assets"));
