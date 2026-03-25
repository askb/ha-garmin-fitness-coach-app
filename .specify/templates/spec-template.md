<!--
SPDX-FileCopyrightText: 2026 Anil Belur <askb23@gmail.com>
SPDX-License-Identifier: Apache-2.0
-->

# Feature Specification: [Feature Name]

<!-- SPECKIT INSTRUCTIONS:
     This template captures WHAT users need and WHY.
     Avoid HOW to implement — that belongs in the plan.
     The speckit.spec agent fills in bracketed placeholders.
     Instructional HTML comments like this one should be removed
     from the final spec.
-->

| Field   | Value |
| ------- | ----- |
| Feature | [Feature Name] |
| Branch  | `feature/###-short-name` |
| Date    | YYYY-MM-DD |
| Author  | [Author] |
| Status  | Draft &#124; In Review &#124; Approved |

---

## 1. User Scenarios & Testing

<!-- SPECKIT: List user stories in priority order (P0 → P2).
     Each story must have concrete acceptance criteria that can be
     turned into test cases. Focus on observable user outcomes. -->

### P0 — Must Have

**US-001: [As a user, I want … so that …]**

- **Given** [precondition]
- **When** [action]
- **Then** [observable outcome]
- **Acceptance Criteria:**
  - [ ] [Measurable criterion 1]
  - [ ] [Measurable criterion 2]

### P1 — Should Have

**US-002: [As a user, I want … so that …]**

- **Given** [precondition]
- **When** [action]
- **Then** [observable outcome]
- **Acceptance Criteria:**
  - [ ] [Measurable criterion 1]

### P2 — Nice to Have

**US-003: [As a user, I want … so that …]**

- **Given** [precondition]
- **When** [action]
- **Then** [observable outcome]
- **Acceptance Criteria:**
  - [ ] [Measurable criterion 1]

---

## 2. Functional Requirements

<!-- SPECKIT: Each requirement must be testable and traceable to a
     user story. Use REQ-### IDs so tasks can reference them. -->

| ID      | Requirement | User Story | Testable? |
| ------- | ----------- | ---------- | --------- |
| REQ-001 | [Description of a verifiable requirement] | US-001 | ✅ |
| REQ-002 | [Description of a verifiable requirement] | US-001 | ✅ |
| REQ-003 | [Description of a verifiable requirement] | US-002 | ✅ |

---

## 3. Key Entities

<!-- SPECKIT: Only include this section when the feature involves
     persisted or structured data. Describe entities at a conceptual
     level — schema details go in data-model.md during planning. -->

| Entity | Description | Key Attributes |
| ------ | ----------- | -------------- |
| [EntityName] | [What it represents] | [attr1, attr2, attr3] |

---

## 4. Success Criteria

<!-- SPECKIT: Technology-agnostic, measurable outcomes.
     These are used to determine if the feature is "done". -->

- [ ] [Measurable outcome 1 — e.g., "User can view weekly training load"]
- [ ] [Measurable outcome 2 — e.g., "System calculates zones within 2s"]
- [ ] [Measurable outcome 3]

---

## 5. Edge Cases

<!-- SPECKIT: Enumerate known edge cases and the expected behaviour.
     These feed directly into test case generation. -->

| # | Scenario | Expected Behaviour |
| - | -------- | ------------------ |
| 1 | [Edge case description] | [What should happen] |
| 2 | [Edge case description] | [What should happen] |
| 3 | [Edge case description] | [What should happen] |

---

## 6. Sport Science References

<!-- SPECKIT: Cite any academic papers, training models, or domain
     standards that inform this feature. Remove this section if none
     apply. -->

- [Author(s), "Title", Journal/Conference, Year. DOI/URL]
- [Author(s), "Title", Journal/Conference, Year. DOI/URL]

---

## 7. Assumptions

<!-- SPECKIT: List assumptions that, if wrong, would invalidate the
     spec. Review these during planning. -->

- [Assumption 1 — e.g., "Garmin Connect API provides daily HRV data"]
- [Assumption 2 — e.g., "Users have a Garmin device paired to the app"]
- [Assumption 3]
