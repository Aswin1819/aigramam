/**
 * Tiny anti-aliased rasteriser for generating placeholder art in code.
 * Shapes are filled with scanlines on a supersampled canvas and box-filtered
 * down when saved, which gives smooth "vector" edges. No dependencies.
 */
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

// ── Colours ──────────────────────────────────────────────────────────────────
export function rgba(hex, a = 1) {
  const h = hex.replace("#", "");
  const n = parseInt(h.length === 3 ? h.split("").map((c) => c + c).join("") : h.slice(0, 6), 16);
  const alpha = h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : a;
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255, alpha];
}
export const lerp = (a, b, t) => a + (b - a) * t;
export const mixc = (c1, c2, t) => [lerp(c1[0], c2[0], t), lerp(c1[1], c2[1], t), lerp(c1[2], c2[2], t), lerp(c1[3], c2[3], t)];
export const shade = (c, k) => (k >= 0 ? mixc(c, [255, 255, 255, c[3]], k) : mixc(c, [0, 0, 0, c[3]], -k));
export const withAlpha = (c, a) => [c[0], c[1], c[2], a];

/** Deterministic noise so regenerated art is identical. */
export function rng(seed = 1) {
  let s = seed >>> 0 || 1;
  return () => ((s = (Math.imul(s, 1103515245) + 12345) >>> 0) / 4294967296);
}
export function hashNoise(x, y, seed = 0) {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(seed, 2147483647);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

// ── Gradients (paint functions) ──────────────────────────────────────────────
function stopsAt(stops, t) {
  t = Math.max(0, Math.min(1, t));
  for (let i = 1; i < stops.length; i++) {
    if (t <= stops[i][0]) {
      const [t0, c0] = stops[i - 1], [t1, c1] = stops[i];
      return mixc(c0, c1, (t - t0) / Math.max(1e-6, t1 - t0));
    }
  }
  return stops[stops.length - 1][1];
}
export const linear = (x0, y0, x1, y1, stops) => {
  const dx = x1 - x0, dy = y1 - y0, len2 = dx * dx + dy * dy || 1;
  return (x, y) => stopsAt(stops, ((x - x0) * dx + (y - y0) * dy) / len2);
};
export const radial = (cx, cy, r, stops) => (x, y) => stopsAt(stops, Math.hypot(x - cx, y - cy) / r);

// ── Canvas ───────────────────────────────────────────────────────────────────
export class Img {
  /** w/h in final pixels; ss = supersampling factor used while drawing. */
  constructor(w, h, ss = 2) {
    this.w = w; this.h = h; this.ss = ss;
    this.W = Math.round(w * ss); this.H = Math.round(h * ss);
    this.d = new Float32Array(this.W * this.H * 4); // premultiplied-free RGBA, alpha 0..1
  }

  blend(i, c, a) {
    if (a <= 0) return;
    const d = this.d, k = i * 4, da = d[k + 3], oa = a + da * (1 - a);
    if (oa <= 0) return;
    for (let j = 0; j < 3; j++) d[k + j] = (c[j] * a + d[k + j] * da * (1 - a)) / oa;
    d[k + 3] = oa;
  }

  /** Fill one or more closed polygons (even-odd), coordinates in final pixels. */
  fillPoly(polys, paint, alpha = 1) {
    const list = Array.isArray(polys[0][0]) ? polys : [polys];
    const s = this.ss;
    let minY = Infinity, maxY = -Infinity;
    const edges = [];
    for (const poly of list) {
      for (let i = 0; i < poly.length; i++) {
        const [x0, y0] = poly[i], [x1, y1] = poly[(i + 1) % poly.length];
        if (y0 === y1) continue;
        edges.push([x0 * s, y0 * s, x1 * s, y1 * s]);
        minY = Math.min(minY, y0 * s, y1 * s); maxY = Math.max(maxY, y0 * s, y1 * s);
      }
    }
    const fn = typeof paint === "function" ? paint : null;
    const col = fn ? null : paint;
    for (let py = Math.max(0, Math.floor(minY)); py <= Math.min(this.H - 1, Math.ceil(maxY)); py++) {
      const yc = py + 0.5, xs = [];
      for (const [x0, y0, x1, y1] of edges) if ((y0 <= yc && y1 > yc) || (y1 <= yc && y0 > yc)) xs.push(x0 + ((yc - y0) * (x1 - x0)) / (y1 - y0));
      xs.sort((a, b) => a - b);
      for (let k = 0; k + 1 < xs.length; k += 2) {
        const xa = Math.max(0, Math.ceil(xs[k] - 0.5)), xb = Math.min(this.W - 1, Math.floor(xs[k + 1] - 0.5));
        for (let px = xa; px <= xb; px++) {
          const c = fn ? fn((px + 0.5) / s, yc / s) : col;
          this.blend(py * this.W + px, c, c[3] * alpha);
        }
      }
    }
    return this;
  }

  rect(x, y, w, h, paint, alpha = 1) {
    return this.fillPoly([[x, y], [x + w, y], [x + w, y + h], [x, y + h]], paint, alpha);
  }

  ellipse(cx, cy, rx, ry, paint, alpha = 1, rot = 0) {
    const n = Math.max(24, Math.min(160, Math.round((rx + ry) * 0.9)));
    const pts = [];
    for (let i = 0; i < n; i++) {
      const t = (i / n) * Math.PI * 2, ex = Math.cos(t) * rx, ey = Math.sin(t) * ry;
      pts.push([cx + ex * Math.cos(rot) - ey * Math.sin(rot), cy + ex * Math.sin(rot) + ey * Math.cos(rot)]);
    }
    return this.fillPoly(pts, paint, alpha);
  }

  circle(cx, cy, r, paint, alpha = 1) {
    return this.ellipse(cx, cy, r, r, paint, alpha);
  }

  /** Thick polyline with rounded joins (a stroke). */
  stroke(points, width, paint, alpha = 1) {
    const r = width / 2;
    for (let i = 0; i + 1 < points.length; i++) {
      const [x0, y0] = points[i], [x1, y1] = points[i + 1];
      const len = Math.hypot(x1 - x0, y1 - y0) || 1, nx = (-(y1 - y0) / len) * r, ny = ((x1 - x0) / len) * r;
      this.fillPoly([[x0 + nx, y0 + ny], [x1 + nx, y1 + ny], [x1 - nx, y1 - ny], [x0 - nx, y0 - ny]], paint, alpha);
    }
    for (const [x, y] of points) this.circle(x, y, r, paint, alpha);
    return this;
  }

  /** Tapered stroke: width goes from w0 to w1 along the path (fronds, trunks, grass). */
  taper(points, w0, w1, paint, alpha = 1) {
    const left = [], right = [];
    for (let i = 0; i < points.length; i++) {
      const [x, y] = points[i];
      const [ax, ay] = points[Math.max(0, i - 1)], [bx, by] = points[Math.min(points.length - 1, i + 1)];
      const len = Math.hypot(bx - ax, by - ay) || 1;
      const w = lerp(w0, w1, i / Math.max(1, points.length - 1)) / 2;
      left.push([x - ((by - ay) / len) * w, y + ((bx - ax) / len) * w]);
      right.push([x + ((by - ay) / len) * w, y - ((bx - ax) / len) * w]);
    }
    return this.fillPoly([...left, ...right.reverse()], paint, alpha);
  }

  /** Box blur (3 passes ≈ gaussian) of the whole canvas; radius in final pixels. */
  blur(radius) {
    const r = Math.max(1, Math.round(radius * this.ss));
    for (let pass = 0; pass < 3; pass++) {
      this.blur1D(r, true);
      this.blur1D(r, false);
    }
    return this;
  }

  blur1D(r, horizontal) {
    const { W, H, d } = this;
    const out = new Float32Array(d.length);
    const n = horizontal ? W : H, m = horizontal ? H : W;
    for (let j = 0; j < m; j++) {
      const acc = [0, 0, 0, 0];
      const idx = (i) => (horizontal ? j * W + i : i * W + j) * 4;
      const get = (i, c) => { const k = idx(Math.max(0, Math.min(n - 1, i))); return c === 3 ? d[k + 3] : d[k + c] * d[k + 3]; };
      for (let i = -r; i <= r; i++) for (let c = 0; c < 4; c++) acc[c] += get(i, c);
      for (let i = 0; i < n; i++) {
        const k = idx(i), a = acc[3] / (2 * r + 1);
        out[k + 3] = a;
        for (let c = 0; c < 3; c++) out[k + c] = a > 0 ? acc[c] / (2 * r + 1) / a : 0;
        for (let c = 0; c < 4; c++) acc[c] += get(i + r + 1, c) - get(i - r, c);
      }
    }
    this.d = out;
  }

  /** Draw another Img on top (same supersampling), offset in final pixels. */
  draw(img, x = 0, y = 0, alpha = 1) {
    const ox = Math.round(x * this.ss), oy = Math.round(y * this.ss);
    for (let j = 0; j < img.H; j++) {
      const ty = j + oy;
      if (ty < 0 || ty >= this.H) continue;
      for (let i = 0; i < img.W; i++) {
        const tx = i + ox;
        if (tx < 0 || tx >= this.W) continue;
        const k = (j * img.W + i) * 4, a = img.d[k + 3] * alpha;
        if (a > 0) this.blend(ty * this.W + tx, [img.d[k], img.d[k + 1], img.d[k + 2]], a);
      }
    }
    return this;
  }

  /** Multiply alpha by a function (e.g. fade a layer towards the horizon). */
  mask(fn) {
    for (let j = 0; j < this.H; j++) for (let i = 0; i < this.W; i++) this.d[(j * this.W + i) * 4 + 3] *= fn((i + 0.5) / this.ss, (j + 0.5) / this.ss);
    return this;
  }

  /** Box-filter down to final size and write a PNG. */
  save(file, log = true) {
    const { w, h, ss, W, d } = this;
    const out = new Uint8Array(w * h * 4);
    const fs_ = Math.round(ss);
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        let r = 0, g = 0, b = 0, a = 0;
        for (let j = 0; j < fs_; j++)
          for (let i = 0; i < fs_; i++) {
            const k = ((y * fs_ + j) * W + (x * fs_ + i)) * 4, pa = d[k + 3];
            r += d[k] * pa; g += d[k + 1] * pa; b += d[k + 2] * pa; a += pa;
          }
        const n = fs_ * fs_, o = (y * w + x) * 4;
        out[o + 3] = Math.round((a / n) * 255);
        if (a > 0) { out[o] = Math.round(r / a); out[o + 1] = Math.round(g / a); out[o + 2] = Math.round(b / a); }
      }
    writePng(file, w, h, out);
    if (log) console.log(`  ${path.relative(process.cwd(), file)}  ${w}×${h}`);
  }
}

