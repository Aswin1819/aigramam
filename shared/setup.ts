/**
 * Setup checks: what the browser shows so a person can tell apart "the mod
 * isn't installed", "no session is linked", "no sessions" and "the app isn't
 * reachable" (the last one the browser knows from its own connection).
 */

/** How the Ai Gramam mod is installed, read from Claude Code's plugin list (read-only). */
export type ModInstallState =
  /** Listed in Claude Code's installed plugins. */
  | "installed"
  /** Claude Code's plugin list was read and the mod isn't in it. */
  | "not_installed"
  /** The plugin list doesn't exist or couldn't be read; the mod may still run (e.g. `--plugin-dir`). */
  | "unknown";

export interface ModInstall {
  state: ModInstallState;
  /** One entry per install (user, project or local scope). */
  installs: Array<{ version: string; scope: string; projectPath?: string }>;
}

export interface SetupStatus {
  /** The mod version this copy of Ai Gramam ships in plugin/ai-gramam. */
  shippedVersion: string | null;
  mod: ModInstall;
  link: {
    /** Sessions whose mod checked in during the last few seconds. */
    linkedNow: number;
    /** Mod versions those sessions run. */
    versions: string[];
    /** When any mod last checked in since the app started (null: never). */
    lastContactAt: number | null;
    lastVersion: string | null;
  };
  /** Live Claude Code sessions the monitor sees right now. */
  liveSessions: number;
  /** Whether Claude Code's folder (~/.claude) exists on this computer. */
  claudeFolderFound: boolean;
}

/** -1, 0 or 1 comparing dotted versions ("0.2.0" < "0.10.0"); non-numeric parts count as 0. */
export function compareVersions(a: string, b: string): number {
  const pa = a.split(".").map((x) => parseInt(x, 10) || 0);
  const pb = b.split(".").map((x) => parseInt(x, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d) return d < 0 ? -1 : 1;
  }
  return 0;
}
