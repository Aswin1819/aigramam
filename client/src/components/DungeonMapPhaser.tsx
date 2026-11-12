/**
 * TEMPORARY scaffold renderer (Phase 1 only).
 * Phase 2 replaces it with the data-driven world system and deletes it,
 * together with its third-party sprites. Text is not drawn here: MapLabels
 * renders name tags and action bubbles as HTML on top of the canvas.
 */
import { useEffect, useRef } from "react";
import Phaser from "phaser";
import type { SessionView } from "@shared/model";
import { isUrgent } from "@/lib/status";
import MapLabels from "./MapLabels";

export interface MapHero {
  id: string;
  room: RoomKey;
  attacking: boolean;
  waiting: boolean;
  urgent: boolean;
  companions: string[];
}

export interface WorldPos { x: number; y: number; alpha: number }
export interface HeroPositions { hero: WorldPos; companions: Map<string, WorldPos> }

type RoomKey = "church" | "corridor" | "boss_arena" | "shop" | "rest_area";

/** Which room a session stands in, from what it's doing. */
export function sessionToMapHero(s: SessionView): MapHero {
  const k = s.action?.kind;
  let room: RoomKey = "rest_area";
  if (s.status === "waiting" || s.status === "error") room = "church";
  else if (s.status === "working") {
    if (k === "read" || k === "search") room = "corridor";
    else if (k === "web" || k === "think") room = "shop";
    else room = "boss_arena";
  }
  return {
    id: s.id,
    room,
    attacking: s.status === "working" && (k === "bash" || k === "write" || k === "delegate" || k === "tool"),
    waiting: s.status === "waiting",
    urgent: isUrgent(s),
    companions: s.subagents.filter((a) => a.status !== "finished").map((a) => a.id),
  };
}

// ─── Tile / Scale constants ───────────────────────────────────────────────────
const TILE = 16;
const SCALE = 3;
const TS = TILE * SCALE; // 48px per tile
const MAP_COLS = 70;
const MAP_ROWS = 40;
export const CANVAS_W = MAP_COLS * TS; // 3360
export const CANVAS_H = MAP_ROWS * TS; // 1920

// ─── Room definitions ─────────────────────────────────────────────────────────
const ROOMS = {
  spawn:   { c0: 0,  r0: 0,  c1: 19, r1: 19 },
  dungeon: { c0: 20, r0: 0,  c1: 39, r1: 19 },
  boss:    { c0: 40, r0: 0,  c1: 69, r1: 39 },
  shop:    { c0: 0,  r0: 20, c1: 19, r1: 39 },
  rest:    { c0: 20, r0: 20, c1: 39, r1: 39 },
} as const;
type RoomId = keyof typeof ROOMS;

const ROOM_WALKABLE: Record<RoomId, { c0: number; r0: number; c1: number; r1: number }> = {
  spawn:   { c0: 2,  r0: 2,  c1: 16, r1: 16 },
  dungeon: { c0: 22, r0: 2,  c1: 34, r1: 16 },
  boss:    { c0: 42, r0: 2,  c1: 67, r1: 37 },
  shop:    { c0: 2,  r0: 22, c1: 16, r1: 37 },
  rest:    { c0: 22, r0: 22, c1: 37, r1: 37 },
};

const ROOM_CENTERS: Record<RoomId, { col: number; row: number }> = {
  spawn:   { col: 9,  row: 9  },
  dungeon: { col: 28, row: 9  },
  boss:    { col: 52, row: 21 },
  shop:    { col: 13, row: 29 },
  rest:    { col: 29, row: 29 },
};

/** Spread several characters in the same room so they don't stand on each other. */
const SLOT_OFFSETS: Array<[number, number]> = [[0, 0], [-5, 3], [5, 3], [-5, -3], [5, -3], [0, 6], [0, -6], [-5, 6], [5, 6], [-5, -6], [5, -6], [-2, 0], [2, 0]];

