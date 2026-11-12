/**
 * Loads and validates character packs from `characters/` (built in) and
 * `~/.ai-gramam/characters` (yours). A broken pack is reported and skipped.
 */
import fs from "fs";
import path from "path";
import { packSchema, type CharacterInfo, type CharactersState, type PackDef } from "@shared/character";
import { assetUrls, checkFiles, folderErrors, formatZodError, ID_RE, readPackJson, type FileRef } from "../packs/files";
import type { Source } from "../worlds/loader";

export const SHEET_LIMITS = { bytes: 2 * 1024 * 1024, side: 2048 };

export interface LoadedCharacter {
  info: CharacterInfo;
  dir: string;
  files: Map<string, string>;
}

function referencedFiles(def: PackDef): FileRef[] {
  const out: FileRef[] = [{ rel: def.sheet, kind: "image", where: "sheet", maxBytes: SHEET_LIMITS.bytes, maxSide: SHEET_LIMITS.side }];
  for (const [anim, rel] of Object.entries(def.sounds)) if (rel) out.push({ rel, kind: "sound", where: `sounds.${anim}` });
  if (def.lines) out.push({ rel: def.lines, kind: "json", where: "lines" });
  return out;
}

export function loadCharacterFolder(dir: string, source: Source["kind"]): { character?: LoadedCharacter; error?: CharactersState["errors"][number] } {
  const folder = path.basename(dir);
  const fail = (messages: string[]) => ({ error: { folder, source, messages } });
  if (!ID_RE.test(folder)) return fail([`Folder name "${folder}" must be lowercase letters, digits and - (it is the character id)`]);
  const { raw, json, error } = readPackJson(dir, "pack.json");
  if (error) return fail([error]);
  const parsed = packSchema.safeParse(json);
  if (!parsed.success) return fail(formatZodError(parsed.error));
  const def = parsed.data;
  const errors: string[] = [];
  if (def.id !== folder) errors.push(`id "${def.id}" must match the folder name "${folder}"`);
  errors.push(...folderErrors(dir));
  const checked = checkFiles(dir, referencedFiles(def), raw!);
  errors.push(...checked.errors);
  // The sheet must actually contain every frame the animations ask for.
  const d = checked.dims.get(def.sheet.replace(/\\/g, "/"));
  if (d) {
    for (const [anim, a] of Object.entries(def.animations)) {
      if (!a) continue;
      if ((a.row + 1) * def.frame.height > d.height) errors.push(`animations.${anim}: row ${a.row} is below the bottom of the ${d.width}×${d.height} sheet`);
      if (a.frames * def.frame.width > d.width) errors.push(`animations.${anim}: ${a.frames} frames need ${a.frames * def.frame.width}px but the sheet is ${d.width}px wide`);
    }
  }
  if (errors.length) return fail(errors);
  return {
    character: {
      dir,
      files: checked.files,
      info: {
        id: def.id, name: def.name, author: def.author, license: def.license, role: def.role,
        source, version: checked.version, def, urls: assetUrls("/character-assets", def.id, checked.files, checked.version),
      },
    },
  };
}

export function loadAllCharacters(sources: Source[]): { state: CharactersState; loaded: Map<string, LoadedCharacter> } {
  const loaded = new Map<string, LoadedCharacter>();
  const errors: CharactersState["errors"] = [];
  for (const src of sources) {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(src.dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      if (!e.isDirectory() || e.name.startsWith(".")) continue;
      const { character, error } = loadCharacterFolder(path.join(src.dir, e.name), src.kind);
      if (error) errors.push(error);
      else if (character) {
        if (loaded.has(character.info.id)) errors.push({ folder: e.name, source: src.kind, messages: [`a character with id "${character.info.id}" is already installed`] });
        else loaded.set(character.info.id, character);
      }
    }
  }
  return { state: { characters: [...loaded.values()].map((c) => c.info).sort((a, b) => a.name.localeCompare(b.name)), errors }, loaded };
}
