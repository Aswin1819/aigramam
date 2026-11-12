# Contributing to Claude Dungeon

Thank you for your interest in contributing! Here's how to get started.

## Development Setup

```bash
git clone https://github.com/your-username/claude-dungeon
cd claude-dungeon
pnpm install
cp .env.example .env   # fill in DATABASE_URL and JWT_SECRET
pnpm db:push
pnpm dev
```

## Project Conventions

- **TypeScript everywhere** — no plain JS files in `client/src/` or `server/`
- **tRPC for all API calls** — define procedures in `server/routers/`, consume with `trpc.*` hooks
- **Canvas rendering** — all dungeon visuals live in `client/src/components/DungeonMap.tsx`
- **Tests required** — add or update Vitest specs in `server/*.test.ts` for any backend changes

Run tests:

```bash
pnpm test
```

## Pull Request Guidelines

1. Fork the repo and create a feature branch: `git checkout -b feat/my-feature`
2. Keep PRs focused — one feature or fix per PR
3. All tests must pass (`pnpm test`)
4. TypeScript must compile cleanly (`npx tsc --noEmit`)
5. Add a brief description of what changed and why

## Good First Issues

- [ ] Hero movement animation along corridors (lerp between room positions)
- [ ] Sound effects using Web Audio API (sword clash, footsteps)
- [ ] Dark/light theme toggle
- [ ] Mobile-responsive canvas scaling
- [ ] Support for Cursor / GitHub Copilot agent detection

## Code Style

- Prettier handles formatting (run `pnpm format`)
- Use `const` over `let` where possible
- Prefer named exports over default exports for components
- Keep `DungeonMap.tsx` drawing functions pure (no side effects)

## Questions?

Open a GitHub Discussion or file an issue.
