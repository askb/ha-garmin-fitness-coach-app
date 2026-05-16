// SPDX-FileCopyrightText: 2026 Anil Belur <askb23@gmail.com>
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it, vi } from "vitest";

import { appRouter } from "../../root";

const TEST_USER_ID = "test-user-garmin";

function makeSession(userId = TEST_USER_ID) {
  const now = new Date();
  return {
    user: {
      id: userId,
      name: "Test User",
      email: "test@local",
      emailVerified: true,
      createdAt: now,
      updatedAt: now,
    },
    session: {
      id: "test-session",
      userId,
      token: "test-token",
      expiresAt: new Date(Date.now() + 86_400_000),
      createdAt: now,
      updatedAt: now,
    },
  };
}

function dateString(daysAgo: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - daysAgo);
  return d.toISOString().split("T")[0]!;
}

type TrainingSummaryRow = {
  date: string;
  hrv: number | null;
  garminTrainingReadiness: number | null;
  garminTrainingReadinessLevel: string | null;
  garminTrainingLoad: number | null;
  garminTrainingStatus: string | null;
  garminLoadFocus: unknown | null;
  garminRecoveryHours: number | null;
};

function makeMockDb(rows: TrainingSummaryRow[]) {
  const orderBy = vi.fn().mockResolvedValue(rows);
  const where = vi.fn(() => ({ orderBy }));
  const from = vi.fn(() => ({ where }));
  const select = vi.fn(() => ({ from }));

  return { select };
}

function createCaller(mockDb: ReturnType<typeof makeMockDb>) {
  return appRouter.createCaller({
    authApi: null as never,
    session: makeSession(),
    db: mockDb as never,
  });
}

describe("garmin.getTrainingSummary", () => {
  it("uses a 14-day default and reports per-field latest non-null dates", async () => {
    const recoveryDate = dateString(10);
    const statusDate = dateString(5);
    const readinessDate = dateString(1);
    const rows: TrainingSummaryRow[] = [
      {
        date: dateString(0),
        hrv: 42,
        garminTrainingReadiness: null,
        garminTrainingReadinessLevel: null,
        garminTrainingLoad: null,
        garminTrainingStatus: null,
        garminLoadFocus: null,
        garminRecoveryHours: null,
      },
      {
        date: readinessDate,
        hrv: 44,
        garminTrainingReadiness: 73,
        garminTrainingReadinessLevel: "GOOD",
        garminTrainingLoad: null,
        garminTrainingStatus: null,
        garminLoadFocus: null,
        garminRecoveryHours: null,
      },
      {
        date: statusDate,
        hrv: null,
        garminTrainingReadiness: null,
        garminTrainingReadinessLevel: null,
        garminTrainingLoad: 424,
        garminTrainingStatus: "PRODUCTIVE",
        garminLoadFocus: { highAerobic: 120 },
        garminRecoveryHours: null,
      },
      {
        date: recoveryDate,
        hrv: null,
        garminTrainingReadiness: null,
        garminTrainingReadinessLevel: null,
        garminTrainingLoad: null,
        garminTrainingStatus: null,
        garminLoadFocus: null,
        garminRecoveryHours: 16.7,
      },
    ];
    const caller = createCaller(makeMockDb(rows));

    const result = await caller.garmin.getTrainingSummary();

    expect(result.days).toBe(14);
    expect(result.latest?.garminTrainingReadiness).toBe(73);
    expect(result.latest?.garminTrainingReadinessLevel).toBe("GOOD");
    expect(result.latest?.garminTrainingLoad).toBe(424);
    expect(result.latest?.garminTrainingStatus).toBe("PRODUCTIVE");
    expect(result.latest?.garminLoadFocus).toEqual({ highAerobic: 120 });
    expect(result.latest?.garminRecoveryHours).toBe(16.7);
    expect(result.latestDates).toEqual({
      garminTrainingReadiness: readinessDate,
      garminTrainingReadinessLevel: readinessDate,
      garminTrainingLoad: statusDate,
      garminTrainingStatus: statusDate,
      garminLoadFocus: statusDate,
      garminRecoveryHours: recoveryDate,
    });
  });
});
