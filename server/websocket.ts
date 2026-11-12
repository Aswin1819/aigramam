/**
 * WebSocket: sends live snapshots of Claude Code sessions to the browser.
 *
 * The Monitor (server/monitor) builds the state; this file only decides who
 * gets which snapshot. Demo mode is per browser tab: a tab in demo mode gets
 * simulated sessions and no live data.
 */
import type { IncomingMessage } from "http";
import { WebSocket, WebSocketServer } from "ws";
import type { ActivityEntry, SessionStatus, SessionView, Snapshot } from "@shared/model";
import { verifyWsClient } from "./_core/security";
import { demoSnapshot } from "./monitor/demo";
import { Monitor } from "./monitor/monitor";
import { resolveProject } from "./monitor/projectRoot";
import type { HookPayload } from "./monitor/store";
import type { WorldsState } from "@shared/world";

const FLUSH_MS = 150;
const DEMO_TICK_MS = 1000;

let wss: WebSocketServer | null = null;
const monitor = new Monitor();
const demoClients = new Map<WebSocket, number>(); // tab → demo start time
const bridgeSessions = new Map<string, SessionView>();
let flushTimer: NodeJS.Timeout | null = null;
let lastSent = "";
let worldsState: (() => WorldsState) | null = null;

export function getMonitor() {
  return monitor;
}

// ── Snapshots ─────────────────────────────────────────────────────────────────

function liveSnapshot(now = Date.now()): Snapshot {
  const snap = monitor.store.snapshot(now);
  if (bridgeSessions.size === 0) return snap;
  const sessions = [...snap.sessions, ...bridgeSessions.values()];
  const projects = new Map(snap.projects.map((p) => [p.id, p]));
  for (const s of bridgeSessions.values()) {
    if (!projects.has(s.projectId)) projects.set(s.projectId, { id: s.projectId, name: s.cwd.split(/[\\/]/).filter(Boolean).pop() || s.cwd, root: s.cwd });
  }
  return { ...snap, sessions, projects: [...projects.values()] };
}

function send(ws: WebSocket, snapshot: Snapshot) {
  if (ws.readyState !== WebSocket.OPEN) return;
  try {
    ws.send(JSON.stringify({ type: "snapshot", payload: snapshot }));
  } catch {}
}

/** Send the live snapshot to every live tab, if anything changed. */
function flush() {
  flushTimer = null;
  if (!wss) return;
  const snap = liveSnapshot();
  const { serverTime: _t, ...rest } = snap;
  const key = JSON.stringify(rest);
  if (key === lastSent) return;
  lastSent = key;
  wss.clients.forEach((c) => {
    if (!demoClients.has(c)) send(c, snap);
  });
}

function scheduleFlush() {
  if (!flushTimer) flushTimer = setTimeout(flush, FLUSH_MS);
}

function sendDemo(ws: WebSocket) {
  const startedAt = demoClients.get(ws);
  // Demo sessions are fake, but the hooks status shown in the header is real.
  if (startedAt !== undefined) send(ws, { ...demoSnapshot(Date.now(), startedAt), hooks: monitor.store.hooksInfo() });
}

function handleClientMessage(ws: WebSocket, msg: Record<string, unknown>) {
  if (msg.type === "demo-start") {
    demoClients.set(ws, Date.now());
    sendDemo(ws);
  } else if (msg.type === "demo-stop") {
    demoClients.delete(ws);
    send(ws, liveSnapshot());
  }
}

// ── Worlds ────────────────────────────────────────────────────────────────────

function sendWorlds(ws: WebSocket) {
  if (!worldsState || ws.readyState !== WebSocket.OPEN) return;
  try {
    ws.send(JSON.stringify({ type: "worlds", payload: worldsState() }));
  } catch {}
}

/** Called once at startup; every tab gets the world list on connect and on change. */
export function setWorldsSource(get: () => WorldsState) {
  worldsState = get;
}

export function broadcastWorlds() {
  wss?.clients.forEach((c) => sendWorlds(c));
}

