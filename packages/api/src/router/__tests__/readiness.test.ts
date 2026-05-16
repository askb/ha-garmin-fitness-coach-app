// SPDX-FileCopyrightText: 2026 Anil Belur <askb23@gmail.com>
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";

import { buildActionSuggestion, computeDataQuality } from "../readiness";

// Minimal shape — only the fields the helpers actually read.
type Row = {
  date: string;
  hrv: number | null;
  totalSleepMinutes: number | null;
  restingHr: number | null;
  sleepDebtMinutes?: number | null;
};

function row(date: string, overrides: Partial<Row> = {}): Row {
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
    const recent = [row(today), row("2026-05-11", { hrv: 65 })];
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
      30,
      "low",
      dq,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      todayRow as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      recent as any,
      25, // hrvComponentScore — engine flagged HRV as below baseline
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
      30,
      "low",
      dq,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      row(today) as any,
      [],
    );
    expect(action).toMatch(/HRV data is unavailable/);
  });

  it("uses zone-based advice for high readiness", () => {
    const metric = row(today, {
      hrv: 60,
      totalSleepMinutes: 420,
      restingHr: 50,
    });
    const dq = computeDataQuality(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      metric as any,
      [],
      3,
      today,
    );
    const action = buildActionSuggestion(
      65,
      "high",
      dq,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      metric as any,
      [],
    );
    expect(action).toBe(
      "High readiness — stick to your planned training and execute the session as written.",
    );
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
      45,
      "moderate",
      dq,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      row(today, { hrv: 60, totalSleepMinutes: 420, restingHr: 50 }) as any,
      [],
    );
    expect(action).toMatch(/Moderate readiness/);
    expect(action).not.toMatch(/HRV data is unavailable/);
  });

  it("keeps planned training for moderate readiness despite HRV deficit", () => {
    const metric = row(today, {
      hrv: 19,
      totalSleepMinutes: 420,
      restingHr: 50,
    });
    const dq = computeDataQuality(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      metric as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      [metric] as any,
      3,
      today,
    );
    const action = buildActionSuggestion(
      45,
      "moderate",
      dq,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      metric as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      [metric] as any,
    );
    expect(action).toBe(
      "Moderate readiness — keep the planned session but trim volume slightly and stay in Zone 2.",
    );
    expect(action).not.toMatch(/Take it easy|30-min walk|planned session\./);
  });

  it("keeps planned training for moderate readiness despite low sleep", () => {
    const metric = row(today, {
      hrv: 60,
      totalSleepMinutes: 240,
      restingHr: 50,
      sleepDebtMinutes: 120,
    });
    const dq = computeDataQuality(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      metric as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      [metric] as any,
      3,
      today,
    );
    const action = buildActionSuggestion(
      45,
      "moderate",
      dq,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      metric as any,
      [],
    );
    expect(action).toBe(
      "Moderate readiness — keep the planned session but trim volume slightly and stay in Zone 2.",
    );
    expect(action).not.toMatch(/rest|30-min walk|Prioritize/);
  });

  it("preserves conservative walk recommendation for low readiness", () => {
    const metric = row(today, {
      hrv: 19,
      totalSleepMinutes: 420,
      restingHr: 50,
    });
    const dq = computeDataQuality(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      metric as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      [metric] as any,
      3,
      today,
    );
    const action = buildActionSuggestion(
      30,
      "low",
      dq,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      metric as any,
      [],
      25, // hrvComponentScore — engine flagged HRV as below baseline (19ms is low)
    );
    expect(action).toMatch(/Take it easy today/);
    expect(action).toMatch(/easy 30-min walk/);
  });

  it("does NOT blame HRV when readiness is low but HRV component is healthy", () => {
    // Reproduces the home-screen contradiction: readiness 21/100 (poor zone)
    // but the HRV component score is 76/100 (Optimal in the tile). Previously
    // buildActionSuggestion still asserted "your HRV of Xms is below baseline"
    // because it only checked dq.hrv === "missing" and the presence of a
    // recent HRV value, not whether the engine actually graded HRV as low.
    // The action should fall through to a non-HRV recovery message instead.
    const metric = row(today, {
      hrv: 62, // value is fine; engine scored it 76/100 (optimal)
      totalSleepMinutes: 360, // short sleep is the actual driver
      sleepDebtMinutes: 90,
      restingHr: 50,
    });
    const dq = computeDataQuality(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      metric as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      [metric] as any,
      3,
      today,
    );
    const action = buildActionSuggestion(
      21,
      "poor",
      dq,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      metric as any,
      [],
      76, // hrvComponentScore — engine scored HRV in the optimal range
    );
    expect(action).not.toMatch(/HRV of \d+ms is below baseline/);
    // Sleep debt is the actual driver in this fixture (90m short),
    // so the action should route to the sleep-debt fallback. Without
    // this stronger assertion the test would still pass if
    // buildActionSuggestion fell through to an unrelated training-load
    // message — leaving the intended behaviour uncovered.
    expect(action).toMatch(/Prioritize.*1h 30m of sleep/);
  });
});
