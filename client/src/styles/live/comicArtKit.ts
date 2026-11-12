/**
 * Drawing kit for the live Comic Art style: ink, halftone, palms, bursts,
 * captions. Same look as the Style lab prototype (protos/comicArt.ts).
 */

export const INK = "#111";
export const PAPER = "#fffdf3";
export const FONT = "'Comic Sans MS', 'Segoe UI Black', 'Arial Black', sans-serif";

/** Fill the current path, then ink it. */
export function ink(c: CanvasRenderingContext2D, fill: string, lw = 1.8) {
  c.fillStyle = fill;
  c.fill();
  c.strokeStyle = INK;
  c.lineWidth = lw;
  c.lineJoin = "round";
  c.lineCap = "round";
  c.stroke();
}

/** Halftone dots on an offset grid; radius from a function of position. */
export function halftone(c: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, step: number, color: string, rad: (x: number, y: number) => number) {
  c.fillStyle = color;
  let row = 0;
  for (let y = y0; y <= y1; y += step * 0.866, row++) {
    c.beginPath();
    for (let x = x0 + (row % 2) * step * 0.5; x <= x1; x += step) {
      const r = rad(x, y);
      if (r <= 0.05) continue;
      c.moveTo(x + r, y);
      c.arc(x, y, r, 0, Math.PI * 2);
    }
    c.fill();
  }
}

export function frond(c: CanvasRenderingContext2D, x: number, y: number, ang: number, len: number, wid: number) {
  const ex = x + Math.cos(ang) * len, ey = y + Math.sin(ang) * len;
  const nx = -Math.sin(ang) * wid, ny = Math.cos(ang) * wid;
  const mx = (x + ex) / 2, my = (y + ey) / 2 - len * 0.15;
  c.beginPath();
  c.moveTo(x, y);
  c.quadraticCurveTo(mx + nx, my + ny, ex, ey);
  c.quadraticCurveTo(mx - nx, my - ny, x, y);
  c.closePath();
}

export function palm(c: CanvasRenderingContext2D, x: number, baseY: number, h: number, lean: number) {
  const topX = x + lean * h, topY = baseY - h;
  const cx = x + lean * h * 0.2;
  c.beginPath();
  c.moveTo(x - 5, baseY);
  c.quadraticCurveTo(cx - 3.5, baseY - h * 0.5, topX - 2.5, topY);
  c.lineTo(topX + 2.5, topY);
  c.quadraticCurveTo(cx + 3.5, baseY - h * 0.5, x + 5, baseY);
  c.closePath();
  ink(c, "#c0702c", 2);
  c.strokeStyle = INK;
  c.lineWidth = 1;
  c.beginPath();
  for (let k = 1; k < 9; k++) {
    const u = k / 9;
    const px = (1 - u) * (1 - u) * x + 2 * u * (1 - u) * cx + u * u * topX;
    const w = 4.5 * (1 - u * 0.45);
    c.moveTo(px - w, baseY - h * u + 1.5);
    c.lineTo(px + w, baseY - h * u - 0.5);
  }
  c.stroke();
  for (let i = 0; i < 8; i++) {
    const a = -Math.PI + (i / 7) * Math.PI;
    const droop = Math.abs(Math.cos(a)) * 0.6 * Math.sign(Math.cos(a));
    frond(c, topX, topY, a + droop, h * (i % 2 ? 0.33 : 0.4), 8);
    ink(c, i % 2 ? "#1f9a46" : "#35c25a", 1.8);
  }
  c.beginPath();
  c.arc(topX, topY + 3, 3.4, 0, Math.PI * 2);
  ink(c, "#8a4b1f", 1.4);
}

export function farPalm(c: CanvasRenderingContext2D, x: number, baseY: number) {
  c.beginPath();
  c.moveTo(x - 1.5, baseY);
  c.lineTo(x + 1, baseY - 28);
  c.lineTo(x + 3, baseY - 28);
  c.lineTo(x + 1.5, baseY);
  c.closePath();
  ink(c, "#7a4a22", 1.2);
  for (let i = 0; i < 6; i++) {
    frond(c, x + 2, baseY - 28, -Math.PI + (i / 5) * Math.PI + (i < 3 ? 0.42 : -0.42), 13, 3.5);
    ink(c, "#2c8a4e", 1.1);
  }
}

/** Two-layer stroke: black ink under a coloured line, for limbs. */
export function limb(c: CanvasRenderingContext2D, pts: { x: number; y: number }[], col: string, w: number) {
  c.lineCap = "round";
  c.lineJoin = "round";
  for (const [style, lw] of [[INK, w + 2.6], [col, w]] as const) {
    c.strokeStyle = style;
    c.lineWidth = lw;
    c.beginPath();
    pts.forEach((p, i) => (i ? c.lineTo(p.x, p.y) : c.moveTo(p.x, p.y)));
    c.stroke();
  }
}

