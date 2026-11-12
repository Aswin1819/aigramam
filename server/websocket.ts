/**
 * WebSocket Handler - Real-time Claude Code monitoring
 *
 * Claude Code transcript structure:
 *   ~/.claude/projects/<encoded-path>/<session-id>.jsonl
 *
 * Encoded path: /home/user/myproject → -home-user-myproject
 * Each .jsonl file = one Claude Code session = one Hero
 */

import { WebSocket, WebSocketServer } from "ws";
import fs from "fs";
import path from "path";
import os from "os";
import {
  Hero,
  HeroClass,
  HeroState,
  DungeonRoom,
  ActiveTool,
  ROOM_POSITIONS,
  detectHeroClass,
} from "./routers/agents";

// ─── Constants ────────────────────────────────────────────────────────────────

const HOME_DIR = os.homedir();
const CLAUDE_DIR = path.join(HOME_DIR, ".claude");
const CLAUDE_PROJECTS_DIR = path.join(CLAUDE_DIR, "projects");
const DATA_DIR = path.join(HOME_DIR, ".claude-dungeon");
const HEROES_PATH = path.join(DATA_DIR, "heroes.json");
const POLL_INTERVAL_MS = 1000;
const IDLE_DELAY_MS = 10000;
// A session file must have been modified within this window to be considered "active"
const ACTIVE_SESSION_WINDOW_MS = 5 * 60 * 1000; // 5 minutes
// After this long with no file changes, remove the hero entirely
// Claude Code writes to the transcript every few seconds while active.
// 2 minutes without writes = session almost certainly ended.
const SESSION_EXPIRY_MS = 2 * 60 * 1000; // 2 minutes
// How often to check if Claude Code processes are still alive
const PROCESS_CHECK_INTERVAL_MS = 15 * 1000; // 15 seconds

// ─── State ────────────────────────────────────────────────────────────────────

let wss: WebSocketServer | null = null;
const heroes = new Map<number, Hero>();
const fileWatchers = new Map<number, fs.FSWatcher>();
const pollTimers = new Map<number, NodeJS.Timeout>();
const idleTimers = new Map<number, NodeJS.Timeout>();
const fileOffsets = new Map<number, number>();
const fileToHeroId = new Map<string, number>(); // transcript file path → hero id
const projectDirWatchers = new Map<string, fs.FSWatcher>(); // project dir → watcher
const fileLastActivity = new Map<number, number>(); // heroId → last activity timestamp
const expiryTimers = new Map<number, NodeJS.Timeout>(); // heroId → expiry timer
let nextHeroId = 1;
let projectsRootWatcher: fs.FSWatcher | null = null;
let rootPollTimer: NodeJS.Timeout | null = null;
let processCheckTimer: NodeJS.Timeout | null = null;

// ─── Persistence ──────────────────────────────────────────────────────────────

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

function persistHeroes() {
  ensureDataDir();
  try {
    fs.writeFileSync(HEROES_PATH, JSON.stringify([...heroes.values()], null, 2));
  } catch {}
}

function loadPersistedHeroes() {
  // We intentionally do NOT restore persisted heroes on startup.
  // Heroes represent active Claude Code sessions — if the server restarted,
  // all sessions are considered ended. They will reappear when Claude Code
  // writes new activity to the transcript files.
  ensureDataDir();
  // Clear any stale heroes.json
  try {
    if (fs.existsSync(HEROES_PATH)) {
      fs.writeFileSync(HEROES_PATH, JSON.stringify([]));
    }
  } catch {}
}

// ─── Path Helpers ─────────────────────────────────────────────────────────────

/**
 * Decode Claude Code's encoded project path back to real filesystem path
 * Example: -home-user-myproject → /home/user/myproject
 */
function decodeProjectPath(encodedName: string): string {
  // Claude encodes by replacing / with - and prepending -
  // Reverse: strip leading -, replace - with /
  return encodedName.replace(/^-/, "/").replace(/-/g, "/");
}

/**
 * Extract a friendly project name from the decoded path
 */
