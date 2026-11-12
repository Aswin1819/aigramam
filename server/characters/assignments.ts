/**
 * Which character each project's sessions appear as, chosen by the person in
 * the session drawer. Saved in ~/.ai-gramam/characters.json so every browser
 * tab (and the next start) shows the same choice. Nothing here is required:
 * without a choice, sessions get the world's default cast.
 */
import fs from "fs";
import path from "path";
import type { CharacterAssignments } from "@shared/character";
import { DATA_DIR } from "../_core/paths";

const FILE_VERSION = 1;
/** Project ids are folder paths; character ids follow the pack id rule. */
const MAX_PROJECT_ID = 1000;
const CHARACTER_ID = /^[a-z0-9-]{1,40}$/;
/** A file that grew beyond this many projects is treated as damaged and ignored. */
const MAX_ENTRIES = 2000;

export class CharacterAssignmentStore {
  private byProject: CharacterAssignments = {};
  /** Called after every change, so open tabs can be told. */
  onChange: () => void = () => {};

  constructor(private readonly file = path.join(DATA_DIR, "characters.json")) {
    this.load();
  }

  all(): CharacterAssignments {
    return { ...this.byProject };
  }

  /** Assign a character to a project, or clear it with null. Returns false for invalid input. */
  set(projectId: string, characterId: string | null): boolean {
    if (!projectId || projectId.length > MAX_PROJECT_ID) return false;
    if (characterId !== null && !CHARACTER_ID.test(characterId)) return false;
    if (characterId === null) delete this.byProject[projectId];
    else this.byProject[projectId] = characterId;
    this.save();
    this.onChange();
    return true;
  }

  private load() {
    try {
      const raw = JSON.parse(fs.readFileSync(this.file, "utf8")) as { byProject?: unknown };
      const entries = raw && typeof raw.byProject === "object" && raw.byProject ? Object.entries(raw.byProject) : [];
      if (entries.length > MAX_ENTRIES) return;
      for (const [projectId, characterId] of entries) {
        if (projectId.length <= MAX_PROJECT_ID && typeof characterId === "string" && CHARACTER_ID.test(characterId)) this.byProject[projectId] = characterId;
      }
    } catch {
      // No file yet, or unreadable: start with no choices.
    }
  }

  /** Write to a temp file and rename, so a crash never leaves half a file. */
  private save() {
    try {
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      const tmp = `${this.file}.${process.pid}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify({ version: FILE_VERSION, byProject: this.byProject }, null, 2));
      fs.renameSync(tmp, this.file);
    } catch (e) {
      console.warn("[Ai Gramam] couldn't save character choices:", e instanceof Error ? e.message : e);
    }
  }
}