export function steamCurl(c: CanvasRenderingContext2D, x: number, y: number, t: number, seed: number) {
  const k = Math.floor(t * 12) % 3;
  c.lineCap = "round";
  for (const [col, lw] of [[INK, 3], ["#fff", 1.4]] as const) {
    c.strokeStyle = col;
    c.lineWidth = lw;
    c.beginPath();
    c.moveTo(x, y);
    c.bezierCurveTo(x + 3 + k * 0.5, y - 3, x - 3, y - 6, x + (seed % 2 ? 1.5 : -1.5), y - 10 - k);
    c.stroke();
  }
}

/** Deterministic hash noise in [0,1). */
export function hash(n: number): number {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
}

/** A jagged comic burst outline. */
export function burstPath(c: CanvasRenderingContext2D, x: number, y: number, r1: number, r2: number, n: number, seed: number) {
  c.beginPath();
  for (let i = 0; i < n * 2; i++) {
    const a = (i / (n * 2)) * Math.PI * 2;
    const r = i % 2 ? r2 : r1 * (0.85 + hash(seed + i) * 0.3);
    const px = x + Math.cos(a) * r * 1.35, py = y + Math.sin(a) * r;
    i ? c.lineTo(px, py) : c.moveTo(px, py);
  }
  c.closePath();
}

/** A burst with a lettered word in it ("YES!", "!"). */
export function wordBurst(c: CanvasRenderingContext2D, x: number, y: number, word: string, fill: string, color: string, frame: number, size = 10) {
  burstPath(c, x, y, size * 1.5, size * 0.8, 10, frame % 4);
  ink(c, fill, 1.8);
  c.save();
  c.translate(x, y);
  c.rotate(-0.12);
  c.font = `900 ${size}px ${FONT}`;
  c.textAlign = "center";
  c.textBaseline = "middle";
  c.fillStyle = color;
  c.strokeStyle = INK;
  c.lineWidth = 0.8;
  c.fillText(word, 0, 0.5);
  c.strokeText(word, 0, 0.5);
  c.restore();
}

/** A lettered caption box. Returns its width. */
export function caption(c: CanvasRenderingContext2D, x: number, y: number, text: string, fill = "#ffe14d", size = 9, lw = 1.8) {
  c.font = `900 ${size}px ${FONT}`;
  const w = c.measureText(text).width + size * 1.3;
  const h = size * 1.75;
  c.beginPath();
  c.rect(x, y, w, h);
  ink(c, fill, lw);
  c.fillStyle = INK;
  c.textAlign = "left";
  c.textBaseline = "middle";
  c.fillText(text, x + size * 0.65, y + h / 2 + size * 0.05);
  return w;
}

/** An offscreen canvas of logical size w×h painted once at `res`× resolution. */
export function makeLayer(w: number, h: number, res: number, paint: (c: CanvasRenderingContext2D) => void): HTMLCanvasElement {
  const cv = document.createElement("canvas");
  cv.width = Math.ceil(w * res);
  cv.height = Math.ceil(h * res);
  const c = cv.getContext("2d")!;
  c.scale(res, res);
  paint(c);
  return cv;
}

// ── Bengaluru scenery (f.theme === "bengaluru") ─────────────────────────────
// Same ink, halftone and flat fills as the Kerala scenery; only the setting changes.

const W_TOP = 150, W_GROUND = 196, W_PATH_TOP = 284, W_PATH_BOTTOM = 344, W_H = 360;

/** Top of the cached viaduct band (park greenery + metro viaduct), down to the ground line. */
export const BLR_BAND_TOP = 138;
export const BLR_BAND_H = W_GROUND - BLR_BAND_TOP;
/** Metro deck top (world y). The train runs on it. */
export const BLR_DECK_TOP = 146;
const DECK_BOT = 158;
/** Ground line of the skyline towers (hidden behind the park greenery). */
const TOWER_BASE = W_TOP + 24;
export const BLR_PAVER = "#ead7b4";

