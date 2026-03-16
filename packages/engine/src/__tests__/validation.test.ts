/**
 * Sport-science validation test suite.
 *
 * Every assertion is anchored to a published reference so regressions can be
 * traced back to the underlying physiology / math, not just "expected X".
 */
import { describe, it, expect } from "vitest";

import {
  computeTRIMP,
  computeStrainScore,
  computeACWR,
  computeTrainingLoads,
} from "../strain";
import {
  computeEMA,
  computeSD,
  computeZScore,
  zScoreToScore,
  getPopulationDefaults,
} from "../baselines";
import {
  scoreHRV,
  scoreRestingHR,
  scoreSleepQuantity,
  getReadinessZone,
  calculateReadiness,
} from "../readiness";
import {
  estimateVO2maxFromRunning,
  estimateVO2maxUth,
  estimateVO2maxCooper,
  predictRaceTimes,
} from "../vo2max";
import {
  classifyTrainingStatus,
  estimateRecoveryTime,
} from "../training-status";
import { calculateSleepNeed } from "../sleep-coach";
import { computePearsonR } from "../correlations";
import { analyzeRunningForm } from "../running-form";
import { analyzeTrend } from "../trends";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Minimal valid DailyMetricInput with all required fields. */
function makeMetric(overrides: Record<string, unknown> = {}) {
  return {
    date: "2026-01-15",
    sleepScore: null,
    totalSleepMinutes: null,
    deepSleepMinutes: null,
    remSleepMinutes: null,
    lightSleepMinutes: null,
    awakeMinutes: null,
    hrv: null,
    restingHr: null,
    maxHr: null,
    stressScore: null,
    bodyBatteryStart: null,
    bodyBatteryEnd: null,
    steps: null,
    calories: null,
    garminTrainingReadiness: null,
    garminTrainingLoad: null,
    respirationRate: null,
    spo2: null,
    skinTemp: null,
    intensityMinutes: null,
    floorsClimbed: null,
    bodyBatteryHigh: null,
    bodyBatteryLow: null,
    hrvOvernight: null,
    sleepStartTime: null,
    sleepEndTime: null,
    sleepNeedMinutes: null,
    sleepDebtMinutes: null,
    ...overrides,
  };
}

// ===================================================================
// 1. TRIMP — Banister (1991) impulse-response model
// Ref: Banister EW. "Modeling elite athletic performance." 1991.
// Formula: TRIMP = D × ΔHR × e^(k × ΔHR)
//   where ΔHR = (avg-rest)/(max-rest), k_male=1.92, k_female=1.67
// ===================================================================
describe("TRIMP validation (Banister 1991)", () => {
  // 60 min @ 75 % HRR, male → TRIMP = 60 × 0.75 × e^(1.92×0.75) ≈ 190
  it("60 min at 75 % HRR (male) yields TRIMP ≈ 190", () => {
    const trimp = computeTRIMP(
      { durationMinutes: 60, avgHr: 165, maxHr: 200 },
      60, 200, "male",
    );
    expect(trimp).toBeGreaterThan(180);
    expect(trimp).toBeLessThan(200);
  });

  // Same scenario, female (k = 1.67) → ≈ 157
  it("60 min at 75 % HRR (female) yields TRIMP ≈ 157", () => {
    const trimp = computeTRIMP(
      { durationMinutes: 60, avgHr: 165, maxHr: 200 },
      60, 200, "female",
    );
    expect(trimp).toBeGreaterThan(150);
    expect(trimp).toBeLessThan(165);
  });

  it("0 % HRR (resting) yields TRIMP = 0", () => {
    const trimp = computeTRIMP(
      { durationMinutes: 60, avgHr: 60, maxHr: 200 },
      60, 200, "male",
    );
    expect(trimp).toBe(0);
  });

  // Strain score normalisation (0-21 scale analogous to Whoop)
  it("strain score clamps to 0–21 range", () => {
    expect(computeStrainScore(0)).toBe(0);
    expect(computeStrainScore(500)).toBeLessThanOrEqual(21);
    const mid = computeStrainScore(125);
    expect(mid).toBeGreaterThan(0);
    expect(mid).toBeLessThan(21);
  });
});

