# Changelog

The app and the mod have separate version numbers. The app's version is in `package.json`. The mod's is in `plugin/ai-gramam/.claude-plugin/plugin.json`, and the same version must appear in `.claude-plugin/marketplace.json` and in the mod's `VERSION` constant (a test checks this).

## Unreleased

### Map
- **The Map is now 3D** (three.js, works offline): an isometric operations floor in a dark palette. Each project is a raised pod with a desk, a monitor showing what the session is doing, and a seated villager per session, around the village square with its banyan. Lamps over the villagers show their state (they pulse when a session needs you), and soft shadows and a warm key light give depth.
- Click a project's card or pod to fly to it (the session board then shows only that project); "Overview" flies back. Click a villager to open it in Focus. Drag to move, wheel or +/− to zoom.
- Cards find a spot beside their pod that covers the least; with more than four projects they show a short summary and open fully on hover. Name tags show only when they're legible and never overlap.
- Without WebGL the Map falls back to the 2D version below.
- **Workspace → Map** (`?page=map`): the whole village from above, laid out like an "agents office". Each project is a raised yard around the village square with its villagers at their desks. A card beside it says in words how many villagers it has, how many are working, waiting for your turn or resting, and which branches it's on. A "needs you" button opens the oldest request in Focus. Paths from the square flow toward yards with work going on and turn red when a yard needs you.
- A **session status** board on the right lists every session by what it needs (All, Needs you, Your turn, Working, Resting). Clicking one opens it in Focus. The board can be hidden.
- Zoom with the buttons or the mouse wheel, drag to move, and "Fit the village" to reset. The flowing paths stop when "Reduce motion" is on.

### Accessibility and polish
- Approve and Deny in the top bar are now real buttons with words (not ✓/✕ inside another button), so they work from the keyboard and with screen readers. Only the "N need you" summary is announced, not the ticking timers.
- Text on the red "needs you" colour is dark, for readable contrast.
- "Reduce motion" in Settings now stills every animation (including the bell, bubbles and pulses), and until you choose it the app follows your system setting as it changes.
- Settings and the Ctrl+K finder close with Esc, keep Tab inside, and give focus back to where it was. The village guide closes with Esc.
- Text boxes and filters show a focus ring.
- **Ctrl+]** leaves a terminal by keyboard (Tab and Esc stay with the shell); the terminal's header says so. Esc pressed in a terminal no longer also closes the side panel.
- Tab bars (Workspace pages, session details, terminals) work like standard tabs: ←/→, Home and End move between them, Tab enters the content, and each tab is linked to its panel. The Focus queue is a list of buttons (the selected one is marked current) with Approve/Deny beside it, not inside it. ↑/↓/j/k in Focus no longer act while a dialog or menu is open, in a terminal, or when ↑/↓ scroll the chat. The chat is a log, so screen readers announce new messages only.
- Labels of villagers outside the view no longer pile up at the screen edge. Picking another art style clears an error from the previous one. Switching to Live no longer pops toasts and sounds for requests that were already open.
- The chat no longer re-measures every message each second, and message text is rendered once.

### Security and reliability
- The WebSocket (terminals, messages to sessions) now only accepts connections from this computer, like every other API, even if `HOST` is overridden.
- Projects reported by the remote bridge are shown but never treated as local folders: terminals, "Open folder in" and Git only use projects found on this computer.
- A watched folder that is deleted or renamed no longer stops the server.
- A failed start now exits with the error instead of leaving a process that serves nothing.
- Fixed a file handle leak in pack image checks, a closed tab that could stay subscribed to a terminal it opened, and a chat history that was marked as loaded before it was read.
- Each API now reads its own request body, after its access check. Removed two unused config endpoints.
- When the port can't be used, the message says why: in use by another program, or reserved (for example by Hyper-V or WSL on Windows), with how to check. The bridge never overwrites a `config.json` it can't read; it reports it instead.

## 1.1.0 (2026-11-14)

macOS and Linux support. The mod is unchanged (v0.3.0).

