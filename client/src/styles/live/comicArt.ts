import { skeleton } from "../scene";
import { asVillagerFrame } from "./reference";
import { GROUND, WORLD_H, type LiveFrame, type LivePlace, type LiveStyle, type LiveVillager, type ViewRect } from "./types";
import { FONT, INK, PAPER, caption, farPalm, halftone, hash, ink, limb, makeLayer, palm, steamCurl, wordBurst } from "./comicArtKit";

/**
 * Comic Art, live village version: halftone skies, thick ink, flat bright
 * fills, a caption box, speed lines, sound effects and YES! bursts, with a
 * screen-fixed close-up inset of the most urgent (or selected) villager.
 * Animated on twos (12 fps). Ported from the Style lab prototype.
 */

const TILE = 160;
/** Offscreen resolution (pixels per world unit) for cached scenery. */
const RES = 3;

// ── cached scenery ───────────────────────────────────────────────────────────

let groundTile: HTMLCanvasElement | null = null;
let skyTile: HTMLCanvasElement | null = null;
/** Height of the upper-sky tile: a whole, even number of halftone rows, so it repeats seamlessly. */
const SKY_TH = 5 * 0.866 * 12;

/** Sky above the world (view.y < 0 on wide screens): light blue with fine, even dots. */
function paintSkyTile(c: CanvasRenderingContext2D) {
  c.fillStyle = "#a8dcff";
  c.fillRect(0, 0, TILE, SKY_TH);
  halftone(c, 0, 0, TILE, SKY_TH - 1, 5, "#5aa9ea", () => 0.3);
}

/** A puffy inked comic cloud. */
function cloud(c: CanvasRenderingContext2D, x: number, y: number, s: number) {
  c.beginPath();
  c.moveTo(x - 26 * s, y + 6 * s);
  c.arc(x - 16 * s, y + 1 * s, 9 * s, Math.PI * 0.75, Math.PI * 1.6);
  c.arc(x - 2 * s, y - 5 * s, 12 * s, Math.PI * 1.15, Math.PI * 1.9);
  c.arc(x + 15 * s, y, 10 * s, Math.PI * 1.3, Math.PI * 0.25);
  c.lineTo(x - 26 * s, y + 6 * s);
  c.closePath();
  ink(c, "#fff", 1.8);
}

/** One repeating 160-unit-wide strip: sky, far bank, backwater, grass, path. */
function paintTile(c: CanvasRenderingContext2D) {
  const { waterTop, waterBottom, groundY, pathTop, pathBottom } = GROUND;
  c.fillStyle = "#a8dcff";
  c.fillRect(0, 0, TILE, waterTop);
  halftone(c, 0, 2, TILE, waterTop, 5, "#5aa9ea", (_x, y) => 0.3 + 1.5 * (y / waterTop));
  // Far bank, periodic over the tile.
  c.beginPath();
  c.moveTo(-2, waterTop + 1);
  for (let x = -2; x <= TILE + 2; x += 4) c.lineTo(x, waterTop - 6 - 4 * Math.sin((x / TILE) * Math.PI * 4));
  c.lineTo(TILE + 2, waterTop + 1);
  c.closePath();
  ink(c, "#2c8a4e", 1.6);
  // Backwater.
  c.fillStyle = "#2f86e6";
  c.fillRect(0, waterTop, TILE, waterBottom - waterTop);
  halftone(c, 0, waterTop + 2, TILE, waterBottom, 5, "#1f64c0", (_x, y) => 0.5 + 0.9 * ((y - waterTop) / (waterBottom - waterTop)));
  c.strokeStyle = "#fff";
  c.lineWidth = 1.4;
  c.lineCap = "round";
  for (let i = 0; i < 4; i++) {
    const x = 6 + hash(i * 3.3) * 110, y = waterTop + 8 + hash(i * 7.1) * 30;
    c.beginPath();
    c.moveTo(x, y);
    c.quadraticCurveTo(x + 5, y - 3, x + 10, y);
    c.quadraticCurveTo(x + 15, y - 3, x + 20, y);
    c.stroke();
  }
  // Grass, path, foreground grass.
  c.fillStyle = "#7fd14f";
  c.fillRect(0, groundY, TILE, WORLD_H - groundY);
  halftone(c, 0, groundY + 2, TILE, pathTop, 5, "#5fb33a", (_x, y) => 1.4 - (y - groundY) / 70);
  c.fillStyle = "#f6b56b";
  c.fillRect(0, pathTop, TILE, pathBottom - pathTop);
  halftone(c, 0, pathTop + 2, TILE, pathBottom, 5, "#e48a3a", (_x, y) => 0.3 + (y - pathTop) / 45);
  halftone(c, 0, pathBottom + 3, TILE, WORLD_H, 5, "#5fb33a", () => 1.2);
  c.strokeStyle = INK;
  c.lineWidth = 1.8;
  c.beginPath();
  for (const y of [waterTop, groundY, pathTop, pathBottom]) {
    c.moveTo(-1, y);
    c.lineTo(TILE + 1, y);
  }
  c.stroke();
}

