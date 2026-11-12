/**
 * Loads and validates world packs from the shipped `worlds/` folder and the
 * user's `~/.ai-gramam/worlds`. Read-only. A broken pack is reported with
 * readable errors and skipped; it never stops the others from loading.
 */
import fs from "fs";
import path from "path";
import { worldSchema, type PackError, type WorldDef, type WorldInfo, type WorldsState } from "@shared/world";
import { assetUrls, checkFiles, folderErrors, formatZodError, ID_RE, readPackJson, type FileRef } from "../packs/files";

export { CONTENT_TYPES, LIMITS, formatZodError } from "../packs/files";

export interface Source {
  dir: string;
  kind: "builtin" | "user";
}

export interface LoadedWorld {
  info: WorldInfo;
  dir: string;
  /** Absolute paths of the files this world references; the only ones we serve. */
  files: Map<string, string>;
}

/** Every file a world.json points at. */
function referencedFiles(def: WorldDef): FileRef[] {
  const out: FileRef[] = [];
  def.layers.forEach((l, i) => out.push({ rel: l.image, kind: "image", where: `layers.${i}.image` }));
  def.locations.forEach((l, i) => l.prop && out.push({ rel: l.prop, kind: "image", where: `locations.${i}.prop` }));
  def.decor.forEach((d, i) => out.push({ rel: d.image, kind: "image", where: `decor.${i}.image` }));
  if (def.overflow?.prop) out.push({ rel: def.overflow.prop, kind: "image", where: "overflow.prop" });
  if (def.completion?.sound) out.push({ rel: def.completion.sound, kind: "sound", where: "completion.sound" });
  return out;
}

export function loadWorldFolder(dir: string, source: Source["kind"]): { world?: LoadedWorld; error?: PackError } {
  const folder = path.basename(dir);
  const fail = (messages: string[]) => ({ error: { folder, source, messages } });
  if (!ID_RE.test(folder)) return fail([`Folder name "${folder}" must be lowercase letters, digits and - (it is the world id)`]);
  const { raw, json, error } = readPackJson(dir, "world.json");
  if (error) return fail([error]);
  const parsed = worldSchema.safeParse(json);
  if (!parsed.success) return fail(formatZodError(parsed.error));
  const def = parsed.data;
  const errors: string[] = [];
  if (def.id !== folder) errors.push(`id "${def.id}" must match the folder name "${folder}"`);
  for (const [name, list] of [["locations", def.locations], ["layers", def.layers], ["decor", def.decor]] as const) {
    if (new Set(list.map((l) => l.id)).size !== list.length) errors.push(`${name}: ids must be unique`);
  }
  errors.push(...folderErrors(dir));
  const checked = checkFiles(dir, referencedFiles(def), raw!);
  errors.push(...checked.errors);
  if (errors.length) return fail(errors);
  return {
    world: {
      dir,
      files: checked.files,
      info: {
        id: def.id, name: def.name, author: def.author, license: def.license, description: def.description,
        source, version: checked.version, def, urls: assetUrls("/world-assets", def.id, checked.files, checked.version),
      },
    },
  };
}

export function loadAllWorlds(sources: Source[]): { state: WorldsState; loaded: Map<string, LoadedWorld> } {
  const loaded = new Map<string, LoadedWorld>();
  const errors: PackError[] = [];
  for (const src of sources) {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(src.dir, { withFileTypes: true });
    } catch {
      continue; // folder doesn't exist (yet)
    }
    for (const e of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      if (!e.isDirectory() || e.name.startsWith(".")) continue;
      const { world, error } = loadWorldFolder(path.join(src.dir, e.name), src.kind);
      if (error) errors.push(error);
      else if (world) {
        if (loaded.has(world.info.id)) errors.push({ folder: e.name, source: src.kind, messages: [`a world with id "${world.info.id}" is already installed`] });
        else loaded.set(world.info.id, world);
      }
    }
  }
  const worlds = [...loaded.values()].map((w) => w.info).sort((a, b) => a.name.localeCompare(b.name));
  const defaultId = loaded.has("kerala") ? "kerala" : worlds[0]?.id ?? "";
  return { state: { worlds, errors, defaultId }, loaded };
}
