/**
 * "Open in…" shortcuts for a project folder: the file manager (File Explorer,
 * Finder, or the Linux desktop's own through xdg-open), VS Code, Cursor.
 * Programs are started directly (execFile/spawn, never a shell) with the
 * folder as their only argument, and only for folders of projects Ai Gramam
 * already shows. If an editor isn't installed, the person is told so.
 */
import { execFile, spawn } from "child_process";
import fs from "fs";
import path from "path";

export type OpenApp = "explorer" | "vscode" | "cursor";
export const OPEN_APPS: OpenApp[] = ["explorer", "vscode", "cursor"];

/** The file manager's name on each system. */
export function fileManagerLabel(platform: NodeJS.Platform): string {
  return platform === "win32" ? "File Explorer" : platform === "darwin" ? "Finder" : "Files";
}

export function appLabel(app: OpenApp, platform: NodeJS.Platform): string {
  return app === "explorer" ? fileManagerLabel(platform) : app === "vscode" ? "VS Code" : "Cursor";
}

export interface OpenDeps {
  platform: NodeJS.Platform;
  /** Full paths of a command on PATH (`where.exe` on Windows, `which` elsewhere); empty when not found. */
  which: (name: string) => Promise<string[]>;
  exists: (file: string) => boolean;
  /** Start a program detached; resolves when it started (or failed to start). */
  launch: (exe: string, args: string[]) => Promise<void>;
  /** Windows: %LOCALAPPDATA% (per-user installs). */
  localAppData: string | undefined;
  /** macOS: the home folder (apps in ~/Applications). */
  home?: string;
}

const realDeps: OpenDeps = {
  platform: process.platform,
  which: (name) =>
    new Promise((resolve) => {
      const finder = process.platform === "win32" ? "where.exe" : "which";
      execFile(finder, [name], { timeout: 3000, windowsHide: true }, (err, stdout) => resolve(err ? [] : stdout.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)));
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
  home: process.env.HOME,
};

/** Where an editor's program is, from its command on PATH or its standard install folder. */
export async function findEditor(app: "vscode" | "cursor", deps: OpenDeps = realDeps): Promise<string | null> {
  const candidates: string[] = [];
  if (deps.platform === "win32") {
    const w = path.win32;
    if (app === "vscode") {
      // <install>\bin\code.cmd → <install>\Code.exe
      for (const p of await deps.which("code.cmd")) candidates.push(w.join(w.dirname(p), "..", "Code.exe"));
      if (deps.localAppData) candidates.push(w.join(deps.localAppData, "Programs", "Microsoft VS Code", "Code.exe"));
    } else {
      // <install>\resources\app\bin\cursor.cmd → <install>\Cursor.exe
      for (const p of await deps.which("cursor.cmd")) candidates.push(w.join(w.dirname(p), "..", "..", "..", "Cursor.exe"), w.join(w.dirname(p), "..", "Cursor.exe"));
      if (deps.localAppData) candidates.push(w.join(deps.localAppData, "Programs", "cursor", "Cursor.exe"));
    }
    return candidates.map((c) => w.normalize(c)).find((c) => deps.exists(c)) ?? null;
  }
  // macOS and Linux: the editor's own command (`code`, `cursor`), which opens a folder given as its argument.
  const cmd = app === "vscode" ? "code" : "cursor";
  candidates.push(...(await deps.which(cmd)));
  if (deps.platform === "darwin") {
    const bundle = app === "vscode" ? "Visual Studio Code.app" : "Cursor.app";
    for (const root of ["/Applications", ...(deps.home ? [path.posix.join(deps.home, "Applications")] : [])]) candidates.push(path.posix.join(root, bundle, "Contents", "Resources", "app", "bin", cmd));
  } else {
    candidates.push(...(app === "vscode" ? ["/usr/bin/code", "/snap/bin/code", "/usr/share/code/bin/code"] : ["/usr/bin/cursor", "/opt/cursor/cursor"]));
  }
  return candidates.find((c) => deps.exists(c)) ?? null;
}

/** The program that shows a folder in the file manager, or null when there isn't one. */
async function fileManager(deps: OpenDeps): Promise<string | null> {
  if (deps.platform === "win32") return "explorer.exe";
  if (deps.platform === "darwin") return "/usr/bin/open";
  return (await deps.which("xdg-open"))[0] ?? null;
}

export interface AvailableApps extends Record<OpenApp, boolean> {
  /** The file manager's name here ("File Explorer", "Finder", "Files"). */
  fileManagerLabel: string;
}

/** Which apps can open folders on this computer. */
export async function availableApps(deps: OpenDeps = realDeps): Promise<AvailableApps> {
  const [explorer, vscode, cursor] = await Promise.all([fileManager(deps), findEditor("vscode", deps), findEditor("cursor", deps)]);
  return { explorer: !!explorer, vscode: !!vscode, cursor: !!cursor, fileManagerLabel: fileManagerLabel(deps.platform) };
}

/** Open a (validated) project folder in an app. */
export async function openFolder(folder: string, app: OpenApp, deps: OpenDeps = realDeps): Promise<{ ok: true } | { ok: false; error: string }> {
  const label = appLabel(app, deps.platform);
  let isDir = false;
  try {
    isDir = fs.statSync(folder).isDirectory();
  } catch {}
  if (!isDir) return { ok: false, error: `The project folder no longer exists: ${folder}` };
  try {
    const exe = app === "explorer" ? await fileManager(deps) : await findEditor(app, deps);
    if (!exe) return { ok: false, error: app === "explorer" ? "No file manager was found (xdg-open isn't installed)." : `${label} isn't installed on this computer (or couldn't be found).` };
    await deps.launch(exe, [folder]);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: `Couldn't start ${label}: ${e instanceof Error ? e.message : String(e)}` };
  }
}
