/**
 * Turns the live snapshot (projects + sessions) into a LiveFrame every
 * animation frame: lays out places, walks villagers around, picks label
 * positions that don't overlap. Stateful (positions carry over between
 * frames); styles only draw what it returns.
 */
import type { CharacterPalette } from "@shared/character";
import type { ProjectView, SessionView } from "@shared/model";
import { hashString } from "@shared/placement";
import { statusText } from "@/lib/status";
import { CompanionTracker } from "./companions";
import {
  GROUND, LIVE_STATUS_COLOR, MARGIN, SLOT_W, WORLD_H,
  type LiveFrame, type LivePlace, type LiveStatus, type LiveVillager, type PlaceTheme,
} from "./types";

const SHIRTS = ["#f4efe2", "#c2410c", "#1d4ed8", "#15803d", "#7c3aed", "#be185d", "#0e7490", "#ca8a04", "#9f1239", "#334155"];
const MUNDUS = ["#f4efe2", "#fde68a", "#f4efe2", "#e2e8f0", "#fef3c7", "#d6d3d1"];
const SKINS = ["#8a5a3c", "#a0694a", "#6b4430", "#7a4b32", "#b07a55", "#5c3a28"];
const HAIRS = ["#1c1917", "#292524", "#3f2a1d", "#111827", "#44403c"];

const WALK_SPEED = 46;
const HOP_SECONDS = 8;
const LABEL_H = 26;

/** Deterministic 0..1 from a string + salt. */
function rand(id: string, salt: number) {
  const h = hashString(`${id}#${salt}`);
  return (h % 10000) / 10000;
}

interface Walker {
  x: number;
  y: number;
  tx: number;
  facing: 1 | -1;
  pauseLeft: number;
  phase: number;
  bornT: number;
  hops: number;
  labelY: number;
  lastStatus: LiveStatus;
  finishedAtT: number | null;
  step: number;
}

export interface SimInput {
  sessions: SessionView[];
  projects: ProjectView[];
  selectedId: string | null;
  hoveredId: string | null;
  reducedMotion: boolean;
  /** The place to draw (the chosen world's setting); Kerala when not given. */
  theme?: PlaceTheme;
  /** Colours of the character chosen for a session's project, if any (else colours come from the session id). */
  paletteOf?: (s: SessionView) => CharacterPalette | undefined;
}

function liveStatus(s: SessionView): LiveStatus {
  if (s.status === "waiting") return s.waitingReason === "turn_end" || !s.waitingReason ? "turn" : "approval";
  if (s.status === "working") return "working";
  if (s.status === "finished") return "finished";
  if (s.status === "error") return "error";
  return "idle";
}

function liveLabel(s: SessionView, st: LiveStatus): string {
  const approval = s.link?.approval?.label;
  if (st === "working") return s.action?.label ?? "Working";
  if (st === "approval") {
    const what = approval ?? (s.action && s.action.kind !== "waiting" ? s.action.label : undefined);
    return what ? `${statusText(s)} · ${what}` : statusText(s);
  }
  if (st === "finished") return "Done ✓";
  return statusText(s);
}

const short = (t: string, n = 24) => (t.length > n ? `${t.slice(0, n - 1)}…` : t);

export class LiveSim {
  private t = 0;
  private walkers = new Map<string, Walker>();
  /** Sessions seen finishing while this view was open (they light the lamps). */
  private finished = new Set<string>();
  private companions = new CompanionTracker();