/** One repeating strip: sky, pale far blocks, lawn, pavers, kerbs, asphalt road. */
export function paintBlrTile(c: CanvasRenderingContext2D, tile: number) {
  c.fillStyle = "#a8dcff";
  c.fillRect(0, 0, tile, W_GROUND);
  halftone(c, 0, 2, tile, W_TOP, 5, "#5aa9ea", (_x, y) => 0.3 + 1.5 * (y / W_TOP));
  // Pale far blocks (haze layer), periodic over the tile.
  const blocks = [[0, 24, 34], [22, 20, 54], [40, 28, 30], [66, 18, 62], [82, 30, 42], [110, 22, 50], [130, 30, 36]] as const;
  for (const [bx, bw, bh] of blocks) {
    for (const ox of [0, -tile]) {
      const x = bx + ox;
      if (x + bw < -2) continue;
      c.beginPath();
      c.rect(x, W_TOP + 14 - bh, bw, bh + 20);
      ink(c, "#cfe0f2", 1.1);
      halftone(c, x + 3, W_TOP + 19 - bh, x + bw - 3, W_TOP + 12, 4.5, "#a7bedb", () => 0.75);
    }
  }
  // Lawn strip, then pavers.
  const g = W_GROUND, lawn = g + 12, kerb = W_PATH_TOP - 6;
  c.fillStyle = "#7fd14f";
  c.fillRect(0, g, tile, lawn - g);
  halftone(c, 0, g + 2, tile, lawn - 1, 5, "#5fb33a", () => 1.1);
  c.fillStyle = BLR_PAVER;
  c.fillRect(0, lawn, tile, W_H - lawn);
  halftone(c, 0, lawn + 2, tile, kerb - 2, 5, "#cfae80", (_x, y) => 0.35 + (y - lawn) / 110);
  halftone(c, 0, W_PATH_BOTTOM + 7, tile, W_H, 5, "#cfae80", () => 0.9);
  c.strokeStyle = "rgba(17,17,17,0.3)";
  c.lineWidth = 0.8;
  c.beginPath();
  for (let y = lawn + 12; y < kerb; y += 12) {
    c.moveTo(0, y);
    c.lineTo(tile, y);
  }
  for (let y = lawn, row = 0; y < kerb; y += 12, row++) {
    for (let x = (row % 2) * 10; x <= tile; x += 20) {
      c.moveTo(x, y);
      c.lineTo(x, Math.min(kerb, y + 12));
    }
  }
  c.stroke();
  // Asphalt road with lane dashes.
  c.fillStyle = "#565c68";
  c.fillRect(0, W_PATH_TOP, tile, W_PATH_BOTTOM - W_PATH_TOP);
  halftone(c, 0, W_PATH_TOP + 2, tile, W_PATH_BOTTOM, 5, "#3a3f49", (_x, y) => 0.4 + (y - W_PATH_TOP) / 55);
  const mid = (W_PATH_TOP + W_PATH_BOTTOM) / 2;
  for (let x = 8; x < tile; x += 40) {
    c.beginPath();
    c.rect(x, mid - 1.6, 20, 3.2);
    ink(c, "#fff", 0.9);
  }
  // Black-and-yellow kerbs.
  for (const [y0, h] of [[kerb, 6], [W_PATH_BOTTOM, 5]] as const) {
    for (let x = 0, k = 0; x < tile; x += 10, k++) {
      c.fillStyle = k % 2 ? INK : "#ffd23f";
      c.fillRect(x, y0, 10, h);
    }
  }
  c.strokeStyle = INK;
  c.lineWidth = 1.8;
  c.beginPath();
  for (const y of [g, lawn, kerb, W_PATH_TOP, W_PATH_BOTTOM, W_PATH_BOTTOM + 5]) {
    c.moveTo(-1, y);
    c.lineTo(tile + 1, y);
  }
  c.stroke();
}

/** The viaduct band (world y BLR_BAND_TOP..ground): park greenery, pillars, deck with a purple stripe. */
export function paintBlrBand(c: CanvasRenderingContext2D, tile: number) {
  c.translate(0, -BLR_BAND_TOP);
  // Park greenery behind the viaduct.
  c.fillStyle = "#2fa055";
  c.fillRect(0, 176, tile, W_GROUND - 176);
  for (let i = 0; i < 9; i++) {
    const x = i * 18 + hash(i * 2.7) * 10, y = 172 + hash(i * 4.1) * 8, r = 10 + hash(i * 1.9) * 6;
    for (const ox of [-tile, 0, tile]) {
      c.beginPath();
      c.arc(x + ox, y, r, 0, Math.PI * 2);
      ink(c, i % 2 ? "#35b45e" : "#2a9a4f", 1.5);
    }
  }
  halftone(c, 0, 180, tile, W_GROUND, 4.5, "#1d7a3c", (_x, y) => 0.4 + (y - 180) / 18);
  // Pillars with pier caps.
  for (const px of [40, 120]) {
    c.beginPath();
    c.rect(px - 5, DECK_BOT, 10, W_GROUND - DECK_BOT + 2);
    ink(c, "#e2ded2", 1.8);
    halftone(c, px + 1, DECK_BOT + 8, px + 4, W_GROUND, 2.6, "rgba(17,17,17,0.35)", () => 0.7);
    c.beginPath();
    c.moveTo(px - 13, DECK_BOT);
    c.lineTo(px + 13, DECK_BOT);
    c.lineTo(px + 5, DECK_BOT + 7);
    c.lineTo(px - 5, DECK_BOT + 7);
    c.closePath();
    ink(c, "#ece8de", 1.6);
  }
  // Deck.
  c.beginPath();
  c.rect(-3, BLR_DECK_TOP, tile + 6, DECK_BOT - BLR_DECK_TOP);
  ink(c, "#f1eee6", 1.8);
  c.fillStyle = "#8b3fd9";
  c.fillRect(-3, BLR_DECK_TOP + 5, tile + 6, 3);
  halftone(c, 0, DECK_BOT - 3.5, tile, DECK_BOT - 1, 2.6, "rgba(17,17,17,0.4)", () => 0.6);
  c.strokeStyle = INK;
  c.lineWidth = 1;
  c.beginPath();
  c.moveTo(-3, BLR_DECK_TOP + 5);
  c.lineTo(tile + 3, BLR_DECK_TOP + 5);
  c.moveTo(-3, BLR_DECK_TOP + 8);
  c.lineTo(tile + 3, BLR_DECK_TOP + 8);
  c.stroke();
}

