// SPDX-FileCopyrightText: 2026 Anil Belur <askb23@gmail.com>
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";

import { isHaAssistFallback } from "../ha-conversation";

describe("isHaAssistFallback", () => {
  it("detects the canned 'As a voice assistant' fallback", () => {
    expect(
      isHaAssistFallback(
        "As a voice assistant, I can help you with controlling your smart home devices.",
      ),
    ).toBe(true);
  });

  it("detects the 'I can help you control your home' variant", () => {
    expect(
      isHaAssistFallback("I can help you controlling your smart home."),
    ).toBe(true);
    expect(isHaAssistFallback("I can help you control your home.")).toBe(true);
  });

  it("detects 'Sorry, I'm not sure' and 'I don't know how to help' variants", () => {
    expect(isHaAssistFallback("Sorry, I'm not sure how to help")).toBe(true);
    expect(isHaAssistFallback("I don't know how to answer that")).toBe(true);
  });

  it("does NOT flag a normal coaching reply as fallback", () => {
    expect(
      isHaAssistFallback(
        "Your readiness is 72/100 today — recovery looks solid. Suggest a 45-minute Z2 run.",
      ),
    ).toBe(false);
  });

  it("returns false for empty input", () => {
    expect(isHaAssistFallback("")).toBe(false);
  });
});