const WALLS = ["#ffd23f", "#ff9ec7", "#7fe3ff", "#ffb04f"];
const WALL_DOTS = ["#e0a400", "#e0609a", "#3ab5e0", "#e07d1a"];
const ROOFS = ["#ef3b3b", "#2f6fe0", "#8b3fd9", "#1fae5a"];
/** Building cache margin around the footprint (units). */
const BM = 24;
const buildingCache = new Map<string, HTMLCanvasElement>();

function buildingLayer(p: LivePlace): HTMLCanvasElement {
  const b = p.building;
  const key = `${p.variant}|${p.name}|${b.w}|${b.wallH}|${b.roofH}|${b.doorX - b.x}`;
  let cv = buildingCache.get(key);
  if (cv) return cv;
  if (buildingCache.size > 64) buildingCache.clear();
  const w = b.w + BM * 2, h = b.wallH + b.roofH + BM + 18;
  cv = makeLayer(w, h, RES, (c) => paintBuilding(c, p));
  buildingCache.set(key, cv);
  return cv;
}

/** Paints a shop in local units: wall top-left at (BM, roofH + BM). */
function paintBuilding(c: CanvasRenderingContext2D, p: LivePlace) {
  const b = p.building;
  const v = p.variant % 4;
  const x0 = BM, top = b.roofH + BM, base = top + b.wallH, w = b.w;
  const door = b.doorX - b.x + x0;
  // Dotted shadow on the grass.
  halftone(c, x0 - 4, base, x0 + w + 20, base + 14, 3.2, "rgba(20,60,10,0.75)", (x, y) => (y - base < 12 - (x - x0 - w) * 0.1 ? 1.1 : 0));
  c.beginPath();
  c.rect(x0, top, w, b.wallH);
  ink(c, WALLS[v]!, 2.4);
  halftone(c, x0 + w - 24, top + 2, x0 + w - 2, base - 2, 3.4, WALL_DOTS[v]!, () => 1);
  // Roof with tile lines.
  c.beginPath();
  c.moveTo(x0 - 16, top + 4);
  c.lineTo(x0 + 26, top - b.roofH);
  c.lineTo(x0 + w - 26, top - b.roofH);
  c.lineTo(x0 + w + 16, top + 4);
  c.closePath();
  ink(c, ROOFS[v]!, 2.4);
  c.strokeStyle = INK;
  c.lineWidth = 1.1;
  c.beginPath();
  for (let i = 1; i < 5; i++) {
    const y = top - b.roofH + i * (b.roofH / 4.5);
    const k = i / 5;
    c.moveTo(x0 + 26 - 42 * k, y);
    c.lineTo(x0 + w - 26 + 42 * k, y);
  }
  for (let x = x0 - 6; x < x0 + w + 10; x += 16) {
    c.moveTo(x, top + 2);
    c.lineTo(x + 2, top - 5);
  }
  c.stroke();
  // Door with warm interior and hatching.
  c.beginPath();
  c.rect(door - 12, top + 22, 24, b.wallH - 22);
  ink(c, "#ff9f1c", 2);
  c.strokeStyle = "rgba(17,17,17,0.6)";
  c.lineWidth = 0.8;
  c.beginPath();
  for (let i = 0; i < 6; i++) {
    c.moveTo(door - 12, top + 30 + i * 7);
    c.lineTo(door - 3, top + 22 + i * 7);
  }
  c.stroke();
  // Window (right of the door) or a second counter on variant 2.
  const wx = Math.min(x0 + w - 32, door + 20);
  c.beginPath();
  c.rect(wx, top + 26, 22, 16);
  ink(c, "#9fe3ff", 2);
  c.beginPath();
  c.moveTo(wx + 11, top + 26);
  c.lineTo(wx + 11, top + 42);
  c.stroke();
  // Counter with tea glasses (left of the door).
  const cw = Math.max(30, door - 16 - (x0 + 6));
  c.beginPath();
  c.rect(x0 + 6, top + 48, cw, 6);
  ink(c, "#9b4a22", 1.8);
  const glasses = Math.max(1, Math.min(3, Math.floor(cw / 18)));
  for (let i = 0; i < glasses; i++) {
    const gx = x0 + 16 + i * 14;
    c.beginPath();
    c.moveTo(gx - 3, top + 39);
    c.lineTo(gx + 3, top + 39);
    c.lineTo(gx + 2.2, top + 48);
    c.lineTo(gx - 2.2, top + 48);
    c.closePath();
    ink(c, "#e8f6ff", 1.2);
    c.fillStyle = "#c8742a";
    c.fillRect(gx - 2.3, top + 43, 4.6, 4.4);
  }
  // Signboard across the wall with the project's name.
  let size = 8.5;
  c.font = `900 ${size}px ${FONT}`;
  const name = p.name.toUpperCase();
  const maxW = w - 14;
  while (c.measureText(name).width + 12 > maxW && size > 5.5) {
    size -= 0.5;
    c.font = `900 ${size}px ${FONT}`;
  }
  const bw = Math.min(maxW, c.measureText(name).width + 12);
  const bx = x0 + w / 2 - bw / 2;
  c.fillStyle = INK;
  c.fillRect(bx + 2, top + 6, bw, 14);
  c.beginPath();
  c.rect(bx, top + 4, bw, 14);
  ink(c, ["#fff", "#ffe14d", "#fff", "#ffe14d"][v]!, 2);
  c.fillStyle = v === 1 ? "#e11d2e" : INK;
  c.textAlign = "center";
  c.textBaseline = "middle";
  c.fillText(name, x0 + w / 2, top + 11.5);
}