function buildWalkableGrid(): boolean[][] {
  const grid: boolean[][] = Array.from({ length: MAP_ROWS }, () => new Array(MAP_COLS).fill(false));
  for (const w of Object.values(ROOM_WALKABLE)) {
    for (let r = w.r0; r <= w.r1; r++)
      for (let c = w.c0; c <= w.c1; c++)
        if (r >= 0 && r < MAP_ROWS && c >= 0 && c < MAP_COLS) grid[r][c] = true;
  }
  for (let r = 8;  r <= 11; r++) for (let c = 16; c <= 22; c++) grid[r][c] = true;
  for (let r = 8;  r <= 11; r++) for (let c = 34; c <= 42; c++) grid[r][c] = true;
  for (let c = 7;  c <= 12; c++) for (let r = 16; r <= 22; r++) grid[r][c] = true;
  for (let c = 27; c <= 32; c++) for (let r = 16; r <= 22; r++) grid[r][c] = true;
  for (let r = 27; r <= 32; r++) for (let c = 16; c <= 22; c++) grid[r][c] = true;
  for (let r = 35; r <= 38; r++) for (let c = 37; c <= 42; c++) grid[r][c] = true;
  return grid;
}
const WALKABLE = buildWalkableGrid();

function bfsPath(fromCol: number, fromRow: number, toCol: number, toRow: number): Array<{ col: number; row: number }> {
  if (fromCol === toCol && fromRow === toRow) return [];
  const clampC = (c: number) => Math.max(0, Math.min(MAP_COLS - 1, c));
  const clampR = (r: number) => Math.max(0, Math.min(MAP_ROWS - 1, r));
  const fc = clampC(fromCol), fr = clampR(fromRow), tc = clampC(toCol), tr = clampR(toRow);
  type Node = { col: number; row: number; parent: Node | null };
  const visited = new Uint8Array(MAP_ROWS * MAP_COLS);
  const queue: Node[] = [{ col: fc, row: fr, parent: null }];
  visited[fr * MAP_COLS + fc] = 1;
  const dirs = [[0, 1], [0, -1], [1, 0], [-1, 0], [1, 1], [1, -1], [-1, 1], [-1, -1]];
  let head = 0;
  while (head < queue.length) {
    const cur = queue[head++];
    if (cur.col === tc && cur.row === tr) {
      const path: Array<{ col: number; row: number }> = [];
      let node: Node | null = cur;
      while (node) { path.unshift({ col: node.col, row: node.row }); node = node.parent; }
      return path.slice(1);
    }
    for (const [dc, dr] of dirs) {
      const nc = cur.col + dc, nr = cur.row + dr;
      if (nc < 0 || nc >= MAP_COLS || nr < 0 || nr >= MAP_ROWS || !WALKABLE[nr][nc]) continue;
      const idx = nr * MAP_COLS + nc;
      if (visited[idx]) continue;
      visited[idx] = 1;
      queue.push({ col: nc, row: nr, parent: cur });
    }
  }
  return [{ col: tc, row: tr }];
}

const ROOM_OF: Record<RoomKey, RoomId> = { church: "spawn", corridor: "dungeon", boss_arena: "boss", shop: "shop", rest_area: "rest" };

function targetTile(room: RoomId, slot: number) {
  const c = ROOM_CENTERS[room];
  const w = ROOM_WALKABLE[room];
  const [dc, dr] = SLOT_OFFSETS[slot % SLOT_OFFSETS.length];
  const col = Math.max(w.c0, Math.min(w.c1, c.col + dc));
  const row = Math.max(w.r0, Math.min(w.r1, c.row + dr));
  return { col, row };
}

// ─── Phaser Scene ─────────────────────────────────────────────────────────────

/** Movement speed in world pixels per second (time-based, so slow or throttled tabs still arrive). */
const HERO_SPEED = 180;
const HERO_SCALE = 4;
const COMPANION_SCALE = 2.4;
const SPAWN_MS = 700;

interface CompanionSprite { sprite: Phaser.GameObjects.Sprite; alpha: number; leaving: boolean }

interface HeroSprite {
  sprite: Phaser.GameObjects.Sprite;
  glow: Phaser.GameObjects.Graphics;
  companions: Map<string, CompanionSprite>;
  px: number; py: number; col: number; row: number;
  path: Array<{ col: number; row: number }>;
  pathIdx: number;
  isMoving: boolean;
  facingLeft: boolean;
  phase: "spawning" | "alive" | "despawning" | "gone";
  timer: number;
  targetKey: string;
}

