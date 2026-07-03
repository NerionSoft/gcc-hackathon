import { expect, test } from "@playwright/test";

test("homepage renders the app shell and portfolio wall", async ({ page }) => {
  await page.goto("/");
  // The persistent header brand is present on every page (shared layout).
  await expect(page.getByRole("link", { name: /Civic Property Intelligence/i })).toBeVisible();
  // Primary navigation is wired up.
  await expect(page.getByRole("navigation", { name: "Primary" })).toBeVisible();
  // F5 impact banner is mounted in the header.
  await expect(page.locator("text=Assessed").first()).toBeVisible();
  // F1 wall action.
  await expect(page.getByRole("button", { name: /Run portfolio scan/i })).toBeVisible();
});
