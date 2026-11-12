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
function deps(files: string[], onPath: Record<string, string[]> = {}, localAppData = "C:\\Users\\me\\AppData\\Local") {
  const launched: Array<[string, string[]]> = [];
  const d: OpenDeps = {
    which: async (n) => onPath[n] ?? [],
    exists: (f) => files.map((x) => path.normalize(x)).includes(path.normalize(f)),
    launch: async (exe, args) => void launched.push([exe, args]),
    localAppData,
  };
  return { d, launched };
}

describe("open project folders", () => {
  it("finds VS Code from its command on PATH or its install folder", async () => {
    const exe = "C:\\Users\\me\\AppData\\Local\\Programs\\Microsoft VS Code\\Code.exe";
    expect(await findEditor("vscode", deps([exe], { "code.cmd": ["C:\\Users\\me\\AppData\\Local\\Programs\\Microsoft VS Code\\bin\\code.cmd"] }).d)).toBe(path.normalize(exe));
    expect(await findEditor("vscode", deps([exe]).d)).toBe(path.normalize(exe)); // not on PATH, standard folder
    expect(await findEditor("vscode", deps([]).d)).toBeNull();
  });

  it("finds Cursor from resources\\app\\bin\\cursor.cmd", async () => {
    const exe = "D:\\Tools\\cursor\\Cursor.exe";
    expect(await findEditor("cursor", deps([exe], { "cursor.cmd": ["D:\\Tools\\cursor\\resources\\app\\bin\\cursor.cmd"] }).d)).toBe(path.normalize(exe));
  });

  it("opens the folder as the only argument, and explains a missing editor", async () => {
    const exe = "C:\\x\\Code.exe";
    const { d, launched } = deps([exe], { "code.cmd": ["C:\\x\\bin\\code.cmd"] });
    expect(await openFolder(tmp, "vscode", d)).toEqual({ ok: true });
    expect(await openFolder(tmp, "explorer", d)).toEqual({ ok: true });
    expect(launched).toEqual([[path.normalize(exe), [tmp]], ["explorer.exe", [tmp]]]);
    expect(await openFolder(tmp, "cursor", d)).toEqual({ ok: false, error: expect.stringContaining("Cursor isn't installed") });
    expect(await openFolder(path.join(tmp, "gone"), "explorer", d)).toEqual({ ok: false, error: expect.stringContaining("no longer exists") });
  });

  it("reports which apps are available", async () => {
    const r = await availableApps(deps(["C:\\Users\\me\\AppData\\Local\\Programs\\Microsoft VS Code\\Code.exe"]).d);
    expect(r).toMatchObject({ vscode: true, cursor: false });
  });

  it("rejects projects Ai Gramam doesn't show", async () => {
    const caller = projectsRouter.createCaller({} as never);
    await expect(caller.open({ projectId: "C:\\Windows", app: "explorer" })).rejects.toThrow(/Unknown project/);
    // @ts-expect-error: only the listed apps are allowed
    await expect(caller.open({ projectId: "x", app: "cmd" })).rejects.toThrow();
  });
});
