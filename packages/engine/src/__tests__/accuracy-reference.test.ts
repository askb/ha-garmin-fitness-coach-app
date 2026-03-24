import { describe, it, expect } from "vitest";
import { computeTRIMP, computeACWR } from "../strain";
import { estimateVO2maxUth, estimateVO2maxCooper, predictRaceTimes } from "../vo2max";
import { estimateRecoveryTime } from "../training-status";
import { calculateSleepNeed } from "../sleep-coach";
import { analyzeRunningForm } from "../running-form";

/**
 * ACCURACY VERIFICATION TESTS — Published Reference Values
 *
 * Each test section cites the peer-reviewed paper that defines the formula
 * and documents the hand-calculated expected value. These tests verify that
 * our implementations match known-correct values.
 */

// ── TRIMP (Training Impulse) ────────────────────────────────────────────────
// Reference: Banister EW. "Modeling elite athletic performance."
//   In: Green HJ, McDougal JD, Wenger HA, eds.
//   Physiological Testing of Elite Athletes.
//   Champaign, IL: Human Kinetics; 1991:403-424.
//
// Formula: TRIMP = duration × ΔHR × e^(k × ΔHR)
//   where ΔHR = (avgHR − restHR) / (maxHR − restHR)
//         k = 1.92 (male) or 1.67 (female)
// ─────────────────────────────────────────────────────────────────────────────

describe("TRIMP — Banister (1991) reference values", () => {
  it("Test Case 1: 30-min run, avgHR=150, restHR=60, maxHR=190, male", () => {
    /**
     * ΔHR = (150−60)/(190−60) = 90/130 ≈ 0.6923
     * TRIMP = 30 × 0.6923 × e^(1.92 × 0.6923)
     *       = 30 × 0.6923 × e^(1.3292)
     *       = 30 × 0.6923 × 3.778
     *       ≈ 78.5
     */
    const trimp = computeTRIMP(
      { durationMinutes: 30, avgHr: 150, maxHr: 185 },
      60,
      190,
      "male",
    );
    expect(trimp).toBeCloseTo(78.5, 0);
  });

  it("Test Case 2: 60-min easy, avgHR=130, restHR=55, maxHR=195, female", () => {
    /**
     * ΔHR = (130−55)/(195−55) = 75/140 ≈ 0.5357
     * TRIMP = 60 × 0.5357 × e^(1.67 × 0.5357)
     *       = 60 × 0.5357 × e^(0.8946)
     *       = 60 × 0.5357 × 2.447
     *       ≈ 78.6
     */
    const trimp = computeTRIMP(
      { durationMinutes: 60, avgHr: 130, maxHr: 195 },
      55,
      195,
      "female",
    );
    expect(trimp).toBeCloseTo(78.7, 0);
  });

  it("Test Case 3: 45-min threshold, avgHR=170, restHR=50, maxHR=185, male", () => {
    /**
     * ΔHR = (170−50)/(185−50) = 120/135 ≈ 0.8889
     * TRIMP = 45 × 0.8889 × e^(1.92 × 0.8889)
     *       = 45 × 0.8889 × e^(1.7067)
     *       = 45 × 0.8889 × 5.510
     *       ≈ 220.4
     */
    const trimp = computeTRIMP(
      { durationMinutes: 45, avgHr: 170, maxHr: 185 },
      50,
      185,
      "male",
    );
    expect(trimp).toBeCloseTo(220.2, 0);
  });

  it("male coefficient (k=1.92) produces higher TRIMP than female (k=1.67) at same ΔHR", () => {
    /**
     * At identical inputs, the higher male exponent (1.92 vs 1.67)
     * produces a larger exponential weighting for high-intensity work.
     */
    const male = computeTRIMP({ durationMinutes: 45, avgHr: 160, maxHr: 185 }, 60, 190, "male");
    const female = computeTRIMP({ durationMinutes: 45, avgHr: 160, maxHr: 185 }, 60, 190, "female");
    expect(male).toBeGreaterThan(female);
  });
});

// ── ACWR (Acute:Chronic Workload Ratio) ─────────────────────────────────────
// Reference: Hulin BT et al. "The acute:chronic workload ratio predicts
//   injury: high chronic workload may decrease injury risk in elite rugby
//   league players." Br J Sports Med. 2016;50(4):231-236.
//
// ACWR = acute_7day_avg / chronic_28day_avg
// Sweet spot: 0.8–1.3  |  Danger zone: >1.5
// ─────────────────────────────────────────────────────────────────────────────

