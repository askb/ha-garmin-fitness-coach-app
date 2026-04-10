<!--
SPDX-FileCopyrightText: 2026 Anil Belur <askb23@gmail.com>
SPDX-License-Identifier: Apache-2.0
-->

<!--
Sync Impact Report
==================
Previous version : 0.0.0 (none)
Current version  : 1.0.0
Bump type        : MAJOR — initial ratification of project constitution
Reason           : First formal constitution establishing governance,
                   code quality standards, licensing requirements, and
                   development practices for the PulseCoach sport
                   scientist application.
-->

# PulseCoach App — Project Constitution

> **Canonical governance document** for the PulseCoach sport scientist
> application. All contributors — human and AI — are bound by these
> principles.

**Version:** 1.0.0
**Ratified:** 2026-03-25
**Maintainer:** Anil Belur \<askb23@gmail.com\>

---

## Technology Stack

| Layer | Technology |
|-------|-----------|
| Runtime | Node.js 22, pnpm 10.x, Turborepo |
| Framework | Next.js 16 (App Router, Turbopack) |
| API | tRPC v11 + React Query |
| Database | Drizzle ORM + PostgreSQL 16 |
| Auth | Better-Auth |
| Styling | Tailwind CSS v4 + shadcn/ui |
| Charts | Recharts |
| AI | Ollama (local), OpenAI (optional) |
| Testing | Vitest (239 tests) |
| Package Manager | pnpm 10.x |
| Build Orchestration | Turborepo |

---

## Principles

### Principle I: Code Quality & Testing Standards

1. The engine package (`packages/engine/`) **must** maintain 100% formula
   coverage. Every sport science calculation must have corresponding tests
   that validate against published reference values.

2. Sport science calculations **MUST** cite peer-reviewed sources in JSDoc
   comments. Accepted citations include but are not limited to:
   - Banister, E.W. (1991) — Training impulse (TRIMP)
   - Banister, E.W. (1975) — Fitness-fatigue model (CTL/ATL/TSB)
   - Hulin, B.J. et al. (2016) — Acute:chronic workload ratio (ACWR)
   - Buchheit, M. (2014) — Monitoring training status with HR measures
   - Riegel, P.S. (1981) — Race time prediction model

3. TypeScript **strict mode** is required across all packages. The
   `tsconfig.json` at each package root must extend the shared strict
   configuration from `tooling/typescript/`.

4. **Zod v4** schemas are required for all API boundaries. Every tRPC
   router input and every external data ingestion point must be validated
   through Zod schemas defined in `packages/validators/`.

5. All tRPC routers must have fully typed inputs and outputs. Untyped
   `any` returns are prohibited.

6. Tests run via: `pnpm --filter @acme/engine test`

### Principle II: Atomic Commit Discipline (NON-NEGOTIABLE)

1. All commits **MUST** follow Conventional Commits with **Capitalized**
   type prefixes:

   ```
   Feat, Fix, Chore, Docs, Style, Refactor, Perf, Test, Revert, CI, Build
   ```

2. Commit title line: **maximum 72 characters**.
   Commit body lines: **maximum 72 characters per line**.

3. Each commit represents **exactly one logical change**. A commit that
   adds a tRPC router must not simultaneously update an unrelated schema.

4. **Mixing unrelated changes is PROHIBITED.** If you discover an
   unrelated bug while working on a feature, fix it in a separate commit.

5. Task list updates (TODO files, progress trackers) are **always**
   separate commits from code changes.

### Principle III: Licensing & Attribution Standards (NON-NEGOTIABLE)

1. Every source file **MUST** include SPDX headers:

   ```
   SPDX-License-Identifier: Apache-2.0
   SPDX-FileCopyrightText: YYYY Anil Belur <askb23@gmail.com>
   ```

2. For TypeScript/JavaScript files, use `//` comment style.
   For YAML/Markdown, use HTML comment style `<!-- -->`.
   For Shell scripts, use `#` comment style.

3. **REUSE compliance** is enforced by the `reuse-tool` pre-commit hook.
   Non-compliant files will block commits.

4. The project is licensed under **Apache-2.0**.

### Principle IV: Pre-Commit Integrity (NON-NEGOTIABLE)

1. **All hooks must pass** before any push to the repository.

2. **Never use `--no-verify`** to bypass pre-commit hooks. This is a
   terminable offense for AI agents and strongly discouraged for humans.

3. Active pre-commit hooks include:
   - `gitlint` — Commit message format validation
   - `yamllint` — YAML file linting
   - `reuse-tool` — SPDX/REUSE license compliance
   - `actionlint` — GitHub Actions workflow validation
   - `check-json` — JSON syntax validation
   - `check-yaml` — YAML syntax validation