// ===================================================================
// 2. ACWR — Hulin et al. (2016) "The acute:chronic workload ratio
//    predicts injury" Br J Sports Med 50:273-280
// ===================================================================
describe("ACWR validation (Hulin et al. 2016)", () => {
  it("sweet-spot: constant load → ACWR ≈ 1.0", () => {
    const balanced = Array(28).fill(10); // most-recent-first
    const acwr = computeACWR(balanced);
    expect(acwr).toBeGreaterThanOrEqual(0.8);
    expect(acwr).toBeLessThanOrEqual(1.3);
  });

  it("danger zone: spike after rest → ACWR > 1.5", () => {
    // 7 recent days at 20, then 21 prior days at 5 (most-recent-first)
    const spike = [...Array(7).fill(20), ...Array(21).fill(5)];
    const acwr = computeACWR(spike);
    expect(acwr).toBeGreaterThan(1.5);
  });

  it("deload: rest after block → ACWR < 0.8", () => {
    // 7 recent rest days, 21 prior hard days
    const deload = [...Array(7).fill(2), ...Array(21).fill(15)];
    const acwr = computeACWR(deload);
    expect(acwr).toBeLessThan(0.8);
  });
});

// ===================================================================
// 3. Z-score system — Buchheit M. (2014) "Monitoring training
//    status with HR measures" Int J Sports Physiol Perform 9:883-891
// ===================================================================
describe("Z-score system (Buchheit 2014)", () => {
  it("z = 0 → score = 50 (at baseline)", () => {
    expect(zScoreToScore(0)).toBe(50);
  });

  // Engine uses tanh transform: score = 50 + 50 × tanh(1.5 × z)
  // tanh(1.5) ≈ 0.905 → score ≈ 95.3
  it("z = +1 → score ≈ 95 (tanh transform, 1 SD above)", () => {
    const s = zScoreToScore(1);
    expect(s).toBeGreaterThan(93);
    expect(s).toBeLessThan(97);
  });

  // tanh(-1.5) ≈ −0.905 → score ≈ 4.7
  it("z = −1 → score ≈ 5 (tanh transform, 1 SD below)", () => {
    const s = zScoreToScore(-1);
    expect(s).toBeGreaterThan(3);
    expect(s).toBeLessThan(7);
  });

  // tanh(3.0) ≈ 0.995 → score ≈ 99.8
  it("z = +2 → score ≈ 100 (tanh saturates high)", () => {
    const s = zScoreToScore(2);
    expect(s).toBeGreaterThan(99);
    expect(s).toBeLessThanOrEqual(100);
  });

  // tanh(−3.0) ≈ −0.995 → score ≈ 0.2
  it("z = −2 → score ≈ 0 (tanh saturates low)", () => {
    const s = zScoreToScore(-2);
    expect(s).toBeGreaterThanOrEqual(0);
    expect(s).toBeLessThan(1);
  });

  it("HRV above baseline → readiness score > 50", () => {
    expect(scoreHRV(50, 45, 10)).toBeGreaterThan(50);
  });

  it("HRV 2 SD below baseline → readiness score < 15", () => {
    expect(scoreHRV(25, 45, 10)).toBeLessThan(15);
  });
});

// ===================================================================
// 4. VO2max estimation
// Refs: Uth N. et al. (2004) "Estimation of VO2max from the ratio
//   between HRmax and HRrest"; Cooper KH (1968) "12-min run test"
// ===================================================================
describe("VO2max estimation validation", () => {
  // Uth: VO2max = 15.3 × (HRmax / HRrest)
  // 15.3 × (190 / 60) = 15.3 × 3.167 ≈ 48.5
  it("Uth method: HRmax=190, HRrest=60 → VO2max ≈ 48.5", () => {
    const r = estimateVO2maxUth(190, 60);
    expect(r).not.toBeNull();
    expect(r!.value).toBeGreaterThan(47);
    expect(r!.value).toBeLessThan(50);
    expect(r!.source).toBe("uth_ratio");
  });

  // Cooper: VO2max = (d − 504.9) / 44.73
  // (3000 − 504.9) / 44.73 ≈ 55.8
  it("Cooper test: 3000 m → VO2max ≈ 55.8", () => {
    const r = estimateVO2maxCooper(3000);
    expect(r).not.toBeNull();
    expect(r!.value).toBeGreaterThan(54);
    expect(r!.value).toBeLessThan(57);
  });

  it("Running VO2max: 5K in 20 min @ 165 bpm → plausible range", () => {
    const r = estimateVO2maxFromRunning(5000, 20, 165, 60, 195);
    expect(r).not.toBeNull();
    expect(r!.value).toBeGreaterThan(40);
    expect(r!.value).toBeLessThan(75);
    expect(r!.source).toBe("running_pace_hr");
  });
});

