# Phase 0 Research: Indian "Worlds" Edition

Date: 2026-11-12. Claude Code versions observed on this machine: 2.1.266 to 2.1.322.

Evidence comes from three sources:
- reading this codebase;
- profiling the transcript files under `~/.claude/projects` (3.4 GB, 743 files). The profile read record types and field names only, never message content;
- the official Claude Code docs: [hooks](https://code.claude.com/docs/en/hooks.md), [sessions](https://code.claude.com/docs/en/sessions.md), [sub-agents](https://code.claude.com/docs/en/sub-agents.md), [statusline](https://code.claude.com/docs/en/statusline.md).

Anything marked **(unverified)** still needs a quick spike before we rely on it.

---

## 1. Architecture today

```
~/.claude/projects/<encoded-cwd>/<sessionId>.jsonl
        │  fs.watch + 1 s poll (server/websocket.ts)
        ▼
processLine() ── turns JSONL records into a "Hero" (state, room, activeTools, level/exp/hp)
        │  in-memory Map<number, Hero>  (+ written to ~/.claude-dungeon/heroes.json on every event)
        ▼
WebSocket /api/ws/agents ── messages: heroes-batch | hero-new | hero-update | hero-levelup
        │
        ▼
client/src/hooks/useHeroSocket.ts ── React state (heroes[], mode live/demo, log)
        │
        ├── pages/Home.tsx ── header, hero sidebar, log, Config / Skills modals (React + Tailwind)
        └── components/DungeonMapPhaser.tsx ── a Phaser 3.90 scene: fixed 70×40 tile map,
             5 hard-coded rooms, BFS pathfinding, sprite animations, name tags
```

| Concern | Where | Notes |
|---|---|---|
| Session discovery | `server/websocket.ts` `watchProjectsRoot` → `watchProjectDir` → `handleNewTranscriptFile` | Watches only top-level `*.jsonl` files changed in the last 5 min. It never looks inside `<sessionId>/subagents/`. |
| Liveness | `refreshExpiryTimer` (2 min without writes) and `checkClaudeProcesses` (every 15 s) | The process check only answers "is any `claude.exe` running on this machine", not whether a given session is alive. |
| Parsing | `processLine` | Handles `assistant` `tool_use` and `user` `tool_result` records. Its `result`, `turn_end`, `system:init` and `parent_tool_use_id` branches are written for the **Agent SDK stream format** and never match a transcript. |
| State to browser | `ws` WebSocket plus tRPC (`server/routers/agents.ts`) | tRPC handles skills, agents, config and connection status. Hero state goes over the WebSocket. |
| Remote push | `server/bridge.ts` plus `bridge/claude-dungeon-bridge.mjs` | Optional. Uses a second copy of the parser. |
| Rendering | `DungeonMapPhaser.tsx` (live) | Phaser with `pixelArt`, on a 3360×1920 canvas scaled to 50% with CSS (no resize handling). Room geometry, NPCs and sprite keys are hard-coded. |
| Dead code | `DungeonMap.tsx` (old canvas renderer), `PixelOffice`, `pixelEngine`, `AgentPanel`, `TranscriptInput`, `transcriptParser`, `mockData`, `Map`, `ComponentShowcase`, `AIChatBox`, `DashboardLayout`, `ManusDialog` | Nothing imports them, except chains that themselves start from dead files. |
| Types | `Hero` is defined twice: in `server/routers/agents.ts` and in `client/src/hooks/useHeroSocket.ts` | They can drift apart; `shared/` exists but isn't used for this. |

### Problems in the current pipeline (they matter for Phase 1)
1. **Project names are wrong.** `decodeProjectPath` reverses the folder encoding: `C--Users-aswin-Desktop-pp` becomes `C//Users/aswin/Desktop/pp`, and `claude-pixel-agent-web` would become `claude/pixel/agent/web`. The encoding is lossy (every non-alphanumeric character turns into `-`), so it can't be reversed. Every transcript record carries the real `cwd`, so we should use that.
2. **Plain-text messages break parsing.** `message.content` is sometimes a plain string: 67 of 471 `user` records in one sample. `blocks.filter` then throws. The catch is around the whole chunk, so **every later line in that chunk is dropped**. This is the same bug I fixed in the bridge.
3. **A line written in two pieces is lost.** If a read lands mid-write, the partial line fails to parse, the read position has already moved past it, and the line is gone.
4. **Whole history on discovery.** The server reads the entire file from byte 0 (one transcript here is 56 MB, loaded into a single buffer) and replays all of it. That's why heroes show levels like LV93 and why startup is slow.
5. **"Waiting" is a guess.** `isWaiting` is set by a 10-second idle timer, not by anything Claude Code reports.
6. **Subagents are invisible**, because their files are never watched.
7. **Heavy disk writes.** `heroes.json` is rewritten synchronously on every tool event. It also stores command lines and file names on disk with no need.
8. **Network calls, against our "local only" rule** (to be removed in Phase 1):
   - Google Fonts in `client/index.html`;
   - an Umami analytics `<script>` (`%VITE_ANALYTICS_ENDPOINT%`);
   - `vite-plugin-manus-runtime` and the Manus debug collector (writes browser logs to `.manus-logs/`);
   - the template's OAuth/LLM/S3/maps/voice helpers in `server/_core/*` (unused but present);
   - the MySQL/Drizzle setup.

---

## 2. Identity data per session and subagent

Three local sources exist. **None of them is a documented, stable API** except hooks; the docs call the transcript format internal.

### 2a. Transcript records (`~/.claude/projects/<enc>/<sessionId>.jsonl`)
Almost every record carries `sessionId`, `cwd`, `gitBranch`, `version`, `timestamp`, `uuid`, `parentUuid`, `isSidechain` and `entrypoint`. Separate metadata records also appear:

| Need | Field / record | Reliability |
|---|---|---|
| Session id | `sessionId` (also the file name) | **Solid** |
| Working directory (= project) | `cwd` on every message record | **Solid.** Can change mid-session (`cd`, worktrees), so use the latest value. |
| Git branch | `gitBranch` on every message record | **Solid** (seen on 100% of message records). It's the branch at the time of that record. |
| Title | `custom-title.customTitle` (from `/rename`), `agent-name.agentName`, `ai-title.aiTitle` (auto-generated, rewritten often) | **Good.** Priority: custom, then agent name, then AI title, then the first 8 characters of the session id. |
| Last prompt | `last-prompt.lastPrompt` | Good, but it's prompt text. Show it only in the detail panel. |
| Turn ended | `system` / `turn_duration` (`durationMs`, `messageCount`, sometimes `pendingBackgroundAgentCount`) | **Good.** Appeared 2,312 times. |
| Permission mode | `permission-mode.permissionMode` | Good. Tells us whether permission prompts can happen at all. |
| Tool call | `assistant` → `message.content[]` → `tool_use {id, name, input}` | **Solid** |
| Tool finished | `user` → `tool_result {tool_use_id, is_error}` plus top-level `toolUseResult` (`interrupted`, `stdout`, …) and `permissionDecision` | **Solid** |
| PR link | `pr-link {prNumber, prRepository, prUrl}` | Nice extra. |
| Timestamps | `timestamp` (ISO) per record | **Solid** |

### 2b. Subagent files (`<enc>/<sessionId>/subagents/agent-<agentId>.jsonl` plus `.meta.json`)
| Need | Field | Reliability |
|---|---|---|
| Subagent id | `agentId` on every record, and in the file name | **Solid** |
| Parent session | `sessionId` (= the parent's), plus the folder name | **Solid** |
| Subagent type | `.meta.json` `agentType` (e.g. `general-purpose`, `Explore`) | **Good.** The field list varies by version; I saw 8 different key sets. |
| Short task label | `.meta.json` `description` | Good |
| Link to the parent's `Agent` call | `.meta.json` `toolUseId`; the parent's `toolUseResult.agentId` | Good |
| Nesting depth | `.meta.json` `spawnDepth` | Good |
| Finished | `.meta.json` `finished` (only in newer versions), or the parent's `tool_result` for that `toolUseId` | Fair. Use the parent's tool result as the fallback. |

### 2c. Live session registry (`~/.claude/sessions/<pid>.json`)
This is not documented anywhere, but I found it here. There's one file per **running** interactive session, with fields: `pid`, `sessionId`, `cwd`, `name`, `nameSource` (`user` / `derived`), `status` (`idle` / `busy` / `shell` seen so far), `statusUpdatedAt`, `startedAt`, `version` and `kind`. All 10 PIDs in it were alive when I checked.

This gives us **reliable per-session liveness** (is that PID alive?) and a ready-made display name. Because it's undocumented, it should only add detail, never be required.

### 2d. Hooks (documented)
Every event includes `session_id`, `transcript_path`, `cwd` and `hook_event_name`. Subagent tool calls also carry `agent_id` and `agent_type`. `SubagentStart` and `SubagentStop` include `agent_id` and `agent_type`; `SubagentStop` adds `agent_transcript_path`. `session_title` appears only for custom titles. **Hooks don't send a git branch**; we get it from the transcript.

---

## 3. Detectable states

| State | Transcript only | With hooks | Notes |
|---|---|---|---|
| Working on a tool | **High**: a `tool_use` with no matching `tool_result` | **High**: `PreToolUse` → `PostToolUse` / `PostToolUseFailure` | |
| Thinking / writing a reply | Medium: an `assistant` record with `thinking`/`text` and no `turn_duration` yet | Medium: between `UserPromptSubmit` and `Stop` | |
| **Waiting: needs permission** | **Low.** A pending `tool_use` looks the same as a long-running command. Only a guess (pending for over N seconds and `permissionMode` not bypass/auto). | **High**: `PermissionRequest`, `Notification(permission_prompt)` | The main reason to add hooks. |
| **Waiting: asked a question** | **High**: a pending `AskUserQuestion` call | **High**: `PreToolUse(AskUserQuestion)`, `Notification(elicitation_dialog)` | |
| **Waiting: your turn** (turn ended) | **High**: `system:turn_duration` | **High**: `Stop` | `pendingBackgroundAgentCount > 0` means "paused, background work still running". |
| Idle | Medium: no activity for N minutes after the turn ended; registry `status: idle` | High: `Notification(idle_prompt)` | |
| Interrupted | High: `toolUseResult.interrupted`, or a "Request interrupted" text record | Medium: `Stop` doesn't fire on interrupt | |
| Error | Medium: `tool_result.is_error` (tool level only) | High: `PostToolUseFailure`, `StopFailure` (API errors) | |
| Finished / session ended | Medium: the registry PID is gone; otherwise file silence | **High**: `SessionEnd` (`reason`) | |
| Subagent start / finish | Good: new file in `subagents/`, and the parent's tool result | **High**: `SubagentStart` / `SubagentStop` | |

**Tool → action mapping**, from the tool names seen here:

| Kind | Tools | Example label |
|---|---|---|
| read | `Read`, `Grep`, `Glob` | `📖 Reading auth.ts`, `🔍 Searching "login"` |
| write | `Edit`, `Write`, `NotebookEdit` | `✏️ Editing auth.ts` |
| bash | `Bash`, `PowerShell` | `💻 Running npm test` |
| web | `WebSearch`, `WebFetch` | `🌐 Searching web "…"`, `🌐 Fetching example.com` |
| delegate | `Agent` / `Task` | `🤝 Delegating: <description>` |
| question | `AskUserQuestion` | `❓ Asking you a question` |
| other | `Skill`, `ToolSearch`, `mcp__<server>__<tool>`, task tools | `🧰 Using <server>.<tool>` |

Labels are built only from `input` fields (`file_path`, `command`, `pattern`, `query`, `url`, `description`), truncated, and kept **in memory**.

---

## 4. Data source options

| | A. JSONL transcript watching (today) | B. Hooks (HTTP or async command) | C. Hybrid (recommended) |
|---|---|---|---|
| Setup | None | Must add hooks to `~/.claude/settings.json` (or install a plugin) | Works with no setup; better once hooks are installed |
| Waiting for permission | Guess | **Exact** | Exact when hooks are on, otherwise a clearly labelled guess |
| Titles / branch / subagent type | Yes | Partly (no branch; title only if custom) | Yes |
| History on startup | Yes (read the file tail) | No (sees only events after install) | Yes |
| Format-drift risk | **High.** The docs call it internal; 22 versions in 14 days; the subagent meta changed shape 8 times. | **Low.** Documented, versioned. | Medium: drift only hurts the extra details |
| Effect on Claude Code | None (read-only) | One extra request per event. A down server = connection refused = no blocking. A *hung* server can stall up to `timeout`, so we must set `timeout: 2`. | Same as B |
| Windows | `fs.watch` is fine on NTFS; we keep the polling fallback. Paths in records are Windows paths (`C:\Users\…`). | HTTP hooks avoid shell issues completely (no Git Bash vs PowerShell question). Command hooks would need `node script.mjs` in exec form; `.cmd` shims can't be spawned. Payload path format **(unverified)**. | Same |

**Recommendation: C, the hybrid.**
- **Base layer, no setup.** Tail the transcripts properly: start from the end of the file (read only the last ~256 KB to rebuild current state), buffer partial lines, watch `subagents/`, and use the `~/.claude/sessions` registry for liveness and names. Every parser is wrapped so a format change downgrades to "unknown action", never a crash.
- **Optional precise layer.** An `http` hook pointing at `http://127.0.0.1:4317/api/hooks` for these events: `SessionStart`, `SessionEnd`, `UserPromptSubmit`, `PreToolUse`, `PostToolUse`, `PostToolUseFailure`, `PermissionRequest`, `Notification`, `Stop`, `StopFailure`, `SubagentStart`, `SubagentStop`. Each uses `"timeout": 2` and is never set to block on failure. The endpoint accepts loopback connections only and needs a shared secret header. Hook events win over transcript guesses for the same session.
- A `/setup` page in the UI shows the exact JSON to paste, and we install it only with your explicit consent (see the open questions).

---

## 5. Rendering recommendation

**Keep Phaser (already a dependency, v3.90). Don't add PixiJS.**

| | Phaser 3 (keep) | PixiJS | Canvas 2D / DOM only |
|---|---|---|---|
| New dependency | No | Yes, plus a rewrite | No |
| Layered and parallax backgrounds, cameras, scaling to fit | Built in (`Scale.FIT`/`RESIZE`, cameras, `TileSprite`) | Do it yourself | Do it yourself |
| Sprite sheets, animations, tweens, particles (rain, lamps, confetti) | Built in | Sprites yes; tweens and particles via plugins | Do it yourself |
| Loading packs at runtime | `this.load.spritesheet` / `audio` at runtime; textures can be removed | Similar | Do it yourself |
| Sound | Built in (Web Audio) | Needs another library | Do it yourself |
| Bundle size | Large (~1 MB min), already paid | Smaller | Smallest |
| Many sprites (10+ projects × sessions × subagents) | Fine at this scale (dozens of sprites) | Faster at thousands, which we won't reach | Fine |

**How Phaser would be used:**
- **World rendering in Phaser.** One `WorldScene` built from `world.json`, replacing the hard-coded `DungeonScene`, and responsive with `Scale.FIT` instead of the fixed 3360 px canvas. The existing dungeon becomes the first world pack (`worlds/dungeon`), so current visuals keep working.
- **Text in React, on top of the canvas.** Name tags, speech bubbles, the waiting banner, the sidebar and the detail panel are DOM elements positioned over the canvas. Phaser's scene-to-screen coordinates are projected each frame for the in-world tags. DOM text stays crisp at any zoom, is readable by screen readers, supports Malayalam and Kannada script with system fonts, and keeps "labels are always text" true.

---

## 6. Proposed schemas (draft)

Packs are **data only**: no code or scripts. Effects are a fixed set of built-in effect types (rain, lamp row, vehicle passing, particles) that a pack picks and configures. That keeps downloaded packs safe.

### `worlds/<id>/world.json`
```jsonc
{
  "schemaVersion": 1,
  "id": "kerala",
  "name": "Kerala Backwaters",
  "author": "Aswin1819",
  "license": "CC0-1.0",
  "size": { "width": 1920, "height": 1080 },          // logical size, scaled to fit the screen
  "palette": { "background": "#0b3d2e", "accent": "#f2b134", "label": "#fff8e7", "labelBg": "#1d2b22cc", "waiting": "#ff5a36" },
  "layers": [                                           // drawn back to front
    { "id": "sky",    "image": "assets/sky.png",    "scrollX": 0 },
    { "id": "palms",  "image": "assets/palms.png",  "parallax": 0.3 },
    { "id": "water",  "image": "assets/water.png",  "scrollX": 6 },   // slow scrolling backwaters
    { "id": "ground", "image": "assets/ground.png" }
  ],
  "locations": [                                         // one project per location
    { "id": "houseboat-1", "kind": "houseboat", "label": "Houseboat", "x": 320,  "y": 640, "prop": "assets/houseboat.png", "slots": 4 },
    { "id": "tea-shop",    "kind": "tea-shop",  "label": "Chaya Kada", "x": 900,  "y": 700, "prop": "assets/tea_shop.png",  "slots": 4 },
    { "id": "temple",      "kind": "temple",    "label": "Ambalam",    "x": 1500, "y": 560, "prop": "assets/temple.png",    "slots": 6 }
  ],
  "overflow": { "strategy": "grid", "area": { "x": 100, "y": 820, "w": 1720, "h": 220 }, "prop": "assets/hut.png" }, // more projects than locations
  "scenes": {                                            // action kind → how the character is shown
    "read":     { "anim": "read",  "prop": "assets/palm_leaf_book.png" },
    "write":    { "anim": "write" },
    "bash":     { "anim": "bash",  "fx": "sparks" },
    "web":      { "anim": "read",  "fx": "signal" },
    "delegate": { "anim": "idle" },
    "waiting":  { "anim": "wait",  "fx": "bell" },
    "idle":     { "anim": "idle" },
    "error":    { "anim": "error", "fx": "smoke" }
  },
  "ambient": [
    { "type": "rain",  "chancePerMinute": 0.1, "durationSec": [30, 90] },
    { "type": "birds", "count": 3 }
  ],
  "completion": { "effect": "lamp-row", "params": { "count": 7, "staggerMs": 120 }, "sound": "assets/sounds/bell.ogg" },
  "defaultCharacters": ["mundu-hero", "shades-villain", "chaya-sidekick"]
}
```

### `characters/<id>/pack.json`
```jsonc
{
  "schemaVersion": 1,
  "id": "mundu-hero",
  "name": "Mundu Hero",
  "author": "Aswin1819",
  "license": "CC0-1.0",
  "role": "hero",                            // hero | villain | sidekick
  "frame": { "width": 32, "height": 32 },
  "fps": 8,
  "scale": 2,
  "anchor": { "x": 0.5, "y": 1 },            // feet
  "sheet": "sprites.png",
  "animations": {                            // fixed row order, frames per row may vary
    "idle":      { "row": 0, "frames": 4 },
    "walk":      { "row": 1, "frames": 6 },
    "read":      { "row": 2, "frames": 4 },
    "write":     { "row": 3, "frames": 4 },
    "bash":      { "row": 4, "frames": 6 },
    "wait":      { "row": 5, "frames": 4 },
    "celebrate": { "row": 6, "frames": 6, "loop": false },
    "error":     { "row": 7, "frames": 4, "loop": false }
  },
  "sounds": { "celebrate": "sounds/whistle.ogg" },
  "lines": "lines.json"                      // optional: { "waiting": ["…"], "celebrate": ["…"] }
}
```

**Validation rules** (zod, which is already a dependency; PNG size read from the file header, no new library):
- **IDs:** `^[a-z0-9-]{1,40}$`, and the folder name must equal `id`.
- **Files:** every referenced file must be inside the pack folder (same path check as the skills fix) and have an allowed extension: `.png`, `.ogg`, `.mp3`, `.wav`, `.json`.
- **Sprite sheet:** width ≥ max(frames) × frame.width; height = 8 × frame.height; no larger than 2048×2048 or 2 MB.
- **Sizes:** each sound ≤ 1 MB, a whole pack ≤ 10 MB, the zip uncompressed ≤ 20 MB with ≤ 200 entries.
- **Failure behaviour:** a failing pack is listed in the UI with its errors and replaced by the default pack/world. One bad pack never stops the others from loading.

---

## 7. Risks and open questions

**Risks**
1. **Transcript drift.** The sessions doc calls the format internal. Mitigation: hooks for the critical states, defensive parsing, a "format check" banner when nothing parses, and fixture tests made from anonymised record *shapes*.
2. **Undocumented registry** (`~/.claude/sessions`). Use it only to add detail, and add a test fixture for it.
3. **Hook latency.** A hung local server could slow Claude Code by up to `timeout` per event. Mitigation: `timeout: 2`, the endpoint replies before doing any work.
4. **Privacy.** Action labels contain command lines, file names and search queries. They're kept in memory only (no more `heroes.json` on disk), shown only on `127.0.0.1`, and truncated.
5. **Art and IP.** Only original placeholder art ships. The existing dungeon sprites come from a third-party asset pack whose license we haven't checked; keep the repo private until it's confirmed.
6. **Busy screens.** 10+ projects with several sessions each needs the overflow layout and a zoom/pan camera; the sidebar stays the main way to find things.

**Questions for you**
1. **Hooks:** may I add the HTTP hooks to your **user** `~/.claude/settings.json` (covers every project) behind an "Install hooks" button that shows the change first? Or would you rather paste the JSON yourself? (Recommended: the button, with a preview and an undo.)
2. **Zip upload** needs a zip-reading library. OK to add **`fflate`** (small, no dependencies, MIT)? Or should drag-a-folder be the only way in v1?
3. **Template cleanup:** OK to remove the Manus leftovers (OAuth, MySQL/Drizzle, LLM/S3/maps/voice helpers, Google Fonts, Umami, the Manus Vite plugins) and the dead components? That *removes* dependencies and network calls; nothing you use depends on them.
4. **Where user content lives:** shipped packs in the repo (`worlds/`, `characters/`), and your own packs and uploads in `~/.claude-dungeon/worlds|characters` so they survive `git pull`? (Recommended.)
5. **Character assignment:** remembered per **project** (stable) or per **session** (sessions come and go)? Recommended: per project, with an optional per-session override.
6. **Finished sessions:** how long should a finished character stay on screen before walking off? (Proposed: 2 minutes, with the completion effect played once.)
7. **What counts as one project:** a session's latest `cwd`, or its git repo root (so `repo/` and `repo/client/` are the same place)? Recommended: the git root when there is one, otherwise `cwd`.
8. **The existing dungeon:** keep it as a selectable "Dungeon" world (third-party sprites, private repo only), or drop it once Kerala exists?

**Decisions (2026-11-12):** all recommendations above were approved.
1. Hooks go in through an Install button with a preview, a backup and an undo, and never install automatically. The user knows they apply to every project.
2. `fflate` is approved for zip upload.
3. Template cleanup is approved.
4. User packs live in `~/.claude-dungeon/`.
5. Characters are chosen per project, with a per-session override.
6. Finished sessions stay 2 minutes.
7. Project = the git root.
8. The old dungeon is **removed**. It stays only as a temporary Phase 1 scaffold and is deleted (with its sprites) in Phase 2.

Also agreed: nothing outside this repo and `~/.claude-dungeon` is changed, and all git actions use the Aswin1819 account only.

---

## 8. Phased plan with acceptance criteria

After every phase: `vitest` and `tsc` pass, the existing e2e scripts pass, it's checked in Chrome at `127.0.0.1:4317`, and it works on Windows.

### Phase 1: State model and identity (on the existing dungeon visuals)
- New `server/monitor/`:
  - transcript tailer (start from the tail, buffer partial lines, string-content safe, watch subagents);
  - session registry reader;
  - optional hook endpoint;
  - one normalized store `Project → Session → Subagent` with `status`, `currentAction {kind, emoji, verb, target}`, `branch`, `title`, `recent[50]`.
- Shared types in `shared/model.ts`; the WebSocket sends `snapshot` / `session-upsert` / `session-remove` messages.
- UI:
  - name tags (title, or a short id);
  - an action bubble (emoji + text + target);
  - status chips;
  - a **waiting banner** at the top plus a glowing character;
  - a sidebar grouped by project (status, action, elapsed time, branch);
  - a detail panel with recent activity;
  - subagents as small companions with an agent-type label.
- Remove Manus leftovers and the dead code (if approved); stop writing `heroes.json`.
- **Done when:**
  - every Claude Code session running on this machine appears within 3 s, with the right project name (from `cwd`) and title;
  - an `AskUserQuestion` or permission prompt shows the waiting banner within 2 s (permission prompts need hooks; without hooks the banner says "possibly waiting");
  - a subagent appears and leaves with its parent;
  - a 50 MB transcript is picked up in under 1 s;
  - fixture tests cover string content, partial lines, unknown record types and subagent meta variants;
  - no network requests besides `127.0.0.1` (checked in the browser's network log).

### Phase 2: World system and Kerala
- World loader with validation (zod), a static route for assets that only serves files from validated packs, hot reload via `fs.watch` (debounced) over `worlds/` and `~/.claude-dungeon/worlds`, and a `world-changed` WebSocket message.
- Generic `WorldScene` (layers, locations, signboards, scenes, ambient effects, completion effect); a world switcher in the header that remembers your choice.
- **Kerala** with generated placeholder art (simple shapes and colour blocks drawn by a script, committed as PNGs).
- The existing dungeon is turned into a world pack (if kept).
- **Done when:** switching worlds needs no page reload; dropping a new folder in `worlds/` makes it selectable in under 3 s without a restart; a broken `world.json` shows its errors in the UI and falls back to the default; tests cover the validator.

### Phase 3: Character packs
- Pack loader and validator, fallback character, a picker (per project, plus an optional per-session override), zip upload (if `fflate` is approved), and author/license shown in the picker.
- 3 original placeholder characters: a mundu-wearing hero, a villain in dark glasses, a comic chaya-shop sidekick. All generated shapes, all CC0.
- **Done when:**
  - a pack with a wrong sheet size, a missing row, a file outside the folder, an oversized file or a zip bomb is rejected with a clear message, and the app keeps running;
  - a valid pack appears without a restart;
  - assignments survive a restart.

### Phase 4: Bengaluru and layout at scale
- **Bengaluru** world (tech park, metro, Cubbon Park, darshini, traffic, sudden rain); project → location placement that stays stable (the same project keeps its spot), with overflow layout and camera zoom/pan.
- **Done when:** 1, 3, 10 and 15 simulated projects all lay out without overlapping text at 1366×768 and 1920×1080, and placement stays the same across reloads.

### Phase 5: Animation polish
- Walk-ins and walk-offs, action scenes, the waiting alert (bell, glow, banner, optional sound), completion effects (lamps lighting / metro arriving / auto-rickshaw leaving), ambient weather.
- Reduced-motion toggle (also follows `prefers-reduced-motion`) and a mute toggle (muted by default).
- **Done when:** with reduced motion on there are no continuous animations, only state changes; sounds play only when unmuted; 60 fps with 20 characters on a typical laptop.

### Phase 6: Docs
- `docs/WORLDS.md` and `docs/PACKS.md`: the exact sprite-sheet layout with a diagram, limits, examples, and how to zip and share.
- README: credits the original Claude Dungeon author (thousandsky2024) and the MIT license, lists changes, explains setup on Windows.
- **Done when:** someone can build a new pack from `PACKS.md` alone, and it passes validation on the first try.
