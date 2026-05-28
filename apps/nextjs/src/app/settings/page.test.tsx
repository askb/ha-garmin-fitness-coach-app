/**
 * @jest-environment jsdom
 */
// SPDX-FileCopyrightText: 2026 Anil Belur <askb23@gmail.com>
// SPDX-License-Identifier: Apache-2.0

import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";

import SettingsPage from "./page";

const mockUseQuery = jest.fn();
const mockUseMutation = jest.fn();
const mockInvalidateQueries = jest.fn();
const mockUpdateTimezoneMutate = jest.fn();

jest.mock("~/trpc/react", () => ({
  useTRPC: () => ({
    profile: {
      get: {
        queryKey: () => ["profile", "get"],
        queryOptions: () => ({ queryKey: ["profile", "get"] }),
      },
      upsert: {
        mutationOptions: (options: unknown) => ({
          ...(options as object),
          mutationKey: ["profile", "upsert"],
        }),
      },
      updateHealth: {
        mutationOptions: (options: unknown) => ({
          ...(options as object),
          mutationKey: ["profile", "updateHealth"],
        }),
      },
      updateTimezone: {
        mutationOptions: (options: unknown) => ({
          ...(options as object),
          mutationKey: ["profile", "updateTimezone"],
        }),
      },
    },
  }),
}));

jest.mock("~/env", () => ({
  env: {
    NEXT_PUBLIC_APP_VERSION: "0.17.6",
    NEXT_PUBLIC_BUILD_TIME: "2026-05-28T10:00:00.000Z",
  },
}));

jest.mock("@tanstack/react-query", () => ({
  useMutation: (...args: unknown[]) => mockUseMutation(...args),
  useQuery: (...args: unknown[]) => mockUseQuery(...args),
  useQueryClient: () => ({ invalidateQueries: mockInvalidateQueries }),
}));

jest.mock("../_components/bottom-nav", () => ({
  BottomNav: () => <nav data-testid="bottom-nav" />,
}));

describe("Settings timezone picker", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = jest.fn(async () =>
      Response.json({ connected: false, email: "", lastSync: "" }),
    ) as jest.Mock;
    mockUseQuery.mockReturnValue({
      data: {
        age: 32,
        sex: "male",
        massKg: 75,
        heightCm: 180,
        timezone: "UTC",
        healthConditions: [],
        currentInjuries: [],
        medications: "",
        allergies: "",
      },
      isLoading: false,
    });
    mockUseMutation.mockImplementation(
      (options: { mutationKey?: string[] }) => {
        if (options.mutationKey?.includes("updateTimezone")) {
          return { isPending: false, mutate: mockUpdateTimezoneMutate };
        }
        return { isPending: false, mutate: jest.fn() };
      },
    );
  });

  it("renders a searchable timezone picker and saves via profile mutation", () => {
    render(<SettingsPage />);

    expect(
      screen.getByRole("heading", { name: "Timezone" }),
    ).toBeInTheDocument();
    expect(screen.getByText(/Current:/)).toBeInTheDocument();

    const picker = screen.getByRole("combobox", { name: "IANA timezone" });
    fireEvent.change(picker, { target: { value: "Australia/Brisbane" } });
    fireEvent.click(screen.getByRole("button", { name: "Save timezone" }));

    expect(mockUpdateTimezoneMutate).toHaveBeenCalledWith({
      timezone: "Australia/Brisbane",
    });
  });

  it("auto-detects the browser timezone into the picker", () => {
    render(<SettingsPage />);

    const browserTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    fireEvent.change(screen.getByRole("combobox", { name: "IANA timezone" }), {
      target: { value: "America/New_York" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Auto-detect from browser" }),
    );

    expect(screen.getByRole("combobox", { name: "IANA timezone" })).toHaveValue(
      browserTimezone,
    );
  });
});
