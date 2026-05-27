import type {
  DailyRecommendationInput,
  Recommendation,
  RecommendationAction,
  RecommendationIntensity,
  RuleTrace,
} from "./rules";
import { dailyRecommendationRules } from "./rules";

export type {
  DailyRecommendationInput,
  Recommendation,
  RecommendationAction,
  RecommendationIntensity,
  RuleTrace,
} from "./rules";

export {
  acwrSpikeBlocksHard,
  acwrVeryLowSuggestsLightBuild,
  consecutiveHardSuggestsRecovery,
  dailyRecommendationRules,
  hrvSuppressedBlocksHard,
  interventionRecentRespects,
  lowReadinessBlocksHard,
  planHonoredWhenSafe,
  raceDayRest,
  raceWeekProtectsTaper,
  sleepDebtBlocksHard,
  sparseDataLowConfidence,
  tsbOverreachingSuggestsDeload,
  weeklyQuotaMetSuggestsRest,
} from "./rules";

type MutableRecommendation = Omit<
  Recommendation,
  "reason" | "confidence" | "rules" | "hardBlocks" | "raceProximityDays"
>;

const RECOVERY_WORKOUT_TYPE = "yoga";

function hasFired(rules: RuleTrace[], ruleId: string): boolean {
  return rules.some((rule) => rule.ruleId === ruleId && rule.fired);
}

function downgradeIntensity(
  intensity: RecommendationIntensity,
): RecommendationIntensity {
  if (intensity === "hard") return "moderate";
  if (intensity === "moderate") return "easy";
  return "easy";
}

function applyIntensity(
  recommendation: MutableRecommendation,
  intensity: RecommendationIntensity,
): MutableRecommendation {
  if (recommendation.action === "rest") return recommendation;

  return {
    ...recommendation,
    intensity,
    workoutType:
      recommendation.workoutType ?? (intensity === "easy" ? "easy_run" : "run"),
    durationMin: recommendation.durationMin ?? (intensity === "easy" ? 30 : 45),
  };
}

function fromPlan(
  input: DailyRecommendationInput,
): MutableRecommendation | null {
  const plannedToday = input.weeklyPlan?.plannedToday;
  if (!plannedToday) return null;

  return {
    action: plannedToday.workoutType === "rest" ? "rest" : "workout",
    workoutType: plannedToday.workoutType,
    durationMin: plannedToday.durationMin,
    intensity: plannedToday.intensity,
  };
}

function defaultWorkout(
  intensity: RecommendationIntensity,
): MutableRecommendation {
  return {
    action: "workout",
    workoutType: intensity === "easy" ? "easy_run" : "steady_run",
    durationMin: intensity === "easy" ? 30 : 45,
    intensity,
  };
}

function recoveryRecommendation(): MutableRecommendation {
  return {
    action: "active_recovery",
    workoutType: RECOVERY_WORKOUT_TYPE,
    durationMin: 30,
    intensity: "easy",
  };
}

function deloadRecommendation(): MutableRecommendation {
  return {
    action: "deload",
    workoutType: "easy_run",
    durationMin: 30,
    intensity: "easy",
  };
}

function restRecommendation(): MutableRecommendation {
  return { action: "rest", workoutType: "rest" };
}

function computeDesiredRecommendation(
  input: DailyRecommendationInput,
  rules: RuleTrace[],
): MutableRecommendation {
  const plannedToday = input.weeklyPlan?.plannedToday;
  const raceDayFired = hasFired(rules, "race-day-rest");

  if (raceDayFired) {
    if (plannedToday?.workoutType === "race")
      return fromPlan(input) ?? defaultWorkout("hard");
    return restRecommendation();
  }

  if (hasFired(rules, "race-week-protects-taper")) {
    if (plannedToday?.intensity === "easy")
      return fromPlan(input) ?? defaultWorkout("easy");
    return defaultWorkout("easy");
  }

  const planned = fromPlan(input);
  if (planned) return planned;

  if (
    hasFired(rules, "sparse-data-low-confidence") &&
    input.readiness === null &&
    input.load.acwr === null &&
    input.load.tsb === null
  ) {
    return restRecommendation();
  }

  if (
    hasFired(rules, "tsb-overreaching-suggests-deload") &&
    input.load.consecutiveHardDays >= 4
  ) {
    return deloadRecommendation();
  }

  if (hasFired(rules, "consecutive-hard-suggests-recovery")) {
    return recoveryRecommendation();
  }

  if (hasFired(rules, "weekly-quota-met-suggests-rest")) {
    return restRecommendation();
  }

  if (hasFired(rules, "acwr-very-low-suggests-light-build")) {
    return defaultWorkout("easy");
  }

  return defaultWorkout("moderate");
}

