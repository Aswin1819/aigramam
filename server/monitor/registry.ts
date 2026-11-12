/**
 * Reader for ~/.claude/sessions/<pid>.json, Claude Code's list of running
 * interactive sessions. It is undocumented, so it only adds detail (display
 * name, liveness); the monitor works without it.
 */
import fs from "fs";
import path from "path";

export interface RegistryEntry {
  pid: number;
  sessionId: string;
  cwd?: string;
  name?: string;
  nameSource?: string;
  status?: string;
  startedAt?: number;
  alive: boolean;
}

export function isPidAlive(pid: number): boolean {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    // EPERM means the process exists but belongs to someone else.
    return (e as NodeJS.ErrnoException).code === "EPERM";
  }
}

export function readRegistry(dir: string, pidAlive: (pid: number) => boolean = isPidAlive): RegistryEntry[] {
  let files: string[];
  try {
    files = fs.readdirSync(dir).filter((f) => /^\d+\.json$/.test(f));
  } catch {
    return [];
  }
  const out: RegistryEntry[] = [];
  for (const f of files) {
    try {
      const o = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")) as Record<string, unknown>;
      const pid = typeof o.pid === "number" ? o.pid : Number(f.split(".")[0]);
      if (typeof o.sessionId !== "string" || !o.sessionId) continue;
      out.push({
        pid,
        sessionId: o.sessionId,
        cwd: typeof o.cwd === "string" ? o.cwd : undefined,
        name: typeof o.name === "string" && o.name.trim() ? o.name.trim() : undefined,
        nameSource: typeof o.nameSource === "string" ? o.nameSource : undefined,
        status: typeof o.status === "string" ? o.status : undefined,
        startedAt: typeof o.startedAt === "number" ? o.startedAt : undefined,
        alive: pidAlive(pid),
      });
    } catch {
      // Partially written or unexpected file; skip it this round.
    }
  }
  return out;
}