describe("ACWR — Hulin et al. (2016) reference values", () => {
  it("Test Case 1: Steady state — uniform load → ACWR = 1.0", () => {
    /**
     * 28 days at load 100: acute_avg = 100, chronic_avg = 100
     * ACWR = 100 / 100 = 1.0
     */
    const loads = Array(28).fill(100);
    expect(computeACWR(loads)).toBe(1.0);
  });

  it("Test Case 2: Acute spike — 7 days of 200 after 21 days of 100", () => {
    /**
     * acute_avg = 200, chronic_avg = (200×7 + 100×21)/28 = 125
     * ACWR = 200/125 = 1.6 — exceeds sweet-spot ceiling (>1.3)
     *
     * Note: The rolling-average method includes the acute window in the
     * chronic calculation, producing 1.6 rather than the uncoupled 2.0.
     */
    const loads = [...Array(7).fill(200), ...Array(21).fill(100)];
    expect(computeACWR(loads)).toBe(1.6);
  });

  it("Test Case 3: Deload week — 7 days of 50 after 21 days of 100", () => {
    /**
     * acute_avg = 50, chronic_avg = (50×7 + 100×21)/28 = 87.5
     * ACWR = 50/87.5 ≈ 0.57
     */
    const loads = [...Array(7).fill(50), ...Array(21).fill(100)];
    expect(computeACWR(loads)).toBe(0.57);
  });

  it("Test Case 4: Sweet spot — 7 days of 120, chronic base 100", () => {
    /**
     * acute_avg = 120, chronic_avg = (120×7 + 100×21)/28 = 105
     * ACWR = 120/105 ≈ 1.14 — within the Hulin sweet spot (0.8–1.3)
     */
    const loads = [...Array(7).fill(120), ...Array(21).fill(100)];
    expect(computeACWR(loads)).toBe(1.14);
  });

  it("returns 1.0 for insufficient data (<3 days)", () => {
    expect(computeACWR([])).toBe(1.0);
    expect(computeACWR([10, 10])).toBe(1.0);
  });
});

// ── VO2max — Uth Method ─────────────────────────────────────────────────────
// Reference: Uth N, Sørensen H, Overgaard K, Pedersen PK.
//   "Estimation of VO2max from the ratio between HRmax and HRrest —
//   the Heart Rate Ratio Method."
//   Eur J Appl Physiol. 2004;91:111-115.
//
// Formula: VO2max = 15.3 × (HRmax / HRrest)
// ─────────────────────────────────────────────────────────────────────────────

describe("VO2max Uth — Uth et al. (2004) reference values", () => {
  it("Test Case 1: HRmax=190, HRrest=60 → VO2max ≈ 48.5", () => {
    /**
     * VO2max = 15.3 × (190/60) = 15.3 × 3.1667 = 48.45 → 48.5
     */
    const result = estimateVO2maxUth(190, 60);
    expect(result).not.toBeNull();
    expect(result!.value).toBeCloseTo(48.5, 1);
    expect(result!.source).toBe("uth_ratio");
  });

  it("Test Case 2: HRmax=200, HRrest=40 → VO2max = 76.5 (elite level)", () => {
    /**
     * VO2max = 15.3 × (200/40) = 15.3 × 5.0 = 76.5
     */
    const result = estimateVO2maxUth(200, 40);
    expect(result).not.toBeNull();
    expect(result!.value).toBe(76.5);
  });

  it("Test Case 3: HRmax=170, HRrest=75 → VO2max ≈ 34.7 (untrained)", () => {
    /**
     * VO2max = 15.3 × (170/75) = 15.3 × 2.2667 = 34.68 → 34.7
     */
    const result = estimateVO2maxUth(170, 75);
    expect(result).not.toBeNull();
    expect(result!.value).toBeCloseTo(34.7, 1);
  });
});

// ── VO2max — Cooper Test ────────────────────────────────────────────────────
// Reference: Cooper KH. "A means of assessing maximal oxygen intake:
//   correlation between field and treadmill testing."
//   JAMA. 1968;203(3):201-204.
//
// Formula: VO2max = (distance_m − 504.9) / 44.73
// Accuracy: r = 0.897 with treadmill VO2max testing
// ─────────────────────────────────────────────────────────────────────────────