const steamSpots = (p: LivePlace) => {
  const b = p.building;
  const cw = Math.max(30, b.doorX - b.x - 22);
  const n = Math.max(1, Math.min(3, Math.floor(cw / 18)));
  return Array.from({ length: n }, (_, i) => ({ x: b.x + 16 + i * 14, y: b.baseY - b.wallH + 37 }));
};

// ── villagers ────────────────────────────────────────────────────────────────

function villager(c: CanvasRenderingContext2D, v: LiveVillager, f: LiveFrame) {
  const vf = asVillagerFrame(v);
  const s = skeleton(vf);
  const d = v.facing;
  const frame = Math.floor(f.t * 12);
  const calm = f.reducedMotion;

  if (v.selected || v.hovered) {
    // Comic "look here" rays and a ring under the feet.
    if (v.selected) {
      c.strokeStyle = INK;
      c.lineWidth = 1.6;
      c.lineCap = "round";
      c.beginPath();
      const cy = s.neck.y + 4;
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2 + 0.3;
        c.moveTo(v.x + Math.cos(a) * 30, cy + Math.sin(a) * 34);
        c.lineTo(v.x + Math.cos(a) * 38, cy + Math.sin(a) * 42);
      }
      c.stroke();
    }
    c.beginPath();
    c.ellipse(v.x, v.y + 1, 17, 5, 0, 0, Math.PI * 2);
    if (v.selected) ink(c, "#ffe14d", 2);
    else {
      c.setLineDash([3, 3]);
      c.strokeStyle = INK;
      c.lineWidth = 1.4;
      c.stroke();
      c.setLineDash([]);
    }
  }

  // Ground shadow.
  c.fillStyle = "rgba(17,17,17,0.35)";
  c.beginPath();
  c.ellipse(v.x, v.y + 1, 11 - v.jump * 5, 2.6, 0, 0, Math.PI * 2);
  c.fill();

  if (v.moving && !calm) {
    // Speed lines and dust puffs behind the walker.
    c.strokeStyle = INK;
    c.lineWidth = 1.3;
    c.lineCap = "round";
    c.beginPath();
    for (let i = 0; i < 5; i++) {
      const y = v.y - 14 - i * 9 + hash(frame + i) * 3;
      const x0 = v.x - d * (12 + hash(i * 2 + frame) * 6);
      const len = 14 + hash(i * 5.3 + frame * 0.7) * 22;
      c.moveTo(x0, y);
      c.lineTo(x0 - d * len, y);
    }
    c.stroke();
    for (let i = 0; i < 2; i++) {
      c.beginPath();
      c.arc(v.x - d * (10 + i * 7), v.y - 2 - i * 2, 3 - i * 0.6 + hash(frame + i) * 1.2, 0, Math.PI * 2);
      ink(c, "#fff", 1.1);
    }
  }

  // Helpers: little round sidekicks trailing behind.
  const nh = Math.min(3, v.helpers);
  for (let i = 0; i < nh; i++) {
    const hx = v.x - d * (16 + i * 10);
    const hy = v.y - 6 - (calm ? 0 : Math.abs(Math.sin(f.t * 5 + i * 1.3)) * 3);
    c.beginPath();
    c.arc(hx, hy, 4.5, 0, Math.PI * 2);
    ink(c, v.color, 1.3);
    c.fillStyle = INK;
    c.fillRect(hx + d * 1 - 0.6, hy - 1.5, 1.2, 1.6);
    c.fillRect(hx + d * 2.8 - 0.6, hy - 1.5, 1.2, 1.6);
  }

  limb(c, [s.shoulder, s.elbowB, s.handB], v.skin, 3.2);
  limb(c, [s.hip, s.kneeB, s.footB], v.skin, 3.8);
  limb(c, [s.hip, s.kneeF, s.footF], v.skin, 3.8);

  // Mundu.
  const kneeY = (s.kneeF.y + s.kneeB.y) / 2;
  const left = Math.min(s.kneeF.x, s.kneeB.x) - 5.5;
  const right = Math.max(s.kneeF.x, s.kneeB.x) + 5.5;
  c.beginPath();
  c.moveTo(s.hip.x - 7.5, s.hip.y - 3);
  c.lineTo(s.hip.x + 7.5, s.hip.y - 3);
  c.lineTo(right, kneeY + 6);
  c.lineTo(left, kneeY + 6);
  c.closePath();
  ink(c, v.mundu, 1.8);
  // Torso with a block of comic dots on the back side.
  const tx = (s.neck.x + s.hip.x) / 2;
  c.beginPath();
  c.roundRect(tx - 7.5, s.neck.y - 1, 15, s.hip.y - s.neck.y + 1, [5, 5, 2, 2]);
  ink(c, v.shirt, 1.8);
  c.fillStyle = "rgba(17,17,17,0.35)";
  c.beginPath();
  for (let yy = s.neck.y + 3; yy < s.hip.y - 2; yy += 3) {
    c.moveTo(tx - d * 5 + 0.7, yy);
    c.arc(tx - d * 5, yy, 0.7, 0, Math.PI * 2);
    c.moveTo(tx - d * 2.6 + 0.55, yy + 1.5);
    c.arc(tx - d * 2.6, yy + 1.5, 0.55, 0, Math.PI * 2);
  }
  c.fill();

  // Head, hair, eye, mouth.
  const hx = s.head.x, hy = s.head.y;
  c.beginPath();
  c.arc(hx, hy, 7.6, 0, Math.PI * 2);
  ink(c, v.skin, 1.8);
  c.beginPath();
  c.arc(hx - d * 0.6, hy - 0.6, 7.8, Math.PI, Math.PI * 2);
  c.closePath();
  ink(c, v.hair, 1);
  c.fillStyle = "#fff";
  c.beginPath();
  c.ellipse(hx + d * 3.4, hy + 0.8, 1.7, 2, 0, 0, Math.PI * 2);
  c.fill();
  c.fillStyle = INK;
  c.beginPath();
  c.arc(hx + d * 3.9, hy + (v.status === "idle" ? 1.6 : 1), 0.9, 0, Math.PI * 2);
  c.fill();
  c.strokeStyle = INK;
  c.lineWidth = 1;
  c.beginPath();
  if (v.status === "finished") c.arc(hx + d * 3.5, hy + 3.6, 2, 0.1, Math.PI - 0.1);
  else if (v.status === "error") c.arc(hx + d * 3.5, hy + 6, 1.8, Math.PI + 0.3, -0.3);
  else c.moveTo(hx + d * 2.4, hy + 4.4), c.lineTo(hx + d * 4.6, hy + 4.2);
  c.stroke();

  limb(c, [s.shoulder, s.elbowF, s.handF], v.skin, 3.2);
  limb(c, [s.shoulder, s.elbowF], v.shirt, 3.6);

  if (v.carry === "laptop") {
    const lx = s.handF.x, ly = s.handF.y;
    c.save();
    c.translate(lx - d * 9, ly - 1);
    c.rotate(-d * 0.35);
    c.beginPath();
    c.rect(d > 0 ? 0 : -3.4, -14, 3.4, 14);
    ink(c, "#5eead4", 1.3);
    c.restore();
    c.beginPath();
    c.rect(lx - 10, ly - 1.6, 20, 3.2);
    ink(c, "#cfd4e0", 1.4);
    if (v.status === "working" && !v.moving) {
      c.save();
      c.translate(lx + d * 18 + (calm ? 0 : hash(frame) * 1.5), ly - 15 + (calm ? 0 : hash(frame + 3) * 1.5));
      c.rotate(-0.18 + (calm ? 0 : hash(frame * 1.3) * 0.08));
      c.font = `900 9px ${FONT}`;
      c.textAlign = "center";
      c.textBaseline = "middle";
      c.lineWidth = 2.6;
      c.lineJoin = "round";
      c.strokeStyle = INK;
      c.strokeText("TAP TAP", 0, 0);
      c.fillStyle = "#ffe14d";
      c.fillText("TAP TAP", 0, 0);
      c.restore();
    }
  } else if (v.carry === "glass") {
    const gx = s.handF.x, gy = s.handF.y;
    c.beginPath();
    c.moveTo(gx - 3.4, gy - 8.5);
    c.lineTo(gx + 3.4, gy - 8.5);
    c.lineTo(gx + 2.5, gy + 1);
    c.lineTo(gx - 2.5, gy + 1);
    c.closePath();
    ink(c, "#e8f6ff", 1.3);
    c.fillStyle = "#c8742a";
    c.fillRect(gx - 2.6, gy - 4.5, 5.2, 5);
    if (!calm) steamCurl(c, gx, gy - 10, f.t, 4);
  }

  if (v.status === "finished" && v.jump > 0.15) wordBurst(c, hx - d * 30, hy - 4, "YES!", "#ffe14d", "#e11d2e", frame);
  if (v.status === "error") wordBurst(c, hx + d * 16, hy - 12, "!", "#ff3b30", "#fff", frame, 8);
  if (v.urgent) {
    // Worry emanata over the head.
    c.strokeStyle = INK;
    c.lineWidth = 1.3;
    c.beginPath();
    for (let i = -1; i <= 1; i++) {
      const a = -Math.PI / 2 + i * 0.5;
      const r0 = 11 + f.pulse * 2;
      c.moveTo(hx + Math.cos(a) * r0, hy + Math.sin(a) * r0);
      c.lineTo(hx + Math.cos(a) * (r0 + 5), hy + Math.sin(a) * (r0 + 5));
    }
    c.stroke();
  }
}

