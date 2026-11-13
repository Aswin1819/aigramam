import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { compareVersions } from "@shared/setup";
import { readModInstall, readShippedVersion } from "./setup/status";
import { createSetupRouter } from "./routers/setup";
import { Link } from "./link/link";

let dir: string;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "aig-setup-"));
});
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

function writePlugins(content: unknown) {
  fs.mkdirSync(path.join(dir, "plugins"), { recursive: true });
  fs.writeFileSync(path.join(dir, "plugins", "installed_plugins.json"), typeof content === "string" ? content : JSON.stringify(content));
}

describe("mod install check (read-only)", () => {
  it("is unknown when Claude Code's plugin list is missing or unreadable", () => {
    expect(readModInstall(dir).state).toBe("unknown");
    writePlugins("{not json");
    expect(readModInstall(dir).state).toBe("unknown");
    writePlugins({ version: 2, plugins: [] });
    expect(readModInstall(dir).state).toBe("unknown");
  });

  it("finds the mod from any marketplace, with each install's version and scope", () => {
    writePlugins({
      version: 2,
      plugins: {
        "code-review@claude-plugins-official": [{ scope: "user", version: "1.0.1" }],
        "ai-gramam@aigramam": [{ scope: "user", version: "0.2.0" }, { scope: "project", version: "0.3.0", projectPath: "C:\\work\\app" }],
      },
    });
    expect(readModInstall(dir)).toEqual({
      state: "installed",
      installs: [{ scope: "user", version: "0.2.0" }, { scope: "project", version: "0.3.0", projectPath: "C:\\work\\app" }],
    });
  });

  it("says not installed only when the list was read and the mod isn't in it", () => {
    writePlugins({ version: 2, plugins: { "ai-gramam-extra@x": [{ version: "1.0.0" }] } });
    expect(readModInstall(dir)).toEqual({ state: "not_installed", installs: [] });
  });

  it("reads the shipped version from the mod's manifest", () => {
    expect(readShippedVersion(dir)).toBeNull();
    fs.mkdirSync(path.join(dir, "plugin", "ai-gramam", ".claude-plugin"), { recursive: true });
    fs.writeFileSync(path.join(dir, "plugin", "ai-gramam", ".claude-plugin", "plugin.json"), JSON.stringify({ name: "ai-gramam", version: "0.3.0" }));
    expect(readShippedVersion(dir)).toBe("0.3.0");
    // The real manifest and the mod's own VERSION constant agree.
    const root = path.resolve(import.meta.dirname, "..");
    const shipped = readShippedVersion(root);
    const src = fs.readFileSync(path.join(root, "plugin", "ai-gramam", "hooks", "register.ts"), "utf8");
    expect(src).toContain(`const VERSION = '${shipped}'`);
    const market = JSON.parse(fs.readFileSync(path.join(root, ".claude-plugin", "marketplace.json"), "utf8"));
    const entry = market.plugins.find((x: { name: string }) => x.name === "ai-gramam");
    expect(entry.version).toBe(shipped);
    expect(entry.source).toBe("./plugin/ai-gramam");
  });

  it("compares dotted versions numerically", () => {
    expect(compareVersions("0.2.0", "0.10.0")).toBe(-1);
    expect(compareVersions("1.0", "1.0.0")).toBe(0);
    expect(compareVersions("0.3.1", "0.3.0")).toBe(1);
  });
});

describe("link summary and setup router", () => {
  it("counts sessions linked now and remembers the last contact", () => {
    const link = new Link(() => "k", () => {}, (t) => t);
    expect(link.summary()).toEqual({ linkedNow: 0, versions: [], lastContactAt: null, lastVersion: null });
    link.takeInbox("session-aaaa", "0.2.0");
    link.takeInbox("session-bbbb", "0.3.0");
    const s = link.summary();
    expect(s.linkedNow).toBe(2);
    expect(s.versions).toEqual(["0.2.0", "0.3.0"]);
    expect(s.lastVersion).toBe("0.3.0");
    expect(link.summary(Date.now() + 60_000).linkedNow).toBe(0);
    expect(link.summary(Date.now() + 60_000).lastContactAt).not.toBeNull();
  });

  it("reports install state, versions and live counts", async () => {
    writePlugins({ version: 2, plugins: {} });
    const r = createSetupRouter({
      claudeDir: dir,
      appRoot: path.resolve(import.meta.dirname, ".."),
      live: async () => ({ link: { linkedNow: 1, versions: ["0.3.0"], lastContactAt: 5, lastVersion: "0.3.0" }, liveSessions: 2 }),
    });
    const s = await r.createCaller({} as never).status();
    expect(s.mod.state).toBe("not_installed");
    expect(s.shippedVersion).toMatch(/^\d+\.\d+\.\d+$/);
    expect(s.liveSessions).toBe(2);
    expect(s.claudeFolderFound).toBe(true);
  });
});