### macOS and Linux
- **Terminals** start your own shell (`$SHELL`, else zsh on macOS and bash on Linux) instead of PowerShell. "Start Claude Code" runs `claude` in it and keeps the shell open afterwards. The buttons show the shell's name.
- **Linux:** the terminal library is built once with `node scripts/build-terminal.mjs`. Until then, only terminals are off, and they say how to fix it. Before, a missing terminal library would stop the whole server.
- **Open folder in** uses Finder on macOS and the desktop's file manager (`xdg-open`) on Linux, and finds VS Code and Cursor there too.
- Sessions started in a terminal are matched to it with `ps` on macOS and Linux (exact process-tree match, as on Windows).
- CI runs the type check, tests, a real shell and the built app on Windows, macOS and Linux.

### Project
- Issue templates (bug report, feature request), a pull request checklist and a contributing guide (`CONTRIBUTING.md`).

## 1.0.0 (2026-11-13)

First public release. The mod in this release is v0.3.0.

### Ready to share
- README screenshots and an animated village, all taken from the built-in demo (`node scripts/readme-shots.mjs`).
- CI on GitHub: every pull request and push to `main` runs the type check, the tests and the build on Windows.
- Install from GitHub: `claude plugin marketplace add Aswin1819/aigramam`, then `claude plugin install ai-gramam@aigramam`. The README, INSTALL and Settings → Session link show it first; installing from a local folder is still there as an alternative.
- A fresh `pnpm install` finishes without warnings about skipped build scripts. esbuild and Tailwind ship ready-made binaries.
- No more "failed to connect to websocket" console error in dev mode (hot reload is fully off: reload the page for client changes).
- Removed personal paths from the docs and tests.

### App
- **Setup checks** (Settings → Session link, and on Workspace → Focus when nothing is showing) check four things separately: whether the server is reachable, whether Claude Code has sessions, whether the mod is installed or out of date, and how many sessions are linked.
- When the server can't be reached, the page now says so instead of "no sessions".
- Install, troubleshooting and security docs, and this changelog.

### Village
- **Notice board** (world view, top right, can be folded): pins approvals, questions, errors, your turn and recently finished sessions, from the same groups as Workspace. Clicking a notice opens that villager.
- **Running tests:** a test command (vitest, jest, pytest, `npm test`, `go test`…) shows as its own activity with its own effect. It's recognised only from the command itself.
- **Calmer villagers:** through quick tool calls a villager keeps each pose for at least 1.5 s. Waiting, questions, errors and finishing still show at once.
- **Inside a building** (and on Workspace → Projects): the project's Git state (branch, upstream, changed files, last commit) and its recent sessions from History.
- The top bar says "needs you" only for approvals and questions, and "your turn" for sessions waiting for your next message, as Workspace does.
- History files a session under its latest folder, as the live view does, so both list it under the same project.

### Village, easier to read
- **Each project has its own yard:** a courtyard in Kerala and a forecourt in Bengaluru, with gate posts in the project's colour and a name board showing its counts.
- **Projects keep their place** while the page is open, so nobody walks across the village because another project started or stopped.
- **Stations instead of wandering:** every yard has the same stations: study, desk, works, gate, porch and bench. A villager walks only when its work changes.
  - Kerala props: a palm-leaf book stand, a grass mat, a hearth with an uruli, a post box, a bell post and a verandah seat.
  - Bengaluru props: a bookshelf, a hot desk, a server rack, an STD booth, a reception bell and waiting chairs.
- **One lamp per session** shows its state at a glance, day or night.
- **Art styles:** villagers stand at their stations instead of wandering, labels start with the activity's icon, and the station props show in each style's own look.
- **"How to read the village":** shown once, then available from the notice board.

### Workspace
- **Focus** replaces the Overview as Workspace's first page. The village sits along the top as a strip, with each project's board in its yard colour. Below it is a queue of every session, ordered needs you, your turn, errors, no recent activity, working, then resting.
  - The chosen session's conversation sits beside the queue. You can reply, stop, approve or answer from there, and Approve and Deny also sit on the queue row.
  - Move through the queue with ↑ ↓ or j k. Ctrl+K finds any session or project.
  - Picking a session from the top bar or a notification focuses it in the queue. **Details** opens the full drawer (changes, subagents, character, terminal).

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
