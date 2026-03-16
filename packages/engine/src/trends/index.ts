import type { TrendDirection, TrendAnalysis } from "../types";

/**
 * LONG-TERM TREND ANALYSIS
 *
 * Computes rolling averages, trend direction, rate of change,
 * and statistical significance for any metric over 30/90/180/365 day periods.
 *
 * Uses linear regression for trend direction and rate of change.
 * Statistical significance based on sample size and R² value.
 */

/**
 * Analyze trend for a time series of metric values.
 *
 * @param values Array of { date: string, value: number }, sorted oldest first
 * @param metric Name of the metric being analyzed
 * @param period Analysis period
 * @returns TrendAnalysis with direction, rate, significance
 */
export function analyzeTrend(
  values: Array<{ date: string; value: number }>,
  metric: string,
  period: TrendAnalysis["period"],
): TrendAnalysis | null {
  if (values.length < 7) return null; // minimum 7 data points

  // Linear regression
  const startDate = new Date(values[0]!.date).getTime();
  const points = values.map((v) => ({
    x: (new Date(v.date).getTime() - startDate) / (1000 * 60 * 60 * 24), // days
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

  // R² for significance
  const ssRes = points.reduce(
    (s, p) => s + (p.y - (intercept + slope * p.x)) ** 2,
    0,
  );
  const meanY = sumY / n;
  const ssTot = points.reduce((s, p) => s + (p.y - meanY) ** 2, 0);
  const rSquared = ssTot > 0 ? 1 - ssRes / ssTot : 0;

  const startValue = values[0]!.value;
  const endValue = values[values.length - 1]!.value;
  const rateOfChangePerWeek = Math.round(slope * 7 * 100) / 100;
  const percentChange =
    startValue !== 0
      ? Math.round(((endValue - startValue) / startValue) * 10000) / 100
      : 0;

  // Direction classification
  // Requires both a meaningful slope AND statistical significance
  const slopeThreshold = Math.abs(startValue) * 0.005; // 0.5% per day
  let direction: TrendDirection;
  if (Math.abs(slope) < slopeThreshold || rSquared < 0.1) {
    direction = "stable";
  } else if (slope > 0) {
    direction = "improving";
  } else {
    direction = "declining";
  }

  // Significance based on sample size and R²
  const significance: TrendAnalysis["significance"] =
    n >= 30 && rSquared >= 0.3
      ? "high"
      : n >= 14 && rSquared >= 0.15
        ? "medium"
        : "low";

  return {
    metric,
    period,
    direction,
    rateOfChange: rateOfChangePerWeek,
    startValue: Math.round(startValue * 100) / 100,
    endValue: Math.round(endValue * 100) / 100,
    percentChange,
    significance,
  };
}

/**
 * Compute rolling average for a time series.
 * Returns smoothed values for chart display.
 */
export function computeRollingAverage(
  values: Array<{ date: string; value: number }>,
  windowDays: number,
): Array<{ date: string; value: number; rawValue: number }> {
  if (values.length === 0) return [];

  return values.map((v, i) => {
    const windowStart = Math.max(0, i - windowDays + 1);
    const window = values.slice(windowStart, i + 1);
    const avg = window.reduce((s, w) => s + w.value, 0) / window.length;
    return {
      date: v.date,
      value: Math.round(avg * 100) / 100,
      rawValue: v.value,
    };
  });
}

/**
 * Identify notable changes (inflection points) in a trend.
 * Useful for automated insights like "Your HRV has improved 12% since January."
 */
export function findNotableChanges(
  values: Array<{ date: string; value: number }>,
  metric: string,
  thresholdPercent: number = 10,
): Array<{ date: string; change: number; description: string }> {
  if (values.length < 14) return [];

  const changes: Array<{
    date: string;
    change: number;
    description: string;
  }> = [];

  // Compare 7-day moving averages at different points
  const getAvg = (start: number, count: number) => {
    const slice = values.slice(start, start + count);
    return slice.reduce((s, v) => s + v.value, 0) / slice.length;
  };

  // Check weekly changes
  for (let i = 7; i < values.length; i += 7) {
    const prevAvg = getAvg(Math.max(0, i - 14), 7);
    const currAvg = getAvg(Math.max(0, i - 7), 7);

    if (prevAvg === 0) continue;
    const pctChange = ((currAvg - prevAvg) / prevAvg) * 100;

    if (Math.abs(pctChange) >= thresholdPercent) {
      const direction = pctChange > 0 ? "increased" : "decreased";
      changes.push({
        date: values[i]!.date,
        change: Math.round(pctChange * 10) / 10,
        description: `${metric} ${direction} ${Math.abs(Math.round(pctChange))}% over the past week`,
      });
    }
  }

  return changes;
}
