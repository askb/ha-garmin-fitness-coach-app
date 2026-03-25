# SPDX-FileCopyrightText: 2025 Anil Belur <askb23@gmail.com>
# SPDX-License-Identifier: Apache-2.0

# Agent Development Guidelines

## Constitution

If `.specify/memory/constitution.md` exists in this repository, read it and
follow its principles. The constitution takes precedence over this file if
there is any conflict between the two documents.

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

This project follows the
[seven rules of a great Git commit message](https://chris.beams.io/posts/git-commit/).

### Conventional Commit Format

```plaintext
Type(scope): Short imperative description

Body explaining what and why. Wrap at 72 characters.
URLs on their own line are exempt from the wrap limit.

Co-authored-by: <AI Model Name> <appropriate-email@provider.com>
Signed-off-by: Anil Belur <askb23@gmail.com>
```

**Allowed types** (capitalized, enforced by gitlint):
`Fix`, `Feat`, `Chore`, `Docs`, `Style`, `Refactor`, `Perf`, `Test`,
`Revert`, `CI`, `Build`

### Commit Rules

1. **Separate subject from body** with a blank line
2. **Limit subject to 72 chars** (enforced by gitlint)
3. **Capitalize the subject line** (Conventional Commit types satisfy this)
4. **Do not end subject with a period**
5. **Use imperative mood**: "Add feature", not "Added feature"
6. **Wrap body at 72 characters** (URLs exempt)
7. **Explain what and why**, not how

### Co-Authorship

All AI-assisted commits MUST include a `Co-authored-by` trailer:

| Model   | Co-authored-by |
|---------|----------------|
| Copilot | `Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>` |
| Claude  | `Co-authored-by: Claude <claude@anthropic.com>` |
| ChatGPT | `Co-authored-by: ChatGPT <chatgpt@openai.com>` |
| Gemini  | `Co-authored-by: Gemini <gemini@google.com>` |

### DCO Sign-off

Always use `git commit -s` for Developer Certificate of Origin sign-off:
`Signed-off-by: Anil Belur <askb23@gmail.com>`

## Atomic Commits

Each commit MUST represent exactly one logical change:

- ✅ One feature per commit
- ✅ One bug fix per commit
- ✅ One refactor per commit
- ❌ Multiple unrelated changes in one commit

Task list updates (e.g., `tasks.md`) MUST be committed separately from
the code they track.

## Pre-commit

Run `pre-commit run --all-files` before pushing. Hooks include:
yamllint, gitlint, REUSE compliance, actionlint.

### If Pre-Commit Fails

**CRITICAL**: Do NOT use `git reset` after a failed commit attempt.

1. Fix the issues identified by the hooks
2. Stage the fixes: `git add <files>`
3. Commit again (hooks will re-run)

Using `--no-verify` to bypass hooks is **PROHIBITED**.

## Important Files

- `packages/api/src/trpc.ts` — Auth bypass logic (line ~121)
- `packages/api/src/router/zones.ts` — Zone analytics (7 endpoints)
- `packages/api/src/router/chat.ts` — AI agent chat (Ollama)
- `packages/api/src/lib/data-context.ts` — Real-time data for LLM
- `packages/engine/src/` — All sport science calculations
- `apps/nextjs/src/app/_components/info-button.tsx` — Chart info tooltips
- `.env` — Required: DATABASE_URL, AUTH_SECRET, DEV_BYPASS_AUTH