// ── Hooks ─────────────────────────────────────────────────────────────────────

export function handleHook(payload: HookPayload) {
  monitor.store.applyHook(payload);
  if (typeof payload.transcript_path === "string") monitor.follow(payload.transcript_path);
  scheduleFlush();
}

export function setHooksInstalled(installed: boolean) {
  if (monitor.store.hooksInstalled !== installed) {
    monitor.store.hooksInstalled = installed;
    scheduleFlush();
  }
}

// ── Setup ─────────────────────────────────────────────────────────────────────

export function initializeWebSocket(server: unknown) {
  wss = new WebSocketServer({
    server: server as any,
    path: "/api/ws/agents",
    // Block other websites (and DNS-rebinding hosts) from connecting
    verifyClient: (info: { origin: string; req: IncomingMessage }) => verifyWsClient(info),
  });

  wss.on("connection", (ws) => {
    sendWorlds(ws);
    send(ws, liveSnapshot());
    ws.on("message", (data) => {
      try {
        handleClientMessage(ws, JSON.parse(data.toString()));
      } catch {}
    });
    ws.on("close", () => demoClients.delete(ws));
    ws.on("error", (e) => console.error("[WebSocket] Error:", e.message));
  });

  setInterval(() => {
    for (const ws of demoClients.keys()) sendDemo(ws);
  }, DEMO_TICK_MS);

  monitor.start(scheduleFlush);
  console.log("[Monitor] Watching Claude Code sessions (read-only)");
}

// ── Bridge (sessions pushed from another machine, legacy hero format) ────────

const BRIDGE_STATUS: Record<string, SessionStatus> = {
  fighting: "working",
  casting: "working",
  shopping: "working",
  walking: "working",
  idle: "idle",
  resting: "idle",
};

function bridgeHeroToSession(h: Record<string, unknown>): SessionView | null {
  const id = h.id;
  if (typeof id !== "number" && typeof id !== "string") return null;
  const now = Date.now();
  const cwd = typeof h.projectPath === "string" && h.projectPath ? h.projectPath : "remote";
  const project = resolveProject(cwd, () => false);
  const tools = Array.isArray(h.activeTools) ? (h.activeTools as Record<string, unknown>[]) : [];
  const first = tools.find((t) => typeof t?.status === "string");
  const waiting = h.isWaiting === true;
  const status: SessionStatus = waiting ? "waiting" : BRIDGE_STATUS[String(h.state)] ?? "idle";
  const label = first ? String(first.status) : waiting ? "Your turn" : status === "idle" ? "Idle" : "Working";
  const recent: ActivityEntry[] = [];
  return {
    id: `bridge-${id}`,
    shortId: `bridge-${id}`.slice(0, 12),
    projectId: `bridge:${project.id}`,
    title: typeof h.name === "string" ? h.name : `Remote ${id}`,
    titleSource: "bridge",
    cwd,
    status,
    waitingReason: waiting ? "turn_end" : undefined,
    action: { kind: first ? "tool" : waiting ? "waiting" : "idle", emoji: first ? "🧰" : waiting ? "🔔" : "💤", label, startedAt: now },
    startedAt: now,
    lastActivityAt: now,
    statusSince: now,
    hooksActive: false,
    source: "bridge",
    subagents: [],
    recent,
  };
}

export function getBroadcastCallbacks() {
  const upsert = (h: Record<string, unknown>) => {
    const s = bridgeHeroToSession(h);
    if (s) bridgeSessions.set(s.id, s);
    scheduleFlush();
  };
  return {
    onHeroNew: upsert,
    onHeroUpdate: upsert,
    onHeroesBatch: (heroes: Record<string, unknown>[]) => {
      bridgeSessions.clear();
      for (const h of heroes) {
        const s = bridgeHeroToSession(h);
        if (s) bridgeSessions.set(s.id, s);
      }
      scheduleFlush();
    },
    onHeroClear: () => {
      bridgeSessions.clear();
      scheduleFlush();
    },
  };
}
