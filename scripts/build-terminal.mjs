// Builds the terminal library (node-pty) on this computer when it has no ready-made binary (Linux).
// Usage, in the aigramam folder after installing: node scripts/build-terminal.mjs
//
// Windows and macOS come with ready-made binaries, so this only checks them. On Linux it runs
// node-gyp (fetched with npx, like pnpm) in node-pty's folder, which needs python3, make and a C++
// compiler (Debian/Ubuntu: sudo apt install build-essential python3). Then it checks node-pty loads.
// pnpm skips node-pty's own build script on purpose (pnpm.ignoredBuiltDependencies in package.json),
// which is why `pnpm rebuild node-pty` does nothing.
import { spawnSync } from "child_process";
import fs from "fs";
import path from "path";
import { createRequire } from "module";
import { fileURLToPath } from "url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(path.join(root, "package.json"));
let ptyDir;
try {
  ptyDir = fs.realpathSync(path.dirname(require.resolve("node-pty/package.json")));
} catch {
  console.error("node-pty isn't installed. Run `npx -y pnpm@10.4.1 install` in the aigramam folder first.");
  process.exit(1);
}

const binary = ["build/Release/pty.node", `prebuilds/${process.platform}-${process.arch}/pty.node`].map((p) => path.join(ptyDir, p)).find((p) => fs.existsSync(p));
if (binary) {
  console.log(`The terminal library already has a binary for this computer (${path.relative(ptyDir, binary)}).`);
} else {
  console.log(`Building the terminal library (node-pty) for ${process.platform}-${process.arch}. This takes about a minute…`);
  const npx = process.platform === "win32" ? "npx.cmd" : "npx";
  const r = spawnSync(npx, ["-y", "node-gyp@11", "rebuild"], { cwd: ptyDir, stdio: "inherit", shell: process.platform === "win32" });
  if (r.status !== 0) {
    console.error("\nThe build failed. It needs python3, make and a C++ compiler (Debian/Ubuntu: sudo apt install build-essential python3; Fedora: sudo dnf install gcc-c++ make python3). Install them and run this again.");
    process.exit(1);
  }
}

// Check it loads (the same way the app loads it).
try {
  require("node-pty");
  console.log("The terminal library loads. Restart Ai Gramam if it's running, and Workspace → Terminals will work.");
} catch (e) {
  console.error(`The terminal library still doesn't load: ${e instanceof Error ? e.message.split("\n")[0] : e}`);
  process.exit(1);
}
