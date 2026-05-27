export type RecommendationAction =
  | "workout"
  | "rest"
  | "active_recovery"
  | "deload";
export type RecommendationIntensity = "easy" | "moderate" | "hard";

export interface RuleTrace {
  ruleId: string;
  fired: boolean;
  severity: "info" | "warn" | "block";
  message: string;
  inputs: Record<string, unknown>;
}

export interface Recommendation {
  action: RecommendationAction;
  workoutType?: string;
  durationMin?: number;
  intensity?: RecommendationIntensity;
  reason: string;
  confidence: number;
  rules: RuleTrace[];
  hardBlocks: string[];
  raceProximityDays: number | null;
}

export interface DailyRecommendationInput {
  date: string;
  readiness: {
    score: number | null;
    zone: "optimal" | "balanced" | "compromised" | "stressed" | null;
    hrvDeviation: number | null;
    sleepDebtMin: number | null;
  } | null;
  load: {
    acwr: number | null;
    tsb: number | null;
    consecutiveHardDays: number;
  };
  weeklyPlan: {
    plannedToday: {
      workoutType: string;
      intensity: RecommendationIntensity;
      durationMin: number;
    } | null;
    sessionsThisWeek: number;
    plannedThisWeek: number;
  } | null;
  recentInterventions: Array<{ type: string; date: string }>;
  raceDateDaysAway: number | null;
  baseline: { restDaysPerWeek: number } | null;
}

type RuleDefinition = {
  ruleId: string;
  severity: RuleTrace["severity"];
  message: string;
  inputs: Record<string, unknown>;
  predicate: (input: DailyRecommendationInput) => boolean;
};

function traceRule(
  input: DailyRecommendationInput,
  definition: RuleDefinition,
): RuleTrace {
  return {
    ruleId: definition.ruleId,
    fired: definition.predicate(input),
    severity: definition.severity,
    message: definition.message,
    inputs: definition.inputs,
  };
}

function daysBetween(fromDate: string, toDate: string): number | null {
  const fromTime = Date.parse(`${fromDate}T00:00:00Z`);
  const toTime = Date.parse(`${toDate}T00:00:00Z`);

  if (!Number.isFinite(fromTime) || !Number.isFinite(toTime)) return null;

  return Math.floor((fromTime - toTime) / 86_400_000);
}

function hasRecentRecoveryIntervention(
  input: DailyRecommendationInput,
): boolean {
  const recoveryTypes = new Set(["physio", "ice_bath", "massage"]);

  return input.recentInterventions.some((intervention) => {
    if (!recoveryTypes.has(intervention.type)) return false;

    const ageDays = daysBetween(input.date, intervention.date);
    return ageDays !== null && ageDays >= 0 && ageDays <= 2;
  });
}

function isSparseData(input: DailyRecommendationInput): boolean {
  return (
    input.readiness === null ||
    (input.load.acwr === null &&
      input.load.tsb === null &&
      (input.readiness?.hrvDeviation ?? null) === null)
  );
}

function hasWarnDowngradeSignal(input: DailyRecommendationInput): boolean {
  // Signals that, while not hard-blocking, will downgrade a planned workout's
  // intensity during the enforcement phase. The plan-honored-when-safe trace
  // should NOT fire when these are present — otherwise the audit reads "no
  // signals against your plan" while the recommendation has already been
  // softened. Kept in sync with applyWarnDowngrades() in ./index.ts.
  const recentDowngradingIntervention =
    Array.isArray(input.recentInterventions) &&
    input.recentInterventions.some((intervention) =>
      ["physio", "ice_bath", "massage"].includes(intervention.type),
    );
  const acwrVeryLow = input.load.acwr !== null && input.load.acwr < 0.8;
  return recentDowngradingIntervention || acwrVeryLow;
}

