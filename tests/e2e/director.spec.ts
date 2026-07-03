import { expect, test, type ConsoleMessage } from "@playwright/test";

/** F7 — the /director control room renders every control group, no errors. */
test("director console renders its control groups with no console errors", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (msg: ConsoleMessage) => {
    if (msg.type() === "error") errors.push(msg.text());
  });
  page.on("pageerror", (err) => errors.push(err.message));

  await page.goto("/director");

  await expect(page.getByRole("heading", { name: /director/i })).toBeVisible();

  // The four control groups drive the real engine routes.
  await expect(page.getByText("Portfolio scan")).toBeVisible();
  await expect(page.getByText("Evidence-feed simulator")).toBeVisible();
  await expect(page.getByText("Full data reset")).toBeVisible();
  await expect(page.getByText("Stage cuts")).toBeVisible();

  // Controls are present but we do not fire the destructive ones in the test.
  await expect(page.getByRole("button", { name: /start scan/i })).toBeVisible();

  // Arming the reset reveals a confirm step without performing it.
  await page.getByRole("button", { name: /reset & re-seed/i }).click();
  await expect(page.getByRole("button", { name: /confirm reset/i })).toBeVisible();
  await page.getByRole("button", { name: /cancel/i }).click();

  // The console is deliberately not in the primary nav.
  await expect(page.getByRole("navigation", { name: "Primary" })).not.toContainText("Director");

  expect(errors).toEqual([]);
});
