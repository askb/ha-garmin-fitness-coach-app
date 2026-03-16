# SPDX-FileCopyrightText: 2025 Anil Belur <askb23@gmail.com>
# SPDX-License-Identifier: Apache-2.0

# AI Coding Agent Instructions

## Project Overview

GarminCoach is an AI-powered sport scientist app that ingests real Garmin
health/activity data to provide evidence-based coaching, training analysis,
and recovery optimization.

**Stack**: T3 Turbo monorepo — Next.js 16, tRPC v11, Drizzle ORM,
PostgreSQL, Better-Auth, Recharts, Ollama (local AI).

## Repository Structure

```
.
├── apps/
│   ├── nextjs/          # Next.js 16 web app (App Router)
│   └── expo/            # React Native app (unused currently)
├── packages/
│   ├── api/             # tRPC routers + Ollama AI agents
│   │   └── src/
│   │       ├── router/  # 14 tRPC routers (43+ endpoints)
│   │       ├── lib/     # ollama.ts, agent-prompts.ts, data-context.ts
│   │       └── trpc.ts  # Auth middleware (DEV_BYPASS_AUTH critical)
│   ├── db/              # Drizzle ORM schema + migrations
│   ├── engine/          # Pure TS sport science engine (131 tests)
│   ├── auth/            # Better-Auth config
│   ├── garmin/          # Garmin Connect integration
│   ├── ui/              # Shared UI components
│   └── validators/      # Zod schemas (import from zod/v4, NOT zod)
├── scripts/             # ETL, health-check, production start
├── docker-compose.yml   # Postgres + Redis
└── turbo.json           # Turborepo config
```

## Key Conventions

### Imports
- **Zod**: Always `import { z } from "zod/v4"` — NOT `from "zod"`
- **Package namespace**: `@acme/*` (e.g., `@acme/db`, `@acme/engine`)
- **Path aliases**: `~/` maps to app source root

### Auth
- Production auth bypass: `DEV_BYPASS_AUTH=true` in `.env`
- `protectedProcedure` in `trpc.ts` checks `isDev || DEV_BYPASS_AUTH`
- Without this, all tRPC calls return UNAUTHORIZED in production

### Database
- PostgreSQL via Drizzle ORM
- Schema in `packages/db/src/schema/`
- Activities store `hrZoneMinutes` as JSONB: `{zone1: N, ..., zone5: N}`

### Engine
- Pure TypeScript, zero external dependencies
- All calculations have sport science citations
- Key formulas: TRIMP (Banister 1991), ACWR (Hulin 2016),
  CTL/ATL/TSB (Banister 1975), Readiness (z-score, Buchheit 2014)

## Development Commands

```bash
# Install dependencies
pnpm install

# Development server
pnpm dev

# Typecheck all packages
pnpm turbo typecheck

# Run engine tests
pnpm --filter @acme/engine test

# Build for production
pnpm --filter @acme/nextjs build

# Start production
cd apps/nextjs && set -a && source ../../.env && set +a && npx next start
```

## Testing

- Engine tests: `packages/engine/src/__tests__/` (vitest, 131 tests)
- Run: `pnpm --filter @acme/engine test`
- All tests must pass before committing

## Commit Conventions

- Use Conventional Commits: `Feat:`, `Fix:`, `Chore:`, `Docs:`, etc.
- Title max 72 chars
- Body max 72 chars per line
- Required: `Signed-off-by: Anil Belur <askb23@gmail.com>`
- Change-Id trailer added automatically by commit-msg hook

## Pre-commit

Run `pre-commit run --all-files` before pushing. Hooks include:
yamllint, gitlint, REUSE compliance, actionlint.

## Important Files

- `packages/api/src/trpc.ts` — Auth bypass logic (line ~121)
- `packages/api/src/router/zones.ts` — Zone analytics (7 endpoints)
- `packages/api/src/router/chat.ts` — AI agent chat (Ollama)
- `packages/api/src/lib/data-context.ts` — Real-time data for LLM
- `packages/engine/src/` — All sport science calculations
- `apps/nextjs/src/app/_components/info-button.tsx` — Chart info tooltips
- `.env` — Required: DATABASE_URL, AUTH_SECRET, DEV_BYPASS_AUTH
