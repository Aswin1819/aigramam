/**
 * Generic world renderer driven entirely by world.json + character packs:
 * time-of-day sky and lighting, layered scenery, animated decor, weather,
 * props that move with the people on them, sprite-sheet characters, and a
 * camera you can pan, zoom and focus. Text is drawn by WorldLabels as HTML.
 */
import Phaser from "phaser";
import type { SessionView, SubagentView } from "@shared/model";
import type { DecorDef, LightingDef, SceneKind, WorldInfo } from "@shared/world";
import type { CharacterAssignments, CharacterInfo } from "@shared/character";
import { hashString, placeProjects, standSpots, type Placement } from "@shared/placement";
import { pickPlace, type PlaceRect } from "@/styles/live/placeHit";
import { isUrgent } from "@/lib/status";
import { pickCharacter } from "./characters";

export interface WorldPos { x: number; y: number; alpha: number }
export interface CharacterPositions { hero: WorldPos; head: { x: number; y: number }; companions: Map<string, WorldPos> }
export interface SignPos { projectId: string; x: number; y: number; locationLabel: string }

type Anim = "idle" | "walk" | "read" | "write" | "bash" | "wait" | "celebrate" | "error";
type Fx = "none" | "sparks" | "signal" | "bell" | "smoke" | "glow" | "steam";

const WALK_SPEED = 150;
const FADE_MS = 600;
const CELEBRATE_MS = 2200;
const DEPTH = { sky: -100, stars: -99, sun: -98, skyDecor: -90, scene: 90, frontDecor: 1400, tint: 1500, weather: 1600, flash: 1700, glow: 2000 } as const;

/** Subagent companions: smaller, tinted copies of the parent that run errands and help. */
const COMP_SCALE = 0.62;
const COMP_SPEED = 95;
const COMP_ARRIVE_S = 0.45;
const COMP_CHEER_S = 0.9;
const ERRAND_PROP: Partial<Record<SceneKind, string>> = { read: "📜", search: "🔍", web: "🌐" };
const BUSY_PROP: Partial<Record<SceneKind, string>> = { write: "✏️", bash: "⚙️", tool: "⚙️" };
const ANIM_FALLBACK: Partial<Record<Anim, Anim>> = { bash: "write", wait: "idle", write: "idle", read: "idle", celebrate: "idle", error: "idle" };

type CompMode = "arrive" | "slot" | "out" | "errand" | "back" | "leave";
interface Burst { kind: "ring" | "spark"; ox: number; oy: number; t0: number }
interface Puff { t0: number; dx: number; emoji: boolean }

interface Companion {
  sprite: Phaser.GameObjects.Sprite;
  shadow: Phaser.GameObjects.Ellipse;
  /** Puff rings, sparkles, rising puffs and the ?/! bubble disc, redrawn each frame. */
  fx: Phaser.GameObjects.Graphics;
  prop?: Phaser.GameObjects.Text;
  bubble?: Phaser.GameObjects.Text;
  puffTexts: Phaser.GameObjects.Text[];
  seed: number;
  /** Feet position relative to the parent's feet, and where it is heading. */
  ox: number; oy: number; tox: number; toy: number;
  alpha: number;
  leaving: boolean;
  mode: CompMode;
  modeAt: number;
  until: number;
  pauseUntil: number;
  paceDir: 1 | -1;
  errDir: 1 | -1;
  errands: number;
  facingLeft: boolean;
  animKey?: string;
  kind: SceneKind;
  kindAt: number;
  bursts: Burst[];
  puffs: Puff[];
  nextPuffAt: number;
}

const subKind = (a: SubagentView): SceneKind =>
  (a.status === "waiting" ? (a.action?.kind === "question" ? "question" : "waiting")
  : a.status === "error" ? "error" : a.status === "idle" ? "idle" : a.status === "finished" ? "done"
  : a.action?.kind ?? "think") as SceneKind;

interface Character {
  id: string;
  pack: CharacterInfo | null;
  sprite: Phaser.GameObjects.Sprite;
  shadow: Phaser.GameObjects.Ellipse;
  ring: Phaser.GameObjects.Graphics;
  emitter?: Phaser.GameObjects.Particles.ParticleEmitter;
  emitterFx?: Fx;
  x: number; y: number; tx: number; ty: number;
  locationId: string | null;
  facingLeft: boolean;
  phase: "entering" | "alive" | "leaving";
  alpha: number;
  lastStatus?: string;
  celebrateUntil: number;
  companions: Map<string, Companion>;
  seed: number;
  animKey?: string;
}

interface DecorObj { def: DecorDef; img: Phaser.GameObjects.Image; baseX: number; baseY: number; baseAlpha: number; baseScale: number }

export interface SceneInput {
  sessions: SessionView[];
  selectedId: string | null;
  hoveredId: string | null;
  onSelect: (id: string) => void;
  /** Clicking a project's place (its prop/building, not a villager in front) calls this with the project id. */
  onSelectProject?: (projectId: string) => void;
  /** The project open in the app: its place glows brass. */
  selectedProjectId?: string | null;
}

const hexToInt = (c: string) => parseInt(c.slice(1, 7), 16);
const textureKey = (prefix: string, rel: string) => `${prefix}:${rel.split("\\").join("/")}`;

function lerpColor(a: string, b: string, t: number): number {
  const ca = hexToInt(a), cb = hexToInt(b);
  const ch = (s: number) => Math.round(((ca >> s) & 255) + (((cb >> s) & 255) - ((ca >> s) & 255)) * t);
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
}

/** Interpolate a list of {hour, ...} stops at hour h (stops sorted, 0..24). */
function atHour<T extends { hour: number }>(stops: T[], h: number): [T, T, number] {
  const s = [...stops].sort((a, b) => a.hour - b.hour);
  for (let i = 1; i < s.length; i++) if (h <= s[i].hour) return [s[i - 1], s[i], (h - s[i - 1].hour) / Math.max(0.0001, s[i].hour - s[i - 1].hour)];
  return [s[s.length - 1], s[s.length - 1], 0];
}

export class WorldScene extends Phaser.Scene {
  readonly positions = new Map<string, CharacterPositions>();
  signs: SignPos[] = [];
  /** Project under the canvas pointer (only while onSelectProject is given). */
  private canvasHoverProject: string | null = null;
  /** Project whose HTML signboard is hovered (set by WorldLabels). */
  private signHoverProject: string | null = null;
  private placeGlow!: Phaser.GameObjects.Graphics;
  private glowFx = new Map<Phaser.GameObjects.Image, { fx: Phaser.FX.Glow; level: "hover" | "selected" }>();
  private inp: SceneInput = { sessions: [], selectedId: null, hoveredId: null, onSelect: () => {} };
  private chars = new Map<string, Character>();
  private scrollers: Array<{ sprite: Phaser.GameObjects.TileSprite; speed: number }> = [];
  private decor: DecorObj[] = [];
  private props = new Map<string, { img: Phaser.GameObjects.Image; baseY: number }>();
  private overflowProps = new Map<string, Phaser.GameObjects.Image>();
  private placements = new Map<string, Placement>();
  private lastFrameAt = 0;
  private t = 0;
  private dt = 0;
  // Sky & light
  private sky!: Phaser.GameObjects.Graphics;
  private sun!: Phaser.GameObjects.Container;
  private moon!: Phaser.GameObjects.Container;
  private stars: Array<{ dot: Phaser.GameObjects.Arc; tw: number }> = [];
  private tint!: Phaser.GameObjects.Rectangle;
  private flash!: Phaser.GameObjects.Rectangle;
  private night = 0;
  private hourOverride: number | null = null;
  private lastLightAt = -1;
  // Weather
  private rain?: Phaser.GameObjects.Particles.ParticleEmitter;
  private splashes?: Phaser.GameObjects.Particles.ParticleEmitter;
  private fireflies?: Phaser.GameObjects.Particles.ParticleEmitter;
  private rainUntil = 0;
  private rainLevel = 0;
  private nextRoll = 0;
  private nextLightning = 0;
  private birds: Array<{ g: Phaser.GameObjects.Graphics; x: number; y: number; speed: number }> = [];
  private reduced = false;
  // Camera drag
  private dragFrom: { x: number; y: number; sx: number; sy: number } | null = null;
  private dragged = false;

