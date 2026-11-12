import { BODY, hash, rng, skeleton } from "../scene";
import { GROUND, WORLD_H, type LiveCompanion, type LiveFrame, type LivePlace, type LiveVillager, type ViewRect } from "./types";

/**
 * Flat Vector · Bengaluru scenery. Same dusk explainer look as the Kerala
 * scene (flat shapes, no outlines, navy/indigo with warm accents, light cones,
 * long shadows), with the city swapped in: a skyline of lit towers and cranes,
 * a metro viaduct with a train, gulmohar trees, a road with autos and a bus,
 * offices / darshini / co-working loft / kiosk per place, green street sign.
 *
 * Caching: a sky tile and a viaduct/street tile (both 640 wide, periodic), a
 * small canvas per tower type, and one canvas per place (keyed "blr|…").
 */

const TILE = 640;
const FONT = "ui-sans-serif, system-ui, sans-serif";
const DECK = { top: 160, bot: 168 };
const KERB_TOP = GROUND.pathTop - 6;

const B = {
  skyTop: "#141638",
  skyMid: "#2a2866",
  skyLow: "#6b3f7c",
  skyGlow: "#e9886a",
  cityFar: "#3a2f6e",
  ground: "#2a2b62",
  paverLine: "rgba(255,255,255,0.045)",
  groundFront: "#212255",
  road: "#28295a",
  roadEdge: "#30316a",
  kerbY: "#d8b04a",
  kerbB: "#17183a",
  deck: "#8f8bc4",
  deckDark: "#5f5a9a",
  stripe: "#8a4fd0",
  pillar: "#6d68a8",
  park: "#1f5a58",
  parkDark: "#174845",
  parkLight: "#26706a",
  warm: "#ffcf7a",
  warmDeep: "#ffb057",
  navy: "#1b1d48",
  post: "#4b3a66",
  trunk: "#5b3b5e",
  leaf: "#1f7a6a",
  leafDark: "#155a50",
  bloom: "#ff6a3d",
  bloomDeep: "#e0452f",
  bloomLight: "#ffa25a",
  cool: "#9fd8ff",
};

function makeCanvas(w: number, h: number, paint: (c: CanvasRenderingContext2D) => void): HTMLCanvasElement {
  const cv = document.createElement("canvas");
  cv.width = Math.ceil(w * 2);
  cv.height = Math.ceil(h * 2);
  const c = cv.getContext("2d")!;
  c.scale(2, 2);
  paint(c);
  return cv;
}

// ── tiles ────────────────────────────────────────────────────────────────────

/** Sky, stars and a hazy low city line far away (0 … waterTop + 20). */
const SKY_H = GROUND.waterTop + 20;
function paintSky(c: CanvasRenderingContext2D) {
  const hy = GROUND.waterTop;
  const g = c.createLinearGradient(0, 0, 0, hy);
  g.addColorStop(0, B.skyTop);
  g.addColorStop(0.5, B.skyMid);
  g.addColorStop(0.82, B.skyLow);
  g.addColorStop(1, B.skyGlow);
  c.fillStyle = g;
  c.fillRect(0, 0, TILE, SKY_H);
  const r = rng(61);
  for (let i = 0; i < 30; i++) {
    const x = r() * TILE, y = r() * 80, s = 0.5 + r() * 0.8;
    c.fillStyle = `rgba(255,240,210,${0.2 + r() * 0.4})`;
    c.beginPath();
    c.arc(x, y, s * 0.6, 0, Math.PI * 2);
    c.fill();
  }
  // Far, hazy low-rise blocks (kept inside the tile so it repeats seamlessly).
  const r2 = rng(23);
  c.fillStyle = B.cityFar;
  for (let x = 0; x < TILE; ) {
    const w = 14 + r2() * 26;
    const h = 10 + r2() * 26;
    c.fillRect(x, hy + 20 - h - 12, Math.min(w, TILE - x), h + 12);
    x += w + r2() * 4;
  }
  c.fillStyle = "rgba(255,207,122,0.22)";
  for (let i = 0; i < 60; i++) c.fillRect(Math.floor(r2() * TILE), hy - 20 + r2() * 28, 1.6, 1.6);
}

/** Park greenery, metro viaduct, footpath, kerbs and road (from y=FRONT_Y down). */
const FRONT_Y = DECK.top - 4;
function paintFront(c: CanvasRenderingContext2D) {
  c.translate(0, -FRONT_Y);
  // Park greenery behind the pillars: flat rounded blobs (seamless: wrap draws).
  const r = rng(91);
  const blobs: [number, number, number, string][] = [];
  for (let i = 0; i < 44; i++) {
    const x = r() * TILE, y = 178 + r() * 12, rad = 9 + r() * 10;
    blobs.push([x, y, rad, i % 3 === 0 ? B.parkLight : i % 3 === 1 ? B.park : B.parkDark]);
  }
  c.fillStyle = B.parkDark;
  c.fillRect(0, 184, TILE, GROUND.groundY - 184);
  for (const [x, y, rad, col] of blobs) {
    c.fillStyle = col;
    for (const o of [-TILE, 0, TILE]) {
      c.beginPath();
      c.arc(x + o, y, rad, 0, Math.PI * 2);
      c.fill();
    }
  }
  // Pillars (period 80) with caps.
  for (let x = 40; x < TILE; x += 80) {
    c.fillStyle = "rgba(10,10,40,0.25)";
    c.fillRect(x - 6, GROUND.groundY - 2, 18, 3);
    c.fillStyle = B.pillar;
    c.fillRect(x - 4, DECK.bot, 8, GROUND.groundY - DECK.bot);
    c.fillStyle = "rgba(0,0,0,0.18)";
    c.fillRect(x + 1, DECK.bot, 3, GROUND.groundY - DECK.bot);
    c.fillStyle = B.deckDark;
    c.beginPath();
    c.roundRect(x - 9, DECK.bot, 18, 5, [0, 0, 3, 3]);
    c.fill();
  }
  // Deck with a purple stripe and a thin parapet.
  c.fillStyle = B.deck;
  c.fillRect(0, DECK.top, TILE, DECK.bot - DECK.top);
  c.fillStyle = B.stripe;
  c.fillRect(0, DECK.top + 4, TILE, 2);
  c.fillStyle = B.deckDark;
  c.fillRect(0, DECK.bot - 1.5, TILE, 1.5);
  c.fillStyle = "rgba(255,255,255,0.18)";
  c.fillRect(0, DECK.top, TILE, 1);

  // Footpath with pavers.
  c.fillStyle = B.ground;
  c.fillRect(0, GROUND.groundY, TILE, KERB_TOP - GROUND.groundY);
  c.fillStyle = "#33356e";
  c.fillRect(0, GROUND.groundY, TILE, 4);
  c.fillStyle = B.paverLine;
  for (let y = GROUND.groundY + 12; y < KERB_TOP; y += 12) c.fillRect(0, y, TILE, 1);
  for (let row = 0, y = GROUND.groundY + 4; y < KERB_TOP; row++, y += 12) {
    for (let x = row % 2 ? 10 : 0; x < TILE; x += 20) c.fillRect(x, y, 1, 8);
  }
  const r2 = rng(17);
  for (let i = 0; i < 10; i++) {
    const x = r2() * (TILE - 16) + 8, y = 206 + r2() * (KERB_TOP - 216);
    c.fillStyle = "#2f3f70";
    c.beginPath();
    c.ellipse(x, y, 3 + r2() * 4, 1.2 + r2(), 0, 0, Math.PI * 2);
    c.fill();
  }
  // Kerbs: black-and-yellow blocks.
  const kerb = (y: number, h: number) => {
    for (let x = 0; x < TILE; x += 16) {
      c.fillStyle = (x / 16) % 2 ? B.kerbB : B.kerbY;
      c.fillRect(x, y, 16, h);
    }
    c.fillStyle = "rgba(0,0,0,0.25)";
    c.fillRect(0, y + h - 1.5, TILE, 1.5);
  };
  kerb(KERB_TOP, 6);
  // Road.
  c.fillStyle = B.road;
  c.fillRect(0, GROUND.pathTop, TILE, GROUND.pathBottom - GROUND.pathTop);
  c.fillStyle = "rgba(0,0,0,0.18)";
  c.fillRect(0, GROUND.pathTop, TILE, 3);
  c.fillStyle = "rgba(246,244,255,0.22)";
  c.fillRect(0, GROUND.pathTop + 4, TILE, 1);
  c.fillRect(0, GROUND.pathBottom - 4, TILE, 1);
  c.fillStyle = "rgba(246,244,255,0.32)";
  const mid = (GROUND.pathTop + GROUND.pathBottom) / 2;
  for (let x = 0; x < TILE; x += 40) {
    c.beginPath();
    c.roundRect(x + 6, mid - 1, 22, 2, 1);
    c.fill();
  }
  for (let i = 0; i < 14; i++) {
    const x = r2() * (TILE - 10) + 5, y = GROUND.pathTop + 8 + r2() * 46;
    c.fillStyle = "rgba(255,255,255,0.035)";
    c.beginPath();
    c.ellipse(x, y, 2 + r2() * 4, 0.8, 0, 0, Math.PI * 2);
    c.fill();
  }
  kerb(GROUND.pathBottom, 5);
  c.fillStyle = B.groundFront;
  c.fillRect(0, GROUND.pathBottom + 5, TILE, WORLD_H - GROUND.pathBottom - 5);
  c.fillStyle = B.paverLine;
  for (let y = GROUND.pathBottom + 14; y < WORLD_H; y += 10) c.fillRect(0, y, TILE, 1);
}

