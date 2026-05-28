// SPDX-FileCopyrightText: 2026 Anil Belur <askb23@gmail.com>
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it, vi } from "vitest";

import { appRouter } from "../../root";
import { humanizeActivityRow } from "../activity";

const TEST_USER_ID = "activity-humanize-user";

function makeSession() {
  const now = new Date("2026-05-03T12:00:00Z");
  return {
    user: {
      id: TEST_USER_ID,
      name: "Activity Humanize User",
      email: "activity-humanize@example.test",
      emailVerified: true,
      createdAt: now,
      updatedAt: now,
    },
    session: {
      id: "test-session",
      userId: TEST_USER_ID,
      token: "test-token",
      expiresAt: new Date("2026-05-04T12:00:00Z"),
      createdAt: now,
      updatedAt: now,
    },
  };
}

function createCaller(db: unknown) {
  return appRouter.createCaller({
    authApi: null as never,
    session: makeSession(),
    db: db as never,
  });
}

describe("activity router name humanization", () => {
  it("humanizes sport/sub type names returned by list and detail", async () => {
    const activityRow = {
      id: "activity-1",
      userId: TEST_USER_ID,
      sportType: "Tennis_v2",
      subType: "Running_v1",
      startedAt: new Date("2026-05-03T01:00:00Z"),
      durationMinutes: 45,
      distanceMeters: 5000,
      avgHr: 145,
      strainScore: 7,
      vo2maxEstimate: null,
      avgPaceSecPerKm: null,
      calories: 500,
      aerobicTE: null,
      anaerobicTE: null,
      avgPower: null,
      normalizedPower: null,
      avgGroundContactTime: null,
      verticalOscillation: null,
      strideLength: null,
      gctBalance: null,
      avgCadence: null,
      maxHr: null,
    };
    const db = {
      query: {
        Activity: {
          findMany: vi.fn(async () => [activityRow]),
          findFirst: vi.fn(async () => activityRow),
        },
        Profile: {
          findFirst: vi.fn(async () => null),
        },
      },
    };

    const caller = createCaller(db);
    const list = await caller.activity.list({ days: 30 });
    const detail = await caller.activity.getDetail({ id: "activity-1" });

    expect(list[0]).toMatchObject({
      sportType: "Tennis",
      subType: "Running",
    });
    expect(detail).toMatchObject({
      sportType: "Tennis",
      subType: "Running",
    });
  });

  it("keeps activity row humanization idempotent", () => {
    const row = {
      sportType: "Tennis_v2",
      subType: "Running_v1",
    };

    const once = humanizeActivityRow(row);
    const twice = humanizeActivityRow(once);

    expect(once).toEqual({
      sportType: "Tennis",
      subType: "Running",
    });
    expect(twice).toEqual(once);
  });
});