class DungeonScene extends Phaser.Scene {
  private heroSprites = new Map<string, HeroSprite>();
  private heroData: MapHero[] = [];
  private selectedId: string | null = null;
  private onHeroClick: (id: string) => void = () => {};
  private bossSprite!: Phaser.GameObjects.Sprite;
  private glows: Phaser.GameObjects.Graphics[] = [];
  private tick = 0;
  /** Seconds since the previous frame, capped so a paused tab doesn't teleport too far at once. */
  private dt = 0;
  /** World positions of every character, read each frame by the HTML label layer. */
  readonly positions = new Map<string, HeroPositions>();

  constructor() {
    super({ key: "DungeonScene" });
  }

  preload() {
    this.load.image("dungeon_bg", "/sprites/mv/tilesets/dungeon_bg_v2.png");
    const sheet = (key: string, file: string, size: number) => this.load.spritesheet(key, `/sprites/mv/${file}`, { frameWidth: size, frameHeight: size });
    sheet("player_idle_r", "player/char_idle_right_anim.png", 16);
    sheet("player_idle_l", "player/char_idle_left_anim.png", 16);
    sheet("player_run_r", "player/char_run_right_anim.png", 16);
    sheet("player_run_l", "player/char_run_left_anim.png", 16);
    sheet("player_attack_r", "player/char_attack_00_right_anim.png", 16);
    sheet("player_attack_l", "player/char_attack_00_left_anim.png", 16);
    sheet("boss_idle", "boss/lord_wizard_idle_anim.png", 48);
    sheet("boss_attack", "boss/lord_wizard_attack_00_right_anim.png", 48);
    sheet("guardian_idle", "enemies/guardian_idle_right_anim.png", 16);
    sheet("witch_idle", "npcs/witch_merchant_idle.png", 32);
    this.load.spritesheet("torch_s", "/sprites/mv/props/light_source_00_anim.png", { frameWidth: 16, frameHeight: 16 });
    this.load.spritesheet("torch_t", "/sprites/mv/props/light_source_03_anim.png", { frameWidth: 16, frameHeight: 48 });

    const c = document.createElement("canvas");
    c.width = 8; c.height = 8;
    const g = c.getContext("2d")!;
    const grad = g.createRadialGradient(4, 4, 0, 4, 4, 4);
    grad.addColorStop(0, "rgba(255,255,255,1)");
    grad.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = grad;
    g.fillRect(0, 0, 8, 8);
    this.textures.addCanvas("particle", c);
  }

  create() {
    this.add.image(0, 0, "dungeon_bg").setOrigin(0, 0).setDisplaySize(CANVAS_W, CANVAS_H);
    const a = this.anims;
    const anim = (key: string, end: number, rate: number) => a.create({ key, frames: a.generateFrameNumbers(key, { start: 0, end }), frameRate: rate, repeat: -1 });
    anim("player_idle_r", 5, 6); anim("player_idle_l", 5, 6);
    anim("player_run_r", 7, 12); anim("player_run_l", 7, 12);
    anim("player_attack_r", 9, 10); anim("player_attack_l", 9, 10);
    anim("boss_idle", 5, 6); anim("boss_attack", 5, 10);
    anim("guardian_idle", 11, 8); anim("witch_idle", 9, 8);
    anim("torch_s", 3, 8); anim("torch_t", 3, 8);

    const center = (r: RoomId) => ({ x: (ROOMS[r].c0 + ROOMS[r].c1 + 1) / 2 * TS, y: (ROOMS[r].r0 + ROOMS[r].r1 + 1) / 2 * TS });
    const boss = center("boss");
    this.bossSprite = this.add.sprite(boss.x + 360, boss.y, "boss_idle").setScale(5).play("boss_idle");
    const guard = center("dungeon");
    this.add.sprite(guard.x + 200, guard.y, "guardian_idle").setScale(3.5).play("guardian_idle");
    const shop = center("shop");
    this.add.sprite(shop.x + 200, shop.y, "witch_idle").setScale(3.5).play("witch_idle");

    const torches: Array<[number, number, boolean]> = [
      [ROOMS.spawn.c0 + 3, ROOMS.spawn.r0 + 10, false], [ROOMS.spawn.c1 - 2, ROOMS.spawn.r0 + 10, false],
      [ROOMS.dungeon.c0 + 3, ROOMS.dungeon.r0 + 7, true], [ROOMS.dungeon.c1 - 2, ROOMS.dungeon.r0 + 7, true],
      [ROOMS.boss.c0 + 2, ROOMS.boss.r0 + 3, true], [ROOMS.boss.c1 - 2, ROOMS.boss.r0 + 3, true],
      [ROOMS.shop.c0 + 3, ROOMS.shop.r1 - 4, false], [ROOMS.rest.c0 + 3, ROOMS.rest.r0 + 6, false],
    ];
    for (const [c, r, tall] of torches) {
      const key = tall ? "torch_t" : "torch_s";
      this.add.sprite(c * TS, r * TS, key).setScale(2.5).play(key);
      this.add.particles(c * TS, r * TS, "particle", {
        speed: { min: 10, max: 30 }, angle: { min: 250, max: 290 }, scale: { start: 0.3, end: 0 },
        alpha: { start: 0.6, end: 0 }, tint: [0xff8822, 0xffaa44], lifespan: { min: 300, max: 600 }, frequency: 90, quantity: 1,
      });
    }
    for (let i = 0; i < 2; i++) this.glows.push(this.add.graphics().setDepth(5));

    this.input.on("pointerdown", (p: Phaser.Input.Pointer) => {
      for (const [id, hs] of this.heroSprites) {
        if (hs.phase === "alive" && Math.hypot(hs.px - p.worldX, hs.py - p.worldY) < 48) {
          this.onHeroClick(id);
          return;
        }
      }
    });
  }

