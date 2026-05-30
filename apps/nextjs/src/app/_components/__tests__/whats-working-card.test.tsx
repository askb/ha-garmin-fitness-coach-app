/**
 * @jest-environment jsdom
 */
// SPDX-FileCopyrightText: 2026 Anil Belur <askb23@gmail.com>
// SPDX-License-Identifier: Apache-2.0

import { render, screen } from "@testing-library/react";

import { WhatsWorkingCard } from "../whats-working-card";

const mockUseQuery = jest.fn();

jest.mock("~/trpc/react", () => ({
  useTRPC: () => ({
    coach: {
      ruleEffectiveness: {
        queryOptions: (input: unknown) => ({
          queryKey: ["coach", "ruleEffectiveness", input],
        }),
      },
    },
  }),
}));

jest.mock("@tanstack/react-query", () => ({
  useQuery: (...args: unknown[]) => mockUseQuery(...args),
}));

interface MockRule {
  ruleId: string;
  n: number;
  score: number;
  meanReadinessDelta?: number | null;
  meanHrvDelta?: number | null;
  meanTsbDelta?: number | null;
}

function mockRules(rules: MockRule[]) {
  mockUseQuery.mockReturnValue({
    data: {
      rules: rules.map((r) => ({
        meanReadinessDelta: null,
        meanHrvDelta: null,
        meanTsbDelta: null,
        ...r,
      })),
    },
    isLoading: false,
    isError: false,
  });
}

describe("WhatsWorkingCard", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("renders nothing while loading", () => {
    mockUseQuery.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
    });
    const { container } = render(<WhatsWorkingCard />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing when there are no measured rules", () => {
    mockRules([]);
    const { container } = render(<WhatsWorkingCard />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders friendly rule labels sorted by score", () => {
    mockRules([
      { ruleId: "sleep-debt-blocks-hard", n: 4, score: 0.42 },
      { ruleId: "low-readiness-blocks-hard", n: 9, score: 0.71 },
    ]);

    render(<WhatsWorkingCard />);

    expect(screen.getByText("What's working for you")).toBeInTheDocument();
    const items = screen.getAllByTestId("whats-working-rule");
    expect(items).toHaveLength(2);
    // Highest score first.
    expect(items[0]).toHaveTextContent("Easing back when readiness is low");
    expect(items[0]).toHaveTextContent("+71");
    expect(items[1]).toHaveTextContent("Holding back when in sleep debt");
    expect(screen.getByText("9 decisions measured")).toBeInTheDocument();
  });

  it("excludes rules with zero measured decisions", () => {
    mockRules([
      { ruleId: "race-day-rest", n: 0, score: 0.9 },
      { ruleId: "plan-honored-when-safe", n: 3, score: 0.1 },
    ]);

    render(<WhatsWorkingCard />);

    const items = screen.getAllByTestId("whats-working-rule");
    expect(items).toHaveLength(1);
    expect(items[0]).toHaveTextContent("Following your plan when it's safe");
  });
});