function projectNameFromPath(realPath: string): string {
  const parts = realPath.split("/").filter(Boolean);
  return parts[parts.length - 1] || realPath;
}

// ─── Tool → Room/State Mapping ────────────────────────────────────────────────

function toolNameToRoom(toolName: string): DungeonRoom {
  const lower = toolName.toLowerCase();
  // Combat actions → Boss Arena (executing, writing, building)
  if (lower.includes("bash") || lower.includes("execute") || lower.includes("run")) return "boss_arena";
  if (lower.includes("write") || lower.includes("edit") || lower.includes("create")) return "boss_arena";
  if (lower.includes("task") || lower.includes("agent")) return "boss_arena";
  // Research / scouting → Merchant Shop (gathering intel, buying potions)
  if (lower.includes("web") || lower.includes("search") || lower.includes("fetch")) return "shop";
  if (lower.includes("plan") || lower.includes("think")) return "shop";
  // Reading / studying → Dungeon Main (exploring, scouting)
  if (lower.includes("read") || lower.includes("view") || lower.includes("list") || lower.includes("glob")) return "corridor";
  return "boss_arena";
}

function toolNameToState(toolName: string): HeroState {
  const lower = toolName.toLowerCase();
  // Heavy execution → fighting
  if (lower.includes("bash") || lower.includes("execute")) return "fighting";
  if (lower.includes("write") || lower.includes("edit") || lower.includes("create")) return "fighting";
  if (lower.includes("task") || lower.includes("agent")) return "fighting";
  // Research & planning → shopping (at merchant)
  if (lower.includes("web") || lower.includes("search") || lower.includes("fetch")) return "shopping";
  if (lower.includes("plan") || lower.includes("think")) return "shopping";
  // Reading → casting (studying scrolls)
  if (lower.includes("read") || lower.includes("view") || lower.includes("list") || lower.includes("glob")) return "casting";
  return "fighting";
}

function formatToolStatus(toolName: string, input: Record<string, unknown>): string {
  const lower = toolName.toLowerCase();
  if (lower.includes("bash")) {
    const cmd = (input.command as string) || "";
    return `⚔️ Running: ${cmd.slice(0, 50)}`;
  }
  if (lower.includes("read") || lower.includes("view")) {
    const file = (input.file_path || input.path || input.filename || "") as string;
    return `📖 Reading: ${path.basename(String(file))}`;
  }
  if (lower.includes("write") || lower.includes("edit")) {
    const file = (input.file_path || input.path || "") as string;
    return `✍️ Writing: ${path.basename(String(file))}`;
  }
  if (lower.includes("web") || lower.includes("search")) {
    const q = (input.query || input.url || "") as string;
    return `🔍 Searching: ${String(q).slice(0, 40)}`;
  }
  if (lower.includes("task")) return `⚡ Spawning Sub-Agent`;
  return `🗡️ Using: ${toolName}`;
}

// ─── Hero Management ──────────────────────────────────────────────────────────

function createHero(agentId: number, transcriptPath: string, projectRealPath: string): Hero {
  const projectName = projectNameFromPath(projectRealPath);
  const name = `${projectName.slice(0, 8)}-${String(agentId).padStart(3, "0")}`;
  const hero: Hero = {
    id: agentId,
    name,
    heroClass: "warrior",
    state: "idle",
    position: { ...ROOM_POSITIONS.church },
    room: "church",
    activeTools: [],
    subAgentTools: {},
    toolCount: { bash: 0, read: 0, write: 0, web: 0 },
    isWaiting: false,
    skills: [],
    level: 1,
    exp: 0,
    hp: 100,
    maxHp: 100,
    mp: 100,
    maxMp: 100,
    projectPath: projectRealPath,
    sessionFile: transcriptPath,
  };
  // No random offset - frontend DungeonMap handles positioning via BFS pathfinding
  heroes.set(agentId, hero);
  persistHeroes();
  return hero;
}

function updateHeroState(hero: Hero, state: HeroState, room: DungeonRoom) {
  hero.state = state;
  hero.room = room;
  // Use exact room center position - frontend DungeonMap handles smooth movement via BFS
  hero.position = { ...ROOM_POSITIONS[room] };
}

