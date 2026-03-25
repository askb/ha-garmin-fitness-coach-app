<!--
SPDX-FileCopyrightText: 2026 Anil Belur <askb23@gmail.com>
SPDX-License-Identifier: Apache-2.0
-->

---
applyTo: "packages/api/**"
---

# API Package Instructions

## tRPC Patterns

- All routers in `src/router/` (14 routers, 43+ endpoints)
- Use `protectedProcedure` for authenticated endpoints
- Input validation with Zod v4: `import { z } from "zod/v4"`
- Return typed outputs for all procedures

## Auth Bypass (CRITICAL)

Production auth bypass: `DEV_BYPASS_AUTH=true` in `.env`
- `protectedProcedure` in `trpc.ts` checks `isDev || DEV_BYPASS_AUTH`
- Without this, all tRPC calls return UNAUTHORIZED in production
- See `src/trpc.ts` line ~121 for implementation

## AI Agent Integration

- `src/lib/ollama.ts` — Ollama client for local AI
- `src/lib/agent-prompts.ts` — Prompt templates for sport science agents
- `src/lib/data-context.ts` — Real-time athlete data context for LLM
- `src/router/chat.ts` — Chat endpoint (streams responses)

## Key Files

- `src/trpc.ts` — Middleware, auth, context creation
- `src/router/zones.ts` — HR zone analytics (7 endpoints)
- `src/router/readiness.ts` — Daily readiness scoring
- `src/router/trends.ts` — Long-term trend analysis
