# Installing Ai Gramam

Ai Gramam has **two parts that you install separately**:

| Part | What it is | Needed for |
|---|---|---|
| **The app** | A local web app (Node.js) that you start on your computer and open at http://localhost:4317. | Everything you see: the village, Workspace Mode, terminals, history. |
| **The mod** (`ai-gramam`, optional) | A Claude Code plugin that runs inside each Claude Code session and talks to the app on `127.0.0.1`. | Messaging, stopping, approving and answering a session from the browser, and exact live status. |

Installing the mod does **not** install or start the app, and the app works without the mod: it then watches sessions from Claude Code's own files, read-only. Either part can be removed without breaking the other.

## Prerequisites and compatibility

- **Node.js 18 or newer.** pnpm doesn't need to be installed (`npx` fetches pnpm 10.4.1).
- **Claude Code**, already used at least once on this computer (it creates `~/.claude`). The mod was tested with Claude Code 2.1.323. It uses Claude Code's hooks-module plugin API, so older versions without that API won't load it.
- **Windows 11** is what Ai Gramam is built and tested on. Other systems are untested: watching sessions should work, but managed terminals start `powershell.exe`, so they need PowerShell installed.
- A current Chrome, Edge or Firefox.

## 1. Install and start the app

```powershell
git clone https://github.com/Aswin1819/aigramam.git
cd aigramam
npx -y pnpm@10.4.1 install
npx pnpm@10.4.1 dev
```

Open **http://localhost:4317**. Any Claude Code session on this computer appears within a few seconds.

To run without the development watcher:

```powershell
npx pnpm@10.4.1 build
npx pnpm@10.4.1 start
```

## 2. Install the mod (optional)

Straight from GitHub, in a terminal (or inside Claude Code as `/plugin marketplace add Aswin1819/aigramam` and `/plugin install ai-gramam@aigramam`):

```powershell
claude plugin marketplace add Aswin1819/aigramam
claude plugin install ai-gramam@aigramam
```

Or from your clone (the folder's full path), for example to try local changes:

```powershell
claude plugin marketplace add C:\path\to\aigramam
claude plugin install ai-gramam@aigramam
```

The mod loads in **every new** Claude Code session. Sessions that were already running link after you restart them. Check the result in the app under **Settings → Session link**: it lists what it found (server, Claude Code sessions, the mod and its version, linked sessions).

Each linked session also shows `Ai Gramam ● linked` in Claude Code's status line. If it can't link, the status line says why, for example `Ai Gramam ○ app not running`.

> The `aigramam` marketplace is this repository. It isn't Anthropic's plugin directory, and Ai Gramam isn't reviewed or endorsed by Anthropic.

### Update

```powershell
claude plugin marketplace update aigramam
claude plugin update ai-gramam@aigramam
```

Then restart your sessions. When the installed mod is older than the one the app ships, **Settings → Session link** says "update available".

### Remove

```powershell
claude plugin uninstall ai-gramam@aigramam
claude plugin marketplace remove aigramam   # optional
```

The app keeps working without the mod.

## 3. Configuration

| Setting | Where | Default | What it does |
|---|---|---|---|
| `PORT` | `.env` in the app folder (copy `.env.example`) | `4317` | The app's port. If it's busy, the app stops with an explanation instead of picking another port. |
| `HOST`, `ALLOWED_HOSTS` | `.env` | `127.0.0.1` | Only to reach the app from another device. Leave unset to keep it on this computer only. |
| `AI_GRAMAM_URL` | environment of the Claude Code session | `http://127.0.0.1:4317` | Where the mod finds the app. Set it if you changed `PORT`. |
| Exact approval alerts without the mod | **Settings → Alerts → Install hooks** | off | Adds HTTP hooks to your Claude Code user settings, after showing you the change and saving a backup. Undo from the same place. |
| Worlds, characters | **Settings → Worlds / Characters**, or `~/.ai-gramam/worlds`, `~/.ai-gramam/characters` | built-in packs | See [WORLDS.md](WORLDS.md) and [PACKS.md](PACKS.md). |

The app keeps its own data in `~/.ai-gramam` (local key, settings, backups, your packs). See [SECURITY.md](../SECURITY.md) for exactly what it reads and writes.

## Something not working?

See [TROUBLESHOOTING.md](TROUBLESHOOTING.md).