// Skyline towers: 8 cached kinds, drawn at f.farPalms positions.
const towerCache = new Map<number, { cv: HTMLCanvasElement; w: number; h: number }>();
const TP = 4, TT = 22;

function towerLayer(i: number, res: number) {
  let t = towerCache.get(i);
  if (t) return t;
  const w = Math.round(26 + hash(i * 3.7) * 22), h = Math.round(56 + hash(i * 5.1) * 64);
  const kind = i % 4;
  const cv = makeLayer(w + TP * 2, h + TT + 4, res, (c) => {
    const x = TP, y = TT;
    c.beginPath();
    if (kind === 3) c.roundRect(x, y, w, h + 4, [w / 2, w / 2, 0, 0]);
    else c.rect(x, y, w, h + 4);
    const fills = ["#6cc0ff", i < 4 ? "#ffe0b0" : "#ffc6d9", "#d6dde8", "#8fd7d0"];
    ink(c, fills[kind]!, 1.6);
    c.save();
    c.clip();
    if (kind === 0 || kind === 3) {
      // Glass: mullions, white reflection bands, halftone shade.
      c.strokeStyle = "rgba(17,17,17,0.45)";
      c.lineWidth = 0.7;
      c.beginPath();
      for (let xx = x + 7; xx < x + w; xx += 7) {
        c.moveTo(xx, y);
        c.lineTo(xx, y + h + 4);
      }
      for (let yy = y + 8; yy < y + h; yy += 10) {
        c.moveTo(x, yy);
        c.lineTo(x + w, yy);
      }
      c.stroke();
      c.fillStyle = "rgba(255,255,255,0.55)";
      for (const o of [0.15, 0.5]) {
        c.beginPath();
        c.moveTo(x + w * o, y + h + 4);
        c.lineTo(x + w * o + 8, y + h + 4);
        c.lineTo(x + w * o + 8 + h * 0.5, y);
        c.lineTo(x + w * o + h * 0.5, y);
        c.closePath();
        c.fill();
      }
      halftone(c, x + w * 0.62, y, x + w, y + h + 4, 3.4, kind === 0 ? "#2f7fd0" : "#2a9a8c", () => 1);
    } else if (kind === 1) {
      // Apartment block: window grid, some lit.
      for (let yy = y + 6, r = 0; yy < y + h - 4; yy += 9, r++) {
        for (let xx = x + 4, k = 0; xx < x + w - 5; xx += 8, k++) {
          c.beginPath();
          c.rect(xx, yy, 4.5, 4.5);
          ink(c, hash(i * 9.1 + r * 3.3 + k) > 0.8 ? "#ffe14d" : "#5a6b8c", 0.6);
        }
      }
      halftone(c, x + w * 0.7, y, x + w, y + h + 4, 3.4, "rgba(150,80,40,0.5)", () => 0.9);
    } else {
      // Slab tower with horizontal bands.
      c.fillStyle = "#8fa3c0";
      for (let yy = y + 5; yy < y + h; yy += 7) c.fillRect(x, yy, w, 2.4);
      halftone(c, x + w * 0.65, y, x + w, y + h + 4, 3.4, "#7187a8", () => 0.9);
    }
    c.restore();
    if (kind === 1) {
      // Rooftop water tank.
      c.beginPath();
      c.rect(x + w - 14, y - 8, 9, 8);
      ink(c, "#3a6fd0", 1.2);
    } else if (kind === 2) {
      c.strokeStyle = INK;
      c.lineWidth = 1.2;
      c.beginPath();
      c.moveTo(x + w / 2, y);
      c.lineTo(x + w / 2, y - 16);
      c.stroke();
      c.fillStyle = "#e11d2e";
      c.beginPath();
      c.arc(x + w / 2, y - 16, 1.6, 0, Math.PI * 2);
      c.fill();
    } else if (kind === 0) {
      c.beginPath();
      c.rect(x + 3, y - 4, w - 6, 4);
      ink(c, "#d6dde8", 1.1);
    }
  });
  t = { cv, w, h };
  towerCache.set(i, t);
  return t;
}

