/**
 * Pure helpers for matching planned workouts to recorded activities.
 */

export type PlannedIntensity = "easy" | "moderate" | "hard";

export interface MatchWindow {
  durationMinTolerancePct?: number;
  durationMinMinAbsolute?: number;
}

export interface ActivityIntensityInput {
  avgHrBpm?: number | null;
  hrMax?: number | null;
}

export interface ActivityMatchInput extends ActivityIntensityInput {
  id: string;
  sportType: string;
  durationMin: number;
}

export interface PlannedMatchInput {
  sportType?: string | null;
  durationMin: number;
  intensity?: PlannedIntensity;
}

export interface MatchScore {
  activity: ActivityMatchInput;
  sportTypeScore: number;
  durationScore: number;
  intensityScore: number;
  score: number;
}

const SPORT_FAMILIES: Record<string, string> = {
  running: "running",
  trail_running: "running",
  treadmill_running: "running",
  track_running: "running",
  walking: "walking",
  hiking: "walking",
  casual_walking: "walking",
  cycling: "cycling",
  road_biking: "cycling",
  mountain_biking: "cycling",
  indoor_cycling: "cycling",
  swimming: "swimming",
  lap_swimming: "swimming",
  open_water_swimming: "swimming",
  strength_training: "strength",
  yoga: "strength",
  pilates: "strength",
};

export function normalizeSport(sport: string): string {
  return sport.trim().toLowerCase().replaceAll(/\s+/g, "_");
}

export function sportFamily(sport: string): string {
  const normalized = normalizeSport(sport);
  return SPORT_FAMILIES[normalized] ?? normalized;
}

export function plannedIntensityStep(
  intensity: PlannedIntensity | undefined,
): 1 | 2 | 3 | null {
  if (intensity === "easy") return 1;
  if (intensity === "moderate") return 2;
  if (intensity === "hard") return 3;
  return null;
}

export function deriveActualIntensityStep(
  activity: ActivityIntensityInput,
): 1 | 2 | 3 | null {
  const { avgHrBpm, hrMax } = activity;
  if (avgHrBpm === null || avgHrBpm === undefined) return null;
  if (hrMax === null || hrMax === undefined || hrMax <= 0) return null;

  const pctMax = avgHrBpm / hrMax;
  if (pctMax < 0.7) return 1;
  if (pctMax <= 0.83) return 2;
  return 3;
}

export function computeIntensityShift(
  plannedIntensity: PlannedIntensity | undefined,
  activity: ActivityIntensityInput,
): -2 | -1 | 0 | 1 | 2 | null {
  const plannedStep = plannedIntensityStep(plannedIntensity);
  const actualStep = deriveActualIntensityStep(activity);
  if (plannedStep === null || actualStep === null) return null;
  return (actualStep - plannedStep) as -2 | -1 | 0 | 1 | 2;
}

export function scoreSportType(
  plannedSportType: string | null | undefined,
  actualSportType: string,
): number {
  if (!plannedSportType) return 1;
  const planned = normalizeSport(plannedSportType);
  const actual = normalizeSport(actualSportType);
  if (planned === actual) return 1;
  if (sportFamily(planned) === sportFamily(actual)) return 0.6;
  return 0;
}

export function scoreDuration(
  plannedDurationMin: number,
  actualDurationMin: number,
  window: MatchWindow = {},
): number {
  if (plannedDurationMin <= 0) return actualDurationMin <= 0 ? 1 : 0;

  const ratioDelta =
    Math.abs(actualDurationMin - plannedDurationMin) / plannedDurationMin;
  const mediumTolerance = Math.max(
    window.durationMinTolerancePct ?? 0.35,
    (window.durationMinMinAbsolute ?? 10) / plannedDurationMin,
  );

  if (ratioDelta <= 0.15) return 1;
  if (ratioDelta <= mediumTolerance) return 0.6;
  if (ratioDelta <= 0.6) return 0.2;
  return 0;
}

export function scoreIntensity(
  plannedIntensity: PlannedIntensity | undefined,
  activity: ActivityIntensityInput,
): number {
  const plannedStep = plannedIntensityStep(plannedIntensity);
  const actualStep = deriveActualIntensityStep(activity);
  if (plannedStep === null || actualStep === null) return 1;

  const stepDelta = Math.abs(actualStep - plannedStep);
  if (stepDelta === 0) return 1;
  if (stepDelta === 1) return 0.6;
  return 0.2;
}

export function scoreActivityMatch(
  planned: PlannedMatchInput,
  activity: ActivityMatchInput,
  window: MatchWindow = {},
): MatchScore {
  const sportTypeScore = scoreSportType(planned.sportType, activity.sportType);
  const durationScore = scoreDuration(
    planned.durationMin,
    activity.durationMin,
    window,
  );
  const intensityScore = scoreIntensity(planned.intensity, activity);

  return {
    activity,
    sportTypeScore,
    durationScore,
    intensityScore,
    score: (sportTypeScore + durationScore + intensityScore) / 3,
  };
}