  frame(dt: number, input: SimInput): LiveFrame {
    this.t += dt;
    const t = this.t;
    const { sessions, projects } = input;

    // Places: projects that have sessions, in a stable order.
    const byProject = new Map<string, SessionView[]>();
    for (const s of sessions) {
      const list = byProject.get(s.projectId) ?? [];
      list.push(s);
      byProject.set(s.projectId, list);
    }
    const placed = projects.filter((p) => byProject.has(p.id)).sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
    // Sessions whose project isn't in the list still need a home.
    for (const id of byProject.keys()) if (!placed.some((p) => p.id === id)) placed.push({ id, name: id.split(/[\\/]/).pop() || "project", root: id });

    const n = placed.length;
    const worldW = Math.max(640, MARGIN * 2 + SLOT_W * n);
    const places: LivePlace[] = placed.map((p, i) => {
      const cx = MARGIN + SLOT_W * (i + 0.5);
      const list = byProject.get(p.id) ?? [];
      const bx = cx - 112;
      return {
        id: p.id,
        name: short(p.name, 18),
        x: cx,
        w: SLOT_W,
        building: { x: bx, w: 150, baseY: 270, wallH: 74, roofH: 38, doorX: bx + 92 },
        variant: hashString(p.id) % 4,
        sessions: list.length,
        urgent: list.filter((s) => liveStatus(s) === "approval").length,
      };
    });

    // Villagers.
    const villagers: LiveVillager[] = [];
    const live = new Set<string>();
    places.forEach((place) => {
      const list = (byProject.get(place.id) ?? []).slice().sort((a, b) => a.startedAt - b.startedAt || a.id.localeCompare(b.id));
      list.forEach((s, j) => {
        live.add(s.id);
        const status = liveStatus(s);
        const spotX = place.x - 30 + [40, 92, -6, 128, 64, 14, 110, -40][j % 8]! + Math.floor(j / 8) * 9;
        const spotY = GROUND.pathTop + 14 + ((j * 17) % 46);
        let w = this.walkers.get(s.id);
        if (!w) {
          w = { x: place.building.doorX, y: spotY, tx: spotX, facing: 1, pauseLeft: 0, phase: rand(s.id, 1), bornT: t, hops: 0, labelY: spotY - 100, lastStatus: status, finishedAtT: null, step: 0 };
          this.walkers.set(s.id, w);
        }
        w.y += (spotY - w.y) * Math.min(1, dt * 3);
        if (status !== w.lastStatus) {
          if (status === "finished") w.finishedAtT = t;
          w.lastStatus = status;
          w.pauseLeft = 0;
        }
        if (status === "finished") this.finished.add(s.id);

        // Movement: workers wander around their place; everyone else goes to their spot.
        const lo = place.x - 104;
        const hi = place.x + 112;
        if (status === "working" && !input.reducedMotion) {
          if (Math.abs(w.tx - w.x) < 1) {
            if (w.pauseLeft <= 0) w.pauseLeft = 0.6 + rand(s.id, ++w.step) * 1.4;
            w.pauseLeft -= dt;
            if (w.pauseLeft <= 0) w.tx = lo + rand(s.id, ++w.step + 99) * (hi - lo);
          }
        } else {
          w.tx = spotX;
        }
        const dx = w.tx - w.x;
        const moving = Math.abs(dx) > 0.8;
        if (moving) {
          const stepLen = Math.min(Math.abs(dx), WALK_SPEED * dt);
          w.x += Math.sign(dx) * stepLen;
          w.facing = dx > 0 ? 1 : -1;
          w.phase = (w.phase + (stepLen / WALK_SPEED) * 1.6) % 1;
        } else if (status !== "working") {
          // Stand facing the place's door (or the camera side for urgent ones).
          w.facing = place.building.doorX < w.x ? -1 : 1;
        }

        let jump = 0;
        if (status === "finished" && w.finishedAtT !== null && t - w.finishedAtT < HOP_SECONDS && !input.reducedMotion) {
          const hop = (t - w.finishedAtT) % 2.4;
          jump = hop < 0.9 ? Math.abs(Math.sin((hop / 0.9) * Math.PI * 2)) : 0;
        }

        const h = hashString(s.id);
        const pal = input.paletteOf?.(s);
        villagers.push({
          id: s.id,
          projectId: place.id,
          name: short(s.title),
          status,
          color: LIVE_STATUS_COLOR[status],
          label: short(liveLabel(s, status), 34),
          urgent: status === "approval",
          x: w.x,
          y: w.y,
          facing: w.facing,
          moving,
          phase: w.phase,
          jump,
          labelX: w.x,
          labelY: w.labelY,
          shirt: pal?.shirt ?? SHIRTS[h % SHIRTS.length]!,
          mundu: pal?.lower ?? MUNDUS[(h >>> 4) % MUNDUS.length]!,
          skin: pal?.skin ?? SKINS[(h >>> 8) % SKINS.length]!,
          hair: pal?.hair ?? HAIRS[(h >>> 12) % HAIRS.length]!,
          carry: status === "working" ? "laptop" : status === "approval" || status === "turn" ? "glass" : undefined,
          linked: !!s.link?.connected,
          helpers: s.subagents.filter((a) => a.status === "working" || a.status === "waiting").length,
          companions: this.companions.frame(s, w, t, input.reducedMotion, { min: 40, max: worldW - 40 }),
          selected: s.id === input.selectedId,
          hovered: s.id === input.hoveredId,
          alpha: Math.min(1, (t - w.bornT) / 0.6),
        });
      });
    });
    for (const id of [...this.walkers.keys()]) if (!live.has(id)) this.walkers.delete(id);
    this.companions.prune(live);

    this.layoutLabels(villagers, dt);
    villagers.sort((a, b) => a.y - b.y || a.x - b.x);

    const palms: LiveFrame["palms"] = [];
    for (let i = 0; i <= n; i++) {
      const x = MARGIN + SLOT_W * i + (i === 0 ? -50 : i === n ? 40 : 0);
      const salt = `palm${i}`;
      palms.push({ x, baseY: 212 + Math.round(rand(salt, 1) * 40), h: 118 + rand(salt, 2) * 36, lean: (rand(salt, 3) - 0.5) * 0.26 });
    }
    if (n === 0) palms.push({ x: 300, baseY: 214, h: 120, lean: 0.1 }, { x: 600, baseY: 236, h: 140, lean: -0.08 });
    const farPalms: number[] = [];
    for (let x = 60; x < worldW; x += 70 + (hashString(`fp${x}`) % 60)) farPalms.push(x);

    const working = villagers.filter((v) => v.status === "working").length;
    return {
      t,
      theme: input.theme ?? "kerala",
      worldW,
      worldH: WORLD_H,
      places,
      villagers,
      palms,
      farPalms,
      sign: { x: 72, y: 226, text: "AI GRAMAM" },
      lamps: { x0: worldW - MARGIN + 30, dx: 22, y: 250, count: 5, lit: Math.min(5, this.finished.size) },
      canoeX: ((t * 14) % (worldW + 160)) - 80,
      pulse: 0.5 + 0.5 * Math.sin(t * Math.PI * 2 * 1.2),
      drift: t * 6,
      working,
      total: villagers.length,
      reducedMotion: input.reducedMotion,
    };
  }

