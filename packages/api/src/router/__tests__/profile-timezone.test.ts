// SPDX-FileCopyrightText: 2026 Anil Belur <askb23@gmail.com>
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";

import { isSupportedTimezone } from "../profile";

describe("profile timezone validator", () => {
  it.each(["Australia/Brisbane", "America/New_York"])(
    "accepts %s",
    (timezone) => {
      expect(isSupportedTimezone(timezone)).toBe(true);
    },
  );

  it("rejects unknown zones", () => {
    expect(isSupportedTimezone("bogus/zone")).toBe(false);
  });
});
