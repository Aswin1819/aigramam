# Claude Dungeon (Indian Worlds edition)

A local browser app that shows live Claude Code sessions as pixel-art characters. It's a fork of thousandsky2024/claude-pixel-agent-web (MIT). Research and the phased plan are in `docs/RESEARCH.md`.

## Run, test, check (Windows)
- Install: `npx -y pnpm@10.4.1 install`. pnpm isn't installed globally.
- Dev server: `npx pnpm@10.4.1 dev` (or `./node_modules/.bin/tsx watch server/_core/index.ts`). It restarts on server changes; reload the browser for client changes (HMR is off). The port comes from `.env` (`PORT=4317`).
- Open http://localhost:4317
- Production: `pnpm build`, then `pnpm start` (the `--production` flag replaces `NODE_ENV`, so it works on Windows).
- Unit tests: `./node_modules/.bin/vitest run`. Types: `./node_modules/.bin/tsc --noEmit`.

## Architecture
- `shared/model.ts`: Project → Session → Subagent view model, the only data the browser receives.
- `server/monitor/` (read-only on `~/.claude`):
  - `tailer.ts`: tails JSONL from near the end of the file and buffers partial lines and bytes.
  - `parser.ts`: turns a record into events and never throws (the transcript format is internal to Claude Code and changes often).
  - `actions.ts`: tool call → emoji plus text label.
  - `store.ts`: in-memory state; status is derived from facts plus the current time.
  - `registry.ts`: `~/.claude/sessions/<pid>.json`, for liveness and names (undocumented, used only to add detail).
  - `projectRoot.ts`: project = the git root of `cwd`.
  - `hooks.ts`: optional HTTP-hook receiver plus install/uninstall in `~/.claude/settings.json` (only from the UI, with a preview, a backup and a 204 empty reply).
  - `monitor.ts`: discovery and polling. `demo.ts`: simulated sessions.
- `server/websocket.ts`: sends a full `snapshot` (at most every 150 ms, only when something changed). Demo mode is per WebSocket client. The old bridge heroes are adapted into sessions.
- `server/_core/security.ts`: binds to 127.0.0.1, checks Host/Origin, `safeChildPath`. The tRPC API is localhost-only.
- Client:
  - `hooks/useLiveSessions.ts`: the WebSocket connection, plus the server-clock `now`.
  - `pages/Home.tsx`, `SessionSidebar`, `WaitingBanner`, `SessionDetail`, `HooksPanel`.
  - `DungeonMapPhaser.tsx` is a **temporary scaffold** (to be removed in Phase 2 along with `client/public/sprites/mv`).
  - `MapLabels.tsx` draws text labels as HTML over the canvas.

## Rules
- **Local only.** The server binds to `127.0.0.1`. No telemetry, CDNs, web fonts or external calls. Transcript content never leaves the machine and is never written to disk by this app.
- **Never write inside `~/.claude`**, except our own hook entries when the user clicks Install. App data lives in `~/.claude-dungeon`.
- **Ask before adding any dependency.**
- **Windows first.** Use `path` and never hand-built `/` paths. Get the project from the record's `cwd`, never by decoding the folder name. Keep the polling fallback next to `fs.watch`. Animation uses real elapsed time (`performance.now()`), not frame counts or Phaser's smoothed delta.
- **Packs and worlds are data only.** No code in packs. Validate everything with zod and `safeChildPath`. A broken pack falls back to the default and must never crash the app.
- **Only original art ships:** no real people, film or cartoon characters, logos, film dialogue or film music. Every pack declares an author and a license, and the UI shows them.
- **Text, not only icons.** Every state and action has a text label as well as an emoji or animation.
- **Never block on parse errors.** One bad line or record must never drop other lines or crash the monitor.
- Server changes need Vitest specs in `server/*.test.ts`. Keep the existing tests passing.
- Git: commit and push as **Aswin1819** only (configured in this repo's local git config). Never use the aswin-alfredx account. `origin` = Aswin1819/claude-dungeon (private), `upstream` = the original repo. Work on feature branches.
