# Changelog

The app and the mod have separate version numbers. The app's version is in `package.json`. The mod's is in `plugin/ai-gramam/.claude-plugin/plugin.json`, and the same version must appear in `.claude-plugin/marketplace.json` and in the mod's `VERSION` constant (a test checks this).

## Unreleased

### App
- **Setup checks** (Settings → Session link, and on the Overview when nothing is showing) check four things separately: whether the server is reachable, whether Claude Code has sessions, whether the mod is installed or out of date, and how many sessions are linked.
- When the server can't be reached, the page now says so instead of "no sessions".
- Install, troubleshooting and security docs, and this changelog.

### Mod 0.3.0
- The status line says why a session isn't linked: `app not running`, `not set up`, or `key not accepted`.
- A failure inside the mod never blocks a prompt or a tool call (fallbacks on every hook that can block).
- Listing icon and marketplace metadata.

## 2026-11-13: Session history and status notes (#12)
- **Workspace → History:** every session still on disk, with filters, a daily summary, API token counts as recorded (no cost estimates) and a recorded timeline.
- Every live status says in one line what it's based on.

## 2026-11-13: Terminals, Start Claude, open folders (#10, #11)
- Managed PowerShell terminals in a project's folder, in the browser.
- Start Claude Code from a terminal; terminals link to their session.
- Open a project folder in VS Code, Cursor or File Explorer.
- Read-only Git status and diffs in the drawer.

## 2026-11-12: Workspace Mode (#6 to #9)
- Workspace Mode: Overview, Projects, Agents pages, real tool output, clickable buildings.
- Changes and Subagents tabs, optional desktop notifications.
- Read-only Skills & agents viewer; fixed port with a clear error.

## 2026-11-12: Ai Gramam (#1 to #5)
- The village: the Kerala Backwaters and Bengaluru Tech Park worlds, original characters, day and night, weather.
- Six art styles and the Style lab.
- Mod 0.2.0: message, stop, approve and answer questions from the browser; sound cues.
- A character per project; world and character packs installed from a .zip.