function hasHardBlockSignal(input: DailyRecommendationInput): boolean {
  const readiness = input.readiness;
  const lowReadiness =
    (readiness?.score !== null &&
      readiness?.score !== undefined &&
      readiness.score < 50) ||
    readiness?.zone === "stressed" ||
    readiness?.zone === "compromised";
  const hrvSuppressed =
    (readiness?.hrvDeviation ?? null) !== null &&
    (readiness?.hrvDeviation ?? 0) <= -1.5;
  const acwrSpike = input.load.acwr !== null && input.load.acwr > 1.5;
  const raceWeek =
    input.raceDateDaysAway !== null && input.raceDateDaysAway <= 7;
  const raceDay = input.raceDateDaysAway === 0;
  const sleepDebt =
    (readiness?.sleepDebtMin ?? null) !== null &&
    (readiness?.sleepDebtMin ?? 0) >= 180;

  return (
    lowReadiness ||
    hrvSuppressed ||
    acwrSpike ||
    raceWeek ||
    raceDay ||
    sleepDebt
  );
}

export function lowReadinessBlocksHard(
  input: DailyRecommendationInput,
): RuleTrace {
  return traceRule(input, {
    ruleId: "low-readiness-blocks-hard",
    severity: "block",
    message: "Readiness is low, so intensity should be reduced today.",
    inputs: {
      score: input.readiness?.score ?? null,
      zone: input.readiness?.zone ?? null,
    },
    predicate: (candidate) => {
      const readiness = candidate.readiness;
      return (
        (readiness?.score !== null &&
          readiness?.score !== undefined &&
          readiness.score < 50) ||
        readiness?.zone === "stressed" ||
        readiness?.zone === "compromised"
      );
    },
  });
}

export function hrvSuppressedBlocksHard(
  input: DailyRecommendationInput,
): RuleTrace {
  return traceRule(input, {
    ruleId: "hrv-suppressed-blocks-hard",
    severity: "block",
    message: "HRV is suppressed, so hard training is blocked.",
    inputs: { hrvDeviation: input.readiness?.hrvDeviation ?? null },
    predicate: (candidate) =>
      (candidate.readiness?.hrvDeviation ?? null) !== null &&
      (candidate.readiness?.hrvDeviation ?? 0) <= -1.5,
  });
}

export function acwrSpikeBlocksHard(
  input: DailyRecommendationInput,
): RuleTrace {
  return traceRule(input, {
    ruleId: "acwr-spike-blocks-hard",
    severity: "block",
    message: "Recent load spiked above the safe ACWR range.",
    inputs: { acwr: input.load.acwr },
    predicate: (candidate) =>
      candidate.load.acwr !== null && candidate.load.acwr > 1.5,
  });
}

export function acwrVeryLowSuggestsLightBuild(
  input: DailyRecommendationInput,
): RuleTrace {
  return traceRule(input, {
    ruleId: "acwr-very-low-suggests-light-build",
    severity: "warn",
    message: "Training load is low; use an easy build today.",
    inputs: { acwr: input.load.acwr },
    predicate: (candidate) =>
      candidate.load.acwr !== null && candidate.load.acwr < 0.8,
  });
}

export function tsbOverreachingSuggestsDeload(
  input: DailyRecommendationInput,
): RuleTrace {
  return traceRule(input, {
    ruleId: "tsb-overreaching-suggests-deload",
    severity: "warn",
    message: "Training stress balance suggests overreaching.",
    inputs: {
      tsb: input.load.tsb,
      consecutiveHardDays: input.load.consecutiveHardDays,
    },
    predicate: (candidate) =>
      candidate.load.tsb !== null && candidate.load.tsb < -30,
  });
}

export function consecutiveHardSuggestsRecovery(
  input: DailyRecommendationInput,
): RuleTrace {
  return traceRule(input, {
    ruleId: "consecutive-hard-suggests-recovery",
    severity: "warn",
    message: "Three or more hard days call for recovery.",
    inputs: { consecutiveHardDays: input.load.consecutiveHardDays },
    predicate: (candidate) => candidate.load.consecutiveHardDays >= 3,
  });
}

export function raceWeekProtectsTaper(
  input: DailyRecommendationInput,
): RuleTrace {
  return traceRule(input, {
    ruleId: "race-week-protects-taper",
    severity: "block",
    message: "Race week favors tapering over hard training.",
    inputs: {
      raceDateDaysAway: input.raceDateDaysAway,
      plannedIntensity: input.weeklyPlan?.plannedToday?.intensity ?? null,
    },
    predicate: (candidate) =>
      candidate.raceDateDaysAway !== null && candidate.raceDateDaysAway <= 7,
  });
}

