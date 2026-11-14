/**
 * Connects managed terminals to the browser WebSocket: tabs list terminals,
 * create one from a click, attach to see output, type, resize and close.
 * Demo tabs can't use terminals (the demo never acts on this computer).
 */
import { createRequire } from "module";
import os from "os";
import path from "path";
import { WebSocket } from "ws";
import type * as NodePty from "node-pty";
import type { ProjectView } from "@shared/model";
import type { TerminalServerMessage } from "@shared/terminal";
import { readRegistry } from "../monitor/registry";
import { TerminalManager, type Spawn } from "./manager";

import { loadPty } from "./pty";

const require = createRequire(import.meta.url);
let pty: typeof NodePty | null = null;

/**
 * node-pty is loaded on the first terminal, not at startup: if its native part
 * is missing (Linux needs a one-time build), only terminals are unavailable and
 * they say how to fix it; the rest of the app runs.
 */
const spawnPty: Spawn = (shell, args, o) => {
  pty ??= loadPty(() => require("node-pty") as typeof NodePty, require.resolve);
  return pty.spawn(shell, args, { name: "xterm-256color", cols: o.cols, rows: o.rows, cwd: o.cwd, env: o.env as Record<string, string>, useConpty: true });
};

let manager: TerminalManager | null = null;
/** Which tabs have each terminal open (they get its output). */
const subscribers = new Map<string, Set<WebSocket>>();
const clients = new Set<WebSocket>();

function send(ws: WebSocket, msg: TerminalServerMessage) {
  if (ws.readyState === WebSocket.OPEN) {
    try {
      ws.send(JSON.stringify(msg));
    } catch {}
  }
}

/** Called once at startup. `claudeDir` is where Claude Code keeps its session registry (read-only). */
export function initTerminals(projects: () => ProjectView[], claudeDir = path.join(os.homedir(), ".claude")) {
  const sessionsDir = path.join(claudeDir, "sessions");
  manager = new TerminalManager({
    spawn: spawnPty,
    projects,
    registry: () => readRegistry(sessionsDir),
    onOutput: (id, data) => {
      for (const ws of subscribers.get(id) ?? []) send(ws, { type: "term-output", payload: { id, data } });
    },
    onList: (terminals) => {
      for (const id of [...subscribers.keys()]) if (!terminals.some((t) => t.id === id)) subscribers.delete(id);
      for (const ws of clients) send(ws, { type: "term-list", payload: { terminals, shellName: manager!.shellName } });
    },
  });
  manager.startLinking();
  // Never leave shells running after the server stops.
  const stopAll = () => manager?.closeAll();
  process.once("exit", stopAll);
  for (const sig of ["SIGINT", "SIGTERM", "SIGHUP"] as const) process.once(sig, () => (stopAll(), process.exit(0)));
}

/** The managed terminal a Claude Code session runs in (exact process-tree match), if any. */
export function terminalForSession(sessionId: string): string | undefined {
  return manager?.terminalForSession(sessionId);
}

export function terminalClientConnected(ws: WebSocket) {
  clients.add(ws);
  if (manager) send(ws, { type: "term-list", payload: { terminals: manager.list(), shellName: manager.shellName } });
}

export function terminalClientClosed(ws: WebSocket) {
  clients.delete(ws);
  for (const set of subscribers.values()) set.delete(ws);
}

/** Handles term-* messages; returns false for anything else. */
export function handleTerminalMessage(ws: WebSocket, msg: Record<string, unknown>, isDemo: boolean): boolean {
  if (typeof msg.type !== "string" || !msg.type.startsWith("term-")) return false;
  const p = (msg.payload ?? {}) as Record<string, unknown>;
  const id = typeof p.id === "string" ? p.id : "";
  if (!manager) return true;
  if (isDemo) {
    if (msg.type === "term-create") send(ws, { type: "term-created", payload: { requestId: String(p.requestId ?? ""), ok: false, error: "Switch to Live to use terminals." } });
    return true;
  }
  switch (msg.type) {
    case "term-create": {
      const m = manager;
      const requestId = String(p.requestId ?? "");
      void m.create(String(p.projectId ?? ""), p.cols, p.rows, p.start).then((r) => {
        if (r.ok) subscribers.set(r.id, new Set([ws]));
        send(ws, { type: "term-created", payload: { requestId, ...r } });
      });
      return true;
    }
    case "term-attach": {
      const back = manager.scrollback(id);
      if (back === null) return send(ws, { type: "term-error", payload: { id, error: "That terminal is closed." } }), true;
      const set = subscribers.get(id) ?? new Set<WebSocket>();
      set.add(ws);
      subscribers.set(id, set);
      if (back) send(ws, { type: "term-output", payload: { id, data: back, replay: true } });
      return true;
    }
    case "term-detach":
      subscribers.get(id)?.delete(ws);
      return true;
    case "term-input":
      manager.input(id, p.data);
      return true;
    case "term-resize":
      manager.resize(id, p.cols, p.rows);
      return true;
    case "term-close":
      manager.close(id);
      return true;
  }
  return true;
}
