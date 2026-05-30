import type { TrendAnalysis } from "../types";

/**
 * TIME-SERIES FORECASTING (local, dependency-free)
 *
 * Projects training-load trajectory (CTL/ATL/TSB/ACWR) and arbitrary
 * metric series (e.g. VO2max) into the near future without any heavy ML
 * dependency. Two complementary techniques:
 *
 *   1. PMC projection — continue the Banister EWMA recursion forward under
 *      an assumed future-load scenario. Because CTL/ATL are exponentially
 *      weighted moving averages, their future path is deterministic once a
 *      future daily-load assumption is fixed.
 *   2. Linear (least-squares) extrapolation with a prediction interval —
 *      for slowly-varying physiological metrics where a local linear trend
 *      is a reasonable short-horizon model.
 *
 * All functions are pure and operate on plain arrays so they are trivially
 * testable and safe to run on the addon's modest hardware.
 */

// Banister smoothing constants — must match computeDailyPMCSeries in ../strain.
const ALPHA_CTL = 2 / (42 + 1);
const ALPHA_ATL = 2 / (7 + 1);

export type LoadScenario = "maintain" | "rest" | "rampUp" | "rampDown";

export interface ProjectedPMCDay {
  /** 1-based offset from the last observed day (day 1 = tomorrow). */
  dayOffset: number;
  ctl: number;
  atl: number;
  tsb: number;
  acwr: number;
  /** Assumed daily load that produced this row. */
  assumedLoad: number;
}

export interface PMCForecast {
  scenario: LoadScenario;
  /** Mean daily load assumed across the horizon. */
  assumedDailyLoad: number;
  days: ProjectedPMCDay[];
}

/**
 * Derive a per-day future load array for a named scenario.
 *
 * The baseline is the recent 7-day average load (a "maintenance" load).
 *   - maintain : flat at the recent average
 *   - rest     : zero load (full taper / detraining)
 *   - rampUp   : +8 %/week applied cumulatively (aggressive build)
 *   - rampDown : -10 %/week applied cumulatively (deliberate taper)
 */
export function buildScenarioLoads(
  recentDailyLoads: number[],
  horizonDays: number,
  scenario: LoadScenario,
): number[] {
  const window = recentDailyLoads.slice(-7);
  const baseline =
    window.length > 0 ? window.reduce((s, v) => s + v, 0) / window.length : 0;

  const loads: number[] = [];
  for (let d = 1; d <= horizonDays; d++) {
    const weeks = d / 7;
    let load: number;
    switch (scenario) {
      case "rest":
        load = 0;
        break;
      case "rampUp":
        load = baseline * Math.pow(1.08, weeks);
        break;
      case "rampDown":
        load = baseline * Math.pow(0.9, weeks);
        break;
      default:
        load = baseline;
    }
    loads.push(Math.max(0, load));
  }
  return loads;
}

/**
 * Project CTL/ATL/TSB/ACWR forward from an observed daily-load history.
 *
 * @param dailyStressScores Observed daily loads, oldest first (zero-padded
 *                          rest days), identical to computeDailyPMCSeries input.
 * @param horizonDays       Number of future days to project.
 * @param scenarioOrLoads   A named LoadScenario, or an explicit array of
 *                          future daily loads (length should be >= horizon).
 */
export function projectPMC(
  dailyStressScores: number[],
  horizonDays: number,
  scenarioOrLoads: LoadScenario | number[] = "maintain",
): PMCForecast {
  const scenario: LoadScenario = Array.isArray(scenarioOrLoads)
    ? "maintain"
    : scenarioOrLoads;

  const futureLoads = Array.isArray(scenarioOrLoads)
    ? scenarioOrLoads.slice(0, horizonDays)
    : buildScenarioLoads(dailyStressScores, horizonDays, scenarioOrLoads);

  // Seed CTL/ATL from the observed history.
  let ctl = dailyStressScores.length > 0 ? dailyStressScores[0]! : 0;
  let atl = ctl;
  for (let i = 1; i < dailyStressScores.length; i++) {
    ctl = ALPHA_CTL * dailyStressScores[i]! + (1 - ALPHA_CTL) * ctl;
    atl = ALPHA_ATL * dailyStressScores[i]! + (1 - ALPHA_ATL) * atl;
  }

  // Rolling buffer for ACWR (last 27 observed + projected loads).
  const loadBuffer = dailyStressScores.slice(-27);

  const days: ProjectedPMCDay[] = [];
  for (let d = 0; d < horizonDays; d++) {
    const load = futureLoads[d] ?? 0;
    ctl = ALPHA_CTL * load + (1 - ALPHA_CTL) * ctl;
    atl = ALPHA_ATL * load + (1 - ALPHA_ATL) * atl;

    loadBuffer.push(load);
    const acute = loadBuffer.slice(-7);
    const chronic = loadBuffer.slice(-28);
    const acute7 = acute.reduce((s, v) => s + v, 0) / Math.max(1, acute.length);
    const chronic28 =
      chronic.reduce((s, v) => s + v, 0) / Math.max(1, chronic.length);
    const acwr =
      chronic28 === 0 ? (acute7 > 0 ? 2.0 : 1.0) : acute7 / chronic28;

    days.push({
      dayOffset: d + 1,
      ctl: Math.round(ctl * 100) / 100,
      atl: Math.round(atl * 100) / 100,
      tsb: Math.round((ctl - atl) * 100) / 100,
      acwr: Math.round(acwr * 1000) / 1000,
      assumedLoad: Math.round(load * 100) / 100,
    });
  }

  const assumedDailyLoad =
    futureLoads.length > 0
      ? Math.round(
          (futureLoads.reduce((s, v) => s + v, 0) / futureLoads.length) * 100,
        ) / 100
      : 0;

  return { scenario, assumedDailyLoad, days };
}

