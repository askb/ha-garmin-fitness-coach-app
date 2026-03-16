import type {
  TrainingStatusType,
  TrainingStatusResult,
  TrainingLoadMetrics,
} from "../types";

/**
 * TRAINING STATUS CLASSIFICATION
 *
 * Determines whether an athlete's training is productive, maintaining,
 * detraining, overreaching, peaking, or in recovery.
 *
 * Based on the interaction between:
 * 1. VO2max trend (fitness trajectory)
 * 2. Training load (CTL/ATL/TSB/ACWR)
 *
 * Ref: Meeusen R et al. Prevention, diagnosis, and treatment of the
 *      overtraining syndrome: Joint consensus statement of the ECSS and
 *      the ACSM. Eur J Sport Sci. 2013;13(1):1-24.
 *
 * Ref: Mujika I, Padilla S. Scientific bases for precompetition tapering
 *      strategies. Med Sci Sports Exerc. 2003;35(7):1182-1187.
 *   → Taper = 41-60% volume reduction over 2 weeks optimizes performance
 *
 * Classification matrix:
 * ┌─────────────────┬───────────────┬───────────────┬──────────────────┐
 * │                 │ VO2max ↑      │ VO2max →      │ VO2max ↓         │
 * ├─────────────────┼───────────────┼───────────────┼──────────────────┤
 * │ Load optimal    │ Productive    │ Maintaining   │ Unproductive     │
 * │ Load low        │ Recovery      │ Detraining    │ Detraining       │
 * │ Load high       │ Productive*   │ Overreaching  │ Overreaching     │
 * │ Load tapering   │ Peaking       │ Peaking       │ Recovery         │
 * └─────────────────┴───────────────┴───────────────┴──────────────────┘
 * * If load is high AND VO2max improving, athlete is adapting well
 */
export function classifyTrainingStatus(
  vo2maxTrend: number, // ml/kg/min change over 4 weeks (positive = improving)
  loadMetrics: TrainingLoadMetrics,
): TrainingStatusResult {
  const { acwr, tsb, rampRate } = loadMetrics;

  // Determine load category
  const loadCategory = categorizeLoad(acwr, rampRate, tsb);

  // Determine VO2max direction
  // Thresholds: >0.5 per 4wk = improving, <-0.5 = declining
  const vo2maxDirection =
    vo2maxTrend > 0.5 ? "up" : vo2maxTrend < -0.5 ? "down" : "stable";

  let status: TrainingStatusType;
  let explanation: string;
  let recommendation: string;

  if (loadCategory === "tapering") {
    if (vo2maxDirection === "down") {
      status = "recovery";
      explanation =
        "Training load is reduced and VO2max is declining. Your body may need more recovery time.";
      recommendation =
        "Continue reduced training. If VO2max doesn't stabilize in 1-2 weeks, gradually increase load.";
    } else {
      status = "peaking";
      explanation =
        "You're tapering with maintained or improving fitness — ideal pre-competition state.";
      recommendation =
        "Maintain current taper. This is the optimal window for a race or key workout. (Mujika & Padilla 2003)";
    }
  } else if (loadCategory === "low") {
    if (vo2maxDirection === "up") {
      status = "recovery";
      explanation =
        "Low training load but fitness is still improving — likely recovering from a hard block.";
      recommendation =
        "Good recovery phase. Begin gradually increasing load when readiness scores return to 'High' or 'Prime'.";
    } else {
      status = "detraining";
      explanation =
        "Training load has been insufficient to maintain fitness. VO2max is stable or declining.";
      recommendation =
        "Gradually increase training volume. Aim for ACWR 0.8-1.0 over the next 2 weeks. Avoid sudden spikes.";
    }
  } else if (loadCategory === "high") {
    if (vo2maxDirection === "up") {
      status = "productive";
      explanation =
        "High training load AND improving VO2max — your body is adapting well to the stimulus.";
      recommendation =
        "Continue current approach but monitor recovery closely. Ensure adequate sleep and nutrition.";
    } else {
      status = "overreaching";
      explanation =
        "Training load is high but fitness is not improving or declining — signs of functional overreaching.";
      recommendation =
        "Reduce volume by 30-40% for 1-2 weeks. (Meeusen et al. 2013: functional overreaching is recoverable with adequate rest)";
    }
  } else {
    // Optimal load
    if (vo2maxDirection === "up") {
      status = "productive";
      explanation =
        "Training load is well-managed and VO2max is improving. Excellent training adaptation.";
      recommendation =
        "Stay the course! Gradually progress load by 5-8% per week maximum.";
    } else if (vo2maxDirection === "down") {
      status = "unproductive";
      explanation =
        "Training load appears adequate but VO2max is declining. May indicate non-training stressors (sleep, nutrition, illness).";
      recommendation =
        "Review recovery factors: sleep quality, nutrition, life stress. Consider a 3-5 day deload.";
    } else {
      status = "maintaining";
      explanation =
        "Training load and fitness are both stable. Good for maintenance phases.";
      recommendation =
        "If you want to improve, gradually increase either volume or intensity (not both). If maintaining is the goal, continue as-is.";
    }
  }

  return { status, vo2maxTrend, explanation, recommendation };
}

