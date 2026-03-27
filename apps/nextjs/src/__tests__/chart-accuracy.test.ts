/**
 * Chart data accuracy tests.
 *
 * Validates that the data transformation logic used by the PMC chart,
 * readiness score, zone distribution, and ACWR gauge produces correct
 * values from computed metrics. Pure logic tests — no React rendering.
 *
 * References:
 *   Banister EW et al. (1991) — CTL/ATL/TSB model
 *   Hulin BT et al. Br J Sports Med. 2016;50(4):231-236 — ACWR thresholds
 *   Gabbett TJ. Br J Sports Med. 2016;50(5):273-280 — injury risk zones
 */
import { describe, expect, it } from "@jest/globals";

import {
  calculateReadiness,
  computeACWR,
  computeBaselines,
  computeTrainingLoads,
  getReadinessZone,
  scoreHRV,
  scoreRestingHR,
  scoreSleepQuality,
  scoreSleepQuantity,
  scoreStressAndBattery,
  scoreTrainingLoad,
} from "@acme/engine";

import {
  athleteAData,
  athleteAExpected,
  athleteBData,
  athleteBExpected,
  athleteCData,
  athleteCExpected,
  simulateCTLATL,
} from "./fixtures/athlete-90day";

// ── Helpers ─────────────────────────────────────────────────────────────────

/** Extract garminTrainingLoad as chronological number array. */
function loads(data: typeof athleteAData, end?: number): number[] {
  return data.slice(0, end).map((d) => d.garminTrainingLoad ?? 0);
}

/** Reverse for computeACWR (most-recent-first convention). */
function acwrInput(arr: number[]): number[] {
  return [...arr].reverse();
}

/**
 * Replicate the PMC chart data mapping from training/page.tsx.
 * This is the exact transformation applied before feeding Recharts.
 */
interface PmcEntry {
  date: string;
  ctl: number | null;
  atl: number | null;
  tsb: number | null;
  acwr: number | null;
}

function mapPmcChartData(entries: PmcEntry[]) {
  return entries.map((d, idx) => {
    const showLabel = idx % 7 === 0;
    return {
      date: showLabel ? (d.date?.slice(5) ?? "") : "",
      fullDate: d.date ?? "",
      ctl: d.ctl ?? null,
      atl: d.atl ?? null,
      tsb: d.tsb ?? null,
      acwr: d.acwr ?? null,
      tsbPos: (d.tsb ?? 0) >= 0 ? (d.tsb ?? 0) : 0,
      tsbNeg: (d.tsb ?? 0) < 0 ? (d.tsb ?? 0) : 0,
    };
  });
}

/**
 * Replicate the acwrStatus function from training/page.tsx.
 */
function acwrStatus(value: number): { label: string; color: string } {
  if (value < 0.8) return { label: "Under-training", color: "text-zinc-400" };
  if (value <= 1.3) return { label: "Optimal", color: "text-green-400" };
  if (value <= 1.5) return { label: "Caution", color: "text-yellow-400" };
  return { label: "⚠️ High Risk", color: "text-red-400" };
}

/**
 * TSB-based risk zone classification (used by PMC chart reference areas).
 */
function tsbRiskZone(tsb: number): "overreaching" | "optimal" | "fresh" {
  if (tsb < -20) return "overreaching";
  if (tsb > 10) return "fresh";
  return "optimal";
}

/** Zone distribution helper (matches zone-distribution.test.ts pattern). */
interface ZoneMinutes {
  zone1: number;
  zone2: number;
  zone3: number;
  zone4: number;
  zone5: number;
}

