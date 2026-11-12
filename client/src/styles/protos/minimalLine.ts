import { BODY, H, LAYOUT, STATUS_COLOR, W, boil, labelAnchor, rng, skeleton, type SceneFrame, type VillagerFrame } from "../scene";
import type { StyleProto } from "../types";

/** 7 · Minimal Line: white hairlines on black, stick figures, a dotted floor. */

const INK = "rgba(255,255,255,0.88)";
const FAINT = "rgba(255,255,255,0.28)";

function line(ctx: CanvasRenderingContext2D, pts: [number, number][], close = false) {
  ctx.beginPath();
  pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  if (close) ctx.closePath();
  ctx.stroke();
}

function palm(ctx: CanvasRenderingContext2D, x: number, baseY: number, h: number, lean: number, t: number) {
  const topX = x + lean * h;
  const topY = baseY - h;
  ctx.beginPath();
  ctx.moveTo(x, baseY);
  ctx.quadraticCurveTo(x + lean * h * 0.2, baseY - h * 0.5, topX, topY);
  ctx.stroke();
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + Math.sin(t * 0.8 + i) * 0.06;
    const len = h * 0.32;
    const ex = topX + Math.cos(a) * len;
    const ey = topY + Math.sin(a) * len * 0.45 + len * 0.25;
    ctx.beginPath();
    ctx.moveTo(topX, topY);
    ctx.quadraticCurveTo((topX + ex) / 2, topY - 8, ex, ey);
    ctx.stroke();
  }
}

function villager(ctx: CanvasRenderingContext2D, v: VillagerFrame) {
  const s = skeleton(v);
  ctx.strokeStyle = INK;
  ctx.lineWidth = 1.4;
  line(ctx, [[s.footB.x, s.footB.y], [s.kneeB.x, s.kneeB.y], [s.hip.x, s.hip.y], [s.kneeF.x, s.kneeF.y], [s.footF.x, s.footF.y]]);
  line(ctx, [[s.hip.x, s.hip.y], [s.neck.x, s.neck.y]]);
  line(ctx, [[s.handB.x, s.handB.y], [s.elbowB.x, s.elbowB.y], [s.shoulder.x, s.shoulder.y], [s.elbowF.x, s.elbowF.y], [s.handF.x, s.handF.y]]);
  ctx.beginPath();
  ctx.arc(s.head.x, s.head.y, BODY.head * 0.75, 0, Math.PI * 2);
  ctx.stroke();
  if (v.carry === "laptop") {
    ctx.fillStyle = INK;
    ctx.fillRect(s.handF.x - 9, s.handF.y - 3, 18, 2.5);
  } else if (v.carry === "glass") {
    line(ctx, [[s.handF.x - 2.5, s.handF.y - 7], [s.handF.x - 2, s.handF.y + 1], [s.handF.x + 2.5, s.handF.y + 1], [s.handF.x + 3, s.handF.y - 7]]);
  }
}

function label(ctx: CanvasRenderingContext2D, v: VillagerFrame, f: SceneFrame) {
  const { x, y } = labelAnchor(v);
  const urgent = v.status === "waiting";
  ctx.font = "500 8px ui-sans-serif, system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.fillStyle = "rgba(255,255,255,0.55)";
  ctx.fillText(v.name.toUpperCase(), x, y - 10);
  ctx.fillStyle = urgent ? `rgba(255,90,79,${0.55 + 0.45 * f.pulse})` : INK;
  ctx.font = "400 9px ui-sans-serif, system-ui, sans-serif";
  ctx.fillText(v.label, x, y);
  // A short tick down to the figure, coloured by state.
  ctx.strokeStyle = STATUS_COLOR[v.status];
  ctx.globalAlpha = urgent ? 0.4 + 0.6 * f.pulse : 0.7;
  line(ctx, [[x, y + 4], [x, y + 12]]);
  ctx.globalAlpha = 1;
}

