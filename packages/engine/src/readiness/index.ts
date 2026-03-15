import type {
  Baselines,
  DailyMetricInput,
  ReadinessComponents,
  ReadinessResult,
  ReadinessZone,
} from "../types";
import { computeACWR, countConsecutiveHardDays } from "../strain";

// ---- Component Scorers (each returns 0–100) ----

export function scoreSleepQuantity(
  totalSleepMinutes: number | null,
  baselineSleep: number,
): number {
  if (totalSleepMinutes === null || baselineSleep <= 0) return 50;
  const ratio = totalSleepMinutes / baselineSleep;
  if (ratio >= 1.0) return 100;
  if (ratio >= 0.85) return 70 + ((ratio - 0.85) / 0.15) * 30;
  if (ratio >= 0.7) return 40 + ((ratio - 0.7) / 0.15) * 30;
  return (ratio / 0.7) * 40;
}

export function scoreSleepQuality(metric: DailyMetricInput): number {
  // Use Garmin sleep score if available
  if (metric.sleepScore !== null) return Math.min(100, Math.max(0, metric.sleepScore));

  // Otherwise compute from sleep stages
  const total = metric.totalSleepMinutes;
  if (total === null || total === 0) return 50;

  const deep = metric.deepSleepMinutes ?? 0;
  const rem = metric.remSleepMinutes ?? 0;
  const awake = metric.awakeMinutes ?? 0;

  const deepRemRatio = (deep + rem) / total;
  const efficiency = total > 0 ? (total - awake) / (total + awake) : 0.8;

  return Math.min(100, Math.max(0, deepRemRatio * 60 + efficiency * 40) * 100 / 100);
}

export function scoreHRV(
  todayHrv: number | null,
  baselineHrv: number,
): number {
  if (todayHrv === null || baselineHrv <= 0) return 50;
  const ratio = todayHrv / baselineHrv;
  if (ratio >= 1.1) return 100;
  if (ratio >= 1.0) return 80 + ((ratio - 1.0) / 0.1) * 20;
  if (ratio >= 0.9) return 60 + ((ratio - 0.9) / 0.1) * 20;
  if (ratio >= 0.75) return 30 + ((ratio - 0.75) / 0.15) * 30;
  return (ratio / 0.75) * 30;
}

export function scoreRestingHR(
  todayRhr: number | null,
  baselineRhr: number,
): number {
  if (todayRhr === null || baselineRhr <= 0) return 50;
  const delta = todayRhr - baselineRhr;
  if (delta <= -3) return 100;
  if (delta <= 0) return 80 + (Math.abs(delta) / 3) * 20;
  if (delta <= 3) return 60 - (delta / 3) * 20;
  if (delta <= 7) return 30 - ((delta - 3) / 4) * 30;
  return Math.max(0, 10 - (delta - 7) * 2);
}

export function scoreTrainingLoad(
  recentStrainScores: number[], // most recent first
): number {
  const acwr = computeACWR(recentStrainScores);
  const consecutiveHard = countConsecutiveHardDays(recentStrainScores);

  let score: number;
  if (acwr >= 0.8 && acwr <= 1.3) {
    score = 80 + (1.0 - Math.abs(acwr - 1.05)) * 40;
  } else if (acwr < 0.8) {
    score = 70; // under-trained, still okay
  } else if (acwr <= 1.5) {
    score = 50 - (acwr - 1.3) * 100;
  } else {
    score = Math.max(0, 30 - (acwr - 1.5) * 60);
  }

  // Penalize consecutive hard days
  if (consecutiveHard >= 3) score -= 15;
  else if (consecutiveHard >= 2) score -= 5;

  return Math.min(100, Math.max(0, score));
}

export function scoreStressAndBattery(
  stressScore: number | null,
  bodyBatteryStart: number | null,
): number {
  const stressNormalized =
    stressScore !== null ? 100 - Math.min(100, Math.max(0, stressScore)) : 50;
  const batteryScore =
    bodyBatteryStart !== null ? Math.min(100, Math.max(0, bodyBatteryStart)) : 50;

  return stressNormalized * 0.4 + batteryScore * 0.6;
}

// ---- Zone Classification ----

export function getReadinessZone(score: number): ReadinessZone {
  if (score >= 80) return "prime";
  if (score >= 60) return "high";
  if (score >= 40) return "moderate";
  if (score >= 20) return "low";
  return "poor";
}

