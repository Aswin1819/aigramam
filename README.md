# 🏰 Claude Dungeon

<img width="1200" height="675" alt="image" src="https://github.com/user-attachments/assets/8012ae32-a35f-4e1e-8236-bbba2e135f37" />

**Watch your Claude Code agents come alive as pixel-art heroes in a real-time dungeon.**

Claude Dungeon connects to your local Claude Code sessions and visualizes every agent as an animated knight exploring a dungeon — fighting bosses when using tools, resting at the tavern, planning at the merchant shop.

![Claude Dungeon — Heroes in action](https://d2xsxph8kpxj0f.cloudfront.net/310519663321243150/kUk4sJXkGLHTnK5J3QqqXR/dungeon_heroes_final_42691e6e.png)

## Features

- **Real-time visualization** — heroes appear as Claude Code sessions start and disappear when they end
- **5 connected rooms** — Holy Sanctuary, Dungeon Main, Boss Arena, Merchant Shop, Tavern Rest, linked by corridors with doors
- **BFS pathfinding** — heroes navigate through corridors using proper tile-based pathfinding, never walking through walls
- **Animated sprites** — knights with idle/run/attack/rest animations from a full Metroidvania asset pack
- **Lord Wizard Boss** — permanently resides in Boss Arena with HP bar; attacks when heroes enter fighting state
- **Guardian enemy** — reacts to heroes in Dungeon Main with attack animation
- **Witch Merchant NPC** — animated in Merchant Shop; shows item orb when heroes are shopping
- **NPC facing** — heroes always face toward the NPC/Boss they are interacting with
- **Skills system** — manage global and per-project Claude skills (`~/.claude/skills/`)
- **Demo mode** — try it without Claude Code running
- **Multi-agent support** — each concurrent Claude Code session gets its own hero

## Quick Start

### Prerequisites

- Node.js 18+
- pnpm (`npm install -g pnpm`)

### Installation

```bash
git clone https://github.com/your-username/claude-dungeon
cd claude-dungeon
pnpm install
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000).

### Connect to Claude Code

Claude Dungeon watches `~/.claude/projects/` for active sessions automatically. Just start Claude Code in any project and your hero will appear within seconds.

The app detects active sessions by monitoring file modification times. Heroes disappear ~2 minutes after a session ends (or within 15 seconds if the `claude` process exits).

## Project Structure

```
client/          React 19 + Tailwind 4 frontend
  src/
    components/  DungeonMap (Canvas), HeroPanel, SkillsPanel
    hooks/       useHeroSocket, useAuth
    lib/         dungeonConfig, transcriptParser
server/          Express + tRPC backend
  routers/       agents, skills
  websocket.ts   Real-time hero state management
  bridge.ts      REST API for external data push
drizzle/         Database schema & migrations
public/sprites/  Pixel art assets (Metroidvania Asset Pack)
bridge/          Local bridge script (optional, for remote servers)
```

## How It Works

1. The server watches `~/.claude/projects/**/*.jsonl` for Claude Code transcript files
2. Each active `.jsonl` file (modified within 5 minutes) creates a hero
3. The transcript is parsed to determine the agent's current state (idle / fighting / resting / planning)
4. State is broadcast via WebSocket to all connected browsers
5. The Canvas renderer draws heroes in the appropriate dungeon room with matching animations
6. Heroes navigate between rooms using BFS pathfinding on a tile grid — corridors are the only valid paths

### State → Room Mapping

| Claude Code State | Dungeon Room | Animation |
|-------------------|--------------|-----------|
| Idle / waiting | Dungeon Main | Idle + talk bubble near Guardian |
| Using tools (Bash, Write) | Boss Arena | Attack (facing Boss) |
| Using web/search | Boss Arena | Cast (facing Boss) |
| Reading files | Holy Sanctuary | Idle |
| Planning / thinking | Merchant Shop | Idle (facing Witch, item orb shown) |
| Resting / done | Tavern Rest | Idle + Zzz |

### NPC Interactions

| Room | NPC | Hero Behavior |
|------|-----|---------------|
| Boss Arena | Lord Wizard | Hero stops 5 tiles left of Boss, faces right (toward Boss), attacks |
| Merchant Shop | Witch | Hero stops 3 tiles left of Witch, faces right (toward Witch), Witch shows item orb |
| Dungeon Main | Guardian | Hero stops 2 tiles left of Guardian, faces right (toward Guardian), Guardian uses attack animation |

## Skills Management

Claude Dungeon includes a built-in UI for managing Claude Code skills:

- View and edit global skills in `~/.claude/skills/`
- View and edit per-project skills in `.claude/skills/`
- Create new skills with a SKILL.md editor
- Delete skills

## Remote Bridge (Optional)

If you're running Claude Code on a remote server, use the included bridge script to push hero state to a hosted Claude Dungeon instance:

```bash
# Download
curl -O https://your-instance.example.com/bridge/claude-dungeon-bridge.mjs

# Run
CLAUDE_DUNGEON_SERVER=https://your-instance.example.com \
node claude-dungeon-bridge.mjs
```

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19, Tailwind CSS 4, Canvas API |
| Backend | Express 4, tRPC 11, Node.js |
| Real-time | WebSocket (ws) |
| Sprites | Another Metroidvania Asset Pack Vol. 1 |
| Pathfinding | BFS on tile grid (wall-aware) |

## Contributing

Contributions are welcome!

Ideas for contributions:

- Sound effects (Web Audio API)
- Mobile-responsive layout
- Support for other AI coding agents (Cursor, Copilot)
- More enemy types and boss variants
- Hero level-up animations

## License

MIT — see [LICENSE](LICENSE).

## Credits

- Pixel art sprites: [Another Metroidvania Asset Pack Vol. 1](https://itch.io) by the original artist
- Built with [Claude](https://claude.ai) by Anthropic
