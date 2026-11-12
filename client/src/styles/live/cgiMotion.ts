/**
 * CGI Motion, live village version. A cinematic CGI night: rim-lit,
 * smooth-shaded villagers on wet reflective ground, slanted moonbeams,
 * status rings pulsing out on the floor, holographic code panels around
 * working villagers, and a softly defocused far bank that tiles (with a
 * little parallax) across any world width.
 *
 * Static scenery is cached once: tiles for the far bank (blurred), the wet
 * ground and the light shafts; one sprite per building (with the project
 * name), palm size, sign and lamp stand. Per frame only moving parts draw.
 */
import { hash } from "../scene";
import {
  FAR_H, HIGH_H, RIM, TILE_W, buildingSprite, drawSprite, drawVillager, getLampSprite, getSignSprite, getTiles, glow, headTop, holoPanel, palmSprite, rgbOf, rgba,
} from "./cgiMotionKit";
import { GROUND, WORLD_H, type LiveFrame, type LiveStyle, type LiveVillager, type ViewRect } from "./types";

const FAR_PARALLAX = 0.35;

function rimFor(v: LiveVillager, pulse: number) {
  if (v.urgent) return `rgba(255,110,100,${0.55 + 0.4 * pulse})`;
  switch (v.status) {
    case "finished": return "rgba(190,255,140,0.75)";
    case "error": return "rgba(255,120,120,0.8)";
    case "turn": return "rgba(255,210,130,0.75)";
    case "idle": return RIM + "0.4)";
    default: return RIM + "0.8)";
  }
}