export function getZoneColor(zone: ReadinessZone): string {
  switch (zone) {
    case "prime": return "#22c55e";    // green-500
    case "high": return "#14b8a6";     // teal-500
    case "moderate": return "#eab308"; // yellow-500
    case "low": return "#f97316";      // orange-500
    case "poor": return "#ef4444";     // red-500
  }
}

// ---- Explanation Generator ----

function generateExplanation(
  components: ReadinessComponents,
  baselines: Baselines,
  metric: DailyMetricInput,
): string {
  const factors: { label: string; impact: number }[] = [];

  // Identify top positive/negative factors
  if (components.hrv > 80 && metric.hrv !== null) {
    const pct = Math.round(((metric.hrv / baselines.hrv) - 1) * 100);
    factors.push({ label: `HRV ${pct > 0 ? pct + "% above" : Math.abs(pct) + "% below"} baseline`, impact: components.hrv - 50 });
  } else if (components.hrv < 40 && metric.hrv !== null) {
    const pct = Math.round((1 - (metric.hrv / baselines.hrv)) * 100);
    factors.push({ label: `HRV ${pct}% below baseline`, impact: components.hrv - 50 });
  }

  if (components.sleepQuantity < 40 && metric.totalSleepMinutes !== null) {
    const hours = (metric.totalSleepMinutes / 60).toFixed(1);
    factors.push({ label: `only ${hours}h sleep`, impact: components.sleepQuantity - 50 });
  } else if (components.sleepQuantity > 80 && metric.totalSleepMinutes !== null) {
    const hours = (metric.totalSleepMinutes / 60).toFixed(1);
    factors.push({ label: `${hours}h quality sleep`, impact: components.sleepQuantity - 50 });
  }

  if (components.trainingLoad < 40) {
    factors.push({ label: "high recent training load", impact: components.trainingLoad - 50 });
  }

  if (components.stress < 40) {
    factors.push({ label: "elevated stress", impact: components.stress - 50 });
  }

  if (components.restingHr < 40) {
    factors.push({ label: "resting HR above baseline", impact: components.restingHr - 50 });
  }

  // Sort by absolute impact
  factors.sort((a, b) => Math.abs(b.impact) - Math.abs(a.impact));

  const top = factors.slice(0, 2);
  if (top.length === 0) return "Metrics are close to your baseline — normal training day.";

  const parts = top.map((f) => f.label);
  const zone = getReadinessZone(
    components.sleepQuantity * 0.2 +
    components.sleepQuality * 0.15 +
    components.hrv * 0.25 +
    components.restingHr * 0.1 +
    components.trainingLoad * 0.2 +
    components.stress * 0.1,
  );

  const zoneAdvice: Record<ReadinessZone, string> = {
    prime: "great day for intensity",
    high: "normal training day",
    moderate: "consider a moderate session",
    low: "take it easy today",
    poor: "rest or light recovery only",
  };

  return `${parts.join(" and ")} → ${zoneAdvice[zone]}.`;
}

// ---- Main Calculator ----

const WEIGHTS = {
  sleepQuantity: 0.2,
  sleepQuality: 0.15,
  hrv: 0.25,
  restingHr: 0.1,
  trainingLoad: 0.2,
  stress: 0.1,
} as const;

export function calculateReadiness(input: {
  todayMetrics: DailyMetricInput;
  recentStrainScores: number[]; // most recent first, last 7 days
  baselines: Baselines;
}): ReadinessResult {
  const { todayMetrics, recentStrainScores, baselines } = input;

  const components: ReadinessComponents = {
    sleepQuantity: scoreSleepQuantity(todayMetrics.totalSleepMinutes, baselines.sleep),
    sleepQuality: scoreSleepQuality(todayMetrics),
    hrv: scoreHRV(todayMetrics.hrv, baselines.hrv),
    restingHr: scoreRestingHR(todayMetrics.restingHr, baselines.restingHr),
    trainingLoad: scoreTrainingLoad(recentStrainScores),
    stress: scoreStressAndBattery(todayMetrics.stressScore, todayMetrics.bodyBatteryStart),
  };

  const rawScore =
    components.sleepQuantity * WEIGHTS.sleepQuantity +
    components.sleepQuality * WEIGHTS.sleepQuality +
    components.hrv * WEIGHTS.hrv +
    components.restingHr * WEIGHTS.restingHr +
    components.trainingLoad * WEIGHTS.trainingLoad +
    components.stress * WEIGHTS.stress;

  const score = Math.round(Math.min(100, Math.max(0, rawScore)));
  const zone = getReadinessZone(score);
  const color = getZoneColor(zone);
  const explanation = generateExplanation(components, baselines, todayMetrics);

  return { score, zone, color, explanation, components };
}
