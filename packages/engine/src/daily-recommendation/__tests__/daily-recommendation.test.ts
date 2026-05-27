import { describe, expect, it } from "vitest";

import type { DailyRecommendationInput } from "..";
import { recommendDay } from "..";

type InputOverrides = Partial<
  Omit<DailyRecommendationInput, "readiness" | "load" | "weeklyPlan">
> & {
  readiness?: DailyRecommendationInput["readiness"];
  load?: Partial<DailyRecommendationInput["load"]>;
  weeklyPlan?: DailyRecommendationInput["weeklyPlan"];
};

type ExpectedRecommendation = {
  action: DailyRecommendationInput["weeklyPlan"] extends infer _Plan
    ? ReturnType<typeof recommendDay>["action"]
    : never;
  intensity?: ReturnType<typeof recommendDay>["intensity"];
  workoutType?: string;
  hardBlocks: string[];
  firedRules: string[];
  maxConfidence?: number;
  reasonIncludes?: string;
};

function makeInput(overrides: InputOverrides = {}): DailyRecommendationInput {
  const base: DailyRecommendationInput = {
    date: "2026-04-10",
    readiness: {
      score: 82,
      zone: "optimal",
      hrvDeviation: 0.4,
      sleepDebtMin: 0,
    },
    load: {
      acwr: 1.0,
      tsb: 5,
      consecutiveHardDays: 0,
    },
    weeklyPlan: {
      plannedToday: {
        workoutType: "tempo",
        intensity: "hard",
        durationMin: 50,
      },
      sessionsThisWeek: 2,
      plannedThisWeek: 5,
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

function firedRuleIds(input: DailyRecommendationInput): string[] {
  return recommendDay(input)
    .rules.filter((rule) => rule.fired)
    .map((rule) => rule.ruleId);
}

const fixtures: Array<{
  name: string;
  input: DailyRecommendationInput;
  expected: ExpectedRecommendation;
}> = [
  {
    name: "optimal day honors the hard plan",
    input: makeInput(),
    expected: {
      action: "workout",
      intensity: "hard",
      workoutType: "tempo",
      hardBlocks: [],
      firedRules: ["plan-honored-when-safe"],
    },
  },
  {
    name: "low readiness alone downgrades hard plan to easy",
    input: makeInput({
      readiness: {
        score: 49,
        zone: "balanced",
        hrvDeviation: 0,
        sleepDebtMin: 0,
      },
    }),
    expected: {
      action: "workout",
      intensity: "easy",
      workoutType: "tempo",
      hardBlocks: ["low-readiness-blocks-hard"],
      firedRules: ["low-readiness-blocks-hard"],
    },
  },
  {
    name: "compromised readiness downgrades moderate plan to easy",
    input: makeInput({
      readiness: {
        score: 60,
        zone: "compromised",
        hrvDeviation: 0,
        sleepDebtMin: 0,
      },
      weeklyPlan: {
        plannedToday: {
          workoutType: "steady_run",
          intensity: "moderate",
          durationMin: 45,
        },
        sessionsThisWeek: 2,
        plannedThisWeek: 5,
      },
    }),
    expected: {
      action: "workout",
      intensity: "easy",
      workoutType: "steady_run",
      hardBlocks: ["low-readiness-blocks-hard"],
      firedRules: ["low-readiness-blocks-hard"],
    },
  },
  {
    name: "HRV suppression and ACWR spike force active recovery",
    input: makeInput({
      readiness: {
        score: 70,
        zone: "balanced",
        hrvDeviation: -1.6,
        sleepDebtMin: 0,
      },
      load: { acwr: 1.6 },
    }),
    expected: {
      action: "active_recovery",
      intensity: "easy",
      workoutType: "yoga",
      hardBlocks: ["hrv-suppressed-blocks-hard", "acwr-spike-blocks-hard"],
      firedRules: ["hrv-suppressed-blocks-hard", "acwr-spike-blocks-hard"],
    },
  },
  {
    name: "race day without a plan rests",
    input: makeInput({ raceDateDaysAway: 0, weeklyPlan: null }),
    expected: {
      action: "rest",
      workoutType: "rest",
      hardBlocks: ["race-week-protects-taper", "race-day-rest"],
      firedRules: ["race-week-protects-taper", "race-day-rest"],
    },
  },
  {
    name: "race week hard plan downgrades to easy",
    input: makeInput({ raceDateDaysAway: 5 }),
    expected: {
      action: "workout",
      intensity: "easy",
      workoutType: "easy_run",
      hardBlocks: ["race-week-protects-taper"],
      firedRules: ["race-week-protects-taper"],
    },
  },
  {
    name: "race week easy plan remains easy",
    input: makeInput({
      raceDateDaysAway: 5,
      weeklyPlan: {
        plannedToday: {
          workoutType: "easy_run",
          intensity: "easy",
          durationMin: 30,
        },
        sessionsThisWeek: 2,
        plannedThisWeek: 5,
      },
    }),
    expected: {
      action: "workout",
      intensity: "easy",
      workoutType: "easy_run",
      hardBlocks: ["race-week-protects-taper"],
      firedRules: ["race-week-protects-taper"],
    },
  },
  {
    name: "sparse data stays conservative with low confidence",
    input: makeInput({
      readiness: null,
      load: { acwr: null, tsb: null, consecutiveHardDays: 0 },
      weeklyPlan: null,
    }),
    expected: {
      action: "rest",
      workoutType: "rest",
      hardBlocks: [],
      firedRules: ["sparse-data-low-confidence"],
      maxConfidence: 0.2,
      reasonIncludes: "sparse",
    },
  },
  {
    name: "three consecutive hard days suggest active recovery",
    input: makeInput({ weeklyPlan: null, load: { consecutiveHardDays: 3 } }),
    expected: {
      action: "active_recovery",
      intensity: "easy",
      workoutType: "yoga",
      hardBlocks: [],
      firedRules: ["consecutive-hard-suggests-recovery"],
    },
  },
  {
    name: "TSB below minus 30 with four hard days deloads",
    input: makeInput({
      weeklyPlan: null,
      load: { tsb: -40, consecutiveHardDays: 4 },
    }),
    expected: {
      action: "deload",
      intensity: "easy",
      workoutType: "easy_run",
      hardBlocks: [],
      firedRules: [
        "tsb-overreaching-suggests-deload",
        "consecutive-hard-suggests-recovery",
      ],
    },
  },
  {
    name: "recent physio downgrades a moderate plan one step",
    input: makeInput({
      weeklyPlan: {
        plannedToday: {
          workoutType: "steady_run",
          intensity: "moderate",
          durationMin: 45,
        },
        sessionsThisWeek: 2,
        plannedThisWeek: 5,
      },
      recentInterventions: [{ type: "physio", date: "2026-04-09" }],
    }),
    expected: {
      action: "workout",
      intensity: "easy",
      workoutType: "steady_run",
      hardBlocks: [],
      firedRules: ["intervention-recent-respects"],
    },
  },
  {
    name: "recent massage downgrades a hard plan one step",
    input: makeInput({
      recentInterventions: [{ type: "massage", date: "2026-04-10" }],
    }),
    expected: {
      action: "workout",
      intensity: "moderate",
      workoutType: "tempo",
      hardBlocks: [],
      firedRules: ["intervention-recent-respects"],
    },
  },
  {
    name: "weekly quota met with no plan rests",
    input: makeInput({
      weeklyPlan: {
        plannedToday: null,
        sessionsThisWeek: 5,
        plannedThisWeek: 5,
      },
    }),
    expected: {
      action: "rest",
      workoutType: "rest",
      hardBlocks: [],
      firedRules: ["weekly-quota-met-suggests-rest"],
    },
  },
  {
    name: "easy plan and low readiness keeps easy",
    input: makeInput({
      readiness: {
        score: 45,
        zone: "balanced",
        hrvDeviation: 0,
        sleepDebtMin: 0,
      },
      weeklyPlan: {
        plannedToday: {
          workoutType: "easy_run",
          intensity: "easy",
          durationMin: 30,
        },
        sessionsThisWeek: 2,
        plannedThisWeek: 5,
      },
    }),
    expected: {
      action: "workout",
      intensity: "easy",
      workoutType: "easy_run",
      hardBlocks: ["low-readiness-blocks-hard"],
      firedRules: ["low-readiness-blocks-hard"],
    },
  },
  {
    name: "hard plan with ACWR spike becomes moderate",
    input: makeInput({ load: { acwr: 1.6 } }),
    expected: {
      action: "workout",
      intensity: "moderate",
      workoutType: "tempo",
      hardBlocks: ["acwr-spike-blocks-hard"],
      firedRules: ["acwr-spike-blocks-hard"],
    },
  },
  {
    name: "hard plan with ACWR spike and low readiness becomes easy",
    input: makeInput({
      readiness: {
        score: 45,
        zone: "balanced",
        hrvDeviation: 0,
        sleepDebtMin: 0,
      },
      load: { acwr: 1.6 },
    }),
    expected: {
      action: "workout",
      intensity: "easy",
      workoutType: "tempo",
      hardBlocks: ["low-readiness-blocks-hard", "acwr-spike-blocks-hard"],
      firedRules: ["low-readiness-blocks-hard", "acwr-spike-blocks-hard"],
    },
  },
  {
    name: "very low ACWR alone suggests an easy build",
    input: makeInput({ weeklyPlan: null, load: { acwr: 0.7 } }),
    expected: {
      action: "workout",
      intensity: "easy",
      workoutType: "easy_run",
      hardBlocks: [],
      firedRules: ["acwr-very-low-suggests-light-build"],
    },
  },
  {
    name: "sleep debt blocks hard plan and downgrades to easy",
    input: makeInput({
      readiness: {
        score: 75,
        zone: "balanced",
        hrvDeviation: 0,
        sleepDebtMin: 180,
      },
    }),
    expected: {
      action: "workout",
      intensity: "easy",
      workoutType: "tempo",
      hardBlocks: ["sleep-debt-blocks-hard"],
      firedRules: ["sleep-debt-blocks-hard"],
    },
  },
  {
    name: "no plan and no signals defaults to moderate workout",
    input: makeInput({ weeklyPlan: null }),
    expected: {
      action: "workout",
      intensity: "moderate",
      workoutType: "steady_run",
      hardBlocks: [],
      firedRules: [],
    },
  },
  {
    name: "balanced moderate plan is honored",
    input: makeInput({
      weeklyPlan: {
        plannedToday: {
          workoutType: "steady_run",
          intensity: "moderate",
          durationMin: 45,
        },
        sessionsThisWeek: 1,
        plannedThisWeek: 4,
      },
    }),
    expected: {
      action: "workout",
      intensity: "moderate",
      workoutType: "steady_run",
      hardBlocks: [],
      firedRules: ["plan-honored-when-safe"],
    },
  },
];

describe("recommendDay", () => {
  it.each(fixtures)("$name", ({ input, expected }) => {
    const result = recommendDay(input);

    expect(result).toEqual(
      expect.objectContaining({
        action: expected.action,
        hardBlocks: expected.hardBlocks,
        workoutType: expected.workoutType,
      }),
    );

    if (expected.intensity !== undefined) {
      expect(result.intensity).toBe(expected.intensity);
    }

    expect(firedRuleIds(input)).toEqual(expected.firedRules);

    if (expected.maxConfidence !== undefined) {
      expect(result.confidence).toBeLessThanOrEqual(expected.maxConfidence);
    }

    if (expected.reasonIncludes !== undefined) {
      expect(result.reason.toLowerCase()).toContain(expected.reasonIncludes);
    }
  });

  it("returns every rule trace for replay", () => {
    const result = recommendDay(makeInput());

    expect(result.rules).toHaveLength(13);
    expect(result.rules[0]).toEqual(
      expect.objectContaining({
        ruleId: "low-readiness-blocks-hard",
        fired: false,
        severity: "block",
      }),
    );
  });

  // Regression: PR #206 Copilot review — race-week-protects-taper fires on
  // race day (raceDateDaysAway === 0) and previously downgraded the planned
  // race itself from hard to moderate, defeating the race-day branch.
  it("race day with planned race workout keeps hard intensity", () => {
    const result = recommendDay(
      makeInput({
        raceDateDaysAway: 0,
        weeklyPlan: {
          plannedToday: {
            workoutType: "race",
            intensity: "hard",
            durationMin: 90,
          },
          sessionsThisWeek: 3,
          plannedThisWeek: 5,
        },
      }),
    );

    expect(result.action).toBe("workout");
    expect(result.workoutType).toBe("race");
    expect(result.intensity).toBe("hard");
  });

  // Regression: PR #206 Copilot review — plan-honored-when-safe must not fire
  // when warning rules will subsequently downgrade the planned intensity,
  // otherwise the audit trace contradicts the actual recommendation.
  it("plan-honored-when-safe does not fire when warns will downgrade plan", () => {
    const result = recommendDay(
      makeInput({
        recentInterventions: [{ type: "physio", date: "2026-04-09" }],
      }),
    );

    const planHonored = result.rules.find(
      (rule) => rule.ruleId === "plan-honored-when-safe",
    );
    expect(planHonored).toBeDefined();
    expect(planHonored?.fired).toBe(false);

    // And the intensity should actually be downgraded by the intervention rule.
    const interventionRule = result.rules.find(
      (rule) => rule.ruleId === "intervention-recent-respects",
    );
    expect(interventionRule?.fired).toBe(true);
    expect(result.intensity).not.toBe("hard");
  });
});