/** Name tab + label box; (labelX, labelY) is the top-centre. ~26 units tall. */
function tag(c: CanvasRenderingContext2D, v: LiveVillager, f: LiveFrame) {
  const urgent = v.urgent;
  const idle = v.status === "idle";
  c.font = `900 9px ${FONT}`;
  const w = c.measureText(v.label).width + 12;
  const h = 14;
  const cx = v.labelX, cy = v.labelY + 10 + h / 2;
  c.save();
  c.translate(cx, cy);
  if (urgent) {
    const k = 1 + 0.07 * f.pulse;
    c.scale(k, k);
    c.rotate(-0.02);
  } else if (v.selected) c.scale(1.08, 1.08);
  // Pointer down towards the villager.
  c.beginPath();
  c.moveTo(-4, h / 2 - 1);
  c.lineTo(1, h / 2 + 6);
  c.lineTo(4, h / 2 - 1);
  ink(c, urgent ? "#ff2d2d" : idle ? "#e4e4e4" : "#fff", 1.6);
  // Hard drop shadow, then the box.
  c.fillStyle = INK;
  c.fillRect(-w / 2 + 2, -h / 2 + 2, w, h);
  c.beginPath();
  c.rect(-w / 2, -h / 2, w, h);
  const fill = urgent ? `rgb(255,${40 + 50 * (1 - f.pulse)},${40 + 40 * (1 - f.pulse)})` : v.selected ? "#ffe14d" : idle ? "#e4e4e4" : v.status === "error" ? "#ffd0cc" : "#fff";
  ink(c, fill, v.selected ? 2.2 : 1.6);
  c.textAlign = "center";
  c.textBaseline = "middle";
  c.fillStyle = urgent ? "#fff" : idle ? "#555" : INK;
  c.fillText(v.label, 0, 0.8);
  if (urgent) {
    c.strokeStyle = INK;
    c.lineWidth = 1.4;
    c.beginPath();
    for (const sx of [-1, 1]) {
      for (let i = -1; i <= 1; i++) {
        c.moveTo(sx * (w / 2 + 4), i * 5);
        c.lineTo(sx * (w / 2 + 7 + 2 * f.pulse), i * 6.5);
      }
    }
    c.stroke();
  }
  // Name tab (top-left) with the status colour stripe.
  c.font = `900 7.5px ${FONT}`;
  const name = v.name.toUpperCase();
  const nw = c.measureText(name).width + 10;
  const nx = -w / 2 - 3, ny = -h / 2 - 10;
  c.beginPath();
  c.rect(nx, ny, nw, 10);
  ink(c, idle ? "#555" : INK, 1);
  c.fillStyle = v.color;
  c.fillRect(nx + 1.5, ny + 7.6, nw - 3, 1.4);
  c.fillStyle = idle ? "#ddd" : "#ffe14d";
  c.textAlign = "left";
  c.fillText(name, nx + 5, ny + 4.6);
  let bx = nx + nw + 3;
  if (v.linked) {
    c.beginPath();
    c.arc(bx + 2, ny + 5, 2.4, 0, Math.PI * 2);
    ink(c, "#2f86e6", 1);
    bx += 7;
  }
  if (v.helpers > 0) {
    c.font = `900 6.5px ${FONT}`;
    const t = `+${v.helpers}`;
    const tw = c.measureText(t).width + 6;
    c.beginPath();
    c.rect(bx, ny + 1, tw, 8);
    ink(c, "#fff", 1);
    c.fillStyle = INK;
    c.fillText(t, bx + 3, ny + 5.2);
  }
  c.restore();
}

