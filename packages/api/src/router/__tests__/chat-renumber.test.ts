// SPDX-FileCopyrightText: 2026 Anil Belur <askb23@gmail.com>
// SPDX-License-Identifier: Apache-2.0

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  haConversationChat: vi.fn(),
  ollamaChat: vi.fn(),
}));

vi.mock("../../lib/ha-conversation", () => ({
  haConversationChat: mocks.haConversationChat,
}));

vi.mock("../../lib/ollama", () => ({
  ollamaChat: mocks.ollamaChat,
}));

const { appRouter } = await import("../../root");

const TEST_USER_ID = "chat-user";

function makeSession() {
  const now = new Date("2026-05-03T12:00:00Z");
  return {
    user: {
      id: TEST_USER_ID,
      name: "Chat User",
      email: "chat@example.test",
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

function makeDb() {
  const inserted: unknown[] = [];
  const values = vi.fn((row: unknown) => {
    inserted.push(row);
    return {
      returning: vi.fn(async () => [
        {
          id: "assistant-message",
          userId: TEST_USER_ID,
          role: "assistant",
          ...(row as object),
          createdAt: new Date("2026-05-03T12:00:00Z"),
        },
      ]),
    };
  });

  const activity = {
    id: "activity-1",
    userId: TEST_USER_ID,
    sportType: "running",
    startedAt: new Date("2026-05-03T01:00:00Z"),
    durationMinutes: 45,
    distanceMeters: 10000,
    avgHr: 145,
    trimpScore: 70,
    strainScore: 7,
    hrZoneMinutes: null,
  };

  return {
    inserted,
    query: {
      ChatMessage: { findMany: vi.fn(async () => []) },
      DailyMetric: { findMany: vi.fn(async () => []) },
      Activity: { findMany: vi.fn(async () => [activity]) },
      Profile: {
        findFirst: vi.fn(async () => ({
          userId: TEST_USER_ID,
          timezone: "Australia/Brisbane",
          goals: [],
        })),
      },
      ReadinessScore: { findFirst: vi.fn(async () => null) },
      VO2maxEstimate: { findMany: vi.fn(async () => []) },
      JournalEntry: { findMany: vi.fn(async () => []) },
      Intervention: { findMany: vi.fn(async () => []) },
      AdvancedMetric: { findMany: vi.fn(async () => []) },
      AthleteBaseline: { findMany: vi.fn(async () => []) },
    },
    insert: vi.fn(() => ({ values })),
  };
}

function createCaller(db: unknown) {
  return appRouter.createCaller({
    authApi: null as never,
    session: makeSession(),
    db: db as never,
  });
}

describe("chat response post-processing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.haConversationChat.mockResolvedValue(
      "5. Warm up\n6. Build\n10. Cool down",
    );
  });

  it("renumbers LLM ordered lists before persisting and returning", async () => {
    const db = makeDb();

    const result = await createCaller(db).chat.sendMessage({
      content: "What should I do today?",
      agent: "sport-scientist",
    });

    expect(result.content).toContain("1. Warm up\n2. Build\n3. Cool down");
    expect(result.content).not.toContain("10. Cool down");
    expect(db.inserted.at(-1)).toMatchObject({
      role: "assistant",
      content: expect.stringContaining(
        "1. Warm up\n2. Build\n3. Cool down",
      ) as string,
    });
  });
});
