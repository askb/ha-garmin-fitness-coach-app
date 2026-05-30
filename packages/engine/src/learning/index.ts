// SPDX-FileCopyrightText: 2026 Anil Belur <askb23@gmail.com>
// SPDX-License-Identifier: Apache-2.0
//
// LEARNING LOOP — outcome attribution (ai-loop-close-learning)
//
// Pure, DB-free functions that join coach decisions to the athlete's
// *subsequent* physiological outcome (readiness / HRV / TSB) so we can score
// per-rule effectiveness. The API layer supplies the joined rows; this module
// only does the math, so it is trivially unit-testable and shares no Postgres
// coupling with the engine's other modules.
//
// Interpretation: a recommendation rule is "effective" when, over the horizon
// after it fired, the athlete's recovery markers improved (positive delta) or
// at least did not deteriorate. We never tune thresholds here — we only
// quantify what happened. Threshold tuning is a later, guard-railed phase.

export interface DecisionInput {
  /** ISO date (YYYY-MM-DD) the decision was made / recommendation produced. */
  date: string;
  /** Decision kind, e.g. "recommendation" | "intervention_accept" | ... */
  decisionKind: string;
  /** Engine rule traces attached to the decision (from RecommendationAudit). */
  ruleTrace?: { ruleId: string; fired: boolean }[];
}

export interface MetricPoint {
  date: string; // ISO YYYY-MM-DD
  readiness: number | null;
  hrv: number | null;
  tsb: number | null;
}

export interface Attribution {
  ruleId: string;
  decisionKind: string;
  decisionDate: string;
  horizonDays: number;
  baselineReadiness: number | null;
  baselineHrv: number | null;
  baselineTsb: number | null;
  outcomeReadiness: number | null;
  outcomeHrv: number | null;
  outcomeTsb: number | null;
  deltaReadiness: number | null;
  deltaHrv: number | null;
  deltaTsb: number | null;
}

export interface RuleEffectiveness {
  ruleId: string;
  /** Number of attributions with at least one non-null delta. */
  n: number;
  meanReadinessDelta: number | null;
  meanHrvDelta: number | null;
  meanTsbDelta: number | null;
  /**
   * Composite effectiveness score in [-1, 1]. Positive = recovery markers
   * improved after the rule fired; ~0 = neutral / insufficient signal.
   */
  score: number;
}

/** Sentinel ruleId for whole-recommendation (decision-level) attribution. */
export const DECISION_RULE_ID = "__decision__";

function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function delta(base: number | null, out: number | null): number | null {
  if (base == null || out == null) return null;
  return Math.round((out - base) * 100) / 100;
}

/**
 * Find the metric point on `date`, or the nearest available point within
 * `tolDays` after it (handles missing wear days). Returns null if none.
 */
function pointAtOrAfter(
  byDate: Map<string, MetricPoint>,
  date: string,
  tolDays = 2,
): MetricPoint | null {
  for (let i = 0; i <= tolDays; i++) {
    const p = byDate.get(addDays(date, i));
    if (p) return p;
  }
  return null;
}

/**
 * Attribute each decision's fired rules to the outcome `horizonDays` later.
 * Emits one row per fired rule plus a decision-level row (DECISION_RULE_ID).
 * Decisions whose baseline or outcome metrics are entirely missing are skipped.
 */
export function attributeOutcomes(
  decisions: DecisionInput[],
  metrics: MetricPoint[],
  horizonDays = 3,
): Attribution[] {
  const byDate = new Map<string, MetricPoint>();
  for (const m of metrics) byDate.set(m.date, m);

  const out: Attribution[] = [];
  for (const d of decisions) {
    const baseline = pointAtOrAfter(byDate, d.date, 0);
    const outcome = pointAtOrAfter(byDate, addDays(d.date, horizonDays));
    if (!baseline && !outcome) continue;

    const base = baseline ?? {
      readiness: null,
      hrv: null,
      tsb: null,
      date: d.date,
    };
    const res = outcome ?? {
      readiness: null,
      hrv: null,
      tsb: null,
      date: addDays(d.date, horizonDays),
    };

    const dReadiness = delta(base.readiness, res.readiness);
    const dHrv = delta(base.hrv, res.hrv);
    const dTsb = delta(base.tsb, res.tsb);
    if (dReadiness == null && dHrv == null && dTsb == null) continue;

    const firedRuleIds = (d.ruleTrace ?? [])
      .filter((r) => r.fired)
      .map((r) => r.ruleId);
    const ruleIds = [...new Set([DECISION_RULE_ID, ...firedRuleIds])];

    for (const ruleId of ruleIds) {
      out.push({
        ruleId,
        decisionKind: d.decisionKind,
        decisionDate: d.date,
        horizonDays,
        baselineReadiness: base.readiness,
        baselineHrv: base.hrv,
        baselineTsb: base.tsb,
        outcomeReadiness: res.readiness,
        outcomeHrv: res.hrv,
        outcomeTsb: res.tsb,
        deltaReadiness: dReadiness,
        deltaHrv: dHrv,
        deltaTsb: dTsb,
      });
    }
  }
  return out;
}

function mean(values: (number | null)[]): number | null {
  const nums = values.filter((v): v is number => v != null);
  if (nums.length === 0) return null;
  return (
    Math.round((nums.reduce((s, v) => s + v, 0) / nums.length) * 100) / 100
  );
}

/** Squash a raw mean delta to [-1, 1] with a gentle scale per metric. */
function squash(value: number | null, scale: number): number {
  if (value == null) return 0;
  return Math.tanh(value / scale);
}

/**
 * Aggregate attributions into per-rule effectiveness. Readiness and HRV
 * improvements are weighted positively; TSB is informational (a more positive
 * TSB after a rest-biasing rule indicates freshening) and lightly weighted.
 */
export function summarizeRuleEffectiveness(
  attributions: Attribution[],
): RuleEffectiveness[] {
  const groups = new Map<string, Attribution[]>();
  for (const a of attributions) {
    (groups.get(a.ruleId) ?? groups.set(a.ruleId, []).get(a.ruleId)!).push(a);
  }

  const result: RuleEffectiveness[] = [];
  for (const [ruleId, rows] of groups) {
    const meanReadinessDelta = mean(rows.map((r) => r.deltaReadiness));
    const meanHrvDelta = mean(rows.map((r) => r.deltaHrv));
    const meanTsbDelta = mean(rows.map((r) => r.deltaTsb));
    const n = rows.filter(
      (r) =>
        r.deltaReadiness != null || r.deltaHrv != null || r.deltaTsb != null,
    ).length;

    // Composite: readiness (0-100 scale → /10), HRV (ms → /10), TSB (→ /20).
    const score =
      Math.round(
        (0.5 * squash(meanReadinessDelta, 10) +
          0.35 * squash(meanHrvDelta, 10) +
          0.15 * squash(meanTsbDelta, 20)) *
          100,
      ) / 100;

    result.push({
      ruleId,
      n,
      meanReadinessDelta,
      meanHrvDelta,
      meanTsbDelta,
      score,
    });
  }
  result.sort((a, b) => b.score - a.score || a.ruleId.localeCompare(b.ruleId));
  return result;
}
