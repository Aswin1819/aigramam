# Contributing to Ai Gramam

Thanks for helping! Bug reports, ideas, worlds, characters and code are all welcome.

## Reporting

- **Bugs and ideas:** [open an issue](https://github.com/Aswin1819/aigramam/issues/new/choose). For setup problems, include what **Settings → Session link** shows.
- **Security problems:** report them privately, as [SECURITY.md](SECURITY.md) explains.
- Never paste transcripts, your local key (`~/.ai-gramam`) or private paths.

## Run it from source

You need Node.js 18+ and Git. pnpm doesn't need to be installed.

```sh
git clone https://github.com/Aswin1819/aigramam.git
cd aigramam
npx -y pnpm@10.4.1 install
cp .env.example .env   # optional: change PORT
npx pnpm@10.4.1 dev
```

Open http://localhost:4317. You don't need Claude Code running: **Demo** in the top bar (or `?demo`) shows simulated sessions. Other one-visit previews: `?view=workspace`, `?page=history`, `?world=bengaluru`, `?art=toy-brick`, `?time=night`.

The server restarts when you change server code. Reload the browser for client changes (hot reload is off).

## Before you open a pull request

```sh
npx pnpm@10.4.1 check   # types
npx pnpm@10.4.1 test    # Vitest
npx pnpm@10.4.1 build   # production build
```

CI runs the same on Windows for every pull request.

- **Tests:** server changes need specs in `server/*.test.ts`. Client logic that doesn't need the DOM gets a `*.test.ts` next to it.
- **The mod** (`plugin/ai-gramam`): check it with `claude plugin validate plugin/ai-gramam` and `claude plugin test plugin/ai-gramam`. When you bump its version, change it in `plugin.json`, `.claude-plugin/marketplace.json` and `VERSION` in `hooks/register.ts` together. Try installs with `CLAUDE_CONFIG_DIR` pointing at an empty folder, never your real `~/.claude`.
- **Changelog:** add a line under "Unreleased" in [CHANGELOG.md](CHANGELOG.md) for anything a user would notice.
- **Docs:** keep INSTALL, TROUBLESHOOTING, SECURITY, WORLDS, PACKS and ART-STYLES in step with what you change.

## Project rules

These keep Ai Gramam trustworthy. Pull requests that break them can't be merged.

- **Local only.** The server listens on `127.0.0.1`. No telemetry, CDNs, web fonts or outside calls. Transcript content never leaves the computer and the app never writes it to disk.
- **Read-only on `~/.claude`.** The only exception is the hooks the person installs with **Settings → Alerts → Install hooks**. The app's own data goes in `~/.ai-gramam`.
- **Only real data.** Never invent a status. A quiet session is "No recent activity", never "stuck".
- **Text, not only icons**, for every state and action.
- **Movement means something.** Villagers walk only when their work changes: no decorative wandering.
- **TypeScript everywhere.** Types used by both the server and the client live in `shared/`.
- **Packs are data.** Worlds and characters are JSON plus images, validated with zod, never code. A broken pack must never crash the app.
- **Original art only:** no real people, film or cartoon characters, logos, film dialogue or music. Every pack declares its author and license.
- **Pull requests:** work on a feature branch, keep changes focused, and say what changed and why. Explain any new dependency.

## Worlds and characters

You can make a world or a character without touching the code: see [docs/WORLDS.md](docs/WORLDS.md) and [docs/PACKS.md](docs/PACKS.md). Share it as a `.zip` or a pull request (built-in packs must be original and CC0 or similarly open).

## Where things are

`CLAUDE.md` has the full map of the code. In short: `server/` (session monitor, packs, terminals, Git, history, the mod's link), `shared/` (types and schemas used by both sides), `client/src/` (React UI, the Phaser world and the art styles), `plugin/ai-gramam/` (the mod), `worlds/` and `characters/` (built-in packs).

## License

By contributing, you agree that your contribution is released under the project's [MIT license](LICENSE).
