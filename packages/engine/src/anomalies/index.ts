import type { AnomalyAlert, Baselines, DailyMetricInput } from "../types";
import { computeZScore } from "../baselines";

/**
 * ANOMALY DETECTION — Evidence-Based Alert System
 *
 * Detects patterns in recent metrics that warrant alerts, deload,
 * or medical attention.
 *
 * Each alert includes the sport science citation for its threshold.
 */

/**
 * Detect anomalies in recent metrics that warrant alerts or deload.
 */
export function detectAnomalies(
  recentMetrics: DailyMetricInput[], // most recent first
  baselines: Baselines,
  recentStrainScores: number[],
): AnomalyAlert[] {
  const alerts: AnomalyAlert[] = [];

  // ---------- HRV Crash ----------
  // Trigger: HRV > 1.5 SD below baseline for 2+ consecutive days
  //
  // Ref: Buchheit M. Monitoring training status with HR measures.
  //      IJSPP. 2014;9:883-895.
  //   → "A meaningful change in lnRMSSD requires >1 × CV (≈1 SD)"
  //
  // Ref: Plews DJ et al. (2013) — sustained HRV depression in elite
  //      rowers correlated with maladaptive training response.
  //
  // Using 1.5 SD (more conservative than Buchheit's 1 SD SWC)
  // to reduce false positives.
  const hrvCrashDays =
    baselines.hrvSD > 0
      ? countConsecutiveDaysBelowZScore(
          recentMetrics.map((m) => m.hrv),
          baselines.hrv,
          baselines.hrvSD,
          -1.5,
        )
      : countConsecutiveDaysBelow(
          recentMetrics.map((m) => m.hrv),
          baselines.hrv * 0.75,
        );

  if (hrvCrashDays >= 2) {
    alerts.push({
      type: "hrv_crash",
      severity: hrvCrashDays >= 3 ? "critical" : "warning",
      message: `HRV has been significantly below your baseline for ${hrvCrashDays} consecutive days.`,
      recommendation:
        hrvCrashDays >= 3
          ? "Consider a deload week — reduce training volume by 40-50%. If persistent, consult a physician."
          : "Reduce training intensity for the next 2-3 days. Prioritize sleep and recovery.",
      citation:
        "Buchheit M. IJSPP. 2014;9:883-895. Plews DJ et al. IJSPP. 2013;8(6):688-694.",
    });
  }

  // ---------- RHR Spike ----------
  // Trigger: RHR > 1.5 SD above baseline for 2+ days
  //
  // Ref: Meeusen R et al. Prevention, diagnosis, and treatment of the
  //      overtraining syndrome: ECSS position statement.
  //      Eur J Sport Sci. 2013;13(1):1-24.
  //   → "Elevated resting heart rate is one of the most commonly cited
  //      indicators of overtraining or illness."
  //   → Clinical significance typically at 5-10 bpm above baseline
  //
  // Using z-score when SD available, otherwise fallback to +5 bpm
  const rhrSpikeDays =
    baselines.restingHrSD > 0
      ? countConsecutiveDaysAboveZScore(
          recentMetrics.map((m) => m.restingHr),
          baselines.restingHr,
          baselines.restingHrSD,
          1.5,
        )
      : countConsecutiveDaysAbove(
          recentMetrics.map((m) => m.restingHr),
          baselines.restingHr + 5,
        );

  if (rhrSpikeDays >= 2) {
    alerts.push({
      type: "rhr_spike",
      severity: rhrSpikeDays >= 3 ? "critical" : "warning",
      message: `Resting HR has been significantly above baseline for ${rhrSpikeDays} days.`,
      recommendation:
        "Reduce planned intensity. This may indicate illness, stress, or overtraining. If accompanied by fatigue, consider medical evaluation.",
      citation: "Meeusen R et al. Eur J Sport Sci. 2013;13(1):1-24.",
    });
  }

  // ---------- Sleep Deficit ----------
  // Trigger: < 6h for 3+ consecutive nights
  //
  // Ref: Hirshkowitz M et al. National Sleep Foundation's sleep time
  //      duration recommendations. Sleep Health. 2015;1(1):40-43.
  //   → <6 hours is "not recommended" for any adult age group
  //
  // Ref: Mah CD et al. (2011) — sleep restriction impairs sprint times,
  //      reaction time, and mood in athletes.
  const sleepDeficitDays = countConsecutiveDaysBelow(
    recentMetrics.map((m) => m.totalSleepMinutes),
    360, // 6 hours (Hirshkowitz: "not recommended" threshold)
  );
  if (sleepDeficitDays >= 3) {
    alerts.push({
      type: "sleep_deficit",
      severity: "critical",
      message: `You've slept less than 6 hours for ${sleepDeficitDays} consecutive nights.`,
      recommendation:
        "Force a rest day. Prioritize sleep — performance and recovery will not improve without adequate sleep (Hirshkowitz et al. 2015).",
      citation:
        "Hirshkowitz M et al. Sleep Health. 2015;1(1):40-43. Mah CD et al. Sleep. 2011;34(7):943-950.",
    });
  }

  // ---------- Overreaching (ACWR) ----------
  // Trigger: ACWR > 1.5
  //
  // Ref: Hulin BT et al. The acute:chronic workload ratio predicts injury.
  //      Br J Sports Med. 2016;50(4):231-236.
  //   → ACWR > 1.5 = significantly elevated injury risk
  //
  // Ref: Gabbett TJ. The training—injury prevention paradox.
  //      Br J Sports Med. 2016;50(5):273-280.
  if (recentStrainScores.length >= 7) {
    const acuteDays = Math.min(recentStrainScores.length, 7);
    const acute =
      recentStrainScores.slice(0, acuteDays).reduce((a, b) => a + b, 0) /
      acuteDays;
    const chronicDays = Math.min(recentStrainScores.length, 28);
    const chronic =
      recentStrainScores.slice(0, chronicDays).reduce((a, b) => a + b, 0) /
      chronicDays;
    if (chronic > 0 && acute / chronic > 1.5) {
      alerts.push({
        type: "overreaching",
        severity: "critical",
        message: `Acute:Chronic workload ratio is ${(acute / chronic).toFixed(1)} — high injury risk zone.`,
        recommendation:
          "Reduce training volume significantly for the next 3-5 days. Aim for ACWR < 1.3 before resuming normal training (Hulin et al. 2016).",
        citation:
          "Hulin BT et al. Br J Sports Med. 2016;50(4):231-236. Gabbett TJ. Br J Sports Med. 2016;50(5):273-280.",
      });
    }
  }

  return alerts;
}

// ---------- Helper functions ----------

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

/**
 * Count consecutive days where z-score is below threshold.
 * Uses individual z-score approach (Buchheit 2014).
 */
function countConsecutiveDaysBelowZScore(
  values: (number | null)[],
  mean: number,
  sd: number,
  zThreshold: number,
): number {
  let count = 0;
  for (const v of values) {
    if (v !== null) {
      const z = computeZScore(v, mean, sd);
      if (z < zThreshold) {
        count++;
      } else {
        break;
      }
    } else {
      break;
    }
  }
  return count;
}

/**
 * Count consecutive days where z-score is above threshold.
 */
function countConsecutiveDaysAboveZScore(
  values: (number | null)[],
  mean: number,
  sd: number,
  zThreshold: number,
): number {
  let count = 0;
  for (const v of values) {
    if (v !== null) {
      const z = computeZScore(v, mean, sd);
      if (z > zThreshold) {
        count++;
      } else {
        break;
      }
    } else {
      break;
    }
  }
  return count;
}
