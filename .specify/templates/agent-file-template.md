<!--
SPDX-FileCopyrightText: 2026 Anil Belur <askb23@gmail.com>
SPDX-License-Identifier: Apache-2.0
-->

# Agent Context: [Project Name]

<!-- SPECKIT INSTRUCTIONS:
     This template is used to auto-generate .github/copilot-instructions.md.
     The speckit.agent-context agent populates sections by scanning all
     plan.md files and the current project state.
     Sections marked AUTO-GENERATED are rebuilt on every run.
     Content between MANUAL ADDITIONS markers is preserved across runs.
     Remove instructional HTML comments from the final output.
-->

> **Auto-generated:** YYYY-MM-DD
> Do not edit auto-generated sections directly — they are overwritten
> by the speckit agent. Add manual content between the marked sections.

---

## Active Technologies

<!-- AUTO-GENERATED: Extracted from all specs/*/plan.md Technical Context
     sections. Only list technologies that are actually in use. -->

| Technology | Version | Purpose |
| ---------- | ------- | ------- |
| TypeScript | 5.x     | Primary language |
| Next.js    | 16      | Full-stack React framework |
| tRPC       | 11.x    | Type-safe API layer |
| Drizzle ORM | latest | Database toolkit & query builder |
| PostgreSQL | 16      | Primary database |
| Vitest     | latest  | Unit & integration testing |
| pnpm       | 9.x     | Package manager |
| Turborepo  | latest  | Monorepo build orchestration |

---

## Project Structure

<!-- AUTO-GENERATED: Reflects the actual monorepo layout derived from
     plan.md project-structure selections. -->

```
apps/
  nextjs/                 # Next.js 16 application
    src/
      app/                # App Router pages
        (dashboard)/      # Dashboard route group
      components/         # Shared UI components
packages/
  api/                    # tRPC routers & server
    src/
      router/             # Feature routers
  db/                     # Drizzle schema & migrations
    src/
      schema/             # Table definitions
    drizzle/              # Generated SQL migrations
  engine/                 # Pure business logic (no framework deps)
    src/
      __tests__/          # Vitest test files
  ui/                     # Shared UI component library
tooling/
  eslint/                 # Shared ESLint config
  typescript/             # Shared tsconfig
```

---

## Commands

<!-- AUTO-GENERATED: Only commands relevant to active technologies.
     Scanned from package.json scripts and turbo.json pipelines. -->

| Command | Description |
| ------- | ----------- |
| `pnpm install` | Install all dependencies |
| `pnpm dev` | Start development server |
| `pnpm build` | Build all packages & apps |
| `pnpm test` | Run Vitest test suite |
| `pnpm lint` | Lint all packages |
| `pnpm typecheck` | TypeScript type checking |
| `pnpm db:generate` | Generate Drizzle migration |
| `pnpm db:migrate` | Apply database migrations |
| `pnpm db:push` | Push schema directly (dev only) |

---

## Code Style

<!-- AUTO-GENERATED: Language-specific conventions derived from
     linter configs and existing code patterns. -->

### TypeScript

- Strict mode enabled (`strict: true` in tsconfig)
- Prefer `type` over `interface` for object shapes
- Use path aliases: `~/` maps to `src/`
- Named exports only — no default exports
- Explicit return types on public functions

### React / Next.js

- Server Components by default; add `"use client"` only when needed
- Colocate components in `_components/` next to their route
- Use tRPC hooks for data fetching (`api.[router].[procedure].useQuery()`)

### Testing

- Test files: `*.test.ts` in `__tests__/` directories
- Describe blocks mirror module structure
- Use `vi.mock()` for external dependencies
- Aim for behaviour-driven tests, not implementation tests

---

## Recent Changes

<!-- AUTO-GENERATED: Last 3 features from specs/ directory,
     most recent first. -->

| # | Feature | Spec | Status |
| - | ------- | ---- | ------ |
| 1 | [Feature name] | `specs/###-feature/spec.md` | [Status] |
| 2 | [Feature name] | `specs/###-feature/spec.md` | [Status] |
| 3 | [Feature name] | `specs/###-feature/spec.md` | [Status] |

---

<!-- MANUAL ADDITIONS START -->

<!-- Add project-specific instructions here that should NOT be
     overwritten by the speckit agent. Examples:
     - Environment variable requirements
     - External service dependencies
     - Team conventions not captured elsewhere
-->

<!-- MANUAL ADDITIONS END -->
