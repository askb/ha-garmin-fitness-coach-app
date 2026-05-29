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

const TEST_USER_ID = "chat-humanize-user";

function makeSession() {
  const now = new Date("2026-05-03T12:00:00Z");
  return {
    user: {
      id: TEST_USER_ID,
      name: "Chat Humanize User",
      email: "chat-humanize@example.test",
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
  const values = vi.fn((row: unknown) => ({
    returning: vi.fn(async () => [
      {
        id: "assistant-message",
        userId: TEST_USER_ID,
        role: "assistant",
        ...(row as object),
        createdAt: new Date("2026-05-03T12:00:00Z"),
      },
    ]),
  }));

  const activity = {
    id: "activity-1",
    userId: TEST_USER_ID,
    sportType: "Tennis_v2",
    startedAt: new Date("2026-05-03T01:00:00Z"),
    durationMinutes: 60,
    distanceMeters: null,
    avgHr: 132,
    trimpScore: 50,
    strainScore: 5,
    hrZoneMinutes: null,
  };

  return {
    query: {
      ChatMessage: { findMany: vi.fn(async () => []) },
      DailyMetric: { findMany: vi.fn(async () => []) },
      Activity: { findMany: vi.fn(async () => [activity]) },
      Profile: {
        findFirst: vi.fn(async () => ({
          userId: TEST_USER_ID,
          timezone: "Australia/Brisbane",
          goals: [{ sport: "Tennis_v2", goalType: "fitness" }],
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

describe("chat activity humanization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.haConversationChat.mockResolvedValue("Looks good.");
  });

  it("injects humanized activity names into the chat prompt", async () => {
    await createCaller(makeDb()).chat.sendMessage({
      content: "How was that session?",
      agent: "sport-scientist",
    });

    const prompt = mocks.haConversationChat.mock.calls[0]?.[0] as string;
    expect(prompt).toContain("Tennis");
    expect(prompt).not.toContain("Tennis_v2");
    expect(prompt).not.toContain("Tennis v2");
  });
});
