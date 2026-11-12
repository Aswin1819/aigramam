/**
 * Character pack format (characters/<id>/pack.json + sprites.png).
 * Data only. Sprite sheet: one row per animation, frames left to right.
 * See docs/PACKS.md for the exact layout.
 */
import { z } from "zod";
import { ANIM_NAMES } from "./world";

export const PACK_SCHEMA_VERSION = 1;
const id = z.string().regex(/^[a-z0-9-]{1,40}$/, "use lowercase letters, digits and - (max 40)");
const text = (max: number) => z.string().trim().min(1).max(max);
const file = z.string().min(1).max(200);

export const animSchema = z
  .object({
    row: z.number().int().min(0).max(15),
    frames: z.number().int().min(1).max(16),
    loop: z.boolean().default(true),
    fps: z.number().min(1).max(30).optional(),
  })
  .strict();

export const packSchema = z
  .object({
    schemaVersion: z.literal(PACK_SCHEMA_VERSION),
    id,
    name: text(60),
    author: text(80),
    license: text(60),
    role: z.enum(["hero", "villain", "sidekick", "other"]).default("other"),
    frame: z.object({ width: z.number().int().min(8).max(128), height: z.number().int().min(8).max(128) }).strict(),
    fps: z.number().min(1).max(30).default(8),
    scale: z.number().min(0.5).max(6).default(2),
    sheet: file,
    /** idle and walk are required; any other missing animation falls back to idle. */
    animations: z
      .partialRecord(z.enum(ANIM_NAMES), animSchema)
      .refine((a) => !!a.idle && !!a.walk, { message: "idle and walk animations are required" }),
    sounds: z.partialRecord(z.enum(ANIM_NAMES), file).default({}),
    lines: file.optional(),
  })
  .strict();

export type PackDef = z.infer<typeof packSchema>;

export interface CharacterInfo {
  id: string;
  name: string;
  author: string;
  license: string;
  role: PackDef["role"];
  source: "builtin" | "user";
  version: string;
  def: PackDef;
  urls: Record<string, string>;
}

export interface CharactersState {
  characters: CharacterInfo[];
  errors: Array<{ folder: string; source: "builtin" | "user"; messages: string[] }>;
}
