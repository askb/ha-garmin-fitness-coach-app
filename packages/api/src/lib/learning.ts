// SPDX-FileCopyrightText: 2026 Anil Belur <askb23@gmail.com>
// SPDX-License-Identifier: Apache-2.0
//
// LEARNING LOOP — API job (ai-loop-close-learning)
//
// Joins the inescapable RecommendationAudit trail to the athlete's subsequent
// readiness / HRV / TSB outcomes and persists per-decision attributions, then
// surfaces per-rule effectiveness. Phase 1 only SURFACES this (a "what worked
// for you" view + a confidence input); per-athlete threshold tuning is later.
//
// Gated by LEARNING_ATTRIBUTION_ENABLED (default on). Best-effort and
// idempotent on (userId, ruleId, decisionDate, horizonDays).

import type {
  Attribution,
  DecisionInput,
  MetricPoint,
  RuleEffectiveness,
} from "@acme/engine";
import { and, eq, gte, sql } from "@acme/db";
import { db } from "@acme/db/client";
import {
  AdvancedMetric,
  DailyMetric,
  OutcomeAttribution,
  ReadinessScore,
  RecommendationAudit,
} from "@acme/db/schema";
import {
  attributeOutcomes,
  DECISION_RULE_ID,
  summarizeRuleEffectiveness,
} from "@acme/engine";

const ATTRIBUTED_KINDS = [
  "recommendation",
  "intervention_accept",
  "intervention_skip",
  "intervention_defer",
  "override",
] as const;

export function isLearningEnabled(): boolean {
  const flag = process.env.LEARNING_ATTRIBUTION_ENABLED;
  if (flag === "false" || flag === "0") return false;
  return true;
}

function dateNDaysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

interface MaybeRuleTrace {
  ruleId?: unknown;
  fired?: unknown;
}

function coerceRuleTrace(
  raw: unknown,
): { ruleId: string; fired: boolean }[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const out: { ruleId: string; fired: boolean }[] = [];
  for (const item of raw as MaybeRuleTrace[]) {
    if (item && typeof item.ruleId === "string") {
      out.push({ ruleId: item.ruleId, fired: item.fired === true });
    }
  }
  return out.length > 0 ? out : undefined;
}

/**
 * Recompute and persist outcome attributions for an athlete over the trailing
 * `lookbackDays`. Returns the per-rule effectiveness summary.
 */
export async function recomputeOutcomeAttribution(
  userId: string,
  opts?: { horizonDays?: number; lookbackDays?: number },
): Promise<RuleEffectiveness[]> {
  if (!isLearningEnabled()) return [];

  const horizonDays = opts?.horizonDays ?? 3;
  const lookbackDays = opts?.lookbackDays ?? 180;
  const since = dateNDaysAgo(lookbackDays);
  // Pull metrics out to horizon beyond today so recent decisions can resolve.
  const metricsSince = since;

  const [audits, readiness, daily, advanced] = await Promise.all([
    db.query.RecommendationAudit.findMany({
      where: and(
        eq(RecommendationAudit.userId, userId),
        gte(RecommendationAudit.date, since),
      ),
      columns: { date: true, kind: true, ruleTrace: true },
    }),
    db.query.ReadinessScore.findMany({
      where: and(
        eq(ReadinessScore.userId, userId),
        gte(ReadinessScore.date, metricsSince),
      ),
      columns: { date: true, score: true },
    }),
    db.query.DailyMetric.findMany({
      where: and(
        eq(DailyMetric.userId, userId),
        gte(DailyMetric.date, metricsSince),
      ),
      columns: { date: true, hrv: true },
    }),
    db.query.AdvancedMetric.findMany({
      where: and(
        eq(AdvancedMetric.userId, userId),
        gte(AdvancedMetric.date, metricsSince),
      ),
      columns: { date: true, tsb: true },
    }),
  ]);

  // Build a per-date metric point from the three sources.
  const points = new Map<string, MetricPoint>();
  const ensure = (date: string): MetricPoint => {
    let p = points.get(date);
    if (!p) {
      p = { date, readiness: null, hrv: null, tsb: null };
      points.set(date, p);
    }
    return p;
  };
  for (const r of readiness) ensure(r.date).readiness = r.score ?? null;
  for (const m of daily) ensure(m.date).hrv = m.hrv ?? null;
  for (const a of advanced) ensure(a.date).tsb = a.tsb ?? null;

  const decisions: DecisionInput[] = audits
    .filter((a) =>
      (ATTRIBUTED_KINDS as readonly string[]).includes(a.kind as string),
    )
    .map((a) => ({
      date: a.date,
      decisionKind: a.kind as string,
      ruleTrace: coerceRuleTrace(a.ruleTrace),
    }));

  const attributions = attributeOutcomes(
    decisions,
    [...points.values()],
    horizonDays,
  );

  await persistAttributions(userId, attributions);

  // Exclude the decision-level sentinel from the surfaced summary; it is
  // persisted for aggregate analysis but is not a real coaching rule.
  return summarizeRuleEffectiveness(attributions).filter(
    (r) => r.ruleId !== DECISION_RULE_ID,
  );
}

