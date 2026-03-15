import { test, expect } from "@playwright/test";

test.describe("Settings page", () => {
  test("renders settings heading", async ({ page }) => {
    await page.goto("/settings");
    await expect(
      page.getByRole("heading", { name: "Settings" }),
    ).toBeVisible();
  });

  test("shows profile section", async ({ page }) => {
    await page.goto("/settings");
    await expect(page.getByRole("heading", { name: "Profile" })).toBeVisible();
  });

  test("shows Garmin connection section", async ({ page }) => {
    await page.goto("/settings");
    await expect(page.getByText("Garmin Connection")).toBeVisible();
    await expect(page.getByText("Garmin Connect", { exact: true })).toBeVisible();
  });

  test("shows data & privacy section", async ({ page }) => {
    await page.goto("/settings");
    await expect(page.getByText("Data & Privacy")).toBeVisible();
    await expect(page.getByText("Export Data")).toBeVisible();
    await expect(page.getByText("Delete Account")).toBeVisible();
  });

  test("has edit profile link to onboarding", async ({ page }) => {
    await page.goto("/settings");
    const editLink = page.getByRole("link", { name: "Edit Profile" });
    await expect(editLink).toBeVisible();
    await expect(editLink).toHaveAttribute("href", "/onboarding");
  });
});
