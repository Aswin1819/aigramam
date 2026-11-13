/**
 * Turns the live snapshot (projects + sessions) into a LiveFrame every
 * animation frame: lays out places (each project keeps its place), puts each
 * villager at the station for what it's doing (shared/stations.ts: they walk
 * only when that changes), picks label positions that don't overlap. Stateful (positions carry over between
 * frames); styles only draw what it returns.
 */
import type { CharacterPalette } from "@shared/character";
import type { ProjectView, SessionView } from "@shared/model";
import { hashString } from "@shared/placement";
import { PlaceKeeper, StationKeeper, stationIndexes, stationSpot, wantedStation, type Station } from "@shared/stations";
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
  /** The project open in the app, if any: its place gets `selected: true`. */
  selectedProjectId?: string | null;
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
  /** Projects keep their place in order of arrival, and for a while after their last session ends. */
  private placeKeeper = new PlaceKeeper();
  private stationKeeper = new StationKeeper();
  private names = new Map<string, string>();
  /** Station props' fade (key "place|station"). */
  private propFade = new Map<string, { x: number; y: number; placeId: string; station: Station; alpha: number; used: boolean }>();

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
    for (const p of projects) this.names.set(p.id, p.name);
    const nowMs = Date.now();
    this.placeKeeper.assign([...byProject.keys()], 256, nowMs, () => 0);
    const placed = this.placeKeeper.held().map(({ id }) => ({ id, name: this.names.get(id) ?? (id.split(/[\\/]/).pop() || "project"), root: id }));

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
        selected: !!input.selectedProjectId && p.id === input.selectedProjectId,
      };
    });

    // Villagers.
    const villagers: LiveVillager[] = [];
    const live = new Set<string>();
    places.forEach((place) => {
      const list = (byProject.get(place.id) ?? []).slice().sort((a, b) => a.startedAt - b.startedAt || a.id.localeCompare(b.id));
      // Each villager stands at the station for what it's doing, in its own place's yard.
      const plot = { x: place.x, y: GROUND.pathTop + 16, w: SLOT_W - 24 };
      const stations = list.map((s) => ({ id: s.id, startedAt: s.startedAt, station: this.stationKeeper.stationOf(s.id, wantedStation(s), nowMs) }));
      const stationOf = new Map(stations.map((x) => [x.id, x.station] as const));
      const index = stationIndexes(stations);
      for (const st of new Set(stations.map((x) => x.station))) {
        const at = stationSpot(plot, st, 0);
        const key = `${place.id}|${st}`;
        const pf = this.propFade.get(key) ?? { ...at, placeId: place.id, station: st, alpha: 0, used: true };
        Object.assign(pf, at, { used: true });
        this.propFade.set(key, pf);
      }
      list.forEach((s) => {
        live.add(s.id);
        const status = liveStatus(s);
        const station: Station = stationOf.get(s.id) ?? "desk";
        const spot = stationSpot(plot, station, index.get(s.id) ?? 0);
        const spotX = spot.x;
        const spotY = spot.y;
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

        // Movement: only to the station (no wandering), so walking always means a change of activity.
        w.tx = spotX;
        const dx = w.tx - w.x;
        const moving = Math.abs(dx) > 0.8;
        if (moving) {
          const stepLen = Math.min(Math.abs(dx), WALK_SPEED * dt);
          w.x += Math.sign(dx) * stepLen;
          w.facing = dx > 0 ? 1 : -1;
          w.phase = (w.phase + (stepLen / WALK_SPEED) * 1.6) % 1;
        } else {
          // At work, face the place; asking for you, face the viewer's side of the yard's centre.
          w.facing = station === "porch" ? (w.x < place.x ? 1 : -1) : place.building.doorX < w.x ? -1 : 1;
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
          label: short(status === "working" && s.action?.emoji ? `${s.action.emoji} ${liveLabel(s, status)}` : liveLabel(s, status), 34),
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
          carry: status === "working" && (station === "desk" || station === "works") ? "laptop" : status === "approval" || status === "turn" ? "glass" : undefined,
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
    this.stationKeeper.prune(live);
    // Props fade in over ~0.4 s while used, out over ~1 s after.
    const stationsOut: LiveFrame["stations"] = [];
    for (const [key, pf] of this.propFade) {
      pf.alpha = input.reducedMotion ? (pf.used ? 1 : 0) : Math.max(0, Math.min(1, pf.alpha + (pf.used ? dt * 2.5 : -dt)));
      if (!pf.used && pf.alpha <= 0) this.propFade.delete(key);
      else stationsOut.push({ placeId: pf.placeId, station: pf.station, x: pf.x, y: pf.y, alpha: pf.alpha });
      pf.used = false;
    }
    stationsOut.sort((a, b) => a.y - b.y || a.x - b.x);
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
      stations: stationsOut,
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
