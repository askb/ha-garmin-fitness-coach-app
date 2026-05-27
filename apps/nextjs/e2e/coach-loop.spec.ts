// SPDX-FileCopyrightText: 2026 Anil Belur <askb23@gmail.com>
// SPDX-License-Identifier: Apache-2.0

import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";

const repoRoot = fileURLToPath(new URL("../../..", import.meta.url));
function isoDay(offsetDays = 0): string {
  const date = new Date();
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCDate(date.getUTCDate() + offsetDays);
  return date.toISOString().slice(0, 10);
}

const today = isoDay();
const tomorrow = isoDay(1);

function seedCoachLoop(): void {
  execFileSync("pnpm", ["--filter", "@acme/db", "db:seed:e2e"], {
    cwd: repoRoot,
    stdio: "inherit",
  });
}

test.describe.serial("AI-native coach loop", () => {
  test.beforeEach(() => seedCoachLoop());

  test("daily recommendation visible with expandable rule trace", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(page.getByTestId("today-recommendation-card")).toBeVisible();
    await expect(
      page.getByTestId("today-recommendation-headline"),
    ).toContainText(/z2 run/i);
    await expect(page.getByTestId("today-recommendation-duration")).toHaveText(
      "30 min",
    );
    const ruleTrace = page.getByTestId("rule-trace-accordion");
    await expect(ruleTrace).not.toHaveAttribute("open", "");
    await ruleTrace.locator("summary").click();
    await expect(ruleTrace).toHaveAttribute("open", "");
    await expect(page.getByTestId("rule-trace-row").first()).toBeVisible();
    await ruleTrace.locator("summary").click();
    await expect(ruleTrace).not.toHaveAttribute("open", "");
  });

  test("accept records feedback and reflects accepted state", async ({
    page,
  }) => {
    await page.goto("/");
    await page.getByTestId("recommendation-accept").click();
    await expect(page.getByText("Recommendation accepted")).toBeVisible();
    await expect(
      page.getByTestId("today-recommendation-action-state"),
    ).toHaveText("Accepted");
  });

  test("skip records feedback and shows a success toast", async ({ page }) => {
    await page.goto("/");
    await page.getByTestId("recommendation-skip").click();
    await expect(page.getByText("Recommendation skipped")).toBeVisible();
  });

  test("defer validates same-day dates and saves tomorrow", async ({
    page,
  }) => {
    await page.goto("/");
    await page.getByTestId("recommendation-defer").click();
    const dateInput = page.getByTestId("recommendation-defer-date");
    const saveButton = page.getByTestId("recommendation-save-defer");
    await expect(dateInput).toHaveValue(tomorrow);
    await dateInput.fill(today);
    await expect(
      page.getByText("Choose a defer date after the recommendation date."),
    ).toBeVisible();
    await expect(saveButton).toBeDisabled();
    await dateInput.fill(tomorrow);
    await expect(saveButton).toBeEnabled();
    await saveButton.click();
    await expect(page.getByText("Recommendation deferred")).toBeVisible();
  });

  test("adherence trend card renders seeded seven-day history", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(page.getByTestId("adherence-trend-card")).toBeVisible();
    await expect(page.getByTestId("adherence-rate")).toContainText(/\d+%/);
    await expect(page.getByTestId("adherence-cell")).toHaveCount(14);
  });

  test("rule trace accordion exposes rule explanations", async ({ page }) => {
    await page.goto("/");
    await page.getByTestId("rule-trace-accordion").locator("summary").click();
    await expect(page.getByTestId("rule-trace-row").first()).toContainText(
      /Plan day|Readiness|signals/i,
    );
  });
});