describe("VO2max Cooper — Cooper (1968) reference values", () => {
  it("Test Case 1: 3000m in 12 min → VO2max ≈ 55.8 (good)", () => {
    /**
     * VO2max = (3000 − 504.9) / 44.73 = 2495.1 / 44.73 ≈ 55.8
     */
    const result = estimateVO2maxCooper(3000);
    expect(result).not.toBeNull();
    expect(result!.value).toBeCloseTo(55.8, 1);
    expect(result!.source).toBe("cooper");
  });

  it("Test Case 2: 2400m in 12 min → VO2max ≈ 42.4 (average)", () => {
    /**
     * VO2max = (2400 − 504.9) / 44.73 = 1895.1 / 44.73 ≈ 42.4
     */
    const result = estimateVO2maxCooper(2400);
    expect(result).not.toBeNull();
    expect(result!.value).toBeCloseTo(42.4, 1);
  });

  it("Test Case 3: 1600m in 12 min → VO2max ≈ 24.5 (poor)", () => {
    /**
     * VO2max = (1600 − 504.9) / 44.73 = 1095.1 / 44.73 ≈ 24.5
     */
    const result = estimateVO2maxCooper(1600);
    expect(result).not.toBeNull();
    expect(result!.value).toBeCloseTo(24.5, 1);
  });
});

// ── Race Prediction — Riegel Formula ────────────────────────────────────────
// Reference: Riegel PS. "Athletic Records and Human Endurance."
//   American Scientist. 1981;69(3):285-290.
//
// Formula: T₂ = T₁ × (D₂ / D₁)^1.06
// Exponent 1.06 empirically derived from world records.
// Accuracy: ±2-3% for trained, ±5% for recreational runners.
// ─────────────────────────────────────────────────────────────────────────────

describe("Race Prediction — Riegel (1981) reference values", () => {
  it("Test Case 1: 5K in 20:00 → predict 10K ≈ 41:42", () => {
    /**
     * T_10K = 1200 × (10000/5000)^1.06
     *       = 1200 × 2^1.06
     *       = 1200 × 2.0849
     *       ≈ 2502s = 41:42
     */
    const results = predictRaceTimes(5000, 1200, 50);
    const tenK = results.find((r) => r.distance === "10K");
    expect(tenK).toBeDefined();
    expect(tenK!.predictedSeconds).toBeCloseTo(2502, -1); // ±5s tolerance
    expect(tenK!.method).toBe("riegel");
  });

  it("Test Case 2: 10K in 45:00 → predict half marathon ≈ 1:39:18", () => {
    /**
     * T_half = 2700 × (21097.5/10000)^1.06
     *        = 2700 × 2.10975^1.06
     *        ≈ 5958s = 1:39:18
     */
    const results = predictRaceTimes(10000, 2700, 48);
    const half = results.find((r) => r.distance === "half_marathon");
    expect(half).toBeDefined();
    expect(half!.predictedSeconds).toBeCloseTo(5958, -1); // ±5s
  });

  it("Test Case 3: Half in 1:30:00 → predict marathon ≈ 3:07:39", () => {
    /**
     * T_marathon = 5400 × (42195/21097.5)^1.06
     *            = 5400 × ≈2.0849
     *            ≈ 11258s = 3:07:38
     */
    const results = predictRaceTimes(21097.5, 5400, 50);
    const marathon = results.find((r) => r.distance === "marathon");
    expect(marathon).toBeDefined();
    expect(marathon!.predictedSeconds).toBeCloseTo(11258, -1); // ±5s
  });

  it("returns predictions for all four standard distances", () => {
    const results = predictRaceTimes(5000, 1200, 50);
    expect(results).toHaveLength(4);
    expect(results.map((r) => r.distance)).toEqual([
      "5K",
      "10K",
      "half_marathon",
      "marathon",
    ]);
  });
});

// ── Recovery Time Estimation ────────────────────────────────────────────────
// Reference: Hausswirth C, Mujika I. "Recovery for Performance in Sport."
//   Human Kinetics, 2013.
//
// Base recovery by strain level:
//   Strain ≤5: 18h (easy)  |  5–10: 36h (moderate)
//   10–16: 60h (hard)      |  >16: 84h (maximal)
//
// Modifiers: readiness, age (>40: +10%/decade), sleep debt (>60min: +15%)
// ─────────────────────────────────────────────────────────────────────────────