export function raceDayRest(input: DailyRecommendationInput): RuleTrace {
  return traceRule(input, {
    ruleId: "race-day-rest",
    severity: "block",
    message: "Race day is protected for racing or rest.",
    inputs: {
      raceDateDaysAway: input.raceDateDaysAway,
      plannedWorkoutType: input.weeklyPlan?.plannedToday?.workoutType ?? null,
    },
    predicate: (candidate) => candidate.raceDateDaysAway === 0,
  });
}

export function interventionRecentRespects(
  input: DailyRecommendationInput,
): RuleTrace {
  return traceRule(input, {
    ruleId: "intervention-recent-respects",
    severity: "warn",
    message: "Recent bodywork suggests easing back one step.",
    inputs: { recentInterventions: input.recentInterventions },
    predicate: hasRecentRecoveryIntervention,
  });
}

export function sleepDebtBlocksHard(
  input: DailyRecommendationInput,
): RuleTrace {
  return traceRule(input, {
    ruleId: "sleep-debt-blocks-hard",
    severity: "block",
    message: "Sleep debt is high, so hard training is blocked.",
    inputs: { sleepDebtMin: input.readiness?.sleepDebtMin ?? null },
    predicate: (candidate) =>
      (candidate.readiness?.sleepDebtMin ?? null) !== null &&
      (candidate.readiness?.sleepDebtMin ?? 0) >= 180,
  });
}

export function planHonoredWhenSafe(
  input: DailyRecommendationInput,
): RuleTrace {
  return traceRule(input, {
    ruleId: "plan-honored-when-safe",
    severity: "info",
    message: "Plan day — no signals against your scheduled workout.",
    inputs: { plannedToday: input.weeklyPlan?.plannedToday ?? null },
    predicate: (candidate) =>
      candidate.weeklyPlan?.plannedToday != null &&
      !hasHardBlockSignal(candidate) &&
      !hasWarnDowngradeSignal(candidate),
  });
}

export function weeklyQuotaMetSuggestsRest(
  input: DailyRecommendationInput,
): RuleTrace {
  return traceRule(input, {
    ruleId: "weekly-quota-met-suggests-rest",
    severity: "info",
    message: "Weekly workout quota is already met.",
    inputs: {
      sessionsThisWeek: input.weeklyPlan?.sessionsThisWeek ?? null,
      plannedThisWeek: input.weeklyPlan?.plannedThisWeek ?? null,
      plannedToday: input.weeklyPlan?.plannedToday ?? null,
    },
    predicate: (candidate) =>
      candidate.weeklyPlan !== null &&
      candidate.weeklyPlan.plannedToday === null &&
      candidate.weeklyPlan.sessionsThisWeek >=
        candidate.weeklyPlan.plannedThisWeek,
  });
}

export function sparseDataLowConfidence(
  input: DailyRecommendationInput,
): RuleTrace {
  return traceRule(input, {
    ruleId: "sparse-data-low-confidence",
    severity: "info",
    message: "Data is sparse, so this recommendation is conservative.",
    inputs: {
      readiness: input.readiness,
      acwr: input.load.acwr,
      tsb: input.load.tsb,
      hrvDeviation: input.readiness?.hrvDeviation ?? null,
    },
    predicate: isSparseData,
  });
}

export const dailyRecommendationRules = [
  lowReadinessBlocksHard,
  hrvSuppressedBlocksHard,
  acwrSpikeBlocksHard,
  acwrVeryLowSuggestsLightBuild,
  tsbOverreachingSuggestsDeload,
  consecutiveHardSuggestsRecovery,
  raceWeekProtectsTaper,
  raceDayRest,
  interventionRecentRespects,
  sleepDebtBlocksHard,
  planHonoredWhenSafe,
  weeklyQuotaMetSuggestsRest,
  sparseDataLowConfidence,
];