  updateHeroes(heroes: MapHero[], selectedId: string | null, onHeroClick: (id: string) => void) {
    this.heroData = heroes;
    this.selectedId = selectedId;
    this.onHeroClick = onHeroClick;
  }

  private lastFrameAt = 0;

  update() {
    this.tick++;
    // Real elapsed time: Phaser's own delta is smoothed and clamped, so it
    // under-reports when the browser throttles frames (background tabs, slow PCs).
    const nowMs = performance.now();
    this.dt = this.lastFrameAt ? Math.min(nowMs - this.lastFrameAt, 1000) / 1000 : 0;
    this.lastFrameAt = nowMs;
    const t = this.tick;
    const boss = { x: (ROOMS.boss.c0 + ROOMS.boss.c1 + 1) / 2 * TS, y: (ROOMS.boss.r0 + ROOMS.boss.r1 + 1) / 2 * TS };
    const fighting = this.heroData.some((h) => h.attacking);
    const [bossGlow, spawnGlow] = this.glows;
    bossGlow.clear();
    bossGlow.fillStyle(fighting ? 0xff0066 : 0xaa00ff, fighting ? 0.15 + Math.sin(t * 0.1) * 0.08 : 0.06);
    bossGlow.fillCircle(boss.x + 360, boss.y, 200);
    spawnGlow.clear();
    const anyWaiting = this.heroData.some((h) => h.waiting);
    const sp = { x: ROOM_CENTERS.spawn.col * TS, y: ROOM_CENTERS.spawn.row * TS };
    spawnGlow.fillStyle(anyWaiting ? 0xffaa00 : 0x4488ff, anyWaiting ? 0.25 + Math.sin(t * 0.15) * 0.12 : 0.15);
    spawnGlow.fillCircle(sp.x, sp.y, anyWaiting ? 260 : 90);

    const bossAnim = fighting ? "boss_attack" : "boss_idle";
    if (this.bossSprite.anims.currentAnim?.key !== bossAnim) this.bossSprite.play(bossAnim);

    this.syncHeroes();
    this.moveHeroes();
    this.drawHeroes();
  }

  /** Same-room characters get different slots, in a stable order. */
  private targets(): Map<string, { col: number; row: number; key: string }> {
    const byRoom = new Map<RoomId, MapHero[]>();
    for (const h of this.heroData) {
      const r = ROOM_OF[h.room];
      byRoom.set(r, [...(byRoom.get(r) ?? []), h]);
    }
    const out = new Map<string, { col: number; row: number; key: string }>();
    for (const [room, list] of byRoom) {
      list.sort((a, b) => a.id.localeCompare(b.id)).forEach((h, i) => {
        const tile = targetTile(room, i);
        out.set(h.id, { ...tile, key: `${room}:${i}` });
      });
    }
    return out;
  }

