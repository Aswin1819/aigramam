import type { CharacterAssignments, CharacterInfo } from "@shared/character";
import type { SessionView } from "@shared/model";
import type { WorldInfo } from "@shared/world";
import { hashString } from "@shared/placement";

/**
 * The character a session appears as: the one the person chose for its
 * project, else the world's default cast, spread by session id.
 */
export function pickCharacter(
  session: Pick<SessionView, "id" | "projectId">,
  world: WorldInfo | null,
  characters: CharacterInfo[],
  assignments?: CharacterAssignments,
): CharacterInfo | null {
  const byId = new Map(characters.map((c) => [c.id, c]));
  const chosen = assignments?.[session.projectId];
  if (chosen && byId.has(chosen)) return byId.get(chosen)!;
  const pool = (world?.def.defaultCharacters ?? []).map((id) => byId.get(id)).filter(Boolean) as CharacterInfo[];
  const list = pool.length ? pool : characters;
  return list.length ? list[hashString(session.id) % list.length]! : null;
}

/** A short, stable key for the choices, so views that bake characters in can rebuild when they change. */
export const assignmentsKey = (a?: CharacterAssignments) =>
  a ? Object.entries(a).sort(([x], [y]) => x.localeCompare(y)).map(([p, c]) => `${p}=${c}`).join("|") : "";