  constructor(readonly world: WorldInfo, readonly characters: CharacterInfo[], readonly assignments: CharacterAssignments = {}) {
    super({ key: "WorldScene" });
  }

  // ── Public controls (called from React) ────────────────────────────────────
  setInput(input: SceneInput) { this.inp = input; }
  setHourOverride(h: number | null) { this.hourOverride = h; this.lastLightAt = -1; }
  setReducedMotion(on: boolean) { this.reduced = on; }
  startRain(seconds: number) { this.rainUntil = Date.now() + seconds * 1000; }
  isNight() { return this.night > 0.5; }
  /** The project being pointed at (its place on the canvas, or its signboard), for highlights and the hint. */
  get hoveredProjectId(): string | null {
    return this.inp.onSelectProject ? this.signHoverProject ?? this.canvasHoverProject : null;
  }
  setSignHover(projectId: string | null) { this.signHoverProject = projectId; }

  /** Smoothly bring a character into view and zoom in a little. */
  focus(id: string) {
    const c = this.chars.get(id);
    if (!c) return;
    const cam = this.cameras.main;
    const zoom = Math.max(cam.zoom, 1.6);
    cam.zoomTo(zoom, 600, "Sine.easeInOut");
    cam.pan(c.x, c.y - 60, 600, "Sine.easeInOut");
  }

  resetView() {
    const cam = this.cameras.main;
    cam.zoomTo(1, 500, "Sine.easeInOut");
    cam.pan(this.world.def.size.width / 2, this.world.def.size.height / 2, 500, "Sine.easeInOut");
  }

  /** World → canvas pixels, including camera pan/zoom (for the HTML labels). */
  toCanvas(x: number, y: number): { x: number; y: number; zoom: number } {
    const cam = this.cameras.main;
    return { x: (x - cam.worldView.x) * cam.zoom, y: (y - cam.worldView.y) * cam.zoom, zoom: cam.zoom };
  }

  // ── Loading ────────────────────────────────────────────────────────────────
  preload() {
    for (const [rel, url] of Object.entries(this.world.urls)) if (rel.toLowerCase().endsWith(".png")) this.load.image(textureKey("w", rel), url);
    for (const c of this.characters) {
      const url = c.urls[c.def.sheet.split("\\").join("/")];
      if (url) this.load.spritesheet(`c:${c.id}`, url, { frameWidth: c.def.frame.width, frameHeight: c.def.frame.height });
    }
  }

  create() {
    const { def } = this.world;
    const W = def.size.width, H = def.size.height;
    this.cameras.main.setBounds(0, 0, W, H).setBackgroundColor(def.palette.background);
    this.makeTextures();
    this.createSky();
    def.layers.forEach((l, i) => {
      const key = textureKey("w", l.image);
      if (l.scrollX) {
        const tex = this.textures.get(key).getSourceImage() as HTMLImageElement;
        const ts = this.add.tileSprite(l.x, l.y, W, tex.height, key).setOrigin(0, 0).setAlpha(l.alpha).setDepth(i);
        this.scrollers.push({ sprite: ts, speed: l.scrollX });
      } else {
        this.add.image(l.x, l.y, key).setOrigin(0, 0).setAlpha(l.alpha).setDepth(i);
      }
    });
    for (const l of def.locations) {
      if (!l.prop) continue;
      const y = l.y + l.propDy;
      const img = this.add.image(l.x, y, textureKey("w", l.prop)).setOrigin(0.5, 1).setScale(l.propScale).setDepth(DEPTH.scene + l.y / 10 - 1);
      this.props.set(l.id, { img, baseY: y });
    }
    for (const d of def.decor) {
      const img = this.add.image(d.x, d.y, textureKey("w", d.image)).setOrigin(d.originX, d.originY).setScale(d.scale).setFlipX(d.flipX).setAlpha(d.alpha);
      if (d.blend === "add") img.setBlendMode(Phaser.BlendModes.ADD);
      const depth = d.layer === "sky" ? DEPTH.skyDecor : d.layer === "front" ? (d.blend === "add" ? DEPTH.glow : DEPTH.frontDecor) : DEPTH.scene + d.y / 10 - 1.5;
      img.setDepth(depth);
      this.decor.push({ def: d, img, baseX: d.x, baseY: d.y, baseAlpha: d.alpha, baseScale: d.scale });
    }
    this.createCharacterAnims();
    this.tint = this.add.rectangle(0, 0, W, H, 0x000000, 0).setOrigin(0, 0).setDepth(DEPTH.tint);
    this.flash = this.add.rectangle(0, 0, W, H, 0xffffff, 0).setOrigin(0, 0).setDepth(DEPTH.flash);
    this.placeGlow = this.add.graphics();
    this.createWeather();
    this.setupInput();
  }

  private makeTextures() {
    const g = this.make.graphics({ x: 0, y: 0 }, false);
    g.fillStyle(0xffffff).fillCircle(3, 3, 3);
    g.generateTexture("dot", 6, 6);
    g.clear();
    g.fillStyle(0xffffff).fillRect(0, 0, 2, 16);
    g.generateTexture("drop", 2, 16);
    g.clear();
    g.fillStyle(0xffffff, 0.25).fillCircle(8, 8, 8);
    g.fillStyle(0xffffff, 0.9).fillCircle(8, 8, 3);
    g.generateTexture("firefly", 16, 16);
    // Fallback character (when no pack loads)
    g.clear();
    g.fillStyle(0x1b1b1b).fillRect(4, 0, 6, 3);
    g.fillStyle(0x8d5524).fillRect(4, 2, 6, 5);
    g.fillStyle(0x3d6fb0).fillRect(3, 7, 8, 6);
    g.fillStyle(0xf3efe2).fillRect(3, 13, 8, 6);
    g.generateTexture("fallback-char", 14, 20);
    g.destroy();
  }

  private createCharacterAnims() {
    for (const c of this.characters) {
      const key = `c:${c.id}`;
      if (!this.textures.exists(key)) continue;
      // Pixel-art characters stay crisp in the smooth, illustrated world.
      this.textures.get(key).setFilter(Phaser.Textures.FilterMode.NEAREST);
      const cols = Math.floor((this.textures.get(key).getSourceImage() as HTMLImageElement).width / c.def.frame.width);
      for (const [name, a] of Object.entries(c.def.animations)) {
        if (!a) continue;
        const start = a.row * cols;
        this.anims.create({
          key: `${key}:${name}`,
          frames: this.anims.generateFrameNumbers(key, { start, end: start + a.frames - 1 }),
          frameRate: a.fps ?? c.def.fps,
          repeat: a.loop === false ? 0 : -1,
        });
      }
    }
  }

  // ── Sky, sun, moon, stars, tint ────────────────────────────────────────────
  private createSky() {
    const { width: W } = this.world.def.size;
    this.sky = this.add.graphics().setDepth(DEPTH.sky);
    const sunGlow = this.add.circle(0, 0, 70, 0xffd27a, 0.25);
    const sunDisc = this.add.circle(0, 0, 30, 0xffe9a8, 1);
    this.sun = this.add.container(0, 0, [sunGlow, sunDisc]).setDepth(DEPTH.sun);
    const moonGlow = this.add.circle(0, 0, 50, 0xcfe0ff, 0.18);
    const moonDisc = this.add.circle(0, 0, 22, 0xf3f1e6, 1);
    const moonBite = this.add.circle(9, -5, 19, 0x0b1026, 1);
    this.moon = this.add.container(0, 0, [moonGlow, moonDisc, moonBite]).setDepth(DEPTH.sun);
    const r = new Phaser.Math.RandomDataGenerator(["stars"]);
    for (let i = 0; i < 140; i++) {
      const dot = this.add.circle(r.between(0, W), r.between(0, 470), r.realInRange(0.6, 1.6), 0xffffff, 0).setDepth(DEPTH.stars);
      this.stars.push({ dot, tw: r.realInRange(0.5, 3) });
    }
  }

