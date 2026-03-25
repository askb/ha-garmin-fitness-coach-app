---
description: Execute the implementation planning workflow using the plan template to generate design artifacts.
handoffs:
  - label: Create Tasks
    agent: speckit.tasks
    prompt: Break the plan into tasks
    send: true
  - label: Create Checklist
    agent: speckit.checklist
    prompt: Create a checklist for the following domain...
---
<!--
SPDX-FileCopyrightText: 2026 Anil Belur <askb23@gmail.com>
SPDX-License-Identifier: Apache-2.0
-->

## User Input

```text
$ARGUMENTS
```

You **MUST** consider the user input before proceeding (if not empty).

## Outline

1. **Setup**: Run `.specify/scripts/bash/setup-plan.sh --json` from repo root and parse JSON for FEATURE_SPEC, IMPL_PLAN, SPECS_DIR, BRANCH. For single quotes in args, use escape syntax: e.g `'I'\''m Groot'` (or double-quote if possible: `"I'm Groot"`).

2. **Load context**: Read FEATURE_SPEC and `.specify/memory/constitution.md`. Load IMPL_PLAN template (already copied).

3. **Execute plan workflow**: Follow the structure in IMPL_PLAN template to:
   - Fill Technical Context (mark unknowns as "NEEDS CLARIFICATION")
   - Fill Constitution Check section from constitution
   - Evaluate gates (ERROR if violations unjustified)
   - Phase 0: Generate research.md (resolve all NEEDS CLARIFICATION)
   - Phase 1: Generate data-model.md, contracts/, quickstart.md
   - Phase 1: Update agent context by running `.specify/scripts/bash/update-agent-context.sh copilot`
   - Re-evaluate Constitution Check post-design

4. **Stop and report**: Command ends after Phase 2 planning. Report branch, IMPL_PLAN path, and generated artifacts.

## Phases

### Phase 0: Outline & Research

1. **Extract unknowns from Technical Context** above:
   - For each NEEDS CLARIFICATION → research task
   - For each dependency → best practices task
   - For each integration → patterns task

2. **Generate and dispatch research agents**:

   ```text
   For each unknown in Technical Context:
     Task: "Research {unknown} for {feature context}"
   For each technology choice:
     Task: "Find best practices for {tech} in {domain}"
   ```

3. **Consolidate findings** in `research.md` using format:
   - Decision: [what was chosen]
   - Rationale: [why chosen]
   - Alternatives considered: [what else evaluated]

**Output**: research.md with all NEEDS CLARIFICATION resolved

### Phase 1: Design & Contracts

**Prerequisites:** `research.md` complete

1. **Extract entities from feature spec** → `data-model.md`:
   - Entity name, fields, relationships
   - Validation rules from requirements
   - State transitions if applicable

2. **Generate API contracts** from functional requirements:
   - For each user action → tRPC procedure (query/mutation)
   - Use tRPC v11 patterns with Zod v4 input/output schemas
   - Output contract definitions to `/contracts/`

3. **Agent context update**:
   - Run `.specify/scripts/bash/update-agent-context.sh copilot`
   - These scripts detect which AI agent is in use
   - Update the appropriate agent-specific context file
   - Add only new technology from current plan
   - Preserve manual additions between markers

**Output**: data-model.md, /contracts/*, quickstart.md, agent-specific file

## Technical Context (T3 Turbo Monorepo)

When filling the Technical Context section of the plan, use these known stack details:

| Component | Technology | Version |
|-----------|-----------|---------|
| Runtime | Node.js | 22 |
| Package Manager | pnpm | 10.x |
| Monorepo | Turborepo | 2.5+ |
| Framework | Next.js | 16 |
| API Layer | tRPC | v11 |
| ORM | Drizzle ORM | latest |
| Database | PostgreSQL | latest |
| Auth | Better-Auth | latest |
| Styling | Tailwind CSS | v4 |
| UI Components | shadcn/ui | latest |
| Charts | Recharts | latest |
| AI/LLM | Ollama / OpenAI | latest |
| Testing | Vitest | latest |
| Validation | Zod | v4 (import from "zod/v4") |

### Monorepo Package Map

| Package | Purpose | Key Constraint |
|---------|---------|---------------|
| `@acme/engine` | Pure TypeScript sport science calculations | **Zero external dependencies**, no I/O, no side effects |
| `@acme/api` | tRPC router definitions | Depends on engine, db, validators |
| `@acme/db` | Drizzle ORM schema and queries | PostgreSQL, Drizzle migrations |
| `@acme/auth` | Better-Auth authentication | Session management, OAuth |
| `@acme/garmin` | Garmin Connect API integration | External API, rate limiting |
| `@acme/ui` | Shared React components | shadcn/ui, Tailwind v4 |
| `@acme/validators` | Shared Zod v4 schemas | Used by api, engine, ui |
| `apps/nextjs` | Main Next.js 16 web application | App Router, RSC |
| `apps/tanstack-start` | Secondary TanStack Start app | Alternative frontend |

### Constitution Gates

When evaluating constitution check gates, verify these principles from `.specify/memory/constitution.md`:

1. **Code Quality & Testing**: 100% formula coverage for engine, peer-reviewed citations for sport science, TypeScript strict mode, Zod v4 at API boundaries
2. **Atomic Commit Discipline**: Conventional Commits (Capitalized), max 72 chars
3. **Licensing & Attribution**: SPDX headers (Apache-2.0), REUSE compliance
4. **Pre-Commit Integrity**: gitlint, yamllint, reuse-tool, actionlint
5. **Agent Co-Authorship**: AI commits need `Co-authored-by` trailer + DCO sign-off
6. **Import & Namespace Conventions**: `from "zod/v4"` (NOT bare `"zod"`), `@acme/*` namespace
7. **Engine Purity**: `packages/engine/` must be pure TypeScript with zero external dependencies
8. **Performance & UX**: Dashboard loads in <3s (LCP), async Garmin sync, 6+ years data handling

## Key Rules

- Use absolute paths
- ERROR on gate failures or unresolved clarifications
- Plan references monorepo packages (@acme/engine, @acme/api, @acme/db, @acme/ui)
- Data model entities map to Drizzle schema in `@acme/db`
- API contracts map to tRPC routers in `@acme/api`
- Sport science formulas MUST include citation references
- Engine calculations MUST be pure functions with zero external deps
