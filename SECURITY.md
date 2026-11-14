# Security and your data

Ai Gramam runs only on your computer. It has no account, no telemetry, no CDN, no web fonts and no outside network calls.

## Network

- The app listens on `127.0.0.1` (this computer only) unless you set `HOST` yourself.
- Every request is checked for an allowed `Host` and `Origin`, so other websites open in your browser can't drive it.
- The mod talks only to the app's address (`http://127.0.0.1:4317` by default) and sends a local key with each request (`~/.ai-gramam/hook-key`, created by the app).

## What the app reads

- `~/.claude/projects/**/*.jsonl` (transcripts) and `~/.claude/sessions` (live sessions), to show status, chat, history and subagents.
- Claude Code's installed-plugin list (`~/.claude/plugins/installed_plugins.json`), only to tell you whether the mod is installed.
- Skills and agents (`~/.claude/skills`, `~/.claude/agents`, and each tracked project's `.claude/`), only to list them.
- Git status and diffs of tracked projects (read-only commands: `rev-parse`, `status`, `diff`, `log`, with `--no-optional-locks`).

Transcript content is kept in memory only. Ai Gramam never writes it to disk and never sends it anywhere.

## What the app writes

- Its own folder `~/.ai-gramam`: local keys, settings, character choices, uploaded packs and backups.
- **Never inside `~/.claude`**, with one exception you trigger yourself: **Settings → Alerts → Install hooks**. It shows you the exact change first, saves a backup to `~/.ai-gramam/backups`, and can be undone.

## What the mod sends

Small labels only (a file path, a command, a search pattern, a subagent type), clipped to 300 characters, plus Claude's question text when a question is answered in the browser. Never file contents.

What the browser sends back to a session:

- a message, which runs as your own prompt;
- a stop;
- an allow or deny for a permission request that would otherwise have asked you;
- answers to Claude's questions.

## Terminals and opening programs

- **Terminals** start a shell (PowerShell on Windows, your own `$SHELL` on macOS and Linux) only when you click. They start only in the folder of a project the app already shows, with your own permissions, up to 8 at once. Every shell stops when you close it or the app. The app never types into a terminal: only what you type is sent.
- **Opening a folder** in VS Code, Cursor or the file manager (File Explorer, Finder through `open`, or `xdg-open` on Linux) starts that program directly with the folder as its only argument, never through a shell.
- **"Start Claude"** runs `claude` in a terminal you can see.

## Reporting a problem

Please report security issues privately to the repository owner (GitHub: Aswin1819) rather than in a public issue.
