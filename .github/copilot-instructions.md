---
description: Development guidelines and conventions for the GarminCoach sport scientist app.
applyTo: '**'
---

<!--
SPDX-FileCopyrightText: 2026 Anil Belur <askb23@gmail.com>
SPDX-License-Identifier: Apache-2.0
-->

# GarminCoach App Development Guidelines

Auto-generated from feature plans. Last updated: 2026-03-25

## Active Technologies

- Node.js 22, pnpm 10.x, Turborepo
- Next.js 16 (App Router, Turbopack)
- tRPC v11 + React Query
- Drizzle ORM + PostgreSQL 16
- Better-Auth for authentication
- Tailwind CSS v4 + shadcn/ui
- Vitest for testing (239 tests)
- Ollama / OpenAI for AI chat agents
- Recharts for data visualization

## Project Structure

```text
apps/nextjs/          # Next.js 16 web app (App Router)
packages/api/         # tRPC routers + Ollama AI agents (43+ endpoints)
packages/db/          # Drizzle ORM schema (22 tables)
packages/engine/      # Pure TS sport science engine (131 tests)
packages/auth/        # Better-Auth configuration
packages/garmin/      # Garmin Connect API integration
packages/ui/          # shadcn/ui components
packages/validators/  # Zod v4 schemas
scripts/              # ETL, health checks, prod startup
tooling/              # Shared build/lint configs
```

## Commands

```bash
pnpm install                            # Install all dependencies
pnpm dev                                # Development server (Turbo watch)
pnpm turbo typecheck                    # Typecheck all packages
pnpm --filter @acme/engine test         # Run engine tests
pnpm --filter @acme/nextjs build        # Production build
```

## Code Style

- TypeScript strict mode, Zod v4 (`from "zod/v4"`, NOT `from "zod"`)
- Package namespace: `@acme/*`
- Path aliases: `~/` for app source root
- ESLint + Prettier for formatting

## Recent Changes

- Initial speckit bootstrap

<!-- MANUAL ADDITIONS START -->
<!-- MANUAL ADDITIONS END -->
