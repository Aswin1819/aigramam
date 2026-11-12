# Ai Gramam

**Your Claude Code agents, living in a village.** Ai Gramam is a local browser app that turns every running Claude Code session into a villager in an animated Indian world, so you can tell at a glance which project, session and subagent is doing what, and when one of them needs you.

- **Projects are places.** Each project gets a location (a houseboat, the chaya kada, the temple…) with its name on a brass signboard.
- **Sessions are villagers.** Each session stands at its project with a name tag and a speech bubble showing the live action: `✏️ Editing auth.ts`, `💻 Running npm test`, `🔍 Searching "login"`.
- **Subagents are companions** that walk in beside their parent while they work and leave when they finish.
- **Waiting for you is impossible to miss.** Approvals and questions ring a bell in the top bar, glow red in the world and pop a toast. "Your turn" glows amber.
- **A living world.** Real day and night that follow your clock, monsoon rain with lightning, swaying palms, drifting clouds, bobbing houseboats, a canoe, ducks, fireflies, and a row of nilavilakku lamps lighting up when a task finishes.
- **Worlds and characters are data packs.** Upload a `.zip` in Settings, or drop a folder in, and it appears within seconds, no restart. Every pack shows its author and license.
- **Your cast.** Choose the character each project's sessions appear as (drawer → Details → Character).
- **Art styles.** Besides the Kerala world, draw the village as PS2, Comic Art, Flat Vector, CGI Motion, Toy Brick or Explainer 3D (world menu in the top bar). Compare all ten prototypes in the Style lab at `/styles`.
- **Sound cues** when a session needs you or it's your turn (mute in the top bar).

Everything runs on your machine: the server listens on `127.0.0.1` only, makes no outside network calls, and never writes your transcripts anywhere.

## Quick start (Windows)

Requirements: Node.js 18+.

```powershell
npx -y pnpm@10.4.1 install
npx pnpm@10.4.1 dev
```

Open **http://localhost:4317** (the port comes from `.env`; copy `.env.example` to change it). Start Claude Code in any folder and a villager walks in within a few seconds. No sessions yet? Click **Demo** in the top bar, or open http://localhost:4317/?demo.

Tips: drag to pan, scroll to zoom, click a villager (or a row in the dock) to open its details, <kbd>Esc</kbd> to step back. Try `?time=night` to preview the night.

## Talk to your sessions (the Ai Gramam mod)

Install the mod once and every new Claude Code session links itself to the village. Then, from a villager's drawer, you can:

- **send a message**: it runs as your own prompt as soon as the session is free;
- **stop** what it's doing (like Esc in the terminal);
- **approve or deny permission requests**: requests that would have asked *you* come to the browser first (inline in the chat, in the top bar and as a toast). With no answer in 45 s, the normal prompt appears in the terminal;
- **answer Claude's questions** (multiple choice, several at once, or your own words) right in the chat. "Answer in terminal" or no answer in 45 s, and the normal dialog appears there.

Plan approvals are still answered in the terminal, and if another plugin answers permission requests before the mod, those stay in the terminal too. The mod sends only small details (paths, commands) to `127.0.0.1` with your local key.

```powershell
claude plugin marketplace add C:\path\to\aigramam
claude plugin install ai-gramam@aigramam
```

Sessions that were already running link after a restart. **Settings → Session link** shows how many are linked. The mod's source is in `plugin/ai-gramam`.

## Terminals

**Workspace → Terminals** (or **Open terminal here** on a project) starts PowerShell in that project's folder, in the browser. It runs on this computer with your permissions, only when you click, and only in folders of projects Ai Gramam already shows; up to 8 at once. Closing a terminal stops its shell. Terminals you opened yourself aren't shown or controlled here.

## Exact approval alerts without the mod (optional)

From transcripts alone Ai Gramam can see questions and "your turn" exactly, but a **permission prompt** can only be guessed. **Settings → Alerts → Install hooks** adds Claude Code HTTP hooks to your user settings. It shows you the exact before/after first, saves a backup to `~/.ai-gramam/backups`, keeps your existing hooks, and can be undone. The hooks apply to every project, send events only to `127.0.0.1`, and never change what Claude does.

## Worlds and characters

| | Built in | Your own (hot reloaded) |
|---|---|---|
| Worlds | `worlds/<id>/world.json` + images | `~/.ai-gramam/worlds/<id>/` |
| Characters | `characters/<id>/pack.json` + `sprites.png` | `~/.ai-gramam/characters/<id>/` |

Shipped: **Kerala Backwaters** and **Bengaluru Tech Park** (metro, autos, darshini, filter kaapi, gulmohars and drizzle), plus three original characters: **Unni** (mundu hero), **Shades** (stylish villain) and **Chaya Kutty** (comic sidekick). All built-in art is original and CC0, generated in code by `node scripts/gen-art.mjs`; replace it with real pixel art any time. Install a pack by dropping its `.zip` in **Settings → Worlds** or **Settings → Characters**, or copy its folder into `~/.ai-gramam`. Packs are validated (paths, image sizes, sprite-sheet rows and frames), and a broken pack is listed in Settings with its errors and never breaks the app.

- [docs/WORLDS.md](docs/WORLDS.md): how to make a world (`world.json`, layers, locations, decor, lighting, weather).
- [docs/PACKS.md](docs/PACKS.md): how to make a character (`pack.json`, sprite sheet) and choose one per project.
- [docs/ART-STYLES.md](docs/ART-STYLES.md): the art styles, the Style lab and how to add a style.

## How it works

```
~/.claude/projects/**/*.jsonl  ┐
~/.claude/sessions/<pid>.json  ├─► monitor (server/monitor) ─► Project → Session → Subagent ─► WebSocket ─► world (Phaser) + UI (React)
Claude Code HTTP hooks (opt.)  ┘
```

- `server/monitor/`: reads the transcripts from the end, follows subagent files and the session registry, and accepts optional hook events.
- `server/worlds`, `server/characters`, `server/packs`: pack loading, validation and hot reload.
- `client/src/world/`: the Phaser scene (sky, lighting, weather, decor, characters, camera) and HTML labels.
- `client/src/app/`: the top bar, session dock, detail drawer and settings (React, Tailwind, Motion).

Tests: `npx pnpm@10.4.1 test` · Types: `npx pnpm@10.4.1 check` · Production: `npx pnpm@10.4.1 build` then `npx pnpm@10.4.1 start`.

## Remote bridge (optional)

To show sessions from another computer, run `bridge/ai-gramam-bridge.mjs` there. **Settings → Remote bridge** gives you the exact commands with your key.

## License

Released under the MIT license; see `LICENSE`.
