/**
 * Station props for the art styles: the same six stations as the classic
 * village (shared/stations.ts), drawn as small shapes so every style can show
 * them in its own line work. A style calls drawStations() after its scenery
 * and before its villagers; props only show while a station is used
 * (f.stations, with a fade).
 *
 * Kerala: grantha stand, grass mat, hearth with uruli, post box, bell post, charupadi.
 * Bengaluru: bookshelf, hot desk, server rack, phone booth, reception bell, waiting chairs.
 */
import type { LiveFrame, LiveStation, PlaceTheme, ViewRect } from "./types";

type C2 = CanvasRenderingContext2D;

export interface PropLook {
  /** Outline colour (comic/flat/toy styles), or null for no outline. */
  ink: string | null;
  /** Outline width in world units. */
  lw: number;
  /** Add a soft top highlight and a darker side, for shaded/3D styles. */
  shade: boolean;
  /** Round coordinates to this grid (pixel styles), or 0. */
  snap: number;
  /** Draw a soft ground shadow under each prop. */
  shadow: boolean;
}

export const PROP_LOOKS = {
  ps2: { ink: null, lw: 0, shade: true, snap: 1, shadow: true },
  comic: { ink: "#151515", lw: 1.6, shade: false, snap: 0, shadow: false },
  flat: { ink: null, lw: 0, shade: false, snap: 0, shadow: true },
  cgi: { ink: null, lw: 0, shade: true, snap: 0, shadow: true },
  toy: { ink: "rgba(0,0,0,0.35)", lw: 0.8, shade: true, snap: 0, shadow: true },
  explainer: { ink: "rgba(20,30,50,0.45)", lw: 0.9, shade: true, snap: 0, shadow: true },
} satisfies Record<string, PropLook>;

/** Where each prop stands relative to its station spot (behind or beside the villager, never covering its face). */
const OFFSET: Record<LiveStation["station"], { dx: number; dy: number }> = {
  study: { dx: -20, dy: -3 },
  desk: { dx: 0, dy: -4 },
  works: { dx: 21, dy: -3 },
  gate: { dx: 19, dy: -2 },
  porch: { dx: -17, dy: -2 },
  bench: { dx: 0, dy: -3 },
};

export function drawStations(ctx: C2, f: LiveFrame, view: ViewRect, look: PropLook): void {
  if (!f.stations?.length) return;
  for (const s of f.stations) {
    const o = OFFSET[s.station];
    const x = s.x + o.dx;
    if (x < view.x - 40 || x > view.x + view.w + 40 || s.alpha <= 0.01) continue;
    ctx.save();
    ctx.globalAlpha *= s.alpha;
    const d = new Draw(ctx, look);
    const y = s.y + o.dy;
    if (look.shadow) d.shadow(x, y + 1, s.station === "desk" || s.station === "bench" ? 17 : 10);
    PROPS[f.theme][s.station](d, x, y, f.t);
    ctx.restore();
  }
}

