# Contributing to Ai Gramam

## Setup (Windows, macOS or Linux)

```bash
npx -y pnpm@10.4.1 install
cp .env.example .env   # optional: change PORT
npx pnpm@10.4.1 dev
```

## Conventions

- **TypeScript everywhere**; shared types live in `shared/`.
- **Local only**: the server binds to `127.0.0.1`; no telemetry, CDNs, web fonts or external calls.
- **Packs are data**: worlds and characters are JSON + images, validated with zod; never code.
- **Original art only**: no real people, film or cartoon characters, logos, film dialogue or music. Every pack declares an author and license.
- **Text, not only icons**: every state and action needs a text label.
- **Tests**: add or update Vitest specs in `server/*.test.ts` for server changes.

```bash
npx pnpm@10.4.1 test
npx pnpm@10.4.1 check
```

## Pull requests

1. Work on a feature branch.
2. Keep changes focused; describe what changed and why.
3. Tests and type checks must pass.
