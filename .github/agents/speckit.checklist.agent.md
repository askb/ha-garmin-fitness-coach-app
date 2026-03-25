---
description: Generate custom checklists for requirements quality validation.
---
<!--
SPDX-FileCopyrightText: 2026 Anil Belur <askb23@gmail.com>
SPDX-License-Identifier: Apache-2.0
-->

## Checklist Purpose: "Unit Tests for English"

**CRITICAL CONCEPT**: Checklists are **UNIT TESTS FOR REQUIREMENTS WRITING** — they validate the quality, clarity, and completeness of requirements in a given domain.

**NOT for verification/testing**:

- ❌ NOT "Verify the button clicks correctly"
- ❌ NOT "Test error handling works"
- ❌ NOT "Confirm the API returns 200"
- ❌ NOT checking if code/implementation matches the spec

**FOR requirements quality validation**:

- ✅ "Are visual hierarchy requirements defined for all card types?" (completeness)
- ✅ "Is 'prominent display' quantified with specific sizing/positioning?" (clarity)
- ✅ "Are hover state requirements consistent across all interactive elements?" (consistency)
- ✅ "Are accessibility requirements defined for keyboard navigation?" (coverage)
- ✅ "Does the spec define what happens when Garmin sync fails mid-transfer?" (edge cases)

**Metaphor**: If your spec is code written in English, the checklist is its unit test suite. You're testing whether the requirements are well-written, complete, unambiguous, and ready for implementation — NOT whether the implementation works.

## User Input

```text
$ARGUMENTS
```

You **MUST** consider the user input before proceeding (if not empty).

## Execution Steps

1. **Setup**: Run `.specify/scripts/bash/check-prerequisites.sh --json` from repo root and parse JSON for FEATURE_DIR and AVAILABLE_DOCS list.
   - All file paths must be absolute.
   - For single quotes in args, use escape syntax: e.g `'I'\''m Groot'` (or double-quote if possible: `"I'm Groot"`).

2. **Clarify intent (dynamic)**: Derive up to THREE initial contextual clarifying questions (no pre-baked catalog). They MUST:
   - Be generated from the user's phrasing + extracted signals from spec/plan/tasks
   - Only ask about information that materially changes checklist content
   - Be skipped individually if already unambiguous in `$ARGUMENTS`
   - Prefer precision over breadth

   Generation algorithm:
   1. Extract signals: feature domain keywords (e.g., VDOT, HR zones, training load, Garmin sync), risk indicators, stakeholder hints, and explicit deliverables
   2. Cluster signals into candidate focus areas (max 4) ranked by relevance
   3. Identify probable audience & timing (author, reviewer, QA, release) if not explicit
   4. Detect missing dimensions: scope breadth, depth/rigor, risk emphasis, exclusion boundaries, measurable acceptance criteria
   5. Formulate questions chosen from these archetypes:
      - Scope refinement
      - Risk prioritization
      - Depth calibration
      - Audience framing
      - Boundary exclusion
      - Scenario class gap

   Question formatting rules:
   - If presenting options, generate a compact table with columns: Option | Candidate | Why It Matters
   - Limit to A–E options maximum; omit table if a free-form answer is clearer
   - Never ask the user to restate what they already said

   Defaults when interaction impossible:
   - Depth: Standard
   - Audience: Reviewer (PR) if code-related; Author otherwise
   - Focus: Top 2 relevance clusters

   Output the questions (label Q1/Q2/Q3). After answers: if ≥2 scenario classes remain unclear, you MAY ask up to TWO more targeted follow-ups (Q4/Q5). Do not exceed five total questions.

3. **Understand user request**: Combine `$ARGUMENTS` + clarifying answers:
   - Derive checklist theme (e.g., engine-formulas, ux, api, security, garmin-integration)
   - Consolidate explicit must-have items mentioned by user
   - Map focus selections to category scaffolding
   - Infer any missing context from spec/plan/tasks (do NOT hallucinate)

4. **Load feature context**: Read from FEATURE_DIR:
   - spec.md: Feature requirements and scope
   - plan.md (if exists): Technical details, dependencies
   - tasks.md (if exists): Implementation tasks

   **Context Loading Strategy**:
   - Load only necessary portions relevant to active focus areas
   - Prefer summarizing long sections into concise scenario/requirement bullets
   - Use progressive disclosure: add follow-on retrieval only if gaps detected

