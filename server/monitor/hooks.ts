/**
 * Claude Code HTTP hooks: receiver endpoint + install/uninstall of our entries
 * in ~/.claude/settings.json (only when the user clicks Install in the UI).
 */
import crypto from "crypto";
import fs from "fs";
import os from "os";
import path from "path";
import express, { type Request, type Response, type Router } from "express";
import { isLocalRequest } from "../_core/security";
import type { HookPayload } from "./store";

export const HOOK_PATH = "/api/hooks";
export const HOOK_HEADER = "x-dungeon-hook-key";

/** Events we listen to. All are informational; we never return a decision. */
export const HOOK_EVENTS = [
  "SessionStart",
  "SessionEnd",
  "UserPromptSubmit",
  "PreToolUse",
  "PostToolUse",
  "PostToolUseFailure",
  "PermissionRequest",
  "Notification",
  "Stop",
  "StopFailure",
  "SubagentStart",
  "SubagentStop",
] as const;

const HOOK_TIMEOUT_SEC = 2;

// ── Shared secret (stored with the app's own data, not in ~/.claude) ─────────

export function getOrCreateHookKey(dataDir = path.join(os.homedir(), ".claude-dungeon")): string {
  const file = path.join(dataDir, "hook-key");
  try {
    const k = fs.readFileSync(file, "utf8").trim();
    if (/^[a-f0-9]{48}$/.test(k)) return k;
  } catch {}
  const key = crypto.randomBytes(24).toString("hex");
  fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(file, key, { encoding: "utf8", mode: 0o600 });
  return key;
}

