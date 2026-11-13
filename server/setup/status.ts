/**
 * Setup checks (read-only): whether Claude Code lists the Ai Gramam mod as
 * installed, and the version this app ships. Nothing here writes anywhere.
 */
import fs from "fs";
import path from "path";
import type { ModInstall } from "@shared/setup";

export const MOD_NAME = "ai-gramam";

/**
 * Reads Claude Code's installed-plugin list (`<claudeDir>/plugins/installed_plugins.json`).
 * Its format belongs to Claude Code and may change, so anything unexpected is "unknown",
 * never "not installed".
 */
export function readModInstall(claudeDir: string): ModInstall {
  const file = path.join(claudeDir, "plugins", "installed_plugins.json");
  let data: unknown;
  try {
    data = JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return { state: "unknown", installs: [] };
  }
  const plugins = (data as { plugins?: unknown } | null)?.plugins;
  if (!plugins || typeof plugins !== "object" || Array.isArray(plugins)) return { state: "unknown", installs: [] };
  const installs: ModInstall["installs"] = [];
  for (const [id, entries] of Object.entries(plugins as Record<string, unknown>)) {
    if (id.split("@")[0] !== MOD_NAME) continue;
    for (const e of Array.isArray(entries) ? entries : [entries]) {
      if (!e || typeof e !== "object") continue;
      const o = e as Record<string, unknown>;
      installs.push({
        version: typeof o.version === "string" ? o.version : "?",
        scope: typeof o.scope === "string" ? o.scope : "user",
        ...(typeof o.projectPath === "string" ? { projectPath: o.projectPath } : {}),
      });
    }
  }
  return { state: installs.length ? "installed" : "not_installed", installs };
}

/** The version in the mod's manifest (plugin/ai-gramam/.claude-plugin/plugin.json), or null. */
export function readShippedVersion(appRoot: string): string | null {
  try {
    const j = JSON.parse(fs.readFileSync(path.join(appRoot, "plugin", MOD_NAME, ".claude-plugin", "plugin.json"), "utf8"));
    return typeof j?.version === "string" ? j.version : null;
  } catch {
    return null;
  }
}
