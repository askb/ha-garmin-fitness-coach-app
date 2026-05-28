/**
 * @jest-environment jsdom
 */
// SPDX-FileCopyrightText: 2026 Anil Belur <askb23@gmail.com>
// SPDX-License-Identifier: Apache-2.0

import React from "react";
import { render, screen } from "@testing-library/react";

import { VersionBadge } from "./version-badge";

describe("VersionBadge", () => {
  it("renders the provided version string", () => {
    render(<VersionBadge version="0.17.6" buildTime="2026-05-28T10:00:00.000Z" />);

    expect(screen.getByText("v0.17.6")).toBeInTheDocument();
  });

  it("renders full text, tooltip, and custom classes when requested", () => {
    render(
      <VersionBadge
        version="0.17.6"
        buildTime="2026-05-28T10:00:00.000Z"
        fullText
        className="custom-class"
      />,
    );

    const badge = screen.getByText(
      "PulseCoach App v0.17.6 · Built 2026-05-28T10:00:00.000Z",
    );

    expect(badge).toHaveAttribute("title", "Built 2026-05-28T10:00:00.000Z");
    expect(badge).toHaveClass("custom-class");
  });
});
