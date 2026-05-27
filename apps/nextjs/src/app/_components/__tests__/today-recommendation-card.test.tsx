/**
 * @jest-environment jsdom
 */
// SPDX-FileCopyrightText: 2026 Anil Belur <askb23@gmail.com>
// SPDX-License-Identifier: Apache-2.0

import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";

import type { Recommendation } from "@acme/engine";

import { TodayRecommendationCard } from "../today-recommendation-card";

const mockUseQuery = jest.fn();
const mockToastSuccess = jest.fn();

jest.mock("~/trpc/react", () => ({
  useTRPC: () => ({
    coach: {
      getDailyRecommendation: {
        queryOptions: (input: unknown) => ({ queryKey: ["coach", input] }),
      },
    },
  }),
}));

jest.mock("@tanstack/react-query", () => ({
  useQuery: (...args: unknown[]) => mockUseQuery(...args),
}));

jest.mock("@acme/ui/toast", () => ({
  toast: { success: (message: string) => mockToastSuccess(message) },
}));

function makeRecommendation(confidence = 0.85): Recommendation {
  return {
    action: "workout",
    workoutType: "intervals",
    intensity: "hard",
    durationMin: 45,
    reason: "Your readiness supports hard intervals today.",
    confidence,
    hardBlocks: ["low-readiness-blocks-hard"],
    raceProximityDays: null,
    rules: [
      {
        ruleId: "low-readiness-blocks-hard",
        fired: true,
        severity: "block",
        message: "Readiness is low, so intensity should be reduced today.",
        inputs: {},
      },
      {
        ruleId: "plan-honored-when-safe",
        fired: true,
        severity: "info",
        message: "Plan day — no signals against your scheduled workout.",
        inputs: {},
      },
      {
        ruleId: "acwr-very-low-suggests-light-build",
        fired: true,
        severity: "warn",
        message: "Training load is low; use an easy build today.",
        inputs: {},
      },
      {
        ruleId: "weekly-quota-met-suggests-rest",
        fired: false,
        severity: "warn",
        message: "Weekly quota has already been met.",
        inputs: {},
      },
    ],
  };
}

function mockRecommendation(confidence = 0.85) {
  mockUseQuery.mockReturnValue({
    data: {
      auditId: "audit-123",
      recommendation: makeRecommendation(confidence),
    },
    isLoading: false,
    refetch: jest.fn(),
  });
}

describe("TodayRecommendationCard", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("renders the recommendation, hard block, and fired rule trace", () => {
    mockRecommendation();

    render(
      <TodayRecommendationCard userId="seed-user-001" date="2026-05-27" />,
    );

    expect(screen.getByText("Hard intervals")).toBeInTheDocument();
    expect(screen.getByText("45 min")).toBeInTheDocument();
    expect(
      screen.getByText("Your readiness supports hard intervals today."),
    ).toBeInTheDocument();
    expect(
      screen.getAllByText(
        "Readiness is low, so intensity should be reduced today.",
      )[0],
    ).toBeInTheDocument();

    fireEvent.click(screen.getByText("Why"));

    expect(
      screen.getAllByText(
        "Readiness is low, so intensity should be reduced today.",
      )[1],
    ).toBeVisible();
    expect(
      screen.getByText("Plan day — no signals against your scheduled workout."),
    ).toBeVisible();
    expect(
      screen.getByText("Training load is low; use an easy build today."),
    ).toBeVisible();
    expect(screen.queryByText("Weekly quota has already been met.")).toBeNull();
  });

  it("renders a loading skeleton", () => {
    mockUseQuery.mockReturnValue({ isLoading: true });

    render(
      <TodayRecommendationCard userId="seed-user-001" date="2026-05-27" />,
    );

    expect(
      screen.getByLabelText("Loading today's recommendation"),
    ).toHaveAttribute("aria-busy", "true");
  });

  it("renders an empty state with retry", () => {
    const refetch = jest.fn();
    mockUseQuery.mockReturnValue({ data: null, isLoading: false, refetch });

    render(
      <TodayRecommendationCard userId="seed-user-001" date="2026-05-27" />,
    );

    expect(screen.getByText("No recommendation for today")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it.each([
    [0.3, "low confidence"],
    [0.5, "medium confidence"],
    [0.9, "high confidence"],
  ])("renders confidence threshold %s as %s", (confidence, label) => {
    mockRecommendation(confidence);

    render(
      <TodayRecommendationCard userId="seed-user-001" date="2026-05-27" />,
    );

    expect(screen.getByText(label)).toBeInTheDocument();
  });

  it("fires accept, skip, and defer placeholder handlers", () => {
    mockRecommendation();
    const logSpy = jest
      .spyOn(console, "log")
      .mockImplementation(() => undefined);

    render(
      <TodayRecommendationCard userId="seed-user-001" date="2026-05-27" />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Accept" }));
    fireEvent.click(screen.getByRole("button", { name: "Skip" }));
    fireEvent.click(screen.getByRole("button", { name: "Defer" }));

    expect(logSpy).toHaveBeenCalledWith("[v0.17.0-w1.4] accept", {
      auditId: "audit-123",
      userId: "seed-user-001",
      date: "2026-05-27",
    });
    expect(logSpy).toHaveBeenCalledWith("[v0.17.0-w1.4] skip", {
      auditId: "audit-123",
      userId: "seed-user-001",
      date: "2026-05-27",
    });
    expect(logSpy).toHaveBeenCalledWith("[v0.17.0-w1.4] defer", {
      auditId: "audit-123",
      userId: "seed-user-001",
      date: "2026-05-27",
    });

    logSpy.mockRestore();
  });
});