function setHeroResting(heroId: number) {
  const hero = heroes.get(heroId);
  if (!hero) return;
  clearIdleTimer(heroId);
  // Short idle → rest at tavern, longer idle → return to church (sanctuary)
  updateHeroState(hero, "resting", "rest_area");
  hero.isWaiting = true;
  hero.activeTools = [];
  hero.hp = Math.min(hero.maxHp, hero.hp + 10);
  hero.mp = Math.min(hero.maxMp, hero.mp + 15);
  persistHeroes();
  broadcast({ type: "hero-update", payload: hero });
}

function clearIdleTimer(heroId: number) {
  const t = idleTimers.get(heroId);
  if (t) { clearTimeout(t); idleTimers.delete(heroId); }
}

/**
 * Remove a hero completely (session ended / expired)
 */
function removeHero(heroId: number) {
  const hero = heroes.get(heroId);
  if (!hero) return;

  // Clean up all timers and watchers
  clearIdleTimer(heroId);
  const expiry = expiryTimers.get(heroId);
  if (expiry) { clearTimeout(expiry); expiryTimers.delete(heroId); }
  const watcher = fileWatchers.get(heroId);
  if (watcher) { try { watcher.close(); } catch {} fileWatchers.delete(heroId); }
  const poll = pollTimers.get(heroId);
  if (poll) { clearInterval(poll); pollTimers.delete(heroId); }

  // Remove from maps
  if (hero.sessionFile) fileToHeroId.delete(hero.sessionFile);
  fileOffsets.delete(heroId);
  fileLastActivity.delete(heroId);
  heroes.delete(heroId);

  persistHeroes();
  broadcast({ type: "heroes-batch", payload: [...heroes.values()] });
  console.log(`[File Monitor] Hero removed (session ended): ${hero.name}`);
}

/**
 * Reset the expiry timer for a hero — called whenever the file has new activity
 */
function refreshExpiryTimer(heroId: number) {
  fileLastActivity.set(heroId, Date.now());
  const existing = expiryTimers.get(heroId);
  if (existing) clearTimeout(existing);
  const t = setTimeout(() => removeHero(heroId), SESSION_EXPIRY_MS);
  expiryTimers.set(heroId, t);
}

function scheduleRest(heroId: number, delay: number) {
  clearIdleTimer(heroId);
  const t = setTimeout(() => setHeroResting(heroId), delay);
  idleTimers.set(heroId, t);
}

// ─── JSONL Processing ─────────────────────────────────────────────────────────