  private currentHour(): number {
    const l = this.world.def.lighting;
    if (this.hourOverride !== null) return this.hourOverride;
    if (!l || l.mode === "fixed") return l?.fixedHour ?? 12;
    const d = new Date();
    return d.getHours() + d.getMinutes() / 60 + d.getSeconds() / 3600;
  }

  /** 0 at day, 1 at night, with a one-hour ramp on each side. */
  private nightFactor(h: number, l: LightingDef): number {
    const from = l.nightFrom, to = l.nightTo;
    const inNight = from > to ? h >= from || h < to : h >= from && h < to;
    const distToEdge = Math.min(Math.abs(h - from), Math.abs(h - to), 24 - Math.abs(h - from), 24 - Math.abs(h - to));
    const ramp = Math.min(1, distToEdge);
    return inNight ? 0.5 + ramp / 2 : 0.5 - ramp / 2;
  }

  private updateLight(now: number) {
    const l = this.world.def.lighting;
    const { width: W, height: H } = this.world.def.size;
    if (!l) {
      this.sky.clear().fillStyle(hexToInt(this.world.def.palette.background)).fillRect(0, 0, W, H);
      this.sun.setVisible(false); this.moon.setVisible(false);
      return;
    }
    const h = this.currentHour();
    if (now - this.lastLightAt > 1000) {
      this.lastLightAt = now;
      const [a, b, t] = atHour(l.sky, h);
      const top = lerpColor(a.top, b.top, t), bottom = lerpColor(a.bottom, b.bottom, t);
      this.sky.clear().fillGradientStyle(top, top, bottom, bottom, 1).fillRect(0, 0, W, H * 0.6);
      this.sky.fillStyle(bottom, 1).fillRect(0, H * 0.6 - 1, W, H * 0.4 + 1);
      const [ta, tb, tt] = atHour(l.tint, h);
      this.tint.setFillStyle(lerpColor(ta.color, tb.color, tt), ta.alpha + (tb.alpha - ta.alpha) * tt);
      this.night = this.nightFactor(h, l);
      // Sun from 6h (left) to 18h (right); moon from 18h to 6h.
      const arc = (p: number) => ({ x: W * (0.08 + 0.84 * p), y: 470 - Math.sin(p * Math.PI) * 360 });
      const sunP = (h - 6) / 12, moonP = (((h - 18) % 24) + 24) % 24 / 12;
      const sp = arc(Phaser.Math.Clamp(sunP, 0, 1)), mp = arc(Phaser.Math.Clamp(moonP, 0, 1));
      this.sun.setPosition(sp.x, sp.y).setVisible(l.sun && sunP > -0.05 && sunP < 1.05).setAlpha(1 - this.night * 0.8);
      this.moon.setPosition(mp.x, mp.y).setVisible(l.sun && moonP >= 0 && moonP <= 1).setAlpha(this.night);
      (this.moon.list[2] as Phaser.GameObjects.Arc).setFillStyle(top);
    }
    const rainDim = this.rainLevel * 0.18;
    if (rainDim > 0) this.tint.setAlpha(Math.min(0.75, this.tint.fillAlpha + rainDim));
    for (const s of this.stars) s.dot.setAlpha(l.stars ? this.night * (0.45 + 0.4 * Math.sin(this.t * s.tw + s.tw * 7)) * (1 - this.rainLevel) : 0);
  }

  // ── Weather ────────────────────────────────────────────────────────────────
  private createWeather() {
    const { def } = this.world;
    const W = def.size.width, H = def.size.height;
    for (const a of def.ambient) {
      if (a.type === "rain") {
        const tint = a.color ? hexToInt(a.color) : 0xd8ecff;
        this.rain = this.add.particles(0, -30, "drop", {
          x: { min: -200, max: W }, speedY: { min: 900, max: 1150 }, speedX: { min: 160, max: 220 }, angle: 0,
          rotate: -11, lifespan: (H / 950) * 1000, quantity: Math.max(1, Math.round(a.count / 25)), frequency: 25,
          alpha: { start: 0.55, end: 0.25 }, scaleY: { min: 0.7, max: 1.3 }, tint, emitting: false,
        }).setDepth(DEPTH.weather);
        this.splashes = this.add.particles(0, 0, "dot", {
          x: { min: 0, max: W }, y: { min: 560, max: H }, speedY: { min: -60, max: -20 }, speedX: { min: -25, max: 25 },
          gravityY: 220, lifespan: 260, scale: { start: 0.45, end: 0 }, alpha: { start: 0.7, end: 0 }, quantity: 3, frequency: 30, tint, emitting: false,
        }).setDepth(DEPTH.weather - 1);
      } else if (a.type === "birds") {
        for (let i = 0; i < a.count; i++) {
          const g = this.add.graphics().setDepth(DEPTH.skyDecor + 1);
          g.lineStyle(2.5, a.color ? hexToInt(a.color) : 0x222222, 1);
          g.beginPath(); g.moveTo(-9, 0); g.lineTo(-3, 3); g.lineTo(0, 1); g.lineTo(3, 3); g.lineTo(9, 0); g.strokePath();
          this.birds.push({ g, x: Math.random() * W, y: 90 + Math.random() * 230, speed: 35 + Math.random() * 35 });
        }
      } else if (a.type === "fireflies") {
        this.fireflies = this.add.particles(0, 0, "firefly", {
          x: { min: 0, max: W }, y: { min: 640, max: H - 40 }, speedX: { min: -14, max: 14 }, speedY: { min: -12, max: 6 },
          lifespan: { min: 2500, max: 5000 }, scale: { start: 0.4, end: 0.8 }, alpha: { start: 0, end: 0, ease: "Sine.easeInOut" },
          tint: a.color ? hexToInt(a.color) : 0xfff3a0, quantity: 1, frequency: 4000 / a.count, blendMode: "ADD", emitting: false,
        }).setDepth(DEPTH.glow - 1);
        this.fireflies.setParticleAlpha((p: Phaser.GameObjects.Particles.Particle, _k: string, t: number) => Math.sin(t * Math.PI) * (0.6 + 0.4 * Math.sin(p.x)));
      }
    }
  }

  private updateWeather(now: number) {
    const { def } = this.world;
    const rainDef = def.ambient.find((a) => a.type === "rain");
    if (rainDef && now >= this.nextRoll) {
      this.nextRoll = now + 60_000;
      if (now > this.rainUntil && Math.random() < rainDef.chancePerMinute) {
        const [lo, hi] = rainDef.durationSec;
        this.rainUntil = now + (lo + Math.random() * Math.max(0, hi - lo)) * 1000;
      }
    }
    const raining = !!rainDef && (now < this.rainUntil || rainDef.chancePerMinute >= 1) && !this.reduced;
    this.rainLevel = Phaser.Math.Clamp(this.rainLevel + (raining ? 1 : -1) * this.dt * 0.4, 0, 1);
    if (this.rain) this.rain.emitting = this.rainLevel > 0.05;
    if (this.splashes) this.splashes.emitting = this.rainLevel > 0.3;
    // Lightning only during heavy rain
    const lightning = def.ambient.find((a) => a.type === "lightning");
    if (lightning && this.rainLevel > 0.8 && now > this.nextLightning) {
      this.nextLightning = now + (20_000 + Math.random() * 40_000) / Math.max(0.05, lightning.chancePerMinute);
      this.tweens.add({ targets: this.flash, fillAlpha: { from: 0.65, to: 0 }, duration: 140, yoyo: false, onComplete: () => {
        this.tweens.add({ targets: this.flash, fillAlpha: { from: 0.45, to: 0 }, duration: 420, delay: 90 });
      } });
    }
    if (this.fireflies) this.fireflies.emitting = this.night > 0.6 && this.rainLevel < 0.3 && !this.reduced;
    const W = def.size.width;
    for (const b of this.birds) {
      b.x += b.speed * this.dt;
      if (b.x > W + 30) { b.x = -30; b.y = 90 + Math.random() * 230; }
      b.g.setPosition(b.x, b.y + Math.sin(this.t * 1.6 + b.speed) * 8).setScale(1, 0.6 + Math.abs(Math.sin(this.t * 7 + b.speed)) * 0.7);
      b.g.setVisible(this.night < 0.6 && this.rainLevel < 0.6);
    }
  }