5. **Generate checklist** — Create "Unit Tests for Requirements":
   - Create `FEATURE_DIR/checklists/` directory if it doesn't exist
   - Generate unique checklist filename:
     - Use short, descriptive name based on domain (e.g., `ux.md`, `api.md`, `security.md`, `engine-formulas.md`)
     - Format: `[domain].md`
     - If file exists, append to existing file
   - Number items sequentially starting from CHK001
   - Each `/speckit.checklist` run creates a NEW file (never overwrites existing checklists)

   **CORE PRINCIPLE — Test the Requirements, Not the Implementation**:
   Every checklist item MUST evaluate the REQUIREMENTS THEMSELVES for:
   - **Completeness**: Are all necessary requirements present?
   - **Clarity**: Are requirements unambiguous and specific?
   - **Consistency**: Do requirements align with each other?
   - **Measurability**: Can requirements be objectively verified?
   - **Coverage**: Are all scenarios/edge cases addressed?

   **Category Structure** — Group items by requirement quality dimensions:
   - **Requirement Completeness** (Are all necessary requirements documented?)
   - **Requirement Clarity** (Are requirements specific and unambiguous?)
   - **Requirement Consistency** (Do requirements align without conflicts?)
   - **Acceptance Criteria Quality** (Are success criteria measurable?)
   - **Scenario Coverage** (Are all flows/cases addressed?)
   - **Edge Case Coverage** (Are boundary conditions defined?)
   - **Non-Functional Requirements** (Performance, Security, Accessibility — are they specified?)
   - **Dependencies & Assumptions** (Are they documented and validated?)
   - **Ambiguities & Conflicts** (What needs clarification?)

   **Engine-Specific Checks** (for `@acme/engine` related checklists):
   - Are sport science citations provided for all formulas? [Citation]
   - Are formula validation values specified against published research? [Validation]
   - Is the expected precision/rounding behavior documented? [Clarity]
   - Are input domain constraints defined (e.g., HR > 0, VDOT range)? [Completeness]
   - Are edge cases defined for physiological extremes? [Edge Case]

   **ITEM STRUCTURE**:
   Each item should follow this pattern:
   - Question format asking about requirement quality
   - Focus on what's WRITTEN (or not written) in the spec/plan
   - Include quality dimension in brackets [Completeness/Clarity/Consistency/etc.]
   - Reference spec section `[Spec §X.Y]` when checking existing requirements
   - Use `[Gap]` marker when checking for missing requirements

   **Content Consolidation**:
   - Soft cap: If raw candidate items > 40, prioritize by risk/impact
   - Merge near-duplicates checking the same requirement aspect
   - If >5 low-impact edge cases, create one consolidated item

   **🚫 ABSOLUTELY PROHIBITED** — These make it an implementation test, not a requirements test:
   - ❌ Any item starting with "Verify", "Test", "Confirm", "Check" + implementation behavior
   - ❌ References to code execution, user actions, system behavior
   - ❌ "Displays correctly", "works properly", "functions as expected"
   - ❌ "Click", "navigate", "render", "load", "execute"

   **✅ REQUIRED PATTERNS** — These test requirements quality:
   - ✅ "Are [requirement type] defined/specified/documented for [scenario]?"
   - ✅ "Is [vague term] quantified/clarified with specific criteria?"
   - ✅ "Are requirements consistent between [section A] and [section B]?"
   - ✅ "Can [requirement] be objectively measured/verified?"
   - ✅ "Are [edge cases/scenarios] addressed in requirements?"
   - ✅ "Does the spec define [missing aspect]?"

6. **Structure Reference**: Generate the checklist following the canonical template in `.specify/templates/checklist-template.md` for title, meta section, category headings, and ID formatting. If template is unavailable, use: H1 title, purpose/created meta lines, `##` category sections containing `- [ ] CHK### <requirement item>` lines with globally incrementing IDs starting at CHK001.

7. **Report**: Output full path to created checklist, item count, and remind user that each run creates a new file. Summarize:
   - Focus areas selected
   - Depth level
   - Actor/timing
   - Any explicit user-specified must-have items incorporated

**Important**: Each `/speckit.checklist` command invocation creates a checklist file using short, descriptive names unless file already exists. This allows multiple checklists of different types (e.g., `ux.md`, `engine-formulas.md`, `security.md`).

## Example Checklist Types & Sample Items

**Engine Formula Requirements Quality:** `engine-formulas.md`

Sample items:
- "Are peer-reviewed citations provided for all VDOT formulas? [Citation, Gap]"
- "Is the precision of pace calculations specified (seconds vs. minutes)? [Clarity]"
- "Are input validation ranges defined for heart rate values? [Completeness]"
- "Are formula outputs validated against published tables (Daniels)? [Validation]"
- "Are edge cases defined for extreme VDOT values (30-85 range)? [Edge Case]"

**Garmin Integration Requirements Quality:** `garmin-integration.md`

Sample items:
- "Are Garmin API rate limiting requirements specified? [Completeness, Gap]"
- "Are retry/backoff requirements defined for API failures? [Coverage]"
- "Are data mapping requirements specified for FIT file fields? [Clarity]"
- "Is the sync conflict resolution strategy documented? [Gap]"

**UX Requirements Quality:** `ux.md`

Sample items:
- "Are dashboard loading time requirements quantified (<3s LCP)? [Clarity, Spec §NFR]"
- "Are empty state requirements defined for new users with no data? [Coverage, Gap]"
- "Are mobile responsive requirements specified for all views? [Completeness]"
- "Are accessibility requirements defined for chart components? [Gap]"