function crane(c: CanvasRenderingContext2D, x: number, topY: number, dir: number) {
  const mt = topY - 30;
  limb(c, [{ x, y: topY }, { x, y: mt }], "#ffc21a", 2.2);
  limb(c, [{ x: x - dir * 14, y: mt }, { x: x + dir * 44, y: mt }], "#ffc21a", 2);
  c.strokeStyle = INK;
  c.lineWidth = 0.8;
  c.beginPath();
  for (let k = 0; k < 5; k++) {
    c.moveTo(x - 1.5, topY - k * 6);
    c.lineTo(x + 1.5, topY - k * 6 - 3);
  }
  c.moveTo(x, mt - 8);
  c.lineTo(x + dir * 40, mt);
  c.moveTo(x, mt - 8);
  c.lineTo(x - dir * 12, mt);
  c.moveTo(x + dir * 32, mt);
  c.lineTo(x + dir * 32, mt + 16);
  c.stroke();
  c.beginPath();
  c.rect(x - dir * 14 - 3, mt, 7, 5);
  ink(c, "#5b6472", 1);
  c.beginPath();
  c.rect(x + dir * 32 - 3, mt + 16, 6, 4);
  ink(c, "#e11d2e", 1);
}

/** A skyline cluster at a far-palm position: one or two towers, sometimes a crane. */
export function skyline(c: CanvasRenderingContext2D, x: number, res: number) {
  const i = Math.floor(hash(x * 0.13) * 8);
  if (hash(x * 0.71) > 0.45) {
    const t2 = towerLayer((i + 3) % 8, res);
    c.drawImage(t2.cv, x + 26 - t2.w / 2 - TP, TOWER_BASE - t2.h - TT, t2.w + TP * 2, t2.h + TT + 4);
  }
  const t = towerLayer(i, res);
  c.drawImage(t.cv, x - t.w / 2 - TP, TOWER_BASE - t.h - TT, t.w + TP * 2, t.h + TT + 4);
  if (hash(x * 0.37) < 0.16) crane(c, x - t.w * 0.2, TOWER_BASE - t.h, hash(x) > 0.5 ? 1 : -1);
}

/** A paper kite with a tail and string. */
export function kite(c: CanvasRenderingContext2D, x: number, y: number, s: number, col: string, sway: number) {
  c.strokeStyle = INK;
  c.lineWidth = 0.7;
  c.beginPath();
  c.moveTo(x, y + 9 * s);
  c.quadraticCurveTo(x - 30, y + 40, x - 70, y + 110);
  c.stroke();
  c.lineWidth = 1;
  c.beginPath();
  c.moveTo(x, y + 9 * s);
  for (let k = 1; k <= 4; k++) c.lineTo(x + (k % 2 ? 3 : -3) + sway * k, y + 9 * s + k * 5);
  c.stroke();
  c.save();
  c.translate(x, y);
  c.rotate(0.15 + sway * 0.05);
  c.beginPath();
  c.moveTo(0, -9 * s);
  c.lineTo(7 * s, 0);
  c.lineTo(0, 9 * s);
  c.lineTo(-7 * s, 0);
  c.closePath();
  ink(c, col, 1.4);
  c.strokeStyle = INK;
  c.lineWidth = 0.8;
  c.beginPath();
  c.moveTo(0, -9 * s);
  c.lineTo(0, 9 * s);
  c.moveTo(-7 * s, 0);
  c.lineTo(7 * s, 0);
  c.stroke();
  c.restore();
}

/** The metro train on the viaduct, centred at cx, moving right, with speed lines. */
export function metroTrain(c: CanvasRenderingContext2D, cx: number, frame: number, calm: boolean) {
  const carW = 46, n = 3, gap = 3;
  const total = n * carW + (n - 1) * gap;
  const x0 = cx - total / 2, top = BLR_DECK_TOP - 19, bot = BLR_DECK_TOP - 1.5;
  if (!calm) {
    c.strokeStyle = INK;
    c.lineWidth = 1.3;
    c.lineCap = "round";
    c.beginPath();
    for (let i = 0; i < 4; i++) {
      const y = top + 3 + i * 4.5;
      const len = 16 + hash(frame + i * 2.3) * 22;
      c.moveTo(x0 - 5 - hash(i + frame) * 4, y);
      c.lineTo(x0 - 5 - len, y);
    }
    c.stroke();
  }
  for (let i = 0; i < n; i++) {
    const x = x0 + i * (carW + gap);
    if (i) {
      c.fillStyle = INK;
      c.fillRect(x - gap - 0.5, top + 8, gap + 1, 4);
    }
    c.beginPath();
    c.roundRect(x, top, carW, bot - top, i === n - 1 ? [3, 9, 2, 2] : i === 0 ? [7, 3, 2, 2] : 3);
    ink(c, "#f2f4f8", 1.8);
    halftone(c, x + 2, bot - 5, x + carW - 2, bot - 1, 2.4, "rgba(17,17,17,0.3)", () => 0.55);
    c.fillStyle = "#8b3fd9";
    c.fillRect(x + 1, top + 11.5, carW - 2, 2.8);
    for (let k = 0; k < 3; k++) {
      const wx = x + 5 + k * 14 + (i === n - 1 && k === 2 ? 2 : 0);
      c.beginPath();
      c.rect(wx, top + 3, k === 1 ? 6 : 9, k === 1 ? 13 : 6.5);
      ink(c, k === 1 ? "#cfd6de" : "#2b3a67", 1);
      if (k !== 1) {
        c.fillStyle = "#fff";
        c.fillRect(wx + 1.2, top + 4, 2, 1.2);
      }
    }
    c.fillStyle = INK;
    c.beginPath();
    for (const wx of [x + 8, x + carW - 8]) {
      c.moveTo(wx + 2.4, bot);
      c.arc(wx, bot, 2.4, 0, Math.PI * 2);
    }
    c.fill();
  }
  c.beginPath();
  c.arc(x0 + total - 2.5, bot - 5, 1.6, 0, Math.PI * 2);
  ink(c, "#ffe14d", 0.8);
}

