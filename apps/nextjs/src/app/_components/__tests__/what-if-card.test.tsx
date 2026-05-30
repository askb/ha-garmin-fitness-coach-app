/**
 * @jest-environment jsdom
 */
// SPDX-FileCopyrightText: 2026 Anil Belur <askb23@gmail.com>
// SPDX-License-Identifier: Apache-2.0

import { render, screen } from "@testing-library/react";

import { WhatIfCard } from "../what-if-card";

const mockUseQuery = jest.fn();

jest.mock("~/trpc/react", () => ({
  useTRPC: () => ({
    analytics: {
      getWhatIfToday: {
        queryOptions: () => ({ queryKey: ["analytics", "getWhatIfToday"] }),
      },
    },
  }),
}));

jest.mock("@tanstack/react-query", () => ({
  useQuery: (...args: unknown[]) => mockUseQuery(...args),
}));

function outcome(
  id: string,
  label: string,
  endTsb: number,
  flag: "safe" | "caution" | "high",
  peakAcwr = 1.0,
) {
  return {
    id,
    label,
    todayLoad: 50,
    tomorrow: { ctl: 50, atl: 50, tsb: 0, acwr: peakAcwr },
    endOfHorizon: { ctl: 50, atl: 50 - endTsb, tsb: endTsb, acwr: peakAcwr },
    peakAcwr,
    acwrFlag: flag,
  };
}

function mockData(hasData = true) {
  mockUseQuery.mockReturnValue({
    data: {
      hasData,
      outcomes: [
        outcome("rest", "Rest today", 12, "safe", 0.7),
        outcome("easy", "Easy session", 6, "safe", 0.95),
        outcome("hard", "Hard session", -8, "high", 1.6),
      ],
      timezone: "UTC",
      computedAt: "2026-05-30T00:00:00.000Z",
    },
    isLoading: false,
    isError: false,
  });
}

describe("WhatIfCard", () => {
  beforeEach(() => jest.clearAllMocks());

  it("renders nothing while loading", () => {
    mockUseQuery.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
    });
    const { container } = render(<WhatIfCard />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing when there is no data", () => {
    mockData(false);
    const { container } = render(<WhatIfCard />);
    expect(container).toBeEmptyDOMElement();
  });

  it("lists every training choice", () => {
    mockData();
    render(<WhatIfCard />);
    expect(screen.getByTestId("whatif-rest")).toBeInTheDocument();
    expect(screen.getByTestId("whatif-easy")).toBeInTheDocument();
    expect(screen.getByTestId("whatif-hard")).toBeInTheDocument();
  });

  it("marks the freshest non-high-risk option as best form", () => {
    mockData();
    render(<WhatIfCard />);
    // rest has the highest end TSB (12) and is safe → best form badge.
    const rest = screen.getByTestId("whatif-rest");
    expect(rest).toHaveTextContent(/best form/i);
  });

  it("flags a hard session as high risk", () => {
    mockData();
    render(<WhatIfCard />);
    expect(screen.getByTestId("whatif-hard")).toHaveTextContent(/High risk/i);
  });
});
