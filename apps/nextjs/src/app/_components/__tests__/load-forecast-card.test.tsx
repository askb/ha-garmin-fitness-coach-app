/**
 * @jest-environment jsdom
 */
// SPDX-FileCopyrightText: 2026 Anil Belur <askb23@gmail.com>
// SPDX-License-Identifier: Apache-2.0

import { fireEvent, render, screen } from "@testing-library/react";

import { LoadForecastCard } from "../load-forecast-card";

const mockUseQuery = jest.fn();

jest.mock("~/trpc/react", () => ({
  useTRPC: () => ({
    analytics: {
      getLoadForecast: {
        queryOptions: (input: unknown) => ({
          queryKey: ["analytics", "getLoadForecast", input],
        }),
      },
    },
  }),
}));

jest.mock("@tanstack/react-query", () => ({
  useQuery: (...args: unknown[]) => mockUseQuery(...args),
}));

function scenarioDays(scenario: string, endTsb: number, endCtl = 50) {
  return {
    scenario,
    assumedDailyLoad: 60,
    days: [
      {
        dayOffset: 1,
        ctl: endCtl,
        atl: endCtl,
        tsb: 0,
        acwr: 1,
        assumedLoad: 60,
      },
      {
        dayOffset: 28,
        ctl: endCtl,
        atl: endCtl - endTsb,
        tsb: endTsb,
        acwr: 1,
        assumedLoad: 60,
      },
    ],
  };
}

function mockForecast(overrides: Record<string, unknown> = {}) {
  mockUseQuery.mockReturnValue({
    data: {
      horizonDays: 28,
      hasData: true,
      scenarios: [
        scenarioDays("maintain", 2),
        scenarioDays("rest", 30),
        scenarioDays("rampUp", -20),
        scenarioDays("rampDown", 18),
      ],
      raceWindow: {
        startDayOffset: 10,
        endDayOffset: 16,
        peakTsb: 22.5,
      },
      vo2maxForecast: {
        points: [
          { dayOffset: 1, value: 52, lower: 50, upper: 54 },
          { dayOffset: 28, value: 53.4, lower: 51, upper: 55.8 },
        ],
        slopePerWeek: 0.35,
        rSquared: 0.8,
        confidence: "high",
      },
      timezone: "UTC",
      computedAt: "2026-05-30T00:00:00.000Z",
      ...overrides,
    },
    isLoading: false,
    isError: false,
  });
}

describe("LoadForecastCard", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("renders nothing while loading", () => {
    mockUseQuery.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
    });
    const { container } = render(<LoadForecastCard />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing when there is no data", () => {
    mockForecast({ hasData: false });
    const { container } = render(<LoadForecastCard />);
    expect(container).toBeEmptyDOMElement();
  });

  it("shows the maintain scenario by default with end-of-horizon form", () => {
    mockForecast();
    render(<LoadForecastCard />);
    expect(screen.getByText("28-day forecast")).toBeInTheDocument();
    // maintain end TSB = +2
    expect(screen.getByText("+2")).toBeInTheDocument();
  });

  it("switches projected form when a different scenario is selected", () => {
    mockForecast();
    render(<LoadForecastCard />);
    // rest scenario end TSB = +30
    fireEvent.click(screen.getByTestId("forecast-scenario-rest"));
    expect(screen.getByText("+30")).toBeInTheDocument();
  });

  it("surfaces the race-ready window and VO2max trajectory", () => {
    mockForecast();
    render(<LoadForecastCard />);
    expect(screen.getByText(/Race-ready window/i)).toBeInTheDocument();
    expect(screen.getByText("10–16")).toBeInTheDocument();
    expect(screen.getByText(/VO₂max trajectory/i)).toBeInTheDocument();
    expect(screen.getByText(/high confidence/i)).toBeInTheDocument();
  });
});