/** Tiny drawing helper that applies the look (snap, outline, shading). */
class Draw {
  constructor(private c: C2, private look: PropLook) {}
  private s(v: number) {
    return this.look.snap ? Math.round(v / this.look.snap) * this.look.snap : v;
  }
  private finish() {
    if (this.look.ink) {
      this.c.strokeStyle = this.look.ink;
      this.c.lineWidth = this.look.lw;
      this.c.lineJoin = "round";
      this.c.stroke();
    }
  }
  /** Filled box (x, y = top-left), with optional shading. */
  box(x: number, y: number, w: number, h: number, fill: string) {
    const c = this.c;
    c.beginPath();
    c.rect(this.s(x), this.s(y), this.s(w) || 1, this.s(h) || 1);
    c.fillStyle = fill;
    c.fill();
    if (this.look.shade && w > 3 && h > 3) {
      c.fillStyle = "rgba(255,255,255,0.18)";
      c.fillRect(this.s(x), this.s(y), this.s(w), Math.max(1, h * 0.18));
      c.fillStyle = "rgba(0,0,0,0.16)";
      c.fillRect(this.s(x + w * 0.78), this.s(y), this.s(w * 0.22) || 1, this.s(h));
    }
    this.finish();
  }
  poly(pts: number[], fill: string) {
    const c = this.c;
    c.beginPath();
    for (let i = 0; i < pts.length; i += 2) (i ? c.lineTo : c.moveTo).call(c, this.s(pts[i]!), this.s(pts[i + 1]!));
    c.closePath();
    c.fillStyle = fill;
    c.fill();
    this.finish();
  }
  ellipse(x: number, y: number, rx: number, ry: number, fill: string, from = 0, to = Math.PI * 2) {
    const c = this.c;
    c.beginPath();
    c.ellipse(this.s(x), this.s(y), rx, ry, 0, from, to);
    if (to - from < Math.PI * 2) c.closePath();
    c.fillStyle = fill;
    c.fill();
    if (this.look.shade) {
      c.fillStyle = "rgba(255,255,255,0.16)";
      c.beginPath();
      c.ellipse(this.s(x - rx * 0.25), this.s(y - ry * 0.3), rx * 0.45, ry * 0.35, 0, 0, Math.PI * 2);
      c.fill();
    }
    c.beginPath();
    c.ellipse(this.s(x), this.s(y), rx, ry, 0, from, to);
    if (to - from < Math.PI * 2) c.closePath();
    this.finish();
  }
  line(x0: number, y0: number, x1: number, y1: number, color: string, w: number) {
    const c = this.c;
    c.beginPath();
    c.moveTo(this.s(x0), this.s(y0));
    c.lineTo(this.s(x1), this.s(y1));
    c.strokeStyle = color;
    c.lineWidth = w;
    c.lineCap = "round";
    c.stroke();
  }
  dot(x: number, y: number, r: number, color: string) {
    this.c.beginPath();
    this.c.arc(this.s(x), this.s(y), r, 0, Math.PI * 2);
    this.c.fillStyle = color;
    this.c.fill();
  }
  shadow(x: number, y: number, rx: number) {
    this.c.beginPath();
    this.c.ellipse(x, y, rx, rx * 0.28, 0, 0, Math.PI * 2);
    this.c.fillStyle = "rgba(0,0,0,0.18)";
    this.c.fill();
  }
}

type PropFn = (d: Draw, x: number, y: number, t: number) => void;

const WOOD = "#8a5a2b";
const WOOD_D = "#6b4220";
const BRASS = "#d9a43a";

