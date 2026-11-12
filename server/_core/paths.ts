import os from "os";
import path from "path";

/** Ai Gramam's own data folder (settings, keys, backups, your worlds and characters). */
export const DATA_DIR = path.join(os.homedir(), ".ai-gramam");
