import { defineConfig, devices } from "@playwright/test";

/**
 * The journey spec drives the real engine. e2e runs with the LLM disabled
 * (OPENAI_API_KEY unset) so the synthetic cohort scans deterministically and
 * fast — the 50 real properties need a key and are exercised separately.
 * `PLAYWRIGHT_BASE_URL` lets you point the suite at an already-running server.
 */
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: process.env.CI ? "html" : "list",
  use: {
    baseURL,
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: "pnpm seed && pnpm start",
    url: baseURL,
    env: { OPENAI_API_KEY: "" },
    timeout: 180_000,
    reuseExistingServer: !process.env.CI,
  },
});
