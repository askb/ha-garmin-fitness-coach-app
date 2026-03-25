---
description: Generate an actionable, dependency-ordered tasks.md for the feature based on available design artifacts.
handoffs:
  - label: Analyze For Consistency
    agent: speckit.analyze
    prompt: Run a project analysis for consistency
    send: true
  - label: Implement Project
    agent: speckit.implement
    prompt: Start the implementation in phases
    send: true
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

1. **Setup**: Run `.specify/scripts/bash/check-prerequisites.sh --json` from repo root and parse FEATURE_DIR and AVAILABLE_DOCS list. All paths must be absolute. For single quotes in args, use escape syntax: e.g `'I'\''m Groot'` (or double-quote if possible: `"I'm Groot"`).

2. **Load design documents**: Read from FEATURE_DIR:
   - **Required**: plan.md (tech stack, libraries, structure), spec.md (user stories with priorities)
   - **Optional**: data-model.md (entities), contracts/ (API endpoints), research.md (decisions), quickstart.md (test scenarios)
   - Note: Not all projects have all documents. Generate tasks based on what's available.

3. **Execute task generation workflow**:
   - Load plan.md and extract tech stack, libraries, project structure
   - Load spec.md and extract user stories with their priorities (P1, P2, P3, etc.)
   - If data-model.md exists: Extract entities and map to user stories
   - If contracts/ exists: Map tRPC procedures to user stories
   - If research.md exists: Extract decisions for setup tasks
   - Generate tasks organized by user story (see Task Generation Rules below)
   - Generate dependency graph showing user story completion order
   - Create parallel execution examples per user story
   - Validate task completeness (each user story has all needed tasks, independently testable)

4. **Generate tasks.md**: Use `.specify/templates/tasks-template.md` as structure (if available), fill with:
   - Correct feature name from plan.md
   - Phase 1: Setup tasks (project initialization)
   - Phase 2: Foundational tasks (blocking prerequisites for all user stories)
   - Phase 3+: One phase per user story (in priority order from spec.md)
   - Each phase includes: story goal, independent test criteria, tests (if requested), implementation tasks
   - Final Phase: Polish & cross-cutting concerns
   - All tasks must follow the strict checklist format (see Task Generation Rules below)
   - Clear file paths for each task
   - Dependencies section showing story completion order
   - Parallel execution examples per story
   - Implementation strategy section (MVP first, incremental delivery)

5. **Report**: Output path to generated tasks.md and summary:
   - Total task count
   - Task count per user story
   - Parallel opportunities identified
   - Independent test criteria for each story
   - Suggested MVP scope (typically just User Story 1)
   - Format validation: Confirm ALL tasks follow the checklist format (checkbox, ID, labels, file paths)

Context for task generation: $ARGUMENTS

The tasks.md should be immediately executable — each task must be specific enough that an LLM can complete it without additional context.

## Task Generation Rules

**CRITICAL**: Tasks MUST be organized by user story to enable independent implementation and testing.

**Tests are OPTIONAL**: Only generate test tasks if explicitly requested in the feature specification or if user requests TDD approach.

### Checklist Format (REQUIRED)

Every task MUST strictly follow this format:

```text
- [ ] [TaskID] [P?] [Story?] Description with file path
```

**Format Components**:

1. **Checkbox**: ALWAYS start with `- [ ]` (markdown checkbox)
2. **Task ID**: Sequential number (T001, T002, T003...) in execution order
3. **[P] marker**: Include ONLY if task is parallelizable (different files, no dependencies on incomplete tasks)
4. **[Story] label**: REQUIRED for user story phase tasks only
   - Format: [US1], [US2], [US3], etc. (maps to user stories from spec.md)
   - Setup phase: NO story label
   - Foundational phase: NO story label
   - User Story phases: MUST have story label
   - Polish phase: NO story label
5. **Description**: Clear action with exact file path

**Examples**:

- ✅ CORRECT: `- [ ] T001 Create project structure per implementation plan`
- ✅ CORRECT: `- [ ] T005 [P] Add Drizzle schema for workouts in packages/db/src/schema/workouts.ts`
- ✅ CORRECT: `- [ ] T012 [P] [US1] Create VDOT calculator in packages/engine/src/vdot.ts`
- ✅ CORRECT: `- [ ] T014 [US1] Add tRPC router for VDOT in packages/api/src/router/vdot.ts`
- ❌ WRONG: `- [ ] Create User model` (missing ID and Story label)

### Monorepo Package Ordering

Within each user story, order tasks by package dependency flow:

1. **Tests** (if TDD requested) → Write tests first
2. **`@acme/engine`** → Pure calculation functions (no external deps)
3. **`@acme/validators`** → Zod v4 schemas shared across packages
4. **`@acme/db`** → Drizzle schema and queries
5. **`@acme/garmin`** → Garmin Connect API integration (if relevant)
6. **`@acme/api`** → tRPC routers connecting engine + db
7. **`@acme/auth`** → Authentication middleware (if relevant)
8. **`@acme/ui`** → Shared React components
9. **`apps/nextjs`** → Pages, layouts, client components

This ordering ensures each package's dependencies are available when it's implemented.

### Phase Structure

```text
## Phase 1: Setup
- [ ] T001 Install/configure new dependencies
- [ ] T002 [P] Create directory structure for new feature

## Phase 2: Foundational
- [ ] T003 Add shared Zod schemas in packages/validators/src/...
- [ ] T004 [P] Add Drizzle schema in packages/db/src/schema/...

## Phase 3: User Story 1 — [Story Title]
Goal: [What user can do after this phase]
Test Criteria: [How to verify independently]
- [ ] T005 [US1] Create engine function in packages/engine/src/...
- [ ] T006 [P] [US1] Add tRPC router in packages/api/src/router/...
- [ ] T007 [US1] Create page component in apps/nextjs/src/app/...

## Phase 4: User Story 2 — [Story Title]
...

## Final Phase: Polish
- [ ] T020 Run pnpm turbo typecheck and fix errors
- [ ] T021 [P] Update README with new feature documentation
- [ ] T022 Run pnpm --filter @acme/engine test and verify coverage
```

### Engine Task Requirements

Tasks touching `@acme/engine` MUST:
- Reference peer-reviewed sport science citations (e.g., Daniels' Running Formula)
- Ensure functions are pure (no side effects, no I/O, no external deps)
- Include formula validation against published values
- Specify expected test coverage targets

### Validation Checks

After generating tasks.md, validate:
- [ ] Every user story from spec.md has at least one task
- [ ] Every task has a valid TaskID (T001 format)
- [ ] Package ordering is respected within each phase
- [ ] Engine tasks reference citations
- [ ] Parallel markers [P] are only on truly independent tasks
- [ ] File paths use monorepo package structure (packages/*, apps/*)
- [ ] Final phase includes typecheck and test verification