function processLine(heroId: number, line: string) {
  let record: Record<string, unknown>;
  try {
    record = JSON.parse(line);
  } catch {
    return;
  }

  const hero = heroes.get(heroId);
  if (!hero) return;

  const type = record.type as string;

  // ── Tool use start (assistant message with tool_use blocks) ──────────────
  if (type === "assistant") {
    const message = record.message as { content?: unknown[] } | undefined;
    const blocks = message?.content || [];
    const toolUseBlocks = (blocks as Record<string, unknown>[]).filter(
      (b) => b.type === "tool_use"
    );

    if (toolUseBlocks.length > 0) {
      hero.isWaiting = false;
      clearIdleTimer(heroId);

      for (const block of toolUseBlocks) {
        const toolName = (block.name as string) || "unknown";
        const toolId = (block.id as string) || `tool-${Date.now()}`;
        const input = (block.input as Record<string, unknown>) || {};

        // Update tool counts
        const lower = toolName.toLowerCase();
        if (lower.includes("bash") || lower.includes("execute")) hero.toolCount.bash++;
        else if (lower.includes("read") || lower.includes("view")) hero.toolCount.read++;
        else if (lower.includes("write") || lower.includes("edit") || lower.includes("create")) hero.toolCount.write++;
        else if (lower.includes("web") || lower.includes("search") || lower.includes("fetch")) hero.toolCount.web++;

        // Add to active tools
        const activeTool: ActiveTool = {
          id: toolId,
          name: toolName,
          status: formatToolStatus(toolName, input),
          startedAt: Date.now(),
        };

        // Check if it's a sub-agent tool
        const parentId = record.parent_tool_use_id as string | undefined;
        if (parentId) {
          if (!hero.subAgentTools[parentId]) hero.subAgentTools[parentId] = [];
          hero.subAgentTools[parentId].push(activeTool);
        } else {
          hero.activeTools.push(activeTool);
        }

        // Update hero state based on primary tool
        if (hero.activeTools.length === 1 || toolUseBlocks.indexOf(block) === 0) {
          const room = toolNameToRoom(toolName);
          const state = toolNameToState(toolName);
          updateHeroState(hero, state, room);
        }
      }

      // Update hero class based on tool usage
      hero.heroClass = detectHeroClass(hero.toolCount);

      // Gain EXP
      hero.exp += toolUseBlocks.length * 5;
      if (hero.exp >= hero.level * 100) {
        hero.level++;
        hero.exp = hero.exp % (hero.level * 100);
        hero.maxHp += 10;
        hero.maxMp += 5;
        hero.hp = hero.maxHp;
        hero.mp = hero.maxMp;
        broadcast({ type: "hero-levelup", payload: { heroId, level: hero.level } });
      }

      persistHeroes();
      broadcast({ type: "hero-update", payload: hero });
    }
  }

  // ── Tool result (tool_result blocks in user message) ─────────────────────
  if (type === "user") {
    const message = record.message as { content?: unknown[] } | undefined;
    const blocks = message?.content || [];
    const resultBlocks = (blocks as Record<string, unknown>[]).filter(
      (b) => b.type === "tool_result"
    );

    if (resultBlocks.length > 0) {
      for (const block of resultBlocks) {
        const toolUseId = block.tool_use_id as string;
        // Remove from active tools
        hero.activeTools = hero.activeTools.filter((t) => t.id !== toolUseId);
        // Remove from sub-agent tools
        for (const key of Object.keys(hero.subAgentTools)) {
          hero.subAgentTools[key] = hero.subAgentTools[key].filter((t) => t.id !== toolUseId);
          if (hero.subAgentTools[key].length === 0) delete hero.subAgentTools[key];
        }
      }

      // If no more active tools, schedule rest
      if (hero.activeTools.length === 0 && Object.keys(hero.subAgentTools).length === 0) {
        scheduleRest(heroId, IDLE_DELAY_MS);
      }

      persistHeroes();
      broadcast({ type: "hero-update", payload: hero });
    }
  }

  // ── Turn end ──────────────────────────────────────────────────────────────
  if (type === "result" || type === "turn_end") {
    hero.activeTools = [];
    hero.subAgentTools = {};
    scheduleRest(heroId, 2000); // Rest sooner after turn ends
    persistHeroes();
    broadcast({ type: "hero-update", payload: hero });
  }

  // ── System / init ─────────────────────────────────────────────────────────
  if (type === "system" && record.subtype === "init") {
    // Hero just started a new session
    updateHeroState(hero, "idle", "corridor");
    broadcast({ type: "hero-update", payload: hero });
  }
}

function readNewLines(heroId: number, filePath: string) {
  try {
    const stat = fs.statSync(filePath);
    const offset = fileOffsets.get(heroId) || 0;
    if (stat.size <= offset) return;

    const fd = fs.openSync(filePath, "r");
    const buf = Buffer.alloc(stat.size - offset);
    fs.readSync(fd, buf, 0, buf.length, offset);
    fs.closeSync(fd);

    fileOffsets.set(heroId, stat.size);

    const newContent = buf.toString("utf-8");
    const lines = newContent.split("\n").filter((l) => l.trim());
    for (const line of lines) {
      processLine(heroId, line);
    }
  } catch {}
}

// ─── File Watching ────────────────────────────────────────────────────────────