  // ── Decor & props ──────────────────────────────────────────────────────────
  /** Vertical offset of a location's prop right now (a bobbing houseboat). */
  private propOffset(locationId: string | null): number {
    if (!locationId || this.reduced) return 0;
    const l = this.world.def.locations.find((x) => x.id === locationId);
    if (!l || l.propAnim !== "bob") return 0;
    return Math.sin(this.t * Math.PI * 2 * l.propSpeed + l.x) * l.propAmp;
  }

  private updateDecor() {
    const W = this.world.def.size.width;
    const wind = 1 + this.rainLevel * 1.8;
    for (const l of this.world.def.locations) {
      const p = this.props.get(l.id);
      if (p) p.img.y = p.baseY + this.propOffset(l.id);
    }
    for (const o of this.decor) {
      const d = o.def;
      const ph = d.phase;
      const visible = d.night === "only" ? this.night : d.night === "hide" ? 1 - this.night : 1;
      // Clouds and other sky decor darken at night and in rain.
      if (d.layer === "sky") o.img.setTint(lerpColor("#ffffff", "#3a4060", Math.min(1, this.night * 0.85 + this.rainLevel * 0.4)));
      let alpha = o.baseAlpha * visible;
      if (!this.reduced) {
        switch (d.anim) {
          case "sway": o.img.setAngle(Math.sin(this.t * Math.PI * 2 * d.speed + ph) * d.amp * wind + Math.sin(this.t * 3.1 + ph) * 0.3 * wind); break;
          case "bob": o.img.y = o.baseY + Math.sin(this.t * Math.PI * 2 * d.speed + ph) * d.amp; break;
          case "dip": o.img.setAngle(-d.amp * (0.5 - 0.5 * Math.cos(this.t * Math.PI * 2 * d.speed + ph))); break;
          case "pulse": o.img.setScale(o.baseScale * (1 + d.amp * 0.1 * Math.sin(this.t * Math.PI * 2 * d.speed + ph))); break;
          case "flicker": alpha *= 1 - d.amp * (0.5 + 0.5 * Math.sin(this.t * d.speed * 9.7 + ph) * Math.sin(this.t * d.speed * 4.3)); break;
          case "drift": {
            const span = W + o.img.displayWidth * 2;
            o.baseX += d.speed * this.dt;
            if (o.baseX > W + o.img.displayWidth) o.baseX -= span;
            if (o.baseX < -o.img.displayWidth) o.baseX += span;
            o.img.x = o.baseX;
            if (o.baseY > 540 && o.baseY < 820) o.img.y = o.baseY + Math.sin(this.t * 1.7 + o.baseX * 0.01) * 1.5; // on water: bob gently
            if (d.speed !== 0) o.img.setFlipX(d.flipX !== d.speed < 0);
            break;
          }
        }
      }
      o.img.setAlpha(alpha).setVisible(alpha > 0.01);
    }
  }

  private syncOverflowProps() {
    const ov = this.world.def.overflow;
    const wanted = new Set<string>();
    for (const p of this.placements.values()) {
      if (p.locationId !== null || !ov?.prop) continue;
      wanted.add(p.projectId);
      if (!this.overflowProps.has(p.projectId)) {
        const img = this.add.image(p.anchor.x, p.anchor.y + 4, textureKey("w", ov.prop)).setOrigin(0.5, 1).setScale(ov.propScale).setDepth(DEPTH.scene + p.anchor.y / 10 - 1).setAlpha(0);
        this.tweens.add({ targets: img, alpha: 1, duration: 500 });
        this.overflowProps.set(p.projectId, img);
      }
    }
    for (const [pid, img] of this.overflowProps) {
      if (wanted.has(pid)) continue;
      this.tweens.add({ targets: img, alpha: 0, duration: 400, onComplete: () => img.destroy() });
      this.overflowProps.delete(pid);
    }
  }

  // ── Project places: hit boxes and highlight ───────────────────────────────
  /** The prop drawn for a placed project (its location's prop, or its overflow hut). */
  private placeImage(p: Placement): Phaser.GameObjects.Image | undefined {
    return p.locationId ? this.props.get(p.locationId)?.img : this.overflowProps.get(p.projectId);
  }

  /** Clickable box of each placed project: its prop's bounds, or an area around its standing spots. */
  private placeRects(): PlaceRect[] {
    const out: PlaceRect[] = [];
    for (const p of this.placements.values()) {
      const img = this.placeImage(p);
      if (img && img.active) {
        const b = img.getBounds();
        out.push({ id: p.projectId, x0: b.x, y0: b.y, x1: b.right, y1: b.bottom + 8 });
      } else {
        const half = Math.max(70, (p.slots * p.spacing) / 2);
        out.push({ id: p.projectId, x0: p.anchor.x - half, y0: Math.min(p.sign.y, p.anchor.y - 140), x1: p.anchor.x + half, y1: p.anchor.y + 12 });
      }
    }
    return out;
  }

  /** Brass glow on the selected project's prop, a lighter one on the hovered; a soft ground halo under each. */
  private updatePlaceHighlight() {
    const g = this.placeGlow;
    g.clear();
    const selected = this.inp.selectedProjectId ?? null;
    const hovered = this.hoveredProjectId;
    const wanted = new Map<Phaser.GameObjects.Image, "hover" | "selected">();
    for (const p of this.placements.values()) {
      const level = p.projectId === selected ? "selected" : p.projectId === hovered ? "hover" : null;
      if (!level) continue;
      const img = this.placeImage(p);
      const b = img?.active ? img.getBounds() : null;
      const cx = b ? b.centerX : p.anchor.x;
      const by = b ? b.bottom : p.anchor.y;
      const w = b ? Math.max(90, b.width * 0.85) : Math.max(140, p.slots * p.spacing);
      const sel = level === "selected";
      g.fillStyle(0xe3b04b, sel ? 0.2 : 0.1).fillEllipse(cx, by - 4, w, 34);
      g.lineStyle(sel ? 3 : 2, sel ? 0xe3b04b : 0xfff8e7, sel ? 0.9 : 0.55).strokeEllipse(cx, by - 4, w, 34);
      if (img?.active) {
        wanted.set(img, level);
        g.setDepth(img.depth - 0.05);
      } else g.setDepth(DEPTH.scene + p.anchor.y / 10 - 1.1);
    }
    // Outline glow on the prop itself (WebGL only; preFX is null on the Canvas renderer).
    for (const [img, cur] of this.glowFx) {
      if (wanted.get(img) === cur.level && img.active) continue;
      if (img.active) img.preFX?.remove(cur.fx);
      this.glowFx.delete(img);
    }
    for (const [img, level] of wanted) {
      if (!img || this.glowFx.has(img) || !img.preFX) continue;
      const fx = level === "selected" ? img.preFX.addGlow(0xe3b04b, 5, 0, false, 0.1, 12) : img.preFX.addGlow(0xfff8e7, 3, 0, false, 0.1, 8);
      this.glowFx.set(img, { fx, level });
    }
  }

  // ── Characters ─────────────────────────────────────────────────────────────
  private sceneFor(s: SessionView): { anim: Anim; fx: Fx; offsetX: number; offsetY: number } {
    const kind = (s.status === "waiting" ? (s.waitingReason === "question" ? "question" : "waiting") : s.status === "finished" ? "done" : s.status === "error" ? "error" : s.status === "idle" ? "idle" : s.action?.kind ?? "think") as SceneKind;
    const sc = this.world.def.scenes[kind];
    return { anim: (sc?.anim ?? "idle") as Anim, fx: (sc?.fx ?? "none") as Fx, offsetX: sc?.offsetX ?? 0, offsetY: sc?.offsetY ?? 0 };
  }

  /** Which character pack a session uses: the person's choice for its project, else the world's defaults. */
  private packFor(s: SessionView): CharacterInfo | null {
    return pickCharacter(s, this.world, this.characters, this.assignments);
  }