let skyTile: HTMLCanvasElement | null = null;
let frontTile: HTMLCanvasElement | null = null;

/** Step 1 for Bengaluru: fill the view with sky (rest of the scenery comes later in the frame). */
export function blrSky(ctx: CanvasRenderingContext2D, view: ViewRect) {
  if (!skyTile) skyTile = makeCanvas(TILE, SKY_H, paintSky);
  const x0 = view.x, x1 = view.x + view.w;
  ctx.fillStyle = B.skyTop;
  ctx.fillRect(x0 - 1, view.y - 1, view.w + 2, Math.max(0, -view.y) + 2);
  for (let k = Math.floor(x0 / TILE); k * TILE < x1; k++) ctx.drawImage(skyTile, k * TILE, 0, TILE + 0.5, SKY_H);
}

// ── skyline ──────────────────────────────────────────────────────────────────

const TOWER_TYPES = 12;
const towerCache: HTMLCanvasElement[] = [];
interface TowerSpec { w: number; h: number; kind: "glass" | "flats" | "slab"; tank: boolean; mast: boolean; col: string }
function towerSpec(k: number): TowerSpec {
  const kinds = ["glass", "flats", "slab"] as const;
  const kind = kinds[k % 3]!;
  const cols = { glass: ["#34477a", "#2f4f86", "#3b3d7a"], flats: ["#4a4282", "#3f3a78", "#544a8a"], slab: ["#38407c", "#423c80", "#2f3f70"] }[kind];
  return {
    w: kind === "glass" ? 26 + hash(k * 2.3) * 14 : 30 + hash(k * 2.3) * 16,
    h: 60 + hash(k * 7.1) * (kind === "glass" ? 70 : 40),
    kind,
    tank: kind === "flats" && hash(k * 3.7) > 0.3,
    mast: kind === "glass" && hash(k * 5.9) > 0.5,
    col: cols[Math.floor(hash(k * 1.9) * 3)]!,
  };
}
const TW_PAD = 14; // room above for tanks/masts
function towerLayer(k: number): HTMLCanvasElement {
  let cv = towerCache[k];
  if (cv) return cv;
  const s = towerSpec(k);
  cv = makeCanvas(s.w, s.h + TW_PAD, (c) => {
    c.translate(0, TW_PAD);
    const r = rng(1000 + k * 37);
    c.fillStyle = s.col;
    if (s.kind === "glass") {
      c.beginPath();
      c.roundRect(0, 0, s.w, s.h, [4, 4, 0, 0]);
      c.fill();
      c.fillStyle = "rgba(255,255,255,0.07)";
      c.beginPath();
      c.moveTo(s.w * 0.15, 0);
      c.lineTo(s.w * 0.45, 0);
      c.lineTo(0, s.h * 0.55);
      c.lineTo(0, s.h * 0.2);
      c.fill();
      c.fillStyle = "rgba(0,0,0,0.18)";
      c.fillRect(s.w - 7, 0, 7, s.h);
      // Lit floors: thin bands, some warm, some cool.
      for (let y = 6; y < s.h - 4; y += 5) {
        for (let x = 3; x < s.w - 9; x += 6) {
          const v = r();
          if (v < 0.42) {
            c.fillStyle = v < 0.1 ? "rgba(159,216,255,0.55)" : `rgba(255,207,122,${0.45 + r() * 0.4})`;
            c.fillRect(x, y, 4, 2);
          }
        }
      }
    } else {
      c.fillRect(0, 0, s.w, s.h);
      c.fillStyle = "rgba(0,0,0,0.16)";
      c.fillRect(s.w - 8, 0, 8, s.h);
      c.fillStyle = "rgba(255,255,255,0.06)";
      c.fillRect(0, 0, s.w, 2);
      const step = s.kind === "flats" ? 7 : 6;
      for (let y = 5; y < s.h - 4; y += step) {
        if (s.kind === "flats") {
          c.fillStyle = "rgba(0,0,0,0.14)";
          c.fillRect(0, y + 4, s.w, 1.2); // balcony lines
        }
        for (let x = 3; x < s.w - 10; x += 6) {
          const v = r();
          c.fillStyle = v < 0.45 ? `rgba(255,207,122,${0.5 + r() * 0.4})` : "rgba(20,20,60,0.45)";
          c.fillRect(x, y, 3, 3);
        }
      }
    }
    if (s.tank) {
      c.fillStyle = "#26244f";
      c.fillRect(s.w * 0.3 + 1, -5, 1.2, 5);
      c.fillRect(s.w * 0.3 + 7, -5, 1.2, 5);
      c.beginPath();
      c.roundRect(s.w * 0.3, -12, 9, 8, 2);
      c.fill();
    }
    if (s.mast) {
      c.fillStyle = "#26244f";
      c.fillRect(s.w * 0.5 - 0.6, -12, 1.2, 12);
      c.fillStyle = "#ff6a5a";
      c.beginPath();
      c.arc(s.w * 0.5, -12, 1.4, 0, Math.PI * 2);
      c.fill();
    }
  });
  towerCache[k] = cv;
  return cv;
}

function crane(ctx: CanvasRenderingContext2D, x: number, base: number, h: number, dir: number, at: number) {
  const top = base - h;
  ctx.fillStyle = "#c98f45";
  ctx.fillRect(x - 1.5, top, 3, h);
  ctx.fillStyle = "rgba(0,0,0,0.25)";
  for (let y = top + 4; y < base; y += 6) ctx.fillRect(x - 1.5, y, 3, 0.8);
  ctx.fillStyle = "#c98f45";
  ctx.fillRect(dir > 0 ? x - 12 : x - 44, top, 56, 2.4);
  ctx.fillRect(x - 1, top - 7, 2, 7);
  ctx.fillStyle = "#3a2d55";
  ctx.fillRect(dir > 0 ? x - 12 : x + 32, top + 2, 10, 5);
  const hx = x + dir * (24 + Math.sin(at * 0.3 + x) * 6);
  ctx.fillStyle = "rgba(201,143,69,0.7)";
  ctx.fillRect(hx - 0.4, top + 2, 0.8, 18);
  ctx.fillStyle = "#c98f45";
  ctx.fillRect(hx - 2, top + 20, 4, 2);
  ctx.fillStyle = "#ff6a5a";
  ctx.beginPath();
  ctx.arc(x, top - 7, 1.3, 0, Math.PI * 2);
  ctx.fill();
}

/** Skyline from f.farPalms: a tower plus a lower block per position, and a couple of cranes. */
function skyline(ctx: CanvasRenderingContext2D, f: LiveFrame, inView: (x: number, pad?: number) => boolean, at: number) {
  const base = GROUND.groundY - 8;
  let cranes = 0;
  for (let i = 0; i < f.farPalms.length; i++) {
    const x = f.farPalms[i]!;
    if (!inView(x, 80)) continue;
    // Back block, then the main tower in front.
    const kb = Math.floor(hash(x * 0.71 + 5) * TOWER_TYPES);
    const sb = towerSpec(kb);
    const hb = sb.h * 0.75;
    ctx.globalAlpha = 0.7;
    ctx.drawImage(towerLayer(kb), x + 18, base - hb - TW_PAD * 0.75, sb.w * 0.75, (sb.h + TW_PAD) * 0.75);
    ctx.globalAlpha = 1;
    if (hash(x * 0.37) > 0.82 && cranes < 2) {
      cranes++;
      crane(ctx, x + 30, base, 110 + hash(x) * 20, hash(x * 1.3) > 0.5 ? 1 : -1, at);
    }
    const k = Math.floor(hash(x * 0.13) * TOWER_TYPES);
    const s = towerSpec(k);
    ctx.drawImage(towerLayer(k), x - s.w / 2, base - s.h - TW_PAD, s.w, s.h + TW_PAD);
  }
}