function startWatchingFile(heroId: number, filePath: string) {
  const existing = fileWatchers.get(heroId);
  if (existing) { try { existing.close(); } catch {} }
  const existingPoll = pollTimers.get(heroId);
  if (existingPoll) clearInterval(existingPoll);

  fileOffsets.set(heroId, 0);

  // Read existing content first
  readNewLines(heroId, filePath);

  // Primary: fs.watch
  try {
    const watcher = fs.watch(filePath, () => {
      refreshExpiryTimer(heroId);
      readNewLines(heroId, filePath);
    });
    fileWatchers.set(heroId, watcher);
  } catch {}

  // Secondary: polling (macOS/Linux reliability)
  const poll = setInterval(() => {
    try {
      const stat = fs.statSync(filePath);
      const lastKnown = fileLastActivity.get(heroId) || 0;
      if (stat.mtimeMs > lastKnown) {
        refreshExpiryTimer(heroId);
      }
    } catch {}
    readNewLines(heroId, filePath);
  }, POLL_INTERVAL_MS);
  pollTimers.set(heroId, poll);
}

function handleNewTranscriptFile(filePath: string, projectRealPath: string) {
  if (!filePath.endsWith(".jsonl")) return;

  // Only process files that have been modified recently (active session)
  try {
    const stat = fs.statSync(filePath);
    const ageMs = Date.now() - stat.mtimeMs;
    if (ageMs > ACTIVE_SESSION_WINDOW_MS) return; // Skip old/historical files
  } catch {
    return;
  }

  let heroId = fileToHeroId.get(filePath) ?? null;

  if (heroId === null) {
    heroId = nextHeroId++;
    const hero = createHero(heroId, filePath, projectRealPath);
    fileToHeroId.set(filePath, heroId);
    broadcast({ type: "hero-new", payload: hero });
    console.log(`[File Monitor] New hero: ${hero.name} | project: ${projectRealPath}`);
  }

  refreshExpiryTimer(heroId);
  startWatchingFile(heroId, filePath);
}

/**
 * Watch a single project directory for new .jsonl session files
 */
function watchProjectDir(projectDirPath: string, encodedName: string) {
  if (projectDirWatchers.has(projectDirPath)) return; // already watching

  const realPath = decodeProjectPath(encodedName);

  // Scan existing .jsonl files — only recent ones (active sessions)
  try {
    const files = fs.readdirSync(projectDirPath).filter((f) => f.endsWith(".jsonl"));
    for (const file of files) {
      handleNewTranscriptFile(path.join(projectDirPath, file), realPath);
    }
  } catch {}

  // Watch for new session files
  try {
    const watcher = fs.watch(projectDirPath, (event, filename) => {
      if (filename && filename.endsWith(".jsonl")) {
        handleNewTranscriptFile(path.join(projectDirPath, filename), realPath);
      }
    });
    projectDirWatchers.set(projectDirPath, watcher);
  } catch {}
}

/**
 * Check if any Claude Code processes are still running.
 * If no claude processes exist and a hero's file hasn't changed recently,
 * remove the hero immediately rather than waiting for the full expiry timeout.
 */
function checkClaudeProcesses() {
  if (heroes.size === 0) return;

  import("child_process").then(({ execSync }) => {
    let claudeRunning = false;
    try {
      // Check for running claude processes (works on macOS and Linux)
      const result = execSync('pgrep -f "claude" 2>/dev/null || true', { encoding: 'utf-8', timeout: 3000 });
      claudeRunning = result.trim().length > 0;
    } catch {
      claudeRunning = true; // Assume running if we can't check
    }

    if (!claudeRunning) {
      // No claude processes running — remove all heroes immediately
      const heroIds = [...heroes.keys()];
      for (const heroId of heroIds) {
        removeHero(heroId);
      }
      console.log('[File Monitor] No Claude Code processes detected, removed all heroes');
    } else {
      // Claude is running somewhere, but check each hero's file recency
      const now = Date.now();
      const STALE_THRESHOLD_MS = 90 * 1000; // 90 seconds without file changes
      for (const [heroId, lastActivity] of fileLastActivity.entries()) {
        if (now - lastActivity > STALE_THRESHOLD_MS) {
          // Check if the file itself has been modified recently
          const hero = heroes.get(heroId);
          if (hero?.sessionFile) {
            try {
              const stat = fs.statSync(hero.sessionFile);
              if (now - stat.mtimeMs > STALE_THRESHOLD_MS) {
                removeHero(heroId);
                console.log(`[File Monitor] Stale session removed: ${hero.name}`);
              }
            } catch {
              // File deleted — remove hero
              removeHero(heroId);
            }
          }
        }
      }
    }
  }).catch(() => {});
}

