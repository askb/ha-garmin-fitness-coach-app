---
description: Execute the implementation plan by processing and executing all tasks defined in tasks.md.
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

1. Run `.specify/scripts/bash/check-prerequisites.sh --json --require-tasks --include-tasks` from repo root and parse FEATURE_DIR and AVAILABLE_DOCS list. All paths must be absolute. For single quotes in args, use escape syntax: e.g `'I'\''m Groot'` (or double-quote if possible: `"I'm Groot"`).

2. **Check checklists status** (if FEATURE_DIR/checklists/ exists):
   - Scan all checklist files in the checklists/ directory
   - For each checklist, count:
     - Total items: All lines matching `- [ ]` or `- [X]` or `- [x]`
     - Completed items: Lines matching `- [X]` or `- [x]`
     - Incomplete items: Lines matching `- [ ]`
   - Create a status table:

     ```text
     | Checklist | Total | Completed | Incomplete | Status |
     |-----------|-------|-----------|------------|--------|
     | ux.md     | 12    | 12        | 0          | PASS   |
     | engine-formulas.md | 8 | 5   | 3          | FAIL   |
     | security.md | 6   | 6         | 0          | PASS   |
     ```

   - Calculate overall status:
     - **PASS**: All checklists have 0 incomplete items
     - **FAIL**: One or more checklists have incomplete items

   - **If any checklist is incomplete**:
     - Display the table with incomplete item counts
     - **STOP** and ask: "Some checklists are incomplete. Do you want to proceed with implementation anyway? (yes/no)"
     - Wait for user response before continuing
     - If user says "no" or "wait" or "stop", halt execution
     - If user says "yes" or "proceed" or "continue", proceed to step 3

   - **If all checklists are complete**:
     - Display the table showing all checklists passed
     - Automatically proceed to step 3

3. Load and analyze the implementation context:
   - **REQUIRED**: Read tasks.md for the complete task list and execution plan
   - **REQUIRED**: Read plan.md for tech stack, architecture, and file structure
   - **IF EXISTS**: Read data-model.md for entities and relationships
   - **IF EXISTS**: Read contracts/ for tRPC procedure specifications and test requirements
   - **IF EXISTS**: Read research.md for technical decisions and constraints
   - **IF EXISTS**: Read quickstart.md for integration scenarios

4. **Project Setup Verification**:
   - **REQUIRED**: Create/verify ignore files based on actual project setup:

   **Detection & Creation Logic**:
   - Check if the repository is a git repo -> create/verify .gitignore
   - Check if Dockerfile* exists -> create/verify .dockerignore
   - Check if eslint.config.* exists -> ensure the config ignores entries cover required patterns
   - Check if .prettierrc* exists -> create/verify .prettierignore

   **If ignore file already exists**: Verify it contains essential patterns, append missing critical patterns only
   **If ignore file missing**: Create with full pattern set for detected technology

   **T3 Turbo Monorepo Patterns**:
   - `.gitignore`: `node_modules/`, `dist/`, `.next/`, `.turbo/`, `*.log`, `.env*`, `.drizzle/`
   - `.eslintignore` (or config ignores): `node_modules/`, `dist/`, `.next/`, `coverage/`, `*.min.js`
   - `.prettierignore`: `node_modules/`, `dist/`, `.next/`, `coverage/`, `pnpm-lock.yaml`, `.turbo/`

5. Parse tasks.md structure and extract:
   - **Task phases**: Setup, Foundational, User Story phases, Polish
   - **Task dependencies**: Sequential vs parallel execution rules
   - **Task details**: ID, description, file paths, parallel markers [P]
   - **Execution flow**: Order and dependency requirements

6. Execute implementation following the task plan:
   - **Phase-by-phase execution**: Complete each phase before moving to the next
   - **Respect dependencies**: Run sequential tasks in order, parallel tasks [P] can run together
   - **Follow TDD approach**: Execute test tasks before their corresponding implementation tasks (when tests exist)
   - **File-based coordination**: Tasks affecting the same files must run sequentially
   - **Validation checkpoints**: Verify each phase completion before proceeding

7. Implementation execution rules:
   - **Setup first**: Initialize project structure, dependencies, configuration
   - **Tests before code** (if TDD): Write tests for contracts, entities, and integration scenarios
   - **Core development**: Implement engine functions, services, tRPC routers, components
   - **Integration work**: Database connections, Garmin API integration, middleware
   - **Polish and validation**: Type checking, test coverage, documentation

8. **Monorepo-Specific Implementation Rules**:
   - **Engine purity**: `packages/engine/` functions MUST be pure TypeScript with zero external dependencies. No `import` from any `@acme/*` package, no `node:` modules, no side effects.
   - **Zod imports**: Always `import { z } from "zod/v4"` (never bare `"zod"`)
   - **Package namespace**: All internal imports use `@acme/*` namespace
   - **Drizzle schema**: New tables go in `packages/db/src/schema/` with proper relations
   - **tRPC routers**: New routers go in `packages/api/src/router/` and register in the app router
   - **Next.js pages**: Use App Router patterns in `apps/nextjs/src/app/`

9. Progress tracking and error handling:
   - Mark completed tasks as `[X]` in tasks.md after each task finishes
   - If a task fails:
     - Log the error with context
     - Check if it is a dependency issue (can skip and return later)
     - If blocking, stop and report the failure with suggested fix
   - After each phase, report progress:
     - Tasks completed / total in phase
     - Files created or modified
     - Any issues encountered

10. **Validation after each phase**:
    - Run `pnpm turbo typecheck` to verify type safety across all packages
    - Run `pnpm --filter @acme/engine test` to verify engine test suite (if engine tasks were in this phase)
    - Run `pnpm lint` to catch linting issues early
    - Fix any failures before proceeding to next phase

11. **Completion validation**:
    - All tasks marked as `[X]` in tasks.md
    - `pnpm turbo typecheck` passes with no errors
    - `pnpm --filter @acme/engine test` passes (if engine changes were made)
    - Implementation matches spec requirements
    - Sport science formulas have citation comments in code
    - Report final summary:
      - Total tasks completed
      - Files created/modified
      - Test results
      - Any outstanding issues or follow-ups
