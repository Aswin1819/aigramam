import fs from "fs";
import os from "os";
import path from "path";
import { createRequire } from "module";
import { afterEach, describe, expect, it } from "vitest";
import { chooseShell, shellArgs, shellLabel } from "./terminal/shell";
import { descendantsOf, parsePsOutput } from "./terminal/links";
import { ensureSpawnHelperExecutable, loadPty, ptyUnavailableMessage, PTY_BUILD_COMMAND } from "./terminal/pty";

describe("which shell a terminal starts", () => {
  const has = (...files: string[]) => (p: string) => files.includes(p);

  it("Windows: PowerShell", () => {
    expect(chooseShell("win32", { SHELL: "/bin/zsh" }, has())).toBe("powershell.exe");
  });

  it("macOS and Linux: the person's own shell, else zsh on macOS and bash on Linux", () => {
    expect(chooseShell("darwin", { SHELL: "/opt/homebrew/bin/fish" }, has("/opt/homebrew/bin/fish"))).toBe("/opt/homebrew/bin/fish");
    expect(chooseShell("darwin", {}, has("/bin/zsh", "/bin/bash"))).toBe("/bin/zsh");
    expect(chooseShell("linux", {}, has("/bin/zsh", "/bin/bash"))).toBe("/bin/bash");
    // A $SHELL that isn't an absolute path to a file is ignored.
    expect(chooseShell("linux", { SHELL: "zsh" }, has("zsh", "/bin/bash"))).toBe("/bin/bash");
    expect(chooseShell("linux", { SHELL: "/gone/zsh" }, has("/bin/bash"))).toBe("/bin/bash");
    expect(chooseShell("linux", {}, has())).toBe("/bin/sh");
  });

  it("names the shell for the UI", () => {
    expect(shellLabel("powershell.exe")).toBe("PowerShell");
    expect(shellLabel("C:\\Program Files\\PowerShell\\7\\pwsh.exe")).toBe("PowerShell");
    expect(shellLabel("/bin/zsh")).toBe("zsh");
    expect(shellLabel("/usr/local/bin/bash")).toBe("bash");
  });

  it("runs Claude Code as the start command and stays open, never by typing", () => {
    expect(shellArgs("powershell.exe", false)).toEqual(["-NoLogo"]);
    expect(shellArgs("powershell.exe", true)).toEqual(["-NoLogo", "-NoExit", "-Command", "claude"]);
    expect(shellArgs("/bin/zsh", false)).toEqual(["-l"]);
    // $0 is the shell's own path (the last argument), so the shell that stays open is the same one.
    expect(shellArgs("/bin/zsh", true)).toEqual(["-i", "-l", "-c", 'claude; exec "$0" -l', "/bin/zsh"]);
    expect(shellArgs("/bin/bash", true)).toEqual(["-i", "-l", "-c", 'claude; exec "$0" -l', "/bin/bash"]);
    expect(shellArgs("/usr/bin/fish", true)).toEqual(["-l", "-C", "claude"]);
  });
});

describe("process tree on macOS and Linux (ps)", () => {
  it("parses ps output and keeps only children and grandchildren", () => {
    const procs = parsePsOutput("    1     0 /sbin/launchd\n  500     1 /bin/zsh\n  501   500 node\r\n  502   501 /usr/local/bin/rg\n  503   502 deep\n  600     1 other\nnot a line\n");
    expect(procs).toContainEqual({ pid: 501, ppid: 500, name: "node" });
    expect(procs).toContainEqual({ pid: 502, ppid: 501, name: "rg" });
    expect(descendantsOf([500], procs).map((p) => p.pid)).toEqual([501, 502]);
    expect(descendantsOf([999], procs)).toEqual([]);
  });
});

describe("terminal library (node-pty)", () => {
  let tmp: string | null = null;
  afterEach(() => {
    if (tmp) fs.rmSync(tmp, { recursive: true, force: true });
    tmp = null;
  });

  it("explains how to fix a missing native part, with the Linux build command", () => {
    expect(ptyUnavailableMessage("linux", "no pty.node")).toContain(PTY_BUILD_COMMAND);
    expect(ptyUnavailableMessage("linux", "no pty.node")).toMatch(/^Terminals aren't available/);
    expect(ptyUnavailableMessage("darwin", "x")).not.toContain("build-terminal");
    expect(() =>
      loadPty(
        () => {
          throw new Error("Cannot find module '../build/Release/pty.node'\nRequire stack: ...");
        },
        () => "/x/node_modules/node-pty/lib/index.js",
        "linux",
      ),
    ).toThrow(/build-terminal.mjs.*Details: Cannot find module '..\/build\/Release\/pty.node'$/s);
  });

  it.skipIf(process.platform === "win32")("makes spawn-helper executable (macOS and Linux)", () => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "aig-pty-"));
    const dir = path.join(tmp, "prebuilds", `${process.platform}-${process.arch}`);
    fs.mkdirSync(dir, { recursive: true });
    const helper = path.join(dir, "spawn-helper");
    fs.writeFileSync(helper, "");
    fs.chmodSync(helper, 0o644);
    ensureSpawnHelperExecutable(tmp);
    expect(fs.statSync(helper).mode & 0o111).toBe(0o111);
  });

  // A real shell through node-pty, with the shell and arguments a managed terminal uses.
  // Run in CI on each system (AIG_PTY_SMOKE=1); skipped otherwise.
  it.runIf(process.env.AIG_PTY_SMOKE === "1")(
    "starts this system's shell in a pseudo-terminal",
    async () => {
      const require = createRequire(import.meta.url);
      const pty = loadPty(() => require("node-pty") as typeof import("node-pty"), require.resolve);
      const shell = chooseShell();
      const p = pty.spawn(shell, shellArgs(shell, false), { name: "xterm-256color", cols: 80, rows: 24, cwd: os.tmpdir(), env: process.env as Record<string, string>, useConpty: true });
      let out = "";
      p.onData((d) => (out += d));
      // Works in PowerShell and sh-like shells; the echoed command line itself doesn't contain the result.
      p.write("echo aig-$((6*7))-ok\r");
      const deadline = Date.now() + 20_000;
      while (!out.includes("aig-42-ok") && Date.now() < deadline) await new Promise((r) => setTimeout(r, 100));
      p.kill();
      expect(out).toContain("aig-42-ok");
    },
    30_000,
  );
});
