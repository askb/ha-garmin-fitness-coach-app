/**
 * @jest-environment jsdom
 */
// SPDX-FileCopyrightText: 2026 Anil Belur <askb23@gmail.com>
// SPDX-License-Identifier: Apache-2.0
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";

import { StressBoardConsent } from "./stress-board-consent";

const ACK_KEY = "pulsecoach.stressBoard.thirdPartyConsent.v1";

beforeEach(() => {
  localStorage.clear();
});

describe("StressBoardConsent", () => {
  it("shows the notice when not yet acknowledged", async () => {
    render(<StressBoardConsent />);
    expect(
      await screen.findByRole("button", { name: /i understand/i }),
    ).toBeInTheDocument();
  });

  it("persists acknowledgement and hides on click", async () => {
    render(<StressBoardConsent />);
    const btn = await screen.findByRole("button", { name: /i understand/i });
    fireEvent.click(btn);
    await waitFor(() =>
      expect(
        screen.queryByRole("button", { name: /i understand/i }),
      ).not.toBeInTheDocument(),
    );
    expect(localStorage.getItem(ACK_KEY)).toBe("1");
  });

  it("does not show once already acknowledged", async () => {
    localStorage.setItem(ACK_KEY, "1");
    render(<StressBoardConsent />);
    // Flush the effect that reads localStorage; the notice must never appear.
    await act(async () => {
      await Promise.resolve();
    });
    expect(
      screen.queryByRole("button", { name: /i understand/i }),
    ).not.toBeInTheDocument();
  });
});
