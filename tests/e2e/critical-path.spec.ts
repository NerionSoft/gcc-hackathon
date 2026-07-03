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
    summary: `Résumé ${title}`,
    detail: `Détail complet pour ${title}.`,
    sources: [SOURCE],
    confidence: "high",
    weight: 1,
  };
}

const STREAM_EVENTS = [
  {
    type: "plan",
    toolsPlanned: ["risques", "prix", "air", "securite", "energie"],
    reasoning: "Analyse équilibrée des 5 domaines.",
  },
  { type: "tool-start", tool: "risques" },
  {
    type: "section-ready",
    section: domainSection("risques", "Risques naturels & technologiques", "alerte"),
  },
  { type: "section-ready", section: domainSection("prix", "Prix & marché", "favorable") },
  { type: "section-ready", section: domainSection("air", "Qualité de l'air", "favorable") },
  { type: "section-ready", section: domainSection("securite", "Sécurité", "favorable") },
  { type: "section-ready", section: domainSection("energie", "Énergie", "vigilance") },
  {
    type: "redflag",
    finding: {
      id: "test-finding",
      title: "Risque de fissures liées au retrait-gonflement des argiles",
      severity: "alerte",
      domains: ["risques", "energie"],
      explanation: "Aléa argile fort et arrêté sécheresse recensés.",
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
      scoreExplanation: "Moyenne pondérée des 5 domaines disponibles.",
      redFlags: [
        {
          id: "test-finding",
          title: "Risque de fissures liées au retrait-gonflement des argiles",
          severity: "alerte",
          domains: ["risques", "energie"],
          explanation: "Aléa argile fort et arrêté sécheresse recensés.",
          sources: [SOURCE],
          confidence: "high",
        },
      ],
      sections: [
        domainSection("risques", "Risques naturels & technologiques", "alerte"),
        domainSection("prix", "Prix & marché", "favorable"),
        domainSection("air", "Qualité de l'air", "favorable"),
        domainSection("securite", "Sécurité", "favorable"),
        domainSection("energie", "Énergie", "vigilance"),
      ],
      actions: [
        {
          title: "Commander l'état des risques et pollutions (ERP) officiel",
          category: "demarche_officielle",
          reason: "Obligatoire.",
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
  await expect(page.getByRole("heading", { name: "Analysez votre futur logement" })).toBeVisible();

  await page.getByLabel("Adresse du bien").fill("8 rue de la paix");
  await page.getByRole("option", { name: /8 Rue de la Paix/ }).click();

  await page.getByRole("button", { name: "Famille avec enfants" }).click();

  await page.getByRole("button", { name: "Analyser ce logement" }).click();

  await expect(page).toHaveURL(/\/rapport\?/);
  await expect(page.getByRole("heading", { name: "8 Rue de la Paix 75002 Paris" })).toBeVisible();

  // Streamed sections and the final score should all render.
  await expect(page.getByText("62")).toBeVisible();
  await expect(page.getByText("Points de vigilance prioritaires")).toBeVisible();
  await expect(
    page.getByText("Risque de fissures liées au retrait-gonflement des argiles"),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Risques naturels & technologiques" }),
  ).toBeVisible();
  await expect(page.getByText("À faire avant de signer")).toBeVisible();
  await expect(page.getByRole("link", { name: "Exporter en PDF" })).toBeVisible();
});

test("methodologie page lists every source", async ({ page }) => {
  await page.goto("/methodologie");
  await expect(page.getByRole("heading", { name: "Sources & méthodologie" })).toBeVisible();
  await expect(
    page.getByText("Géorisques (BRGM / ministère de la Transition écologique)"),
  ).toBeVisible();
  await expect(page.getByText("SSMSI (ministère de l'Intérieur)")).toBeVisible();
});
