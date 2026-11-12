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
