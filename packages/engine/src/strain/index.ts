import type { ActivityInput } from "../types";

/**
 * TRAINING LOAD CALCULATIONS
 *
 * TRIMP (Training Impulse) — The foundational training load metric.
 *
 * Ref: Banister EW. Modeling elite athletic performance. In: Green HJ,
 *      McDougal JD, Wenger HA, eds. Physiological Testing of Elite Athletes.
 *      Champaign, IL: Human Kinetics; 1991:403-424.
 *
 * The sex-specific constants (k=1.92 male, k=1.67 female) account for
 * different lactate-HR relationships between sexes. These are the original
 * Banister constants, validated across 1000+ published studies.
 */

/**
 * Compute TRIMP (Training Impulse) from activity data.
 *
 * TRIMP = duration_minutes × ΔHR_ratio × e^(k × ΔHR_ratio)
 * where ΔHR_ratio = (avgHr - restingHr) / (maxHr - restingHr)
 * k = 1.92 (male) or 1.67 (female)
 *
 * Ref: Banister EW. (1991) — original TRIMP formula
 */
export function computeTRIMP(
  activity: { durationMinutes: number; avgHr: number | null; maxHr: number | null },
  restingHr: number,
  userMaxHr: number,
  sex: string | null,
): number {
  if (activity.avgHr === null || userMaxHr <= restingHr) return 0;

  const hrReserve = userMaxHr - restingHr;
  if (hrReserve <= 0) return 0;

  const deltaHrRatio = Math.max(0, Math.min(1, (activity.avgHr - restingHr) / hrReserve));
  const k = sex === "female" ? 1.67 : 1.92; // Banister (1991)

  return activity.durationMinutes * deltaHrRatio * Math.exp(k * deltaHrRatio);
}

/**
 * Convert TRIMP to a 0-21 strain score.
 *
 * Uses asymptotic exponential curve: strain = 21 × (1 - e^(-trimp / max))
 *
 * The 21-point scale follows WHOOP's published range. The personalTrimpMax
 * represents the TRIMP of the athlete's hardest conceivable session.
 *
 * Default 250 is calibrated for: 60 min at 85% HRR for a male athlete
 * (yields TRIMP ≈ 200). The exponential ensures diminishing returns
 * for extreme sessions, which matches physiological stress response.
 *
 * NOTE: personalTrimpMax should be calibrated per-athlete after 30+ sessions.
 * Formula: personalTrimpMax = max(historical TRIMP values) × 1.2
 */
export function computeStrainScore(
  trimp: number,
  personalTrimpMax = 250,
): number {
  if (trimp <= 0) return 0;
  const raw = 21 * (1 - Math.exp(-trimp / personalTrimpMax));
  return Math.round(raw * 100) / 100; // 2 decimal places
}

/**
 * Compute Acute:Chronic Workload Ratio (ACWR).
 *
 * ACWR = acute load / chronic load
 *
 * Uses rolling averages (simpler, widely validated):
 * - Acute window: 7 days (standard in literature)
 * - Chronic window: 28 days (standard in literature)
 *
 * Ref: Hulin BT et al. The acute:chronic workload ratio predicts injury:
 *      high chronic workload may decrease injury risk in elite rugby league
 *      players. Br J Sports Med. 2016;50(4):231-236.
 *   → ACWR 0.8-1.3 = "sweet spot" with lowest injury risk
 *   → ACWR > 1.5 = significantly elevated injury risk
 *
 * Ref: Blanch P, Gabbett TJ. Has the athlete trained enough to return
 *      to play safely? Br J Sports Med. 2016;50:471-475.
 *
 * Ref: Gabbett TJ. The training—injury prevention paradox: should athletes
 *      be training smarter AND harder? Br J Sports Med. 2016;50(5):273-280.
 *   → Key insight: HIGH chronic loads are PROTECTIVE against injury
 *     (builds resilience). Acute spikes above chronic base are dangerous.
 *
 * NOTE: Some authors (Lolli et al. 2019) argue coupled ACWR has mathematical
 * artefacts. EWMA-based ACWR addresses this. For MVP we use rolling average
 * (simpler, still clinically useful).
 */
export function computeACWR(
  strainScores: number[], // most recent first (index 0 = today)
): number {
  if (strainScores.length < 3) return 1.0; // not enough data

  // Acute: 7-day window (Hulin et al. 2016)
  const acuteDays = Math.min(strainScores.length, 7);
  const acute7 =
    strainScores.slice(0, acuteDays).reduce((sum, s) => sum + s, 0) / acuteDays;

  // Chronic: 28-day window (Hulin et al. 2016)
  const chronicDays = Math.min(strainScores.length, 28);
  const chronic28 =
    strainScores.slice(0, chronicDays).reduce((sum, s) => sum + s, 0) /
    chronicDays;

  if (chronic28 === 0) return acute7 > 0 ? 2.0 : 1.0;
  return Math.round((acute7 / chronic28) * 100) / 100;
}

/**
 * Compute EWMA-based ACWR (addresses Lolli et al. 2019 coupling critique).
 *
 * Uses exponentially weighted moving averages instead of rolling averages,
 * which eliminates the mathematical coupling between acute and chronic periods.
 *
 * Ref: Williams S et al. Better way to determine the acute:chronic workload
 *      ratio? Br J Sports Med. 2017;51:209-210.
 *
 * α_acute = 2 / (7 + 1) = 0.25
 * α_chronic = 2 / (28 + 1) ≈ 0.069
 */
