#!/usr/bin/env node
/**
 * Regenerates all built-in placeholder art (original, CC0):
 *   node scripts/gen-art.mjs            worlds + characters
 *   node scripts/gen-art.mjs worlds     only worlds
 *   node scripts/gen-art.mjs characters only characters
 *   node scripts/gen-art.mjs stations   only the station props (also part of worlds)
 * Deterministic: running it again produces identical files.
 */
import fs from "node:fs";
import path from "node:path";
import { buildKerala } from "./art/kerala.mjs";
import { buildBengaluru } from "./art/bengaluru.mjs";

const root = path.resolve(import.meta.dirname, "..");
const what = process.argv[2] ?? "all";
const started = Date.now();

if (what === "all" || what === "worlds") {
  for (const [id, build] of [["kerala", buildKerala], ["bengaluru", buildBengaluru]]) {
    const dir = path.join(root, "worlds", id, "assets");
    fs.rmSync(dir, { recursive: true, force: true });
    build(dir);
  }
}
if (what === "all" || what === "worlds" || what === "stations") {
  const { buildStations } = await import("./art/stations.mjs");
  buildStations(path.join(root, "worlds"));
}
if (what === "all" || what === "characters") {
  const { buildCharacters } = await import("./art/characters.mjs");
  buildCharacters(path.join(root, "characters"));
}
console.log(`Done in ${((Date.now() - started) / 1000).toFixed(1)}s`);
