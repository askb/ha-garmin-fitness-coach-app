import { afterAll, describe, expect, it } from "vitest";

import { eq } from "@acme/db";
import { Profile } from "@acme/db/schema";

import { createTestCaller, db, TEST_USER_ID } from "./helpers";

const caller = createTestCaller();

const UPSERT_USER = "test-upsert-user";
const upsertCaller = createTestCaller(UPSERT_USER);

describe("profile router", () => {
  afterAll(async () => {
    // Clean up the profile created by the upsert test
    await db.delete(Profile).where(eq(Profile.userId, UPSERT_USER));
  });

  it("get returns the seed profile", async () => {
    const profile = await caller.profile.get();
    expect(profile).not.toBeNull();
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    expect(profile!.userId).toBe(TEST_USER_ID);
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    expect(profile!.age).toBe(32);
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    expect(profile!.sex).toBe("male");
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    expect(profile!.experienceLevel).toBe("intermediate");
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    expect(profile!.primarySports).toContain("running");
  });

  it("upsert creates a new profile and returns it", async () => {
    const result = await upsertCaller.profile.upsert({
      userId: UPSERT_USER,
      age: 28,
      sex: "female",
      timezone: "America/Denver",
      experienceLevel: "beginner",
    });

    expect(result).toBeDefined();
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    expect(result!.userId).toBe(UPSERT_USER);
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    expect(result!.age).toBe(28);
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    expect(result!.timezone).toBe("America/Denver");

    // Verify persistence via get
    const fetched = await upsertCaller.profile.get();
    expect(fetched).not.toBeNull();
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    expect(fetched!.userId).toBe(UPSERT_USER);
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    expect(fetched!.age).toBe(28);
  });
});
