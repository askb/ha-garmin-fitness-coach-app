import { formatDateInTz, formatTimeInTz, getGreeting } from "../format-date";

// SPDX-FileCopyrightText: 2026 Anil Belur <askb23@gmail.com>
// SPDX-License-Identifier: Apache-2.0

/**
 * Regression tests for `format-date.ts`.
 *
 * The fix in PR #119 routed all last-sync / activity timestamps through
 * these helpers so plain `YYYY-MM-DD` strings no longer fall off-by-one
 * day for users east of UTC. The bug was that `new Date("2026-05-14")`
 * yields midnight UTC, which is the previous day's evening in Australia,
 * so the formatter (with `timeZone: "Australia/Brisbane"`) displayed
 * "Wed, May 13" for what the user knew as "May 14".
 *
 * Normalising bare dates to noon-UTC (`2026-05-14T12:00:00.000Z`) keeps
 * the wall-clock date stable for every IANA zone between UTC-11 and
 * UTC+13, which covers every populated timezone.
 */

// `format-date.ts` imports `~/trpc/react` at module scope (for the
// `useUserTimezone` hook) which transitively loads superjson (ESM-only).
// Stub the trpc surface so the pure formatters can be evaluated under
// the CJS jest runtime.
jest.mock("~/trpc/react", () => ({ useTRPC: () => ({}) }));

describe("formatDateInTz", () => {
  it.each<[string, string, string]>([
    ["Australia/Brisbane", "2026-05-14", "Thu, May 14"],
    ["America/Los_Angeles", "2026-05-14", "Thu, May 14"],
    ["Asia/Tokyo", "2026-05-14", "Thu, May 14"],
    ["UTC", "2026-05-14", "Thu, May 14"],
  ])(
    "renders %s wall-clock date for plain %s string",
    (timezone, input, expected) => {
      expect(formatDateInTz(input, timezone)).toBe(expected);
    },
  );

  it("still formats full ISO timestamps in the requested zone", () => {
    // 23:30 UTC on May 14 = 09:30 May 15 in Brisbane (UTC+10, no DST).
    const out = formatDateInTz(
      "2026-05-14T23:30:00.000Z",
      "Australia/Brisbane",
    );
    expect(out).toBe("Fri, May 15");
  });

  it("returns em-dash for null / undefined / invalid", () => {
    expect(formatDateInTz(null, "UTC")).toBe("—");
    expect(formatDateInTz(undefined, "UTC")).toBe("—");
    expect(formatDateInTz("not-a-date", "UTC")).toBe("—");
  });

  it("accepts Date instances and numeric epochs", () => {
    expect(formatDateInTz(new Date("2026-05-14T12:00:00Z"), "UTC")).toBe(
      "Thu, May 14",
    );
    const epoch = Date.UTC(2026, 4, 14, 12, 0, 0);
    expect(formatDateInTz(epoch, "UTC")).toBe("Thu, May 14");
  });
});

describe("getGreeting", () => {
  it.each<[string, string]>([
    ["2026-05-14T09:00:00.000Z", "Good morning ☀️"],
    ["2026-05-14T13:00:00.000Z", "Good afternoon 🌤️"],
    ["2026-05-14T19:00:00.000Z", "Good evening 🌙"],
    ["2026-05-14T23:00:00.000Z", "Good night ✨"],
    ["2026-05-14T04:00:00.000Z", "Good night ✨"],
  ])("returns %s greeting for UTC hour", (input, expected) => {
    expect(getGreeting(new Date(input), "UTC")).toBe(expected);
  });

  it("uses the configured timezone to determine local hour", () => {
    expect(
      getGreeting(new Date("2026-05-14T12:00:00.000Z"), "Australia/Brisbane"),
    ).toBe("Good night ✨");
  });
});

describe("formatTimeInTz", () => {
  it("formats UTC timestamps in the configured zone", () => {
    // 12:00 UTC = 22:00 in Brisbane.
    const out = formatTimeInTz(
      "2026-05-14T12:00:00.000Z",
      "Australia/Brisbane",
    );
    expect(out).toMatch(/10:00\s?PM/);
  });

  it("returns em-dash for nullish values", () => {
    expect(formatTimeInTz(null, "UTC")).toBe("—");
    expect(formatTimeInTz(undefined, "UTC")).toBe("—");
  });
});
