import { expect, test } from "@playwright/test";

test.describe("Onboarding page", () => {
  test("renders step 1 — About You", async ({ page }) => {
    await page.goto("/onboarding");
    await expect(page.getByText("About You")).toBeVisible();
    await expect(page.getByText("Continue")).toBeVisible();
  });

  test("can navigate through all 3 steps", async ({ page }) => {
    await page.goto("/onboarding");

    // Step 1: Profile
    await expect(page.getByText("About You")).toBeVisible();
    await page.getByText("Continue").click();

    // Step 2: Sports
    await expect(page.getByText("Your Sports")).toBeVisible();
    await page.getByText("Continue").click();

    // Step 3: Schedule
    await expect(page.getByText("Weekly Schedule")).toBeVisible();
    await expect(page.getByText("Let's Go")).toBeVisible();
  });

  test("can go back from step 2", async ({ page }) => {
    await page.goto("/onboarding");
    await page.getByText("Continue").click();
    await expect(page.getByText("Your Sports")).toBeVisible();
    await page.getByText("Back").click();
    await expect(page.getByText("About You")).toBeVisible();
  });

  test("can select sports in step 2", async ({ page }) => {
    await page.goto("/onboarding");
    await page.getByText("Continue").click();

    // Select running
    const runningBtn = page.getByRole("button", { name: "running" });
    await runningBtn.click();
    // Should show goal section
    await expect(page.getByText("Goal for each sport")).toBeVisible();
  });
});
