import { expect, test } from "@playwright/test";

test.describe("Home / Today page", () => {
  test("renders the greeting and date", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByText("Good morning")).toBeVisible();
    // Date should be visible
    const today = new Date().toLocaleDateString("en-US", {
      weekday: "long",
      month: "long",
      day: "numeric",
    });
    await expect(page.getByText(today)).toBeVisible();
  });

  test("shows readiness card with score or empty state", async ({ page }) => {
    await page.goto("/");
    // Either a score or the empty state message
    const readinessSection = page.locator("text=Readiness").first();
    const emptyState = page.getByText("No readiness data yet");
    await expect(readinessSection.or(emptyState)).toBeVisible();
  });

  test("shows workout card or empty state", async ({ page }) => {
    await page.goto("/");
    const workoutSection = page.getByText("Today's Workout").first();
    const emptyState = page.getByText("No workout planned");
    await expect(workoutSection.or(emptyState)).toBeVisible();
  });

  test("bottom nav is visible with 3 items", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("navigation")).toBeVisible();
    await expect(page.getByText("Today")).toBeVisible();
    await expect(page.getByText("Trends")).toBeVisible();
    await expect(page.getByText("Settings")).toBeVisible();
  });
});