async function persistAttributions(
  userId: string,
  attributions: Attribution[],
): Promise<void> {
  if (attributions.length === 0) return;

  const values = attributions.map((a) => ({
    userId,
    ruleId: a.ruleId,
    decisionKind: a.decisionKind as (typeof ATTRIBUTED_KINDS)[number],
    decisionDate: a.decisionDate,
    horizonDays: a.horizonDays,
    baselineReadiness: a.baselineReadiness,
    baselineHrv: a.baselineHrv,
    baselineTsb: a.baselineTsb,
    outcomeReadiness: a.outcomeReadiness,
    outcomeHrv: a.outcomeHrv,
    outcomeTsb: a.outcomeTsb,
    deltaReadiness: a.deltaReadiness,
    deltaHrv: a.deltaHrv,
    deltaTsb: a.deltaTsb,
  }));

  // Single multi-row upsert (vs one round-trip per attribution). On conflict,
  // overwrite the mutable columns from the incoming row via `excluded`.
  await db
    .insert(OutcomeAttribution)
    .values(values)
    .onConflictDoUpdate({
      target: [
        OutcomeAttribution.userId,
        OutcomeAttribution.ruleId,
        OutcomeAttribution.decisionDate,
        OutcomeAttribution.horizonDays,
      ],
      set: {
        decisionKind: sql`excluded.decision_kind`,
        baselineReadiness: sql`excluded.baseline_readiness`,
        baselineHrv: sql`excluded.baseline_hrv`,
        baselineTsb: sql`excluded.baseline_tsb`,
        outcomeReadiness: sql`excluded.outcome_readiness`,
        outcomeHrv: sql`excluded.outcome_hrv`,
        outcomeTsb: sql`excluded.outcome_tsb`,
        deltaReadiness: sql`excluded.delta_readiness`,
        deltaHrv: sql`excluded.delta_hrv`,
        deltaTsb: sql`excluded.delta_tsb`,
      },
    });
}

/**
 * Read persisted attributions and summarise per-rule effectiveness without
 * recomputing. Cheap path for UI / confidence lookups.
 */
export async function getRuleEffectiveness(
  userId: string,
): Promise<RuleEffectiveness[]> {
  if (!isLearningEnabled()) return [];
  const rows = await db.query.OutcomeAttribution.findMany({
    where: eq(OutcomeAttribution.userId, userId),
  });
  const attributions: Attribution[] = rows.map((r) => ({
    ruleId: r.ruleId,
    decisionKind: r.decisionKind,
    decisionDate: r.decisionDate,
    horizonDays: r.horizonDays,
    baselineReadiness: r.baselineReadiness,
    baselineHrv: r.baselineHrv,
    baselineTsb: r.baselineTsb,
    outcomeReadiness: r.outcomeReadiness,
    outcomeHrv: r.outcomeHrv,
    outcomeTsb: r.outcomeTsb,
    deltaReadiness: r.deltaReadiness,
    deltaHrv: r.deltaHrv,
    deltaTsb: r.deltaTsb,
  }));
  return summarizeRuleEffectiveness(attributions).filter(
    (r) => r.ruleId !== DECISION_RULE_ID,
  );
}
