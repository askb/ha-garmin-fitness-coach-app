// SPDX-FileCopyrightText: 2026 Anil Belur <askb23@gmail.com>
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";

import {
  buildActionSuggestion,
  computeDataQuality,
} from "../readiness";

// Minimal shape — only the fields the helpers actually read.
type Row = {
  date: string;
  hrv: number | null;
  totalSleepMinutes: number | null;
  restingHr: number | null;
  sleepDebtMinutes?: number | null;
};

function row(
  date: string,
  overrides: Partial<Row> = {},
): Row {
  return {
    date,
    hrv: null,
    totalSleepMinutes: null,
    restingHr: null,
    ...overrides,
  };
}

describe("computeDataQuality — Garmin next-morning publish lag", () => {
  const today = "2026-05-16";

  it("reports HRV as 'good' when yesterday has a reading and today does not", () => {
    // Garmin typically publishes today's daily HRV the next morning. The
    // engine still uses yesterday's HRV (most recent non-null) and scores
    // confidently — the data-quality view must agree.
    const recent = [
      row(today, { restingHr: 50, totalSleepMinutes: 480 }),
      row("2026-05-15", { hrv: 62, restingHr: 49, totalSleepMinutes: 470 }),
    ];
    const dq = computeDataQuality(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      recent[0] as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      recent as any,
      3,
      today,
    );
    expect(dq.hrv).toBe("good");
  });

  it("reports HRV as 'missing' when no reading in the last 8 days", () => {
    const dq = computeDataQuality(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      row(today) as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      [row(today)] as any,
      3,
      today,
    );
    expect(dq.hrv).toBe("missing");
  });

  it("reports HRV as 'stale' when the most recent reading is 5 days old", () => {
    const recent = [
      row(today),
      row("2026-05-11", { hrv: 65 }),
    ];
    const dq = computeDataQuality(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      recent[0] as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      recent as any,
      3,
      today,
    );
    expect(dq.hrv).toBe("stale");
  });
});

describe("buildActionSuggestion — no contradiction with engine explanation", () => {
  const today = "2026-05-16";

  it("does NOT claim 'HRV data is unavailable' when yesterday's HRV is present", () => {
    // Reproduces the prod bug: score < 60, today's row is empty (Garmin
    // hasn't published yet), yesterday's HRV is fine. The engine's
    // explanation cites yesterday's HRV against baseline ("0.9 SD above")
    // and the action suggestion previously contradicted it with
    // "HRV data is unavailable".
    const todayRow = row(today);
    const recent = [todayRow, row("2026-05-15", { hrv: 62 })];
    const dq = computeDataQuality(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      todayRow as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      recent as any,
      3,
      today,
    );
    const action = buildActionSuggestion(
      45,
      dq,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      todayRow as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      recent as any,
    );
    expect(action).not.toMatch(/HRV data is unavailable/);
    expect(action).toMatch(/HRV of 62ms/);
  });

  it("still says 'HRV data is unavailable' when there is truly no recent HRV", () => {
    const dq = computeDataQuality(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      row(today) as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      [row(today)] as any,
      3,
      today,
    );
    const action = buildActionSuggestion(
      45,
      dq,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      row(today) as any,
      [],
    );
    expect(action).toMatch(/HRV data is unavailable/);
  });

  it("uses zone-based advice without contradiction for moderate readiness", () => {
    const dq = computeDataQuality(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      row(today, { hrv: 60, totalSleepMinutes: 420, restingHr: 50 }) as any,
      [],
      3,
      today,
    );
    const action = buildActionSuggestion(
      65,
      dq,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      row(today, { hrv: 60, totalSleepMinutes: 420, restingHr: 50 }) as any,
      [],
    );
    expect(action).toMatch(/Moderate readiness/);
    expect(action).not.toMatch(/HRV data is unavailable/);
  });
});
