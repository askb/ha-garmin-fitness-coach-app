import { describe, expect, it } from "vitest";

import type { DailyRecommendationInput } from "..";
import {
  acwrSpikeBlocksHard,
  acwrVeryLowSuggestsLightBuild,
  consecutiveHardSuggestsRecovery,
  hrvSuppressedBlocksHard,
  interventionRecentRespects,
  lowReadinessBlocksHard,
  planHonoredWhenSafe,
  raceDayRest,
  raceWeekProtectsTaper,
  sleepDebtBlocksHard,
  sparseDataLowConfidence,
  tsbOverreachingSuggestsDeload,
  weeklyQuotaMetSuggestsRest,
} from "..";

type InputOverrides = Partial<
  Omit<DailyRecommendationInput, "readiness" | "load" | "weeklyPlan">
> & {
  readiness?: DailyRecommendationInput["readiness"];
  load?: Partial<DailyRecommendationInput["load"]>;
  weeklyPlan?: DailyRecommendationInput["weeklyPlan"];
};

function makeInput(overrides: InputOverrides = {}): DailyRecommendationInput {
  const base: DailyRecommendationInput = {
    date: "2026-04-10",
    readiness: {
      score: 80,
      zone: "optimal",
      hrvDeviation: 0,
      sleepDebtMin: 0,
    },
    load: {
      acwr: 1,
      tsb: 0,
      consecutiveHardDays: 0,
    },
    weeklyPlan: {
      plannedToday: {
        workoutType: "tempo",
        intensity: "hard",
        durationMin: 50,
      },
      sessionsThisWeek: 1,
      plannedThisWeek: 4,
    },
    recentInterventions: [],
    raceDateDaysAway: null,
    baseline: { restDaysPerWeek: 2 },
  };

  return {
    ...base,
    ...overrides,
    readiness:
      overrides.readiness === undefined ? base.readiness : overrides.readiness,
    load: { ...base.load, ...overrides.load },
    weeklyPlan:
      overrides.weeklyPlan === undefined
        ? base.weeklyPlan
        : overrides.weeklyPlan,
  };
}