function rings(ctx: CanvasRenderingContext2D, v: LiveVillager, f: LiveFrame, t: number) {
  const col = v.color;
  const calm = v.status === "idle";
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  ctx.globalAlpha = v.alpha * (v.urgent ? 0.5 + 0.5 * f.pulse : calm ? 0.3 : 0.6);
  ctx.drawImage(glow(col), v.x - 26, v.y - 8, 52, 16);
  ctx.strokeStyle = col;
  if (!calm) {
    const speed = v.urgent ? 1.2 : v.status === "working" ? 0.55 : 0.4;
    for (let k = 0; k < 3; k++) {
      const ph = f.reducedMotion ? (k + 1) / 4 : (t * speed + k / 3) % 1;
      const r = 7 + ph * (v.urgent ? 30 : 24);
      ctx.globalAlpha = v.alpha * (1 - ph) * (v.urgent ? 0.95 : 0.7);
      ctx.lineWidth = 1.3 - ph * 0.6;
      ctx.beginPath();
      ctx.ellipse(v.x, v.y, r, r * 0.26, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
  ctx.globalAlpha = v.alpha * (calm ? 0.45 : 0.9);
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  ctx.ellipse(v.x, v.y, 9, 2.4, 0, 0, Math.PI * 2);
  ctx.stroke();
  // Selection / hover: a bright white ring.
  if (v.selected || v.hovered) {
    ctx.globalAlpha = v.selected ? 0.95 : 0.5;
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = v.selected ? 1.3 : 0.8;
    ctx.beginPath();
    ctx.ellipse(v.x, v.y + 0.5, 17, 4.6, 0, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
}

function spotlight(ctx: CanvasRenderingContext2D, v: LiveVillager, top: number) {
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  const g = ctx.createLinearGradient(0, top, 0, v.y + 6);
  g.addColorStop(0, "rgba(200,250,255,0)");
  g.addColorStop(1, "rgba(200,250,255,0.13)");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(v.x - 8, top);
  ctx.lineTo(v.x + 8, top);
  ctx.lineTo(v.x + 24, v.y + 5);
  ctx.lineTo(v.x - 24, v.y + 5);
  ctx.closePath();
  ctx.fill();
  ctx.globalAlpha = 0.5;
  ctx.drawImage(glow("#c8faff"), v.x - 30, v.y - 9, 60, 18);
  ctx.restore();
}

function helpers(ctx: CanvasRenderingContext2D, v: LiveVillager, t: number) {
  const n = Math.min(3, v.helpers);
  const cy = v.y - 44 - v.jump * 26;
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  for (let i = 0; i < n; i++) {
    const a = t * 1.6 + (i / n) * Math.PI * 2;
    const x = v.x + Math.cos(a) * 15, y = cy + Math.sin(a) * 4;
    ctx.globalAlpha = v.alpha * (Math.sin(a) > 0 ? 0.9 : 0.55);
    ctx.drawImage(glow("#9be8ff"), x - 4, y - 4, 8, 8);
    ctx.fillStyle = "rgba(230,252,255,0.95)";
    ctx.fillRect(x - 0.7, y - 0.7, 1.4, 1.4);
  }
  ctx.restore();
  if (v.helpers > 3) {
    ctx.font = "700 6px ui-sans-serif, system-ui, sans-serif";
    ctx.textAlign = "left";
    ctx.fillStyle = "rgba(190,240,255,0.9)";
    ctx.fillText(`+${v.helpers - 3}`, v.x + 18, cy + 2);
  }
}

function label(ctx: CanvasRenderingContext2D, v: LiveVillager, f: LiveFrame) {
  const urgent = v.urgent;
  const crgb = rgbOf(v.color);
  const calm = v.status === "idle";
  const x = v.labelX, y = v.labelY;
  ctx.save();
  ctx.globalAlpha = v.alpha * (calm && !v.selected ? 0.75 : 1);

  // Name row in the status colour.
  ctx.font = "700 7.5px ui-sans-serif, system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.lineJoin = "round";
  ctx.strokeStyle = "rgba(2,10,14,0.85)";
  ctx.lineWidth = 2.4;
  ctx.strokeText(v.name, x, y + 7);
  ctx.fillStyle = v.selected ? "#ffffff" : rgba(crgb, 0.98);
  ctx.fillText(v.name, x, y + 7);

  // Action pill.
  ctx.font = "500 8.5px ui-sans-serif, system-ui, sans-serif";
  const text = urgent ? "! " + v.label : v.label;
  const tw = ctx.measureText(text).width;
  const extra = v.linked ? 6 : 0;
  const pw = tw + 12 + extra, ph = 13, px = x - pw / 2, py = y + 10;
  ctx.save();
  if (urgent) {
    ctx.shadowColor = v.color;
    ctx.shadowBlur = 6 + 8 * f.pulse;
  }
  ctx.fillStyle = urgent ? `rgba(70,10,10,${0.72 + 0.2 * f.pulse})` : v.selected ? "rgba(8,34,42,0.92)" : "rgba(4,18,24,0.8)";
  ctx.beginPath();
  ctx.roundRect(px, py, pw, ph, 6.5);
  ctx.fill();
  ctx.restore();
  ctx.strokeStyle = v.selected ? "rgba(255,255,255,0.95)" : rgba(crgb, urgent ? 0.5 + 0.5 * f.pulse : 0.65);
  ctx.lineWidth = urgent || v.selected ? 1 : 0.7;
  ctx.beginPath();
  ctx.roundRect(px, py, pw, ph, 6.5);
  ctx.stroke();
  ctx.fillStyle = "rgba(255,255,255,0.07)";
  ctx.fillRect(px + 5, py + 1, pw - 10, 4);
  ctx.fillStyle = urgent ? `rgba(255,${200 + 55 * f.pulse},${190 + 65 * f.pulse},1)` : "rgba(235,250,250,0.96)";
  ctx.fillText(text, x - extra / 2, py + 9.3);
  if (v.linked) {
    ctx.fillStyle = "#5eead4";
    ctx.beginPath();
    ctx.arc(px + pw - 6.5, py + ph / 2, 1.6, 0, Math.PI * 2);
    ctx.fill();
  }

  // Leader down to the head when the label had to stack upwards.
  const head = headTop(v);
  if (head - (py + ph) > 3) {
    ctx.strokeStyle = rgba(crgb, urgent ? 0.3 + 0.6 * f.pulse : 0.45);
    ctx.lineWidth = 0.7;
    ctx.beginPath();
    ctx.moveTo(x, py + ph);
    ctx.lineTo(v.x, head - 2);
    ctx.stroke();
  }
  ctx.restore();
}

function canoe(ctx: CanvasRenderingContext2D, cx: number, t: number) {
  const cy = 178;
  const hull = () => {
    const g = ctx.createLinearGradient(0, cy - 3, 0, cy + 4);
    g.addColorStop(0, "#5a3a22");
    g.addColorStop(1, "#1b0f08");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(cx - 24, cy - 4);
    ctx.quadraticCurveTo(cx, cy + 7, cx + 24, cy - 4);
    ctx.lineTo(cx + 18, cy - 1);
    ctx.lineTo(cx - 18, cy - 1);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#0e1a1e";
    ctx.beginPath();
    ctx.ellipse(cx - 2, cy - 7, 3, 6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(cx - 2, cy - 15, 2.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#2a1c10";
    ctx.lineWidth = 1;
    const sw = Math.sin(t * 2) * 4;
    ctx.beginPath();
    ctx.moveTo(cx + 2 + sw * 0.3, cy - 14);
    ctx.lineTo(cx + 10 + sw, cy + 6);
    ctx.stroke();
  };
  ctx.save();
  ctx.translate(0, Math.sin(t * 1.7) * 0.6);
  ctx.save();
  ctx.globalAlpha = 0.28;
  ctx.translate(0, 2 * cy + 4);
  ctx.scale(1, -1);
  hull();
  ctx.restore();
  hull();
  ctx.strokeStyle = RIM + "0.75)";
  ctx.lineWidth = 0.7;
  ctx.beginPath();
  ctx.moveTo(cx - 18, cy - 1);
  ctx.lineTo(cx + 24, cy - 4);
  ctx.stroke();
  ctx.restore();
  ctx.strokeStyle = "rgba(160,235,250,0.3)";
  ctx.lineWidth = 0.6;
  for (let k = 1; k <= 3; k++) {
    ctx.beginPath();
    ctx.ellipse(cx - 20 - k * 7, cy + 3, 6 + k * 3, 1, 0, 0, Math.PI * 2);
    ctx.stroke();
  }
}

export const cgiMotionLive: LiveStyle = {
  id: "cgi-motion",
  name: "CGI Motion",
  blurb: "Cinematic CGI night: rim-lit villagers on wet reflective ground, light shafts, pulsing status rings and holographic code panels.",
  bg: "#04121a",
  draw(ctx, f, view: ViewRect) {
    const T = getTiles();
    const t = f.t;
    const ta = f.reducedMotion ? 0 : t; // ambient motion time
    const x0 = view.x, x1 = view.x + view.w;
    const inView = (x: number, pad = 120) => x > x0 - pad && x < x1 + pad;

    // Sky fill (covers above the world too), then the blurred far bank tiles with parallax.
    ctx.fillStyle = "#030a12";
    ctx.fillRect(x0 - 1, view.y - 1, view.w + 2, view.h + 2);
    const off = view.x * FAR_PARALLAX;
    for (let k = Math.floor((x0 - off) / TILE_W); k * TILE_W + off < x1; k++) {
      if (view.y < 0) ctx.drawImage(T.high, k * TILE_W + off, -HIGH_H, TILE_W + 0.5, HIGH_H + 1);
      ctx.drawImage(T.far, k * TILE_W + off, 0, TILE_W + 0.5, FAR_H);
    }

    // Moon, fixed on screen like a distant light, with its column on the water.
    const mx = x0 + view.w * 0.8, my = Math.min(54, view.y + view.h * 0.2);
    ctx.drawImage(T.moon, mx - 130, my - 130, 260, 260);
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.globalAlpha = 0.35;
    ctx.drawImage(glow("#a0ebfa"), mx - 30, GROUND.waterTop - 4, 60, GROUND.waterBottom - GROUND.waterTop + 8);
    // Water glints: a fixed set per 640-unit tile, drifting.
    const k0 = Math.floor(x0 / TILE_W), k1 = Math.floor(x1 / TILE_W);
    ctx.globalAlpha = 1;
    for (let k = k0; k <= k1; k++) {
      for (let i = 0; i < 22; i++) {
        const y = GROUND.waterTop + 4 + hash(i) * 40;
        const x = k * TILE_W + ((hash(i + 50) * TILE_W + ta * (6 + hash(i + 9) * 10)) % TILE_W);
        if (x < x0 - 20 || x > x1) continue;
        const nearMoon = Math.max(0, 1 - Math.abs(x - mx) / 90);
        const a = (0.08 + nearMoon * 0.45) * (0.5 + 0.5 * Math.sin(ta * 2 + i));
        ctx.fillStyle = `rgba(170,240,255,${a})`;
        ctx.fillRect(x, y, 6 + hash(i + 3) * 10, 0.7);
      }
    }
    ctx.restore();
    if (inView(f.canoeX, 40)) canoe(ctx, f.canoeX, t);

    // Wet ground tiles, and deep ground below the world.
    for (let k = k0; k * TILE_W < x1; k++) {
      ctx.drawImage(T.ground, k * TILE_W, 0, TILE_W + 0.5, WORLD_H);
    }
    if (view.y + view.h > WORLD_H) {
      ctx.fillStyle = "#040e12";
      ctx.fillRect(x0 - 1, WORLD_H - 0.5, view.w + 2, view.y + view.h - WORLD_H + 1);
    }

    // Volumetric moonbeams, slowly breathing.
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.globalAlpha = 0.75 + 0.25 * Math.sin(ta * 0.7);
    for (let k = k0; k * TILE_W < x1; k++) ctx.drawImage(T.shafts, k * TILE_W, 0, TILE_W + 0.5, WORLD_H);
    ctx.restore();

    // Places: one building per project, its name on the board.
    for (const p of f.places) {
      const b = p.building;
      if (b.x + b.w + 60 < x0 || b.x - 60 > x1) continue;
      drawSprite(ctx, buildingSprite(p), b.x, b.baseY);
      // Counter steam.
      ctx.strokeStyle = "rgba(255,230,200,0.2)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let i = 0; i < 3; i++) {
        const gx = b.x + 16 + i * 11, gy = b.baseY - b.wallH + 40;
        ctx.moveTo(gx, gy);
        for (let k = 1; k <= 4; k++) ctx.lineTo(gx + Math.sin(ta * 2.4 + k + i * 2) * 1.6, gy - k * 3.2);
      }
      ctx.stroke();
      // Someone here needs the person: the board and roof edge pulse red.
      if (p.urgent > 0) {
        const top = b.baseY - b.wallH;
        ctx.save();
        ctx.globalCompositeOperation = "lighter";
        ctx.globalAlpha = 0.25 + 0.45 * f.pulse;
        ctx.drawImage(glow("#ff5a4f"), b.x - 10, top - 12, b.w + 20, 40);
        ctx.restore();
        ctx.strokeStyle = `rgba(255,90,79,${0.5 + 0.5 * f.pulse})`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.roundRect(b.x + 10, top + 6, b.w - 20, 14, 2.5);
        ctx.stroke();
      }
    }

    // Palms.
    for (const p of f.palms) if (inView(p.x, 100)) drawSprite(ctx, palmSprite(p.h, p.lean), p.x, p.baseY);

    // Village sign.
    if (inView(f.sign.x, 60)) drawSprite(ctx, getSignSprite(f.sign.text), f.sign.x, f.sign.y);

    // Lamp row: one lit lamp per finished session today.
    const L = f.lamps;
    if (inView(L.x0, 40) || inView(L.x0 + L.dx * L.count, 40)) {
      const ls = getLampSprite();
      for (let i = 0; i < L.count; i++) drawSprite(ctx, ls, L.x0 + i * L.dx, L.y);
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      for (let i = 0; i < Math.min(L.count, L.lit); i++) {
        const x = L.x0 + i * L.dx, y = L.y;
        const fl = 1 + Math.sin(ta * 13 + i * 2.1) * 0.08 + Math.sin(ta * 7.3 + i) * 0.06;
        ctx.globalAlpha = 0.75;
        ctx.drawImage(glow("#ffb050"), x - 22, y - 26, 44, 44);
        ctx.globalAlpha = 0.35;
        ctx.drawImage(glow("#ff9a3a"), x - 5, y + 24, 10, 46);
        ctx.globalAlpha = 1;
        const fg = ctx.createLinearGradient(0, y - 10 * fl, 0, y);
        fg.addColorStop(0, "rgba(255,240,180,0)");
        fg.addColorStop(0.4, "rgba(255,220,140,1)");
        fg.addColorStop(1, "rgba(255,120,40,1)");
        ctx.fillStyle = fg;
        ctx.beginPath();
        ctx.moveTo(x - 2.2, y - 0.5);
        ctx.quadraticCurveTo(x - 1.5, y - 6 * fl, x + Math.sin(ta * 5 + i) * 0.8, y - 10 * fl);
        ctx.quadraticCurveTo(x + 1.5, y - 6 * fl, x + 2.2, y - 0.5);
        ctx.fill();
      }
      ctx.restore();
    }

    // Villagers in view.
    const vis = f.villagers.filter((v) => v.alpha > 0.01 && inView(v.x, 50));
    const reflect = vis.length <= 18; // keep the cost bounded in crowds
    for (const v of vis) rings(ctx, v, f, t);
    for (const v of vis) if (v.selected) spotlight(ctx, v, view.y);
    for (const v of vis) {
      const rim = rimFor(v, f.pulse);
      if (reflect) {
        ctx.save();
        ctx.translate(0, 2 * v.y + 1);
        ctx.scale(1, -1);
        drawVillager(ctx, v, t, rim, v.alpha * 0.2);
        ctx.restore();
      }
      ctx.fillStyle = `rgba(0,0,0,${(0.55 - v.jump * 0.3) * v.alpha})`;
      ctx.beginPath();
      ctx.ellipse(v.x, v.y, 9 - v.jump * 3, 2.2 - v.jump * 0.6, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    for (const v of vis) {
      drawVillager(ctx, v, t, rimFor(v, f.pulse), v.alpha);
      if (v.helpers > 0) helpers(ctx, v, ta);
    }

    // Holo panels: the selected villager if working, else up to two working ones.
    const sel = vis.find((v) => v.selected && v.status === "working");
    const holo = sel ? [sel] : vis.filter((v) => v.status === "working").slice(0, 2);
    for (const v of holo) {
      const seed = hash(v.id.length + v.id.charCodeAt(v.id.length - 1));
      const fy = v.y - 60 + Math.sin(ta * 1.8 + seed * 6) * 1.5;
      const lx = v.x - 50, rx = v.x + 14;
      const file = (v.label.match(/[\w.-]+\.\w+/) ?? ["session"])[0];
      const meter = (ta * 0.08 + seed) % 1;
      ctx.save();
      ctx.globalAlpha = v.alpha;
      holoPanel(ctx, lx, fy, 36, 26, 0.08, ta, seed, "code", file, meter);
      holoPanel(ctx, rx, fy - 2, 34, 22, -0.08, ta, seed, "task", "", meter);
      ctx.restore();
    }

    // Dust motes drifting through the light (screen-space, cheap).
    if (!f.reducedMotion) {
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      for (let i = 0; i < 40; i++) {
        const x = x0 + ((hash(i * 1.3) * view.w + t * (2 + hash(i) * 5)) % view.w);
        const y = view.y + ((hash(i * 2.9) * view.h + t * (1.5 + hash(i + 4) * 3)) % view.h);
        ctx.fillStyle = `rgba(190,245,255,${0.1 + 0.22 * Math.abs(Math.sin(t * 0.9 + i))})`;
        ctx.fillRect(x, y, 0.9, 0.9);
      }
      ctx.restore();
    }

    // Labels on top, the selected one last (in front).
    for (const v of vis) if (!v.selected && inView(v.labelX, 120)) label(ctx, v, f);
    for (const v of vis) if (v.selected) label(ctx, v, f);

    // Vignette over the view.
    ctx.drawImage(T.vignette, x0 - 1, view.y - 1, view.w + 2, view.h + 2);

    // HUD (screen-fixed, top-right just under the top bar; the session list covers the bottom-left): sessions at work.
    const cssH = ctx.canvas.clientHeight || 720;
    const upp = view.h / cssH; // world units per CSS pixel
    ctx.save();
    const hw = 196;
    ctx.translate(x1 - (hw + 16) * upp, view.y + 78 * upp);
    ctx.scale(upp, upp);
    ctx.fillStyle = "rgba(4,18,24,0.72)";
    ctx.beginPath();
    ctx.roundRect(0, 0, hw, 22, 7);
    ctx.fill();
    ctx.strokeStyle = "rgba(94,234,212,0.45)";
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.font = "600 11px ui-sans-serif, system-ui, sans-serif";
    ctx.textAlign = "left";
    ctx.fillStyle = "rgba(200,255,248,0.92)";
    ctx.fillText(`AT WORK ${f.working} / ${f.total}`, 10, 15);
    const frac = f.total ? f.working / f.total : 0;
    ctx.fillStyle = "rgba(94,234,212,0.2)";
    ctx.fillRect(116, 9, 70, 4);
    ctx.shadowColor = "#5eead4";
    ctx.shadowBlur = 6;
    ctx.fillStyle = "#5eead4";
    ctx.fillRect(116, 9, 70 * frac, 4);
    ctx.restore();
  },
};
