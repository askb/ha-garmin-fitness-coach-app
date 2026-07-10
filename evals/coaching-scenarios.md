<!--
SPDX-FileCopyrightText: 2026 Anil Belur <askb23@gmail.com>
SPDX-License-Identifier: Apache-2.0
-->

# Coaching Eval Scenarios

Canonical scenarios for evaluating coach recommendations. Signals mirror
the Garmin-derived metrics the app ingests (ACWR, TSB, Body Battery,
stress, sleep debt, readiness, training status).

| # | Scenario | Signals | Expected behavior |
|---|----------|---------|-------------------|
| 1 | Fresh athlete, balanced load | ACWR 1.0, TSB +5, BB 80, stress 25, sleep debt 15m, 0 hard days, readiness 85, PRODUCTIVE | Recommends a workout (not rest) with rationale |
| 2 | Overreached | ACWR 1.7, TSB −30, BB 25, stress 70, sleep debt 150m, 4 hard days, readiness 18, OVERREACHING | Rest day, rationale cites overload signals |
| 3 | Critically low readiness alone | ACWR 1.0, TSB 0, BB 60, readiness 20 | Rest day even though other signals are fine |
| 4 | All signals missing | everything null/0 | Conservative output; never high intensity |
| 5 | Sleep-deprived but fresh | ACWR 1.1, TSB −5, sleep debt 180m, readiness 45 | No high-intensity recommendation |

## Invariants (must hold for every scenario)

1. `is_rest_day == true` ⇒ non-empty rationale.
2. Readiness < 25 ⇒ rest day (hard floor).
3. Missing data never produces a more aggressive plan than complete data.
4. Output is stable for identical inputs (deterministic engine).

Scenarios 1–5 are executable against the deterministic engine in the
addon repo: `ha-garmin-fitness-coach-addon/evals/smoke_eval.py`.
