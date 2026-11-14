// Takes the README screenshots from the built-in demo with a headless Chrome (no dependencies).
// Start the app first (npx pnpm@10.4.1 start), then: node scripts/readme-shots.mjs <outDir>
// It saves PNGs plus frames/*.jpg for the animated village; convert them to WebP for docs/images
// (for example with Pillow: quality 82 for stills, 880x525 at quality 60 and 200 ms per frame for the animation).
// Only demo sessions appear: the page is opened with ?demo in a scratch Chrome profile.
import { spawn } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";

const OUT = process.argv[2];
if (!OUT) throw new Error("usage: node scripts/readme-shots.mjs <outDir>");
fs.mkdirSync(path.join(OUT, "frames"), { recursive: true });
const BASE = process.env.AI_GRAMAM_URL ?? "http://127.0.0.1:4317";
const CHROME = process.env.CHROME ?? "C:/Program Files/Google/Chrome/Application/chrome.exe";
const PORT = 9333;
const profile = fs.mkdtempSync(path.join(os.tmpdir(), "aig-shots-"));
const chrome = spawn(CHROME, [
  "--headless=new", `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`, "--hide-scrollbars",
  "--window-size=1440,860", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--no-first-run", "about:blank",
], { stdio: "ignore" });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

try {
  let targets = [];
  for (let i = 0; i < 40 && !targets.length; i++) {
    try { targets = (await (await fetch(`http://127.0.0.1:${PORT}/json`)).json()).filter((t) => t.type === "page"); } catch {}
    if (!targets.length) await sleep(250);
  }
  const ws = new WebSocket(targets[0].webSocketDebuggerUrl);
  await new Promise((r) => (ws.onopen = r));
  let id = 0;
  const pending = new Map();
  ws.onmessage = (m) => {
    const d = JSON.parse(m.data);
    if (d.id && pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id); }
  };
  const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
  const evaluate = (expression) => send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
  const capture = async (file, format = "png") => {
    const { result } = await send("Page.captureScreenshot", format === "png" ? { format } : { format, quality: 90 });
    fs.writeFileSync(file, Buffer.from(result.data, "base64"));
  };
  const shot = async (name, url, waitMs, after) => {
    await send("Page.navigate", { url: BASE + url });
    await sleep(waitMs);
    if (after) { await evaluate(after); await sleep(2500); }
    await capture(path.join(OUT, `${name}.png`));
    console.log("saved", name);
  };
  const clickText = (t) => `(() => { const el = [...document.querySelectorAll("button,[role=option],[role=button]")].find(e => e.textContent.includes(${JSON.stringify(t)})); el?.click(); return !!el; })()`;

  await send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 860, deviceScaleFactor: 1, mobile: false });
  // Skip the first-visit guide so it doesn't cover the village.
  await send("Page.navigate", { url: `${BASE}/?demo` });
  await sleep(3000);
  await evaluate(`localStorage.setItem("ai-gramam.display", JSON.stringify({ legendSeen: true, boardOpen: true, dockOpen: true, sound: false }))`);

  await shot("workspace-focus", "/?demo&view=workspace&page=overview", 7000, clickText("Release v2"));
  await shot("village-bengaluru-dusk", "/?demo&time=dusk&world=bengaluru", 9000);
  await shot("style-toy-brick", "/?demo&time=day&world=kerala&art=toy-brick", 9000);
  await shot("style-comic", "/?demo&time=day&world=bengaluru&art=comic-art", 9000);

  await send("Page.navigate", { url: `${BASE}/?demo&time=dusk&world=kerala` });
  await sleep(8000);
  for (let i = 0; i < 60; i++) {
    await capture(path.join(OUT, "frames", `${String(i).padStart(3, "0")}.jpg`), "jpeg");
    await sleep(200);
  }
  console.log("saved 60 frames");
  ws.close();
} finally {
  chrome.kill();
  await sleep(500);
  fs.rmSync(profile, { recursive: true, force: true, maxRetries: 5 });
}
