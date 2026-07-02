import { expect, test } from "@playwright/test";

test("homepage displays greeting", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("text=Hello NerionSoft")).toBeVisible();
});
