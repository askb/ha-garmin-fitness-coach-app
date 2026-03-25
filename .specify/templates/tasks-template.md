<!--
SPDX-FileCopyrightText: 2026 Anil Belur <askb23@gmail.com>
SPDX-License-Identifier: Apache-2.0
-->

# Task List: [Feature Name]

<!-- SPECKIT INSTRUCTIONS:
     The speckit.tasks agent replaces ALL sample tasks below with
     real tasks derived from the spec and plan. The structure,
     format conventions, and path conventions stay as-is.
     Remove instructional HTML comments from the final task list.
-->

| Field         | Value |
| ------------- | ----- |
| Feature       | [Feature Name] |
| Spec          | `specs/###-feature/spec.md` |
| Plan          | `specs/###-feature/plan.md` |
| Data Model    | `specs/###-feature/data-model.md` |
| Contracts     | `specs/###-feature/contracts/` |
| Prerequisites | Phase 0 & Phase 1 of the plan must be complete |

---

## Format

Each task follows this format:

```
[TASK-###] [P?] [US-###] Short description
```

- **TASK-###** — Unique task ID
- **P?** — Priority: P0 (must), P1 (should), P2 (nice)
- **US-###** — Linked user story from the spec (or `INFRA` for setup tasks)

---

## Path Conventions

<!-- SPECKIT: These are fixed for this T3 Turbo monorepo. -->

| Layer   | Path |
| ------- | ---- |
| Engine  | `packages/engine/src/` |
| API     | `packages/api/src/router/` |
| DB      | `packages/db/src/schema/` |
| UI      | `apps/nextjs/src/app/` |
| Tests   | `packages/engine/src/__tests__/` |
| Shared Types | `packages/engine/src/[feature]/types.ts` |

---

## Phase 1 — Setup (Shared Infrastructure)

<!-- SPECKIT: Tasks that create the scaffolding needed by all later
     phases. No user-facing functionality. -->

- [ ] `[TASK-001] [P0] [INFRA]` Create feature directory structure
  - `packages/engine/src/[feature]/`
  - `packages/engine/src/__tests__/[feature].test.ts`
  - `packages/db/src/schema/[feature].ts` _(if DB involved)_
  - `packages/api/src/router/[feature].ts` _(if API involved)_
  - `apps/nextjs/src/app/(dashboard)/[feature]/page.tsx` _(if UI involved)_

- [ ] `[TASK-002] [P0] [INFRA]` Add shared TypeScript types from contracts
  - Copy types from `specs/###-feature/contracts/[feature].types.ts`
    into `packages/engine/src/[feature]/types.ts`
  - Export from `packages/engine/src/[feature]/index.ts`

---

## Phase 2 — Foundational (Blocking Prerequisites)

<!-- SPECKIT: Tasks that must complete before any user story can start.
     Typically: DB schema, core engine functions, base API router. -->

- [ ] `[TASK-010] [P0] [INFRA]` Implement Drizzle schema
  - File: `packages/db/src/schema/[feature].ts`
  - Add table exports to `packages/db/src/schema/index.ts`
  - Run `pnpm db:generate` to create migration

- [ ] `[TASK-011] [P0] [INFRA]` Scaffold tRPC router
  - File: `packages/api/src/router/[feature].ts`
  - Register router in `packages/api/src/router/index.ts`
  - Implement query/mutation stubs from contracts

- [ ] `[TASK-012] [P0] [INFRA]` Write base engine module
  - File: `packages/engine/src/[feature]/[feature].ts`
  - Export public API from `packages/engine/src/[feature]/index.ts`

---

## Phase 3 — User Story: [US-001 Title]

<!-- SPECKIT: One phase per user story, in priority order.
     Within each phase, tasks follow this order:
       1. Tests (optional — write first if TDD)
       2. Engine formulas / business logic
       3. DB schema additions (if any)
       4. API router procedures
       5. UI page / components
-->

- [ ] `[TASK-020] [P0] [US-001]` Write Vitest tests for [formula/logic]
  - File: `packages/engine/src/__tests__/[feature].test.ts`
  - Cover: happy path, edge cases from spec Section 5

- [ ] `[TASK-021] [P0] [US-001]` Implement [engine formula/logic]
  - File: `packages/engine/src/[feature]/[feature].ts`
  - Must pass TASK-020 tests

- [ ] `[TASK-022] [P0] [US-001]` Add tRPC procedure for [operation]
  - File: `packages/api/src/router/[feature].ts`
  - Input/output types from contracts

- [ ] `[TASK-023] [P0] [US-001]` Build UI page for [feature view]
  - File: `apps/nextjs/src/app/(dashboard)/[feature]/page.tsx`
  - Components: `apps/nextjs/src/app/(dashboard)/[feature]/_components/`
  - Wire to tRPC query from TASK-022

---

## Phase 4 — User Story: [US-002 Title]

- [ ] `[TASK-030] [P1] [US-002]` [Description]
  - File: [path]

- [ ] `[TASK-031] [P1] [US-002]` [Description]
  - File: [path]

---

## Phase 5 — User Story: [US-003 Title]

- [ ] `[TASK-040] [P2] [US-003]` [Description]
  - File: [path]

---

## Final Phase — Polish & Cross-Cutting

<!-- SPECKIT: Cleanup, documentation, and integration testing. -->

- [ ] `[TASK-090] [P1] [INFRA]` Add loading & error states to all UI pages
- [ ] `[TASK-091] [P1] [INFRA]` Verify mobile responsiveness
- [ ] `[TASK-092] [P1] [INFRA]` Update README / feature docs
- [ ] `[TASK-093] [P0] [INFRA]` Run full test suite: `pnpm test`
- [ ] `[TASK-094] [P0] [INFRA]` Run lint: `pnpm lint`
- [ ] `[TASK-095] [P0] [INFRA]` Run type check: `pnpm typecheck`

---

## Dependencies

<!-- SPECKIT: Show which tasks block other tasks.
     Format: TASK-### → TASK-### (reason) -->

```
TASK-001 → TASK-010, TASK-011, TASK-012  (scaffolding required first)
TASK-002 → TASK-012  (types needed by engine)
TASK-010 → TASK-022  (schema needed before API procedures)
TASK-012 → TASK-021  (base module needed before formulas)
TASK-020 → TASK-021  (TDD: tests before implementation)
TASK-021 → TASK-022  (engine logic needed before API)
TASK-022 → TASK-023  (API needed before UI wiring)
```

---

## Implementation Strategy

<!-- SPECKIT: This section stays as-is. It guides the coding agent. -->

1. **MVP first** — Implement P0 tasks end-to-end before starting P1.
   A working vertical slice (engine → API → UI) is more valuable than
   completing all engine work before touching the API.

2. **Test early** — Write Vitest tests before or alongside engine logic.
   Tests for DB and API layers can come in the Polish phase.

3. **Small commits** — One task per commit where practical. Use the
   task ID in the commit message:
   ```
   feat(engine): implement training load calculation [TASK-021]
   ```

4. **Verify continuously** — After each phase, run:
   ```bash
   pnpm test && pnpm lint && pnpm typecheck
   ```
