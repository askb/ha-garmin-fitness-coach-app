<!--
SPDX-FileCopyrightText: 2026 Anil Belur <askb23@gmail.com>
SPDX-License-Identifier: Apache-2.0
-->

# Implementation Plan: [Feature Name]

<!-- SPECKIT INSTRUCTIONS:
     This template captures HOW to build the feature.
     The speckit.plan agent fills in bracketed placeholders and
     selects the appropriate project-structure option.
     Remove instructional HTML comments from the final plan.
-->

| Field    | Value |
| -------- | ----- |
| Summary  | [One-sentence description of the implementation approach] |
| Branch   | `feature/###-short-name` |
| Date     | YYYY-MM-DD |
| Spec     | `specs/###-feature/spec.md` |
| Status   | Draft &#124; In Progress &#124; Complete |

---

## 1. Technical Context

<!-- SPECKIT: These values are fixed for this monorepo. Only update
     if the project's stack genuinely changes. -->

| Aspect              | Value |
| ------------------- | ----- |
| Language            | TypeScript |
| Primary Dependencies | Next.js 16, tRPC, Drizzle ORM |
| Storage             | PostgreSQL |
| Testing             | Vitest |
| Package Manager     | pnpm |
| Monorepo Tool       | Turborepo |

---

## 2. Constitution Check

<!-- SPECKIT: Evaluate each gate from .specify/memory/constitution.md.
     Mark PASS/FAIL. Any FAIL must be tracked in the Complexity
     Tracking table (Section 5) and resolved before implementation. -->

| # | Gate | Status |
| - | ---- | ------ |
| 1 | [Constitution gate 1] | ✅ PASS / ❌ FAIL |
| 2 | [Constitution gate 2] | ✅ PASS / ❌ FAIL |
| 3 | [Constitution gate 3] | ✅ PASS / ❌ FAIL |

---

## 3. Project Structure

<!-- SPECKIT: Select ONE option below that best fits the feature scope.
     Delete the other two options from the final plan. -->

### Option 1 — Engine-Only Change

Use when the feature is pure business logic with no database or UI changes.

```
packages/
  engine/
    src/
      [feature]/
        index.ts          # Public API
        [feature].ts      # Core logic & formulas
        types.ts          # Domain types
        __tests__/
          [feature].test.ts
```

**Affected packages:** `packages/engine/` only.

### Option 2 — Full-Stack Feature

Use when the feature touches engine logic, database, API, and UI.

```
packages/
  engine/
    src/
      [feature]/
        index.ts          # Public API
        [feature].ts      # Core logic & formulas
        types.ts          # Domain types
        __tests__/
          [feature].test.ts
  db/
    src/
      schema/
        [feature].ts      # Drizzle schema
    drizzle/
      XXXX_migration.sql  # Generated migration
  api/
    src/
      router/
        [feature].ts      # tRPC router
apps/
  nextjs/
    src/
      app/
        (dashboard)/
          [feature]/
            page.tsx      # Route page
            _components/  # Feature-specific components
```

**Affected packages:** `packages/engine/`, `packages/db/`,
`packages/api/`, `apps/nextjs/`.

### Option 3 — UI-Only Change

Use when the feature only changes the Next.js frontend with no engine,
database, or API changes.

```
apps/
  nextjs/
    src/
      app/
        (dashboard)/
          [feature]/
            page.tsx
            _components/
              [Component].tsx
      components/
        ui/
          [shared-component].tsx   # If adding shared UI
```

**Affected packages:** `apps/nextjs/` only.

---

## 4. Documentation Structure

<!-- SPECKIT: All design artefacts live under specs/[###-feature]/.
     Not every file is needed for every feature — omit what doesn't
     apply. -->

```
specs/[###-feature]/
  plan.md              # This file
  research.md          # Domain research & prior art (Phase 0)
  data-model.md        # Drizzle schema design & entity relationships
  contracts/
    [feature].router.ts   # tRPC router contract (inputs/outputs)
    [feature].types.ts    # Shared TypeScript interfaces
  quickstart.md        # Developer onboarding for this feature
  tasks.md             # Generated task list (from tasks-template)
```

---

## 5. Complexity Tracking

<!-- SPECKIT: Track any constitution violations or scope concerns.
     Each row must have a resolution before proceeding to Phase 1. -->

| # | Violation / Concern | Severity | Resolution |
| - | ------------------- | -------- | ---------- |
| 1 | [Description] | Low &#124; Medium &#124; High | [How it will be addressed] |

---

## 6. Phase 0 — Outline & Research

<!-- SPECKIT: This phase produces research.md. No code is written. -->

**Goal:** Understand the domain, gather references, and validate the
spec's assumptions.

### Tasks

- [ ] Review spec assumptions against available APIs / data sources
- [ ] Research prior art and competing implementations
- [ ] Identify sport-science models or formulas required
- [ ] Generate `specs/[###-feature]/research.md`
- [ ] Update spec if research invalidates any assumptions

### Output

`specs/[###-feature]/research.md` — domain research, API findings,
formula definitions, and links to primary sources.

---

## 7. Phase 1 — Design & Contracts

<!-- SPECKIT: This phase produces data-model.md, contracts/, and
     quickstart.md. Still no production code. -->

**Goal:** Define the data model, API contracts, and types so that
implementation tasks can be parallelised.

### Tasks

- [ ] Design Drizzle schema → `specs/[###-feature]/data-model.md`
- [ ] Define tRPC router contracts → `specs/[###-feature]/contracts/`
- [ ] Define shared TypeScript types → `specs/[###-feature]/contracts/`
- [ ] Write quickstart guide → `specs/[###-feature]/quickstart.md`
- [ ] Update `.specify/memory/agent-context.md` with new feature context

### Output

- `data-model.md` — entity-relationship diagram, Drizzle schema draft
- `contracts/` — tRPC router stubs, shared type definitions
- `quickstart.md` — how a developer gets started on this feature
- Updated agent context reflecting the new feature

---

## 8. Next Steps

<!-- SPECKIT: After Phase 1, generate tasks.md from tasks-template.md
     to produce the full implementation task list.
     Phase 2+ are driven by tasks.md, not this plan. -->

- [ ] Run `speckit.tasks` to generate `specs/[###-feature]/tasks.md`
- [ ] Begin Phase 2 implementation per task priority
