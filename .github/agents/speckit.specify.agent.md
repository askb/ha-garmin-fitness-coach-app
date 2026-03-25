---
description: Create or update the feature specification from a natural language feature description.
handoffs:
  - label: Build Technical Plan
    agent: speckit.plan
    prompt: Create a plan for the spec. I am building with...
  - label: Clarify Spec Requirements
    agent: speckit.clarify
    prompt: Clarify specification requirements
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

The text the user typed after `/speckit.specify` in the triggering message **is** the feature description. Assume you always have it available in this conversation even if `$ARGUMENTS` appears literally below. Do not ask the user to repeat it unless they provided an empty command.

Given that feature description, do this:

1. **Generate a concise short name** (2-4 words) for the branch:
   - Analyze the feature description and extract the most meaningful keywords
   - Create a 2-4 word short name that captures the essence of the feature
   - Use action-noun format when possible (e.g., "add-user-auth", "fix-payment-bug")
   - Preserve technical terms and acronyms (VDOT, HR, VO2max, tRPC, etc.)
   - Keep it concise but descriptive enough to understand the feature at a glance
   - Examples:
     - "I want to add Garmin workout sync" → "garmin-workout-sync"
     - "Implement VDOT calculation engine" → "vdot-calculation-engine"
     - "Create a training plan dashboard" → "training-plan-dashboard"
     - "Fix heart rate zone computation" → "fix-hr-zone-computation"

2. **Check for existing branches before creating new one**:

   a. First, fetch all remote branches to ensure we have the latest information:
      ```bash
      git fetch --all --prune
      ```

   b. Find the highest feature number across all sources for the short-name:
      - Remote branches: `git ls-remote --heads origin | grep -E 'refs/heads/[0-9]+-<short-name>$'`
      - Local branches: `git branch | grep -E '^[* ]*[0-9]+-<short-name>$'`
      - Specs directories: Check for directories matching `specs/[0-9]+-<short-name>`

   c. Determine the next available number:
      - Extract all numbers from all three sources
      - Find the highest number N
      - Use N+1 for the new branch number

   d. Run the script `.specify/scripts/bash/create-new-feature.sh --json "$ARGUMENTS"` with the calculated number and short-name:
      - Pass `--number N+1` and `--short-name "your-short-name"` along with the feature description
      - Example: `.specify/scripts/bash/create-new-feature.sh --json --number 5 --short-name "garmin-workout-sync" "Add Garmin workout sync"`

   **IMPORTANT**:
   - Check all three sources (remote branches, local branches, specs directories) to find the highest number
   - Only match branches/directories with the exact short-name pattern
   - If no existing branches/directories found with this short-name, start with number 1
   - You must only ever run this script once per feature
   - The JSON output will contain BRANCH_NAME and SPEC_FILE paths
   - For single quotes in args, use escape syntax: e.g `'I'\''m Groot'` (or double-quote if possible: `"I'm Groot"`)

3. Load `.specify/templates/spec-template.md` to understand required sections.

4. Follow this execution flow:

   1. Parse user description from Input
      If empty: ERROR "No feature description provided"
   2. Extract key concepts from description
      Identify: actors, actions, data, constraints
   3. For unclear aspects:
      - Make informed guesses based on context and industry standards
      - Only mark with [NEEDS CLARIFICATION: specific question] if:
        - The choice significantly impacts feature scope or user experience
        - Multiple reasonable interpretations exist with different implications
        - No reasonable default exists
      - **LIMIT: Maximum 3 [NEEDS CLARIFICATION] markers total**
      - Prioritize clarifications by impact: scope > security/privacy > user experience > technical details
   4. Fill User Scenarios & Testing section
      If no clear user flow: ERROR "Cannot determine user scenarios"
   5. Generate Functional Requirements
      Each requirement must be testable
      Use reasonable defaults for unspecified details (document assumptions in Assumptions section)
   6. Define Success Criteria
      Create measurable, technology-agnostic outcomes
      Include both quantitative metrics (time, performance, volume) and qualitative measures (user satisfaction, task completion)
      Each criterion must be verifiable without implementation details
   7. Identify Key Entities (if data involved)
   8. Return: SUCCESS (spec ready for planning)

5. Write the specification to SPEC_FILE using the template structure, replacing placeholders with concrete details derived from the feature description (arguments) while preserving section order and headings.

6. **Specification Quality Validation**: After writing the initial spec, validate it against quality criteria:

   Create a requirements quality checklist at `FEATURE_DIR/checklists/requirements.md`:

   - [ ] Every requirement has a testable acceptance criterion
   - [ ] No vague adjectives without quantification ("fast", "scalable", "intuitive")
   - [ ] All user roles/personas are identified
   - [ ] Edge cases are documented (empty states, error states, boundary values)
   - [ ] Success criteria are measurable
   - [ ] No unresolved [NEEDS CLARIFICATION] markers remain (max 3 allowed initially)
   - [ ] Key entities and their relationships are identified
   - [ ] Non-functional requirements are specified where relevant (performance, security, accessibility)

   For items that fail validation, update the spec to address them before completing.

7. **Handle [NEEDS CLARIFICATION] markers**:
   - If any [NEEDS CLARIFICATION] markers were added (max 3), log them in a summary
   - These will be resolved by the `/speckit.clarify` agent in the next phase
   - Do NOT block specification completion for clarification items

8. **Report completion**:
   - Branch name created
   - Path to spec file
   - Count of [NEEDS CLARIFICATION] markers (if any)
   - Whether the spec is ready for `/speckit.plan` or needs `/speckit.clarify` first
   - Suggest next step: `/speckit.clarify` (if markers exist) or `/speckit.plan`

## Specification Writing Guidelines

- **Focus on WHAT users need and WHY**, not HOW it will be implemented
- Written for non-technical stakeholders to understand
- Avoid framework-specific terminology (no "tRPC endpoint", "Drizzle migration")
- Use domain language: "training plan", "workout", "heart rate zone", "VDOT score"
- Requirements should be technology-agnostic — the plan phase handles technical mapping
- Think in terms of user outcomes, not system behaviors

## T3 Monorepo Context (for reference only — do NOT leak into spec)

This project is a T3 Turbo monorepo with these packages:
- `@acme/engine` — Pure TypeScript sport science calculations (zero dependencies)
- `@acme/api` — tRPC router definitions
- `@acme/db` — Drizzle ORM schema and queries
- `@acme/auth` — Better-Auth authentication
- `@acme/garmin` — Garmin Connect API integration
- `@acme/ui` — Shared React components (shadcn/ui)
- `@acme/validators` — Shared Zod v4 schemas
- `apps/nextjs` — Main Next.js 16 web application
- `apps/tanstack-start` — Secondary TanStack Start app

Use this context internally to understand domain concepts but keep the spec language non-technical.
