import { expect, test } from "@playwright/test";

/**
 * The phase-5 acceptance journey, end to end against the real engine:
 * scan → condense → open cluster → request changes → approve → publish →
 * evidence feed injects → war room reclassifies → expert decides an escalated
 * case. Asserts zero console errors, zero uncaught exceptions and no 5xx
 * response throughout (the "instrument the whole thing and watch it" bar).
 *
 * Runs with the LLM disabled (see playwright.config webServer env), so the
 * synthetic cohort scans deterministically; the 50 real properties are left
 * unscanned honestly and do not gate the flow.
 */
test("civic-risk-scan journey: review gate, war room, impact banner", async ({ page }) => {
  test.setTimeout(150_000);

  const problems: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error") problems.push(`console.error: ${m.text()}`);
  });
  page.on("pageerror", (e) => problems.push(`pageerror: ${e.message}`));
  page.on("response", (r) => {
    if (r.status() >= 500) problems.push(`http ${r.status()}: ${r.url()}`);
  });
  page.on("requestfailed", (r) => {
    const t = r.failure()?.errorText ?? "";
    // ERR_ABORTED is Next.js prefetch cancellation, not a failure.
    if (!t.includes("ERR_ABORTED") && !r.url().includes("favicon")) {
      problems.push(`requestfailed: ${r.url()} ${t}`);
    }
  });

  // page.request inherits the config's baseURL, so relative paths resolve.
  const api = (path: string, data?: unknown) =>
    page.request
      .fetch(path, {
        method: data ? "POST" : "GET",
        headers: { "content-type": "application/json" },
        data: data as object | undefined,
      })
      .then((r) => r.json());

  // Deterministic feed state.
  await api("/api/simulator", { command: "reset" }).catch(() => undefined);

  // 1. Portfolio wall + F5 impact banner.
  await page.goto("/", { waitUntil: "networkidle" });
  await expect(page.locator("text=Assessed").first()).toBeVisible();
  const runScan = page.getByRole("button", { name: /Run portfolio scan/i });
  await expect(runScan).toBeVisible({ timeout: 15_000 });

  // 2. Real engine scan → campaign suspends at the review gate.
  await runScan.click();
  const clusterBtn = page.getByRole("button", { name: /Cluster by risk pattern/i });
  await expect(clusterBtn).toBeVisible({ timeout: 30_000 });

  // 3. Condensation into the engine's persisted clusters.
  await clusterBtn.click();
  await expect(page.locator("text=Risk clusters").first()).toBeVisible({ timeout: 15_000 });
  await page.waitForTimeout(4500);
  const clusterCards = page.locator('main button:has-text("properties")');
  await expect(clusterCards.first()).toBeVisible();
  expect(await clusterCards.count()).toBeGreaterThan(0);

  // 4. Cluster sheet + review gate (F3): evidence view, clickable sources.
  await clusterCards.first().click();
  await page.waitForURL(/\/clusters\/.+/, { timeout: 10_000 });
  await expect(page.locator("text=The agent is waiting for your review")).toBeVisible({
    timeout: 10_000,
  });
  await expect(page.locator("text=Evidence view")).toBeVisible();
  expect(await page.locator('a[href^="http"]').count()).toBeGreaterThan(0);

  // 5. Request changes (recompose), then approve → publish (hard-gated).
  await page.locator("textarea").first().fill("Please spell out the flood-zone source.");
  await page.getByRole("button", { name: /Request changes/i }).click();
  await expect(page.locator("text=/Changes requested/i")).toBeVisible({ timeout: 20_000 });
  await expect(page.locator("text=The agent is waiting for your review")).toBeVisible();

  await page.getByTestId("approve-cluster").click();
  await expect(page.locator("text=Published after review")).toBeVisible({ timeout: 20_000 });
  await expect(page.locator("text=/by Nadia/")).toBeVisible();

  // 6. Approve the remaining clusters (API) to reach the monitoring gate.
  const { clusters } = await api("/api/clusters");
  for (const c of clusters as Array<{ id: string; status: string }>) {
    if (c.status === "pending_review") {
      await api(`/api/clusters/${c.id}/review`, {
        decision: "approve",
        comments: "Batch approved for the journey test.",
      });
    }
  }

  // 7. War room (F4).
  await page.goto("/adjudication", { waitUntil: "networkidle" });
  await expect(page.locator("text=Adjudication war room")).toBeVisible({ timeout: 10_000 });
  await expect(page.locator("text=Escalated to analyst")).toBeVisible();

  // 8. Start the evidence feed → cards reclassify.
  await page.getByTestId("start-feed").click();
  await page.locator('button:has-text("4×")').click();
  await expect
    .poll(async () => (await api("/api/simulator")).cursor, { timeout: 25_000 })
    .toBeGreaterThanOrEqual(3);

  // 9. Expert action on an escalated (red) case.
  const escCard = page.locator("li:has-text('Confirm risk')").first();
  await expect(escCard).toBeVisible({ timeout: 10_000 });
  await escCard.getByRole("button", { name: /Confirm risk/i }).click();
  await page.waitForTimeout(1500);

  // 10. Hard rule: red cases never expose an auto-resolve control.
  expect(await page.locator("text=/auto.?resolve/i").count()).toBe(0);

  expect(problems, `console/network problems:\n${problems.join("\n")}`).toEqual([]);
});
