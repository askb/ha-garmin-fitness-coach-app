/**
 * Anonymised but physiologically accurate 90-day athlete fixture datasets.
 *
 * Three archetypes:
 *   Athlete A — recreational runner, consistent base training
 *   Athlete B — cyclist, progressive build phase then taper
 *   Athlete C — overtrained runner, ACWR > 1.5 spike scenario
 *
 * All CTL/ATL values are pre-computed using the engine's exact EWMA formulas
 * (alphaCTL = 2/43 ≈ 0.04651, alphaATL = 2/8 = 0.25) so tests can assert
 * ground-truth checkpoints without relying on external data.
 */
import type { DailyMetricInput } from "@acme/engine";

// ── Constants exposed for z-score tests ──────────────────────────────────────
export const C_HRV_MEAN = 68;
export const C_HRV_SD = 9;

// ── Date helpers ──────────────────────────────────────────────────────────────
// 2024-01-01 is a Monday → dayIndex 0 = Monday
const BASE_DATE = new Date("2024-01-01");

function dateStr(dayOffset: number): string {
  const d = new Date(BASE_DATE);
  d.setDate(d.getDate() + dayOffset);
  return d.toISOString().split("T")[0]!;
}

function makeDay(
  dayOffset: number,
  load: number | null,
  hrv: number | null,
  restingHr: number | null,
  totalSleepMinutes: number,
): DailyMetricInput {
  return {
    date: dateStr(dayOffset),
    sleepScore: totalSleepMinutes >= 420 ? 78 : 62,
    totalSleepMinutes,
    deepSleepMinutes: Math.round(totalSleepMinutes * 0.2),
    remSleepMinutes: Math.round(totalSleepMinutes * 0.2),
    lightSleepMinutes: Math.round(totalSleepMinutes * 0.5),
    awakeMinutes: 15,
    hrv,
    restingHr,
    maxHr: null,
    stressScore: 25,
    bodyBatteryStart: 80,
    bodyBatteryEnd: 40,
    steps: load ? 10000 : 7000,
    calories: 2200,
    garminTrainingReadiness: 70,
    garminTrainingLoad: load,
    respirationRate: 14,
    spo2: 97,
    skinTemp: 35.0,
    intensityMinutes: load ? Math.round(load / 2) : 0,
    floorsClimbed: 5,
    bodyBatteryHigh: 90,
    bodyBatteryLow: 20,
    hrvOvernight: null,
    sleepStartTime: "22:30",
    sleepEndTime: "06:30",
    sleepNeedMinutes: 480,
    sleepDebtMinutes: totalSleepMinutes < 420 ? 480 - totalSleepMinutes : 0,
  };
}

// ── Ground-truth CTL/ATL simulator (mirrors engine formula exactly) ───────────
// CTL: 42-day EWMA, alphaCTL = 2/43
// ATL:  7-day EWMA, alphaATL = 2/8 = 0.25
// Ref: Banister EW et al. Aust J Sci Med Sport. 1975;7:57-61.
export function simulateCTLATL(loads: number[]): {
  ctl: number;
  atl: number;
  tsb: number;
} {
  if (loads.length === 0) return { ctl: 0, atl: 0, tsb: 0 };
  const alphaCTL = 2 / 43;
  const alphaATL = 2 / 8;
  let ctl = loads[0]!;
  let atl = loads[0]!;
  for (let i = 1; i < loads.length; i++) {
    ctl = alphaCTL * loads[i]! + (1 - alphaCTL) * ctl;
    atl = alphaATL * loads[i]! + (1 - alphaATL) * atl;
  }
  return {
    ctl: Math.round(ctl * 100) / 100,
    atl: Math.round(atl * 100) / 100,
    tsb: Math.round((ctl - atl) * 100) / 100,
  };
}

// ── Athlete A — Recreational runner ──────────────────────────────────────────
// Training pattern: Mon(0)/Wed(2)/Fri(4)/Sat(5) @ 60 TSS; rest otherwise
// 4 training / 3 rest days per week → avg 34.3 TSS/day in steady state
// HRV mean ~65ms, SD ~4ms; RHR 53–57 bpm
function athleteALoad(i: number): number {
  const dow = i % 7;
  return dow === 0 || dow === 2 || dow === 4 || dow === 5 ? 60 : 0;
}

export const athleteAData: DailyMetricInput[] = Array.from(
  { length: 90 },
  (_, i) => {
    const load = athleteALoad(i);
    // HRV: mean 65ms, gentle sine variation ±4ms, slight dip on training days
    const hrv = 65 + Math.sin(i * 0.41) * 4 + (load > 0 ? -2 : 1);
    // RHR: 55 baseline, +2 on training days (slightly elevated)
    const restingHr = 55 + (load > 0 ? 2 : -1);
    // Occasional 6h sleep (every 14 days)
    const sleep = i % 14 === 3 ? 380 : 450;
    return makeDay(i, load, Math.round(hrv * 10) / 10, restingHr, sleep);
  },
);