// ── kites ────────────────────────────────────────────────────────────────────

function kites(ctx: CanvasRenderingContext2D, view: ViewRect, at: number) {
  const list = [
    { u: 0.3, y: 44, col: "#ff6a5a", tail: "#ffcf7a" },
    { u: 0.62, y: 70, col: "#ffcf7a", tail: "#ff6a5a" },
  ];
  list.forEach((k, i) => {
    const x = view.x + view.w * k.u + Math.sin(at * 0.7 + i * 2) * 6;
    const y = k.y + Math.sin(at * 1.1 + i) * 4;
    ctx.strokeStyle = "rgba(246,244,255,0.22)";
    ctx.lineWidth = 0.6;
    ctx.beginPath();
    ctx.moveTo(x, y + 9);
    ctx.quadraticCurveTo(x + 30, y + 60, x + 50, GROUND.waterTop + 10);
    ctx.stroke();
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(Math.sin(at * 1.3 + i) * 0.15);
    ctx.fillStyle = k.col;
    ctx.beginPath();
    ctx.moveTo(0, -9);
    ctx.lineTo(7, 0);
    ctx.lineTo(0, 9);
    ctx.lineTo(-7, 0);
    ctx.fill();
    ctx.fillStyle = "rgba(0,0,0,0.15)";
    ctx.beginPath();
    ctx.moveTo(0, -9);
    ctx.lineTo(7, 0);
    ctx.lineTo(0, 9);
    ctx.fill();
    ctx.fillStyle = k.tail;
    for (let j = 0; j < 3; j++) {
      ctx.beginPath();
      ctx.ellipse(Math.sin(at * 3 + j) * 2, 12 + j * 5, 1.6, 2.2, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  });
}

// ── metro train ──────────────────────────────────────────────────────────────

function train(ctx: CanvasRenderingContext2D, cx: number) {
  const cars = 4, cw = 38, gap = 2.5;
  const total = cars * cw + (cars - 1) * gap;
  const y = DECK.top - 15;
  // Headlight glow ahead (moving right).
  const hx = cx + total / 2;
  const hg = ctx.createRadialGradient(hx + 4, y + 9, 1, hx + 4, y + 9, 26);
  hg.addColorStop(0, "rgba(255,240,200,0.5)");
  hg.addColorStop(1, "rgba(255,240,200,0)");
  ctx.fillStyle = hg;
  ctx.fillRect(hx - 22, y - 17, 52, 52);
  for (let i = 0; i < cars; i++) {
    const x = cx - total / 2 + i * (cw + gap);
    const r: [number, number, number, number] = i === cars - 1 ? [4, 9, 2, 2] : i === 0 ? [9, 4, 2, 2] : [4, 4, 2, 2];
    ctx.fillStyle = "#d9d7f2";
    ctx.beginPath();
    ctx.roundRect(x, y, cw, 14, r);
    ctx.fill();
    ctx.fillStyle = "rgba(0,0,0,0.12)";
    ctx.fillRect(x, y + 10, cw, 4);
    ctx.fillStyle = B.stripe;
    ctx.fillRect(x, y + 9, cw, 1.8);
    ctx.fillStyle = B.warm;
    for (let wx = x + 5; wx < x + cw - 6; wx += 7) {
      ctx.beginPath();
      ctx.roundRect(wx, y + 3, 5, 4.5, 1);
      ctx.fill();
    }
    ctx.fillStyle = "#2b2858";
    ctx.fillRect(x + cw / 2 - 2, y + 2.5, 4, 7.5); // door
    ctx.fillStyle = "#3a3870";
    ctx.fillRect(x + 4, y + 14, cw - 8, 1.5);
  }
  ctx.fillStyle = "#fff3c4";
  ctx.beginPath();
  ctx.arc(hx - 2, y + 11, 1.4, 0, Math.PI * 2);
  ctx.fill();
  // Warm window light spilling on the deck.
  ctx.fillStyle = "rgba(255,207,122,0.12)";
  ctx.fillRect(cx - total / 2, DECK.top, total, 3);
}

// ── gulmohar trees ───────────────────────────────────────────────────────────

function gulmohar(ctx: CanvasRenderingContext2D, x: number, baseY: number, h: number, lean: number, t: number, seed: number) {
  const ch = h * 0.78; // a bit lower than the palms: wide umbrella crowns
  const topX = x + lean * ch * 0.6;
  const topY = baseY - ch * 0.62;
  ctx.fillStyle = "rgba(10,10,40,0.22)";
  ctx.beginPath();
  ctx.ellipse(x - ch * 0.35, baseY + 6, ch * 0.42, 6, -0.08, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = B.trunk;
  ctx.beginPath();
  ctx.moveTo(x - 4.5, baseY);
  ctx.quadraticCurveTo(x - 2, baseY - ch * 0.3, topX - 2, topY);
  ctx.lineTo(topX + 2, topY);
  ctx.quadraticCurveTo(x + 2, baseY - ch * 0.3, x + 4.5, baseY);
  ctx.fill();
  ctx.lineCap = "round";
  ctx.strokeStyle = B.trunk;
  ctx.lineWidth = 2.6;
  ctx.beginPath();
  ctx.moveTo(topX, topY + 8);
  ctx.lineTo(topX - ch * 0.22, topY - 6);
  ctx.moveTo(topX, topY + 4);
  ctx.lineTo(topX + ch * 0.24, topY - 8);
  ctx.stroke();
  const sway = Math.sin(t * 0.9 + seed) * 1.6;
  const cx = topX + sway, cy = topY - ch * 0.1;
  const R = ch * 0.24;
  const crown: [number, number, number, string][] = [
    [-1.3, 0.25, 0.8, B.leafDark],
    [1.3, 0.25, 0.8, B.leafDark],
    [-0.7, -0.2, 0.95, B.leaf],
    [0.7, -0.25, 0.95, B.leaf],
    [0, -0.55, 0.85, B.leaf],
    [0, 0.2, 1, B.leafDark],
  ];
  for (const [dx, dy, rr, col] of crown) {
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.ellipse(cx + dx * R, cy + dy * R, rr * R * 1.15, rr * R * 0.8, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  // Blooms: clusters of red-orange flowers over the crown.
  for (let i = 0; i < 24; i++) {
    const a = hash(seed * 13.1 + i * 3.7) * Math.PI * 2;
    const d = Math.sqrt(hash(seed * 7.3 + i * 1.9));
    const bx = cx + Math.cos(a) * d * R * 1.9;
    const by = cy - R * 0.1 + Math.sin(a) * d * R * 0.95;
    ctx.fillStyle = i % 3 === 0 ? B.bloomLight : i % 3 === 1 ? B.bloom : B.bloomDeep;
    ctx.beginPath();
    ctx.arc(bx, by, 2 + hash(i + seed) * 1.8, 0, Math.PI * 2);
    ctx.fill();
  }
}

// ── street: zebra, autos, bus ────────────────────────────────────────────────

function zebra(ctx: CanvasRenderingContext2D, x: number) {
  ctx.fillStyle = "rgba(246,244,255,0.5)";
  for (let y = GROUND.pathTop + 6; y < GROUND.pathBottom - 6; y += 7) {
    ctx.beginPath();
    ctx.roundRect(x, y, 34, 3.6, 1);
    ctx.fill();
  }
}

function headCone(ctx: CanvasRenderingContext2D, x: number, y: number, dir: number, len: number) {
  const g = ctx.createLinearGradient(x, 0, x + dir * len, 0);
  g.addColorStop(0, "rgba(255,236,180,0.4)");
  g.addColorStop(1, "rgba(255,236,180,0)");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(x, y - 1.5);
  ctx.lineTo(x + dir * len, y - 7);
  ctx.lineTo(x + dir * len, y + 8);
  ctx.lineTo(x, y + 1.5);
  ctx.fill();
}

function auto(ctx: CanvasRenderingContext2D, x: number, y: number, dir: number, at: number) {
  // y = road contact; dir = travel direction. Drawn facing +x, mirrored for -1.
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(dir, 1);
  ctx.fillStyle = "rgba(10,10,40,0.3)";
  ctx.beginPath();
  ctx.ellipse(-2, 0.5, 17, 2.4, 0, 0, Math.PI * 2);
  ctx.fill();
  headCone(ctx, 15, -8, 1, 40);
  // Body: green lower, yellow upper, black canopy.
  ctx.fillStyle = "#2f8a5c";
  ctx.beginPath();
  ctx.moveTo(-15, -4);
  ctx.lineTo(-15, -12);
  ctx.lineTo(10, -12);
  ctx.quadraticCurveTo(15, -11, 15, -4);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "#e6be3c";
  ctx.beginPath();
  ctx.moveTo(-15, -12);
  ctx.lineTo(-15, -16);
  ctx.lineTo(8, -16);
  ctx.lineTo(13, -9);
  ctx.lineTo(10, -12);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "#17183a";
  ctx.beginPath();
  ctx.roundRect(-16, -26, 24, 6, [5, 4, 0, 0]);
  ctx.fill();
  ctx.fillRect(-15, -21, 2.2, 6);
  ctx.fillStyle = "#e6be3c";
  ctx.beginPath();
  ctx.moveTo(6, -21);
  ctx.lineTo(9, -21);
  ctx.lineTo(13, -10);
  ctx.lineTo(10, -10);
  ctx.fill();
  // Cabin opening with a warm meter glow and a driver.
  ctx.fillStyle = "rgba(255,207,122,0.25)";
  ctx.fillRect(-12, -20, 17, 4);
  ctx.fillStyle = "#7a5040";
  ctx.beginPath();
  ctx.arc(2, -17.5, 2.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#fff3c4";
  ctx.beginPath();
  ctx.arc(14, -8, 1.3, 0, Math.PI * 2);
  ctx.fill();
  // Wheels.
  ctx.fillStyle = "#121230";
  const bob = Math.sin(at * 14 + x) * 0.3;
  for (const wx of [-10, 10]) {
    ctx.beginPath();
    ctx.arc(wx, -2.6 + bob, 3.2, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function bus(ctx: CanvasRenderingContext2D, x: number, y: number, dir: number) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(dir, 1);
  ctx.fillStyle = "rgba(10,10,40,0.3)";
  ctx.beginPath();
  ctx.ellipse(-4, 0.5, 40, 3, 0, 0, Math.PI * 2);
  ctx.fill();
  headCone(ctx, 37, -8, 1, 50);
  ctx.fillStyle = "#3f8f9a";
  ctx.beginPath();
  ctx.roundRect(-38, -30, 75, 26, [5, 7, 2, 2]);
  ctx.fill();
  ctx.fillStyle = "rgba(0,0,0,0.16)";
  ctx.fillRect(-38, -10, 75, 6);
  ctx.fillStyle = "#e6be3c";
  ctx.fillRect(-38, -12, 75, 2);
  ctx.fillStyle = B.warm;
  for (let wx = -34; wx < 24; wx += 10) {
    ctx.beginPath();
    ctx.roundRect(wx, -26, 8, 9, 1.5);
    ctx.fill();
  }
  ctx.fillStyle = "#bfe6ff";
  ctx.beginPath();
  ctx.roundRect(27, -26, 9, 12, [1.5, 5, 1.5, 1.5]);
  ctx.fill();
  ctx.fillStyle = "rgba(0,0,0,0.25)";
  for (let wx = -34; wx < 24; wx += 10) ctx.fillRect(wx + 1, -23, 6, 1); // passengers' heads line
  ctx.fillStyle = "#fff3c4";
  ctx.beginPath();
  ctx.arc(36, -8, 1.6, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#121230";
  for (const wx of [-24, 24]) {
    ctx.beginPath();
    ctx.arc(wx, -3.5, 4.2, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function traffic(ctx: CanvasRenderingContext2D, f: LiveFrame, inView: (x: number, pad?: number) => boolean, at: number) {
  const span = f.worldW + 240;
  const laneA = GROUND.pathTop + 22; // far lane, heading left
  const laneB = GROUND.pathBottom - 6; // near lane, heading right
  const list = [
    { kind: "auto", sp: 26, off: 40, y: laneA, dir: -1 },
    { kind: "bus", sp: 18, off: 520, y: laneA, dir: -1 },
    { kind: "auto", sp: 34, off: 200, y: laneB, dir: 1 },
    { kind: "auto", sp: 29, off: 760, y: laneB, dir: 1 },
  ];
  for (const v of list) {
    const p = (((at * v.sp + v.off) % span) + span) % span;
    const x = v.dir > 0 ? p - 120 : f.worldW + 120 - p;
    if (!inView(x, 90)) continue;
    if (v.kind === "bus") bus(ctx, x, v.y, v.dir);
    else auto(ctx, x, v.y, v.dir, at);
  }
}

// ── green street sign ────────────────────────────────────────────────────────

function streetSign(ctx: CanvasRenderingContext2D, s: LiveFrame["sign"]) {
  ctx.fillStyle = "rgba(10,10,40,0.28)";
  ctx.beginPath();
  ctx.ellipse(s.x - 18, s.y + 41, 22, 3, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = B.post;
  ctx.beginPath();
  ctx.roundRect(s.x - 2, s.y - 8, 4, 49, 2);
  ctx.fill();
  ctx.fillStyle = "#e9ecf6";
  ctx.beginPath();
  ctx.roundRect(s.x - 37, s.y - 19, 74, 21, 4);
  ctx.fill();
  ctx.fillStyle = "#1f7a55";
  ctx.beginPath();
  ctx.roundRect(s.x - 35.5, s.y - 17.5, 71, 18, 3);
  ctx.fill();
  ctx.fillStyle = "#f6f4ff";
  ctx.font = `800 8.5px ${FONT}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(s.text, s.x, s.y - 8.2);
}

// ── places ───────────────────────────────────────────────────────────────────

const placeCache = new Map<string, HTMLCanvasElement>();
/** Place canvas extent relative to the building's left x / world y (same as Kerala's). */
export const BPL = { dx: -96, y: 140, w: 360, h: 212 };

function rect(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, col: string, r: number | number[] = 0) {
  c.fillStyle = col;
  if (r !== 0) {
    c.beginPath();
    c.roundRect(x, y, w, h, r);
    c.fill();
  } else c.fillRect(x, y, w, h);
}

function glowAt(c: CanvasRenderingContext2D, x: number, y: number, rad: number, a: number, rgb = "255,207,122") {
  const g = c.createRadialGradient(x, y, 1, x, y, rad);
  g.addColorStop(0, `rgba(${rgb},${a})`);
  g.addColorStop(1, `rgba(${rgb},0)`);
  c.fillStyle = g;
  c.fillRect(x - rad, y - rad, rad * 2, rad * 2);
}

/**
 * Which city building a place gets: stable per project, mixing the project id
 * into place.variant so a handful of projects still shows a mix of kinds.
 */
function blrKind(p: LivePlace): number {
  let h = 7;
  for (let i = 0; i < p.id.length; i++) h = (h * 33 + p.id.charCodeAt(i)) | 0;
  return (p.variant + ((h >>> 5) % 4)) % 4;
}

function paintPlace(c: CanvasRenderingContext2D, p: LivePlace) {
  const b = p.building;
  const v = blrKind(p);
  const top = b.baseY - b.wallH;
  const base = b.baseY;
  const sky = top - b.roofH; // the highest point any variant reaches
  const r = rng(77 + v * 11 + p.name.length);

  // Long shadow and warm door light (as in the Kerala scene).
  c.fillStyle = "rgba(10,10,40,0.28)";
  c.beginPath();
  c.moveTo(b.x, base);
  c.lineTo(b.x + b.w, base);
  c.lineTo(b.x + b.w - 60, base + 20);
  c.lineTo(b.x - 60, base + 20);
  c.fill();
  const lg = c.createLinearGradient(0, base, 0, base + 60);
  lg.addColorStop(0, "rgba(255,190,110,0.38)");
  lg.addColorStop(1, "rgba(255,190,110,0)");
  c.fillStyle = lg;
  c.beginPath();
  c.moveTo(b.doorX - 13, base);
  c.lineTo(b.doorX + 13, base);
  c.lineTo(b.doorX + 50, base + 60);
  c.lineTo(b.doorX - 50, base + 60);
  c.fill();

  if (v === 0) {
    // Glass office: a tall block reaching the sign, lit floor bands.
    const y0 = sky + 6;
    rect(c, b.x, y0, b.w, base - y0, "#2f5a8a", 0);
    c.fillStyle = "rgba(255,255,255,0.08)";
    c.beginPath();
    c.moveTo(b.x + 20, y0);
    c.lineTo(b.x + 60, y0);
    c.lineTo(b.x, y0 + 70);
    c.lineTo(b.x, y0 + 30);
    c.fill();
    rect(c, b.x + b.w - 22, y0, 22, base - y0, "rgba(0,0,0,0.2)");
    for (let y = y0 + 8; y < base - 30; y += 10) {
      rect(c, b.x, y + 7, b.w, 1.2, "rgba(10,20,50,0.35)");
      for (let x = b.x + 5; x < b.x + b.w - 8; x += 11) {
        const k = r();
        if (k < 0.55) rect(c, x, y, 9, 5, k < 0.12 ? "rgba(159,216,255,0.6)" : `rgba(255,207,122,${0.55 + r() * 0.4})`, 1);
      }
    }
    // Lobby: canopy and glass doors.
    rect(c, b.x + 8, base - 30, b.w - 16, 4, "#23426a", 2);
    glowAt(c, b.doorX, base - 12, 36, 0.35);
    rect(c, b.x + 10, base - 26, b.w - 20, 26, "rgba(159,216,255,0.28)");
    rect(c, b.doorX - 13, base - 26, 26, 26, "#ffd99a", 2);
    rect(c, b.doorX - 0.6, base - 26, 1.2, 26, "rgba(0,0,0,0.25)");
    for (let x = b.x + 22; x < b.x + b.w - 12; x += 16) if (Math.abs(x - b.doorX) > 18) rect(c, x, base - 26, 1.2, 26, "rgba(10,20,50,0.4)");
    // Potted plants by the entrance.
    for (const px of [b.doorX - 22, b.doorX + 22]) {
      c.fillStyle = B.leaf;
      c.beginPath();
      c.arc(px, base - 9, 5, 0, Math.PI * 2);
      c.fill();
      rect(c, px - 4, base - 6, 8, 6, "#a8573a", 1.5);
    }
  } else if (v === 1) {
    // Darshini café: a low warm hall with a steel counter and a big board above.
    rect(c, b.x, top, b.w, b.wallH, "#d9774f");
    rect(c, b.x + b.w - 20, top, 20, b.wallH, "rgba(0,0,0,0.16)");
    rect(c, b.x, base - 6, b.w, 6, "rgba(0,0,0,0.12)");
    // Board on posts up to the sign.
    rect(c, b.x + 8, sky + 4, 3, top - sky, "#3a2d55");
    rect(c, b.x + b.w - 11, sky + 4, 3, top - sky, "#3a2d55");
    rect(c, b.x + 2, sky + 10, b.w - 4, top - sky - 12, "#c9a24a", 4);
    rect(c, b.x + b.w - 22, sky + 10, 20, top - sky - 12, "rgba(0,0,0,0.14)");
    rect(c, b.x + 6, top - 10, b.w - 12, 3, "#a5523f", 1.5);
    rect(c, b.x + 30, sky + 24, b.w - 60, 3, "rgba(27,29,72,0.45)", 1.5);
    // Cups and a coffee tumbler drawn on the board.
    c.fillStyle = "#7a2e45";
    for (const dx of [12, b.w - 34]) {
      c.beginPath();
      c.moveTo(b.x + dx, sky + 22);
      c.lineTo(b.x + dx + 12, sky + 22);
      c.lineTo(b.x + dx + 10, sky + 34);
      c.lineTo(b.x + dx + 2, sky + 34);
      c.fill();
    }
    // Open front with tube-light and warm interior.
    glowAt(c, b.x + 44, top + 30, 50, 0.35);
    rect(c, b.x + 6, top + 12, 74, b.wallH - 18, "#ffb057", 3);
    rect(c, b.x + 12, top + 15, 60, 2, "#eaf6ff", 1);
    glowAt(c, b.x + 42, top + 16, 20, 0.4, "220,240,255");
    // Menu board and shelf inside.
    rect(c, b.x + 12, top + 22, 26, 14, "#2b2858", 2);
    for (let i = 0; i < 3; i++) rect(c, b.x + 15, top + 25 + i * 4, 14 + (i % 2) * 5, 1.2, "rgba(246,244,255,0.6)");
    rect(c, b.x + 44, top + 26, 30, 2, "#8a3f2f");
    for (let i = 0; i < 4; i++) rect(c, b.x + 46 + i * 7, top + 21, 4, 5, i % 2 ? "#d9d7f2" : "#c8873a", 1);
    // Steel counter with tumblers on it.
    rect(c, b.x + 4, top + 44, 80, 5, "#c9cfe6", 2);
    rect(c, b.x + 6, top + 49, 76, b.wallH - 49, "#9aa1c4");
    for (let x = b.x + 12; x < b.x + 80; x += 12) rect(c, x, top + 51, 1.2, b.wallH - 53, "rgba(255,255,255,0.25)");
    for (let i = 0; i < 3; i++) {
      const gx = b.x + 20 + i * 14;
      rect(c, gx - 2.5, top + 37, 5, 7, "#d9d7f2", 1);
      rect(c, gx - 2, top + 40, 4, 4, "#c8873a");
    }
    // Door and window on the right.
    rect(c, b.doorX - 13, top + 22, 26, b.wallH - 22, "#ffb057", 3);
    rect(c, b.doorX - 9, top + 27, 18, 14, "rgba(255,230,170,0.6)", 6);
    const wx = b.doorX + 18, wy = top + 20;
    glowAt(c, wx + 9, wy + 9, 28, 0.35);
    rect(c, wx, wy, 18, 18, B.warm, 3);
    rect(c, wx + 8.2, wy, 1.6, 18, "rgba(0,0,0,0.22)");
  } else if (v === 2) {
    // Co-working loft: brick block, big black-framed windows, rooftop terrace + water tank.
    const y0 = top - b.roofH * 0.55;
    rect(c, b.x, y0, b.w, base - y0, "#a5523f");
    c.fillStyle = "rgba(0,0,0,0.12)";
    for (let y = y0 + 4, row = 0; y < base; y += 5, row++) {
      c.fillRect(b.x, y, b.w, 0.8);
      for (let x = b.x + (row % 2 ? 5 : 0); x < b.x + b.w; x += 10) c.fillRect(x, y - 4, 0.8, 4);
    }
    rect(c, b.x + b.w - 20, y0, 20, base - y0, "rgba(0,0,0,0.18)");
    rect(c, b.x - 2, y0 - 3, b.w + 4, 4, "#7a3a2e", 1.5);
    // Terrace railing, plants and a water tank reaching the sign.
    for (let x = b.x + 4; x < b.x + b.w - 4; x += 6) rect(c, x, y0 - 10, 1.2, 8, "#2b2440");
    rect(c, b.x + 2, y0 - 11, b.w - 4, 1.5, "#2b2440");
    rect(c, b.x + b.w - 40, sky + 6, 22, y0 - sky - 9, "#26244f", 3);
    rect(c, b.x + b.w - 38, sky + 10, 18, 2, "rgba(255,255,255,0.12)");
    c.fillStyle = B.leaf;
    for (const px of [b.x + 18, b.x + 30, b.x + 46]) {
      c.beginPath();
      c.arc(px, y0 - 8, 5, 0, Math.PI * 2);
      c.fill();
    }
    // Two rows of big windows (warm, with people-shaped silhouettes at desks).
    const rows = [y0 + 8, top + 22];
    for (const wy of rows) {
      for (let i = 0; i < 3; i++) {
        const wx = b.x + 8 + i * 34;
        if (wy > top && Math.abs(wx + 13 - b.doorX) < 30) continue;
        glowAt(c, wx + 13, wy + 11, 26, 0.25);
        rect(c, wx, wy, 28, 22, "#1d1a30", 2);
        rect(c, wx + 2, wy + 2, 24, 18, r() < 0.25 ? "#9fd8ff" : B.warm, 1);
        rect(c, wx + 13.4, wy + 2, 1.2, 18, "#1d1a30");
        rect(c, wx + 2, wy + 10.4, 24, 1.2, "#1d1a30");
        c.fillStyle = "rgba(29,26,48,0.55)";
        c.beginPath();
        c.arc(wx + 7, wy + 15, 2.2, 0, Math.PI * 2);
        c.fill();
        c.fillRect(wx + 4.5, wy + 17, 5, 3);
      }
    }
    // Door with a warm transom.
    rect(c, b.doorX - 13, top + 22, 26, b.wallH - 22, "#4a2c3a", [3, 3, 0, 0]);
    rect(c, b.doorX - 11, top + 24, 22, 8, B.warmDeep, 2);
    rect(c, b.doorX - 11, top + 34, 22, b.wallH - 34, "#ffb057", 1);
    rect(c, b.doorX - 0.6, top + 34, 1.2, b.wallH - 34, "rgba(0,0,0,0.25)");
    // Bike stand.
    c.strokeStyle = "#cfd4ea";
    c.lineWidth = 1.2;
    c.beginPath();
    c.arc(b.doorX + 32, base - 5, 4, 0, Math.PI * 2);
    c.arc(b.doorX + 46, base - 5, 4, 0, Math.PI * 2);
    c.moveTo(b.doorX + 32, base - 5);
    c.lineTo(b.doorX + 38, base - 12);
    c.lineTo(b.doorX + 46, base - 5);
    c.stroke();
  } else {
    // Kiosk / corner shop: low shop, striped awning, goods, a billboard frame on top.
    const y0 = top + 8;
    rect(c, b.x, y0, b.w, base - y0, "#7f93c4");
    rect(c, b.x + b.w - 20, y0, 20, base - y0, "rgba(0,0,0,0.16)");
    rect(c, b.x, base - 6, b.w, 6, "rgba(0,0,0,0.12)");
    // Billboard on a frame up to the sign (abstract shapes, no brand).
    rect(c, b.x + 30, sky + 8, 2.4, y0 - sky - 8, "#3a2d55");
    rect(c, b.x + b.w - 32, sky + 8, 2.4, y0 - sky - 8, "#3a2d55");
    rect(c, b.x + 14, sky + 10, b.w - 28, top - sky - 10, "#2f3b6e", 3);
    rect(c, b.x + 20, sky + 16, 26, 20, "#ffcf7a", 10);
    rect(c, b.x + 54, sky + 18, 56, 4, "rgba(246,244,255,0.7)", 2);
    rect(c, b.x + 54, sky + 26, 40, 3, "rgba(246,244,255,0.4)", 1.5);
    glowAt(c, b.x + b.w / 2, sky + 6, 50, 0.18, "220,240,255");
    // Awning stripes across the shop front.
    for (let i = 0; i < 7; i++) rect(c, b.x + 2 + i * 12, y0 + 10, 12, 12, i % 2 ? "#f6f4ff" : "#e05a4a", [0, 0, 6, 6]);
    // Shop opening with lit shelves of goods.
    glowAt(c, b.x + 44, y0 + 36, 44, 0.3);
    rect(c, b.x + 6, y0 + 24, 76, base - y0 - 30, "#ffb057", 2);
    const goods = ["#ff7a59", "#a3e635", "#5eead4", "#ffd166", "#e05a4a", "#9fd8ff"];
    for (let row = 0; row < 3; row++) {
      const sy = y0 + 32 + row * 10;
      rect(c, b.x + 8, sy + 5, 72, 1.5, "#8a3f2f");
      for (let i = 0; i < 9; i++) rect(c, b.x + 10 + i * 7.8, sy - 1, 5, 6, goods[(i + row * 2) % 6]!, 1);
    }
    rect(c, b.x + 4, base - 10, 80, 4, "#4a3a5e", 2);
    // Half-rolled shutter door.
    rect(c, b.doorX - 13, y0 + 24, 26, base - y0 - 24, "#ffb057", 2);
    rect(c, b.doorX - 13, y0 + 24, 26, 14, "#5a5f8a");
    for (let y = y0 + 26; y < y0 + 38; y += 3) rect(c, b.doorX - 13, y, 26, 0.8, "rgba(0,0,0,0.25)");
    const wx = b.doorX + 18, wy = y0 + 26;
    glowAt(c, wx + 9, wy + 9, 26, 0.3);
    rect(c, wx, wy, 18, 18, B.warm, 3);
    rect(c, wx + 8.2, wy, 1.6, 18, "rgba(0,0,0,0.22)");
  }

  // Signboard: the same cream pill with the project's name.
  c.textAlign = "center";
  c.textBaseline = "middle";
  c.font = `800 8.5px ${FONT}`;
  const sw = Math.min(b.w + 10, c.measureText(p.name).width + 18);
  const sx = b.x + b.w / 2, sy = sky - 3;
  rect(c, sx - sw / 2 + 1.5, sy - 8 + 2, sw, 16, "rgba(10,10,40,0.3)", 8);
  rect(c, sx - sw / 2, sy - 8, sw, 16, "#fbe8c8", 8);
  c.fillStyle = B.navy;
  c.fillText(p.name, sx, sy + 0.6, sw - 12);

  // Street light to the right: a tall pole, cone across the road.
  const lx = b.x + b.w + 30, ly = top + 6, lb = base + 12;
  const cone = c.createLinearGradient(0, ly, 0, GROUND.pathBottom);
  cone.addColorStop(0, "rgba(255,214,140,0.4)");
  cone.addColorStop(1, "rgba(255,214,140,0.02)");
  c.fillStyle = cone;
  c.beginPath();
  c.moveTo(lx + 11, ly + 3);
  c.lineTo(lx + 19, ly + 3);
  c.lineTo(lx + 56, GROUND.pathBottom);
  c.lineTo(lx - 26, GROUND.pathBottom);
  c.fill();
  c.fillStyle = "rgba(255,214,140,0.15)";
  c.beginPath();
  c.ellipse(lx + 15, GROUND.pathBottom - 6, 42, 6, 0, 0, Math.PI * 2);
  c.fill();
  c.fillStyle = "rgba(10,10,40,0.28)";
  c.beginPath();
  c.moveTo(lx - 2, lb);
  c.lineTo(lx + 2, lb);
  c.lineTo(lx - 48, lb + 10);
  c.lineTo(lx - 51, lb + 9);
  c.fill();
  c.fillStyle = "#5a5f8a";
  c.beginPath();
  c.roundRect(lx - 1.8, ly - 6, 3.6, lb - ly + 6, 1.8);
  c.roundRect(lx - 1, ly - 6, 17, 2.6, 1.3);
  c.roundRect(lx - 4, lb - 4, 8, 5, 2);
  c.fill();
  rect(c, lx - 1.8, lb - 22, 3.6, 2, B.kerbY);
  c.fillStyle = "#3a3870";
  c.beginPath();
  c.roundRect(lx + 8, ly - 5, 13, 5, [2, 2, 1, 1]);
  c.fill();
  glowAt(c, lx + 15, ly + 1, 18, 0.6, "255,226,160");
  c.fillStyle = "#fff1c9";
  c.beginPath();
  c.ellipse(lx + 15, ly + 1, 5, 2, 0, 0, Math.PI * 2);
  c.fill();
}

function placeLayer(p: LivePlace): HTMLCanvasElement {
  const key = `blr|${p.id}|${p.variant}|${p.name}|${p.building.w}|${p.building.wallH}|${p.building.roofH}`;
  let cv = placeCache.get(key);
  if (!cv) {
    if (placeCache.size > 48) placeCache.clear();
    const ox = p.building.x + BPL.dx;
    cv = makeCanvas(BPL.w, BPL.h, (c) => {
      c.translate(-ox, -BPL.y);
      paintPlace(c, p);
    });
    placeCache.set(key, cv);
  }
  return cv;
}

/** Steam spots (world x/y) for a darshini place, or none for the other variants. */
export function blrSteamSpots(p: LivePlace): { x: number; y: number }[] {
  if (blrKind(p) !== 1) return [];
  const top = p.building.baseY - p.building.wallH;
  return [0, 1, 2].map((i) => ({ x: p.building.x + 20 + i * 14, y: top + 35 }));
}

export function blrPlace(ctx: CanvasRenderingContext2D, p: LivePlace) {
  ctx.drawImage(placeLayer(p), p.building.x + BPL.dx, BPL.y, BPL.w, BPL.h);
}

// ── street-light row (the lamps) ─────────────────────────────────────────────

function lampRow(ctx: CanvasRenderingContext2D, f: LiveFrame, inView: (x: number, pad?: number) => boolean, at: number) {
  const L = f.lamps;
  for (let i = 0; i < L.count; i++) {
    const x = L.x0 + i * L.dx;
    if (!inView(x, 30)) continue;
    const lit = i < L.lit;
    const hy = L.y - 10;
    if (lit) {
      const flick = 0.94 + 0.06 * Math.sin(at * 5 + i * 2.1);
      const cg = ctx.createLinearGradient(0, hy, 0, L.y + 32);
      cg.addColorStop(0, `rgba(255,214,140,${0.34 * flick})`);
      cg.addColorStop(1, "rgba(255,214,140,0)");
      ctx.fillStyle = cg;
      ctx.beginPath();
      ctx.moveTo(x - 3, hy + 2);
      ctx.lineTo(x + 3, hy + 2);
      ctx.lineTo(x + 16, L.y + 32);
      ctx.lineTo(x - 16, L.y + 32);
      ctx.fill();
      ctx.fillStyle = "rgba(255,214,140,0.16)";
      ctx.beginPath();
      ctx.ellipse(x, L.y + 24, 15, 3.5, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = "rgba(10,10,40,0.25)";
    ctx.beginPath();
    ctx.moveTo(x - 4, L.y + 22);
    ctx.lineTo(x + 4, L.y + 22);
    ctx.lineTo(x - 20, L.y + 28);
    ctx.lineTo(x - 24, L.y + 27);
    ctx.fill();
    ctx.fillStyle = "#5a5f8a";
    ctx.beginPath();
    ctx.roundRect(x - 1.3, hy, 2.6, L.y + 22 - hy, 1.3);
    ctx.roundRect(x - 4, L.y + 19, 8, 3.5, 1.75);
    ctx.fill();
    ctx.fillStyle = "#3a3870";
    ctx.beginPath();
    ctx.roundRect(x - 5, hy - 4, 10, 4, [2, 2, 1, 1]);
    ctx.fill();
    if (lit) {
      const hg = ctx.createRadialGradient(x, hy + 1, 0.5, x, hy + 1, 13);
      hg.addColorStop(0, "rgba(255,226,160,0.6)");
      hg.addColorStop(1, "rgba(255,226,160,0)");
      ctx.fillStyle = hg;
      ctx.fillRect(x - 13, hy - 12, 26, 26);
      ctx.fillStyle = "#fff1c9";
    } else ctx.fillStyle = "#6b6f99";
    ctx.beginPath();
    ctx.ellipse(x, hy + 0.5, 3.6, 1.6, 0, 0, Math.PI * 2);
    ctx.fill();
  }
}

// ── the scene between the sky and the villagers ──────────────────────────────

/**
 * Everything from the skyline down to the street lights. `places` is drawn by
 * the caller (so the urgent badge and steam stay shared): call this with
 * stage "back" before the places and "front" after them.
 */
export function blrScene(
  ctx: CanvasRenderingContext2D,
  f: LiveFrame,
  view: ViewRect,
  at: number,
  stage: "back" | "front",
) {
  const x0 = view.x, x1 = view.x + view.w;
  const inView = (x: number, pad = 120) => x > x0 - pad && x < x1 + pad;
  if (stage === "front") {
    lampRow(ctx, f, inView, at);
    return;
  }
  kites(ctx, view, at);
  skyline(ctx, f, inView, at);

  if (!frontTile) frontTile = makeCanvas(TILE, WORLD_H - FRONT_Y, paintFront);
  ctx.fillStyle = B.groundFront;
  ctx.fillRect(x0 - 1, WORLD_H - 1, view.w + 2, Math.max(0, view.y + view.h - WORLD_H) + 2);
  for (let k = Math.floor(x0 / TILE); k * TILE < x1; k++) ctx.drawImage(frontTile, k * TILE, FRONT_Y, TILE + 0.5, WORLD_H - FRONT_Y);

  if (inView(f.canoeX, 90)) train(ctx, f.canoeX);
  f.palms.forEach((p, i) => {
    if (inView(p.x, p.h * 0.6)) gulmohar(ctx, p.x, p.baseY, p.h, p.lean, at, i * 1.7 + 1);
  });
  if (inView(f.sign.x + 60, 60)) zebra(ctx, f.sign.x + 44);
  traffic(ctx, f, inView, at);
  if (inView(f.sign.x, 60)) streetSign(ctx, f.sign);
}

// ── subagent companions (shared by Kerala and Bengaluru) ─────────────────────

/** Companions are drawn at this fraction of a villager's size. */
export const COMP_SCALE = 0.7;
const EMOJI_FONT = `"Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif`;
const UI_FONT = "ui-sans-serif, system-ui, sans-serif";

const tintCache = new Map<string, string>();
/** A colour mixed towards white (k = 0..1); non-hex colours fall back to a soft lilac. */
function lighten(col: string, k: number): string {
  const key = col + "|" + k;
  let out = tintCache.get(key);
  if (out) return out;
  const m = /^#([0-9a-f]{6})$/i.exec(col.trim());
  if (!m) out = "#c9c3f2";
  else {
    const n = parseInt(m[1], 16);
    const ch = (sh: number) => Math.round(((n >> sh) & 255) + (255 - ((n >> sh) & 255)) * k);
    out = `rgb(${ch(16)},${ch(8)},${ch(0)})`;
  }
  if (tintCache.size > 300) tintCache.clear();
  tintCache.set(key, out);
  return out;
}

/** Head top of a companion (world units), following its jump. */
function compHeadTop(c: LiveCompanion) {
  return c.y - (BODY.height + 2 + c.jump * 26) * COMP_SCALE;
}

/** Soft glowing tether from the parent to a companion out on an errand (hidden at its side). */
export function companionTether(ctx: CanvasRenderingContext2D, v: LiveVillager, c: LiveCompanion, t: number) {
  if (c.away <= 0.02) return;
  const a = Math.min(1, c.away * 4) * (1 - 0.55 * c.away) * c.alpha * v.alpha;
  if (a <= 0.01) return;
  const x0 = v.x, y0 = v.y - 34 - v.jump * 26;
  const x1 = c.x, y1 = c.y - (24 + c.jump * 26) * COMP_SCALE;
  const mx = (x0 + x1) / 2, my = Math.max(y0, y1) + 10 + Math.abs(x1 - x0) * 0.06;
  ctx.lineCap = "round";
  ctx.strokeStyle = `rgba(94,234,212,${0.18 * a})`;
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.quadraticCurveTo(mx, my, x1, y1);
  ctx.stroke();
  ctx.strokeStyle = `rgba(199,255,244,${0.6 * a})`;
  ctx.lineWidth = 0.9;
  ctx.setLineDash([3, 3]);
  ctx.lineDashOffset = -t * 10;
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.lineDashOffset = 0;
}

function sparkle(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, col: string) {
  if (r <= 0) return;
  ctx.fillStyle = col;
  ctx.beginPath();
  ctx.moveTo(x, y - r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.quadraticCurveTo(x, y, x, y + r);
  ctx.quadraticCurveTo(x, y, x - r, y);
  ctx.quadraticCurveTo(x, y, x, y - r);
  ctx.fill();
}

/** Small round flat badge with an emoji (fg null) or a bold glyph in colour fg. */
function iconBadge(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, bg: string, glyph: string, fg: string | null) {
  ctx.fillStyle = "rgba(8,8,32,0.3)";
  ctx.beginPath();
  ctx.arc(x + 1, y + 1.3, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = bg;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  if (fg) {
    ctx.fillStyle = fg;
    ctx.font = `900 ${(r * 1.5).toFixed(1)}px ${UI_FONT}`;
    ctx.fillText(glyph, x, y + 0.5);
  } else {
    ctx.fillStyle = "#000";
    ctx.font = `${(r * 1.25).toFixed(1)}px ${EMOJI_FONT}`;
    ctx.fillText(glyph, x, y + 0.6);
  }
}

/** Hand-over sparkle burst at the parent when an errand ends. */
export function companionHandover(ctx: CanvasRenderingContext2D, v: LiveVillager, c: LiveCompanion) {
  if (c.handover <= 0) return;
  const k = 1 - c.handover; // 0 → 1 as the burst expands
  const cx = v.x + (c.x - v.x) * 0.35, cy = v.y - 40 - v.jump * 26;
  const a = c.handover * v.alpha;
  ctx.fillStyle = `rgba(255,207,122,${0.25 * a})`;
  ctx.beginPath();
  ctx.arc(cx, cy, 4 + k * 10, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = a;
  for (let i = 0; i < 6; i++) {
    const ang = (i / 6) * Math.PI * 2 + 0.3;
    const d = 4 + k * 14;
    sparkle(ctx, cx + Math.cos(ang) * d, cy + Math.sin(ang) * d * 0.8, 2.8 - k * 1.2, i % 2 ? "#ffcf7a" : "#c7fff4");
  }
  ctx.globalAlpha = 1;
}

/**
 * A subagent companion: a rounded mini figure (0.7× a villager) in a lighter
 * shade of its parent's shirt with a teal helper sash, walking, working or
 * waiting; a flat icon badge bobs above while it works, puffs rise when busy,
 * "?"/"!" badges, sparkles when it leaves.
 */
export function companionFigure(ctx: CanvasRenderingContext2D, v: LiveVillager, c: LiveCompanion, t: number, calm: boolean) {
  const alpha = c.alpha * v.alpha;
  if (alpha <= 0.01) return;
  const f = c.facing;
  const S = COMP_SCALE;
  let seed = 0;
  for (let i = 0; i < c.id.length; i++) seed = (seed * 31 + c.id.charCodeAt(i)) % 997;
  ctx.globalAlpha = alpha;

  // Ground: soft teal glow + a small long shadow.
  ctx.fillStyle = "rgba(94,234,212,0.13)";
  ctx.beginPath();
  ctx.ellipse(c.x, c.y + 1, 11, 3, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.save();
  ctx.translate(c.x, c.y);
  ctx.transform(1, 0, 1.1, -0.22, 0, 0);
  ctx.fillStyle = `rgba(10,10,40,${0.22 * (1 - c.jump * 0.5)})`;
  ctx.beginPath();
  ctx.roundRect(-5, 2, 10, 40, 5);
  ctx.fill();
  ctx.restore();
  ctx.fillStyle = "rgba(10,10,40,0.28)";
  ctx.beginPath();
  ctx.ellipse(c.x, c.y + 1, 7 - c.jump * 3, 1.8, 0, 0, Math.PI * 2);
  ctx.fill();

  // Body, built around (0,0) at the feet and scaled down.
  ctx.save();
  ctx.translate(c.x, c.y);
  ctx.scale(S, S);
  const s = skeleton({ id: c.id, name: "", status: "working", x: 0, y: 0, facing: f, moving: c.moving, phase: c.phase, jump: c.jump, label: "", shirt: "", mundu: "", skin: v.skin });
  if (c.working && !c.moving) {
    // Hands forward at work; busy ones tap away.
    const tap = c.activity === "busy" && !calm ? Math.sin(t * 14 + seed) * 2 : 0;
    s.elbowF = { x: s.shoulder.x + f * 6, y: s.shoulder.y + 9 };
    s.handF = { x: s.shoulder.x + f * 14, y: s.shoulder.y + 6 + tap };
  } else if (c.activity === "leaving" && c.jump > 0) {
    s.elbowF = { x: s.shoulder.x + f * 6, y: s.shoulder.y - 5 };
    s.handF = { x: s.shoulder.x + f * 10, y: s.shoulder.y - 14 };
  } else if (c.activity === "wait") {
    s.elbowF = { x: s.shoulder.x + f * 5, y: s.shoulder.y + 9 };
    s.handF = { x: s.head.x + f * 4, y: s.head.y + 7 }; // hand to chin
  }
  const tunic = lighten(v.shirt, 0.38);
  const limb = (pts: { x: number; y: number }[], col: string, w: number) => {
    ctx.strokeStyle = col;
    ctx.lineWidth = w;
    ctx.beginPath();
    pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
    ctx.stroke();
  };
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  const shade = "rgba(0,0,0,0.18)";
  limb([s.hip, s.kneeB, s.footB], v.skin, 4.6);
  limb([s.hip, s.kneeB, s.footB], shade, 4.6);
  limb([s.hip, s.kneeF, s.footF], v.skin, 4.6);
  limb([s.shoulder, s.elbowB, s.handB], v.skin, 3.8);
  limb([s.shoulder, s.elbowB, s.handB], shade, 3.8);

  // Rounded tunic from the neck to just above the knees, with a flat side shade.
  const tx = (s.neck.x + s.hip.x) / 2;
  const kneeY = (s.kneeF.y + s.kneeB.y) / 2;
  const th = kneeY - s.neck.y - 1;
  ctx.fillStyle = tunic;
  ctx.beginPath();
  ctx.roundRect(tx - 8.5, s.neck.y - 1, 17, th, [7, 7, 6, 6]);
  ctx.fill();
  ctx.fillStyle = "rgba(0,0,0,0.12)";
  ctx.beginPath();
  ctx.roundRect(f > 0 ? tx - 8.5 : tx + 2.5, s.neck.y - 1, 6, th, f > 0 ? [7, 0, 0, 6] : [0, 7, 6, 0]);
  ctx.fill();
  // Teal helper sash across the chest.
  ctx.strokeStyle = "#5eead4";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(tx - f * 6.5, s.neck.y + 2);
  ctx.lineTo(tx + f * 6.5, s.hip.y - 2);
  ctx.stroke();

  // Head: a touch bigger than a villager's, so it reads as a small helper.
  const hx = s.head.x, hy = s.head.y + 1;
  ctx.fillStyle = v.skin;
  ctx.beginPath();
  ctx.arc(hx, hy, 8.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = v.hair;
  ctx.beginPath();
  ctx.arc(hx - f * 0.6, hy - 0.9, 8.4, Math.PI * 1.05, Math.PI * 1.95);
  ctx.fill();
  ctx.fillStyle = "#1a1530";
  ctx.beginPath();
  ctx.arc(hx + f * 4, hy + 0.8, 1.15, 0, Math.PI * 2);
  ctx.fill();
  if (c.activity === "leaving") {
    ctx.strokeStyle = "#1a1530";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(hx + f * 3.2, hy + 3, 2, 0.2, Math.PI - 0.2);
    ctx.stroke();
  }
  limb([s.elbowF, s.handF], v.skin, 3.8);
  limb([s.shoulder, s.elbowF], tunic, 4.6);
  ctx.restore();

  // Overlays in world units (unscaled, so they stay crisp).
  const top = compHeadTop(c);
  const bob = calm ? 0 : Math.sin(t * 3 + seed) * 1.6;
  ctx.globalAlpha = alpha;
  if (c.activity === "error") {
    iconBadge(ctx, c.x, top - 7, 5.5, "#f87171", "!", "#fff");
  } else if (c.activity === "wait") {
    // White speech bubble with a "?".
    const bx = c.x + f * 5, by = top - 8 + bob * 0.5;
    ctx.fillStyle = "#f6f4ff";
    ctx.beginPath();
    ctx.roundRect(bx - 6, by - 6, 12, 11, 5);
    ctx.moveTo(bx - f * 2, by + 4);
    ctx.lineTo(bx - f * 5, by + 8);
    ctx.lineTo(bx + f * 1, by + 4);
    ctx.fill();
    ctx.fillStyle = "#e09a1a";
    ctx.font = `900 8px ${UI_FONT}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("?", bx, by + 0.2);
  } else if (c.activity === "leaving") {
    for (let i = 0; i < 3; i++) {
      const ph = (t * 1.4 + i / 3) % 1;
      sparkle(ctx, c.x - f * (4 + i * 5), c.y - 10 - ph * 22, 2.4 * (1 - ph), i % 2 ? "#ffcf7a" : "#fff3c4");
    }
    ctx.font = `10px ${EMOJI_FONT}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "#ffcf7a";
    ctx.fillText(c.icon || "✨", c.x, top - 6);
  } else if (c.working) {
    iconBadge(ctx, c.x + c.facing * 2, top - 7 + bob, 7.2, "#f6f4ff", c.icon, null);
    if (c.activity === "busy" && !calm) {
      // Little puffs rising from the work.
      for (let i = 0; i < 3; i++) {
        const ph = (t * 0.9 + i / 3 + seed * 0.013) % 1;
        const px = c.x + f * (9 + ph * 4) + Math.sin(ph * 6 + i) * 2;
        const py = c.y - 30 - ph * 16;
        ctx.fillStyle = `rgba(246,244,255,${0.5 * Math.sin(ph * Math.PI)})`;
        ctx.beginPath();
        ctx.arc(px, py, 1.4 + ph * 2.2, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  } else if (c.activity === "pace" && c.icon) {
    // Thinking while pacing: a smaller, fainter thought badge.
    ctx.globalAlpha = alpha * 0.8;
    iconBadge(ctx, c.x + f * 3, top - 6 + bob * 0.6, 4.8, "rgba(246,244,255,0.85)", c.icon, null);
  }
  ctx.globalAlpha = 1;
}

/** Tiny label pill under a companion's feet (below, so it never fights the villager tags above heads). */
export function companionLabel(ctx: CanvasRenderingContext2D, v: LiveVillager, c: LiveCompanion, row: number) {
  const a = c.alpha * v.alpha;
  if (a <= 0.05 || !c.label) return;
  ctx.font = `600 5.5px ${UI_FONT}`;
  const tw = Math.min(110, ctx.measureText(c.label).width);
  const w = tw + 8;
  const x = c.x - w / 2, y = c.y + 4 + row * 8.5;
  ctx.globalAlpha = a;
  ctx.fillStyle = "rgba(27,29,72,0.85)";
  ctx.beginPath();
  ctx.roundRect(x, y, w, 7.5, 3.75);
  ctx.fill();
  ctx.fillStyle = c.activity === "error" ? "#fca5a5" : c.activity === "wait" ? "#f5b33d" : "#c7fff4";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(c.label, c.x, y + 4, 110);
  ctx.globalAlpha = 1;
}
