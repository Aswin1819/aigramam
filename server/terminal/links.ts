/**
 * Which Claude Code sessions run inside which managed terminal, from the
 * process tree: a session counts as "in" a terminal only when the pid in
 * Claude Code's session registry (~/.claude/sessions/<pid>.json) is a child or
 * grandchild of that terminal's shell (grandchild covers `claude.cmd`, which
 * runs claude.exe through cmd.exe). No guessing from folders or timing.
 */
import { execFile } from "child_process";
import type { RegistryEntry } from "../monitor/registry";

export interface ProcInfo {
  pid: number;
  ppid: number;
  name: string;
}

/** Lists the children and grandchildren of the given pids (so tests can pass a fake). */
export type ProcessLister = (parentPids: number[]) => Promise<ProcInfo[]>;

/** How deep below the shell a Claude process may be (1 = child, 2 = grandchild). */
const MAX_DEPTH = 2;

/**
 * Shell pid → the session ids running under it. Only live registry entries
 * whose pid is exactly one of the shell's descendants (within MAX_DEPTH) count.
 */
export function matchSessions(shellPids: number[], procs: ProcInfo[], registry: RegistryEntry[]): Map<number, string[]> {
  const children = new Map<number, number[]>();
  for (const p of procs) {
    const list = children.get(p.ppid) ?? [];
    list.push(p.pid);
    children.set(p.ppid, list);
  }
  const bySessionPid = new Map<number, string[]>();
  for (const e of registry) {
    if (!e.alive) continue;
    const list = bySessionPid.get(e.pid) ?? [];
    list.push(e.sessionId);
    bySessionPid.set(e.pid, list);
  }
  const out = new Map<number, string[]>();
  for (const shell of shellPids) {
    const found: string[] = [];
    let level = [shell];
    const seen = new Set<number>([shell]);
    for (let depth = 0; depth < MAX_DEPTH && level.length; depth++) {
      const next: number[] = [];
      for (const pid of level) {
        for (const c of children.get(pid) ?? []) {
          if (seen.has(c)) continue;
          seen.add(c);
          next.push(c);
          for (const id of bySessionPid.get(c) ?? []) if (!found.includes(id)) found.push(id);
        }
      }
      level = next;
    }
    out.set(shell, found);
  }
  return out;
}

/** Parses ConvertTo-Json output (one object, an array, or nothing). */
export function parseProcessJson(text: string): ProcInfo[] {
  const t = text.trim();
  if (!t) return [];
  let raw: unknown;
  try {
    raw = JSON.parse(t);
  } catch {
    return [];
  }
  const arr = Array.isArray(raw) ? raw : [raw];
  const out: ProcInfo[] = [];
  for (const o of arr) {
    if (!o || typeof o !== "object") continue;
    const r = o as Record<string, unknown>;
    const pid = Number(r.ProcessId);
    const ppid = Number(r.ParentProcessId);
    if (!Number.isInteger(pid) || !Number.isInteger(ppid) || pid <= 0) continue;
    out.push({ pid, ppid, name: typeof r.Name === "string" ? r.Name : "" });
  }
  return out;
}

/**
 * Windows: one PowerShell call (no shell, numbers only in the script) that
 * returns the children of the given pids and their children.
 */
export const listChildProcesses: ProcessLister = (parentPids) => {
  const pids = parentPids.filter((p) => Number.isInteger(p) && p > 0);
  if (!pids.length || process.platform !== "win32") return Promise.resolve([]);
  const script =
    `$p=@(${pids.join(",")});` +
    "$a=@(Get-CimInstance Win32_Process -Property ProcessId,ParentProcessId,Name);" +
    "$c=@($a|Where-Object{$p -contains $_.ParentProcessId});" +
    "$i=@($c|ForEach-Object{$_.ProcessId});" +
    "$g=@($a|Where-Object{$i -contains $_.ParentProcessId});" +
    "@($c+$g)|Select-Object ProcessId,ParentProcessId,Name|ConvertTo-Json -Compress";
  return new Promise((resolve) => {
    execFile("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", script], { timeout: 8000, windowsHide: true, maxBuffer: 1024 * 1024 }, (err, stdout) => {
      resolve(err ? [] : parseProcessJson(String(stdout)));
    });
  });
};

/** True when `name` resolves on PATH (where.exe on Windows, which elsewhere). Never runs it. */
export function findOnPath(name: string): Promise<boolean> {
  if (!/^[A-Za-z0-9._-]+$/.test(name)) return Promise.resolve(false);
  const finder = process.platform === "win32" ? "where.exe" : "which";
  return new Promise((resolve) => {
    execFile(finder, [name], { timeout: 4000, windowsHide: true }, (err, stdout) => resolve(!err && String(stdout).trim().length > 0));
  });
}

/** Sets `terminalId` on each session that runs in a managed terminal (and clears stale ones). */
export function attachTerminalIds<T extends { id: string; terminalId?: string }>(sessions: T[], terminalFor: (sessionId: string) => string | undefined): T[] {
  for (const s of sessions) {
    const t = terminalFor(s.id);
    if (t) s.terminalId = t;
    else delete s.terminalId;
  }
  return sessions;
}
