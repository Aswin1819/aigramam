/**
 * Generic world renderer: everything visual comes from a validated world.json
 * (layers, locations, props, scenes, ambient effects, completion effect).
 * Characters are built-in placeholder figures until character packs (Phase 3).
 * Text is NOT drawn here; WorldLabels renders it as HTML over the canvas.
 */
import Phaser from "phaser";
import type { SessionView } from "@shared/model";
import type { WorldInfo, SceneKind } from "@shared/world";
import { hashString, placeProjects, standSpots, type Placement } from "@shared/placement";
import { isUrgent } from "@/lib/status";

export interface WorldPos { x: number; y: number; alpha: number }
export interface CharacterPositions { hero: WorldPos; companions: Map<string, WorldPos> }
export interface SignPos { projectId: string; x: number; y: number; locationLabel: string }

type Anim = "idle" | "walk" | "read" | "write" | "bash" | "wait" | "celebrate" | "error";
type Fx = "none" | "sparks" | "signal" | "bell" | "smoke" | "glow" | "steam";

const WALK_SPEED = 170; // world px per second
const FADE_MS = 600;
const SHIRTS = [0xb3261e, 0x1f6fb2, 0x2e8b57, 0xd4a531, 0x7b3fa0, 0xe07a2f, 0x2a9d8f, 0xc2185b];

interface Companion { sprite: Phaser.GameObjects.Sprite; alpha: number; leaving: boolean }

interface Character {
  id: string;
  sprite: Phaser.GameObjects.Sprite;
  shadow: Phaser.GameObjects.Ellipse;
  ring: Phaser.GameObjects.Graphics;
  emitter?: Phaser.GameObjects.Particles.ParticleEmitter;
  emitterFx?: Fx;
  x: number;
  y: number;
  tx: number;
  ty: number;
  facingLeft: boolean;
  phase: "entering" | "alive" | "leaving";
  alpha: number;
  lastStatus?: string;
  companions: Map<string, Companion>;
  seed: number;
}