// ── Athlete B — Cyclist, progressive build → taper → race week ───────────────
// Days  0-59: progressive weekly base. Week 0: base=60 TSS, +8 TSS/week
//   Mon–Fri = baseLoad; Sat = 1.3 × baseLoad; Sun = rest
// Days 60-74: taper — load drops to ~50% (Mon–Fri=50, Sat=65, Sun=0)
// Days 75-89: race week — very low load (20 TSS/day), race on Thursday=70
//
// Average daily load days 0-59 ≈ 82 TSS/day → CTL at day 60 ≈ 81 (in [75,95])
// ATL at day 60 ≈ 112 (recent 7-day peak week) → TSB strongly negative
// After taper (day 75): ATL decays fast, CTL stays elevated → TSB positive
function athleteBLoad(i: number): number {
  const dow = i % 7;
  if (i < 60) {
    if (dow === 6) return 0; // Sunday rest
    const week = Math.floor(i / 7);
    const baseLoad = 60 + week * 8; // 60 → 116 over 7 weeks
    return dow === 5 ? Math.round(baseLoad * 1.3) : baseLoad; // Sat long ride
  }
  if (i < 75) {
    // Taper: ~50% of peak
    if (dow === 6) return 0;
    return dow === 5 ? 65 : 50;
  }
  // Race week
  if (dow === 6 || dow === 5) return 0;
  if (dow === 3) return 70; // race day Thursday
  return 20;
}

export const athleteBData: DailyMetricInput[] = Array.from(
  { length: 90 },
  (_, i) => {
    const load = athleteBLoad(i);
    // Build phase (0-59): HRV dips; taper (60-74): HRV recovers; race (75+): low
    const buildPhase = i < 60 ? i / 60 : i < 75 ? (75 - i) / 15 : 0;
    const hrv = 72 - buildPhase * 8 + Math.sin(i * 0.35) * 2;
    const restingHr = 48 + Math.round(buildPhase * 5);
    return makeDay(
      i,
      load,
      Math.round(hrv * 10) / 10,
      restingHr,
      480 - Math.round(buildPhase * 30),
    );
  },
);

// ── Athlete C — Overtrained runner ───────────────────────────────────────────
// Days  0-41: Normal base (Mon/Wed/Fri/Sat @ 50 TSS, 4 days/week)
//   avg ≈ 28.6 TSS/day
// Days 42-48: Sudden spike — 100 TSS every day (doubles acute load)
//
// ACWR at day 49:
//   Acute 7d avg = (7×100)/7 = 100 TSS
//   Chronic 28d avg ≈ (7×100 + 21×base) / 28 ≈ 46 TSS
//   ACWR ≈ 100/46 ≈ 2.2  (well above injury-risk threshold of 1.5)
//
// HRV during spike: drops to mean − 2.5 SD
// Ref: Gabbett TJ. Br J Sports Med. 2016;50(5):273-280.
function athleteCLoad(i: number): number {
  if (i >= 42 && i <= 48) return 100; // spike week
  const dow = i % 7;
  return dow === 0 || dow === 2 || dow === 4 || dow === 5 ? 50 : 0;
}

export const athleteCData: DailyMetricInput[] = Array.from(
  { length: 90 },
  (_, i) => {
    const load = athleteCLoad(i);
    const isSpike = i >= 42 && i <= 48;
    // During spike: HRV falls below mean − 2.5 SD
    const hrv = isSpike
      ? C_HRV_MEAN - 2.5 * C_HRV_SD + (i - 45) * 0.5
      : C_HRV_MEAN + Math.sin(i * 0.3) * C_HRV_SD * 0.4;
    return makeDay(
      i,
      load,
      Math.round(hrv * 10) / 10,
      isSpike ? 68 : 58,
      isSpike ? 330 : 450,
    );
  },
);

// ── Pre-computed ground-truth checkpoints ─────────────────────────────────────

export const athleteAExpected = {
  /** CTL/ATL after 42 days of consistent 4-day/week 60-TSS training */
  day42: simulateCTLATL(
    athleteAData.slice(0, 42).map((d) => d.garminTrainingLoad ?? 0),
  ),
  /** CTL/ATL after full 90-day block */
  day90: simulateCTLATL(athleteAData.map((d) => d.garminTrainingLoad ?? 0)),
  /** Known HRV distribution parameters */
  hrvMean: 65,
  hrvSD: 4,
};

export const athleteBExpected = {
  /** Peak build: CTL should be ≈ 81 (within [75, 95]) */
  day60: simulateCTLATL(
    athleteBData.slice(0, 60).map((d) => d.garminTrainingLoad ?? 0),
  ),
  /** Post-taper: TSB should be positive */
  day75: simulateCTLATL(
    athleteBData.slice(0, 75).map((d) => d.garminTrainingLoad ?? 0),
  ),
  day90: simulateCTLATL(athleteBData.map((d) => d.garminTrainingLoad ?? 0)),
};

export const athleteCExpected = {
  /** At spike day 7: ACWR well above 1.5 injury threshold */
  day49: simulateCTLATL(
    athleteCData.slice(0, 49).map((d) => d.garminTrainingLoad ?? 0),
  ),
};