function keyMatches(given: unknown, expected: string): boolean {
  const a = Buffer.from(typeof given === "string" ? given : "");
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// ── Receiver ──────────────────────────────────────────────────────────────────

export function createHooksRouter(getKey: () => string, onHook: (p: HookPayload) => void): Router {
  const router = express.Router();
  router.post("/", express.json({ limit: "2mb" }), (req: Request, res: Response) => {
    if (!isLocalRequest(req) || !keyMatches(req.headers[HOOK_HEADER], getKey())) {
      res.status(403).end();
      return;
    }
    // Reply first with an empty 2xx: Claude Code treats that as "no effect".
    // A JSON body could change Claude's behaviour, so we never send one.
    res.status(204).end();
    const body = req.body;
    if (body && typeof body === "object" && !Array.isArray(body)) {
      setImmediate(() => {
        try {
          onHook(body as HookPayload);
        } catch (e) {
          console.error("[Hooks] Failed to apply event:", (e as Error).message);
        }
      });
    }
  });
  return router;
}

// ── Settings install / uninstall ──────────────────────────────────────────────

type HookHandler = { type?: string; url?: string; [k: string]: unknown };
type MatcherGroup = { matcher?: string; hooks?: HookHandler[]; [k: string]: unknown };
type Settings = { hooks?: Record<string, MatcherGroup[]>; allowedHttpHookUrls?: unknown; [k: string]: unknown };

export function hookUrl(port: number) {
  return `http://127.0.0.1:${port}${HOOK_PATH}`;
}

function isOurs(h: HookHandler): boolean {
  return h?.type === "http" && typeof h.url === "string" && /^http:\/\/127\.0\.0\.1:\d+\/api\/hooks$/.test(h.url);
}

/** Remove every hook handler we added; drop groups/events left empty by that. Other hooks are untouched. */
export function withoutOurHooks(settings: Settings): Settings {
  const out: Settings = JSON.parse(JSON.stringify(settings));
  if (!out.hooks || typeof out.hooks !== "object") return out;
  for (const [event, groups] of Object.entries(out.hooks)) {
    if (!Array.isArray(groups)) continue;
    const kept: MatcherGroup[] = [];
    for (const g of groups) {
      if (!g || !Array.isArray(g.hooks)) {
        kept.push(g);
        continue;
      }
      const hadOurs = g.hooks.some(isOurs);
      const hooks = g.hooks.filter((h) => !isOurs(h));
      if (hooks.length > 0 || !hadOurs) kept.push({ ...g, hooks });
    }
    if (kept.length > 0) out.hooks[event] = kept;
    else delete out.hooks[event];
  }
  if (Object.keys(out.hooks).length === 0) delete out.hooks;
  return out;
}

export function withOurHooks(settings: Settings, port: number, key: string): Settings {
  const out = withoutOurHooks(settings);
  out.hooks = out.hooks && typeof out.hooks === "object" ? out.hooks : {};
  for (const event of HOOK_EVENTS) {
    const groups = Array.isArray(out.hooks[event]) ? out.hooks[event] : [];
    groups.push({
      hooks: [{ type: "http", url: hookUrl(port), timeout: HOOK_TIMEOUT_SEC, headers: { [HOOK_HEADER]: key } }],
    });
    out.hooks[event] = groups;
  }
  return out;
}

export function hasOurHooks(settings: Settings): boolean {
  if (!settings.hooks || typeof settings.hooks !== "object") return false;
  return Object.values(settings.hooks).some(
    (groups) => Array.isArray(groups) && groups.some((g) => Array.isArray(g?.hooks) && g.hooks.some(isOurs)),
  );
}

export interface HooksStatus {
  settingsPath: string;
  exists: boolean;
  readable: boolean;
  error?: string;
  installed: boolean;
  /** allowedHttpHookUrls is set and doesn't include our URL, so Claude Code would skip our hooks. */
  blockedByAllowlist: boolean;
}

export class HooksInstaller {
  constructor(
    readonly settingsPath = path.join(os.homedir(), ".claude", "settings.json"),
    private readonly backupDir = path.join(os.homedir(), ".claude-dungeon", "backups"),
  ) {}

  private read(): { settings: Settings; raw: string | null } {
    let raw: string | null = null;
    try {
      raw = fs.readFileSync(this.settingsPath, "utf8");
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === "ENOENT") return { settings: {}, raw: null };
      throw e;
    }
    const parsed = JSON.parse(raw.replace(/^﻿/, ""));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("settings.json is not a JSON object");
    return { settings: parsed as Settings, raw };
  }

  status(port: number): HooksStatus {
    try {
      const { settings, raw } = this.read();
      const allow = settings.allowedHttpHookUrls;
      const blockedByAllowlist =
        Array.isArray(allow) && !allow.some((u) => typeof u === "string" && (u === hookUrl(port) || u.endsWith("*")));
      return { settingsPath: this.settingsPath, exists: raw !== null, readable: true, installed: hasOurHooks(settings), blockedByAllowlist };
    } catch (e) {
      return { settingsPath: this.settingsPath, exists: true, readable: false, error: (e as Error).message, installed: false, blockedByAllowlist: false };
    }
  }

  /** Current and proposed file contents, so the UI can show exactly what will change. */
  preview(port: number, key: string, mode: "install" | "uninstall"): { before: string; after: string } {
    const { settings, raw } = this.read();
    const next = mode === "install" ? withOurHooks(settings, port, key) : withoutOurHooks(settings);
    return { before: raw ?? "", after: JSON.stringify(next, null, 2) + "\n" };
  }

  /** Writes the new settings after saving a timestamped backup in ~/.claude-dungeon/backups. */
  apply(port: number, key: string, mode: "install" | "uninstall"): { backupPath: string | null } {
    const { before, after } = this.preview(port, key, mode);
    let backupPath: string | null = null;
    if (before) {
      fs.mkdirSync(this.backupDir, { recursive: true });
      backupPath = path.join(this.backupDir, `settings-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
      fs.writeFileSync(backupPath, before, "utf8");
    }
    fs.mkdirSync(path.dirname(this.settingsPath), { recursive: true });
    const tmp = `${this.settingsPath}.dungeon-tmp`;
    fs.writeFileSync(tmp, after, "utf8");
    fs.renameSync(tmp, this.settingsPath);
    return { backupPath };
  }
}
