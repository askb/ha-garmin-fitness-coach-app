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
const mockUseMutation = jest.fn();
const mockInvalidateQueries = jest.fn();
const mockToastSuccess = jest.fn();
const mockToastError = jest.fn();
const mockAcceptMutate = jest.fn();
const mockSkipMutate = jest.fn();
const mockDeferMutate = jest.fn();
type MockMutationOptions = {
  mutationKey?: string[];
  onError?: (error: { message: string }) => void;
  onSuccess?: () => void;
};

const mockMutationOptions: Record<string, MockMutationOptions> = {};
const mockMutationStates = {
  accept: { isPending: false, mutate: mockAcceptMutate },
  skip: { isPending: false, mutate: mockSkipMutate },
  defer: { isPending: false, mutate: mockDeferMutate },
};

jest.mock("~/trpc/react", () => ({
  useTRPC: () => ({
    coach: {
      getDailyRecommendation: {
        queryKey: (input: unknown) => [
          "coach",
          "getDailyRecommendation",
          input,
        ],
        queryOptions: (input: unknown) => ({ queryKey: ["coach", input] }),
      },
      accept: {
        mutationOptions: (options: unknown) => ({
          ...(options as object),
          mutationKey: ["coach", "accept"],
        }),
      },
      skip: {
        mutationOptions: (options: unknown) => ({
          ...(options as object),
          mutationKey: ["coach", "skip"],
        }),
      },
      defer: {
        mutationOptions: (options: unknown) => ({
          ...(options as object),
          mutationKey: ["coach", "defer"],
        }),
      },
    },
  }),
}));

jest.mock("@tanstack/react-query", () => ({
  useMutation: (...args: unknown[]) => mockUseMutation(...args),
  useQuery: (...args: unknown[]) => mockUseQuery(...args),
  useQueryClient: () => ({ invalidateQueries: mockInvalidateQueries }),
}));

jest.mock("@acme/ui/toast", () => ({
  toast: {
    error: (message: string) => mockToastError(message),
    success: (message: string) => mockToastSuccess(message),
  },
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

function mockRecommendation(
  confidence = 0.85,
  recommendationDate = "2026-05-27",
) {
  mockUseQuery.mockReturnValue({
    data: {
      auditId: "00000000-0000-4000-8000-000000000123",
      date: recommendationDate,
      recommendation: makeRecommendation(confidence),
    },
    isLoading: false,
    refetch: jest.fn(),
  });
}

function setupMutations() {
  mockUseMutation.mockImplementation((options: MockMutationOptions) => {
    const action = options.mutationKey?.[1] ?? "";
    mockMutationOptions[action] = options;
    return mockMutationStates[action as "accept" | "skip" | "defer"];
  });
}

describe("TodayRecommendationCard", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockMutationOptions.accept = {};
    mockMutationOptions.skip = {};
    mockMutationOptions.defer = {};
    mockMutationStates.accept.isPending = false;
    mockMutationStates.skip.isPending = false;
    mockMutationStates.defer.isPending = false;
    mockAcceptMutate.mockReset();
    mockSkipMutate.mockReset();
    mockDeferMutate.mockReset();
    setupMutations();
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

  it("calls accept mutation with the recommendation audit args", () => {
    mockRecommendation();

    render(
      <TodayRecommendationCard userId="seed-user-001" date="2026-05-27" />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Accept" }));

    expect(mockAcceptMutate).toHaveBeenCalledWith({
      auditId: "00000000-0000-4000-8000-000000000123",
      date: "2026-05-27",
      userId: "seed-user-001",
    });
  });

  it("calls skip mutation with the recommendation audit args", () => {
    mockRecommendation();

    render(
      <TodayRecommendationCard userId="seed-user-001" date="2026-05-27" />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Skip" }));

    expect(mockSkipMutate).toHaveBeenCalledWith({
      auditId: "00000000-0000-4000-8000-000000000123",
      date: "2026-05-27",
      userId: "seed-user-001",
    });
  });

  it("uses the recommendation response date when no date prop is provided", () => {
    mockRecommendation(0.85, "2026-05-26");

    render(<TodayRecommendationCard userId="seed-user-001" />);

    fireEvent.click(screen.getByRole("button", { name: "Accept" }));

    expect(mockAcceptMutate).toHaveBeenCalledWith({
      auditId: "00000000-0000-4000-8000-000000000123",
      date: "2026-05-26",
      userId: "seed-user-001",
    });
  });

  it("opens defer picker and submits tomorrow's date", () => {
    mockRecommendation();

    render(
      <TodayRecommendationCard userId="seed-user-001" date="2026-05-27" />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Defer" }));
    const dateInput = screen.getByLabelText("Defer to") as HTMLInputElement;

    expect(dateInput.value).toBe("2026-05-28");
    expect(dateInput.min).toBe("2026-05-28");

    fireEvent.click(screen.getByRole("button", { name: "Save defer date" }));

    expect(mockDeferMutate).toHaveBeenCalledWith({
      auditId: "00000000-0000-4000-8000-000000000123",
      date: "2026-05-27",
      deferToDate: "2026-05-28",
      userId: "seed-user-001",
    });
  });

  it("prevents same-day or past defer dates at the UI level", () => {
    mockRecommendation();

    render(
      <TodayRecommendationCard userId="seed-user-001" date="2026-05-27" />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Defer" }));
    fireEvent.change(screen.getByLabelText("Defer to"), {
      target: { value: "2026-05-27" },
    });

    expect(
      screen.getByText("Choose a defer date after the recommendation date."),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Save defer date" }),
    ).toBeDisabled();
    expect(mockDeferMutate).not.toHaveBeenCalled();
  });

  it("disables all action buttons while any mutation is pending", () => {
    mockRecommendation();
    mockMutationStates.skip.isPending = true;

    render(
      <TodayRecommendationCard userId="seed-user-001" date="2026-05-27" />,
    );

    expect(screen.getByRole("button", { name: /Accept/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: /Skip/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: /Defer/ })).toBeDisabled();
    expect(screen.getByLabelText("Skip pending")).toBeInTheDocument();
  });

  it("shows a success toast and invalidates the recommendation query on success", () => {
    mockRecommendation();
    mockAcceptMutate.mockImplementation(() => {
      mockMutationOptions.accept?.onSuccess?.();
    });

    render(
      <TodayRecommendationCard userId="seed-user-001" date="2026-05-27" />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Accept" }));

    expect(mockToastSuccess).toHaveBeenCalledWith("Recommendation accepted");
    expect(mockInvalidateQueries).toHaveBeenCalledWith({
      queryKey: [
        "coach",
        "getDailyRecommendation",
        { date: "2026-05-27", userId: "seed-user-001" },
      ],
    });
  });
});