const PROPS: Record<PlaceTheme, Record<LiveStation["station"], PropFn>> = {
  kerala: {
    // Grantha stand: an X-stand holding a palm-leaf book.
    study: (d, x, y) => {
      d.line(x - 6, y, x + 6, y - 14, WOOD_D, 2);
      d.line(x + 6, y, x - 6, y - 14, WOOD_D, 2);
      d.poly([x - 9, y - 15, x + 9, y - 15, x + 7, y - 11, x - 7, y - 11], "#d8c08a");
      d.line(x - 6, y - 13, x + 6, y - 13, "#9c7a3c", 0.8);
    },
    // Grass mat on the ground.
    desk: (d, x, y) => {
      d.poly([x - 16, y + 1, x + 16, y + 1, x + 12, y - 5, x - 12, y - 5], "#c9a85a");
      for (let i = -10; i <= 10; i += 5) d.line(x + i, y, x + i * 0.8, y - 4, "#a8873f", 0.7);
    },
    // Hearth: three stones, a fire and a brass uruli.
    works: (d, x, y, t) => {
      d.dot(x - 6, y - 2, 3, "#6d6a64");
      d.dot(x + 6, y - 2, 3, "#6d6a64");
      d.dot(x, y - 1, 3, "#7a766f");
      const fl = 1 + 0.15 * Math.sin(t * 9);
      d.poly([x - 4, y - 4, x, y - 4 - 7 * fl, x + 4, y - 4], "#ff9a3c");
      d.ellipse(x, y - 9, 9, 4, BRASS, 0, Math.PI);
      d.line(x - 9, y - 9, x + 9, y - 9, "#b8862b", 1.4);
    },
    // Red post box on a post.
    gate: (d, x, y) => {
      d.box(x - 1.5, y - 10, 3, 10, "#5a5a5a");
      d.box(x - 6, y - 24, 12, 14, "#c8282d");
      d.ellipse(x, y - 24, 6, 3, "#a51f24", Math.PI, Math.PI * 2);
      d.box(x - 3.5, y - 19, 7, 1.4, "#3a0d0f");
    },
    // Bell post: a wooden post with a brass bell.
    porch: (d, x, y, t) => {
      d.box(x - 1.5, y - 26, 3, 26, WOOD_D);
      d.box(x - 1.5, y - 26, 9, 2.5, WOOD_D);
      const sw = Math.sin(t * 5) * 1.5;
      d.poly([x + 6 + sw - 3.5, y - 16, x + 6 + sw, y - 23, x + 6 + sw + 3.5, y - 16], BRASS);
    },
    // Charupadi-style wooden seat.
    bench: (d, x, y) => {
      d.box(x - 16, y - 9, 32, 3, WOOD);
      d.box(x - 16, y - 17, 3, 8, WOOD_D);
      d.line(x - 14, y - 15, x + 14, y - 15, WOOD_D, 1.2);
      d.box(x - 14, y - 6, 2.5, 6, WOOD_D);
      d.box(x + 11.5, y - 6, 2.5, 6, WOOD_D);
    },
  },
  bengaluru: {
    // Bookshelf.
    study: (d, x, y) => {
      d.box(x - 8, y - 24, 16, 24, "#7b5536");
      const books = ["#4f7ccc", "#d9534f", "#e8b84a", "#5cb85c", "#9b6bd1"];
      for (let row = 0; row < 3; row++) for (let i = 0; i < 4; i++) d.box(x - 6.5 + i * 3.4, y - 22 + row * 7.5, 2.6, 5.5, books[(row + i) % books.length]!);
    },
    // Hot desk.
    desk: (d, x, y) => {
      d.box(x - 15, y - 13, 30, 3, "#d8dde3");
      d.box(x - 13, y - 10, 2, 10, "#6c7580");
      d.box(x + 11, y - 10, 2, 10, "#6c7580");
      d.box(x + 4, y - 20, 9, 7, "#2b3440");
    },
    // Server rack with blinking lights.
    works: (d, x, y, t) => {
      d.box(x - 7, y - 28, 14, 28, "#2a2f36");
      for (let i = 0; i < 5; i++) {
        d.box(x - 5.5, y - 26 + i * 5.3, 11, 3.6, "#3b424b");
        const on = Math.sin(t * 6 + i * 1.7) > 0;
        d.dot(x + 3.5, y - 24.2 + i * 5.3, 0.9, on ? "#5eead4" : "#1f6f62");
      }
    },
    // Phone booth: yellow hood on a post.
    gate: (d, x, y) => {
      d.box(x - 1.5, y - 14, 3, 14, "#555");
      d.box(x - 7, y - 30, 14, 16, "#f2c230");
      d.box(x - 5, y - 26, 10, 9, "#2f3a44");
      d.box(x - 3, y - 25, 6, 3, "#e9eef3");
    },
    // Reception podium with a desk bell.
    porch: (d, x, y, t) => {
      d.poly([x - 7, y, x + 7, y, x + 5.5, y - 16, x - 5.5, y - 16], "#e7e2d6");
      d.box(x - 7, y - 18, 14, 2.5, "#b9b2a2");
      const pop = 1 + 0.08 * Math.sin(t * 8);
      d.ellipse(x, y - 18, 3.4 * pop, 2.8 * pop, "#d4d8dc", Math.PI, Math.PI * 2);
      d.dot(x, y - 21.5, 0.8, "#9aa1a8");
    },
    // Two waiting chairs.
    bench: (d, x, y) => {
      for (const cx of [x - 8, x + 8]) {
        d.box(cx - 6, y - 9, 12, 2.5, "#3f6fb5");
        d.box(cx - 6, y - 18, 2.5, 9, "#355f9c");
        d.box(cx - 5, y - 6.5, 1.6, 6.5, "#6c7580");
        d.box(cx + 3.4, y - 6.5, 1.6, 6.5, "#6c7580");
      }
    },
  },
};