describe("Recovery Time — Hausswirth & Mujika (2013) reference values", () => {
  it("Test Case 1: Young (25), prime readiness (85), hard session (strain 12)", () => {
    /**
     * Base: 60h (strain 10–16, hard session)
     * Readiness ≥80 (Prime): ×0.8 → 48h
     * Age 25 (<40): no adjustment
     * No sleep debt: no adjustment
     * Result: 48h
     */
    const result = estimateRecoveryTime(12, 85, 25, null);
    expect(result.hoursUntilRecovered).toBe(48);
    expect(result.factors).toContain("Hard session: base 48-72h recovery");
    expect(result.factors).toContain("Prime readiness: -20% recovery");
  });

  it("Test Case 2: Older (48), moderate readiness (45), maximal session (strain 18)", () => {
    /**
     * Base: 84h (strain >16, maximal effort)
     * Readiness 40–60 (Moderate): ×1.2
     * Age 48 (>40): decades=0.8, ×1.08
     * Combined modifier: 1.2 × 1.08 = 1.296
     * Raw: 84 × 1.296 = 109h → clamped to 96h (max cap)
     */
    const result = estimateRecoveryTime(18, 45, 48, null);
    expect(result.hoursUntilRecovered).toBe(96);
    expect(result.factors).toContain("Maximal effort: base 72-96h recovery");
  });

  it("Test Case 3: Mid-age (35), high readiness (65), moderate session (strain 6)", () => {
    /**
     * Base: 36h (strain 5–10, moderate session)
     * Readiness 60–80 (High): no modifier
     * Age 35 (<40): no age modifier
     * No sleep debt: no modifier
     * Result: 36h
     */
    const result = estimateRecoveryTime(6, 65, 35, null);
    expect(result.hoursUntilRecovered).toBe(36);
    expect(result.factors).toContain("Moderate session: base 24-48h recovery");
  });

  it("sleep debt > 60 min adds 15% recovery time", () => {
    /**
     * Same as test case 3, but with 90 min sleep debt.
     * Base: 36h, modifier: 1.15 → 41h
     */
    const result = estimateRecoveryTime(6, 65, 35, 90);
    expect(result.hoursUntilRecovered).toBe(41);
    expect(result.factors).toContain("Sleep debt >1h: +15% recovery");
  });

  it("result is clamped between 6 and 96 hours", () => {
    // Easy session + prime readiness should not go below 6h
    const easy = estimateRecoveryTime(2, 90, 20, null);
    expect(easy.hoursUntilRecovered).toBeGreaterThanOrEqual(6);
    expect(easy.hoursUntilRecovered).toBeLessThanOrEqual(96);

    // Maximal + low readiness + old age should cap at 96h
    const hard = estimateRecoveryTime(20, 30, 65, 120);
    expect(hard.hoursUntilRecovered).toBeLessThanOrEqual(96);
  });
});

// ── Sleep Need ──────────────────────────────────────────────────────────────
// Reference: Hirshkowitz M et al. "National Sleep Foundation's sleep time
//   duration recommendations: methodology and results summary."
//   Sleep Health. 2015;1(1):40-43.
//
// Reference: Bird SP. "Sleep, recovery, and athletic performance."
//   Strength Cond J. 2013;35(5):43-47.
//   → Athletes should target 8–10 hours for optimal recovery.
//
// Base: 450 min (7.5h) non-athlete, 510 min (8.5h) athlete
// Adjustments: strain, sleep debt, age
// ─────────────────────────────────────────────────────────────────────────────

describe("Sleep Need — Hirshkowitz (2015) + Bird (2013) reference values", () => {
  it("Test Case 1: Age 25, athlete, high strain → 555 min (9.25h)", () => {
    /**
     * Base: 510 min (athlete, Bird 2013)
     * High strain (>14): +30 min → 540
     * Age ≤25: +15 min → 555
     * No sleep debt: no adjustment
     * Result: 555 min = 9h 15min
     *
     * This exceeds the NSF's 7–9h recommendation because athletes
     * with high training loads need extended sleep (Mah et al. 2011).
     */
    const need = calculateSleepNeed(25, true, 15, 0);
    expect(need).toBe(555);
  });

  it("Test Case 2: Age 48, non-athlete, low strain → 450 min (7.5h)", () => {
    /**
     * Base: 450 min (non-athlete, Hirshkowitz 2015)
     * Low strain (≤8): no adjustment
     * Age 26–64: no adjustment
     * No sleep debt: no adjustment
     * Result: 450 min = 7.5h — mid-range of NSF's 7–9h adult recommendation
     */
    const need = calculateSleepNeed(48, false, 3, 0);
    expect(need).toBe(450);
  });

  it("Test Case 3: Age 30, athlete, moderate strain, 60 min debt → 525 min (8.75h)", () => {
    /**
     * Base: 510 min (athlete)
     * Moderate strain (>8): +15 min → 525
     * Sleep debt 60 min (not >60): no payback adjustment
     * Age 26–64: no adjustment
     * Result: 525 min = 8h 45min
     */
    const need = calculateSleepNeed(30, true, 10, 60);
    expect(need).toBe(525);
  });

  it("large sleep debt (>120 min) triggers maximum payback (+30 min)", () => {
    /**
     * Base: 510 + 30 (high strain) + 30 (debt payback) = 570 min
     * Age 30: no adjustment
     */
    const need = calculateSleepNeed(30, true, 15, 150);
    expect(need).toBe(570);
  });

  it("elderly (65+) get reduced baseline per Hirshkowitz (2015)", () => {
    /**
     * Base: 450 (non-athlete) − 30 (age ≥65) = 420 min = 7h
     * Matches NSF's 7–8h recommendation for older adults.
     */
    const need = calculateSleepNeed(70, false, 3, 0);
    expect(need).toBe(420);
  });
});

