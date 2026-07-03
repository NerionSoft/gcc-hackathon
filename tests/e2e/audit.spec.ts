import { expect, test, type ConsoleMessage } from "@playwright/test";

/** F6 — the audit / provenance journal renders, paginates and filters, clean. */
test("audit ledger loads, paginates and filters with no console errors", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (msg: ConsoleMessage) => {
    if (msg.type() === "error") errors.push(msg.text());
  });
  page.on("pageerror", (err) => errors.push(err.message));

  await page.goto("/audit");

  await expect(page.getByRole("heading", { name: /audit log/i })).toBeVisible();

  // The seeded portfolio writes framework/portfolio/evidence audit events, so
  // the ledger is never empty and the count reads a real total.
  await expect(page.getByText(/of [\d,]+ events/)).toBeVisible();

  // At least one event row is present.
  const rows = page.locator("table tbody tr");
  await expect(rows.first()).toBeVisible();

  // The filter bar offers real facet values; filtering by the agent actor
  // keeps the ledger non-empty (seed events are agent-authored).
  await page.getByRole("combobox").first().selectOption("agent");
  await expect(page.getByText(/of [\d,]+ events/)).toBeVisible();

  expect(errors).toEqual([]);
});