export const minimalLine: StyleProto = {
  id: "minimal-line",
  n: 7,
  name: "Minimal Line",
  blurb: "White hairlines on black. Stick-figure villagers, outline-only buildings and a dotted floor. Calm and very light to draw.",
  bg: "#000",
  draw(ctx, f) {
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, W, H);

    // Stars, slowly twinkling.
    const r = rng(7);
    for (let i = 0; i < 40; i++) {
      const x = r() * W, y = r() * 130, tw = 0.25 + 0.35 * Math.abs(Math.sin(f.t * 0.7 + i));
      ctx.fillStyle = `rgba(255,255,255,${tw})`;
      ctx.fillRect(x, y, 1, 1);
    }
    // Moon outline.
    ctx.strokeStyle = FAINT;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(560, 52, 14, 0, Math.PI * 2);
    ctx.stroke();

    // Horizon, water lines (gently shifting), far palms.
    ctx.strokeStyle = FAINT;
    line(ctx, [[0, LAYOUT.waterTop], [W, LAYOUT.waterTop]]);
    for (let i = 0; i < 4; i++) {
      const y = LAYOUT.waterTop + 10 + i * 9;
      const off = (f.t * (8 + i * 3)) % 40;
      ctx.setLineDash([14, 26]);
      ctx.lineDashOffset = -off;
      line(ctx, [[0, y], [W, y]]);
    }
    ctx.setLineDash([]);
    for (const x of LAYOUT.farPalms) palm(ctx, x, LAYOUT.waterTop, 34, 0.05, f.t);

    // Canoe with a rower.
    ctx.strokeStyle = INK;
    const cx = f.canoeX, cy = 178;
    line(ctx, [[cx - 22, cy - 3], [cx - 16, cy + 3], [cx + 16, cy + 3], [cx + 22, cy - 3]]);
    line(ctx, [[cx, cy], [cx, cy - 12]]);
    ctx.beginPath();
    ctx.arc(cx, cy - 15, 3, 0, Math.PI * 2);
    ctx.stroke();
    line(ctx, [[cx + 2, cy - 9], [cx + 14, cy + 6 + Math.sin(f.t * 2) * 2]]);

    // Ground line and dotted floor (perspective dots, the reel's signature).
    ctx.strokeStyle = FAINT;
    line(ctx, [[0, LAYOUT.groundY], [W, LAYOUT.groundY]]);
    for (let row = 0; row < 5; row++) {
      const y = 336 + row * 4.5;
      const gap = 9 + row * 2;
      ctx.fillStyle = `rgba(255,255,255,${0.18 + row * 0.08})`;
      for (let x = (row % 2) * gap * 0.5; x < W; x += gap) ctx.fillRect(x, y, 1.2, 1.2);
    }

    // Tea shop: outline box, sloped roof, door, board, counter with glasses.
    const sh = LAYOUT.shop;
    const base = sh.y + sh.h;
    ctx.strokeStyle = INK;
    line(ctx, [[sh.x, base], [sh.x, sh.y], [sh.x + sh.w, sh.y], [sh.x + sh.w, base]]);
    line(ctx, [[sh.x - 14, sh.y + 4], [sh.x + sh.w / 2, sh.y - sh.roofH], [sh.x + sh.w + 14, sh.y + 4]]);
    ctx.strokeStyle = FAINT;
    for (let i = 1; i < 6; i++) line(ctx, [[sh.x - 14 + i * 4, sh.y + 4 - i * 7], [sh.x + sh.w + 14 - i * 4, sh.y + 4 - i * 7]].map(([x, y]) => [x, y]) as [number, number][]);
    ctx.strokeStyle = INK;
    line(ctx, [[sh.doorX - 12, base], [sh.doorX - 12, sh.y + 22], [sh.doorX + 12, sh.y + 22], [sh.doorX + 12, base]]);
    ctx.strokeRect(sh.x + 14, sh.y + 8, 52, 12);
    ctx.font = "600 7px ui-sans-serif, system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillStyle = INK;
    ctx.fillText("CHAYA KADA", sh.x + 40, sh.y + 16.5);
    line(ctx, [[sh.x + 8, sh.y + 46], [sh.x + 66, sh.y + 46]]);
    for (let i = 0; i < 3; i++) {
      const gx = sh.x + 20 + i * 14;
      line(ctx, [[gx - 2, sh.y + 39], [gx - 1.5, sh.y + 46], [gx + 1.5, sh.y + 46], [gx + 2, sh.y + 39]]);
      // Steam, a boiling wisp.
      ctx.strokeStyle = FAINT;
      ctx.beginPath();
      ctx.moveTo(gx, sh.y + 37);
      for (let k = 1; k <= 4; k++) ctx.lineTo(gx + boil(i * 10 + k, f.t, 1.6, 6), sh.y + 37 - k * 3.5);
      ctx.stroke();
      ctx.strokeStyle = INK;
    }

    // Palms.
    ctx.strokeStyle = INK;
    for (const p of LAYOUT.palms) palm(ctx, p.x, p.baseY, p.h, p.lean, f.t);

    // Sign post.
    line(ctx, [[LAYOUT.sign.x, LAYOUT.sign.y + 40], [LAYOUT.sign.x, LAYOUT.sign.y]]);
    ctx.strokeRect(LAYOUT.sign.x - 30, LAYOUT.sign.y - 12, 60, 14);
    ctx.font = "600 8px ui-sans-serif, system-ui, sans-serif";
    ctx.fillText(LAYOUT.sign.text, LAYOUT.sign.x, LAYOUT.sign.y - 2);

    // Lamp row: outline lamps; lit ones get a small flame.
    const L = LAYOUT.lamps;
    for (let i = 0; i < L.count; i++) {
      const x = L.x0 + i * L.dx;
      line(ctx, [[x, L.y + 22], [x, L.y]]);
      line(ctx, [[x - 6, L.y + 22], [x + 6, L.y + 22]]);
      line(ctx, [[x - 5, L.y], [x + 5, L.y]]);
      const lit = Math.max(0, Math.min(1, f.lampsLit - i));
      if (lit > 0) {
        const fl = 1 + boil(i, f.t, 0.25, 12);
        ctx.globalAlpha = lit;
        ctx.beginPath();
        ctx.moveTo(x - 2, L.y - 1);
        ctx.quadraticCurveTo(x, L.y - 9 * fl, x + 2, L.y - 1);
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
    }

    // Villagers and their labels.
    for (const v of f.villagers) villager(ctx, v);
    for (const v of f.villagers) label(ctx, v, f);

    // Progress hairline for the working task.
    ctx.strokeStyle = FAINT;
    line(ctx, [[20, 356], [W - 20, 356]]);
    ctx.strokeStyle = STATUS_COLOR.working;
    line(ctx, [[20, 356], [20 + (W - 40) * f.progress, 356]]);
  },
};