/**
 * Watch ~/.claude/projects/ for new project directories
 */
function watchProjectsRoot() {
  if (!fs.existsSync(CLAUDE_PROJECTS_DIR)) {
    // Poll until ~/.claude/projects/ exists
    rootPollTimer = setInterval(() => {
      if (fs.existsSync(CLAUDE_PROJECTS_DIR)) {
        clearInterval(rootPollTimer!);
        rootPollTimer = null;
        watchProjectsRoot();
      }
    }, 3000);
    console.log(`[File Monitor] Waiting for ${CLAUDE_PROJECTS_DIR} to be created...`);
    return;
  }

  console.log(`[File Monitor] Watching projects root: ${CLAUDE_PROJECTS_DIR}`);

  // Scan existing project directories
  try {
    const entries = fs.readdirSync(CLAUDE_PROJECTS_DIR, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        watchProjectDir(path.join(CLAUDE_PROJECTS_DIR, entry.name), entry.name);
      }
    }
  } catch {}

  // Watch for new project directories
  try {
    projectsRootWatcher = fs.watch(CLAUDE_PROJECTS_DIR, (event, filename) => {
      if (!filename) return;
      const fullPath = path.join(CLAUDE_PROJECTS_DIR, filename);
      try {
        const stat = fs.statSync(fullPath);
        if (stat.isDirectory()) {
          watchProjectDir(fullPath, filename);
        }
      } catch {}
    });
  } catch (e) {
    console.error("[File Monitor] Failed to watch projects root:", e);
  }
}

// ─── Broadcast ────────────────────────────────────────────────────────────────

function broadcast(message: { type: string; payload: unknown }) {
  if (!wss) return;
  const data = JSON.stringify(message);
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      try { client.send(data); } catch {}
    }
  });
}

// ─── Client Message Handling ──────────────────────────────────────────────────

function createDemoHeroes(): Hero[] {
  const configs: Array<{ name: string; heroClass: HeroClass; state: HeroState; room: DungeonRoom; projectPath: string; tools: Array<{id: string; name: string; status: string}> }> = [
    { name: "warrior-001", heroClass: "warrior", state: "fighting", room: "boss_arena", projectPath: "/demo/my-project",
      tools: [{ id: "t0", name: "Bash", status: "⚔️ Running: npm run build" }] },
    { name: "mage-002", heroClass: "mage", state: "casting", room: "boss_arena", projectPath: "/demo/web-app",
      tools: [{ id: "t1", name: "WebSearch", status: "🔍 Searching: React hooks best practices" }] },
    { name: "cleric-003", heroClass: "cleric", state: "shopping", room: "shop", projectPath: "/demo/api-service",
      tools: [{ id: "t2", name: "Think", status: "🔮 Planning: architecture design" }] },
    { name: "warrior-004", heroClass: "warrior", state: "resting", room: "rest_area", projectPath: "/demo/backend",
      tools: [] },
  ];
  return configs.map((d, i) => ({
    id: 9000 + i,
    name: d.name,
    heroClass: d.heroClass,
    state: d.state,
    position: { ...ROOM_POSITIONS[d.room] },
    room: d.room,
    activeTools: d.tools.map(t => ({ ...t, startedAt: Date.now() - i * 5000 })),
    subAgentTools: {},
    toolCount: { bash: 5 + i, read: 3 + i, write: 2 + i, web: 1 + i },
    isWaiting: d.state === "resting",
    skills: [],
    level: i + 1,
    exp: 50 * (i + 1),
    hp: 80 + i * 5,
    maxHp: 100,
    mp: 60 + i * 10,
    maxMp: 100,
    projectPath: d.projectPath,
    sessionFile: "",
  }));
}