  private syncHeroes() {
    const ids = new Set(this.heroData.map((h) => h.id));
    for (const h of this.heroData) if (!this.heroSprites.has(h.id)) this.spawn(h);
    for (const [id, hs] of this.heroSprites) {
      if (!ids.has(id) && hs.phase !== "despawning" && hs.phase !== "gone") {
        const s = ROOM_CENTERS.spawn;
        hs.path = bfsPath(hs.col, hs.row, s.col, s.row);
        hs.pathIdx = 0;
        hs.isMoving = hs.path.length > 0;
        hs.phase = "despawning";
        hs.timer = 0;
      }
    }
  }

  private spawn(h: MapHero) {
    const s = ROOM_CENTERS.spawn;
    const px = s.col * TS + TS / 2, py = s.row * TS + TS / 2;
    const sprite = this.add.sprite(px, py, "player_idle_r").setScale(HERO_SCALE).setDepth(50).play("player_idle_r");
    const glow = this.add.graphics().setDepth(45);
    this.heroSprites.set(h.id, {
      sprite, glow, companions: new Map(), px, py, col: s.col, row: s.row,
      path: [], pathIdx: 0, isMoving: false, facingLeft: false, phase: "spawning", timer: 0, targetKey: "",
    });
  }

  /** Walk along the path, covering speed × dt pixels this frame (may pass several tiles). */
  private step(hs: HeroSprite, speed: number) {
    let budget = speed * this.dt;
    while (budget > 0 && hs.isMoving && hs.pathIdx < hs.path.length) {
      const next = hs.path[hs.pathIdx];
      const tx = next.col * TS + TS / 2, ty = next.row * TS + TS / 2;
      const dx = tx - hs.px, dy = ty - hs.py, dist = Math.hypot(dx, dy);
      if (dx !== 0) hs.facingLeft = dx < 0;
      if (dist <= budget) {
        budget -= dist;
        hs.px = tx; hs.py = ty; hs.col = next.col; hs.row = next.row;
        hs.pathIdx++;
        if (hs.pathIdx >= hs.path.length) hs.isMoving = false;
      } else {
        hs.px += (dx / dist) * budget;
        hs.py += (dy / dist) * budget;
        budget = 0;
      }
    }
  }

  private moveHeroes() {
    const targets = this.targets();
    for (const h of this.heroData) {
      const hs = this.heroSprites.get(h.id);
      if (!hs) continue;
      if (hs.phase === "spawning") {
        hs.timer += this.dt * 1000;
        if (hs.timer >= SPAWN_MS) hs.phase = "alive";
        continue;
      }
      const tgt = targets.get(h.id)!;
      if (tgt.key !== hs.targetKey) {
        hs.path = bfsPath(hs.col, hs.row, tgt.col, tgt.row);
        hs.pathIdx = 0;
        hs.isMoving = hs.path.length > 0;
        hs.targetKey = tgt.key;
      }
      this.step(hs, HERO_SPEED);
      if (!hs.isMoving && h.room === "boss_arena") hs.facingLeft = false;
    }
    const live = new Set(this.heroData.map((h) => h.id));
    for (const [id, hs] of this.heroSprites) {
      if (live.has(id) || hs.phase !== "despawning") continue;
      if (hs.isMoving) this.step(hs, HERO_SPEED * 2);
      else if ((hs.timer += this.dt * 1000) >= SPAWN_MS) hs.phase = "gone";
      if (hs.phase === "gone") {
        hs.sprite.destroy();
        hs.glow.destroy();
        for (const c of hs.companions.values()) c.sprite.destroy();
        this.heroSprites.delete(id);
        this.positions.delete(id);
      }
    }
  }

