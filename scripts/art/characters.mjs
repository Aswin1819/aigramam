/**
 * Built-in character packs: original pixel-art characters (CC0).
 * Each pack = pack.json + sprites.png with 8 rows (idle, walk, read, write,
 * bash, wait, celebrate, error) of 32×48 frames, drawn from a pose system.
 */
import fs from "node:fs";
import path from "node:path";
import { writePng } from "./raster.mjs";

const FW = 32, FH = 48, COLS = 8;
const ROWS = [
  ["idle", 4], ["walk", 6], ["read", 4], ["write", 4], ["bash", 6], ["wait", 4], ["celebrate", 6], ["error", 4],
];

const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16), 255];
const toHex = (c) => "#" + c.slice(0, 3).map((v) => v.toString(16).padStart(2, "0")).join("");
const OUTLINE = hex("#1c1410");

class Sheet {
  constructor(w, h) {
    this.w = w; this.h = h;
    this.d = new Uint8Array(w * h * 4);
  }
  px(x, y, c) {
    x = Math.round(x); y = Math.round(y);
    if (x < 0 || y < 0 || x >= this.w || y >= this.h || !c) return;
    const i = (y * this.w + x) * 4;
    this.d[i] = c[0]; this.d[i + 1] = c[1]; this.d[i + 2] = c[2]; this.d[i + 3] = c[3];
  }
  get(x, y) {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return 0;
    return this.d[(y * this.w + x) * 4 + 3];
  }
}

const darker = (c, k = 0.55) => [Math.round(c[0] * k), Math.round(c[1] * k), Math.round(c[2] * k), 255];

/** Draws into one 32×48 cell at (ox, oy). */
class Frame {
  constructor(sheet, ox, oy) { this.s = sheet; this.ox = ox; this.oy = oy; }
  px(x, y, c) { if (x >= 0 && y >= 0 && x < FW && y < FH) this.s.px(this.ox + x, this.oy + y, c); }
  rect(x, y, w, h, c) { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.px(x + i, y + j, c); }
  /** Thick line (limbs). */
  line(x0, y0, x1, y1, c, t = 3) {
    const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
    for (let s = 0; s <= n; s++) {
      const x = x0 + ((x1 - x0) * s) / n, y = y0 + ((y1 - y0) * s) / n;
      this.rect(Math.round(x - (t - 1) / 2), Math.round(y - (t - 1) / 2), t, t, c);
    }
  }
  /** Limb with a darker contour so it stays visible over the body. */
  limb(x0, y0, x1, y1, c) {
    this.line(x0, y0, x1, y1, darker(c), 4);
    this.line(x0, y0, x1, y1, c, 2);
  }
  /** Dark 1px outline around everything drawn in this cell. */
  outline() {
    const { s, ox, oy } = this;
    const add = [];
    for (let y = 0; y < FH; y++)
      for (let x = 0; x < FW; x++) {
        if (s.get(ox + x, oy + y)) continue;
        if (s.get(ox + x + 1, oy + y) || s.get(ox + x - 1, oy + y) || s.get(ox + x, oy + y + 1) || s.get(ox + x, oy + y - 1)) add.push([x, y]);
      }
    for (const [x, y] of add) this.px(x, y, OUTLINE);
  }
}