// Gulmohar / rain trees, cached per size + lean + kind.
const treeCache = new Map<string, HTMLCanvasElement>();

export function cityTree(c: CanvasRenderingContext2D, x: number, baseY: number, h: number, lean: number, res: number) {
  const H = Math.round(h / 4) * 4, L = Math.round(lean * 20) / 20, kind = hash(Math.round(x) * 0.29) < 0.3 ? 1 : 0;
  const W = H * 1.4, HH = H + 8;
  const key = `${H}|${L}|${kind}`;
  let cv = treeCache.get(key);
  if (!cv) {
    if (treeCache.size > 48) treeCache.clear();
    cv = makeLayer(W, HH, res, (t) => paintTree(t, W / 2, HH - 4, H, L, kind));
    treeCache.set(key, cv);
  }
  c.drawImage(cv, x - W / 2, baseY - HH + 4, W, HH);
}

function paintTree(c: CanvasRenderingContext2D, bx: number, by: number, H: number, L: number, kind: number) {
  const tx = bx + L * H * 0.6, ty = by - H * 0.6;
  c.beginPath();
  c.moveTo(bx - 5, by);
  c.quadraticCurveTo(bx - 3, by - H * 0.3, tx - 2.5, ty);
  c.lineTo(tx + 2.5, ty);
  c.quadraticCurveTo(bx + 3, by - H * 0.3, bx + 5, by);
  c.closePath();
  ink(c, "#8a5a3a", 2);
  limb(c, [{ x: tx, y: ty + 8 }, { x: tx - H * 0.2, y: ty - 6 }], "#8a5a3a", 2.2);
  limb(c, [{ x: tx, y: ty + 4 }, { x: tx + H * 0.22, y: ty - 8 }], "#8a5a3a", 2.2);
  const cx = tx, cy = ty - H * 0.1, rx = H * 0.4, ry = H * 0.17;
  const greens = kind ? ["#1f8a46", "#2fa055"] : ["#2fa055", "#3fbf62"];
  const blobs: [number, number, number][] = [];
  for (let i = 0; i < 11; i++) {
    const a = (i / 11) * Math.PI * 2 + hash(i * 1.7 + H) * 0.4;
    const k = i % 3 === 0 ? 0.35 : 0.85;
    blobs.push([cx + Math.cos(a) * rx * k, cy + Math.sin(a) * ry * k, H * (0.1 + hash(i * 3.1 + H) * 0.05)]);
  }
  blobs.sort((a, b) => a[1] - b[1]);
  blobs.forEach(([x, y, r], i) => {
    c.beginPath();
    c.arc(x, y, r, 0, Math.PI * 2);
    ink(c, greens[i % 2]!, 1.7);
  });
  halftone(c, cx - rx - 8, cy, cx + rx + 8, cy + ry + 12, 3.4, "rgba(15,70,30,0.6)", (x, y) => {
    const d = ((x - cx) / (rx + 6)) ** 2 + ((y - cy) / (ry + 8)) ** 2;
    return d < 1 ? 0.4 + (y - cy) / (ry * 2.2) : 0;
  });
  const n = kind ? 14 : 26;
  for (let i = 0; i < n; i++) {
    const a = hash(i * 5.7 + H) * Math.PI * 2, rr = Math.sqrt(hash(i * 2.9 + H));
    const x = cx + Math.cos(a) * rx * rr * 1.05, y = cy - 3 + Math.sin(a) * ry * rr * 1.05 - (kind ? 0 : 2);
    c.beginPath();
    c.arc(x, y, kind ? 1.6 : 2.2 + hash(i * 7.3) * 1.6, 0, Math.PI * 2);
    ink(c, kind ? "#ff9ec7" : i % 3 ? "#ff4a1c" : "#ff9a1c", 0.8);
  }
}

