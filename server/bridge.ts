/**
 * Bridge API - receives session updates from the optional remote bridge script
 *
 * The local bridge script runs on the user's machine, watches ~/.claude/projects/
 * and POSTs session updates here, so Ai Gramam can show Claude Code activity
 * from another machine.
 *
 * Security: protected by a shared API key stored in ~/.ai-gramam/config.json
 */

import { Router, Request, Response } from "express";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { isLocalRequest } from "./_core/security";
import { DATA_DIR } from "./_core/paths";

// ─── Config helpers ───────────────────────────────────────────────────────────

interface Config {
  bridgeApiKey?: string;
  claudeDir?: string;
}

function loadConfig(dir = DATA_DIR): Config {
  try {
    return JSON.parse(fs.readFileSync(path.join(dir, "config.json"), "utf-8"));
  } catch {
    return {};
  }
}

function saveConfig(config: Config, dir = DATA_DIR) {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "config.json"), JSON.stringify(config, null, 2));
}

/** The key the remote bridge must send; created on first use. Anyone holding it can push sessions here. */
export function getOrCreateApiKey(dir = DATA_DIR): string {
  const config = loadConfig(dir);
  if (config.bridgeApiKey) return config.bridgeApiKey;
  const key = "gramam_" + crypto.randomBytes(24).toString("hex");
  saveConfig({ ...config, bridgeApiKey: key }, dir);
  return key;
}

// ─── Auth middleware ──────────────────────────────────────────────────────────

function requireBridgeKey(req: Request, res: Response, next: () => void) {
  const key = req.headers["x-bridge-api-key"] as string | undefined;
  const validKey = getOrCreateApiKey();
  const given = Buffer.from(typeof key === "string" ? key : "");
  const expected = Buffer.from(validKey);
  const ok = given.length === expected.length && crypto.timingSafeEqual(given, expected);
  if (!ok) {
    res.status(401).json({ error: "Invalid or missing bridge API key" });
    return;
  }
  next();
}

// ─── Bridge router ────────────────────────────────────────────────────────────

export function createBridgeRouter(
  onHeroUpdate: (hero: Record<string, unknown>) => void,
  onHeroNew: (hero: Record<string, unknown>) => void,
  onHeroesBatch: (heroes: Record<string, unknown>[]) => void,
  onHeroClear: () => void,
) {
  const router = Router();

  /**
   * GET /api/bridge/status
   * Returns bridge connection status and API key info
   */
  router.get("/status", (_req: Request, res: Response) => {
    const config = loadConfig();
    res.json({
      ok: true,
      hasApiKey: !!config.bridgeApiKey,
      apiKeyPrefix: config.bridgeApiKey ? config.bridgeApiKey.slice(0, 10) + "..." : null,
    });
  });

  /**
   * GET /api/bridge/key
   * Returns (or creates) the bridge API key — only accessible from localhost
   */
  router.get("/key", (req: Request, res: Response) => {
    // Allow localhost access only. Check the real socket address, not the
    // Host header, which any client can set to "localhost".
    if (!isLocalRequest(req)) {
      res.status(403).json({ error: "API key endpoint only accessible from localhost" });
      return;
    }
    const key = getOrCreateApiKey();
    res.json({ apiKey: key });
  });

  /**
   * POST /api/bridge/heroes
   * Receive a batch of heroes from the local bridge script
   * Body: { heroes: Hero[] }
   */
  router.post("/heroes", requireBridgeKey, (req: Request, res: Response) => {
    const { heroes } = req.body as { heroes: Record<string, unknown>[] };
    if (!Array.isArray(heroes)) {
      res.status(400).json({ error: "heroes must be an array" });
      return;
    }
    onHeroesBatch(heroes);
    res.json({ ok: true, count: heroes.length });
  });

  /**
   * POST /api/bridge/hero
   * Receive a single hero update from the local bridge script
   * Body: { hero: Hero, event: "new" | "update" }
   */
  router.post("/hero", requireBridgeKey, (req: Request, res: Response) => {
    const { hero, event } = req.body as {
      hero: Record<string, unknown>;
      event: "new" | "update";
    };
    if (!hero || typeof hero !== "object") {
      res.status(400).json({ error: "hero must be an object" });
      return;
    }
    if (event === "new") {
      onHeroNew(hero);
    } else {
      onHeroUpdate(hero);
    }
    res.json({ ok: true });
  });

  /**
   * POST /api/bridge/clear
   * Clear all heroes (e.g., when bridge disconnects)
   */
  router.post("/clear", requireBridgeKey, (_req: Request, res: Response) => {
    onHeroClear();
    res.json({ ok: true });
  });

  return router;
}

export { loadConfig, saveConfig };
