# Troubleshooting

Start with **Settings → Session link** in the app. It checks each part separately and says which one is the problem. Workspace → Focus shows the same checks when no session is visible.

## "Can't reach the Ai Gramam server"

The browser lost its connection to the app (red dot in the top bar). That doesn't mean no sessions are running; the app just can't show them right now.

- Is the app still running? Start it again in the app folder: `npx pnpm@10.4.1 dev`.
- If it stopped with "port 4317 is in use", another program (or another copy of Ai Gramam) holds the port. Close it, or set another `PORT` in `.env`. If you change the port, also set `AI_GRAMAM_URL` for the mod.

The page reconnects by itself when the app is back.

## "Claude Code: no sessions running"

The app is fine and found no live Claude Code session. Start `claude` in any folder; it appears within a few seconds. Sessions are found from Claude Code's session list (`~/.claude/sessions`) and transcripts (`~/.claude/projects`).

"Claude Code: not found" means there's no `~/.claude` folder: Claude Code hasn't run on this computer under your user account.

## "Ai Gramam mod: not installed"

You can still watch sessions. Messaging, stopping, approving and answering from the browser need the mod: see [INSTALL.md](INSTALL.md#2-install-the-mod-optional).

"Couldn't check" means Claude Code's plugin list couldn't be read. That list belongs to Claude Code and its format may change, so Ai Gramam won't guess. If you installed the mod, start a new session; the check turns green once a session links.

## "Linked: 1 of 3"

Some sessions run without the mod:

- **Started before the mod was installed:** restart them.
- **The mod can't reach the app:** the session's status line in the terminal says why:
  - `Ai Gramam ○ app not running`: the app isn't running, or it uses another port (set `AI_GRAMAM_URL`).
  - `Ai Gramam ○ not set up: start the app once`: the app creates its local key (`~/.ai-gramam/hook-key`) the first time it runs.
  - `Ai Gramam ○ key not accepted, retrying`: the key changed. The mod reads it again by itself.
- **Mod disabled for that project:** check `claude plugin list`.

## A session is linked, but some controls aren't there

- **Plan approvals** (`ExitPlanMode`) always stay in the terminal.
- **Another plugin answers permission requests first:** then they're decided before the mod sees them, and they stay in the terminal.
- **No answer in 45 seconds:** the request or question goes back to the terminal as usual.
- **Messages** wait until the session is free, then run as your own prompt.

## "Ai Gramam mod: update available"

The installed mod is older than the one this copy of the app ships:

```powershell
claude plugin marketplace update aigramam
claude plugin update ai-gramam@aigramam
```

Then restart your sessions.

## "Terminals aren't available: the terminal library (node-pty) couldn't load"

On **Linux**, node-pty has to be built once on your computer. In the aigramam folder run `npx pnpm@10.4.1 rebuild node-pty` (it needs `python3`, `make` and a C++ compiler: `sudo apt install build-essential python3` on Debian or Ubuntu), then restart Ai Gramam. On Windows and macOS it comes ready-made: reinstall the packages (`npx -y pnpm@10.4.1 install`) and restart.

The rest of the app works without terminals.

## A status says "No recent activity"

The session is working, but nothing was recorded for a while. It may be thinking, running a long command, or stalled. Hover the status (or open the session) to see what it's based on. Ai Gramam never calls a session "stuck" without evidence.

## History is missing older sessions

History is counted from transcripts still on disk. Claude Code deletes transcripts after `cleanupPeriodDays` (30 days by default), and Ai Gramam keeps no copy.

## A world or character pack doesn't appear

**Settings → Worlds / Characters** lists packs that failed to load, with the reasons. A broken pack never breaks the app; the built-in one is used instead. See [WORLDS.md](WORLDS.md) and [PACKS.md](PACKS.md).