function categorizeLoad(
  acwr: number,
  rampRate: number,
  tsb: number,
): "low" | "optimal" | "high" | "tapering" {
  // Tapering: TSB becoming more positive (freshening up) + decreasing load
  if (tsb > 10 && rampRate < -2) return "tapering";

  // Low load: ACWR < 0.6 (Gabbett 2016)
  if (acwr < 0.6) return "low";

  // High load: ACWR > 1.3 or ramp rate > 8 pts/week (Coggan guideline)
  if (acwr > 1.3 || rampRate > 8) return "high";

  // Optimal: ACWR 0.8-1.3 (Hulin et al. 2016)
  return "optimal";
}

/**
 * Estimate recovery time in hours.
 *
 * Based on session type and current readiness:
 *
 * Ref: Hausswirth C, Mujika I. Recovery for Performance in Sport.
 *      Human Kinetics, 2013.
 *
 * Base recovery by session intensity:
 * - Easy/recovery: 12-24h
 * - Moderate (tempo, sweet spot): 24-48h
 * - Hard (VO2max intervals, heavy strength): 48-72h
 * - Maximal (race, all-out test): 72-96h
 *
 * Modifiers:
 * - Readiness > 80 (Prime): -20% recovery time
 * - Readiness 60-80 (High): no modifier
 * - Readiness 40-60 (Moderate): +20% recovery time
 * - Readiness < 40 (Low/Poor): +40% recovery time
 * - Age > 40: +10% per decade over 40
 * - Sleep debt > 60 min: +15%
 */
export function estimateRecoveryTime(
  sessionStrain: number,
  readinessScore: number,
  age: number | null,
  sleepDebtMinutes: number | null,
): { hoursUntilRecovered: number; factors: string[] } {
  const factors: string[] = [];

  // Base recovery from strain level (Hausswirth & Mujika 2013)
  let baseHours: number;
  if (sessionStrain <= 5) {
    baseHours = 18; // easy session
    factors.push("Easy session: base 12-24h recovery");
  } else if (sessionStrain <= 10) {
    baseHours = 36; // moderate session
    factors.push("Moderate session: base 24-48h recovery");
  } else if (sessionStrain <= 16) {
    baseHours = 60; // hard session
    factors.push("Hard session: base 48-72h recovery");
  } else {
    baseHours = 84; // maximal effort
    factors.push("Maximal effort: base 72-96h recovery");
  }

  // Readiness modifier
  let modifier = 1.0;
  if (readinessScore >= 80) {
    modifier *= 0.8;
    factors.push("Prime readiness: -20% recovery");
  } else if (readinessScore >= 60) {
    // No modifier
  } else if (readinessScore >= 40) {
    modifier *= 1.2;
    factors.push("Moderate readiness: +20% recovery");
  } else {
    modifier *= 1.4;
    factors.push("Low readiness: +40% recovery");
  }

  // Age modifier (10% per decade over 40)
  if (age !== null && age > 40) {
    const decades = (age - 40) / 10;
    modifier *= 1 + decades * 0.1;
    factors.push(`Age ${age}: +${Math.round(decades * 10)}% recovery`);
  }

  // Sleep debt modifier
  if (sleepDebtMinutes !== null && sleepDebtMinutes > 60) {
    modifier *= 1.15;
    factors.push("Sleep debt >1h: +15% recovery");
  }

  const hoursUntilRecovered = Math.round(baseHours * modifier);

  return {
    hoursUntilRecovered: Math.min(96, Math.max(6, hoursUntilRecovered)),
    factors,
  };
}
