import type { MatchWindow } from "./matching";
import {
  computeIntensityShift,
  deriveActualIntensityStep,
  normalizeSport,
  scoreActivityMatch,
  sportFamily,
} from "./matching";

/**
 * Deterministic planned-vs-actual workout reconciliation engine.
 */

export type ReconcileStatus =
  | "completed"
  | "partial"
  | "missed"
  | "extra"
  | "no-plan";

export interface ReconcileDeviation {
  durationMinDelta: number | null;
  durationPctDelta: number | null;
  intensityShift: -2 | -1 | 0 | 1 | 2 | null;
  sportTypeMatch: boolean | null;
}

export interface ReconcileResult {
  /** ISO calendar day this reconciliation applies to (echoed from input
   *  for audit-trail correlation — every downstream RecommendationAudit
   *  row carries this date so adherence trends can be rebuilt from
   *  audit alone). */
  date: string;
  status: ReconcileStatus;
  matchedActivityIds: string[];
  deviation: ReconcileDeviation;
  notes: string[];
  confidence: number;
}

export interface PlannedWorkoutInput {
  workoutType: string;
  sportType?: string | null;
  durationMin: number;
  intensity?: "easy" | "moderate" | "hard";
}

export interface ActualActivityInput {
  id: string;
  sportType: string;
  durationMin: number;
  avgHrBpm?: number | null;
  /** User's max HR, used to derive intensity from avgHrBpm when no
   *  explicit intensity is available on the activity. */
  hrMax?: number | null;
}

export interface ReconcileInput {
  date: string;
  planned: PlannedWorkoutInput | null;
  actuals: ActualActivityInput[];
  matchWindow?: MatchWindow;
}

// Frozen so callers that share the constant reference can't mutate
// the deviation of a previously-returned result. Each call site uses
// emptyDeviation() to materialize a fresh copy where the caller may
// retain the reference long-term.
const EMPTY_DEVIATION: Readonly<ReconcileDeviation> = Object.freeze({
  durationMinDelta: null,
  durationPctDelta: null,
  intensityShift: null,
  sportTypeMatch: null,
});

function emptyDeviation(): ReconcileDeviation {
  return { ...EMPTY_DEVIATION };
}

function clampConfidence(confidence: number): number {
  return Math.max(0, Math.min(1, Number(confidence.toFixed(2))));
}

function sumDurationMin(actuals: ActualActivityInput[]): number {
  return actuals.reduce((total, activity) => total + activity.durationMin, 0);
}

function durationDeviation(
  plannedDurationMin: number | null,
  actualDurationMin: number | null,
): Pick<ReconcileDeviation, "durationMinDelta" | "durationPctDelta"> {
  if (plannedDurationMin === null || actualDurationMin === null) {
    return { durationMinDelta: null, durationPctDelta: null };
  }

  const durationMinDelta = actualDurationMin - plannedDurationMin;
  return {
    durationMinDelta,
    durationPctDelta:
      plannedDurationMin === 0 ? null : durationMinDelta / plannedDurationMin,
  };
}

function sportTypeMatch(
  plannedSportType: string | null | undefined,
  actualSportType: string,
): boolean | null {
  if (!plannedSportType) return null;
  return normalizeSport(plannedSportType) === normalizeSport(actualSportType);
}

function sameSportFamily(
  plannedSportType: string | null | undefined,
  actualSportType: string,
): boolean {
  if (!plannedSportType) return false;
  return sportFamily(plannedSportType) === sportFamily(actualSportType);
}

function buildDeviation(
  planned: PlannedWorkoutInput | null,
  activity: ActualActivityInput | null,
): ReconcileDeviation {
  return {
    ...durationDeviation(
      planned?.durationMin ?? null,
      activity?.durationMin ?? null,
    ),
    intensityShift:
      planned && activity
        ? computeIntensityShift(planned.intensity, activity)
        : null,
    sportTypeMatch:
      planned && activity
        ? sportTypeMatch(planned.sportType, activity.sportType)
        : null,
  };
}

function selectBestMatch(
  planned: PlannedWorkoutInput,
  actuals: ActualActivityInput[],
  matchWindow: MatchWindow | undefined,
): ActualActivityInput {
  const scores = actuals.map((activity) =>
    scoreActivityMatch(planned, activity, matchWindow),
  );
  const topScore = Math.max(...scores.map((score) => score.score));

  const ranked = [...scores].sort((a, b) => {
    if (topScore <= 0.4 && b.sportTypeScore !== a.sportTypeScore) {
      return b.sportTypeScore - a.sportTypeScore;
    }
    if (b.score !== a.score) return b.score - a.score;
    if (b.durationScore !== a.durationScore) {
      return b.durationScore - a.durationScore;
    }
    return b.activity.durationMin - a.activity.durationMin;
  });

  const best = ranked[0];
  if (best === undefined) {
    throw new Error("Cannot select a match without actual activities");
  }
  return best.activity;
}

