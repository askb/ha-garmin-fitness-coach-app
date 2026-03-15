import { appRouter } from "../root";
import { db } from "@acme/db/client";

export const TEST_USER_ID = "seed-user-001";

export function createTestCaller(userId = TEST_USER_ID): ReturnType<typeof appRouter.createCaller> {
  const now = new Date();
  return appRouter.createCaller({
    authApi: null as never,
    session: {
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
        expiresAt: new Date(Date.now() + 86400000),
        createdAt: now,
        updatedAt: now,
      },
    },
    db,
  });
}

export { db };
