import { expect, test } from "@playwright/test";

test.describe("Navigation", () => {
  test("can navigate from home to trends via bottom nav", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("navigation").getByText("Trends").click();
    await expect(page).toHaveURL("/trends");
    await expect(page.getByRole("heading", { name: "Trends" })).toBeVisible();
  });

  test("can navigate from home to settings via bottom nav", async ({
    page,
  }) => {
    await page.goto("/");
    await page.getByRole("navigation").getByText("Settings").click();
    await expect(page).toHaveURL("/settings");
    await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();
  });

  test("can navigate back to home from trends", async ({ page }) => {
    await page.goto("/trends");
    await page.getByRole("navigation").getByText("Today").click();
    await expect(page).toHaveURL("/");
    await expect(
      page.getByRole("heading", { name: "Good morning" }),
    ).toBeVisible();
  });
});
