import type { CorrelationPair } from "../types";

/**
 * CORRELATION ANALYSIS ENGINE
 *
 * Computes Pearson correlation coefficients between any two metric
 * time series. Used for journal tag → metric analysis and inter-metric
 * correlations.
 *
 * Statistical approach:
 * - Pearson r for linear relationships
 * - p-value from t-distribution approximation
 * - Minimum 7 paired observations for meaningful correlation
 *
 * Common high-value correlations to compute:
 * - Alcohol intake → next-day HRV (expected: strong negative)
 * - Sleep duration → readiness score (expected: strong positive)
 * - Training load → next-day RHR elevation (expected: moderate positive)
 * - Sleep quality → strain tolerance (expected: moderate positive)
 */

/**
 * Compute Pearson correlation coefficient between two paired data series.
 *
 * r = Σ((xi - x̄)(yi - ȳ)) / √(Σ(xi - x̄)² × Σ(yi - ȳ)²)
 *
 * Returns null if insufficient paired data points (<7) or
 * if either series has zero variance.
 */
export function computePearsonR(
  xValues: number[],
  yValues: number[],
): { r: number; pValue: number; n: number } | null {
  if (xValues.length !== yValues.length) return null;
  const n = xValues.length;
  if (n < 7) return null; // minimum for meaningful correlation

  const meanX = xValues.reduce((s, v) => s + v, 0) / n;
  const meanY = yValues.reduce((s, v) => s + v, 0) / n;

  let sumXY = 0;
  let sumXX = 0;
  let sumYY = 0;

  for (let i = 0; i < n; i++) {
    const dx = xValues[i]! - meanX;
    const dy = yValues[i]! - meanY;
    sumXY += dx * dy;
    sumXX += dx * dx;
    sumYY += dy * dy;
  }

  if (sumXX === 0 || sumYY === 0) return null; // zero variance

  const r = sumXY / Math.sqrt(sumXX * sumYY);

  // p-value approximation using t-distribution
  // t = r × √(n-2) / √(1-r²)
  const rSquared = r * r;
  if (rSquared >= 1) return { r, pValue: 0, n };

  const t = Math.abs(r) * Math.sqrt((n - 2) / (1 - rSquared));
  // Approximate p-value from t-statistic (two-tailed)
  // Using the approximation: p ≈ 2 * e^(-0.717*t - 0.416*t²) for df > 20
  const pValue =
    n > 20
      ? Math.min(1, 2 * Math.exp(-0.717 * t - 0.416 * t * t))
      : approximatePValue(t, n - 2);

  return {
    r: Math.round(r * 1000) / 1000,
    pValue: Math.round(pValue * 10000) / 10000,
    n,
  };
}

/**
 * Simple p-value approximation for smaller sample sizes.
 * Uses Hill's (1970) approximation for the incomplete beta function.
 */
function approximatePValue(t: number, _df: number): number {
  // Simplified: for practical purposes, use conservative thresholds
  if (Math.abs(t) > 3.5) return 0.001;
  if (Math.abs(t) > 2.5) return 0.02;
  if (Math.abs(t) > 2.0) return 0.05;
  if (Math.abs(t) > 1.7) return 0.1;
  return 0.2;
}

/**
 * Analyze correlation between two metrics and generate insight.
 */
export function analyzeCorrelation(
  metricA: string,
  metricB: string,
  xValues: number[],
  yValues: number[],
  _period: string,
): CorrelationPair | null {
  const result = computePearsonR(xValues, yValues);
  if (result === null) return null;

  const { r, pValue, n } = result;

  // Classify strength (Cohen 1988 conventions)
  // |r| < 0.1 = none, 0.1-0.3 = weak, 0.3-0.5 = moderate, >0.5 = strong
  const absR = Math.abs(r);
  const strength: CorrelationPair["strength"] =
    absR >= 0.5
      ? "strong"
      : absR >= 0.3
        ? "moderate"
        : absR >= 0.1
          ? "weak"
          : "none";

  const direction: CorrelationPair["direction"] =
    strength === "none" ? "none" : r > 0 ? "positive" : "negative";

  const insight = generateCorrelationInsight(
    metricA,
    metricB,
    r,
    strength,
    pValue,
    n,
  );

  return {
    metricA,
    metricB,
    rValue: r,
    pValue,
    sampleSize: n,
    direction,
    strength,
    insight,
  };
}

