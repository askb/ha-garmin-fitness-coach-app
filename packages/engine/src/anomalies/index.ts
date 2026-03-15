import type { DailyMetricInput, AnomalyAlert } from "../types";
import type { Baselines } from "../types";

/**
 * Detect anomalies in recent metrics that warrant alerts or deload.
 */
export function detectAnomalies(
  recentMetrics: DailyMetricInput[], // most recent first
  baselines: Baselines,
  recentStrainScores: number[],
): AnomalyAlert[] {
  const alerts: AnomalyAlert[] = [];

  // HRV crash: > 25% below baseline for 2+ consecutive days
  const hrvCrashDays = countConsecutiveDaysBelow(
    recentMetrics.map((m) => m.hrv),
    baselines.hrv * 0.75,
  );
  if (hrvCrashDays >= 2) {
    alerts.push({
      type: "hrv_crash",
      severity: hrvCrashDays >= 3 ? "critical" : "warning",
      message: `HRV has been >25% below your baseline for ${hrvCrashDays} consecutive days.`,
      recommendation: "Consider a deload week — reduce training volume by 40-50%.",
    });
  }

  // RHR spike: > 5 bpm above baseline for 2+ days
  const rhrSpikeDays = countConsecutiveDaysAbove(
    recentMetrics.map((m) => m.restingHr),
    baselines.restingHr + 5,
  );
  if (rhrSpikeDays >= 2) {
    alerts.push({
      type: "rhr_spike",
      severity: rhrSpikeDays >= 3 ? "critical" : "warning",
      message: `Resting HR has been 5+ bpm above baseline for ${rhrSpikeDays} days.`,
      recommendation: "Reduce planned intensity. This may indicate illness, stress, or overtraining.",
    });
  }

  // Sleep deficit: < 6h for 3+ consecutive nights
  const sleepDeficitDays = countConsecutiveDaysBelow(
    recentMetrics.map((m) => m.totalSleepMinutes),
    360, // 6 hours
  );
  if (sleepDeficitDays >= 3) {
    alerts.push({
      type: "sleep_deficit",
      severity: "critical",
      message: `You've slept less than 6 hours for ${sleepDeficitDays} consecutive nights.`,
      recommendation: "Force a rest day. Prioritize sleep — readiness will not improve without it.",
    });
  }

  // Overreaching: ACWR > 1.5
  if (recentStrainScores.length >= 3) {
    const acute = recentStrainScores.slice(0, 3).reduce((a, b) => a + b, 0) / 3;
    const chronicDays = Math.min(recentStrainScores.length, 7);
    const chronic = recentStrainScores.slice(0, chronicDays).reduce((a, b) => a + b, 0) / chronicDays;
    if (chronic > 0 && acute / chronic > 1.5) {
      alerts.push({
        type: "overreaching",
        severity: "critical",
        message: `Acute:Chronic workload ratio is ${(acute / chronic).toFixed(1)} — high injury risk.`,
        recommendation: "Cap daily strain at 8. Focus on recovery for the next 2-3 days.",
      });
    }
  }

  return alerts;
}

function countConsecutiveDaysBelow(
  values: (number | null)[],
  threshold: number,
): number {
  let count = 0;
  for (const v of values) {
    if (v !== null && v < threshold) {
      count++;
    } else {
      break;
    }
  }
  return count;
}

function countConsecutiveDaysAbove(
  values: (number | null)[],
  threshold: number,
): number {
  let count = 0;
  for (const v of values) {
    if (v !== null && v > threshold) {
      count++;
    } else {
      break;
    }
  }
  return count;
}