// ── Poses ────────────────────────────────────────────────────────────────────
// Hands are given relative to the shoulder; feet as forward offset / lift.
function pose(anim, f) {
  const p = { bob: 0, footF: [0, 0], footB: [0, 0], handF: [3, 11], handB: [-2, 11], tilt: 0, blink: false, mouth: "line", item: null, sweat: false, screen: 0 };
  switch (anim) {
    case "idle":
      p.bob = [0, 0, 1, 0][f];
      p.blink = f === 3;
      p.handF = [3, 11 - (f === 2 ? 1 : 0)];
      break;
    case "walk": {
      const cyc = [[4, 0], [2, 1], [-2, 0], [-4, 0], [-2, 1], [2, 0]][f];
      p.footF = [cyc[0], cyc[1]];
      p.footB = [-cyc[0], [0, 0, 1, 0, 0, 1][f]];
      p.bob = [0, 1, 0, 0, 1, 0][f];
      p.handF = [-cyc[0] * 0.8 + 1, 10];
      p.handB = [cyc[0] * 0.8 - 1, 10];
      break;
    }
    case "read":
      p.item = "paper";
      p.handF = [7, 6];
      p.handB = [5, 7];
      p.tilt = 1;
      p.bob = [0, 0, 1, 0][f];
      p.blink = f === 1;
      p.screen = f === 3 ? 1 : 0; // page turn
      break;
    case "write":
      p.item = "laptop";
      p.handF = [7, [8, 7, 8, 9][f]];
      p.handB = [5, [9, 8, 7, 8][f]];
      p.tilt = 1;
      p.screen = f % 2;
      break;
    case "bash":
      p.item = "laptop";
      p.handF = [7, [7, 9, 7, 9, 7, 8][f]];
      p.handB = [5, [9, 7, 9, 7, 8, 7][f]];
      p.bob = [0, 1, 0, 1, 0, 0][f];
      p.screen = 2 + (f % 3);
      p.mouth = f % 3 === 0 ? "o" : "line";
      break;
    case "wait":
      p.handF = [[3, -10], [6, -11], [3, -10], [0, -11]][f];
      p.mouth = "smile";
      p.bob = [0, 0, -1, 0][f];
      break;
    case "celebrate":
      p.bob = [0, -2, -5, -6, -4, -1][f];
      p.handF = [4, -11];
      p.handB = [-4, -11];
      p.mouth = "o";
      p.footF = [1, f > 0 && f < 5 ? 1 : 0];
      p.footB = [-1, f > 0 && f < 5 ? 1 : 0];
      break;
    case "error":
      p.handF = [2, -4];
      p.handB = [-3, -4];
      p.tilt = [-1, 1, -1, 1][f];
      p.mouth = "frown";
      p.sweat = f % 2 === 0;
      break;
  }
  return p;
}

// ── Character designs ────────────────────────────────────────────────────────
const SKIN = { base: hex("#a8673d"), dark: hex("#7f4a2a"), light: hex("#c27d4f") };

const DESIGNS = {
  "mundu-hero": {
    name: "Unni (Mundu Hero)",
    role: "hero",
    hair: hex("#16110d"), hairStyle: "wavy", mustache: true,
    shirt: hex("#efe2c4"), shirtDark: hex("#cdbb93"), sleeves: "half",
    lower: "mundu", lowerC: hex("#f6f2e6"), lowerDark: hex("#d9d2bf"), border: hex("#d9a83a"),
    feet: hex("#6b3d1f"), extra: ["watch", "pocket"],
  },
  "shades-villain": {
    name: "Shades (Stylish Villain)",
    role: "villain",
    hair: hex("#0d0d10"), hairStyle: "slick", stubble: true, glasses: true,
    shirt: hex("#202128"), shirtDark: hex("#121318"), sleeves: "full",
    lower: "trousers", lowerC: hex("#3a3c46"), lowerDark: hex("#2a2b33"),
    feet: hex("#0e0e10"), extra: ["chain"],
  },
  "chaya-sidekick": {
    name: "Chaya Kutty (Comic Sidekick)",
    role: "sidekick",
    hair: hex("#211812"), hairStyle: "curly",
    shirt: hex("#f1efe9"), shirtDark: hex("#d2cfc6"), sleeves: "none",
    lower: "lungi", lowerC: hex("#2f7fb5"), lowerDark: hex("#1f5c86"), check: hex("#3fa36a"),
    feet: hex("#7a4a26"), extra: ["towel"],
  },
};