// ===================================================================
// 5. Race prediction — Riegel P. (1981) "Athletic Records and
//    Human Endurance" American Scientist 69:285-290
//    T₂ = T₁ × (D₂/D₁)^1.06
// ===================================================================
describe("Race prediction validation (Riegel 1981)", () => {
  // 20:00 5K → 10K ≈ 1200 × 2^1.06 = 2502 s ≈ 41:42
  it("20:00 5K predicts ~41:30 10K", () => {
    const preds = predictRaceTimes(5000, 1200, 50);
    const tenK = preds.find((p) => p.distance === "10K");
    expect(tenK).toBeDefined();
    expect(tenK!.predictedSeconds).toBeGreaterThan(2400); // > 40:00
    expect(tenK!.predictedSeconds).toBeLessThan(2600);    // < 43:20
  });

  it("20:00 5K predicts reasonable half marathon", () => {
    const preds = predictRaceTimes(5000, 1200, 50);
    const hm = preds.find((p) => p.distance === "half_marathon");
    expect(hm).toBeDefined();
    expect(hm!.predictedSeconds).toBeGreaterThan(5400); // > 1:30
    expect(hm!.predictedSeconds).toBeLessThan(6300);    // < 1:45
  });
});

// ===================================================================
// 6. Training status — Meeusen R. et al. (2013) "Prevention,
//    diagnosis and treatment of the overtraining syndrome"
//    Eur J Sport Sci 13:1-24
// ===================================================================
describe("Training status classification (Meeusen et al. 2013)", () => {
  it("productive: improving VO2max + optimal load", () => {
    const r = classifyTrainingStatus(1.0, {
      ctl: 50, atl: 55, tsb: -5, acwr: 1.1, loadFocus: "aerobic", rampRate: 3,
    });
    expect(r.status).toBe("productive");
  });

  it("overreaching: high load + declining VO2max", () => {
    const r = classifyTrainingStatus(-1.0, {
      ctl: 60, atl: 80, tsb: -20, acwr: 1.6, loadFocus: "mixed", rampRate: 10,
    });
    expect(r.status).toBe("overreaching");
  });

  it("detraining: low load + declining VO2max", () => {
    // loadCategory = "low" requires acwr < 0.6 and NOT tapering
    const r = classifyTrainingStatus(-1.0, {
      ctl: 20, atl: 10, tsb: 5, acwr: 0.4, loadFocus: "aerobic", rampRate: -1,
    });
    expect(r.status).toBe("detraining");
  });

  it("peaking: tapering + maintaining fitness", () => {
    const r = classifyTrainingStatus(0.2, {
      ctl: 70, atl: 40, tsb: 30, acwr: 0.7, loadFocus: "aerobic", rampRate: -5,
    });
    expect(r.status).toBe("peaking");
  });
});

// ===================================================================
// 7. Recovery — Hausswirth C. & Mujika I. (2013) "Recovery for
//    Performance in Sport" Human Kinetics
// ===================================================================
describe("Recovery time estimation (Hausswirth & Mujika 2013)", () => {
  it("easy session → 12-24 h recovery", () => {
    const r = estimateRecoveryTime(5, 70, 30, 0);
    expect(r.hoursUntilRecovered).toBeGreaterThanOrEqual(12);
    expect(r.hoursUntilRecovered).toBeLessThanOrEqual(24);
  });

  it("hard session → 48-72 h recovery", () => {
    const r = estimateRecoveryTime(15, 70, 30, 0);
    expect(r.hoursUntilRecovered).toBeGreaterThanOrEqual(48);
    expect(r.hoursUntilRecovered).toBeLessThanOrEqual(72);
  });

  it("maximal + poor readiness + age 50 → extended recovery", () => {
    const r = estimateRecoveryTime(20, 25, 50, 120);
    expect(r.hoursUntilRecovered).toBeGreaterThanOrEqual(72);
    expect(r.hoursUntilRecovered).toBeLessThanOrEqual(96);
    expect(r.factors.length).toBeGreaterThan(2);
  });
});

