/**
 * "Open in…" shortcuts for a project folder: File Explorer, VS Code, Cursor.
 * Programs are started directly (execFile/spawn, never a shell) with the
 * folder as their only argument, and only for folders of projects Ai Gramam
 * already shows. If an editor isn't installed, the person is told so.
 */
import { execFile, spawn } from "child_process";
import fs from "fs";
import path from "path";

export type OpenApp = "explorer" | "vscode" | "cursor";
export const OPEN_APPS: OpenApp[] = ["explorer", "vscode", "cursor"];
export const APP_LABEL: Record<OpenApp, string> = { explorer: "File Explorer", vscode: "VS Code", cursor: "Cursor" };

export interface OpenDeps {
  /** Full paths `where.exe <name>` prints (empty when not found). */
  which: (name: string) => Promise<string[]>;
  exists: (file: string) => boolean;
  /** Start a program detached; resolves when it started (or failed to start). */
  launch: (exe: string, args: string[]) => Promise<void>;
  localAppData: string | undefined;
}

const realDeps: OpenDeps = {
  which: (name) =>
    new Promise((resolve) => {
      execFile("where.exe", [name], { timeout: 3000, windowsHide: true }, (err, stdout) => resolve(err ? [] : stdout.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)));
    }),
  exists: (f) => {
    try {
      return fs.statSync(f).isFile();
    } catch {
      return false;
    }
  },
  launch: (exe, args) =>
    new Promise((resolve, reject) => {
      const child = spawn(exe, args, { detached: true, stdio: "ignore", windowsHide: false });
      child.once("error", reject);
      child.once("spawn", () => {
        child.unref();
        resolve();
      });
    }),
  localAppData: process.env.LOCALAPPDATA,
};

/** Where an editor's program is, from its command on PATH or its standard install folder. */
export async function findEditor(app: "vscode" | "cursor", deps: OpenDeps = realDeps): Promise<string | null> {
  const candidates: string[] = [];
  if (app === "vscode") {
    // <install>\bin\code.cmd → <install>\Code.exe
    for (const p of await deps.which("code.cmd")) candidates.push(path.join(path.dirname(p), "..", "Code.exe"));
    if (deps.localAppData) candidates.push(path.join(deps.localAppData, "Programs", "Microsoft VS Code", "Code.exe"));
  } else {
    // <install>\resources\app\bin\cursor.cmd → <install>\Cursor.exe
    for (const p of await deps.which("cursor.cmd")) candidates.push(path.join(path.dirname(p), "..", "..", "..", "Cursor.exe"), path.join(path.dirname(p), "..", "Cursor.exe"));
    if (deps.localAppData) candidates.push(path.join(deps.localAppData, "Programs", "cursor", "Cursor.exe"));
  }
  return candidates.map((c) => path.normalize(c)).find((c) => deps.exists(c)) ?? null;
}

/** Which apps can open folders on this computer. */
export async function availableApps(deps: OpenDeps = realDeps): Promise<Record<OpenApp, boolean>> {
  const [vscode, cursor] = await Promise.all([findEditor("vscode", deps), findEditor("cursor", deps)]);
  return { explorer: process.platform === "win32", vscode: !!vscode, cursor: !!cursor };
}

/** Open a (validated) project folder in an app. */
export async function openFolder(folder: string, app: OpenApp, deps: OpenDeps = realDeps): Promise<{ ok: true } | { ok: false; error: string }> {
  let isDir = false;
  try {
    isDir = fs.statSync(folder).isDirectory();
  } catch {}
  if (!isDir) return { ok: false, error: `The project folder no longer exists: ${folder}` };
  try {
    if (app === "explorer") {
      await deps.launch("explorer.exe", [folder]);
      return { ok: true };
    }
    const exe = await findEditor(app, deps);
    if (!exe) return { ok: false, error: `${APP_LABEL[app]} isn't installed on this computer (or couldn't be found).` };
    await deps.launch(exe, [folder]);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: `Couldn't start ${APP_LABEL[app]}: ${e instanceof Error ? e.message : String(e)}` };
  }
}
