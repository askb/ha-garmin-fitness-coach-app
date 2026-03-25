---
description: Convert existing tasks.md into GitHub Issues for project tracking.
tools: ['github/github-mcp-server/issue_write']
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

2. From the executed script, extract the path to **tasks.md**.

3. Get the Git remote by running:

   ```bash
   git config --get remote.origin.url
   ```

   **ONLY PROCEED TO NEXT STEPS IF THE REMOTE IS A GITHUB URL**

   Parse the remote URL to extract owner and repo:
   - HTTPS format: `https://github.com/<owner>/<repo>.git` -> owner, repo
   - SSH format: `git@github.com:<owner>/<repo>.git` -> owner, repo
   - If the remote is not a GitHub URL, STOP and report: "Remote URL is not a GitHub repository. Cannot create issues."

4. Load tasks.md and parse all uncompleted tasks:
   - Tasks matching `- [ ]` (unchecked checkboxes)
   - Extract: TaskID, priority [P?], user story [US?], description, file path
   - Skip tasks already marked as `- [X]` or `- [x]` (completed)

5. Load supplementary context for issue bodies:
   - Read spec.md for user story context and acceptance criteria
   - Read plan.md for technical architecture context
   - Read data-model.md (if exists) for entity references

6. For each uncompleted task, create a GitHub Issue with:

   **Title**: `[TaskID] Description` (e.g., `[T005] Create VDOT calculator in packages/engine/src/vdot.ts`)

   **Body** (structured markdown):

   ```markdown
   ## Task Details

   **Task ID**: T005
   **Phase**: Phase 3 -- User Story 1
   **User Story**: US1 -- [Story title from spec]
   **Priority**: P1
   **Parallelizable**: Yes/No

   ## Description

   [Full task description with context from spec/plan]

   ## File Path

   `packages/engine/src/vdot.ts`

   ## Acceptance Criteria

   [Derived from spec.md user story acceptance criteria]

   ## Technical Context

   [Relevant architecture notes from plan.md]

   ## Dependencies

   - Depends on: [TaskIDs that must complete first]
   - Blocks: [TaskIDs that depend on this]
   ```

   **Labels** (create if they do not exist):
   - Phase label: `phase:setup`, `phase:foundational`, `phase:us1`, `phase:us2`, ..., `phase:polish`
   - Priority label: `priority:p1`, `priority:p2`, `priority:p3` (if priority specified)
   - Package label: `pkg:engine`, `pkg:api`, `pkg:db`, `pkg:ui`, `pkg:auth`, `pkg:garmin`, `pkg:validators`, `app:nextjs` (based on file path)
   - Parallel marker: `parallel` (if task has [P] marker)
   - Type label: `speckit:task`

7. **UNDER NO CIRCUMSTANCES EVER CREATE ISSUES IN REPOSITORIES THAT DO NOT MATCH THE REMOTE URL**

8. After creating all issues, report:
   - Total issues created
   - Issues per phase
   - Issues per package
   - List of created issues with numbers and links
   - Any tasks that were skipped (already completed) with count
   - Suggested project board columns matching phases
