/**
 * The mod's listing icon (512×512 PNG): the Ai Gramam brass nilavilakku lamp
 * from client/src/app/BrandMark.tsx, drawn in code (original, CC0).
 *   node scripts/art/icon.mjs
 */
import path from "node:path";
import { Img, linear, quad, radial, rgba } from "./raster.mjs";

const S = 512 / 40; // BrandMark's viewBox is 40×40
const p = (x, y) => [x * S, y * S];

export function buildIcon(file) {
  const img = new Img(512, 512, 2);
  const brass = linear(6 * S, 0, 34 * S, 0, [[0, rgba("#8a6418")], [0.45, rgba("#f2cf7a")], [1, rgba("#a8781f")]]);
  const flame = radial(20 * S, 10.5 * S, 5 * S, [[0, rgba("#fff6c8")], [0.5, rgba("#ffc24d")], [1, rgba("#ff7a2a")]]);
  // Background: dark green disc filling the square, brass ring.
  img.rect(0, 0, 512, 512, rgba("#0d1916"));
  img.circle(256, 256, 19.6 * S, rgba("#e3b04b", 0.6));
  img.circle(256, 256, 19 * S, radial(256, 200, 19 * S, [[0, rgba("#1d322c")], [1, rgba("#13221e")]]));
  // Glow behind the flame.
  img.circle(20 * S, 11 * S, 8 * S, radial(20 * S, 11 * S, 8 * S, [[0, rgba("#ffc24d", 0.35)], [1, rgba("#ffc24d", 0)]]));
  // Flame: a drop shape.
  const flamePts = [...quad(p(20, 4.5), p(23.6, 8.6), p(23.4, 11.7), 24), ...quad(p(23.4, 11.7), p(23.2, 15.3), p(20, 15.2), 16), ...quad(p(20, 15.2), p(16.8, 15.3), p(16.6, 11.7), 16), ...quad(p(16.6, 11.7), p(16.4, 8.6), p(20, 4.5), 24)];
  img.fillPoly(flamePts, flame);
  // Lamp: bowl, stem, middle ring, foot.
  img.ellipse(20 * S, 17.2 * S, 7.5 * S, 2 * S, brass);
  img.rect(18.6 * S, 17.5 * S, 2.8 * S, 12 * S, brass);
  img.ellipse(20 * S, 23 * S, 4.2 * S, 1.3 * S, brass);
  const foot = [...quad(p(13.5, 32.5), p(16, 29.5), p(20, 29.5), 20), ...quad(p(20, 29.5), p(24, 29.5), p(26.5, 32.5), 20)];
  img.fillPoly(foot, brass);
  img.save(file);
}

if (import.meta.url === `file:///${process.argv[1]?.replace(/\\/g, "/")}` || process.argv[1]?.endsWith("icon.mjs")) {
  buildIcon(path.resolve(import.meta.dirname, "..", "..", "plugin", "ai-gramam", ".claude-plugin", "icon.png"));
}