function drawCharacter(fr, d, anim, f) {
  const p = pose(anim, f);
  const b = p.bob;
  const cx = 16; // body centre
  const shoulderY = 18 + b;
  const hipY = 30 + b;

  // Back arm (behind the body)
  const sleeveB = d.sleeves === "full" ? d.shirtDark : d.sleeves === "half" ? d.shirtDark : SKIN.dark;
  const sbx = cx - 4, sby = shoulderY + 1;
  const hbx = sbx + p.handB[0], hby = sby + p.handB[1];
  if (d.sleeves === "half") {
    fr.line(sbx, sby, sbx + (hbx - sbx) * 0.4, sby + (hby - sby) * 0.4, sleeveB);
    fr.line(sbx + (hbx - sbx) * 0.4, sby + (hby - sby) * 0.4, hbx, hby, SKIN.dark);
  } else fr.line(sbx, sby, hbx, hby, sleeveB);
  fr.rect(hbx - 1, hby - 1, 3, 3, SKIN.dark);

  // Legs and feet
  const footY = 45;
  const legs = [[cx - 3 + p.footB[0], p.footB[1], SKIN.dark], [cx + 1 + p.footF[0], p.footF[1], SKIN.base]];
  for (const [fx, lift, skin] of legs) {
    if (d.lower === "trousers") fr.line(cx + (fx > cx ? 1 : -2), hipY, fx + 1, footY - 2 - lift, d.lowerDark, 4);
    else fr.line(fx + 1, footY - 7 - lift, fx + 1, footY - 1 - lift, skin, 3);
    fr.rect(fx - 1, footY - lift, 5, 2, d.feet);
  }

  // Lower garment
  const sway = p.footF[0] * 0.25;
  if (d.lower === "mundu" || d.lower === "lungi") {
    const hem = 41 + b - (anim === "celebrate" ? 1 : 0);
    for (let y = hipY; y <= hem; y++) {
      const t = (y - hipY) / (hem - hipY);
      const x0 = Math.round(cx - 6 - t * 1.5 + sway * t), x1 = Math.round(cx + 6 + t * 1.5 + sway * t);
      for (let x = x0; x <= x1; x++) {
        let c = x > cx + 2 + t * 2 ? d.lowerDark : d.lowerC;
        if (d.lower === "lungi" && ((x + y) % 4 === 0 || (x - y) % 6 === 0)) c = d.check;
        fr.px(x, y, c);
      }
    }
    if (d.border) for (let x = cx - 8 + Math.round(sway); x <= cx + 8 + Math.round(sway); x++) { fr.px(x, hem, d.border); fr.px(x, hem - 1, d.border); }
    // Fold line at the waist (the mundu tuck)
    fr.line(cx - 6, hipY + 1, cx + 3, hipY + 3, d.lowerDark, 1);
  } else {
    fr.rect(cx - 6, hipY, 12, 4, d.lowerC);
  }

  // Torso
  for (let y = shoulderY; y < hipY + 1; y++)
    for (let x = cx - 6; x <= cx + 6; x++) fr.px(x, y, x > cx + 2 ? d.shirtDark : d.shirt);
  if (d.sleeves === "none") {
    // Sleeveless vest: show shoulders
    fr.rect(cx - 6, shoulderY, 2, 4, SKIN.base);
    fr.rect(cx + 5, shoulderY, 2, 4, SKIN.dark);
  }
  if (d.extra.includes("pocket")) fr.rect(cx - 4, shoulderY + 4, 3, 3, d.shirtDark);
  fr.rect(cx - 1, shoulderY, 3, 2, SKIN.base); // collar opening
  if (d.extra.includes("chain")) {
    const gold = hex("#e8b923");
    for (let i = 0; i < 6; i++) fr.px(cx - 2 + i, shoulderY + 2 + (i > 1 && i < 4 ? 1 : 0), gold);
    fr.px(cx + 1, shoulderY + 4, gold);
  }
  if (d.extra.includes("towel")) {
    const red = hex("#c0392b"), cream = hex("#f2e6c8");
    for (let i = 0; i < 9; i++) fr.px(cx - 6 + i, shoulderY - 1 + Math.floor(i / 3), i % 2 ? cream : red);
    fr.rect(cx - 7, shoulderY + 2, 3, 7, red);
    fr.px(cx - 6, shoulderY + 4, cream);
  }

  // Head
  const hx = cx - 5 + p.tilt, hy = 6 + b;
  fr.rect(hx, hy, 11, 11, SKIN.base);
  fr.rect(hx + 8, hy + 1, 3, 9, SKIN.dark); // shadow side
  fr.rect(hx + 2, hy + 11, 6, 2, SKIN.dark); // neck
  // Ear
  fr.px(hx, hy + 5, SKIN.dark); fr.px(hx, hy + 6, SKIN.dark);
  // Hair
  if (d.hairStyle === "wavy") {
    fr.rect(hx - 1, hy - 2, 13, 4, d.hair);
    for (let i = 0; i < 13; i += 3) fr.px(hx - 1 + i, hy - 3, d.hair);
    fr.rect(hx - 1, hy + 1, 2, 5, d.hair);
  } else if (d.hairStyle === "slick") {
    fr.rect(hx - 1, hy - 2, 13, 3, d.hair);
    fr.rect(hx - 1, hy + 1, 2, 4, d.hair);
    fr.px(hx + 9, hy - 2, hex("#3a3a44")); // shine
  } else {
    for (let i = 0; i < 13; i++) for (let j = 0; j < 4; j++) if ((i + j) % 2 === 0 || j > 1) fr.px(hx - 1 + i, hy - 3 + j, d.hair);
    fr.rect(hx - 1, hy + 1, 2, 4, d.hair);
  }
  // Face (looking right)
  const eyeY = hy + 5;
  if (d.glasses) {
    fr.rect(hx + 4, eyeY - 1, 7, 3, hex("#0b0b0e"));
    fr.px(hx + 5, eyeY - 1, hex("#6b6f80"));
    fr.px(hx + 9, eyeY - 1, hex("#6b6f80"));
  } else if (p.blink) {
    fr.rect(hx + 5, eyeY + 1, 2, 1, hex("#2a1a10"));
    fr.rect(hx + 9, eyeY + 1, 1, 1, hex("#2a1a10"));
  } else {
    fr.rect(hx + 5, eyeY, 2, 2, hex("#ffffff"));
    fr.px(hx + 6, eyeY, hex("#1b1b1b")); fr.px(hx + 6, eyeY + 1, hex("#1b1b1b"));
    fr.px(hx + 9, eyeY, hex("#1b1b1b")); fr.px(hx + 9, eyeY + 1, hex("#1b1b1b"));
    fr.rect(hx + 5, eyeY - 2, 2, 1, d.hair); // brows
    fr.px(hx + 9, eyeY - 2, d.hair);
  }
  // Nose
  fr.px(hx + 11, eyeY + 2, SKIN.base);
  fr.px(hx + 10, eyeY + 3, SKIN.dark);
  // Mustache / stubble
  if (d.mustache) fr.rect(hx + 6, eyeY + 4, 5, 1, d.hair);
  if (d.stubble) for (let i = 0; i < 6; i++) fr.px(hx + 5 + i, eyeY + 5 + (i % 2), hex("#4a3426"));
  // Mouth
  const mx = hx + 7, my = eyeY + 5 + (d.mustache ? 0 : 0);
  if (p.mouth === "o") { fr.rect(mx, my, 2, 2, hex("#4a1a12")); }
  else if (p.mouth === "smile") { fr.px(mx, my, hex("#4a1a12")); fr.px(mx + 1, my + 1, hex("#4a1a12")); fr.px(mx + 2, my, hex("#4a1a12")); }
  else if (p.mouth === "frown") { fr.px(mx, my + 1, hex("#4a1a12")); fr.px(mx + 1, my, hex("#4a1a12")); fr.px(mx + 2, my + 1, hex("#4a1a12")); }
  else fr.rect(mx, my, 3, 1, hex("#5a2a1e"));
  if (p.sweat) { fr.px(hx - 1, hy + 2, hex("#7fd3ff")); fr.px(hx - 1, hy + 3, hex("#bfeaff")); }

  // Item (held in front)
  if (p.item === "paper") {
    const ix = cx + 4, iy = shoulderY + 3;
    fr.rect(ix, iy, 7 - p.screen * 3, 9, hex("#f7f3e8"));
    for (let k = 0; k < 4; k++) fr.rect(ix + 1, iy + 2 + k * 2, 4 - p.screen * 2, 1, hex("#9a9a9a"));
  } else if (p.item === "laptop") {
    const ix = cx + 2, iy = shoulderY + 7;
    fr.rect(ix, iy + 5, 11, 2, hex("#8f96a3")); // base
    fr.rect(ix + 7, iy - 2, 2, 8, hex("#5d6470")); // lid (side view)
    const glow = [hex("#9fd8ff"), hex("#bfe8ff"), hex("#5cff9d"), hex("#3be07f"), hex("#8dffb8")][p.screen];
    fr.rect(ix + 6, iy - 1, 1, 6, glow);
  } else if (d.extra.includes("towel") && anim === "idle") {
    // Chaya Kutty holds a glass of tea when idle
    const ix = cx + 5, iy = shoulderY + 8;
    fr.rect(ix, iy, 3, 4, hex("#e7d3a8"));
    fr.rect(ix, iy, 3, 1, hex("#fff6dc"));
  }

  // Front arm
  const sfx = cx + 4, sfy = shoulderY + 1;
  const hfx = sfx + p.handF[0], hfy = sfy + p.handF[1];
  if (d.sleeves === "half") {
    fr.limb(sfx, sfy, sfx + (hfx - sfx) * 0.4, sfy + (hfy - sfy) * 0.4, d.shirt);
    fr.limb(sfx + (hfx - sfx) * 0.4, sfy + (hfy - sfy) * 0.4, hfx, hfy, SKIN.base);
  } else if (d.sleeves === "full") fr.limb(sfx, sfy, hfx, hfy, d.shirt.map((v, i) => (i < 3 ? Math.min(255, v + 28) : v)));
  else fr.limb(sfx, sfy, hfx, hfy, SKIN.base);
  fr.rect(hfx - 1, hfy - 1, 3, 3, SKIN.light);
  if (d.extra.includes("watch")) {
    const wx = sfx + (hfx - sfx) * 0.8, wy = sfy + (hfy - sfy) * 0.8;
    fr.rect(Math.round(wx) - 1, Math.round(wy) - 1, 3, 2, hex("#e8b923"));
  }

  fr.outline();
}