  /** Sessions already running when the page opens start in place; later ones walk in from the edge. */
  private spawn(s: SessionView, tx: number, ty: number): Character {
    const W = this.world.def.size.width;
    const fromLeft = tx < W / 2;
    const arriving = this.t > 2.5;
    const x = arriving ? (fromLeft ? -50 : W + 50) : tx;
    const pack = this.packFor(s);
    const key = pack && this.textures.exists(`c:${pack.id}`) ? `c:${pack.id}` : "fallback-char";
    const scale = pack ? pack.def.scale : 3;
    const sprite = this.add.sprite(x, ty, key).setOrigin(0.5, 1).setScale(scale);
    const shadow = this.add.ellipse(x, ty, 40, 11, 0x000000, 0.28);
    const ring = this.add.graphics();
    return { id: s.id, pack: key === "fallback-char" ? null : pack, sprite, shadow, ring, x, y: ty, tx, ty, locationId: null, facingLeft: arriving ? !fromLeft : (hashString(s.id) & 1) === 1, phase: "entering", alpha: 0, companions: new Map(), seed: hashString(s.id), celebrateUntil: 0 };
  }

  private playAnim(c: Character, anim: Anim) {
    if (!c.pack) return;
    const has = (a: string) => !!c.pack!.def.animations[a as Anim];
    const key = `c:${c.pack.id}:${has(anim) ? anim : "idle"}`;
    if (c.animKey !== key) {
      c.animKey = key;
      c.sprite.play({ key, startFrame: c.seed % 3 });
    }
  }

  private targets(): Map<string, { x: number; y: number; locationId: string | null }> {
    const byProject = new Map<string, SessionView[]>();
    for (const s of this.inp.sessions) byProject.set(s.projectId, [...(byProject.get(s.projectId) ?? []), s]);
    this.placements = placeProjects([...byProject.keys()], this.world.def);
    this.syncOverflowProps();
    this.signs = [...this.placements.values()].map((p) => ({ projectId: p.projectId, x: p.sign.x, y: p.sign.y + this.propOffset(p.locationId), locationLabel: p.locationLabel }));
    const out = new Map<string, { x: number; y: number; locationId: string | null }>();
    for (const [pid, list] of byProject) {
      const p = this.placements.get(pid)!;
      const spots = standSpots(p, list.length);
      list.sort((a, b) => a.id.localeCompare(b.id)).forEach((s, i) => {
        const sc = this.sceneFor(s);
        out.set(s.id, { x: spots[i].x + sc.offsetX, y: spots[i].y + sc.offsetY, locationId: p.locationId });
      });
    }
    return out;
  }

  private setFx(c: Character, fx: Fx) {
    if (this.reduced) fx = "none";
    if (c.emitterFx === fx) return;
    c.emitter?.destroy();
    c.emitter = undefined;
    c.emitterFx = fx;
    const cfg: Record<string, Phaser.Types.GameObjects.Particles.ParticleEmitterConfig> = {
      sparks: { speed: { min: 60, max: 150 }, angle: { min: 200, max: 340 }, scale: { start: 0.55, end: 0 }, lifespan: 420, frequency: 85, tint: [0xffd166, 0xff8c42, 0x9fffc8], gravityY: 320, blendMode: "ADD" },
      steam: { speedY: { min: -32, max: -16 }, speedX: { min: -7, max: 7 }, scale: { start: 0.5, end: 1.8 }, alpha: { start: 0.4, end: 0 }, lifespan: 1700, frequency: 200, tint: 0xffffff },
      smoke: { speedY: { min: -40, max: -20 }, speedX: { min: -10, max: 10 }, scale: { start: 0.8, end: 2.4 }, alpha: { start: 0.5, end: 0 }, lifespan: 1500, frequency: 150, tint: 0x2a2a2a },
    };
    if (cfg[fx]) c.emitter = this.add.particles(c.x, c.y, "dot", cfg[fx]);
  }

  private drawRing(c: Character, s: SessionView | undefined, fx: Fx, headY: number) {
    const { palette } = this.world.def;
    c.ring.clear();
    if (!s) return;
    if (s.status === "waiting") {
      const urgent = isUrgent(s);
      const pulse = 0.22 + Math.abs(Math.sin(this.t * (urgent ? 5 : 2.6))) * 0.3;
      c.ring.fillStyle(hexToInt(urgent ? palette.urgent : palette.waiting), pulse * c.alpha);
      c.ring.fillEllipse(c.x, c.y, urgent ? 96 : 76, urgent ? 30 : 24);
      c.ring.lineStyle(2, hexToInt(urgent ? palette.urgent : palette.waiting), (0.6 - pulse * 0.5) * c.alpha);
      c.ring.strokeEllipse(c.x, c.y, 60 + pulse * 120, 18 + pulse * 36);
    }
    if (fx === "signal" && !this.reduced) {
      for (let k = 0; k < 2; k++) {
        const r = (((this.t * 34) + k * 20) % 40) + 8;
        c.ring.lineStyle(2, 0xbfe8ff, (1 - r / 48) * c.alpha);
        c.ring.strokeCircle(c.x + 18, headY - 6, r);
      }
    } else if (fx === "glow") {
      c.ring.fillStyle(hexToInt(palette.accent), 0.22 * c.alpha);
      c.ring.fillCircle(c.x, headY + 30, 46);
    }
    const highlighted = s.id === this.inp.selectedId || s.id === this.inp.hoveredId;
    if (highlighted) {
      c.ring.lineStyle(3, hexToInt(palette.accent), c.alpha * (s.id === this.inp.selectedId ? 1 : 0.6));
      c.ring.strokeEllipse(c.x, c.y, 62, 20);
    }
  }

  // ── Companions (subagents) ─────────────────────────────────────────────────
  private compText(size: number): Phaser.GameObjects.Text {
    return this.add.text(0, 0, "", { fontSize: `${size}px`, fontFamily: '"Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", system-ui, sans-serif', fontStyle: "bold", color: "#ffffff" })
      .setOrigin(0.5, 0.5).setResolution(2).setVisible(false);
  }

  private makeCompanion(c: Character, id: string): Companion {
    const key = c.pack ? `c:${c.pack.id}` : "fallback-char";
    const sprite = this.add.sprite(c.x, c.y, key).setOrigin(0.5, 1).setScale(0).setTint(0xcfeaff).setAlpha(0);
    const shadow = this.add.ellipse(c.x, c.y, 26, 7, 0x000000, 0.22).setAlpha(0);
    const fx = this.add.graphics();
    const seed = hashString(id);
    const comp: Companion = {
      sprite, shadow, fx, puffTexts: [], seed, ox: 0, oy: 4, tox: 0, toy: 4, alpha: 0, leaving: false,
      mode: "arrive", modeAt: this.t, until: 0, pauseUntil: 0, paceDir: 1, errDir: 1, errands: 0,
      facingLeft: (seed & 1) === 1, kind: "think", kindAt: this.t, bursts: [], puffs: [], nextPuffAt: 0,
    };
    if (!this.reduced) comp.bursts.push({ kind: "ring", ox: 0, oy: 4, t0: this.t });
    return comp;
  }

  private destroyCompanion(comp: Companion) {
    comp.sprite.destroy(); comp.shadow.destroy(); comp.fx.destroy();
    comp.prop?.destroy(); comp.bubble?.destroy();
    for (const t of comp.puffTexts) t.destroy();
  }

  private setCompMode(comp: Companion, mode: CompMode) { comp.mode = mode; comp.modeAt = this.t; comp.pauseUntil = 0; }

  /** Horizontal range a companion may walk in: the deck of a boat on water, else the world minus a margin. */
  private errandBounds(c: Character): { min: number; max: number; water: boolean } {
    const W = this.world.def.size.width;
    const l = c.locationId ? this.world.def.locations.find((x) => x.id === c.locationId) : undefined;
    if (l && l.propAnim === "bob") {
      const half = Math.max(40, (this.props.get(l.id)?.img.displayWidth ?? 200) / 2 - 60);
      return { min: l.x - half, max: l.x + half, water: true };
    }
    return { min: 60, max: W - 60, water: false };
  }

