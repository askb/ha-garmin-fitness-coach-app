// SPDX-FileCopyrightText: 2026 Anil Belur <askb23@gmail.com>
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";

import { humanizeActivityName } from "../humanize";

describe("humanizeActivityName", () => {
  it.each([
    ["tennis_v2", "Tennis"],
    ["open_water_swim", "Open Water Swim"],
    ["Run", "Run"],
    ["running_legacy", "Running"],
    ["cycling_alt2", "Cycling"],
    ["", ""],
  ])("humanizes %s", (slug, expected) => {
    expect(humanizeActivityName(slug)).toBe(expected);
  });
});
