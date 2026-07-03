import { expect, test } from "@playwright/test";

test("homepage renders the app shell", async ({ page }) => {
  await page.goto("/");
  // The persistent header brand is present on every page (shared layout).
  await expect(page.getByRole("link", { name: /Civic Property Intelligence/i })).toBeVisible();
  // Primary navigation is wired up.
  await expect(page.getByRole("navigation", { name: "Primary" })).toBeVisible();
});