// ===================================================================
// 8. Sleep — Hirshkowitz M. et al. (2015) "National Sleep Foundation
//    sleep time duration recommendations" Sleep Health 1:40-43
//    Bird SP (2013) "Sleep, recovery, and athletic performance"
// ===================================================================
describe("Sleep coach (Hirshkowitz et al. 2015, Bird 2013)", () => {
  it("athlete base need: 480-570 min (8-9.5 h)", () => {
    const need = calculateSleepNeed(30, true, 10, 0);
    expect(need).toBeGreaterThanOrEqual(480);
    expect(need).toBeLessThanOrEqual(570);
  });

  it("non-athlete base need: 420-510 min (7-8.5 h)", () => {
    const need = calculateSleepNeed(30, false, 10, 0);
    expect(need).toBeGreaterThanOrEqual(420);
    expect(need).toBeLessThanOrEqual(510);
  });

  it("high strain increases sleep need", () => {
    const low = calculateSleepNeed(30, true, 5, 0);
    const high = calculateSleepNeed(30, true, 18, 0);
    expect(high).toBeGreaterThan(low);
  });
});

// ===================================================================
// 9. Running form — Nummela A. et al. (2007); Heiderscheit B. et al.
//    (2011) "Effects of step rate manipulation on joint mechanics
//    during running" Med Sci Sports Exerc 43:296-302
// ===================================================================
describe("Running form analysis", () => {
  it("elite runner: GCT <210 ms, VO <6 cm, cadence 180 → high score", () => {
    const r = analyzeRunningForm(200, 5.5, 1.3, 50.0, 180, 175);
    expect(r).not.toBeNull();
    expect(r!.overall).toBeGreaterThan(80);
    expect(r!.groundContactTime.rating).toBe("elite");
    expect(r!.verticalOscillation.rating).toBe("elite");
  });

  it("recreational runner: GCT 270 ms, VO 9 cm, cadence 160 → lower score", () => {
    const r = analyzeRunningForm(270, 9.0, 1.1, 50.5, 160, 170);
    expect(r).not.toBeNull();
    expect(r!.overall).toBeLessThan(60);
    expect(r!.groundContactTime.rating).toBe("average");
  });

  it("cadence 155 spm → rated 'low' (Heiderscheit: 170+ optimal)", () => {
    const r = analyzeRunningForm(null, null, null, null, 155, null);
    expect(r).not.toBeNull();
    expect(r!.cadence.rating).toBe("low");
  });
});

// ===================================================================
// 10. CTL / ATL / TSB — Banister EW (1975) Fitness–Fatigue model
//     CTL = 42-day EMA, ATL = 7-day EMA, TSB = CTL − ATL
// ===================================================================
describe("CTL/ATL/TSB (Banister 1975)", () => {
  it("constant load → CTL ≈ ATL ≈ daily load, TSB ≈ 0", () => {
    const loads = Array(60).fill(50); // oldest-first
    const r = computeTrainingLoads(loads);
    expect(r.ctl).toBeGreaterThan(45);
    expect(r.ctl).toBeLessThan(55);
    expect(r.atl).toBeGreaterThan(45);
    expect(r.atl).toBeLessThan(55);
    expect(Math.abs(r.tsb)).toBeLessThan(5);
  });

  it("sudden stop → ATL drops faster, TSB positive (fresh)", () => {
    const loads = [...Array(42).fill(50), ...Array(14).fill(0)];
    const r = computeTrainingLoads(loads);
    expect(r.atl).toBeLessThan(5);
    expect(r.ctl).toBeGreaterThan(10);
    expect(r.tsb).toBeGreaterThan(0);
  });

  it("load spike → ATL > CTL, TSB negative (fatigued)", () => {
    const loads = [...Array(28).fill(20), ...Array(7).fill(80)];
    const r = computeTrainingLoads(loads);
    expect(r.atl).toBeGreaterThan(r.ctl);
    expect(r.tsb).toBeLessThan(0);
  });
});

