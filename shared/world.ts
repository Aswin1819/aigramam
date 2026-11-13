/**
 * World pack format (worlds/<id>/world.json). Data only: effects and
 * animations are chosen from fixed built-in lists, never code.
 * See docs/WORLDS.md for the full guide.
 */
import { z } from "zod";

export const WORLD_SCHEMA_VERSION = 1;

const id = z.string().regex(/^[a-z0-9-]{1,40}$/, "use lowercase letters, digits and - (max 40)");
const color = z.string().regex(/^#([0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/, "use #rrggbb or #rrggbbaa");
const text = (max: number) => z.string().trim().min(1).max(max);
/** Relative path inside the world folder, e.g. "assets/sky.png". Checked again on disk. */
const file = z.string().min(1).max(200);
const coord = z.number().finite().min(-10000).max(10000);

export const ANIM_NAMES = ["idle", "walk", "read", "write", "bash", "wait", "celebrate", "error"] as const;
export const FX_NAMES = ["none", "sparks", "signal", "bell", "smoke", "glow", "steam"] as const;
export const AMBIENT_TYPES = ["rain", "birds", "fireflies", "lightning"] as const;
export const COMPLETION_EFFECTS = ["lamp-row", "vehicle-pass", "confetti"] as const;
export const SCENE_KINDS = ["read", "search", "write", "bash", "test", "web", "delegate", "question", "tool", "think", "waiting", "idle", "done", "error"] as const;

export const layerSchema = z
  .object({
    id,
    image: file,
    x: coord.default(0),
    y: coord.default(0),
    /** Horizontal scroll speed in world pixels per second (image repeats). */
    scrollX: z.number().min(-500).max(500).default(0),
    alpha: z.number().min(0).max(1).default(1),
  })
  .strict();

export const locationSchema = z
  .object({
    id,
    kind: id,
    /** Default sign text when no project is here (the project name replaces it). */
    label: text(40),
    x: coord,
    y: coord,
    prop: file.optional(),
    propScale: z.number().min(0.1).max(10).default(1),
    /** How far below the standing spot the prop's bottom edge is (e.g. a boat's hull below its deck). */
    propDy: coord.default(18),
    /** Gentle motion shared by the prop and everyone standing there (a houseboat bobbing). */
    propAnim: z.enum(["none", "bob"]).default("none"),
    propAmp: z.number().min(0).max(40).default(2),
    propSpeed: z.number().min(0).max(5).default(0.25),
    /** Where the signboard text sits, relative to x/y. */
    signboard: z.object({ dx: coord, dy: coord }).strict().default({ dx: 0, dy: -120 }),
    /** The yard in front of the place (where villagers' stations are); its width defaults to the room before the neighbours. */
    plot: z.object({ w: z.number().min(100).max(600) }).strict().optional(),
    /** How many characters can stand here before they bunch up. */
    slots: z.number().int().min(1).max(12).default(4),
    /** Distance between standing characters, in world pixels. */
    spacing: z.number().min(20).max(400).default(70),
  })
  .strict();

export const sceneSchema = z
  .object({
    anim: z.enum(ANIM_NAMES).default("idle"),
    fx: z.enum(FX_NAMES).default("none"),
    /** Where the character stands relative to its spot while doing this. */
    offsetX: coord.default(0),
    offsetY: coord.default(0),
  })
  .strict();

export const DECOR_ANIMS = ["none", "sway", "bob", "drift", "flicker", "dip", "pulse"] as const;

/** Animated scenery: palms that sway, clouds that drift, lamps that glow at night… */
export const decorSchema = z
  .object({
    id,
    image: file,
    x: coord,
    y: coord,
    scale: z.number().min(0.05).max(10).default(1),
    originX: z.number().min(0).max(1).default(0.5),
    originY: z.number().min(0).max(1).default(1),
    flipX: z.boolean().default(false),
    /** sky = behind the scenery layers (clouds); scene = sorted with props and characters by y; front = above everything. */
    layer: z.enum(["sky", "scene", "front"]).default("scene"),
    anim: z.enum(DECOR_ANIMS).default("none"),
    /** Strength: degrees for sway/dip, pixels for bob, 0..1 for flicker/pulse. */
    amp: z.number().min(0).max(200).default(1),
    /** Cycles per second (drift: pixels per second, negative = leftwards). */
    speed: z.number().min(-400).max(400).default(1),
    phase: z.number().min(0).max(1000).default(0),
    /** When it's visible: always, only at night (lamps, glows) or hidden at night. */
    night: z.enum(["always", "only", "hide"]).default("always"),
    blend: z.enum(["normal", "add"]).default("normal"),
    alpha: z.number().min(0).max(1).default(1),
  })
  .strict();

const hour = z.number().min(0).max(24);

/** Time of day: sky gradient and scene tint by hour, interpolated. */
export const lightingSchema = z
  .object({
    /** clock = follow this computer's local time; fixed = always fixedHour. */
    mode: z.enum(["clock", "fixed"]).default("clock"),
    fixedHour: hour.default(10),
    sky: z.array(z.object({ hour, top: color, bottom: color }).strict()).min(2).max(24),
    tint: z.array(z.object({ hour, color, alpha: z.number().min(0).max(0.9) }).strict()).min(1).max(24),
    sun: z.boolean().default(true),
    stars: z.boolean().default(true),
    /** Hours treated as night (lamps on, fireflies, stars). */
    nightFrom: hour.default(19),
    nightTo: hour.default(6),
  })
  .strict();

export const ambientSchema = z
  .object({
    type: z.enum(AMBIENT_TYPES),
    /** Chance per minute that the effect starts (1 = always on). */
    chancePerMinute: z.number().min(0).max(1).default(1),
    durationSec: z.tuple([z.number().min(1).max(3600), z.number().min(1).max(3600)]).default([30, 90]),
    count: z.number().int().min(1).max(400).default(80),
    color: color.optional(),
  })
  .strict();

export const worldSchema = z
  .object({
    schemaVersion: z.literal(WORLD_SCHEMA_VERSION),
    id,
    name: text(60),
    description: z.string().max(300).optional(),
    author: text(80),
    license: text(60),
    size: z.object({ width: z.number().int().min(320).max(4096), height: z.number().int().min(240).max(4096) }).strict(),
    palette: z
      .object({
        background: color,
        accent: color,
        label: color,
        labelBg: color,
        waiting: color,
        urgent: color,
      })
      .strict(),
    layers: z.array(layerSchema).min(1).max(12),
    locations: z.array(locationSchema).min(1).max(32),
    /** Where extra projects go when every location is taken. */
    overflow: z
      .object({
        area: z.object({ x: coord, y: coord, w: z.number().min(10).max(4096), h: z.number().min(10).max(4096) }).strict(),
        prop: file.optional(),
        propScale: z.number().min(0.1).max(10).default(1),
        label: text(40).default("Camp"),
      })
      .strict()
      .optional(),
    decor: z.array(decorSchema).max(120).default([]),
    /** Each place's yard and its stations (see shared/stations.ts): the ground style and a prop per station. */
    plots: z
      .object({
        style: z.enum(["courtyard", "forecourt"]).default("courtyard"),
        props: z.partialRecord(z.enum(["study", "desk", "works", "gate", "porch", "bench"]), file).default({}),
        propScale: z.number().min(0.1).max(10).default(1),
      })
      .strict()
      .optional(),
    lighting: lightingSchema.optional(),
    scenes: z.partialRecord(z.enum(SCENE_KINDS), sceneSchema).default({}),
    ambient: z.array(ambientSchema).max(6).default([]),
    completion: z
      .object({
        effect: z.enum(COMPLETION_EFFECTS),
        params: z.record(z.string().regex(/^[a-zA-Z]{1,20}$/), z.union([z.number(), z.string().max(40)])).default({}),
        sound: file.optional(),
      })
      .strict()
      .optional(),
    defaultCharacters: z.array(id).max(12).default([]),
  })
  .strict();

export type WorldDef = z.infer<typeof worldSchema>;
export type LocationDef = z.infer<typeof locationSchema>;
export type DecorDef = z.infer<typeof decorSchema>;
export type LightingDef = z.infer<typeof lightingSchema>;
export type SceneKind = (typeof SCENE_KINDS)[number];

/** A validated world as sent to the browser: file paths are replaced by URLs. */
export interface WorldInfo {
  id: string;
  name: string;
  author: string;
  license: string;
  description?: string;
  source: "builtin" | "user";
  /** Changes whenever any file in the world changes (cache busting + hot reload). */
  version: string;
  def: WorldDef;
  /** world-relative file path → URL served by this app */
  urls: Record<string, string>;
}

export interface PackError {
  folder: string;
  source: "builtin" | "user";
  messages: string[];
}

export interface WorldsState {
  worlds: WorldInfo[];
  errors: PackError[];
  defaultId: string;
}
