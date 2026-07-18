// SPDX-FileCopyrightText: 2026 Anil Belur <askb23@gmail.com>
// SPDX-License-Identifier: Apache-2.0
import { GARMIN_SUMMARY_COLLECTIONS, parseGarminPush } from "./webhook-parse";

describe("parseGarminPush", () => {
  it("flattens known collections into { garminUserId, type, summary }", () => {
    const body = JSON.stringify({
      dailies: [{ userId: "g1", summaryId: "d1", steps: 100 }],
      activities: [
        { userId: "g1", summaryId: "a1" },
        { userId: "g2", summaryId: "a2" },
      ],
    });
    const out = parseGarminPush(body);
    expect(out).toHaveLength(3);
    expect(out[0]).toEqual({
      garminUserId: "g1",
      type: "dailySummary",
      summary: { userId: "g1", summaryId: "d1", steps: 100 },
    });
    expect(out.filter((s) => s.type === "activity")).toHaveLength(2);
  });

  it("maps every known collection key to its summary type", () => {
    const body = JSON.stringify(
      Object.fromEntries(
        Object.keys(GARMIN_SUMMARY_COLLECTIONS).map((k) => [
          k,
          [{ userId: "g1" }],
        ]),
      ),
    );
    const out = parseGarminPush(body);
    expect(out).toHaveLength(Object.keys(GARMIN_SUMMARY_COLLECTIONS).length);
    expect(new Set(out.map((s) => s.type))).toEqual(
      new Set(Object.values(GARMIN_SUMMARY_COLLECTIONS)),
    );
  });

  it("skips unknown keys and entries without a valid userId", () => {
    const body = JSON.stringify({
      dailies: [
        { userId: "g1" },
        { userId: "" }, // empty → skip
        { summaryId: "no-user" }, // missing userId → skip
        "not-an-object",
      ],
      unknownCollection: [{ userId: "gX" }],
    });
    const out = parseGarminPush(body);
    expect(out).toEqual([
      { garminUserId: "g1", type: "dailySummary", summary: { userId: "g1" } },
    ]);
  });

  it("returns [] when no known collections are present", () => {
    expect(
      parseGarminPush(JSON.stringify({ foo: [{ userId: "g1" }] })),
    ).toEqual([]);
  });

  it("throws when the top-level payload is not an object", () => {
    expect(() => parseGarminPush(JSON.stringify([1, 2]))).toThrow();
    expect(() => parseGarminPush(JSON.stringify("nope"))).toThrow();
  });
});