// ── PNG ──────────────────────────────────────────────────────────────────────
const CRC = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
};
export function writePng(file, w, h, rgba8) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6;
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) Buffer.from(rgba8.buffer, rgba8.byteOffset + y * w * 4, w * 4).copy(raw, y * (w * 4 + 1) + 1);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", ihdr), chunk("IDAT", zlib.deflateSync(raw, { level: 9 })), chunk("IEND", Buffer.alloc(0))]));
}

// ── Shape helpers ────────────────────────────────────────────────────────────
/** Points along a quadratic bezier. */
export function quad(p0, p1, p2, n = 16) {
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n, u = 1 - t;
    pts.push([u * u * p0[0] + 2 * u * t * p1[0] + t * t * p2[0], u * u * p0[1] + 2 * u * t * p1[1] + t * t * p2[1]]);
  }
  return pts;
}
/** Points along a cubic bezier. */
export function cubic(p0, p1, p2, p3, n = 24) {
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n, u = 1 - t;
    pts.push([
      u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0],
      u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1],
    ]);
  }
  return pts;
}
/** A soft blurred shape as its own layer (glows, drop shadows). */
export function softShape(w, h, ss, drawFn, radius) {
  const img = new Img(w, h, ss);
  drawFn(img);
  return img.blur(radius);
}
