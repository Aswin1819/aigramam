import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import { availableApps, findEditor, openFolder, type OpenDeps } from "./projects/open";
import { projectsRouter } from "./routers/projects";

let tmp: string;
beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "gramam-open-"));
});
afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));

/** A fake computer: which programs exist, what `where.exe` prints, and what got launched. */
function deps(files: string[], onPath: Record<string, string[]> = {}, localAppData: string | undefined = "C:\\Users\\me\\AppData\\Local", platform: NodeJS.Platform = "win32") {
  const norm = platform === "win32" ? path.win32.normalize : path.posix.normalize;
  const launched: Array<[string, string[]]> = [];
  const d: OpenDeps = {
    platform,
    home: "/Users/me",
    which: async (n) => onPath[n] ?? [],
    exists: (f) => files.map((x) => norm(x)).includes(norm(f)),
    launch: async (exe, args) => void launched.push([exe, args]),
    localAppData,
  };
  return { d, launched };
}

describe("open project folders", () => {
  it("finds VS Code from its command on PATH or its install folder", async () => {
    const exe = "C:\\Users\\me\\AppData\\Local\\Programs\\Microsoft VS Code\\Code.exe";
    expect(await findEditor("vscode", deps([exe], { "code.cmd": ["C:\\Users\\me\\AppData\\Local\\Programs\\Microsoft VS Code\\bin\\code.cmd"] }).d)).toBe(path.win32.normalize(exe));
    expect(await findEditor("vscode", deps([exe]).d)).toBe(path.win32.normalize(exe)); // not on PATH, standard folder
    expect(await findEditor("vscode", deps([]).d)).toBeNull();
  });

  it("finds Cursor from resources\\app\\bin\\cursor.cmd", async () => {
    const exe = "D:\\Tools\\cursor\\Cursor.exe";
    expect(await findEditor("cursor", deps([exe], { "cursor.cmd": ["D:\\Tools\\cursor\\resources\\app\\bin\\cursor.cmd"] }).d)).toBe(path.win32.normalize(exe));
  });

  it("opens the folder as the only argument, and explains a missing editor", async () => {
    const exe = "C:\\x\\Code.exe";
    const { d, launched } = deps([exe], { "code.cmd": ["C:\\x\\bin\\code.cmd"] });
    expect(await openFolder(tmp, "vscode", d)).toEqual({ ok: true });
    expect(await openFolder(tmp, "explorer", d)).toEqual({ ok: true });
    expect(launched).toEqual([[path.win32.normalize(exe), [tmp]], ["explorer.exe", [tmp]]]);
    expect(await openFolder(tmp, "cursor", d)).toEqual({ ok: false, error: expect.stringContaining("Cursor isn't installed") });
    expect(await openFolder(path.join(tmp, "gone"), "explorer", d)).toEqual({ ok: false, error: expect.stringContaining("no longer exists") });
  });

  it("reports which apps are available", async () => {
    const r = await availableApps(deps(["C:\\Users\\me\\AppData\\Local\\Programs\\Microsoft VS Code\\Code.exe"]).d);
    expect(r).toMatchObject({ explorer: true, vscode: true, cursor: false, fileManagerLabel: "File Explorer" });
  });

  it("macOS: Finder through open, editors from their command or the Applications folder", async () => {
    const code = "/Applications/Visual Studio Code.app/Contents/Resources/app/bin/code";
    const { d, launched } = deps([code, "/opt/homebrew/bin/cursor"], { cursor: ["/opt/homebrew/bin/cursor"] }, undefined, "darwin");
    expect(await availableApps(d)).toEqual({ explorer: true, vscode: true, cursor: true, fileManagerLabel: "Finder" });
    expect(await openFolder(tmp, "explorer", d)).toEqual({ ok: true });
    expect(await openFolder(tmp, "vscode", d)).toEqual({ ok: true });
    expect(await openFolder(tmp, "cursor", d)).toEqual({ ok: true });
    expect(launched).toEqual([["/usr/bin/open", [tmp]], [code, [tmp]], ["/opt/homebrew/bin/cursor", [tmp]]]);
  });

  it("Linux: the desktop's file manager through xdg-open, and says when there's none", async () => {
    const { d, launched } = deps(["/snap/bin/code"], { "xdg-open": ["/usr/bin/xdg-open"] }, undefined, "linux");
    expect(await availableApps(d)).toEqual({ explorer: true, vscode: true, cursor: false, fileManagerLabel: "Files" });
    expect(await openFolder(tmp, "explorer", d)).toEqual({ ok: true });
    expect(await openFolder(tmp, "vscode", d)).toEqual({ ok: true });
    expect(launched).toEqual([["/usr/bin/xdg-open", [tmp]], ["/snap/bin/code", [tmp]]]);
    const bare = deps([], {}, undefined, "linux").d;
    expect((await availableApps(bare)).explorer).toBe(false);
    expect(await openFolder(tmp, "explorer", bare)).toEqual({ ok: false, error: expect.stringContaining("No file manager") });
  });

  it("rejects projects Ai Gramam doesn't show", async () => {
    const caller = projectsRouter.createCaller({} as never);
    await expect(caller.open({ projectId: "C:\\Windows", app: "explorer" })).rejects.toThrow(/Unknown project/);
    // @ts-expect-error: only the listed apps are allowed
    await expect(caller.open({ projectId: "x", app: "cmd" })).rejects.toThrow();
  });
});
