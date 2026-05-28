// SPDX-FileCopyrightText: 2026 Anil Belur <askb23@gmail.com>
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";

import { appRouter } from "../../root";
import { normalizeAssistantMessageContent } from "../chat";

const TEST_USER_ID = "chat-history-user";
const RAW_ASSISTANT_BODY =
  "You played Tennis_v2 and Running_v1.\n1. First\n1. Second\n1. Third";

function makeSession() {
  const now = new Date("2026-05-03T12:00:00Z");
  return {
    user: {
      id: TEST_USER_ID,
      name: "Chat History User",
      email: "chat-history@example.test",
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

describe("chat history rendering cleanup", () => {
  it("normalizes persisted assistant history before returning it", async () => {
    const db = {
      query: {
        ChatMessage: {
          findMany: async () => [
            {
              id: "assistant-message",
              userId: TEST_USER_ID,
              role: "assistant",
              content: RAW_ASSISTANT_BODY,
              context: null,
              createdAt: new Date("2026-05-03T12:00:00Z"),
            },
          ],
        },
      },
    };

    const result = await createCaller(db).chat.getHistory({ limit: 50 });

    expect(result).toHaveLength(1);
    expect(result[0]?.content).toContain("Tennis");
    expect(result[0]?.content).toContain("Running");
    expect(result[0]?.content).not.toContain("Tennis_v2");
    expect(result[0]?.content).not.toContain("Running_v1");
    expect(result[0]?.content).toContain("1. First\n2. Second\n3. Third");
  });

  it("keeps assistant cleanup idempotent across repeated application", () => {
    const once = normalizeAssistantMessageContent(RAW_ASSISTANT_BODY);
    const twice = normalizeAssistantMessageContent(once);

    expect(twice).toBe(once);
  });

  it("restarts numbering on visually separated ordered-list blocks", () => {
    const input = "1. a\n11. b\n\nsome paragraph\n\n15. c\n16. d";
    expect(normalizeAssistantMessageContent(input)).toBe(
      "1. a\n2. b\n\nsome paragraph\n\n1. c\n2. d",
    );
  });
});
