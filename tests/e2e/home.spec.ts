import { expect, test } from "@playwright/test";

test("homepage renders the portfolio wall", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("link", { name: /Civic Property Intelligence/i })).toBeVisible();
  // F5 impact banner is mounted in the header.
  await expect(page.locator("text=Assessed").first()).toBeVisible();
  // F1 wall action.
  await expect(page.getByRole("button", { name: /Run portfolio scan/i })).toBeVisible();
});
