---
description: Create or update the project constitution with version tracking and sync impact reports.
handoffs:
  - label: Build Specification
    agent: speckit.specify
    prompt: Implement the feature specification based on the updated constitution. I want to build...
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

You are updating the project constitution at `.specify/memory/constitution.md`. This file defines the non-negotiable principles and governance rules for the GarminCoach sport scientist application. Your job is to (a) collect/derive concrete values, (b) apply changes precisely, and (c) propagate any amendments across dependent artifacts.

Follow this execution flow:

1. Load the existing constitution at `.specify/memory/constitution.md`.
   - Identify the current version, ratification date, and all existing principles.
   - Parse the structure: principles, governance section, technology stack references.
   **IMPORTANT**: The user might require adding, removing, or modifying principles. Respect the requested scope of change.

2. Collect/derive values for changes:
   - If user input (conversation) supplies a value, use it.
   - Otherwise infer from existing repo context (README, docs, prior constitution versions if embedded).
   - For governance dates: `RATIFICATION_DATE` is the original adoption date (preserve from existing), `LAST_AMENDED_DATE` is today if changes are made.
   - `CONSTITUTION_VERSION` must increment according to semantic versioning rules:
     - MAJOR: Backward incompatible governance/principle removals or redefinitions
     - MINOR: New principle/section added or materially expanded guidance
     - PATCH: Clarifications, wording, typo fixes, non-semantic refinements
   - If version bump type ambiguous, propose reasoning before finalizing.

3. Draft the updated constitution content:
   - Apply the requested changes (add/remove/modify principles)
   - Preserve heading hierarchy and overall document structure
   - Ensure each Principle section: succinct name line, paragraph (or bullet list) capturing non-negotiable rules, explicit rationale if not obvious
   - Ensure Governance section lists amendment procedure, versioning policy, and compliance review expectations
   - Maintain alignment with the T3 Turbo monorepo technology stack:
     - Node.js 22, pnpm 10.x, Turborepo
     - Next.js 16, tRPC v11, Drizzle ORM, PostgreSQL
     - Better-Auth, Tailwind CSS v4, shadcn/ui, Recharts
     - Ollama/OpenAI, Vitest, Zod v4
     - `@acme/*` package namespace

4. Consistency propagation checklist (convert prior checklist into active validations):
   - Read `.specify/templates/plan-template.md` (if exists) and ensure any "Constitution Check" or rules align with updated principles
   - Read `.specify/templates/spec-template.md` (if exists) for scope/requirements alignment -- update if constitution adds/removes mandatory sections or constraints
   - Read `.specify/templates/tasks-template.md` (if exists) and ensure task categorization reflects new or removed principle-driven task types
   - Read any runtime guidance docs (e.g., `README.md`, `.github/copilot-instructions.md`). Update references to principles changed.

5. Produce a Sync Impact Report (prepend as an HTML comment at top of the constitution file after update):
   - Version change: old -> new
   - List of modified principles (old title -> new title if renamed)
   - Added sections
   - Removed sections
   - Templates requiring updates (updated / pending) with file paths
   - Follow-up TODOs if any items intentionally deferred

6. Validation before final output:
   - No remaining unexplained bracket tokens or placeholder markers
   - Version line matches report
   - Dates ISO format YYYY-MM-DD
   - Principles are declarative, testable, and free of vague language ("should" -> replace with MUST/SHOULD rationale where appropriate)
   - Engine purity principle preserved (zero external deps in `@acme/engine`)
   - Citation requirement preserved for sport science formulas
   - Zod v4 import convention documented (`from "zod/v4"`)

7. Write the completed constitution back to `.specify/memory/constitution.md` (overwrite).

8. Output a final summary to the user with:
   - New version and bump rationale
   - Any files flagged for manual follow-up
   - Suggested commit message (e.g., `docs: amend constitution to vX.Y.Z (principle additions + governance update)`)

Formatting & Style Requirements:

- Use Markdown headings exactly as in the existing structure (do not demote/promote levels)
- Wrap long rationale lines to keep readability (<100 chars ideally) but do not hard enforce with awkward breaks
- Keep a single blank line between sections
- Avoid trailing whitespace

If the user supplies partial updates (e.g., only one principle revision), still perform validation and version decision steps.

If critical info missing (e.g., ratification date truly unknown), insert `TODO(<FIELD_NAME>): explanation` and include in the Sync Impact Report under deferred items.

Do not create a new template; always operate on the existing `.specify/memory/constitution.md` file.