4. If hooks fail: **fix the issues**, stage the fixes, and commit again.
   Do **NOT** use `git reset` to undo hook changes.

### Principle V: Agent Co-Authorship & DCO Requirements (NON-NEGOTIABLE)

1. All AI-assisted commits **MUST** include a Co-authored-by trailer:

   ```
   Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>
   ```

2. All commits **MUST** include a DCO sign-off via `git commit -s`:

   ```
   Signed-off-by: Anil Belur <askb23@gmail.com>
   ```

3. Both trailers are required on every commit where an AI agent
   contributed to the change, regardless of the size of the contribution.

### Principle VI: Import & Namespace Conventions (NON-NEGOTIABLE)

1. **Zod imports**: ALWAYS use `from "zod/v4"` — **NEVER** `from "zod"`.
   The bare `"zod"` import resolves to Zod v3 and will cause runtime
   schema incompatibilities.

2. **Package namespace**: All workspace packages use the `@acme/*`
   namespace (e.g., `@acme/db`, `@acme/engine`, `@acme/api`,
   `@acme/validators`, `@acme/ui`, `@acme/auth`, `@acme/garmin`).

3. **Path aliases**: `~/` maps to the application source root in the
   Next.js app (`apps/nextjs/src/`). Use `~/` for intra-app imports.

### Principle VII: Engine Purity

1. `packages/engine/` must be **pure TypeScript** with **zero external
   dependencies**. The `package.json` must not list any `dependencies`
   (only `devDependencies` for testing tooling).

2. All formulas must be independently testable with **no I/O or side
   effects**. No `fetch`, no `fs`, no database calls, no environment
   variable reads.

3. Every exported calculation function must include **JSDoc with an
   academic citation** linking to the peer-reviewed paper or textbook
   that defines the formula.

4. The engine is the scientific foundation of the app — correctness is
   paramount. When in doubt, favor clarity over cleverness.

### Principle VIII: Performance & User Experience

1. The dashboard **must** load within **3 seconds** on a local network.
   Measure from navigation start to Largest Contentful Paint (LCP).

2. Garmin sync operations **must not block the UI**. All sync operations
   run as async background tasks with progress indicators.

3. Chart rendering must handle **6+ years** of historical activity data
   efficiently. Use virtualization, aggregation, or lazy loading as
   needed.

4. tRPC queries should use appropriate **caching strategies** via React
   Query's `staleTime` and `gcTime` to minimize redundant database
   queries.

---

## Development Standards

### Git Workflow

1. **Branch naming**: `<type>/<description>` (e.g.,
   `feat/add-readiness-chart`, `fix/trimp-calculation`).

2. **Commit flow**:
   - Write code
   - Run `pnpm turbo typecheck` to verify types
   - Run relevant tests (`pnpm --filter @acme/engine test`)
   - Stage changes (`git add`)
   - Commit with sign-off (`git commit -s`)
   - Verify pre-commit hooks pass
   - Push

3. **Rebasing**: Prefer `git pull --rebase` for clean history.

### Testing Requirements

1. **Engine tests**: 100% formula coverage. Every new calculation
   function requires tests before merge.

2. **API tests**: tRPC routers should have integration tests covering
   happy path and error cases.

3. **Run all tests**: `pnpm turbo test` (runs Vitest across workspace).

4. **Run engine tests only**: `pnpm --filter @acme/engine test`

### Code Review Standards

1. Every change must be reviewed before merge to `main`.

2. Review checklist:
   - [ ] SPDX headers present on all new files
   - [ ] Academic citations on engine formulas
   - [ ] Zod v4 imports (not bare `"zod"`)
   - [ ] TypeScript strict mode compliance
   - [ ] Tests added for new functionality
   - [ ] Commit messages follow Conventional Commits
   - [ ] Co-authored-by and Signed-off-by trailers present

---

## Governance

### Constitutional Authority

This constitution is the **supreme governance document** for the
PulseCoach project. All contributors, tools, and AI agents must comply
with these principles.

In case of conflict between this constitution and any other project
documentation, **this constitution takes precedence**.

### Amendment Process

1. Amendments follow **semantic versioning**:
   - **MAJOR**: New principles or fundamental changes to existing ones
   - **MINOR**: Clarifications, expansions, or new subsections
   - **PATCH**: Typo fixes, formatting, non-substantive edits

2. All amendments must be proposed as a separate commit with type `Docs:`
   and a clear description of the change.

3. The Sync Impact Report (HTML comment at the top of this file) must be
   updated with every version change.

4. The project maintainer (Anil Belur) has final authority on
   constitutional amendments.

---

*End of Constitution v1.0.0*