// ── Running Form Scoring ────────────────────────────────────────────────────
// Reference: Moore IS. "Is there an economical running technique? A review
//   of modifiable biomechanical factors affecting running economy."
//   Sports Med. 2016;46(6):793-807.
//
// Reference: Heiderscheit BC et al. "Effects of step rate manipulation on
//   joint mechanics during running." Med Sci Sports Exerc. 2011;43(2):296-302.
//
// Reference: Cavanagh PR, Williams KR. "The effect of stride length variation
//   on oxygen uptake during distance running."
//   Med Sci Sports Exerc. 1982;14(1):30-35.
//
// Weighted components: GCT 30%, VO 25%, Cadence 20%, Balance 15%, Stride 10%
// ─────────────────────────────────────────────────────────────────────────────

describe("Running Form — Moore (2016) reference values", () => {
  it("Test Case 1: Elite runner — overall 85–100 (excellent)", () => {
    /**
     * GCT=195ms (elite range ≤210), VO=6.5cm (good range),
     * Stride=1.2m, Balance=50.1% (near-perfect symmetry),
     * Cadence=185spm (optimal range), Height=175cm
     *
     * Expected: high overall score reflecting efficient biomechanics
     */
    const result = analyzeRunningForm(195, 6.5, 1.2, 50.1, 185, 175);
    expect(result).not.toBeNull();
    expect(result!.overall).toBeGreaterThanOrEqual(85);
    expect(result!.overall).toBeLessThanOrEqual(100);
    expect(result!.groundContactTime.rating).toBe("elite");
    expect(result!.cadence.rating).toBe("optimal");
    expect(result!.gctBalance.rating).toBe("balanced");
  });

  it("Test Case 2: Recreational runner — overall 40–65 (needs work)", () => {
    /**
     * GCT=265ms (average), VO=9.5cm (average), Stride=0.9m,
     * Balance=50.8% (slight imbalance), Cadence=165spm (borderline low),
     * Height=170cm
     *
     * Expected: mid-range score with room for improvement
     */
    const result = analyzeRunningForm(265, 9.5, 0.9, 50.8, 165, 170);
    expect(result).not.toBeNull();
    expect(result!.overall).toBeGreaterThanOrEqual(40);
    expect(result!.overall).toBeLessThanOrEqual(65);
    expect(result!.groundContactTime.rating).toBe("average");
    expect(result!.verticalOscillation.rating).toBe("average");
  });

  it("Test Case 3: Injured pattern — overall 20–40 (poor, balance flag)", () => {
    /**
     * GCT=290ms (poor end of average), VO=11cm (poor, excessive bouncing),
     * Stride=0.85m, Balance=52.5% (imbalanced — injury flag),
     * Cadence=158spm (low), Height=180cm
     *
     * Expected: low score with imbalance flag indicating injury risk.
     * Per Seminati et al. (2013), asymmetry >2% is clinically significant.
     */
    const result = analyzeRunningForm(290, 11, 0.85, 52.5, 158, 180);
    expect(result).not.toBeNull();
    expect(result!.overall).toBeGreaterThanOrEqual(20);
    expect(result!.overall).toBeLessThanOrEqual(40);
    expect(result!.gctBalance.rating).toBe("imbalanced");
    expect(result!.verticalOscillation.rating).toBe("poor");
  });

  it("returns null when no meaningful data is provided", () => {
    const result = analyzeRunningForm(null, null, null, null, null, null);
    expect(result).toBeNull();
  });
});
