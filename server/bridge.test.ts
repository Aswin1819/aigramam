/**
 * Bridge API key + bridge script checks, and the one-time data-folder carry-over.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "fs";
import path from "path";
import os from "os";
import { fileURLToPath } from "url";
import { getOrCreateApiKey } from "./bridge";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const SCRIPT = path.join(ROOT, "bridge", "ai-gramam-bridge.mjs");
let tmp: string;

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "gramam-bridge-"));
});
afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));

describe("bridge API key", () => {
  it("creates an unguessable key once and keeps it", () => {
    const key = getOrCreateApiKey(tmp);
    expect(key).toMatch(/^gramam_[0-9a-f]{48}$/);
    expect(getOrCreateApiKey(tmp)).toBe(key);
    expect(JSON.parse(fs.readFileSync(path.join(tmp, "config.json"), "utf8")).bridgeApiKey).toBe(key);
  });

  it("keeps an existing key and other settings", () => {
    fs.writeFileSync(path.join(tmp, "config.json"), JSON.stringify({ bridgeApiKey: "existing-key", theme: "dark" }));
    expect(getOrCreateApiKey(tmp)).toBe("existing-key");
    expect(JSON.parse(fs.readFileSync(path.join(tmp, "config.json"), "utf8")).theme).toBe("dark");
  });
});

describe("bridge script", () => {
  it("is present, uses the Ai Gramam names and talks to the bridge API", () => {
    const content = fs.readFileSync(SCRIPT, "utf-8");
    expect(content).toContain("AI_GRAMAM_API_KEY");
    expect(content).toContain("/api/bridge/heroes");
    expect(content).toContain("x-bridge-api-key");
    expect(content).not.toMatch(/cpab_/i);
  });

  it("defaults to the local server, not a third-party host", () => {
    const content = fs.readFileSync(SCRIPT, "utf-8");
    expect(content).toMatch(/process\.env\.AI_GRAMAM_SERVER \|\|\s*"http:\/\/localhost:4317"/);
    expect(content).not.toContain("manus.space");
  });

  it("downloadable copy matches the source", () => {
    const served = fs.readFileSync(path.join(ROOT, "client", "public", "bridge", "ai-gramam-bridge.mjs"), "utf-8");
    expect(served).toBe(fs.readFileSync(SCRIPT, "utf-8"));
  });
});