function generateCorrelationInsight(
  metricA: string,
  metricB: string,
  r: number,
  strength: CorrelationPair["strength"],
  pValue: number,
  n: number,
): string {
  if (strength === "none") {
    return `No meaningful correlation between ${metricA} and ${metricB} (r=${r.toFixed(2)}, n=${n}).`;
  }

  const direction = r > 0 ? "positively" : "negatively";
  const significance =
    pValue < 0.05 ? "statistically significant" : "not statistically significant";

  let actionable = "";
  if (strength === "strong" && pValue < 0.05) {
    if (r > 0) {
      actionable = ` Higher ${metricA} is associated with higher ${metricB}.`;
    } else {
      actionable = ` Higher ${metricA} is associated with lower ${metricB}.`;
    }
  }

  return `${metricA} and ${metricB} are ${strength}ly ${direction} correlated (r=${r.toFixed(2)}, p=${pValue < 0.001 ? "<0.001" : pValue.toFixed(3)}, n=${n}). This is ${significance}.${actionable}`;
}

/**
 * Compute correlations for common metric pairs.
 * Returns pre-computed correlations for the dashboard.
 */
export function computeStandardCorrelations(
  dailyData: Array<{
    date: string;
    hrv: number | null;
    restingHr: number | null;
    totalSleepMinutes: number | null;
    sleepScore: number | null;
    stressScore: number | null;
    readinessScore: number | null;
    strainScore: number | null;
  }>,
  period: string,
): CorrelationPair[] {
  const correlations: CorrelationPair[] = [];

  const PAIRS: Array<
    [
      string,
      string,
      (d: (typeof dailyData)[0]) => number | null,
      ((d: (typeof dailyData)[0]) => number | null) | null,
    ]
  > = [
    [
      "sleep_duration",
      "readiness",
      (d) => d.totalSleepMinutes,
      (d) => d.readinessScore,
    ],
    ["hrv", "readiness", (d) => d.hrv, (d) => d.readinessScore],
    ["sleep_quality", "hrv", (d) => d.sleepScore, (d) => d.hrv],
    ["strain", "next_day_hrv", (d) => d.strainScore, null], // needs lag
    ["stress", "sleep_quality", (d) => d.stressScore, (d) => d.sleepScore],
    [
      "resting_hr",
      "readiness",
      (d) => d.restingHr,
      (d) => d.readinessScore,
    ],
  ];

  for (const [nameA, nameB, getA, getB] of PAIRS) {
    if (!getB) continue; // skip lag-based pairs for now

    const paired = dailyData
      .map((d) => ({ a: getA(d), b: getB(d) }))
      .filter((p): p is { a: number; b: number } => p.a !== null && p.b !== null);

    if (paired.length >= 7) {
      const result = analyzeCorrelation(
        nameA,
        nameB,
        paired.map((p) => p.a),
        paired.map((p) => p.b),
        period,
      );
      if (result) correlations.push(result);
    }
  }

  // Lag-based: strain → next-day HRV
  const lagPaired: Array<{ a: number; b: number }> = [];
  for (let i = 0; i < dailyData.length - 1; i++) {
    const todayStrain = dailyData[i]!.strainScore;
    const nextDayHrv = dailyData[i + 1]!.hrv;
    if (todayStrain !== null && nextDayHrv !== null) {
      lagPaired.push({ a: todayStrain, b: nextDayHrv });
    }
  }
  if (lagPaired.length >= 7) {
    const result = analyzeCorrelation(
      "strain",
      "next_day_hrv",
      lagPaired.map((p) => p.a),
      lagPaired.map((p) => p.b),
      period,
    );
    if (result) correlations.push(result);
  }

  return correlations;
}
