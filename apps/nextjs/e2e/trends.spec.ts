import { test, expect } from "@playwright/test";

test.describe("Trends page", () => {
  test("renders with period toggle", async ({ page }) => {
    await page.goto("/trends");
    await expect(page.getByRole("heading", { name: "Trends" })).toBeVisible();
    await expect(page.getByText("7 Days")).toBeVisible();
    await expect(page.getByText("28 Days")).toBeVisible();
  });

  test("can toggle between 7d and 28d", async ({ page }) => {
    await page.goto("/trends");
    // Default is 7 Days
    const btn28 = page.getByText("28 Days");
    await btn28.click();
    // Should still show trends page (no navigation)
    await expect(page.getByRole("heading", { name: "Trends" })).toBeVisible();
  });

  test("shows summary stats section", async ({ page }) => {
    await page.goto("/trends");
    // Wait for data to load
    await page.waitForTimeout(2000);
    // Should show stat labels
    await expect(page.getByText("Avg Readiness")).toBeVisible();
    await expect(page.getByText("Avg Sleep")).toBeVisible();
    await expect(page.getByText("Avg HRV")).toBeVisible();
  });

  test("shows chart sections", async ({ page }) => {
    await page.goto("/trends");
    await page.waitForTimeout(2000);
    await expect(page.getByText("Readiness Score")).toBeVisible();
    await expect(page.getByText("Sleep (minutes)")).toBeVisible();
    await expect(page.getByRole("heading", { name: "HRV (ms)" })).toBeVisible();
  });
});
