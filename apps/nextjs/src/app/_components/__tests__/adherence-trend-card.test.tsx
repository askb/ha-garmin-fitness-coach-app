/**
 * @jest-environment jsdom
 */
// SPDX-FileCopyrightText: 2026 Anil Belur <askb23@gmail.com>
// SPDX-License-Identifier: Apache-2.0

import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";

import { AdherenceTrendCard } from "../adherence-trend-card";

const mockUseQuery = jest.fn();

jest.mock("~/trpc/react", () => ({
  useTRPC: () => ({
    coach: {
      adherenceTrend: {
        queryOptions: (input: unknown) => ({
          queryKey: ["coach", "adherenceTrend", input],
        }),
      },
    },
    profile: {
      get: {
        queryOptions: () => ({ queryKey: ["profile", "get"] }),
      },
    },
  }),
}));

jest.mock("@tanstack/react-query", () => ({
  useQuery: (...args: unknown[]) => mockUseQuery(...args),
}));

type MockStatus = "completed" | "partial" | "extra" | "missed" | "no-plan";

function point(date: string, status: MockStatus) {
  return {
    date,
    status,
    plannedDurationMin: status === "no-plan" ? null : 45,
    actualDurationMin: status === "missed" || status === "no-plan" ? 0 : 45,
    confidence: 0.9,
    actualIds:
      status === "missed" || status === "no-plan" ? [] : [`act-${date}`],
  };
}

function mockTrend(statuses: MockStatus[]) {
  mockUseQuery.mockReturnValue({
    data: {
      points: statuses.map((status, index) =>
        point(`2026-05-${String(10 + index).padStart(2, "0")}`, status),
      ),
      summary: {},
    },
    isLoading: false,
    isError: false,
    refetch: jest.fn(),
  });
}

describe("AdherenceTrendCard", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("renders adherence rate from adherenceTrend data", () => {
    mockTrend(["completed", "partial", "extra", "missed"]);

    render(<AdherenceTrendCard userId="seed-user-001" />);

    expect(
      screen.getByLabelText("Adherence rate 75 percent"),
    ).toBeInTheDocument();
    expect(screen.getByText("75%")).toBeInTheDocument();
  });

  it("counts a three-day trailing positive streak", () => {
    mockTrend(["missed", "completed", "partial", "extra"]);

    render(<AdherenceTrendCard userId="seed-user-001" />);

    expect(screen.getByText(/3 days current streak/)).toBeInTheDocument();
  });

  it("resets the current streak when the trailing day is missed", () => {
    mockTrend(["completed", "partial", "extra", "missed"]);

    render(<AdherenceTrendCard userId="seed-user-001" />);

    expect(screen.getByText(/0 days current streak/)).toBeInTheDocument();
  });

  it("refetches the 28-day window when clicking 28d", () => {
    mockTrend(["completed"]);

    render(<AdherenceTrendCard userId="seed-user-001" />);
    fireEvent.click(screen.getByRole("button", { name: "28d" }));

    expect(mockUseQuery).toHaveBeenLastCalledWith({
      queryKey: [
        "coach",
        "adherenceTrend",
        { userId: "seed-user-001", days: 28 },
      ],
    });
  });

  it("renders an empty state when adherenceTrend has no rows", () => {
    mockUseQuery.mockReturnValue({
      data: { points: [], summary: {} },
      isLoading: false,
      isError: false,
      refetch: jest.fn(),
    });

    render(<AdherenceTrendCard userId="seed-user-001" />);

    expect(
      screen.getByText(
        "Adherence tracking starts after your first coach recommendation. Open today's recommendation above to begin.",
      ),
    ).toBeInTheDocument();
  });

  it("renders a loading skeleton", () => {
    mockUseQuery.mockReturnValue({ isLoading: true });

    render(<AdherenceTrendCard userId="seed-user-001" />);

    expect(screen.getByLabelText("Loading adherence trend")).toHaveAttribute(
      "aria-busy",
      "true",
    );
  });

  it("excludes no-plan days from adherence rate", () => {
    mockTrend(["completed", "no-plan", "missed"]);

    render(<AdherenceTrendCard userId="seed-user-001" />);

    expect(
      screen.getByLabelText("Adherence rate 50 percent"),
    ).toBeInTheDocument();
  });
});