describe("daily recommendation rules", () => {
  it("fires low readiness below 50 but not at 50", () => {
    expect(
      lowReadinessBlocksHard(
        makeInput({
          readiness: {
            score: 49,
            zone: "balanced",
            hrvDeviation: 0,
            sleepDebtMin: 0,
          },
        }),
      ).fired,
    ).toBe(true);
    expect(
      lowReadinessBlocksHard(
        makeInput({
          readiness: {
            score: 50,
            zone: "balanced",
            hrvDeviation: 0,
            sleepDebtMin: 0,
          },
        }),
      ).fired,
    ).toBe(false);
  });

  it("fires low readiness for stressed and compromised zones", () => {
    expect(
      lowReadinessBlocksHard(
        makeInput({
          readiness: {
            score: 80,
            zone: "stressed",
            hrvDeviation: 0,
            sleepDebtMin: 0,
          },
        }),
      ).fired,
    ).toBe(true);
    expect(
      lowReadinessBlocksHard(
        makeInput({
          readiness: {
            score: 80,
            zone: "compromised",
            hrvDeviation: 0,
            sleepDebtMin: 0,
          },
        }),
      ).fired,
    ).toBe(true);
  });

  it("is null-safe for missing readiness", () => {
    expect(lowReadinessBlocksHard(makeInput({ readiness: null })).fired).toBe(
      false,
    );
    expect(hrvSuppressedBlocksHard(makeInput({ readiness: null })).fired).toBe(
      false,
    );
    expect(sleepDebtBlocksHard(makeInput({ readiness: null })).fired).toBe(
      false,
    );
  });

  it("fires HRV suppression at -1.5 but not above", () => {
    expect(
      hrvSuppressedBlocksHard(
        makeInput({
          readiness: {
            score: 80,
            zone: "optimal",
            hrvDeviation: -1.5,
            sleepDebtMin: 0,
          },
        }),
      ).fired,
    ).toBe(true);
    expect(
      hrvSuppressedBlocksHard(
        makeInput({
          readiness: {
            score: 80,
            zone: "optimal",
            hrvDeviation: -1.49,
            sleepDebtMin: 0,
          },
        }),
      ).fired,
    ).toBe(false);
  });

  it("fires ACWR spike above 1.5 but not at 1.5", () => {
    expect(acwrSpikeBlocksHard(makeInput({ load: { acwr: 1.51 } })).fired).toBe(
      true,
    );
    expect(acwrSpikeBlocksHard(makeInput({ load: { acwr: 1.5 } })).fired).toBe(
      false,
    );
    expect(acwrSpikeBlocksHard(makeInput({ load: { acwr: null } })).fired).toBe(
      false,
    );
  });

  it("fires low ACWR below 0.8 but not at 0.8", () => {
    expect(
      acwrVeryLowSuggestsLightBuild(makeInput({ load: { acwr: 0.79 } })).fired,
    ).toBe(true);
    expect(
      acwrVeryLowSuggestsLightBuild(makeInput({ load: { acwr: 0.8 } })).fired,
    ).toBe(false);
    expect(
      acwrVeryLowSuggestsLightBuild(makeInput({ load: { acwr: null } })).fired,
    ).toBe(false);
  });

  it("fires TSB overreaching below -30 but not at -30", () => {
    expect(
      tsbOverreachingSuggestsDeload(makeInput({ load: { tsb: -31 } })).fired,
    ).toBe(true);
    expect(
      tsbOverreachingSuggestsDeload(makeInput({ load: { tsb: -30 } })).fired,
    ).toBe(false);
    expect(
      tsbOverreachingSuggestsDeload(makeInput({ load: { tsb: null } })).fired,
    ).toBe(false);
  });

  it("fires consecutive hard recovery at 3 but not 2", () => {
    expect(
      consecutiveHardSuggestsRecovery(
        makeInput({ load: { consecutiveHardDays: 3 } }),
      ).fired,
    ).toBe(true);
    expect(
      consecutiveHardSuggestsRecovery(
        makeInput({ load: { consecutiveHardDays: 2 } }),
      ).fired,
    ).toBe(false);
  });

  it("fires race taper protection at 7 days but not 8", () => {
    expect(
      raceWeekProtectsTaper(makeInput({ raceDateDaysAway: 7 })).fired,
    ).toBe(true);
    expect(
      raceWeekProtectsTaper(makeInput({ raceDateDaysAway: 8 })).fired,
    ).toBe(false);
    expect(
      raceWeekProtectsTaper(makeInput({ raceDateDaysAway: null })).fired,
    ).toBe(false);
  });

  it("fires race-day rest only on day zero", () => {
    expect(raceDayRest(makeInput({ raceDateDaysAway: 0 })).fired).toBe(true);
    expect(raceDayRest(makeInput({ raceDateDaysAway: 1 })).fired).toBe(false);
    expect(raceDayRest(makeInput({ raceDateDaysAway: null })).fired).toBe(
      false,
    );
  });

  it("fires recent intervention for recovery bodywork in last two days", () => {
    expect(
      interventionRecentRespects(
        makeInput({
          recentInterventions: [{ type: "ice_bath", date: "2026-04-08" }],
        }),
      ).fired,
    ).toBe(true);
    expect(
      interventionRecentRespects(
        makeInput({
          recentInterventions: [{ type: "ice_bath", date: "2026-04-07" }],
        }),
      ).fired,
    ).toBe(false);
    expect(
      interventionRecentRespects(
        makeInput({
          recentInterventions: [{ type: "stretch", date: "2026-04-09" }],
        }),
      ).fired,
    ).toBe(false);
  });

  it("fires sleep debt at 180 minutes but not below", () => {
    expect(
      sleepDebtBlocksHard(
        makeInput({
          readiness: {
            score: 80,
            zone: "optimal",
            hrvDeviation: 0,
            sleepDebtMin: 180,
          },
        }),
      ).fired,
    ).toBe(true);
    expect(
      sleepDebtBlocksHard(
        makeInput({
          readiness: {
            score: 80,
            zone: "optimal",
            hrvDeviation: 0,
            sleepDebtMin: 179,
          },
        }),
      ).fired,
    ).toBe(false);
  });

  it("honors plan only when hard blocks are absent", () => {
    expect(planHonoredWhenSafe(makeInput()).fired).toBe(true);
    expect(
      planHonoredWhenSafe(
        makeInput({
          readiness: {
            score: 49,
            zone: "balanced",
            hrvDeviation: 0,
            sleepDebtMin: 0,
          },
        }),
      ).fired,
    ).toBe(false);
    expect(planHonoredWhenSafe(makeInput({ weeklyPlan: null })).fired).toBe(
      false,
    );
  });

  it("fires weekly quota only when no plan exists today", () => {
    expect(
      weeklyQuotaMetSuggestsRest(
        makeInput({
          weeklyPlan: {
            plannedToday: null,
            sessionsThisWeek: 4,
            plannedThisWeek: 4,
          },
        }),
      ).fired,
    ).toBe(true);
    expect(weeklyQuotaMetSuggestsRest(makeInput()).fired).toBe(false);
  });

  it("fires sparse data for no readiness or all load signal nulls", () => {
    expect(sparseDataLowConfidence(makeInput({ readiness: null })).fired).toBe(
      true,
    );
    expect(
      sparseDataLowConfidence(
        makeInput({
          readiness: {
            score: 80,
            zone: "optimal",
            hrvDeviation: null,
            sleepDebtMin: 0,
          },
          load: { acwr: null, tsb: null },
        }),
      ).fired,
    ).toBe(true);
    expect(sparseDataLowConfidence(makeInput()).fired).toBe(false);
  });
});