function classifyWorkoutStatus(
  planned: PlannedWorkoutInput,
  activity: ActualActivityInput,
): ReconcileStatus {
  const durationRatio =
    planned.durationMin > 0 ? activity.durationMin / planned.durationMin : 0;
  const familyMatch = sameSportFamily(planned.sportType, activity.sportType);

  // A workout counts as "completed" only when the sport family matches AND
  // the user covered at least 85% of the planned duration. Everything else
  // — wrong sport, too short, or family-only match — falls back to
  // "partial". "missed" is handled upstream in reconcilePlanVsActual when
  // there are no actuals at all.
  if (familyMatch && durationRatio >= 0.85) return "completed";
  return "partial";
}

function buildNotes(
  planned: PlannedWorkoutInput,
  activity: ActualActivityInput,
  unmatchedCount: number,
): string[] {
  const notes: string[] = [];
  const exactSportMatch = sportTypeMatch(planned.sportType, activity.sportType);
  const familyMatch = sameSportFamily(planned.sportType, activity.sportType);
  const durationRatio =
    planned.durationMin > 0 ? activity.durationMin / planned.durationMin : 0;
  const intensityShift = computeIntensityShift(planned.intensity, activity);

  if (exactSportMatch === true && Math.abs(durationRatio - 1) <= 0.15) {
    notes.push("matched by sportType+duration");
  } else if (exactSportMatch === false && familyMatch) {
    notes.push("matched by sport family");
  } else if (exactSportMatch === false) {
    notes.push("sport mismatch");
  } else {
    notes.push("matched by duration");
  }

  if (intensityShift !== null && intensityShift > 0) {
    notes.push("intensity above planned");
  }
  if (intensityShift !== null && intensityShift < 0) {
    notes.push("intensity below planned");
  }
  if (durationRatio > 0 && durationRatio < 0.85) {
    notes.push("duration below planned");
  }
  if (unmatchedCount > 0) {
    notes.push("additional unplanned activity recorded");
  }

  return notes;
}

function computeConfidence(
  planned: PlannedWorkoutInput,
  activity: ActualActivityInput,
): number {
  let confidence = 1;
  const exactSportMatch = sportTypeMatch(planned.sportType, activity.sportType);
  const familyMatch = sameSportFamily(planned.sportType, activity.sportType);
  // Only penalize intensity uncertainty when the plan actually specified
  // an intensity that the activity failed to confirm. Plans that omit
  // intensity (e.g. an "easy ride" with no target) should not lose
  // confidence just because we can't derive a step from the activity.
  const intensityExpected = planned.intensity !== undefined;
  const intensityDerived = deriveActualIntensityStep(activity) !== null;
  const durationPctDelta = buildDeviation(planned, activity).durationPctDelta;

  if (exactSportMatch === false && familyMatch) confidence -= 0.2;
  if (exactSportMatch === false && !familyMatch) confidence -= 0.4;
  if (intensityExpected && !intensityDerived) confidence -= 0.2;
  if (durationPctDelta !== null && Math.abs(durationPctDelta) > 0.5) {
    confidence -= 0.3;
  }

  return clampConfidence(confidence);
}

/**
 * Reconcile a planned workout with same-day recorded activities.
 *
 * @see Foster C et al. (2001). A new approach to monitoring exercise
 *      training. Journal of Strength and Conditioning Research, 15(1), 109-115.
 */
export function reconcilePlanVsActual(input: ReconcileInput): ReconcileResult {
  const { planned, actuals, date } = input;
  // Every return path goes through `withDate` so the audit-correlation
  // field is never accidentally dropped on a new code path.
  const withDate = (
    partial: Omit<ReconcileResult, "date">,
  ): ReconcileResult => ({ date, ...partial });

  if (planned === null) {
    if (actuals.length === 0) {
      return withDate({
        status: "no-plan",
        matchedActivityIds: [],
        deviation: emptyDeviation(),
        notes: [],
        confidence: 1,
      });
    }

    return withDate({
      status: "extra",
      matchedActivityIds: actuals.map((activity) => activity.id),
      // No planned target → no deviation to compute.
      deviation: emptyDeviation(),
      notes: ["unplanned activity recorded"],
      confidence: 1,
    });
  }

  if (planned.workoutType === "rest") {
    if (actuals.length === 0) {
      return withDate({
        status: "completed",
        matchedActivityIds: [],
        deviation: buildDeviation(planned, null),
        notes: [],
        confidence: 1,
      });
    }

    return withDate({
      status: "extra",
      matchedActivityIds: actuals.map((activity) => activity.id),
      deviation: {
        ...durationDeviation(planned.durationMin, sumDurationMin(actuals)),
        intensityShift: null,
        sportTypeMatch: planned.sportType ? false : null,
      },
      notes: ["rest day had an unplanned activity"],
      confidence: 1,
    });
  }

  if (actuals.length === 0) {
    return withDate({
      status: "missed",
      matchedActivityIds: [],
      deviation: buildDeviation(planned, null),
      notes: ["planned workout not recorded"],
      confidence: 1,
    });
  }

  const matched = selectBestMatch(planned, actuals, input.matchWindow);
  const unmatchedCount = actuals.length - 1;

  return withDate({
    status: classifyWorkoutStatus(planned, matched),
    matchedActivityIds: [matched.id],
    deviation: buildDeviation(planned, matched),
    notes: buildNotes(planned, matched, unmatchedCount),
    confidence: computeConfidence(planned, matched),
  });
}

export { sportFamily } from "./matching";