// ── close-up inset ───────────────────────────────────────────────────────────

/** Inset size in its own units; scaled to the screen. */
const IW = 300, IH = 98;
const insetBg = new Map<string, HTMLCanvasElement>();

function insetLayer(kind: "urgent" | "calm"): HTMLCanvasElement {
  let cv = insetBg.get(kind);
  if (cv) return cv;
  cv = makeLayer(IW, IH, 4, (c) => {
    const fx = 74, fy = 62;
    c.fillStyle = kind === "urgent" ? "#ffd3dc" : "#d6f0ff";
    c.fillRect(0, 0, IW, IH);
    halftone(c, 0, 0, IW, IH, 5, kind === "urgent" ? "#ff6f91" : "#6fb8ff", (x, y) => Math.min(2.2, Math.hypot(x - fx, y - fy) / 110));
    c.fillStyle = "rgba(255,255,255,0.75)";
    for (let i = 0; i < 22; i++) {
      const a = (i / 22) * Math.PI * 2, a2 = a + 0.06;
      c.beginPath();
      c.moveTo(fx + Math.cos(a) * 46, fy + Math.sin(a) * 46);
      c.lineTo(fx + Math.cos(a) * 400, fy + Math.sin(a) * 400);
      c.lineTo(fx + Math.cos(a2) * 400, fy + Math.sin(a2) * 400);
      c.closePath();
      c.fill();
    }
  });
  insetBg.set(kind, cv);
  return cv;
}