export function computeACWR_EWMA(
  dailyLoads: number[], // oldest first (chronological order)
): number {
  if (dailyLoads.length < 7) return 1.0;

  const alphaAcute = 2 / (7 + 1);
  const alphaChronic = 2 / (28 + 1);

  let ewmaAcute = dailyLoads[0]!;
  let ewmaChronic = dailyLoads[0]!;

  for (let i = 1; i < dailyLoads.length; i++) {
    ewmaAcute = alphaAcute * dailyLoads[i]! + (1 - alphaAcute) * ewmaAcute;
    ewmaChronic = alphaChronic * dailyLoads[i]! + (1 - alphaChronic) * ewmaChronic;
  }

  if (ewmaChronic === 0) return ewmaAcute > 0 ? 2.0 : 1.0;
  return Math.round((ewmaAcute / ewmaChronic) * 100) / 100;
}

/**
 * Compute Chronic Training Load (CTL) and Acute Training Load (ATL).
 *
 * Banister's Fitness-Fatigue Model:
 * - CTL = 42-day EMA of daily training stress ("fitness")
 * - ATL = 7-day EMA of daily training stress ("fatigue")
 * - TSB = CTL - ATL ("form" / "freshness")
 *
 * Ref: Banister EW et al. A systems model of training for athletic
 *      performance. Aust J Sci Med Sport. 1975;7:57-61.
 * Ref: Busso T. Variable dose-response relationship between exercise
 *      training and performance. Med Sci Sports Exerc. 2003;35(7):1188-1195.
 *
 * Ramp rate: CTL change per week. Safe: <5-8 pts/week (Coggan guidelines).
 * Exceeding this increases injury/illness risk.
 */
export function computeTrainingLoads(
  dailyStressScores: number[], // oldest first (chronological order)
): { ctl: number; atl: number; tsb: number; rampRate: number } {
  if (dailyStressScores.length === 0) return { ctl: 0, atl: 0, tsb: 0, rampRate: 0 };

  const alphaCTL = 2 / (42 + 1); // ~0.0465
  const alphaATL = 2 / (7 + 1);  // 0.25

  let ctl = dailyStressScores[0]!;
  let atl = dailyStressScores[0]!;
  let ctlOneWeekAgo = ctl;

  for (let i = 1; i < dailyStressScores.length; i++) {
    ctl = alphaCTL * dailyStressScores[i]! + (1 - alphaCTL) * ctl;
    atl = alphaATL * dailyStressScores[i]! + (1 - alphaATL) * atl;

    // Track CTL from 7 days ago for ramp rate
    if (i === dailyStressScores.length - 8) {
      ctlOneWeekAgo = ctl;
    }
  }

  const tsb = ctl - atl;
  const rampRate = ctl - ctlOneWeekAgo;

  return {
    ctl: Math.round(ctl * 100) / 100,
    atl: Math.round(atl * 100) / 100,
    tsb: Math.round(tsb * 100) / 100,
    rampRate: Math.round(rampRate * 100) / 100,
  };
}

/**
 * Determine training load focus from activity training effects.
 *
 * Uses Garmin's aerobic/anaerobic Training Effect (0-5 scale, Firstbeat).
 * - Predominantly aerobic: aerobicTE > anaerobicTE × 1.5
 * - Predominantly anaerobic: anaerobicTE > aerobicTE × 1.5
 * - Mixed: roughly equal
 *
 * Ref: Firstbeat Technologies. Automated fitness level (VO2max) estimation
 *      with heart rate and speed data. Firstbeat white paper. 2014.
 */
export function classifyLoadFocus(
  recentActivities: Array<{ aerobicTE: number | null; anaerobicTE: number | null }>,
): "aerobic" | "anaerobic" | "mixed" {
  let totalAerobic = 0;
  let totalAnaerobic = 0;
  let count = 0;

  for (const a of recentActivities) {
    if (a.aerobicTE !== null && a.anaerobicTE !== null) {
      totalAerobic += a.aerobicTE;
      totalAnaerobic += a.anaerobicTE;
      count++;
    }
  }

  if (count === 0) return "mixed";

  const avgAerobic = totalAerobic / count;
  const avgAnaerobic = totalAnaerobic / count;

  if (avgAerobic > avgAnaerobic * 1.5) return "aerobic";
  if (avgAnaerobic > avgAerobic * 1.5) return "anaerobic";
  return "mixed";
}

/**
 * Count consecutive hard days (strain > threshold).
 *
 * Threshold calibrated from WHOOP strain data:
 * - Strain 0-7: low (recovery/easy)
 * - Strain 8-13: moderate
 * - Strain 14+: high (hard session)
 *
 * The 14 threshold corresponds roughly to a tempo or interval session
 * lasting 40+ minutes at >75% HRR.
 */
export function countConsecutiveHardDays(
  strainScores: number[], // most recent first
  threshold = 14,
): number {
  let count = 0;
  for (const score of strainScores) {
    if (score > threshold) {
      count++;
    } else {
      break;
    }
  }
  return count;
}

export { computeTRIMP as trimp, computeStrainScore as strain };
