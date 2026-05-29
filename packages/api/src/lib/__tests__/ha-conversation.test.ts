// SPDX-FileCopyrightText: 2026 Anil Belur <askb23@gmail.com>
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";

import { isHaAssistFallback, isProviderError } from "../ha-conversation";

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

describe("isProviderError", () => {
  it("detects HA's 'Sorry, I had a problem getting a response from <provider>' wrapper", () => {
    expect(
      isProviderError(
        "Sorry, I had a problem getting a response from Google Generative AI.: This model is currently experiencing high demand. Spikes in demand are usually temporary. Please try again later.",
      ),
    ).toBe(true);
    expect(
      isProviderError("Sorry, I had a problem getting a response from OpenAI."),
    ).toBe(true);
  });

  it("detects 'experiencing high demand' / 'overloaded' phrases", () => {
    expect(
      isProviderError("This model is currently experiencing high demand."),
    ).toBe(true);
    expect(
      isProviderError("This model is currently overloaded; try again later."),
    ).toBe(true);
  });

  it("detects rate-limit / quota / resource-exhausted phrases", () => {
    expect(isProviderError("Rate limit exceeded. Try again in 60s.")).toBe(
      true,
    );
    expect(isProviderError("RESOURCE_EXHAUSTED: quota exceeded")).toBe(true);
    expect(isProviderError("Your daily quota exhausted for this model.")).toBe(
      true,
    );
  });

  it("detects 503 Service Unavailable / 529 overloaded variants", () => {
    expect(isProviderError("HTTP 503 Service Unavailable")).toBe(true);
    expect(isProviderError("Received 529 overloaded from upstream")).toBe(true);
  });

  it("does NOT flag a normal coaching reply as provider error", () => {
    expect(
      isProviderError(
        "Your last 5 runs averaged 28km/week at HR 152. Easy pace 6:30/km — recovery on track.",
      ),
    ).toBe(false);
    expect(
      isProviderError("You ran 503 calories yesterday in your easy session."),
    ).toBe(false);
  });

  it("returns false for empty input", () => {
    expect(isProviderError("")).toBe(false);
  });
});
