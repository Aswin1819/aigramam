import fs from "fs";
import os from "os";
import path from "path";

/** Ai Gramam's own data folder (settings, keys, backups, your worlds and characters). */
export const DATA_DIR = path.join(os.homedir(), ".ai-gramam");

/** The folder used by the app before it was renamed. Only ever read, never changed. */
const LEGACY_DATA_DIR = path.join(os.homedir(), ".claude-dungeon");

/**
 * One-time carry-over of settings from the old data folder: copies
 * config.json and hook-key if the new folder doesn't have them yet.
 * The old folder is left exactly as it was.
 */
export function migrateLegacyData(dataDir = DATA_DIR, legacyDir = LEGACY_DATA_DIR): string[] {
  const copied: string[] = [];
  for (const name of ["config.json", "hook-key"]) {
    const from = path.join(legacyDir, name);
    const to = path.join(dataDir, name);
    try {
      if (fs.existsSync(to) || !fs.statSync(from).isFile()) continue;
      fs.mkdirSync(dataDir, { recursive: true });
      fs.copyFileSync(from, to);
      copied.push(name);
    } catch {
      // nothing to carry over
    }
  }
  return copied;
}