// ===================================================================
// 11. Pearson r — mathematical properties
// ===================================================================
describe("Pearson correlation validation", () => {
  const seq14 = Array.from({ length: 14 }, (_, i) => i + 1);

  it("perfect positive correlation r = 1", () => {
    const r = computePearsonR(seq14, seq14.map((v) => v * 2));
    expect(r).not.toBeNull();
    expect(r!.r).toBeCloseTo(1.0, 3);
  });

  it("perfect negative correlation r = −1", () => {
    const r = computePearsonR(seq14, seq14.map((v) => 30 - v * 2));
    expect(r).not.toBeNull();
    expect(r!.r).toBeCloseTo(-1.0, 3);
  });

  it("returns null for < 14 data points", () => {
    expect(computePearsonR([1, 2, 3, 4, 5], [2, 4, 6, 8, 10])).toBeNull();
  });
});

// ===================================================================
// 12. Readiness zone sensitivity — validates stable zone boundaries
//     Zone thresholds: ≥80 prime, 60-79 high, 40-59 moderate,
//     20-39 low, <20 poor
// ===================================================================
describe("Sensitivity: readiness zone boundaries", () => {
  it("±10 % weight change on score 70 stays within 'high'", () => {
    expect(getReadinessZone(70)).toBe("high");
    expect(getReadinessZone(63)).toBe("high"); // −10 %
    expect(getReadinessZone(77)).toBe("high"); // +10 %
  });

  it("one-zone shift at boundary is acceptable (60 → high, 59 → moderate)", () => {
    expect(getReadinessZone(60)).toBe("high");
    expect(getReadinessZone(59)).toBe("moderate");
  });

  it("full zone ladder", () => {
    expect(getReadinessZone(95)).toBe("prime");
    expect(getReadinessZone(65)).toBe("high");
    expect(getReadinessZone(45)).toBe("moderate");
    expect(getReadinessZone(25)).toBe("low");
    expect(getReadinessZone(10)).toBe("poor");
  });
});

// ===================================================================
// 13. Population defaults — Shaffer F. & Ginsberg JP (2017)
//     "An overview of heart rate variability metrics and norms"
//     Front Public Health 5:258
// ===================================================================
describe("Population defaults (Shaffer & Ginsberg 2017)", () => {
  it("HRV decreases with age", () => {
    const a25 = getPopulationDefaults("male", 25);
    const a35 = getPopulationDefaults("male", 35);
    const a55 = getPopulationDefaults("male", 55);
    expect(a25.hrv).toBeGreaterThan(a35.hrv);
    expect(a35.hrv).toBeGreaterThan(a55.hrv);
  });

  it("female HRV slightly higher than male (Shaffer 2017)", () => {
    const m = getPopulationDefaults("male");
    const f = getPopulationDefaults("female");
    expect(f.hrv).toBeGreaterThan(m.hrv);
  });
});

// ===================================================================
// 14. Trend analysis — linear-regression direction detection
// ===================================================================
describe("Trend analysis", () => {
  it("detects improving trend from ascending data", () => {
    const vals = Array.from({ length: 30 }, (_, i) => ({
      date: `2026-01-${String(i + 1).padStart(2, "0")}`,
      value: 50 + i * 0.5,
    }));
    const r = analyzeTrend(vals, "hrv", "30d");
    expect(r).not.toBeNull();
    expect(r!.direction).toBe("improving");
    expect(r!.rateOfChange).toBeGreaterThan(0);
  });

  it("detects declining trend from descending data", () => {
    const vals = Array.from({ length: 30 }, (_, i) => ({
      date: `2026-01-${String(i + 1).padStart(2, "0")}`,
      value: 80 - i * 0.8,
    }));
    const r = analyzeTrend(vals, "readiness", "30d");
    expect(r).not.toBeNull();
    expect(r!.direction).toBe("declining");
    expect(r!.rateOfChange).toBeLessThan(0);
  });
});
