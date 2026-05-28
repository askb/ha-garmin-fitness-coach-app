// SPDX-FileCopyrightText: 2026 Anil Belur <askb23@gmail.com>
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";

import { adherenceSummary } from "../coach";

describe("adherenceSummary", () => {
  it("excludes no-plan points from completed and missed percentages", () => {
    const summary = adherenceSummary([
      {
        date: "2026-05-01",
        status: "completed",
        plannedDurationMin: 45,
        actualDurationMin: 45,
        confidence: 1,
        actualIds: ["activity-1"],
      },
      {
        date: "2026-05-02",
        status: "no-plan",
        plannedDurationMin: null,
        actualDurationMin: 0,
        confidence: 0,
        actualIds: [],
      },
      {
        date: "2026-05-03",
        status: "missed",
        plannedDurationMin: 45,
        actualDurationMin: 0,
        confidence: 1,
        actualIds: [],
      },
    ]);

    expect(summary.completedPct).toBe(50);
    expect(summary.missedPct).toBe(50);
  });

  it("returns zero percentages when only no-plan points are present", () => {
    const summary = adherenceSummary([
      {
        date: "2026-05-01",
        status: "no-plan",
        plannedDurationMin: null,
        actualDurationMin: 0,
        confidence: 0,
        actualIds: [],
      },
    ]);

    expect(summary.completedPct).toBe(0);
    expect(summary.missedPct).toBe(0);
  });
});