  /** Where this trip goes, as an offset from the parent: deterministic per subagent, varied a little per trip. */
  private errandTarget(c: Character, comp: Companion): { x: number; y: number } {
    const b = this.errandBounds(c);
    const far = comp.kind === "web";
    const base = far ? 180 + (comp.seed % 81) : 90 + (comp.seed % 71);
    const vary = ((comp.seed >>> (3 + (comp.errands % 6))) % 21) - 10;
    let dir: 1 | -1 = (comp.seed >>> 7) & 1 ? 1 : -1;
    const room = (d: number) => (d > 0 ? b.max - c.x : c.x - b.min);
    if (room(dir) < 90 && room(-dir) > room(dir)) dir = dir === 1 ? -1 : 1;
    comp.errDir = dir;
    const d = Math.max(24, Math.min(base + vary, room(dir)));
    return { x: dir * d, y: b.water ? 4 : 4 + ((((comp.seed >>> 5) % 3) - 1) * 8) };
  }

  /** The anim key to play, falling back when the pack lacks one (bash → write → idle). */
  private compAnimKey(c: Character, anim: Anim): string | undefined {
    if (!c.pack) return undefined;
    let a: Anim | undefined = anim;
    while (a && !c.pack.def.animations[a]) a = ANIM_FALLBACK[a];
    return `c:${c.pack.id}:${a && c.pack.def.animations[a] ? a : "idle"}`;
  }

  private updateCompanions(c: Character, s: SessionView | undefined, parentY: number): Map<string, WorldPos> {
    const subs = new Map((s?.subagents ?? []).filter((a) => a.status !== "finished").map((a) => [a.id, a]));
    for (const id of subs.keys()) if (!c.companions.has(id)) c.companions.set(id, this.makeCompanion(c, id));
    const pos = new Map<string, WorldPos>();
    const parentH = c.sprite.displayHeight;
    let slot = 0;
    for (const [id, comp] of c.companions) {
      const sub = subs.get(id);
      if (!sub && !comp.leaving) {
        comp.leaving = true;
        this.setCompMode(comp, "leave");
        if (!this.reduced) comp.bursts.push({ kind: "spark", ox: comp.ox, oy: comp.oy - 34, t0: this.t });
      }
      let slotX = 0;
      if (!comp.leaving) {
        const side = slot % 2 === 0 ? 1 : -1;
        slotX = side * (40 + Math.floor(slot / 2) * 30);
        slot++;
      }
      const kind: SceneKind = sub ? subKind(sub) : "done";
      if (kind !== comp.kind) { comp.kind = kind; comp.kindAt = this.t; }
      if (!this.stepCompanion(c, comp, slotX, parentY, parentH, sub?.status === "working")) {
        this.destroyCompanion(comp);
        c.companions.delete(id);
        continue;
      }
      const a = comp.alpha * c.alpha;
      pos.set(id, { x: c.x + comp.ox, y: parentY + comp.oy, alpha: comp.leaving ? 0 : a });
    }
    return pos;
  }

