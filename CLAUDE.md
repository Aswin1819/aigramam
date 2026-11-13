# Ai Gramam

A local browser app that shows live Claude Code sessions as villagers in an animated Indian world (projects = places, sessions = villagers, subagents = companions). Research and the phased plan are in `docs/RESEARCH.md`; the current baseline (git state, entry points, known issues) is `docs/BASELINE.md`.
Pack and style docs: `docs/WORLDS.md` (world.json), `docs/PACKS.md` (character pack.json), `docs/ART-STYLES.md` (art styles). Keep them in sync when the schemas or checks change.

## Run, test, check (Windows)
- Install: `npx -y pnpm@10.4.1 install`. pnpm isn't installed globally.
- Dev: `npx pnpm@10.4.1 dev` (`tsx watch`, restarts on server changes; reload the browser for client changes). The port comes from `.env` (`PORT=4317`, the default); if it's busy the server stops with an explanation rather than moving to a port the mod and hooks can't reach.
- Open http://localhost:4317. Previews for one visit (not saved; a menu choice drops them): `?demo`, `?view=world|workspace`, `?page=overview|projects|agents|terminals|history`, `?world=<id>`, `?art=<style id>|classic`, `?time=dawn|day|dusk|night`.
- Tests: `./node_modules/.bin/vitest run`. Types: `./node_modules/.bin/tsc --noEmit`.
- Art: `node scripts/gen-art.mjs [worlds|characters]` regenerates the built-in placeholder art (deterministic, CC0).
- Headless screenshot (when the Chrome extension isn't available): run msedge `--headless=new` with a scratch `--user-data-dir`, `--use-angle=swiftshader --virtual-time-budget=15000 --screenshot=<file>`.

## Architecture
- `shared/model.ts` (sessions), `shared/world.ts` (world.json schema), `shared/character.ts` (pack.json schema), `shared/placement.ts` (project → location).
- `server/monitor/` (read-only on `~/.claude`):
  - `tailer.ts`, `parser.ts`, `actions.ts`, `store.ts`, `registry.ts`, `projectRoot.ts`, `monitor.ts`, `demo.ts`;
  - `hooks.ts`: the HTTP hook receiver (replies 204 with an empty body) plus install/uninstall.
- `server/packs/`: shared pack file checks (`files.ts`), the hot-reloading `PackManager` (which also serves assets), and `upload.ts` (`POST /api/packs/upload?kind=world|character&replace=0|1`: a .zip checked in memory, staged in `.incoming-*`, validated by the loader, renamed into the user folder; replaced packs go to `~/.ai-gramam/backups`).
- `server/routers/agents.ts`: read-only listing of Claude Code skills and agents (global and per tracked project) for the Skills & agents viewer (`client/src/components/SkillsManager.tsx`); it never writes to `~/.claude` or projects' `.claude/`.
- `server/terminal/` (`manager.ts`, `socket.ts`) + `shared/terminal.ts`: managed terminals (roadmap Phase 2): PowerShell via node-pty (prebuilt binaries; its build script is intentionally skipped, see `pnpm.ignoredBuiltDependencies`) started only from a click, only in a known project's folder, never in demo tabs; output over the app WebSocket (term-* messages), 256 KB scrollback, max 8 open, all shells stopped on close/shutdown. UI: `client/src/hooks/useTerminals.ts`, `client/src/app/terminal/`, Workspace → Terminals, "Open terminal here" on projects. Never type anything into a terminal except the person's own input.
- `server/projects/open.ts` + `server/routers/projects.ts`: "Open folder in" VS Code / Cursor / File Explorer for a known project (program started directly with the folder as its only argument, never a shell; missing editors reported). Terminal ↔ session links come from the process tree (`server/terminal/links.ts`: the claude process whose parent is a terminal's shell, matched by exact pid with `~/.claude/sessions`); terminals strip the parent Claude session's environment markers so `claude` started in them registers normally. Open interactive sessions show from the registry before their first message ("Waiting for its first message").
- `server/git/status.ts` + `server/routers/git.ts`: read-only Git status/diff for a known project (execFile, no shell, `--no-optional-locks`, only rev-parse/status/diff/log; the folder comes from the live project list, files must be ones `git status` lists). Shown in the drawer's Changes tab (`client/src/app/ChangesPanel.tsx`).
- `server/history/` (`summarize.ts`, `timeline.ts`, `index.ts`) + `server/routers/history.ts` + `shared/history.ts`: session history (roadmap Phase 3) counted from every transcript still in `~/.claude/projects`: read in the background on the first History visit (newest first, with progress), then only the bytes appended since; figures and short metadata only, in memory, nothing written. Usage = the API's own token counts (deduplicated per response, main conversation only); no cost estimates. A session's timeline is read on request (start + latest 800 events). Approvals aren't in transcripts, so the timeline doesn't claim them. UI: Workspace → History (`client/src/app/workspace/HistoryPage.tsx`, pure helpers in `history.ts`).
- Status notes: `SessionView.statusNote` says in plain words what each status is based on (set in `store.ts` `deriveSession`; sessions record how they ended: SessionEnd hook, process gone from the registry, or 15 min of silence).
- `server/characters/assignments.ts`: the character chosen per project, saved in `~/.ai-gramam/characters.json` and sent to tabs with the character list.
- `server/worlds/loader.ts`, `server/characters/loader.ts`, `server/worlds/manager.ts` (`WorldManager` and `CharacterManager`).
- `server/websocket.ts` sends `snapshot`, `worlds` and `characters` messages, and takes browser commands (`session-message`, `session-stop`, `approval-decide`, answered with `command-result`). Demo mode is per tab and never acts on real sessions.
- `server/link/link.ts`: the live link to the mod (`/api/link`, loopback + `x-ai-gramam-key`): events in, a per-session inbox (messages, stop), and requests the mod long-polls: approvals (allow/deny) and Claude's questions (answers, or "deny" = answer in the terminal).
- `plugin/ai-gramam/`: the Claude Code mod (hooks module `hooks/register.ts`). `.claude-plugin/marketplace.json` at the repo root lists it. Check it with `claude plugin validate plugin/ai-gramam` and `tsc -p plugin/ai-gramam`. Approvals: it hooks `classic.PermissionRequest`, so only asks that would reach the person go to the browser (another plugin that answers that event first takes precedence). Questions (`AskUserQuestion`): answered at `tool.call`, the browser's answers become the tool's result; no answer in 45 s and the terminal dialog opens. Test with a session started as `claude --plugin-dir <repo>/plugin/ai-gramam` (it reloads the mod after each turn).
- `server/_core/`:
  - `security.ts`: binds to 127.0.0.1, checks Host/Origin, `safeChildPath`/`safeRelativePath`;
  - `paths.ts`: the data folder `~/.ai-gramam`;
  - `runtime.ts`.
- `client/src/world/`:
  - `WorldScene.ts` (Phaser): sky and time-of-day lighting, layers, decor animation, weather, props, sprite characters, camera;
  - `WorldView.tsx`, and `WorldLabels.tsx` (HTML labels with collision layout);
  - `StyledWorldView.tsx`: the village drawn by an art style (Canvas 2D): camera, click-to-select, time-of-day tint.
- `client/src/styles/`: art styles. `protos/` are the Style lab prototypes (`/styles`, fixed demo scene); `live/` are the selectable styles for the real village (`sim.ts` turns sessions into places and villagers, `registry.ts` lists them, `lighting.ts`, porting guide in `live/README.md`).
- `client/src/app/`: `TopBar` (world/style menu, sound, time), `SessionDock`, `DetailDrawer`, `ChatPanel`, `RequestCard` (approvals and questions inline in the chat), `CharacterPicker` (a project's character), `PackUpload` (zip install), `SessionControls`, `SettingsSheet`, `BrandMark`, `useDisplayPrefs`. Pages: `client/src/pages/Home.tsx`, `StyleLab.tsx`.
- `client/src/app/workspace/`: Workspace Mode (World/Workspace switch in the top bar): `Workspace` (page tabs), `Overview`, `ProjectsPage`, `AgentsPage`, `ProjectDetail` (also used by `app/ProjectDrawer` when a building is clicked in the village), `SessionRow`; pure grouping/filters in `attention.ts` and `filters.ts` (tested). Show only real data: a quiet session is "No recent activity", never "stuck".
- `client/src/lib/`: `status`, `miniMarkdown` (safe chat Markdown, tables included), `chime` (Web Audio sound cues, no files), `desktopNotify` (optional OS notifications while the tab is in the background; off by default).
- Built-in packs: `worlds/kerala`, `characters/{mundu-hero,shades-villain,chaya-sidekick}`. User packs go in `~/.ai-gramam/worlds|characters`.

## Rules
- **Local only.** The server binds to `127.0.0.1`. No telemetry, CDNs, web fonts or external calls. Transcript content never leaves the machine and is never written to disk by this app.
- **Never write inside `~/.claude`**, except our own hook entries when the user clicks Install. App data lives in `~/.ai-gramam`.
- **Ask before adding any dependency.** Approved so far: `motion`, `fflate` (pack .zip upload), `node-pty`, `@xterm/xterm`, `@xterm/addon-fit` (managed terminals).
- **Windows first.** Use `path`; get the project from the record's `cwd`. Animation uses real elapsed time (`performance.now()`), never frame counts or Phaser's smoothed delta.
- **Packs are data only** and are validated. A broken pack falls back and must never crash the app.
- **Only original art ships**, and every pack shows its author and license.
- **Text, not only icons**, for every state and action. Labels must not overlap (see the layout pass in `WorldLabels`).
- Server changes need Vitest specs in `server/*.test.ts`; client logic without the DOM (e.g. `styles/live/sim.ts`) gets specs next to it (`client/src/**/*.test.ts`).
- **Git:** commit and push as **Aswin1819** only (configured in this repo's local git config). Never use the aswin-alfredx account. `origin` = Aswin1819 private repo, `upstream` = the original repo. Work on feature branches.