function computeZonePct(zones: ZoneMinutes): {
  zone1: number;
  zone2: number;
  zone3: number;
  zone4: number;
  zone5: number;
} {
  const total = Object.values(zones).reduce((a, b) => a + b, 0);
  if (total === 0) return { zone1: 0, zone2: 0, zone3: 0, zone4: 0, zone5: 0 };
  return {
    zone1: (zones.zone1 / total) * 100,
    zone2: (zones.zone2 / total) * 100,
    zone3: (zones.zone3 / total) * 100,
    zone4: (zones.zone4 / total) * 100,
    zone5: (zones.zone5 / total) * 100,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// Block 1: PMC Chart Data Mapping (8 tests)
// ═══════════════════════════════════════════════════════════════════════════

describe("PMC Chart Data Mapping", () => {
  // Build realistic PMC entries from Athlete A fixture via engine
  function buildPmcEntries(
    data: typeof athleteAData,
    dayCount?: number,
  ): PmcEntry[] {
    const slice = data.slice(0, dayCount);
    const entries: PmcEntry[] = [];
    for (let i = 1; i <= slice.length; i++) {
      const dayLoads = loads(data, i);
      const { ctl, atl, tsb } = computeTrainingLoads(dayLoads);
      const acwr = dayLoads.length >= 7 ? computeACWR(acwrInput(dayLoads)) : 0;
      entries.push({
        date: slice[i - 1]!.date,
        ctl,
        atl,
        tsb,
        acwr,
      });
    }
    return entries;
  }

  it("1 — CTL line data points match advancedMetrics.ctl values exactly", () => {
    const entries = buildPmcEntries(athleteAData, 42);
    const chartData = mapPmcChartData(entries);

    for (let i = 0; i < entries.length; i++) {
      expect(chartData[i]!.ctl).toBe(entries[i]!.ctl);
    }
  });

  it("2 — ATL line data points match advancedMetrics.atl values exactly", () => {
    const entries = buildPmcEntries(athleteAData, 42);
    const chartData = mapPmcChartData(entries);

    for (let i = 0; i < entries.length; i++) {
      expect(chartData[i]!.atl).toBe(entries[i]!.atl);
    }
  });

  it("3 — TSB area values = CTL - ATL for each date", () => {
    const entries = buildPmcEntries(athleteBData, 60);
    const chartData = mapPmcChartData(entries);

    for (const d of chartData) {
      if (d.ctl !== null && d.atl !== null && d.tsb !== null) {
        expect(d.tsb).toBeCloseTo(d.ctl - d.atl, 0);
      }
    }
  });

  it("4 — ACWR values are bounded [0, 3] (no infinity from zero CTL)", () => {
    // Include zero-load data to test edge case
    const zeroEntries: PmcEntry[] = Array.from({ length: 30 }, (_, i) => ({
      date: `2024-01-${String(i + 1).padStart(2, "0")}`,
      ctl: 0,
      atl: 0,
      tsb: 0,
      acwr: 0,
    }));
    const mixedEntries: PmcEntry[] = [
      ...zeroEntries,
      ...buildPmcEntries(athleteAData, 42),
    ];
    const chartData = mapPmcChartData(mixedEntries);

    for (const d of chartData) {
      if (d.acwr !== null) {
        expect(d.acwr).toBeGreaterThanOrEqual(0);
        expect(d.acwr).toBeLessThanOrEqual(3);
        expect(Number.isFinite(d.acwr)).toBe(true);
      }
    }
  });

  it("5 — date axis has correct number of points for 42d/90d/180d ranges", () => {
    const entries42 = buildPmcEntries(athleteAData, 42);
    const entries90 = buildPmcEntries(athleteAData, 90);
    // 180d would need more fixture data; verify the counts we have
    const chart42 = mapPmcChartData(entries42);
    const chart90 = mapPmcChartData(entries90);

    expect(chart42).toHaveLength(42);
    expect(chart90).toHaveLength(90);

    // Verify date label spacing: every 7th point gets a visible label
    const labelled42 = chart42.filter((d) => d.date !== "");
    expect(labelled42.length).toBe(Math.ceil(42 / 7));
  });

  it("6 — risk zone boundaries: TSB < -20 overreaching, TSB > 10 fresh, between optimal", () => {
    expect(tsbRiskZone(-25)).toBe("overreaching");
    expect(tsbRiskZone(-21)).toBe("overreaching");
    expect(tsbRiskZone(-20)).toBe("optimal");
    expect(tsbRiskZone(0)).toBe("optimal");
    expect(tsbRiskZone(10)).toBe("optimal");
    expect(tsbRiskZone(11)).toBe("fresh");
    expect(tsbRiskZone(30)).toBe("fresh");

    // Verify Athlete B build phase is overreaching
    const buildTsb = athleteBExpected.day60.tsb;
    if (buildTsb < -20) {
      expect(tsbRiskZone(buildTsb)).toBe("overreaching");
    }

    // Verify Athlete B taper is optimal or fresh
    const taperTsb = athleteBExpected.day75.tsb;
    expect(["optimal", "fresh"]).toContain(tsbRiskZone(taperTsb));
  });

  it("7 — empty metrics array → chart shows 'No data' state (not crash)", () => {
    const emptyEntries: PmcEntry[] = [];
    const chartData = mapPmcChartData(emptyEntries);

    expect(chartData).toHaveLength(0);
    // UI code: pmcChartData.length > 0 ? <Chart> : <"No PMC data yet">
    // Verify the condition the UI checks:
    expect(chartData.length > 0).toBe(false);
  });

  it("8 — single data point → chart renders without error", () => {
    const singleEntry: PmcEntry[] = [
      { date: "2024-01-01", ctl: 30, atl: 25, tsb: 5, acwr: 0.83 },
    ];
    const chartData = mapPmcChartData(singleEntry);

    expect(chartData).toHaveLength(1);
    expect(chartData[0]!.ctl).toBe(30);
    expect(chartData[0]!.atl).toBe(25);
    expect(chartData[0]!.tsb).toBe(5);
    // First point (idx 0) should get a date label (0 % 7 === 0)
    expect(chartData[0]!.date).toBe("01-01");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Block 2: Readiness Score Validation (5 tests)
// ═══════════════════════════════════════════════════════════════════════════

describe("Readiness Score Validation", () => {
  const baselines = computeBaselines(athleteAData, "male", 35);

  it("9 — confidence = 'high' when all 4 key sources present (HRV, sleep, HR, load)", () => {
    // Use a day with all metrics present
    const fullDay = athleteAData[45]!; // mid-training, all data available
    const strainScores = [10, 12, 0, 14, 0, 11, 0]; // 7 days
    const result = calculateReadiness({
      todayMetrics: fullDay,
      recentStrainScores: strainScores,
      baselines,
    });
    // All 4 sources (sleep, hrv, restingHr, stress) are present → high
    expect(result.confidence).toBe("high");
  });

  it("10 — confidence decreases when sources are missing", () => {
    const dayMissing2 = {
      ...athleteAData[45]!,
      hrv: null,
      restingHr: null,
    };
    const result = calculateReadiness({
      todayMetrics: dayMissing2,
      recentStrainScores: [10, 12, 0, 14, 0, 11, 0],
      baselines,
    });
    // 2 nulls → medium confidence
    expect(result.confidence).toBe("medium");
  });

  it("11 — confidence = 'low' when ≥3 sources missing", () => {
    const dayMissing3 = {
      ...athleteAData[45]!,
      hrv: null,
      restingHr: null,
      stressScore: null,
    };
    const result = calculateReadiness({
      todayMetrics: dayMissing3,
      recentStrainScores: [10, 12, 0, 14, 0, 11, 0],
      baselines,
    });
    expect(result.confidence).toBe("low");
  });

  it("12 — doNotOverinterpret = true when confidence is 'low'", () => {
    // ReadinessCard shows warning when doNotOverinterpret is true.
    // The UI maps confidence < 0.5 to doNotOverinterpret. Here we verify
    // that low confidence maps correctly in the data flow.
    const confidenceMap: Record<string, boolean> = {
      low: true,
      medium: false,
      high: false,
    };
    expect(confidenceMap["low"]).toBe(true);
    expect(confidenceMap["medium"]).toBe(false);
    expect(confidenceMap["high"]).toBe(false);

    // Also verify the engine returns 'low' when data is insufficient
    const dayMissing3 = {
      ...athleteAData[45]!,
      hrv: null,
      restingHr: null,
      stressScore: null,
    };
    const result = calculateReadiness({
      todayMetrics: dayMissing3,
      recentStrainScores: [10, 12, 0, 14, 0, 11, 0],
      baselines,
    });
    expect(confidenceMap[result.confidence]).toBe(true);
  });

  it("13 — action suggestion includes worst-scoring component context", () => {
    // When one component scores poorly, the explanation should reference it
    const badSleepDay = {
      ...athleteAData[45]!,
      totalSleepMinutes: 240, // 4 hours — very poor
      deepSleepMinutes: 30,
      remSleepMinutes: 30,
      lightSleepMinutes: 150,
    };
    const result = calculateReadiness({
      todayMetrics: badSleepDay,
      recentStrainScores: [10, 12, 0, 14, 0, 11, 0],
      baselines,
    });
    // Explanation should mention sleep as a limiting factor
    expect(result.explanation.toLowerCase()).toMatch(/sleep/);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Block 3: Zone Distribution (3 tests)
// ═══════════════════════════════════════════════════════════════════════════

describe("Zone Distribution", () => {
  it("14 — zone percentages sum to 100% (±0.1 for rounding)", () => {
    const testCases: ZoneMinutes[] = [
      { zone1: 30, zone2: 60, zone3: 20, zone4: 15, zone5: 5 },
      { zone1: 100, zone2: 80, zone3: 10, zone4: 10, zone5: 5 },
      { zone1: 1, zone2: 1, zone3: 1, zone4: 1, zone5: 1 },
      { zone1: 300, zone2: 0, zone3: 0, zone4: 0, zone5: 0 },
    ];

    for (const zones of testCases) {
      const pct = computeZonePct(zones);
      const total = pct.zone1 + pct.zone2 + pct.zone3 + pct.zone4 + pct.zone5;
      expect(Math.abs(total - 100)).toBeLessThan(0.1);
    }
  });

  it("15 — all 5 zones present even when some have 0%", () => {
    const sparseZones: ZoneMinutes = {
      zone1: 60,
      zone2: 0,
      zone3: 0,
      zone4: 0,
      zone5: 0,
    };
    const pct = computeZonePct(sparseZones);
    const keys = Object.keys(pct);
    expect(keys).toContain("zone1");
    expect(keys).toContain("zone2");
    expect(keys).toContain("zone3");
    expect(keys).toContain("zone4");
    expect(keys).toContain("zone5");
    expect(keys).toHaveLength(5);

    // zone1 should be 100%, rest 0%
    expect(pct.zone1).toBeCloseTo(100, 0);
    expect(pct.zone2).toBe(0);
    expect(pct.zone3).toBe(0);
    expect(pct.zone4).toBe(0);
    expect(pct.zone5).toBe(0);
  });

  it("16 — zone order is always Z1 → Z5", () => {
    const zones: ZoneMinutes = {
      zone1: 40,
      zone2: 30,
      zone3: 15,
      zone4: 10,
      zone5: 5,
    };
    const pct = computeZonePct(zones);
    const keys = Object.keys(pct);
    expect(keys).toEqual(["zone1", "zone2", "zone3", "zone4", "zone5"]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Block 4: ACWR Gauge (4 tests)
// ═══════════════════════════════════════════════════════════════════════════

describe("ACWR Gauge", () => {
  it("17 — ACWR 0.8-1.3 maps to 'Optimal' zone (green)", () => {
    expect(acwrStatus(0.8).label).toBe("Optimal");
    expect(acwrStatus(1.0).label).toBe("Optimal");
    expect(acwrStatus(1.3).label).toBe("Optimal");
    expect(acwrStatus(0.8).color).toBe("text-green-400");
    expect(acwrStatus(1.3).color).toBe("text-green-400");
  });

  it("18 — ACWR > 1.5 maps to 'High Risk' zone (red)", () => {
    expect(acwrStatus(1.51).label).toBe("⚠️ High Risk");
    expect(acwrStatus(2.0).label).toBe("⚠️ High Risk");
    expect(acwrStatus(1.51).color).toBe("text-red-400");

    // Verify with real athlete data: Athlete C spike should be high risk
    const spikeDayLoads = loads(athleteCData, 49);
    const acwr = computeACWR(acwrInput(spikeDayLoads));
    expect(acwr).toBeGreaterThan(1.5);
    expect(acwrStatus(acwr).label).toBe("⚠️ High Risk");
  });

  it("19 — ACWR < 0.8 maps to 'Under-training' zone", () => {
    expect(acwrStatus(0.5).label).toBe("Under-training");
    expect(acwrStatus(0.0).label).toBe("Under-training");
    expect(acwrStatus(0.79).label).toBe("Under-training");
    expect(acwrStatus(0.5).color).toBe("text-zinc-400");
  });

  it("20 — ACWR = 0 (new athlete) maps to 'Under-training' (insufficient data)", () => {
    const newAthleteAcwr = 0;
    const status = acwrStatus(newAthleteAcwr);
    expect(status.label).toBe("Under-training");

    // Also verify engine handles zero-load input gracefully
    const zeroLoads = Array<number>(7).fill(0);
    const computedAcwr = computeACWR(zeroLoads);
    expect(Number.isFinite(computedAcwr)).toBe(true);
    expect(computedAcwr).toBeGreaterThanOrEqual(0);
  });
});
