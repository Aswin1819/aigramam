/** Small three.js helpers shared by the Office world: colour mixing, rounded slabs and text/screen textures. */
import * as THREE from "three";
import type { Tone } from "@/app/workspace/focus";

/** Mix two #rrggbb colours: t = 0 gives a, 1 gives b. */
export function mixHex(a: string, b: string, t: number): string {
  const pa = parseInt(a.slice(1), 16);
  const pb = parseInt(b.slice(1), 16);
  const ch = (p: number, s: number) => (p >> s) & 255;
  const m = (s: number) => Math.round(ch(pa, s) + (ch(pb, s) - ch(pa, s)) * t);
  return `#${((m(16) << 16) | (m(8) << 8) | m(0)).toString(16).padStart(6, "0")}`;
}

/** FNV-1a, unsigned. */
export function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** A rounded rectangle lying on the ground, extruded upwards by `height`. */
export function roundedSlab(w: number, d: number, r: number, height: number): THREE.ExtrudeGeometry {
  const s = new THREE.Shape();
  const x = -w / 2;
  const y = -d / 2;
  r = Math.min(r, w / 2, d / 2);
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y);
  s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + d - r);
  s.quadraticCurveTo(x + w, y + d, x + w - r, y + d);
  s.lineTo(x + r, y + d);
  s.quadraticCurveTo(x, y + d, x, y + d - r);
  s.lineTo(x, y + r);
  s.quadraticCurveTo(x, y, x + r, y);
  const g = new THREE.ExtrudeGeometry(s, { depth: height, bevelEnabled: true, bevelThickness: 0.25, bevelSize: 0.25, bevelSegments: 2, curveSegments: 6 });
  // The shape is in x/y and extrudes along +z: lay it flat so it extrudes upwards.
  g.rotateX(-Math.PI / 2);
  return g;
}

function canvasTexture(c: HTMLCanvasElement): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/** One line of text on a transparent texture (names on floors and signs). */
export function textTexture(text: string, color: string, font = "600 64px Georgia, 'Times New Roman', serif", bg?: string): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  const ctx = c.getContext("2d")!;
  ctx.font = font;
  c.width = Math.min(2048, Math.ceil(ctx.measureText(text).width) + 40);
  c.height = 96;
  if (bg) {
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, c.width, c.height);
  }
  ctx.font = font;
  ctx.fillStyle = color;
  ctx.textBaseline = "middle";
  ctx.fillText(text, 20, 50);
  return canvasTexture(c);
}

/** A monitor's picture: a dark terminal while working, amber when it needs the person, a pale page while resting. */
export function screenTexture(tone: Tone, title: string, action: string): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 160;
  const ctx = c.getContext("2d")!;
  const dark = tone === "work" || tone === "quiet" || tone === "error";
  ctx.fillStyle = tone === "urgent" ? "#3a2a12" : dark ? "#15171b" : "#efe9dc";
  ctx.fillRect(0, 0, 256, 160);
  ctx.font = "bold 22px Consolas, Menlo, monospace";
  ctx.fillStyle = tone === "urgent" ? "#f5b33d" : tone === "error" ? "#ff8a80" : dark ? "#9be7d4" : "#4a463d";
  ctx.fillText(title.slice(0, 18), 12, 32);
  ctx.font = "18px Consolas, Menlo, monospace";
  ctx.fillStyle = tone === "urgent" ? "#ffd58a" : dark ? "#c9d1cf" : "#6b665b";
  const words = (tone === "urgent" ? "Waiting for you" : action || (dark ? "Thinking" : "Resting")).slice(0, 60);
  for (let i = 0; i < 3; i++) ctx.fillText(words.slice(i * 20, i * 20 + 20), 12, 66 + i * 26);
  ctx.fillStyle = dark ? "rgba(155,231,212,0.25)" : "rgba(74,70,61,0.2)";
  for (let i = 0; i < 2; i++) ctx.fillRect(12, 128 + i * 12, 120 + ((title.length * 37 + i * 53) % 110), 5);
  return canvasTexture(c);
}

/** A big browser window on the office wall (the web area). */
export function browserTexture(): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 320;
  c.height = 200;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#dfe8ef";
  ctx.fillRect(0, 0, 320, 200);
  ctx.fillStyle = "#2b3440";
  ctx.fillRect(0, 0, 320, 30);
  for (const [i, col] of ["#ff6b5f", "#f5b33d", "#5ed37a"].entries()) {
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.arc(16 + i * 16, 15, 5, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = "#eef3f7";
  ctx.fillRect(70, 7, 230, 16);
  ctx.fillStyle = "#2b3440";
  ctx.font = "bold 26px Georgia, serif";
  ctx.fillText("The web", 20, 72);
  ctx.fillStyle = "#9aa9b6";
  for (let i = 0; i < 5; i++) ctx.fillRect(20, 92 + i * 20, 160 + ((i * 47) % 120), 8);
  return canvasTexture(c);
}