export interface LinearForecastPoint {
  /** 1-based offset from the last observed day. */
  dayOffset: number;
  value: number;
  /** Lower / upper bound of the ~95 % prediction interval. */
  lower: number;
  upper: number;
}

export interface LinearForecast {
  points: LinearForecastPoint[];
  /** Slope expressed per week for human-readable framing. */
  slopePerWeek: number;
  rSquared: number;
  confidence: TrendAnalysis["significance"];
}

/**
 * Least-squares linear extrapolation of a daily metric with a prediction
 * interval derived from the in-sample residual standard deviation.
 *
 * Returns null when there is insufficient data (< 7 points) — callers should
 * treat that as "not enough history to forecast".
 *
 * @param values       { date, value } sorted oldest first.
 * @param horizonDays  Future days to project.
 */
export function linearForecast(
  values: Array<{ date: string; value: number }>,
  horizonDays: number,
): LinearForecast | null {
  if (values.length < 7 || horizonDays < 1) return null;

  const startMs = new Date(values[0]!.date).getTime();
  const dayMs = 1000 * 60 * 60 * 24;
  const points = values.map((v) => ({
    x: (new Date(v.date).getTime() - startMs) / dayMs,
    y: v.value,
  }));

  const n = points.length;
  const sumX = points.reduce((s, p) => s + p.x, 0);
  const sumY = points.reduce((s, p) => s + p.y, 0);
  const sumXY = points.reduce((s, p) => s + p.x * p.y, 0);
  const sumXX = points.reduce((s, p) => s + p.x * p.x, 0);

  const denom = n * sumXX - sumX * sumX;
  if (denom === 0) return null;

  const slope = (n * sumXY - sumX * sumY) / denom;
  const intercept = (sumY - slope * sumX) / n;

  const ssRes = points.reduce(
    (s, p) => s + (p.y - (intercept + slope * p.x)) ** 2,
    0,
  );
  const meanY = sumY / n;
  const ssTot = points.reduce((s, p) => s + (p.y - meanY) ** 2, 0);
  const rSquared = ssTot > 0 ? 1 - ssRes / ssTot : 0;

  // Residual standard deviation → ~95 % prediction band (±1.96σ).
  const residualSd = Math.sqrt(ssRes / Math.max(1, n - 2));
  const bandWidth = 1.96 * residualSd;

  const lastX = points[n - 1]!.x;
  const pts: LinearForecastPoint[] = [];
  for (let d = 1; d <= horizonDays; d++) {
    const x = lastX + d;
    const value = intercept + slope * x;
    pts.push({
      dayOffset: d,
      value: Math.round(value * 100) / 100,
      lower: Math.round((value - bandWidth) * 100) / 100,
      upper: Math.round((value + bandWidth) * 100) / 100,
    });
  }

  const confidence: TrendAnalysis["significance"] =
    n >= 30 && rSquared >= 0.3
      ? "high"
      : n >= 14 && rSquared >= 0.15
        ? "medium"
        : "low";

  return {
    points: pts,
    slopePerWeek: Math.round(slope * 7 * 100) / 100,
    rSquared: Math.round(rSquared * 1000) / 1000,
    confidence,
  };
}

export interface RaceReadinessWindow {
  /** First future day (offset) where TSB enters the freshness band. */
  startDayOffset: number;
  /** Last contiguous day still inside the band. */
  endDayOffset: number;
  /** Peak TSB within the window. */
  peakTsb: number;
}

/**
 * Find the first contiguous window in a projected TSB series where form sits
 * inside the race-ready freshness band.
 *
 * The conventional peaking band is roughly TSB +5 … +25: fresh enough to race
 * but not so detrained that fitness has bled away.
 */
export function findRaceReadinessWindow(
  projected: ProjectedPMCDay[],
  band: { min: number; max: number } = { min: 5, max: 25 },
): RaceReadinessWindow | null {
  let start = -1;
  let peak = -Infinity;
  for (let i = 0; i < projected.length; i++) {
    const tsb = projected[i]!.tsb;
    const inBand = tsb >= band.min && tsb <= band.max;
    if (inBand) {
      if (start === -1) {
        start = projected[i]!.dayOffset;
        peak = tsb;
      } else if (tsb > peak) {
        peak = tsb;
      }
    } else if (start !== -1) {
      return {
        startDayOffset: start,
        endDayOffset: projected[i - 1]!.dayOffset,
        peakTsb: Math.round(peak * 100) / 100,
      };
    }
  }
  if (start !== -1) {
    return {
      startDayOffset: start,
      endDayOffset: projected[projected.length - 1]!.dayOffset,
      peakTsb: Math.round(peak * 100) / 100,
    };
  }
  return null;
}