  private drawHeroes() {
    const data = new Map(this.heroData.map((h) => [h.id, h]));
    for (const [id, hs] of this.heroSprites) {
      const h = data.get(id);
      const alpha = Math.max(0, Math.min(1, hs.phase === "spawning" ? hs.timer / SPAWN_MS : hs.phase === "despawning" && !hs.isMoving ? 1 - hs.timer / SPAWN_MS : 1));
      hs.sprite.setPosition(hs.px, hs.py).setAlpha(alpha);
      const dir = hs.facingLeft ? "l" : "r";
      const key = hs.isMoving ? `player_run_${dir}` : h?.attacking ? `player_attack_${dir}` : `player_idle_${dir}`;
      if (hs.sprite.anims.currentAnim?.key !== key) hs.sprite.play(key);

      hs.glow.clear();
      if (h?.waiting) {
        const pulse = 0.25 + Math.sin(this.tick * (h.urgent ? 0.25 : 0.12)) * 0.15;
        hs.glow.fillStyle(h.urgent ? 0xff3b30 : 0xffb020, pulse);
        hs.glow.fillCircle(hs.px, hs.py, 46);
      }
      if (id === this.selectedId) {
        hs.glow.lineStyle(4, 0xffd700, 0.95);
        hs.glow.strokeCircle(hs.px, hs.py, 40);
      }

      // Subagent companions: smaller, tinted, beside their parent; fade in and out.
      const wanted = new Set(h?.companions ?? []);
      for (const cid of wanted) {
        if (!hs.companions.has(cid)) {
          const sprite = this.add.sprite(hs.px, hs.py, "player_idle_r").setScale(COMPANION_SCALE).setTint(0x88ccff).setDepth(49).play("player_idle_r");
          hs.companions.set(cid, { sprite, alpha: 0, leaving: false });
        }
      }
      const compPos = new Map<string, WorldPos>();
      let i = 0;
      for (const [cid, c] of hs.companions) {
        c.leaving = !wanted.has(cid);
        c.alpha = Math.max(0, Math.min(1, c.alpha + this.dt * (c.leaving ? -1.5 : 2)));
        if (c.leaving && c.alpha <= 0) {
          c.sprite.destroy();
          hs.companions.delete(cid);
          continue;
        }
        const side = i % 2 === 0 ? 1 : -1;
        const x = hs.px + side * (60 + Math.floor(i / 2) * 44) + (c.leaving ? side * (1 - c.alpha) * 80 : 0);
        const y = hs.py + 18;
        c.sprite.setPosition(x, y).setAlpha(c.alpha * alpha).setFlipX(side < 0);
        compPos.set(cid, { x, y, alpha: c.alpha * alpha });
        i++;
      }
      this.positions.set(id, { hero: { x: hs.px, y: hs.py, alpha }, companions: compPos });
    }
  }
}

// ─── React Component ──────────────────────────────────────────────────────────

interface Props {
  sessions: SessionView[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  now: number;
}

export default function DungeonMapPhaser({ sessions, selectedId, onSelect, now }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<DungeonScene | null>(null);
  const latest = useRef({ heroes: [] as MapHero[], selectedId, onSelect });
  latest.current = { heroes: sessions.map(sessionToMapHero), selectedId, onSelect };

  useEffect(() => {
    if (!hostRef.current) return;
    const game = new Phaser.Game({
      type: Phaser.AUTO,
      parent: hostRef.current,
      backgroundColor: "#0a0810",
      pixelArt: true,
      roundPixels: true,
      scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH, width: CANVAS_W, height: CANVAS_H },
      scene: [DungeonScene],
    });
    game.events.once("ready", () => {
      const scene = game.scene.getScene("DungeonScene") as DungeonScene;
      sceneRef.current = scene;
      const l = latest.current;
      scene.updateHeroes(l.heroes, l.selectedId, l.onSelect);
    });
    return () => {
      game.destroy(true);
      sceneRef.current = null;
    };
  }, []);

  useEffect(() => {
    sceneRef.current?.updateHeroes(latest.current.heroes, selectedId, onSelect);
  }, [sessions, selectedId, onSelect]);

  return (
    <div ref={wrapRef} className="relative h-full w-full overflow-hidden bg-[#0a0810]" style={{ cursor: "pointer" }}>
      <div ref={hostRef} className="absolute inset-0" />
      <MapLabels wrapRef={wrapRef} sceneRef={sceneRef} sessions={sessions} selectedId={selectedId} onSelect={onSelect} now={now} worldWidth={CANVAS_W} />
    </div>
  );
}
