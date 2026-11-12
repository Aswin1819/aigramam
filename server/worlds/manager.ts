import path from "path";
import type { WorldsState } from "@shared/world";
import type { CharactersState } from "@shared/character";
import { DATA_DIR } from "../_core/paths";
import { appRoot, PackManager, type PackSource } from "../packs/manager";
import { loadAllWorlds, type LoadedWorld } from "./loader";
import { loadAllCharacters, type LoadedCharacter } from "../characters/loader";

export const BUILTIN_WORLDS_DIR = path.join(appRoot(), "worlds");
export const USER_WORLDS_DIR = path.join(DATA_DIR, "worlds");
export const BUILTIN_CHARACTERS_DIR = path.join(appRoot(), "characters");
export const USER_CHARACTERS_DIR = path.join(DATA_DIR, "characters");

export class WorldManager extends PackManager<WorldsState, LoadedWorld> {
  constructor(sources: PackSource[] = [
    { dir: BUILTIN_WORLDS_DIR, kind: "builtin" },
    { dir: USER_WORLDS_DIR, kind: "user" },
  ]) {
    super("Worlds", sources, loadAllWorlds, { worlds: [], errors: [], defaultId: "" });
  }
}

export class CharacterManager extends PackManager<CharactersState, LoadedCharacter> {
  constructor(sources: PackSource[] = [
    { dir: BUILTIN_CHARACTERS_DIR, kind: "builtin" },
    { dir: USER_CHARACTERS_DIR, kind: "user" },
  ]) {
    super("Characters", sources, loadAllCharacters, { characters: [], errors: [] });
  }
}
