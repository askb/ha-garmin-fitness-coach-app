<!--
SPDX-FileCopyrightText: 2026 Anil Belur <askb23@gmail.com>
SPDX-License-Identifier: Apache-2.0
-->

# Evals

Behavioral evaluations for the PulseCoach web app, complementing the
per-package unit tests (`pnpm test`) with scenario-level checks.

- [`coaching-scenarios.md`](coaching-scenarios.md) — canonical input →
  expected-behavior scenarios for the AI coach chat and readiness
  surfaces. Used to spot-check regressions after prompt, model, or
  threshold changes, and as ground truth when writing automated evals.

## Philosophy

Unit tests pin exact outputs; evals pin **behavioral invariants** that
must hold across refactors:

- The coach never recommends high-intensity work when readiness signals
  are critically low.
- Recommendations always carry a rationale a user can act on.
- Missing Garmin data degrades conservatively, never aggressively.

## Running

Scenario checks that require the AI coach need `OPENAI_API_KEY` set
locally (see `.env.example`). Deterministic scenarios can be verified
against the bundled coaching logic in the companion addon repo:
`ha-garmin-fitness-coach-addon/evals/smoke_eval.py`.