  /** Stack labels upwards where they would overlap; ease towards the target so they don't jump. */
  private layoutLabels(vs: LiveVillager[], dt: number) {
    const placed: { x0: number; x1: number; y: number }[] = [];
    const order = vs.slice().sort((a, b) => (b.urgent ? 1 : 0) - (a.urgent ? 1 : 0) || (b.selected ? 1 : 0) - (a.selected ? 1 : 0) || a.x - b.x);
    for (const v of order) {
      const width = Math.max(v.name.length * 5.4, v.label.length * 5.8) + 18;
      const x0 = v.x - width / 2;
      const x1 = v.x + width / 2;
      let y = v.y - 72 - 16 - v.jump * 26;
      for (let k = 0; k < 6; k++) {
        const hit = placed.find((p) => x0 < p.x1 && x1 > p.x0 && Math.abs(p.y - y) < LABEL_H + 2);
        if (!hit) break;
        y = hit.y - LABEL_H - 3;
      }
      placed.push({ x0, x1, y });
      const w = this.walkers.get(v.id)!;
      const target = y;
      w.labelY = Math.abs(w.labelY - target) > 60 ? target : w.labelY + (target - w.labelY) * Math.min(1, dt * 8);
      v.labelY = Math.max(14, w.labelY);
    }
  }
}