/** An auto-rickshaw: wheel line at y, facing dir, with speed lines behind. */
export function autoRickshaw(c: CanvasRenderingContext2D, x: number, y: number, dir: 1 | -1, frame: number, calm: boolean, seed: number) {
  c.save();
  c.translate(x, y);
  c.scale(dir, 1);
  c.fillStyle = "rgba(17,17,17,0.35)";
  c.beginPath();
  c.ellipse(0, 0.5, 17, 2.4, 0, 0, Math.PI * 2);
  c.fill();
  if (!calm) {
    c.strokeStyle = INK;
    c.lineWidth = 1.2;
    c.lineCap = "round";
    c.beginPath();
    for (let i = 0; i < 3; i++) {
      const yy = -6 - i * 6;
      const len = 10 + hash(frame + i * 1.7 + seed) * 16;
      c.moveTo(-20 - hash(i + frame + seed) * 3, yy);
      c.lineTo(-20 - len, yy);
    }
    c.stroke();
  }
  // Body: yellow front, green lower panel.
  c.beginPath();
  c.moveTo(-16, -3);
  c.lineTo(-16, -14);
  c.lineTo(7, -14);
  c.quadraticCurveTo(15, -13, 16, -4);
  c.lineTo(16, -3);
  c.closePath();
  ink(c, "#ffd23f", 1.7);
  c.fillStyle = "#2fae4f";
  c.fillRect(-15.2, -8, 30.4, 4.2);
  // Black canopy.
  c.beginPath();
  c.moveTo(-16, -13);
  c.lineTo(-15, -22);
  c.quadraticCurveTo(-4, -26, 7, -23);
  c.lineTo(10, -14);
  c.closePath();
  ink(c, "#1d1d1d", 1.5);
  c.beginPath();
  c.rect(-11, -21, 12, 6.5);
  ink(c, "#fff7cc", 0.9);
  c.beginPath();
  c.arc(15, -10, 1.6, 0, Math.PI * 2);
  ink(c, "#fff", 0.8);
  for (const wx of [-10, 11]) {
    c.beginPath();
    c.arc(wx, -3, 3.4, 0, Math.PI * 2);
    ink(c, "#222", 1.2);
    c.fillStyle = "#cfd6de";
    c.beginPath();
    c.arc(wx, -3, 1.2, 0, Math.PI * 2);
    c.fill();
  }
  c.restore();
}

/** A city bus: wheel line at y, facing dir. */
export function cityBus(c: CanvasRenderingContext2D, x: number, y: number, dir: 1 | -1, frame: number, calm: boolean) {
  c.save();
  c.translate(x, y);
  c.scale(dir, 1);
  c.fillStyle = "rgba(17,17,17,0.35)";
  c.beginPath();
  c.ellipse(0, 0.5, 38, 2.6, 0, 0, Math.PI * 2);
  c.fill();
  if (!calm) {
    c.strokeStyle = INK;
    c.lineWidth = 1.3;
    c.lineCap = "round";
    c.beginPath();
    for (let i = 0; i < 4; i++) {
      const yy = -7 - i * 6;
      const len = 12 + hash(frame + i * 2.1 + 9) * 20;
      c.moveTo(-40, yy);
      c.lineTo(-40 - len, yy);
    }
    c.stroke();
  }
  c.beginPath();
  c.roundRect(-36, -30, 72, 27, [4, 7, 3, 3]);
  ink(c, "#f4f7fa", 1.8);
  c.fillStyle = "#1fae8c";
  c.fillRect(-35, -12, 70, 7);
  halftone(c, -34, -11, 34, -5, 2.6, "#14806a", () => 0.6);
  for (let k = 0; k < 6; k++) {
    c.beginPath();
    c.rect(-32 + k * 11, -26, 8.5, 9);
    ink(c, "#2b3a67", 1);
  }
  c.beginPath();
  c.rect(31, -26, 4, 13);
  ink(c, "#9fe3ff", 1);
  for (const wx of [-22, 22]) {
    c.beginPath();
    c.arc(wx, -3, 4, 0, Math.PI * 2);
    ink(c, "#222", 1.2);
  }
  c.restore();
}

/** A street light; y is the lamp row's y (same anchor as the Kerala brass lamp). */
export function streetLight(c: CanvasRenderingContext2D, x: number, y: number, lit: boolean, flick: number) {
  c.beginPath();
  c.rect(x - 1.6, y - 26, 3.2, 48);
  ink(c, "#5b6472", 1.2);
  c.beginPath();
  c.rect(x - 4.5, y + 19, 9, 4);
  ink(c, "#5b6472", 1.2);
  c.lineCap = "round";
  for (const [col, lw] of [[INK, 4], ["#5b6472", 1.6]] as const) {
    c.strokeStyle = col;
    c.lineWidth = lw;
    c.beginPath();
    c.moveTo(x, y - 25);
    c.quadraticCurveTo(x + 1, y - 32, x + 8, y - 31);
    c.stroke();
  }
  c.beginPath();
  c.ellipse(x + 9, y - 29.5, 5, 2.4, 0, 0, Math.PI * 2);
  ink(c, lit ? "#ffe14d" : "#cfd6de", 1.2);
  if (!lit) return;
  halftone(c, x - 1, y - 26, x + 19, y - 6, 3, "rgba(255,200,40,0.85)", (px, py) => {
    const dy = py - (y - 27);
    return Math.abs(px - (x + 9)) < dy * 0.45 + 2 ? 0.9 * flick - dy * 0.03 : 0;
  });
  c.strokeStyle = INK;
  c.lineWidth = 1.1;
  c.beginPath();
  for (const a of [-2.6, -1.57, -0.54]) {
    c.moveTo(x + 9 + Math.cos(a) * 7, y - 30 + Math.sin(a) * 7);
    c.lineTo(x + 9 + Math.cos(a) * 11, y - 30 + Math.sin(a) * 11);
  }
  c.stroke();
}

