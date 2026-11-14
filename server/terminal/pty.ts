/**
 * Loads node-pty for managed terminals, with a message that says how to fix
 * it when its native part is missing.
 *
 * node-pty ships ready-made binaries for Windows and macOS. On Linux it is
 * built once on the computer (pnpm skips its build script by default, see
 * `pnpm.ignoredBuiltDependencies`), so a fresh Linux install has terminals
 * off until `node scripts/build-terminal.mjs` has run.
 */
import fs from "fs";
import path from "path";

export const PTY_BUILD_COMMAND = "node scripts/build-terminal.mjs";

/** The error shown when node-pty can't be loaded. */
export function ptyUnavailableMessage(platform: NodeJS.Platform, detail: string): string {
  const fix =
    platform === "linux"
      ? `On Linux, build it once in the aigramam folder with \`${PTY_BUILD_COMMAND}\` (needs python3, make and a C++ compiler, e.g. \`sudo apt install build-essential python3\`), then restart Ai Gramam.`
      : `Reinstall the app's packages (\`npx -y pnpm@10.4.1 install\`), then restart Ai Gramam.`;
  return `Terminals aren't available: the terminal library (node-pty) couldn't load. ${fix} Details: ${detail}`;
}

/**
 * macOS and Linux: node-pty starts shells through its `spawn-helper` program,
 * which must be executable. Package managers don't always keep that bit (and
 * node-pty's own install script, which would fix it, is skipped), so set it
 * once. Only that one file inside node-pty's own folder is touched.
 */
export function ensureSpawnHelperExecutable(ptyDir: string, platform: NodeJS.Platform = process.platform, arch: string = process.arch): void {
  if (platform === "win32") return;
  for (const dir of [path.join("build", "Release"), path.join("prebuilds", `${platform}-${arch}`)]) {
    const helper = path.join(ptyDir, dir, "spawn-helper");
    try {
      const mode = fs.statSync(helper).mode;
      if ((mode & 0o111) !== 0o111) fs.chmodSync(helper, mode | 0o755);
    } catch {}
  }
}

/** Requires node-pty, or throws an Error whose message says how to fix it. */
export function loadPty<T>(load: () => T, resolve: (id: string) => string, platform: NodeJS.Platform = process.platform): T {
  try {
    ensureSpawnHelperExecutable(path.dirname(path.dirname(resolve("node-pty"))), platform);
  } catch {}
  try {
    return load();
  } catch (e) {
    throw new Error(ptyUnavailableMessage(platform, e instanceof Error ? e.message.split("\n")[0] : String(e)));
  }
}
