import type { CharacterInfo } from "@shared/character";
import type { WorldInfo } from "@shared/world";
import { hashString } from "@shared/placement";

/** The character a session appears as: the world's default cast, spread by session id. */
export function pickCharacter(sessionId: string, world: WorldInfo | null, characters: CharacterInfo[]): CharacterInfo | null {
  const byId = new Map(characters.map((c) => [c.id, c]));
  const pool = (world?.def.defaultCharacters ?? []).map((id) => byId.get(id)).filter(Boolean) as CharacterInfo[];
  const list = pool.length ? pool : characters;
  return list.length ? list[hashString(sessionId) % list.length] : null;
}