function closeUp(c: CanvasRenderingContext2D, v: LiveVillager, f: LiveFrame) {
  const frame = Math.floor(f.t * 12);
  const urgent = v.urgent;
  const calm = f.reducedMotion;
  c.save();
  c.beginPath();
  c.rect(0, 0, IW, IH);
  c.clip();
  c.drawImage(insetLayer(urgent ? "urgent" : "calm"), 0, 0, IW, IH);
  if (urgent) {
    c.fillStyle = `rgba(255,30,60,${0.08 + 0.22 * f.pulse})`;
    c.fillRect(0, 0, IW, IH);
  }
  const shake = urgent && !calm && f.pulse > 0.75 ? (hash(frame) - 0.5) * 2 : 0;
  const fx = 74 + shake, fy = 62;
  // Shoulders.
  c.beginPath();
  c.moveTo(fx - 52, IH + 4);
  c.quadraticCurveTo(fx - 48, fy + 30, fx, fy + 28);
  c.quadraticCurveTo(fx + 48, fy + 30, fx + 52, IH + 4);
  c.closePath();
  ink(c, v.shirt, 2.4);
  c.beginPath();
  c.rect(fx - 7, fy + 18, 14, 14);
  ink(c, v.skin, 2);
  // Face with halftone shading.
  c.beginPath();
  c.ellipse(fx, fy, 27, 31, 0, 0, Math.PI * 2);
  ink(c, v.skin, 2.6);
  c.save();
  c.clip();
  halftone(c, fx - 30, fy - 30, fx - 8, fy + 32, 3.4, "rgba(60,20,10,0.4)", (x) => Math.max(0, (fx - 8 - x) / 14));
  c.restore();
  // Hair cap with a parting.
  c.beginPath();
  c.moveTo(fx - 28, fy + 2);
  c.quadraticCurveTo(fx - 30, fy - 34, fx, fy - 33);
  c.quadraticCurveTo(fx + 30, fy - 34, fx + 28, fy + 2);
  c.quadraticCurveTo(fx + 20, fy - 18, fx + 1, fy - 22);
  c.quadraticCurveTo(fx - 18, fy - 18, fx - 28, fy + 2);
  c.closePath();
  ink(c, v.hair, 1.8);
  // Brows: worried when urgent, angry on error, relaxed otherwise.
  c.strokeStyle = INK;
  c.lineWidth = 2.4;
  c.lineCap = "round";
  c.beginPath();
  if (urgent) {
    c.moveTo(fx - 15, fy - 6); c.lineTo(fx - 5, fy - 10);
    c.moveTo(fx + 9, fy - 10); c.lineTo(fx + 19, fy - 6);
  } else if (v.status === "error") {
    c.moveTo(fx - 15, fy - 11); c.lineTo(fx - 5, fy - 7);
    c.moveTo(fx + 9, fy - 7); c.lineTo(fx + 19, fy - 11);
  } else {
    c.moveTo(fx - 15, fy - 9); c.quadraticCurveTo(fx - 10, fy - 12, fx - 5, fy - 9);
    c.moveTo(fx + 9, fy - 9); c.quadraticCurveTo(fx + 14, fy - 12, fx + 19, fy - 9);
  }
  c.stroke();
  for (const ex of [fx - 9, fx + 13]) {
    c.beginPath();
    c.ellipse(ex, fy - 1, 4.6, urgent ? 5.4 : 4.4, 0, 0, Math.PI * 2);
    ink(c, "#fff", 1.6);
    c.fillStyle = INK;
    c.beginPath();
    c.arc(ex + 2, fy - 1.5, 2.3, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = "#fff";
    c.fillRect(ex + 2.4, fy - 3.4, 1.1, 1.1);
  }
  c.lineWidth = 1.4;
  c.beginPath();
  c.moveTo(fx + 3, fy + 2);
  c.lineTo(fx + 5, fy + 9);
  c.lineTo(fx + 2, fy + 10);
  c.stroke();
  // Mouth.
  c.beginPath();
  if (urgent) {
    c.ellipse(fx + 3, fy + 18, 3, 3.6 + f.pulse * 0.8, 0, 0, Math.PI * 2);
    ink(c, "#7a1a1a", 1.6);
  } else {
    if (v.status === "error") c.arc(fx + 3, fy + 22, 5, Math.PI + 0.4, -0.4);
    else c.arc(fx + 3, fy + 14, 6, 0.3, Math.PI - 0.3);
    c.lineWidth = 2;
    c.stroke();
  }
  if (urgent) {
    const sy = fy - 18 + (calm ? 0 : ((frame % 12) / 12) * 6);
    c.beginPath();
    c.moveTo(fx + 30, sy - 6);
    c.quadraticCurveTo(fx + 35, sy + 2, fx + 30, sy + 3);
    c.quadraticCurveTo(fx + 25, sy + 2, fx + 30, sy - 6);
    ink(c, "#8fd8ff", 1.4);
    c.strokeStyle = INK;
    c.lineWidth = 2;
    c.beginPath();
    for (let i = -2; i <= 2; i++) {
      const a = -Math.PI / 2 + i * 0.32;
      const r0 = 38 + f.pulse * 3;
      c.moveTo(fx + Math.cos(a) * r0, fy + Math.sin(a) * r0);
      c.lineTo(fx + Math.cos(a) * (r0 + 7), fy + Math.sin(a) * (r0 + 7));
    }
    c.stroke();
  }

  // Speech bubble with name + label.
  const bx = 200, by = 44, rx = 94, ry = 32;
  c.beginPath();
  c.ellipse(bx, by, rx, ry, 0, 0, Math.PI * 2);
  c.moveTo(bx - 70, by + 16);
  c.lineTo(fx + 22, fy + 18);
  c.lineTo(bx - 52, by + 24);
  c.fillStyle = "#fff";
  c.fill();
  c.strokeStyle = INK;
  c.lineWidth = 2.2;
  c.stroke();
  c.beginPath();
  c.ellipse(bx, by, rx - 1, ry - 1, 0, 0, Math.PI * 2);
  c.fill();
  c.textAlign = "center";
  c.textBaseline = "middle";
  c.font = `900 8px ${FONT}`;
  c.fillStyle = "#555";
  const name = v.name.toUpperCase();
  c.fillText(name.length > 26 ? name.slice(0, 25) + "…" : name, bx, by - 12);
  c.save();
  c.translate(bx, by + 4);
  if (urgent) {
    const k = 1 + 0.05 * f.pulse;
    c.scale(k, k);
  }
  let size = 14;
  c.font = `900 ${size}px ${FONT}`;
  while (c.measureText(v.label).width > 160 && size > 8) {
    size -= 1;
    c.font = `900 ${size}px ${FONT}`;
  }
  c.fillStyle = urgent ? "#c40018" : INK;
  c.fillText(v.label + (urgent && !v.label.endsWith("?") ? "?" : ""), 0, 0);
  c.restore();
  c.restore();
  c.strokeStyle = INK;
  c.lineWidth = 3;
  c.strokeRect(0, 0, IW, IH);
  caption(c, 0, 0, urgent ? "NEEDS YOU!" : "CLOSE-UP", urgent ? "#ffe14d" : "#fff", 7, 1.6);
}

// ── the style ────────────────────────────────────────────────────────────────

export const comicArtLive: LiveStyle = {
  id: "comic-art",
  name: "Comic Art",
  blurb: "Comic page: halftone dots, thick ink, captions and speech bubbles.",
  fps: 12,
  bg: PAPER,
  draw(c, f, view) {
    if (!groundTile) groundTile = makeLayer(TILE, WORLD_H, RES, paintTile);
    const inView = (x: number, pad = 120) => x > view.x - pad && x < view.x + view.w + pad;
    const frame = Math.floor(f.t * 12);
    const calm = f.reducedMotion;

    // 1. Repeating scenery strip over the whole view.
    const t0 = Math.floor(view.x / TILE) * TILE;
    for (let x = t0; x < view.x + view.w; x += TILE) c.drawImage(groundTile, x, 0, TILE + 0.05, WORLD_H);
    if (view.y < 0) {
      // Wide screens zoom out past the top of the world: continue the sky upwards.
      if (!skyTile) skyTile = makeLayer(TILE, SKY_TH, RES, paintSkyTile);
      for (let y = -SKY_TH; y + SKY_TH > view.y; y -= SKY_TH) {
        for (let x = t0; x < view.x + view.w; x += TILE) c.drawImage(skyTile, x, y, TILE + 0.05, SKY_TH + 0.05);
      }
      // A few comic clouds drifting through the extra sky.
      const span = 420;
      const drift = calm ? 0 : f.drift * 0.5;
      const k0 = Math.floor((view.x - drift - 60) / span);
      for (let k = k0; k * span + drift < view.x + view.w + 60; k++) {
        const cy = Math.max(view.y + 48, view.y * (0.3 + hash(k * 1.7) * 0.35) + 6);
        if (cy > -18) continue;
        cloud(c, k * span + drift + hash(k * 3.1) * 200, cy, 0.8 + hash(k * 5.3) * 0.5);
      }
    }
    if (view.y + view.h > WORLD_H) {
      c.fillStyle = "#7fd14f";
      c.fillRect(view.x, WORLD_H, view.w, view.y + view.h - WORLD_H);
    }

    // 2. Far palms, canoe, palms, village sign.
    for (const x of f.farPalms) if (inView(x, 20)) farPalm(c, x, GROUND.waterTop - 6);
    if (inView(f.canoeX, 40)) {
      const cx = f.canoeX, cy = 178;
      c.beginPath();
      c.moveTo(cx - 25, cy - 4);
      c.quadraticCurveTo(cx, cy + 9, cx + 25, cy - 4);
      c.closePath();
      ink(c, "#9b4a22", 1.8);
      limb(c, [{ x: cx - 1, y: cy - 2 }, { x: cx, y: cy - 12 }], "#fff", 4);
      c.beginPath();
      c.arc(cx, cy - 16, 3.6, 0, Math.PI * 2);
      ink(c, "#7a4a2a", 1.4);
      limb(c, [{ x: cx + 1, y: cy - 10 }, { x: cx + 14, y: cy + 5 + (calm ? 0 : Math.sin(f.t * 2) * 2) }], "#c0702c", 1.4);
    }
    for (const p of f.palms) if (inView(p.x, p.h * 0.6)) palm(c, p.x, p.baseY, p.h, p.lean);
    const sg = f.sign;
    if (inView(sg.x, 60)) {
      c.beginPath();
      c.rect(sg.x - 2.5, sg.y, 5, 40);
      ink(c, "#9b4a22", 1.6);
      c.beginPath();
      c.rect(sg.x - 34, sg.y - 16, 68, 18);
      ink(c, "#fff", 2.2);
      c.fillStyle = "#e11d2e";
      c.font = `900 9.5px ${FONT}`;
      c.textAlign = "center";
      c.textBaseline = "middle";
      c.fillText(sg.text, sg.x, sg.y - 6.5);
    }

    // 3. Places: cached shop with the project name, steam, urgent alert.
    for (const p of f.places) {
      const b = p.building;
      if (!inView(b.x + b.w / 2, b.w)) continue;
      const img = buildingLayer(p);
      const lw = b.w + BM * 2, lh = b.wallH + b.roofH + BM + 18;
      c.drawImage(img, b.x - BM, b.baseY - b.wallH - b.roofH - BM, lw, lh);
      if (!calm) steamSpots(p).forEach((s, i) => steamCurl(c, s.x, s.y, f.t + i * 0.3, i));
      if (p.urgent > 0) {
        const k = 1 + 0.12 * f.pulse;
        c.save();
        c.translate(b.x + b.w - 14, b.baseY - b.wallH - b.roofH + 2);
        c.scale(k, k);
        wordBurst(c, 0, 0, p.urgent > 1 ? `!×${p.urgent}` : "!", "#ff3b30", "#fff", frame, 9);
        c.restore();
      }
    }

    // 4. Lamp row: posts, lit flames with emanata.
    const L = f.lamps;
    for (let i = 0; i < L.count; i++) {
      const x = L.x0 + i * L.dx;
      if (!inView(x, 20)) continue;
      c.beginPath();
      c.rect(x - 1.8, L.y, 3.6, 22);
      ink(c, "#f4b400", 1.3);
      c.beginPath();
      c.rect(x - 6, L.y + 19, 12, 4);
      ink(c, "#f4b400", 1.3);
      c.beginPath();
      c.moveTo(x - 6, L.y - 1);
      c.quadraticCurveTo(x, L.y + 5, x + 6, L.y - 1);
      c.closePath();
      ink(c, "#f4b400", 1.3);
      if (i >= L.lit) continue;
      const fl = 1 + (calm ? 0 : hash(frame + i) * 0.15);
      c.beginPath();
      c.moveTo(x, L.y - 11 * fl);
      c.quadraticCurveTo(x + 4.5, L.y - 3, x, L.y - 0.5);
      c.quadraticCurveTo(x - 4.5, L.y - 3, x, L.y - 11 * fl);
      ink(c, "#ff8c1a", 1.3);
      c.fillStyle = "#ffe14d";
      c.beginPath();
      c.ellipse(x, L.y - 3.5, 1.5, 2.6, 0, 0, Math.PI * 2);
      c.fill();
      c.strokeStyle = INK;
      c.lineWidth = 1.1;
      c.beginPath();
      for (const a of [-2.4, -1.57, -0.74]) {
        c.moveTo(x + Math.cos(a) * 9, L.y - 5 + Math.sin(a) * 9);
        c.lineTo(x + Math.cos(a) * 13, L.y - 5 + Math.sin(a) * 13);
      }
      c.stroke();
    }

    // 5. Villagers back-to-front, then labels (selected and urgent last, on top).
    for (const v of f.villagers) {
      if (v.alpha <= 0 || !inView(v.x, 60)) continue;
      c.globalAlpha = v.alpha;
      villager(c, v, f);
    }
    const rank = (v: LiveVillager) => (v.urgent ? 2 : v.selected ? 1 : 0);
    const order = f.villagers.filter((v) => v.alpha > 0 && inView(v.labelX, 120)).sort((a, b) => rank(a) - rank(b));
    for (const v of order) {
      c.globalAlpha = v.alpha;
      tag(c, v, f);
    }
    c.globalAlpha = 1;

    // 6. Screen-fixed HUD, drawn in CSS pixels.
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const ppu = c.getTransform().a / dpr;
    if (!(ppu > 0)) return;
    const sw = view.w * ppu, sh = view.h * ppu;
    c.save();
    c.translate(view.x, view.y);
    c.scale(1 / ppu, 1 / ppu);
    // Page gutter and panel border around the whole view.
    c.strokeStyle = PAPER;
    c.lineWidth = 10;
    c.strokeRect(0, 0, sw, sh);
    c.strokeStyle = INK;
    c.lineWidth = 3.5;
    c.strokeRect(6.5, 6.5, sw - 13, sh - 13);
    // Caption box below the top bar, with who is at work.
    const k = Math.max(1, Math.min(1.8, sh / 560));
    c.save();
    c.translate(14, 78);
    c.scale(k, k);
    caption(c, 0, 0, "MEANWHILE, IN THE GRAMAM…", "#ffe14d", 10);
    caption(c, 8, 17.5, f.total ? `${f.working} OF ${f.total} AT WORK` : "ALL QUIET…", "#fff", 7.5, 1.4);
    c.restore();
    // Close-up inset: most urgent villager, else the selected one. Bottom-right,
    // above the dock band (the Sessions list overlays the bottom-left).
    const focus = f.villagers.find((v) => v.urgent) ?? f.villagers.find((v) => v.selected);
    if (focus) {
      const ks = Math.max(1, Math.min(2, Math.min(sh / 600, (sw * 0.36) / IW)));
      c.save();
      c.translate(sw - 18 - IW * ks, sh - 70 - IH * ks);
      c.scale(ks, ks);
      c.fillStyle = INK;
      c.fillRect(4, 4, IW, IH);
      closeUp(c, focus, f);
      c.restore();
    }
    c.restore();
  },
};