export function buildCharacters(outRoot) {
  console.log("Characters:");
  for (const [id, d] of Object.entries(DESIGNS)) {
    const sheet = new Sheet(FW * COLS, FH * ROWS.length);
    ROWS.forEach(([anim, frames], row) => {
      for (let f = 0; f < frames; f++) drawCharacter(new Frame(sheet, f * FW, row * FH), d, anim, f);
    });
    const dir = path.join(outRoot, id);
    fs.mkdirSync(dir, { recursive: true });
    writePng(path.join(dir, "sprites.png"), sheet.w, sheet.h, sheet.d);
    const pack = {
      schemaVersion: 1,
      id,
      name: d.name,
      author: "Aswin1819",
      license: "CC0-1.0",
      role: d.role,
      frame: { width: FW, height: FH },
      fps: 8,
      scale: 2,
      sheet: "sprites.png",
      animations: Object.fromEntries(ROWS.map(([anim, frames], row) => [anim, { row, frames, ...(anim === "celebrate" || anim === "error" ? { loop: true } : {}) }])),
      palette: { shirt: toHex(d.shirt), lower: toHex(d.lowerC), skin: toHex(SKIN.base), hair: toHex(d.hair) },
    };
    fs.writeFileSync(path.join(dir, "pack.json"), JSON.stringify(pack, null, 2) + "\n");
    console.log(`  characters/${id}  ${sheet.w}×${sheet.h}`);
  }
}