export interface SceneInput {
  sessions: SessionView[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

/** Texture key for a world file; the server reports paths with forward slashes. */
function textureKey(rel: string): string {
  return "w:" + rel.split("\\").join("/");
}

function hexToInt(c: string): number {
  return parseInt(c.slice(1, 7), 16);
}

export class WorldScene extends Phaser.Scene {
  readonly positions = new Map<string, CharacterPositions>();
  signs: SignPos[] = [];
  private input_: SceneInput = { sessions: [], selectedId: null, onSelect: () => {} };
  private chars = new Map<string, Character>();
  private scrollers: Array<{ sprite: Phaser.GameObjects.TileSprite; speed: number }> = [];
  private lastFrameAt = 0;
  private t = 0;
  private dt = 0;
  private rain?: Phaser.GameObjects.Particles.ParticleEmitter;
  private rainUntil = 0;
  private nextAmbientRoll = 0;
  private birds: Array<{ g: Phaser.GameObjects.Graphics; x: number; y: number; speed: number }> = [];
  private placements = new Map<string, Placement>();
  private overflowProps = new Map<string, Phaser.GameObjects.Image>();
  /** Props stand slightly behind the characters at their location. */
  private static PROP_DROP = 18;

  constructor(readonly world: WorldInfo) {
    super({ key: "WorldScene" });
  }

  setInput(input: SceneInput) {
    this.input_ = input;
  }

  preload() {
    for (const [rel, url] of Object.entries(this.world.urls)) {
      if (rel.toLowerCase().endsWith(".png")) this.load.image(textureKey(rel), url);
    }
  }

  create() {
    const { def } = this.world;
    this.cameras.main.setBackgroundColor(def.palette.background);
    def.layers.forEach((l, i) => {
      const key = textureKey(l.image);
      if (l.scrollX) {
        const tex = this.textures.get(key).getSourceImage() as HTMLImageElement;
        const ts = this.add.tileSprite(l.x, l.y, def.size.width, tex.height, key).setOrigin(0, 0).setAlpha(l.alpha).setDepth(i);
        this.scrollers.push({ sprite: ts, speed: l.scrollX });
      } else {
        this.add.image(l.x, l.y, key).setOrigin(0, 0).setAlpha(l.alpha).setDepth(i);
      }
    });
    for (const l of def.locations) {
      if (!l.prop) continue;
      this.add.image(l.x, l.y + WorldScene.PROP_DROP, textureKey(l.prop)).setOrigin(0.5, 1).setScale(l.propScale).setDepth(90 + l.y / 10);
    }
    this.makeTextures();
    this.setupAmbient();
    this.input.on("pointerdown", (p: Phaser.Input.Pointer) => {
      for (const [id, c] of this.chars) {
        if (c.phase !== "leaving" && Math.abs(c.x - p.worldX) < 30 && p.worldY > c.y - 80 && p.worldY < c.y + 10) {
          this.input_.onSelect(id);
          return;
        }
      }
    });
  }

  /** Placeholder figures (one per shirt colour) and particle dots. */
  private makeTextures() {
    const g = this.make.graphics({ x: 0, y: 0 }, false);
    SHIRTS.forEach((shirt, i) => {
      g.clear();
      g.fillStyle(0x1b1b1b).fillRect(4, 0, 6, 3); // hair
      g.fillStyle(0x8d5524).fillRect(4, 2, 6, 5); // face
      g.fillStyle(shirt).fillRect(3, 7, 8, 6); // shirt
      g.fillStyle(0x8d5524).fillRect(1, 8, 2, 4).fillRect(11, 8, 2, 4); // arms
      g.fillStyle(0xf3efe2).fillRect(3, 13, 8, 6); // mundu
      g.fillStyle(0xd4a531).fillRect(3, 13, 8, 1); // kasavu border
      g.fillStyle(0x5a3a1f).fillRect(4, 19, 2, 1).fillRect(8, 19, 2, 1); // feet
      g.generateTexture(`fig-${i}`, 14, 20);
    });
    g.clear();
    g.fillStyle(0xffffff).fillCircle(3, 3, 3);
    g.generateTexture("dot", 6, 6);
    g.clear();
    g.fillStyle(0xffffff).fillRect(0, 0, 2, 12);
    g.generateTexture("drop", 2, 12);
    g.destroy();
  }

  // ── Ambient ────────────────────────────────────────────────────────────────

  private setupAmbient() {
    const { def } = this.world;
    for (const a of def.ambient) {
      if (a.type === "rain") {
        this.rain = this.add.particles(0, -20, "drop", {
          x: { min: 0, max: def.size.width },
          speedY: { min: 700, max: 900 },
          speedX: { min: -60, max: -30 },
          lifespan: (def.size.height / 700) * 1000,
          quantity: Math.max(1, Math.round(a.count / 30)),
          frequency: 33,
          alpha: { start: 0.7, end: 0.3 },
          tint: a.color ? hexToInt(a.color) : 0xcfe8ff,
          emitting: false,
        }).setDepth(900);
      } else if (a.type === "birds") {
        for (let i = 0; i < a.count; i++) {
          const g = this.add.graphics().setDepth(5);
          g.lineStyle(3, a.color ? hexToInt(a.color) : 0x222222, 1);
          g.beginPath(); g.moveTo(-8, 0); g.lineTo(0, 5); g.lineTo(8, 0); g.strokePath();
          this.birds.push({ g, x: Math.random() * def.size.width, y: 80 + Math.random() * 200, speed: 40 + Math.random() * 40 });
        }
      }
    }
  }

  private updateAmbient(now: number) {
    const { def } = this.world;
    const rainDef = def.ambient.find((a) => a.type === "rain");
    if (this.rain && rainDef) {
      if (now >= this.nextAmbientRoll) {
        this.nextAmbientRoll = now + 60_000;
        if (now > this.rainUntil && Math.random() < rainDef.chancePerMinute) {
          const [lo, hi] = rainDef.durationSec;
          this.rainUntil = now + (lo + Math.random() * Math.max(0, hi - lo)) * 1000;
        }
      }
      const raining = now < this.rainUntil || rainDef.chancePerMinute >= 1;
      if (this.rain.emitting !== raining) this.rain.emitting = raining;
    }
    for (const b of this.birds) {
      b.x += b.speed * this.dt;
      if (b.x > def.size.width + 20) b.x = -20;
      b.g.setPosition(b.x, b.y + Math.sin(this.t * 2 + b.speed) * 6);
      b.g.setScale(1, 0.7 + Math.abs(Math.sin(this.t * 6 + b.speed)) * 0.6);
    }
  }

  /** Lets the page start a shower immediately (used by tests / demo). */
  startRain(seconds: number) {
    this.rainUntil = Date.now() + seconds * 1000;
  }

  // ── Characters ─────────────────────────────────────────────────────────────

  private sceneFor(s: SessionView): { anim: Anim; fx: Fx; offsetX: number; offsetY: number } {
    const kind = (s.status === "waiting" ? (s.waitingReason === "question" ? "question" : "waiting") : s.status === "finished" ? "done" : s.status === "error" ? "error" : s.status === "idle" ? "idle" : s.action?.kind ?? "think") as SceneKind;
    const sc = this.world.def.scenes[kind];
    return { anim: (sc?.anim ?? "idle") as Anim, fx: (sc?.fx ?? "none") as Fx, offsetX: sc?.offsetX ?? 0, offsetY: sc?.offsetY ?? 0 };
  }

  private spawn(s: SessionView, tx: number, ty: number): Character {
    const { def } = this.world;
    const seed = hashString(s.id);
    const fromLeft = tx < def.size.width / 2;
    const x = fromLeft ? -40 : def.size.width + 40;
    const sprite = this.add.sprite(x, ty, `fig-${seed % SHIRTS.length}`).setScale(3).setOrigin(0.5, 1).setDepth(100 + ty / 10);
    const shadow = this.add.ellipse(x, ty, 34, 10, 0x000000, 0.25).setDepth(99 + ty / 10);
    const ring = this.add.graphics().setDepth(98 + ty / 10);
    return { id: s.id, sprite, shadow, ring, x, y: ty, tx, ty, facingLeft: !fromLeft, phase: "entering", alpha: 0, companions: new Map(), seed };
  }

  private targets(): Map<string, { x: number; y: number }> {
    const { sessions } = this.input_;
    const byProject = new Map<string, SessionView[]>();
    for (const s of sessions) byProject.set(s.projectId, [...(byProject.get(s.projectId) ?? []), s]);
    this.placements = placeProjects([...byProject.keys()], this.world.def);
    this.syncOverflowProps();
    this.signs = [...this.placements.values()].map((p) => ({ projectId: p.projectId, x: p.sign.x, y: p.sign.y, locationLabel: p.locationLabel }));
    const out = new Map<string, { x: number; y: number }>();
    for (const [pid, list] of byProject) {
      const p = this.placements.get(pid)!;
      const spots = standSpots(p, list.length);
      list.sort((a, b) => a.id.localeCompare(b.id)).forEach((s, i) => {
        const sc = this.sceneFor(s);
        out.set(s.id, { x: spots[i].x + sc.offsetX, y: spots[i].y + sc.offsetY });
      });
    }
    return out;
  }

  private syncOverflowProps() {
    const ov = this.world.def.overflow;
    const wanted = new Set<string>();
    for (const p of this.placements.values()) {
      if (p.locationId !== null || !ov?.prop) continue;
      wanted.add(p.projectId);
      if (!this.overflowProps.has(p.projectId)) {
        const img = this.add.image(p.anchor.x, p.anchor.y + WorldScene.PROP_DROP, textureKey(ov.prop)).setOrigin(0.5, 1).setScale(ov.propScale).setDepth(90 + p.anchor.y / 10);
        this.overflowProps.set(p.projectId, img);
      }
    }
    for (const [pid, img] of this.overflowProps) {
      if (!wanted.has(pid)) {
        img.destroy();
        this.overflowProps.delete(pid);
      }
    }
  }

  private setFx(c: Character, fx: Fx) {
    if (c.emitterFx === fx) return;
    c.emitter?.destroy();
    c.emitter = undefined;
    c.emitterFx = fx;
    const cfg: Record<string, Phaser.Types.GameObjects.Particles.ParticleEmitterConfig> = {
      sparks: { speed: { min: 60, max: 140 }, angle: { min: 200, max: 340 }, scale: { start: 0.6, end: 0 }, lifespan: 400, frequency: 90, tint: [0xffd166, 0xff8c42], gravityY: 300 },
      steam: { speedY: { min: -30, max: -15 }, speedX: { min: -6, max: 6 }, scale: { start: 0.6, end: 1.6 }, alpha: { start: 0.45, end: 0 }, lifespan: 1600, frequency: 220, tint: 0xffffff },
      smoke: { speedY: { min: -40, max: -20 }, speedX: { min: -10, max: 10 }, scale: { start: 0.8, end: 2.2 }, alpha: { start: 0.5, end: 0 }, lifespan: 1400, frequency: 160, tint: 0x333333 },
    };
    if (cfg[fx]) c.emitter = this.add.particles(c.x, c.y, "dot", cfg[fx]).setDepth(c.sprite.depth + 1);
  }

  private animate(c: Character, anim: Anim, moving: boolean) {
    const t = this.t + (c.seed % 1000) / 300;
    let dx = 0, dy = 0, rot = 0;
    if (moving) {
      dy = -Math.abs(Math.sin(t * 10)) * 4;
      rot = Math.sin(t * 10) * 0.05;
    } else {
      switch (anim) {
        case "read": rot = -0.08; dy = Math.sin(t * 1.5); break;
        case "write": dy = Math.sin(t * 14) * 1.5; rot = 0.04; break;
        case "bash": dx = Math.sin(t * 30) * 1.5; dy = -Math.abs(Math.sin(t * 8)) * 3; break;
        case "wait": dy = -Math.abs(Math.sin(t * 4)) * 9; break;
        case "celebrate": dy = -Math.abs(Math.sin(t * 6)) * 16; rot = Math.sin(t * 6) * 0.1; break;
        case "error": rot = Math.sin(t * 3) * 0.15; break;
        default: dy = Math.sin(t * 2) * 1.5;
      }
    }
    c.sprite.setPosition(c.x + dx, c.y + dy).setRotation(rot).setFlipX(c.facingLeft).setAlpha(c.alpha);
    if (anim === "error" && !moving) c.sprite.setTint(0x9a9a9a);
    else c.sprite.clearTint();
    c.shadow.setPosition(c.x, c.y).setAlpha(0.25 * c.alpha);
  }

  private drawRing(c: Character, s: SessionView | undefined, fx: Fx) {
    const { palette } = this.world.def;
    c.ring.clear();
    if (!s) return;
    if (s.status === "waiting") {
      const urgent = isUrgent(s);
      const pulse = 0.25 + Math.abs(Math.sin(this.t * (urgent ? 6 : 3))) * 0.3;
      c.ring.fillStyle(hexToInt(urgent ? palette.urgent : palette.waiting), pulse * c.alpha);
      c.ring.fillEllipse(c.x, c.y, urgent ? 90 : 70, urgent ? 30 : 24);
    }
    if (fx === "signal") {
      const r = ((this.t * 40) % 40) + 10;
      c.ring.lineStyle(2, 0xffffff, (1 - r / 50) * c.alpha);
      c.ring.strokeCircle(c.x, c.y - 70, r);
    } else if (fx === "glow") {
      c.ring.fillStyle(hexToInt(palette.accent), 0.25 * c.alpha);
      c.ring.fillCircle(c.x, c.y - 30, 40);
    }
    if (s.id === this.input_.selectedId) {
      c.ring.lineStyle(3, hexToInt(palette.accent), c.alpha);
      c.ring.strokeEllipse(c.x, c.y, 60, 20);
    }
  }

  private updateCompanions(c: Character, s: SessionView | undefined) {
    const wanted = new Set((s?.subagents ?? []).filter((a) => a.status !== "finished").map((a) => a.id));
    for (const id of wanted) {
      if (!c.companions.has(id)) {
        const sprite = this.add.sprite(c.x, c.y, `fig-${(c.seed + 3) % SHIRTS.length}`).setScale(2).setOrigin(0.5, 1).setTint(0xbfe6ff).setDepth(c.sprite.depth - 0.5);
        c.companions.set(id, { sprite, alpha: 0, leaving: false });
      }
    }
    const pos = new Map<string, WorldPos>();
    let i = 0;
    for (const [id, comp] of c.companions) {
      comp.leaving = !wanted.has(id);
      comp.alpha = Math.max(0, Math.min(1, comp.alpha + this.dt * (comp.leaving ? -1.6 : 2.2)));
      if (comp.leaving && comp.alpha <= 0) {
        comp.sprite.destroy();
        c.companions.delete(id);
        continue;
      }
      const side = i % 2 === 0 ? 1 : -1;
      const x = c.x + side * (38 + Math.floor(i / 2) * 30) + (comp.leaving ? side * (1 - comp.alpha) * 70 : 0);
      const y = c.y + 6 + Math.sin(this.t * 3 + i) * 1.5;
      comp.sprite.setPosition(x, y).setAlpha(comp.alpha * c.alpha).setFlipX(side < 0);
      pos.set(id, { x, y, alpha: comp.alpha * c.alpha });
      i++;
    }
    return pos;
  }

  /** Completion effect when a session finishes its turn or ends. */
  private celebrate(c: Character) {
    const comp = this.world.def.completion;
    if (!comp) return;
    if (comp.effect === "lamp-row") {
      const count = Math.max(3, Math.min(15, Number(comp.params.count) || 7));
      const gap = 22;
      const baseY = c.y + 26;
      for (let i = 0; i < count; i++) {
        const x = c.x + (i - (count - 1) / 2) * gap;
        const lamp = this.add.graphics().setDepth(c.sprite.depth + 2).setAlpha(0);
        lamp.fillStyle(0xd4a531).fillRect(x - 2, baseY - 12, 4, 12).fillRect(x - 6, baseY, 12, 3).fillEllipse(x, baseY - 13, 12, 4);
        const flame = this.add.ellipse(x, baseY - 19, 5, 9, 0xffb020).setDepth(c.sprite.depth + 3).setAlpha(0);
        this.tweens.add({ targets: lamp, alpha: 1, delay: i * 90, duration: 200 });
        this.tweens.add({ targets: flame, alpha: 1, scaleY: { from: 0.4, to: 1 }, delay: i * 120 + 200, duration: 250 });
        this.tweens.add({ targets: flame, scaleX: 0.7, yoyo: true, repeat: 8, duration: 180, delay: i * 120 + 450 });
        this.tweens.add({ targets: [lamp, flame], alpha: 0, delay: 4200 + i * 40, duration: 600, onComplete: () => { lamp.destroy(); flame.destroy(); } });
      }
    } else {
      const burst = this.add.particles(c.x, c.y - 40, "dot", {
        speed: { min: 80, max: 220 }, lifespan: 900, quantity: 30, emitting: false, gravityY: 250,
        tint: [0xffd166, 0xef476f, 0x06d6a0, 0x118ab2], scale: { start: 1, end: 0 },
      }).setDepth(950);
      burst.explode(40);
      this.time.delayedCall(1500, () => burst.destroy());
    }
  }

  update() {
    const nowMs = performance.now();
    this.dt = this.lastFrameAt ? Math.min(nowMs - this.lastFrameAt, 1000) / 1000 : 0;
    this.lastFrameAt = nowMs;
    this.t += this.dt;
    for (const s of this.scrollers) s.sprite.tilePositionX += s.speed * this.dt;
    this.updateAmbient(Date.now());

    const sessions = new Map(this.input_.sessions.map((s) => [s.id, s]));
    const targets = this.targets();
    for (const s of sessions.values()) {
      const t = targets.get(s.id)!;
      if (!this.chars.has(s.id)) this.chars.set(s.id, this.spawn(s, t.x, t.y));
    }

    for (const [id, c] of this.chars) {
      const s = sessions.get(id);
      if (!s && c.phase !== "leaving") {
        c.phase = "leaving";
        c.tx = c.x < this.world.def.size.width / 2 ? -60 : this.world.def.size.width + 60;
        c.ty = c.y;
      } else if (s) {
        const t = targets.get(id)!;
        c.tx = t.x;
        c.ty = t.y;
        // Completion: a working session finishes its turn, or the session ends.
        const key = `${s.status}:${s.waitingReason ?? ""}`;
        if (c.lastStatus && c.lastStatus.startsWith("working") && (key === "waiting:turn_end" || s.status === "finished")) this.celebrate(c);
        if (c.lastStatus !== key && s.status === "finished" && !c.lastStatus?.startsWith("working")) this.celebrate(c);
        c.lastStatus = key;
      }

      const dx = c.tx - c.x, dy = c.ty - c.y, dist = Math.hypot(dx, dy);
      const step = WALK_SPEED * this.dt * (c.phase === "leaving" ? 1.6 : 1);
      const moving = dist > 1;
      if (moving) {
        if (dist <= step) { c.x = c.tx; c.y = c.ty; } else { c.x += (dx / dist) * step; c.y += (dy / dist) * step; }
        if (Math.abs(dx) > 0.5) c.facingLeft = dx < 0;
      } else if (c.phase === "entering") {
        c.phase = "alive";
      }
      const fadeStep = (this.dt * 1000) / FADE_MS;
      c.alpha = c.phase === "leaving" ? (dist < 80 ? Math.max(0, c.alpha - fadeStep) : c.alpha) : Math.min(1, c.alpha + fadeStep);
      if (c.phase === "leaving" && (c.alpha <= 0 || !moving)) {
        c.sprite.destroy(); c.shadow.destroy(); c.ring.destroy(); c.emitter?.destroy();
        for (const comp of c.companions.values()) comp.sprite.destroy();
        this.chars.delete(id);
        this.positions.delete(id);
        continue;
      }
      const depth = 100 + c.y / 10;
      c.sprite.setDepth(depth);
      c.shadow.setDepth(depth - 1);
      c.ring.setDepth(depth - 2);

      const sc = s ? this.sceneFor(s) : { anim: "walk" as Anim, fx: "none" as Fx };
      this.animate(c, sc.anim, moving);
      this.setFx(c, moving ? "none" : sc.fx);
      if (c.emitter) c.emitter.setPosition(c.x, c.y - (sc.fx === "steam" ? 70 : sc.fx === "sparks" ? 40 : 60));
      this.drawRing(c, s, moving ? "none" : sc.fx);
      const comps = this.updateCompanions(c, s);
      this.positions.set(id, { hero: { x: c.x, y: c.y, alpha: c.alpha }, companions: comps });
    }
  }
}