function handleClientMessage(msg: Record<string, unknown>) {
  if (msg.type === "clear-heroes") {
    heroes.clear();
    fileToHeroId.clear();
    nextHeroId = 1;
    persistHeroes();
    broadcast({ type: "heroes-batch", payload: [] });
  }

  if (msg.type === "demo-start") {
    // Generate and broadcast demo heroes
    const demoHeroes = createDemoHeroes();
    broadcast({ type: "heroes-batch", payload: demoHeroes });
  }

  if (msg.type === "demo-stop") {
    // Switch to live mode: broadcast real persisted heroes
    broadcast({ type: "heroes-batch", payload: [...heroes.values()] });
  }

  if (msg.type === "demo-mode") {
    // Legacy: broadcast current state
    broadcast({ type: "heroes-batch", payload: [...heroes.values()] });
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

export function initializeWebSocket(server: unknown) {
  wss = new WebSocketServer({ server: server as any, path: "/api/ws/agents" });

  loadPersistedHeroes();

  wss.on("connection", (ws) => {
    console.log("[WebSocket] Client connected");

    // Send current hero state to new client
    ws.send(JSON.stringify({
      type: "heroes-batch",
      payload: [...heroes.values()],
    }));

    ws.on("message", (data) => {
      try {
        const msg = JSON.parse(data.toString());
        handleClientMessage(msg);
      } catch {}
    });

    ws.on("close", () => console.log("[WebSocket] Client disconnected"));
    ws.on("error", (e) => console.error("[WebSocket] Error:", e));
  });

  // Start monitoring Claude Code projects
  watchProjectsRoot();

  // Periodically check if Claude Code processes are still alive
  // This provides faster hero removal when terminal is closed
  processCheckTimer = setInterval(() => checkClaudeProcesses(), PROCESS_CHECK_INTERVAL_MS);
}

export function getHeroes(): Hero[] {
  return [...heroes.values()];
}

// ─── Bridge Callbacks (for REST Bridge API) ───────────────────────────────────

/**
 * Returns callback functions that the Bridge REST API can use to inject
 * hero data received from the local bridge script into the WebSocket broadcast.
 */
export function getBroadcastCallbacks() {
  return {
    onHeroNew: (heroData: Record<string, unknown>) => {
      const hero = heroData as unknown as Hero;
      heroes.set(hero.id, hero);
      if (hero.id >= nextHeroId) nextHeroId = hero.id + 1;
      if (hero.sessionFile) fileToHeroId.set(hero.sessionFile, hero.id);
      persistHeroes();
      broadcast({ type: "hero-new", payload: hero });
      console.log(`[Bridge] New hero received: ${hero.name}`);
    },

    onHeroUpdate: (heroData: Record<string, unknown>) => {
      const hero = heroData as unknown as Hero;
      heroes.set(hero.id, hero);
      persistHeroes();
      broadcast({ type: "hero-update", payload: hero });
    },

    onHeroesBatch: (heroesData: Record<string, unknown>[]) => {
      // Replace all heroes with the batch from the bridge
      heroes.clear();
      fileToHeroId.clear();
      nextHeroId = 1;
      for (const heroData of heroesData) {
        const hero = heroData as unknown as Hero;
        heroes.set(hero.id, hero);
        if (hero.id >= nextHeroId) nextHeroId = hero.id + 1;
        if (hero.sessionFile) fileToHeroId.set(hero.sessionFile, hero.id);
      }
      persistHeroes();
      broadcast({ type: "heroes-batch", payload: [...heroes.values()] });
      console.log(`[Bridge] Received batch of ${heroesData.length} heroes`);
    },

    onHeroClear: () => {
      heroes.clear();
      fileToHeroId.clear();
      nextHeroId = 1;
      persistHeroes();
      broadcast({ type: "heroes-batch", payload: [] });
      console.log(`[Bridge] Heroes cleared`);
    },
  };
}