function applyWarnDowngrades(
  recommendation: MutableRecommendation,
  rules: RuleTrace[],
): MutableRecommendation {
  let next = recommendation;

  if (
    hasFired(rules, "intervention-recent-respects") &&
    next.intensity !== undefined
  ) {
    next = applyIntensity(next, downgradeIntensity(next.intensity));
  }

  if (
    hasFired(rules, "acwr-very-low-suggests-light-build") &&
    next.intensity !== undefined &&
    next.intensity !== "easy"
  ) {
    next = applyIntensity(next, "easy");
  }

  return next;
}

function enforceHardBlocks(
  recommendation: MutableRecommendation,
  rules: RuleTrace[],
): MutableRecommendation {
  const hardBlocks = rules.filter(
    (rule) => rule.fired && rule.severity === "block",
  );
  if (hardBlocks.length === 0 || recommendation.intensity === undefined) {
    return recommendation;
  }

  if (
    hasFired(rules, "hrv-suppressed-blocks-hard") &&
    hasFired(rules, "acwr-spike-blocks-hard") &&
    recommendation.intensity !== "easy"
  ) {
    return recoveryRecommendation();
  }

  let next = recommendation;

  if (hasFired(rules, "low-readiness-blocks-hard")) {
    if (next.intensity === "hard") next = applyIntensity(next, "moderate");
    if (next.intensity === "moderate") next = applyIntensity(next, "easy");
  }

  if (hasFired(rules, "sleep-debt-blocks-hard")) {
    if (next.intensity === "hard") next = applyIntensity(next, "moderate");
    if (next.intensity === "moderate") next = applyIntensity(next, "easy");
  }

  if (
    (hasFired(rules, "hrv-suppressed-blocks-hard") ||
      hasFired(rules, "acwr-spike-blocks-hard") ||
      hasFired(rules, "race-week-protects-taper")) &&
    next.intensity === "hard" &&
    // Race-day exemption: when the user is racing today and the plan is the
    // actual race workout, the taper rule must not downgrade it. The race-day
    // branch in computeDesiredRecommendation returns the planned race; we
    // honor that here too. See PR #206 Copilot review (race-week double-fire).
    next.workoutType !== "race"
  ) {
    next = applyIntensity(next, "moderate");
  }

  return next;
}

function nullReadinessFieldCount(input: DailyRecommendationInput): number {
  if (input.readiness === null) return 4;

  return [
    input.readiness.score,
    input.readiness.zone,
    input.readiness.hrvDeviation,
    input.readiness.sleepDebtMin,
  ].filter((value) => value === null).length;
}

function computeConfidence(
  input: DailyRecommendationInput,
  rules: RuleTrace[],
): number {
  const sparsePenalty = hasFired(rules, "sparse-data-low-confidence") ? 0.4 : 0;
  const nullPenalty = nullReadinessFieldCount(input) * 0.2;
  const rawConfidence = 1 - sparsePenalty - nullPenalty;

  return Math.max(0.1, Math.min(1, Math.round(rawConfidence * 100) / 100));
}

function buildReason(rules: RuleTrace[]): string {
  const firedNonInfo = rules.filter(
    (rule) => rule.fired && rule.severity !== "info",
  );

  if (firedNonInfo.length === 0) {
    const sparseData = rules.find(
      (rule) => rule.ruleId === "sparse-data-low-confidence" && rule.fired,
    );
    return (
      sparseData?.message ??
      "Plan day — no signals against your scheduled workout."
    );
  }

  return firedNonInfo
    .slice(0, 2)
    .map((rule) => rule.message)
    .join(" ");
}

/**
 * DAILY RECOMMENDATION ENGINE — deterministic, rules-first coaching.
 *
 * Uses transparent guardrails before selecting a single day recommendation.
 * - ACWR >1.5 follows the high-risk spike threshold described by Blanch &
 *   Gabbett and Gabbett's training-injury prevention paradox (2016).
 * - TSB < -30 is treated as overreaching, consistent with Coggan's PMC
 *   interpretation of strongly negative training stress balance.
 * - Race-week hard work is blocked to protect tapering, following Mujika &
 *   Padilla's taper review (2003).
 */
export function recommendDay(input: DailyRecommendationInput): Recommendation {
  const rules = dailyRecommendationRules.map((rule) => rule(input));
  const hardBlocks = rules
    .filter((rule) => rule.fired && rule.severity === "block")
    .map((rule) => rule.ruleId);

  const desired = computeDesiredRecommendation(input, rules);
  const warned = applyWarnDowngrades(desired, rules);
  const finalRecommendation = enforceHardBlocks(warned, rules);

  return {
    ...finalRecommendation,
    reason: buildReason(rules),
    confidence: computeConfidence(input, rules),
    rules,
    hardBlocks,
    raceProximityDays: input.raceDateDaysAway,
  };
}