/** The project's name on a signboard (same lettering as the Kerala shops). */
export function nameBoard(c: CanvasRenderingContext2D, rawName: string, cx: number, y: number, maxW: number, fill: string, color: string) {
  let size = 8.5;
  c.font = `900 ${size}px ${FONT}`;
  const name = rawName.toUpperCase();
  while (c.measureText(name).width + 12 > maxW && size > 5.5) {
    size -= 0.5;
    c.font = `900 ${size}px ${FONT}`;
  }
  const bw = Math.min(maxW, c.measureText(name).width + 12);
  const bx = cx - bw / 2;
  c.fillStyle = INK;
  c.fillRect(bx + 2, y + 2, bw, 14);
  c.beginPath();
  c.rect(bx, y, bw, 14);
  ink(c, fill, 2);
  c.fillStyle = color;
  c.textAlign = "center";
  c.textBaseline = "middle";
  c.fillText(name, cx, y + 7.5);
}

// ── companions (subagents) ───────────────────────────────────────────────────

export const EMOJI_FONT = "'Segoe UI Emoji', 'Apple Color Emoji', 'Noto Color Emoji', sans-serif";

const tintCache = new Map<string, string>();
/** A colour mixed towards white (k = 0..1); unknown formats come back unchanged. */
export function lighten(col: string, k: number): string {
  const key = `${col}|${k}`;
  let out = tintCache.get(key);
  if (out) return out;
  const m = /^#([0-9a-f]{6})$/i.exec(col) ?? /^#([0-9a-f]{3})$/i.exec(col);
  if (!m) out = col;
  else {
    const h = m[1].length === 3 ? m[1].replace(/./g, (d) => d + d) : m[1];
    const ch = (i: number) => Math.round(parseInt(h.slice(i, i + 2), 16) * (1 - k) + 255 * k);
    out = `rgb(${ch(0)},${ch(2)},${ch(4)})`;
  }
  if (tintCache.size > 400) tintCache.clear();
  tintCache.set(key, out);
  return out;
}

/** A four-point comic sparkle, inked. */
export function sparkle(c: CanvasRenderingContext2D, x: number, y: number, r: number, fill = "#ffe14d") {
  c.beginPath();
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 - Math.PI / 2;
    const rr = i % 2 ? r * 0.32 : r;
    const px = x + Math.cos(a) * rr, py = y + Math.sin(a) * rr;
    i ? c.lineTo(px, py) : c.moveTo(px, py);
  }
  c.closePath();
  ink(c, fill, 0.9);
}

/** A small white work puff. */
export function puff(c: CanvasRenderingContext2D, x: number, y: number, r: number) {
  c.beginPath();
  c.arc(x, y, r, 0, Math.PI * 2);
  ink(c, "#fff", 0.9);
}

/** A tilted, outlined sound-effect word ("SCRIBBLE", "CLACK"). */
export function sfx(c: CanvasRenderingContext2D, x: number, y: number, word: string, fill: string, rot: number, size = 7) {
  c.save();
  c.translate(x, y);
  c.rotate(rot);
  c.font = `900 ${size}px ${FONT}`;
  c.textAlign = "center";
  c.textBaseline = "middle";
  c.lineWidth = size * 0.3;
  c.lineJoin = "round";
  c.strokeStyle = INK;
  c.strokeText(word, 0, 0);
  c.fillStyle = fill;
  c.fillText(word, 0, 0);
  c.restore();
}

/** A round inked badge holding an emoji (the companion's activity prop). */
export function iconBadge(c: CanvasRenderingContext2D, x: number, y: number, icon: string, r = 6) {
  c.beginPath();
  c.arc(x, y, r, 0, Math.PI * 2);
  ink(c, "#fff", 1.1);
  c.font = `${r * 1.45}px ${EMOJI_FONT}`;
  c.textAlign = "center";
  c.textBaseline = "middle";
  c.fillStyle = INK;
  c.fillText(icon, x, y + r * 0.08);
}

/** A tiny speech bubble with one glyph ("?"), tail pointing down-left/right. */
export function glyphBubble(c: CanvasRenderingContext2D, x: number, y: number, glyph: string, dir: 1 | -1, fill = "#fff", color = INK) {
  c.beginPath();
  c.ellipse(x, y, 6.5, 5.5, 0, 0, Math.PI * 2);
  c.moveTo(x - dir * 1.5, y + 4.8);
  c.lineTo(x - dir * 5, y + 9.5);
  c.lineTo(x - dir * 4.5, y + 3.5);
  ink(c, fill, 1.1);
  c.font = `900 8px ${FONT}`;
  c.textAlign = "center";
  c.textBaseline = "middle";
  c.fillStyle = color;
  c.fillText(glyph, x, y + 0.6);
}
