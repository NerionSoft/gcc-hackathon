import { test, expect } from "@playwright/test";

const GEOCODE_RESULT = {
  status: "ok",
  confidence: "high",
  warnings: [],
  source: { name: "BAN", url: "https://example.test", retrievedAt: "2026-07-03T00:00:00.000Z" },
  data: [
    {
      label: "8 Rue de la Paix 75002 Paris",
      lat: 48.868831,
      lon: 2.330992,
      citycode: "75102",
      postcode: "75002",
      city: "Paris",
      street: "Rue de la Paix",
      housenumber: "8",
      score: 0.96,
      type: "housenumber",
    },
  ],
};

const SOURCE = {
  name: "Test source",
  url: "https://example.test",
  retrievedAt: "2026-07-03T00:00:00.000Z",
};

function domainSection(domain: string, title: string, verdict: string) {
  return {
    domain,
    title,
    verdict,
    summary: `Summary ${title}`,
    detail: `Full detail for ${title}.`,
    sources: [SOURCE],
    confidence: "high",
    weight: 1,
  };
}

const STREAM_EVENTS = [
  {
    type: "plan",
    toolsPlanned: ["risques", "prix", "air", "securite", "energie"],
    reasoning: "Balanced analysis across all 5 domains.",
  },
  { type: "tool-start", tool: "risques" },
  {
    type: "section-ready",
    section: domainSection("risques", "Natural & technological hazards", "alerte"),
  },
  { type: "section-ready", section: domainSection("prix", "Price & market", "favorable") },
  { type: "section-ready", section: domainSection("air", "Air quality", "favorable") },
  { type: "section-ready", section: domainSection("securite", "Safety", "favorable") },
  { type: "section-ready", section: domainSection("energie", "Energy", "vigilance") },
  {
    type: "redflag",
    finding: {
      id: "test-finding",
      title: "Cracking risk from clay shrink-swell",
      severity: "alerte",
      domains: ["risques", "energie"],
      explanation: "High clay hazard and drought declaration recorded.",
      sources: [SOURCE],
      confidence: "high",
    },
  },
  {
    type: "report-complete",
    report: {
      address: {
        label: "8 Rue de la Paix 75002 Paris",
        lat: 48.868831,
        lon: 2.330992,
        citycode: "75102",
      },
      generatedAt: "2026-07-03T00:00:00.000Z",
      globalScore: 62,
      scoreExplanation: "Weighted average of the 5 available domains.",
      redFlags: [
        {
          id: "test-finding",
          title: "Cracking risk from clay shrink-swell",
          severity: "alerte",
          domains: ["risques", "energie"],
          explanation: "High clay hazard and drought declaration recorded.",
          sources: [SOURCE],
          confidence: "high",
        },
      ],
      sections: [
        domainSection("risques", "Natural & technological hazards", "alerte"),
        domainSection("prix", "Price & market", "favorable"),
        domainSection("air", "Air quality", "favorable"),
        domainSection("securite", "Safety", "favorable"),
        domainSection("energie", "Energy", "vigilance"),
      ],
      actions: [
        {
          title: "Order the official risk and pollution disclosure (ERP)",
          category: "demarche_officielle",
          reason: "Mandatory.",
        },
      ],
      mapLayers: { sitesPollues: [], cavites: { present: false }, transactions: [] },
      warnings: [],
    },
  },
];

test("home -> address search -> profile -> streamed report", async ({ page }) => {
  await page.route("**/api/geocode*", (route) => route.fulfill({ json: GEOCODE_RESULT }));
  await page.route("**/api/report/stream*", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/x-ndjson",
      body: STREAM_EVENTS.map((e) => JSON.stringify(e)).join("\n") + "\n",
    }),
  );

  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Analyze your future home" })).toBeVisible();

  await page.getByLabel("Property address").fill("8 rue de la paix");
  await page.getByRole("option", { name: /8 Rue de la Paix/ }).click();

  await page.getByRole("button", { name: "Family with children" }).click();

  await page.getByRole("button", { name: "Analyze this property" }).click();

  await expect(page).toHaveURL(/\/report\?/);
  await expect(page.getByRole("heading", { name: "8 Rue de la Paix 75002 Paris" })).toBeVisible();

  // Streamed sections and the final score should all render.
  await expect(page.getByText("62")).toBeVisible();
  await expect(page.getByText("Priority red flags")).toBeVisible();
  await expect(page.getByText("Cracking risk from clay shrink-swell")).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Natural & technological hazards" }),
  ).toBeVisible();
  await expect(page.getByText("Before you sign")).toBeVisible();
  await expect(page.getByRole("link", { name: "Export as PDF" })).toBeVisible();
});

test("methodology page lists every source", async ({ page }) => {
  await page.goto("/methodology");
  await expect(page.getByRole("heading", { name: "Sources & methodology" })).toBeVisible();
  await expect(
    page.getByText("Géorisques (BRGM / French Ministry for Ecological Transition)"),
  ).toBeVisible();
  await expect(page.getByText("SSMSI (Ministry of the Interior)")).toBeVisible();
});
