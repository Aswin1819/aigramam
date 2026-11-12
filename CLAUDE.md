# Ai Gramam

A local browser app that shows live Claude Code sessions as villagers in an animated Indian world (projects = places, sessions = villagers, subagents = companions). Started as a fork of thousandsky2024/claude-pixel-agent-web (MIT). Research and the phased plan are in `docs/RESEARCH.md`.

## Run, test, check (Windows)
- Install: `npx -y pnpm@10.4.1 install`. pnpm isn't installed globally.
- Dev: `npx pnpm@10.4.1 dev` (`tsx watch`, restarts on server changes; reload the browser for client changes). The port comes from `.env` (`PORT=4317`).
- Open http://localhost:4317. Add `?demo` for simulated sessions, `?time=dawn|day|dusk|night` to preview lighting.
- Tests: `./node_modules/.bin/vitest run`. Types: `./node_modules/.bin/tsc --noEmit`.
- Art: `node scripts/gen-art.mjs [worlds|characters]` regenerates the built-in placeholder art (deterministic, CC0).
- Headless screenshot (when the Chrome extension isn't available): run msedge `--headless=new` with a scratch `--user-data-dir`, `--use-angle=swiftshader --virtual-time-budget=15000 --screenshot=<file>`.

## Architecture
- `shared/model.ts` (sessions), `shared/world.ts` (world.json schema), `shared/character.ts` (pack.json schema), `shared/placement.ts` (project → location).
- `server/monitor/` (read-only on `~/.claude`):
  - `tailer.ts`, `parser.ts`, `actions.ts`, `store.ts`, `registry.ts`, `projectRoot.ts`, `monitor.ts`, `demo.ts`;
  - `hooks.ts`: the HTTP hook receiver (replies 204 with an empty body) plus install/uninstall.
- `server/packs/`: shared pack file checks (`files.ts`) and the hot-reloading `PackManager` (which also serves assets).
- `server/worlds/loader.ts`, `server/characters/loader.ts`, `server/worlds/manager.ts` (`WorldManager` and `CharacterManager`).
- `server/websocket.ts` sends `snapshot`, `worlds` and `characters` messages. Demo mode is per tab.
- `server/_core/`:
  - `security.ts`: binds to 127.0.0.1, checks Host/Origin, `safeChildPath`/`safeRelativePath`;
  - `paths.ts`: the data folder `~/.ai-gramam`, with a one-time copy of settings from the old folder;
  - `runtime.ts`.
- `client/src/world/`:
  - `WorldScene.ts` (Phaser): sky and time-of-day lighting, layers, decor animation, weather, props, sprite characters, camera;
  - `WorldView.tsx`, and `WorldLabels.tsx` (HTML labels with collision layout).
- `client/src/app/`: `TopBar`, `SessionDock`, `DetailDrawer`, `SettingsSheet`, `BrandMark`, `useDisplayPrefs`. Page: `client/src/pages/Home.tsx`.
- Built-in packs: `worlds/kerala`, `characters/{mundu-hero,shades-villain,chaya-sidekick}`. User packs go in `~/.ai-gramam/worlds|characters`.

## Rules
- **Local only.** The server binds to `127.0.0.1`. No telemetry, CDNs, web fonts or external calls. Transcript content never leaves the machine and is never written to disk by this app.
- **Never write inside `~/.claude`**, except our own hook entries when the user clicks Install. App data lives in `~/.ai-gramam`.
- **Ask before adding any dependency.** Approved so far: `motion`.
- **Windows first.** Use `path`; get the project from the record's `cwd`. Animation uses real elapsed time (`performance.now()`), never frame counts or Phaser's smoothed delta.
- **Packs are data only** and are validated. A broken pack falls back and must never crash the app.
- **Only original art ships**, and every pack shows its author and license.
- **Text, not only icons**, for every state and action. Labels must not overlap (see the layout pass in `WorldLabels`).
- Server changes need Vitest specs in `server/*.test.ts`.
- **Git:** commit and push as **Aswin1819** only (configured in this repo's local git config). Never use the aswin-alfredx account. `origin` = Aswin1819 private repo, `upstream` = the original repo. Work on feature branches.
