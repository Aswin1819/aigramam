/**
 * A plain reference renderer for the live village: shows how to read every
 * field of a LiveFrame (places, villagers, labels, palms, sign, lamps,
 * canoe, selection). Live styles start from their prototype's look and
 * follow this structure. Also used as a placeholder while a style is ported.
 */
import { BODY, poseOf, type VillagerFrame } from "../scene";
import { GROUND, type LiveFrame, type LiveStyle, type LiveVillager, type ViewRect } from "./types";

/** The prototypes' skeleton() works on a VillagerFrame; a LiveVillager has every field it needs. */
export function asVillagerFrame(v: LiveVillager): VillagerFrame {
  return {
    id: v.id, name: v.name, status: v.status === "working" ? "working" : v.status === "finished" ? "finished" : "waiting",
    x: v.x, y: v.y, facing: v.facing, moving: v.moving, phase: v.phase, jump: v.jump, label: v.label,
    shirt: v.shirt, mundu: v.mundu, skin: v.skin, carry: v.carry,
  };
}

export function drawReference(ctx: CanvasRenderingContext2D, f: LiveFrame, view: ViewRect) {
  // 1. Background: always cover the whole visible rect (it can be wider than the world).
  ctx.fillStyle = "#1b2a4a";
  ctx.fillRect(view.x, view.y, view.w, view.h);
  ctx.fillStyle = "#24507a";
  ctx.fillRect(view.x, GROUND.waterTop, view.w, GROUND.waterBottom - GROUND.waterTop);
  ctx.fillStyle = "#2f4a2c";
  ctx.fillRect(view.x, GROUND.groundY, view.w, view.y + view.h - GROUND.groundY);
  ctx.fillStyle = "#6b4a33";
  ctx.fillRect(view.x, GROUND.pathTop, view.w, GROUND.pathBottom - GROUND.pathTop);

  // 2. Cull: only draw what's in view (+ margin).
  const inView = (x: number, pad = 120) => x > view.x - pad && x < view.x + view.w + pad;

  // 3. Canoe, palms, sign, lamps.
  if (inView(f.canoeX)) { ctx.fillStyle = "#3b2a1a"; ctx.fillRect(f.canoeX - 22, 176, 44, 6); }
  ctx.strokeStyle = "#7a5a3a";
  ctx.lineWidth = 4;
  for (const p of f.palms) if (inView(p.x)) { ctx.beginPath(); ctx.moveTo(p.x, p.baseY); ctx.lineTo(p.x + p.lean * p.h, p.baseY - p.h); ctx.stroke(); }
  ctx.fillStyle = "#e8d9b5";
  ctx.fillRect(f.sign.x - 30, f.sign.y - 12, 60, 14);
  ctx.fillStyle = "#222";
  ctx.font = "600 8px system-ui";
  ctx.textAlign = "center";
  ctx.fillText(f.sign.text, f.sign.x, f.sign.y - 2);
  for (let i = 0; i < f.lamps.count; i++) {
    const x = f.lamps.x0 + i * f.lamps.dx;
    ctx.fillStyle = i < f.lamps.lit ? "#fbbf24" : "#6b5a3a";
    ctx.fillRect(x - 2, f.lamps.y, 4, 20);
  }

  // 4. Places: building + the project's name on its sign; urgent places get a marker.
  for (const p of f.places) {
    if (!inView(p.x, SLOT_PAD)) continue;
    const b = p.building;
    ctx.fillStyle = ["#c2410c", "#b45309", "#9a3412", "#a16207"][p.variant]!;
    ctx.fillRect(b.x, b.baseY - b.wallH, b.w, b.wallH);
    ctx.fillStyle = "#7f1d1d";
    ctx.beginPath(); ctx.moveTo(b.x - 12, b.baseY - b.wallH); ctx.lineTo(b.x + b.w / 2, b.baseY - b.wallH - b.roofH); ctx.lineTo(b.x + b.w + 12, b.baseY - b.wallH); ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.font = "600 9px system-ui";
    ctx.fillText(p.name, b.x + b.w / 2, b.baseY - b.wallH + 14);
  }

  // 5. Villagers back-to-front, then labels on top.
  for (const v of f.villagers) {
    if (!inView(v.x, 40)) continue;
    ctx.globalAlpha = v.alpha;
    const pose = poseOf(asVillagerFrame(v));
    if (v.selected) { ctx.strokeStyle = "#fff"; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.ellipse(v.x, v.y + 2, 16, 5, 0, 0, Math.PI * 2); ctx.stroke(); }
    ctx.fillStyle = v.mundu;
    ctx.fillRect(v.x - 5, v.y - BODY.thigh - BODY.shin + pose.bob, 10, BODY.thigh + BODY.shin);
    ctx.fillStyle = v.shirt;
    ctx.fillRect(v.x - 6, v.y - BODY.height + 12 + pose.bob, 12, BODY.torso);
    ctx.fillStyle = v.skin;
    ctx.beginPath(); ctx.arc(v.x, v.y - BODY.height + 6 + pose.bob, 7, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1;
  }
  for (const v of f.villagers) {
    if (!inView(v.labelX, 120)) continue;
    ctx.globalAlpha = v.alpha;
    ctx.font = "600 9px system-ui";
    ctx.fillStyle = "rgba(255,255,255,0.7)";
    ctx.fillText(v.name, v.labelX, v.labelY + 9);
    ctx.font = "500 10px system-ui";
    ctx.fillStyle = v.urgent ? `rgba(255,90,79,${0.6 + 0.4 * f.pulse})` : v.color;
    ctx.fillText(v.label, v.labelX, v.labelY + 22);
    ctx.globalAlpha = 1;
  }
}
const SLOT_PAD = 160;

/** Placeholder until the real port lands. */
export function placeholder(id: string, name: string, bg: string): LiveStyle {
  return { id, name, blurb: "", bg, lighting: "day", draw: drawReference };
}