  /** One frame of a companion's little life. Returns false once it has gone. */
  private stepCompanion(c: Character, comp: Companion, slotX: number, parentY: number, parentH: number, working: boolean): boolean {
    const t = this.t, dt = this.dt, reduced = this.reduced, kind = comp.kind;
    const errandKind = !!ERRAND_PROP[kind];
    const busyKind = !!BUSY_PROP[kind];
    const pacing = (kind === "think" || kind === "delegate") && !reduced;
    let speed = COMP_SPEED;
    const arrived = () => Math.hypot(comp.tox - comp.ox, comp.toy - comp.oy) < 0.5;

    // 1) Decide where to go.
    switch (comp.mode) {
      case "arrive":
        comp.tox = comp.ox; comp.toy = comp.oy;
        if (reduced || t - comp.modeAt >= COMP_ARRIVE_S) { this.setCompMode(comp, "slot"); comp.until = t + 0.3; }
        break;
      case "slot": {
        comp.toy = 4;
        comp.tox = slotX + (pacing ? comp.paceDir * 16 : 0);
        if (pacing) speed = 38;
        if (reduced) { comp.ox = comp.tox; comp.oy = comp.toy; }
        if (pacing && arrived()) {
          if (!comp.pauseUntil) comp.pauseUntil = t + 0.7;
          else if (t >= comp.pauseUntil) { comp.paceDir = comp.paceDir === 1 ? -1 : 1; comp.pauseUntil = 0; }
        }
        if (errandKind && !reduced && arrived() && t >= comp.until) {
          const tg = this.errandTarget(c, comp);
          comp.tox = tg.x; comp.toy = tg.y;
          this.setCompMode(comp, "out");
          comp.prop?.setText(ERRAND_PROP[kind]!);
        }
        break;
      }
      case "out":
        if (!errandKind || reduced) { this.setCompMode(comp, "back"); comp.tox = comp.errDir * 22; comp.toy = 4; }
        else if (arrived()) {
          this.setCompMode(comp, "errand");
          comp.until = t + 1.5 + (((comp.seed >>> (comp.errands % 7)) & 15) / 15) * 1.5;
        }
        break;
      case "errand":
        if (t >= comp.until || !errandKind || reduced) { this.setCompMode(comp, "back"); comp.tox = comp.errDir * 22; comp.toy = 4; }
        break;
      case "back":
        if (arrived()) {
          if (!reduced) comp.bursts.push({ kind: "spark", ox: comp.errDir * 8, oy: -parentH * 0.55, t0: t });
          comp.errands++;
          this.setCompMode(comp, "slot");
          comp.until = t + 0.8;
        }
        break;
      case "leave":
        if (t - comp.modeAt < COMP_CHEER_S || reduced) { comp.tox = comp.ox; comp.toy = comp.oy; }
        else if (comp.tox === comp.ox) {
          const bnd = this.errandBounds(c);
          comp.tox = Phaser.Math.Clamp(c.x + comp.ox + (comp.ox < 0 ? -1 : 1) * 160, bnd.min, bnd.max) - c.x;
          if (comp.tox === comp.ox) comp.tox += 0.01; // at the edge already: just fade
        }
        speed = COMP_SPEED * 1.6;
        break;
    }

    // 2) Walk there (real elapsed time).
    const dx = comp.tox - comp.ox, dy = comp.toy - comp.oy, dist = Math.hypot(dx, dy);
    const step = speed * dt;
    const moving = dist > 0.5;
    if (moving) {
      if (dist <= step) { comp.ox = comp.tox; comp.oy = comp.toy; } else { comp.ox += (dx / dist) * step; comp.oy += (dy / dist) * step; }
      if (Math.abs(dx) > 0.3) comp.facingLeft = dx < 0;
    } else if (comp.mode === "slot") {
      comp.facingLeft = kind === "waiting" || kind === "question" ? false : comp.ox > 0; // face the parent; waiting ones look out at you
    }

    // 3) Fade, scale, animation.
    const sinceLeave = t - comp.modeAt;
    if (comp.leaving) {
      if (reduced || sinceLeave >= COMP_CHEER_S) comp.alpha -= dt * (reduced ? 2 : 1.25);
      if (comp.alpha <= 0) return false;
    } else comp.alpha = Math.min(1, comp.alpha + dt * 4);
    const base = (c.pack?.def.scale ?? 3) * COMP_SCALE;
    let k = 1;
    if (comp.mode === "arrive" && !reduced) {
      const p = (t - comp.modeAt) / COMP_ARRIVE_S;
      k = p < 0.6 ? Phaser.Math.Easing.Back.Out(p / 0.6) * 1.1 : 1.1 - 0.1 * ((p - 0.6) / 0.4);
    }
    let anim: Anim = "idle";
    if (moving) anim = "walk";
    else if (comp.mode === "leave") anim = "celebrate";
    else if (comp.mode === "errand") anim = "read";
    else if (comp.mode === "slot") {
      anim = kind === "write" || kind === "tool" ? "write" : kind === "bash" ? "bash"
        : kind === "waiting" || kind === "question" ? "wait" : kind === "error" ? "error"
        : errandKind && reduced ? "read" : "idle";
    }
    const key = this.compAnimKey(c, anim);
    if (key && comp.animKey !== key) { comp.animKey = key; comp.sprite.play({ key, startFrame: comp.seed % 3 }); }

    const x = c.x + comp.ox, feet = parentY + comp.oy;
    const busyHere = comp.mode === "slot" && !moving && busyKind && !reduced;
    const bob = busyHere ? -Math.abs(Math.sin(t * 7 + comp.seed)) * 1.6 : !c.pack && !reduced ? Math.sin(t * 3 + comp.seed) * 0.5 : 0;
    const alpha = Math.max(0, comp.alpha) * c.alpha;
    const depth = DEPTH.scene + (c.y + comp.oy) / 10 + 0.4;
    comp.sprite.setPosition(x, feet + bob).setScale(base * k).setFlipX(comp.facingLeft).setAlpha(alpha).setDepth(depth);
    comp.sprite.setTint(kind === "error" ? 0xc8b0b0 : 0xcfeaff);
    comp.shadow.setPosition(x, feet).setScale(k).setAlpha(0.22 * alpha * (1 - this.night * 0.5)).setDepth(depth - 0.2);
    const h = comp.sprite.displayHeight * 0.88, head = feet - h;

    // 4) Tether: a faint dotted thread back to the parent while it works (stronger when away on an errand).
    if (working && !reduced && !comp.leaving && Math.abs(comp.ox) > 26) {
      const away = comp.mode === "out" || comp.mode === "errand" || comp.mode === "back";
      const x0 = c.x, y0 = parentY - parentH * 0.4, x1 = x, y1 = feet - h * 0.45;
      const len = Math.hypot(x1 - x0, y1 - y0), n = Math.max(2, Math.floor(len / 10));
      const flow = (t * 0.6) % (1 / n);
      c.ring.fillStyle(0xbfe3ff, (away ? 0.45 : 0.25) * alpha);
      for (let i = 0; i <= n; i++) {
        const u = Math.min(1, i / n + flow);
        const sag = Math.sin(u * Math.PI) * Math.min(18, len * 0.12);
        c.ring.fillCircle(x0 + (x1 - x0) * u, y0 + (y1 - y0) * u + sag, 1.6);
      }
    }

    // 5) Effects: puff rings, sparkles, rising puffs, the ?/! bubble, the errand prop.
    const g = comp.fx.clear().setDepth(depth + 0.6);
    comp.bursts = comp.bursts.filter((b) => t - b.t0 < 0.6);
    for (const b of comp.bursts) {
      const p = (t - b.t0) / 0.6, bx = c.x + b.ox, by = parentY + b.oy;
      if (b.kind === "ring") {
        g.lineStyle(2, 0xffffff, 0.7 * (1 - p) * c.alpha).strokeEllipse(bx, by, 12 + 52 * p, 4 + 16 * p);
        g.fillStyle(0xf3efe2, 0.5 * (1 - p) * c.alpha);
        for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; g.fillCircle(bx + Math.cos(a) * 30 * p, by - 4 + Math.sin(a) * 9 * p - 6 * p, 2.5 * (1 - p) + 1); }
      } else {
        g.lineStyle(1.6, 0xffe08a, (1 - p) * c.alpha);
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * Math.PI * 2 + (b.t0 % 1), r = 4 + 18 * p, sx = bx + Math.cos(a) * r, sy = by + Math.sin(a) * r, l = 3.5 * (1 - p) + 1;
          g.lineBetween(sx - l, sy, sx + l, sy).lineBetween(sx, sy - l, sx, sy + l);
        }
      }
    }
    // Rising puffs while busy at the parent's side.
    if (busyHere && t >= comp.nextPuffAt) {
      comp.nextPuffAt = t + 0.85;
      comp.puffs.push({ t0: t, dx: ((comp.seed + comp.puffs.length * 7 + Math.floor(t * 3)) % 17) - 8, emoji: Math.floor(t / 0.85) % 2 === 0 });
    }
    comp.puffs = comp.puffs.filter((p) => t - p.t0 < 1.3);
    let ti = 0;
    for (const p of comp.puffs) {
      const u = (t - p.t0) / 1.3, px = x + p.dx + Math.sin(u * 5 + p.dx) * 3, py = head - 6 - u * 34;
      if (p.emoji) {
        if (!comp.puffTexts[ti]) comp.puffTexts[ti] = this.compText(18);
        comp.puffTexts[ti].setText(BUSY_PROP[kind] ?? "⚙️").setPosition(px, py).setAlpha(Math.min(1, Math.sin(u * Math.PI) * 1.6) * alpha).setScale(0.85 + u * 0.3).setDepth(depth + 0.7).setVisible(true);
        ti++;
      } else {
        g.fillStyle(0xffffff, 0.45 * (1 - u) * alpha).fillCircle(px, py, 2 + u * 4);
      }
    }
    for (let i = ti; i < comp.puffTexts.length; i++) comp.puffTexts[i].setVisible(false);
    // Errand prop: floats above the head while reading, carried at chest height on the way back.
    const carrying = comp.mode === "errand" || comp.mode === "back";
    if (carrying && !reduced) {
      comp.prop ??= this.compText(21);
      if (comp.prop.text === "") comp.prop.setText(ERRAND_PROP[kind] ?? "📜");
      const reading = comp.mode === "errand";
      const py = reading ? head - 10 + Math.sin(t * 3.2 + comp.seed) * 3 : feet - h * 0.55;
      comp.prop.setPosition(x + (reading ? 0 : (comp.facingLeft ? -9 : 9)), py).setScale(reading ? 1 : 0.75).setAlpha(alpha).setDepth(depth + 0.7).setVisible(true);
    } else if (comp.prop) comp.prop.setVisible(false).setText("");
    // ? while waiting for an answer, a red ! on error.
    const mark = comp.leaving || reduced ? "" : kind === "waiting" || kind === "question" ? "?" : kind === "error" ? "!" : "";
    if (mark) {
      comp.bubble ??= this.compText(12);
      const since = t - comp.kindAt;
      const pop = mark === "!" && since < 0.35 ? Phaser.Math.Easing.Back.Out(since / 0.35) * 1.15 : 1 + 0.1 * Math.sin(t * (mark === "!" ? 6 : 4));
      const bx = x + 11, by = head - 8;
      g.fillStyle(mark === "!" ? 0xef4444 : 0xf59e0b, 0.95 * alpha).fillCircle(bx, by, 8 * pop);
      g.lineStyle(1.5, 0xffffff, 0.8 * alpha).strokeCircle(bx, by, 8 * pop);
      comp.bubble.setText(mark).setPosition(bx, by).setScale(pop).setAlpha(alpha).setDepth(depth + 0.7).setVisible(true);
    } else comp.bubble?.setVisible(false);
    return true;
  }

  /** Completion: the world's effect (a row of nilavilakku lamps lighting up…). */
  private celebrate(c: Character) {
    c.celebrateUntil = Date.now() + CELEBRATE_MS;
    const comp = this.world.def.completion;
    if (!comp || this.reduced) return;
    const depth = c.sprite.depth + 2;
    if (comp.effect === "lamp-row") {
      const count = Phaser.Math.Clamp(Number(comp.params.count) || 7, 3, 15);
      const gap = 24, baseY = c.y + 30;
      for (let i = 0; i < count; i++) {
        const x = c.x + (i - (count - 1) / 2) * gap;
        const lamp = this.add.graphics().setDepth(depth).setAlpha(0);
        lamp.fillStyle(0x8a6418).fillRect(x - 6, baseY, 12, 3);
        lamp.fillStyle(0xd9a83a).fillRect(x - 1.5, baseY - 13, 3, 13).fillEllipse(x, baseY - 14, 14, 5);
        lamp.fillStyle(0xf2c45a).fillEllipse(x, baseY - 15, 8, 2.5);
        const halo = this.add.circle(x, baseY - 20, 14, 0xffb020, 0.35).setBlendMode(Phaser.BlendModes.ADD).setDepth(DEPTH.glow).setAlpha(0);
        const flame = this.add.ellipse(x, baseY - 20, 5, 10, 0xffd166).setDepth(depth + 1).setAlpha(0);
        this.tweens.add({ targets: lamp, alpha: 1, delay: i * 90, duration: 220 });
        this.tweens.add({ targets: [flame, halo], alpha: 1, delay: i * 130 + 200, duration: 260 });
        this.tweens.add({ targets: flame, scaleX: 0.65, scaleY: 1.15, yoyo: true, repeat: 10, duration: 160 + (i % 3) * 30, delay: i * 130 + 460 });
        this.tweens.add({ targets: [lamp, flame, halo], alpha: 0, delay: 4600 + i * 50, duration: 700, onComplete: () => { lamp.destroy(); flame.destroy(); halo.destroy(); } });
      }
    } else {
      const burst = this.add.particles(c.x, c.y - 50, "dot", {
        speed: { min: 90, max: 240 }, lifespan: 1000, emitting: false, gravityY: 260,
        tint: [0xffd166, 0xef476f, 0x06d6a0, 0x118ab2], scale: { start: 1, end: 0 },
      }).setDepth(DEPTH.glow);
      burst.explode(46);
      this.time.delayedCall(1600, () => burst.destroy());
    }
  }

  private updateCharacters() {
    const sessions = new Map(this.inp.sessions.map((s) => [s.id, s]));
    const targets = this.targets();
    const W = this.world.def.size.width;
    for (const s of sessions.values()) if (!this.chars.has(s.id)) {
      const t = targets.get(s.id)!;
      this.chars.set(s.id, this.spawn(s, t.x, t.y));
    }
    const now = Date.now();
    for (const [id, c] of this.chars) {
      const s = sessions.get(id);
      if (!s && c.phase !== "leaving") {
        c.phase = "leaving";
        c.tx = c.x < W / 2 ? -70 : W + 70;
        c.ty = c.y;
        c.locationId = null;
      } else if (s) {
        const t = targets.get(id)!;
        c.tx = t.x;
        c.ty = t.y;
        c.locationId = t.locationId;
        const key = `${s.status}:${s.waitingReason ?? ""}`;
        const finishedTurn = c.lastStatus?.startsWith("working") && (key === "waiting:turn_end" || s.status === "finished");
        if (finishedTurn || (c.lastStatus && c.lastStatus !== key && s.status === "finished")) this.celebrate(c);
        c.lastStatus = key;
      }
      const bobY = this.propOffset(c.locationId);
      const dx = c.tx - c.x, dy = c.ty - c.y, dist = Math.hypot(dx, dy);
      const step = WALK_SPEED * this.dt * (c.phase === "leaving" ? 1.5 : 1);
      const moving = dist > 1;
      if (moving) {
        if (dist <= step) { c.x = c.tx; c.y = c.ty; } else { c.x += (dx / dist) * step; c.y += (dy / dist) * step; }
        if (Math.abs(dx) > 0.5) c.facingLeft = dx < 0;
      } else if (c.phase === "entering") c.phase = "alive";
      const fade = (this.dt * 1000) / FADE_MS;
      c.alpha = c.phase === "leaving" ? (dist < 90 ? Math.max(0, c.alpha - fade) : c.alpha) : Math.min(1, c.alpha + fade);
      if (c.phase === "leaving" && (c.alpha <= 0 || !moving)) {
        c.sprite.destroy(); c.shadow.destroy(); c.ring.destroy(); c.emitter?.destroy();
        for (const comp of c.companions.values()) this.destroyCompanion(comp);
        this.chars.delete(id);
        this.positions.delete(id);
        continue;
      }
      const sc = s ? this.sceneFor(s) : { anim: "walk" as Anim, fx: "none" as Fx };
      const anim: Anim = moving ? "walk" : now < c.celebrateUntil ? "celebrate" : sc.anim;
      this.playAnim(c, anim);
      if (!c.pack && !this.reduced) c.sprite.y += Math.sin(this.t * 3) * 0.5; // fallback figure breathes a little
      const y = c.y + bobY;
      const depth = DEPTH.scene + c.y / 10 + 0.5;
      c.sprite.setPosition(c.x, y).setFlipX(c.facingLeft).setAlpha(c.alpha).setDepth(depth);
      if (anim === "error") c.sprite.setTint(0xb8b8b8); else c.sprite.clearTint();
      c.shadow.setPosition(c.x, y).setAlpha(0.28 * c.alpha * (1 - this.night * 0.5)).setDepth(depth - 0.2);
      c.ring.setDepth(depth - 0.3);
      const height = c.sprite.displayHeight;
      const fx = moving ? "none" : sc.fx;
      this.setFx(c, fx);
      if (c.emitter) c.emitter.setPosition(c.x + (fx === "sparks" ? 14 : 0), y - (fx === "steam" ? height + 8 : fx === "sparks" ? height * 0.45 : height * 0.8)).setDepth(depth + 1);
      this.drawRing(c, s, fx, y - height);
      const comps = this.updateCompanions(c, s, y);
      this.positions.set(id, { hero: { x: c.x, y, alpha: c.alpha }, head: { x: c.x, y: y - height }, companions: comps });
    }
  }

  // ── Input: drag to pan, wheel to zoom, click to select ─────────────────────
  private setupInput() {
    const cam = this.cameras.main;
    this.input.on("pointerdown", (p: Phaser.Input.Pointer) => {
      if (p.event?.target !== this.game.canvas) return;
      this.dragFrom = { x: p.x, y: p.y, sx: cam.scrollX, sy: cam.scrollY };
      this.dragged = false;
    });
    this.input.on("pointermove", (p: Phaser.Input.Pointer) => {
      if (!this.dragFrom || !p.isDown) {
        // Hover: pointer cursor over a villager or a project's place (villagers first).
        if (p.event?.target !== this.game.canvas) { this.canvasHoverProject = null; return; }
        const w = cam.getWorldPoint(p.x, p.y);
        const villager = this.villagerAt(w.x, w.y);
        this.canvasHoverProject = !villager && this.inp.onSelectProject ? pickPlace(w.x, w.y, this.placeRects()) : null;
        this.game.canvas.style.cursor = villager || this.canvasHoverProject ? "pointer" : "";
        return;
      }
      const dx = p.x - this.dragFrom.x, dy = p.y - this.dragFrom.y;
      if (Math.hypot(dx, dy) > 6) this.dragged = true;
      if (this.dragged) cam.setScroll(this.dragFrom.sx - dx / cam.zoom, this.dragFrom.sy - dy / cam.zoom);
    });
    this.input.on("pointerup", (p: Phaser.Input.Pointer) => {
      const wasDrag = this.dragged;
      this.dragFrom = null;
      // Phaser hears mouse-ups on the whole window: a click on an HTML label or
      // panel above the canvas must not also select (and so toggle) here.
      if (wasDrag || p.event?.target !== this.game.canvas) return;
      const w = cam.getWorldPoint(p.x, p.y);
      const villager = this.villagerAt(w.x, w.y);
      if (villager) { this.inp.onSelect(villager); return; }
      if (!this.inp.onSelectProject) return;
      const project = pickPlace(w.x, w.y, this.placeRects());
      if (project) this.inp.onSelectProject(project);
    });
    this.input.on("gameout", () => {
      this.canvasHoverProject = null;
      this.game.canvas.style.cursor = "";
    });
    this.input.on("wheel", (p: Phaser.Input.Pointer, _o: unknown, _dx: number, dy: number) => {
      const before = cam.getWorldPoint(p.x, p.y);
      const zoom = Phaser.Math.Clamp(cam.zoom * (dy > 0 ? 0.9 : 1.1), 1, 3);
      cam.setZoom(zoom);
      const after = cam.getWorldPoint(p.x, p.y);
      cam.scrollX += before.x - after.x;
      cam.scrollY += before.y - after.y;
    });
  }

  /** The villager under a world point (villagers win over the place behind them). */
  private villagerAt(x: number, y: number): string | null {
    for (const [id, c] of this.chars) {
      if (c.phase === "leaving") continue;
      const h = c.sprite.displayHeight;
      if (Math.abs(c.x - x) < 26 && y > c.sprite.y - h && y < c.sprite.y + 6) return id;
    }
    return null;
  }

  update() {
    const nowMs = performance.now();
    this.dt = this.lastFrameAt ? Math.min(nowMs - this.lastFrameAt, 1000) / 1000 : 0;
    this.lastFrameAt = nowMs;
    this.t += this.dt;
    const now = Date.now();
    if (!this.reduced) for (const s of this.scrollers) s.sprite.tilePositionX += s.speed * this.dt;
    this.updateWeather(now);
    this.updateLight(now);
    this.updateDecor();
    this.updateCharacters();
    this.updatePlaceHighlight();
  }
}
