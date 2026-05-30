// SPDX-FileCopyrightText: 2026 Anil Belur <askb23@gmail.com>
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";

import type { DecisionInput, MetricPoint } from "..";
import {
  attributeOutcomes,
  DECISION_RULE_ID,
  summarizeRuleEffectiveness,
} from "..";

function metric(
  date: string,
  readiness: number | null,
  hrv: number | null,
  tsb: number | null,
): MetricPoint {
  return { date, readiness, hrv, tsb };
}

describe("attributeOutcomes", () => {
  it("computes deltas at the horizon and emits per-rule + decision rows", () => {
    const decisions: DecisionInput[] = [
      {
        date: "2026-01-01",
        decisionKind: "recommendation",
        ruleTrace: [
          { ruleId: "low-readiness-blocks-hard", fired: true },
          { ruleId: "acwr-spike-blocks-hard", fired: false },
        ],
      },
    ];
    const metrics: MetricPoint[] = [
      metric("2026-01-01", 50, 40, -10),
      metric("2026-01-04", 70, 55, -2),
    ];

    const attrs = attributeOutcomes(decisions, metrics, 3);

    // decision-level + the single fired rule = 2 rows (unfired rule excluded)
    expect(attrs.map((a) => a.ruleId).sort()).toEqual(
      [DECISION_RULE_ID, "low-readiness-blocks-hard"].sort(),
    );
    const row = attrs.find((a) => a.ruleId === "low-readiness-blocks-hard")!;
    expect(row.deltaReadiness).toBe(20);
    expect(row.deltaHrv).toBe(15);
    expect(row.deltaTsb).toBe(8);
    expect(row.horizonDays).toBe(3);
  });

  it("tolerates a missing outcome day by scanning forward within tolerance", () => {
    const decisions: DecisionInput[] = [
      { date: "2026-02-01", decisionKind: "intervention_accept" },
    ];
    // horizon day 2026-02-04 missing; 2026-02-05 present (within tol)
    const metrics: MetricPoint[] = [
      metric("2026-02-01", 60, 45, -5),
      metric("2026-02-05", 64, 48, -3),
    ];
    const attrs = attributeOutcomes(decisions, metrics, 3);
    expect(attrs).toHaveLength(1); // decision-level only (no ruleTrace)
    expect(attrs[0]!.deltaReadiness).toBe(4);
  });

  it("skips decisions with no usable metric deltas", () => {
    const decisions: DecisionInput[] = [
      { date: "2026-03-01", decisionKind: "recommendation" },
    ];
    const attrs = attributeOutcomes(decisions, [], 3);
    expect(attrs).toHaveLength(0);
  });
});

describe("summarizeRuleEffectiveness", () => {
  it("ranks a recovery-improving rule above a neutral one", () => {
    const decisions: DecisionInput[] = [
      {
        date: "2026-01-01",
        decisionKind: "recommendation",
        ruleTrace: [{ ruleId: "rest-helps", fired: true }],
      },
      {
        date: "2026-01-08",
        decisionKind: "recommendation",
        ruleTrace: [{ ruleId: "rest-helps", fired: true }],
      },
      {
        date: "2026-01-15",
        decisionKind: "recommendation",
        ruleTrace: [{ ruleId: "neutral-rule", fired: true }],
      },
    ];
    const metrics: MetricPoint[] = [
      metric("2026-01-01", 50, 40, -8),
      metric("2026-01-04", 68, 52, -2),
      metric("2026-01-08", 52, 41, -7),
      metric("2026-01-11", 69, 53, -1),
      metric("2026-01-15", 60, 48, -3),
      metric("2026-01-18", 60, 48, -3),
    ];
    const attrs = attributeOutcomes(decisions, metrics, 3);
    const eff = summarizeRuleEffectiveness(attrs);

    const rest = eff.find((e) => e.ruleId === "rest-helps")!;
    const neutral = eff.find((e) => e.ruleId === "neutral-rule")!;
    expect(rest.score).toBeGreaterThan(neutral.score);
    expect(neutral.score).toBeCloseTo(0, 1);
    expect(rest.meanReadinessDelta).toBeGreaterThan(0);
    expect(rest.n).toBe(2);
  });

  it("returns an empty list for no attributions", () => {
    expect(summarizeRuleEffectiveness([])).toEqual([]);
  });
});
