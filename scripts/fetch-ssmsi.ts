/**
 * SSMSI's communal delinquency stats are only published as a ~40MB national
 * CSV.gz (updated twice a year), not a live query API — streaming and
 * filtering it takes ~20s, far too slow for a per-request tool call. So we
 * do that streaming pass once here and commit a small per-commune index
 * (latest year + trend vs. the previous year, matching exactly what
 * crimeDataSchema needs — no raw history kept) that the crimeTool reads
 * synchronously at runtime.
 *
 * Run with: pnpm fetch-data
 */
import { createGunzip } from "node:zlib";
import { gzipSync } from "node:zlib";
import { Readable } from "node:stream";
import readline from "node:readline";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const CSV_GZ_URL =
  "https://static.data.gouv.fr/resources/bases-statistiques-communale-departementale-et-regionale-de-la-delinquance-enregistree-par-la-police-et-la-gendarmerie-nationales/20260326-124144/donnee-data.gouv-2025-geographie2025-produit-le2026-02-03.csv.gz";
const OUTPUT_PATH = path.join("data", "ssmsi", "index.json.gz");

interface IndicatorYear {
  nombre: number | null;
  tauxPour1000: number | null;
  diffuse: boolean;
}
type CommuneYearMap = Map<string, Map<number, Map<string, IndicatorYear>>>; // codgeo -> year -> indicateur -> value

function parseCsvLine(line: string): string[] {
  return line.split(";").map((c) => c.replace(/^"|"$/g, ""));
}

async function main() {
  console.log("Downloading + streaming SSMSI communal CSV (~40MB compressed, ~20s)…");
  const res = await fetch(CSV_GZ_URL);
  if (!res.ok || !res.body) throw new Error(`SSMSI download failed: HTTP ${res.status}`);

  const rl = readline.createInterface({
    input: Readable.fromWeb(res.body as import("node:stream/web").ReadableStream<Uint8Array>).pipe(
      createGunzip(),
    ),
    crlfDelay: Infinity,
  });

  const byCommune: CommuneYearMap = new Map();
  let header: string[] | null = null;
  let rowCount = 0;
  const yearsSeen = new Set<number>();

  for await (const line of rl) {
    if (!header) {
      header = parseCsvLine(line);
      continue;
    }
    rowCount++;
    const cols = parseCsvLine(line);
    const codgeo = cols[0];
    const annee = Number(cols[1]);
    const indicateur = cols[2];
    const nombre = cols[4] === "NA" || cols[4] === "" ? null : Number(cols[4]);
    const tauxPour1000 =
      cols[5] === "NA" || cols[5] === "" ? null : Number(cols[5].replace(",", "."));
    const diffuse = cols[6] === "diff";
    yearsSeen.add(annee);

    if (!byCommune.has(codgeo)) byCommune.set(codgeo, new Map());
    const byYear = byCommune.get(codgeo)!;
    if (!byYear.has(annee)) byYear.set(annee, new Map());
    byYear.get(annee)!.set(indicateur, { nombre, tauxPour1000, diffuse });
  }

  const latestYear = Math.max(...yearsSeen);
  const previousYear = latestYear - 1;
  console.log(
    `Parsed ${rowCount} rows across ${byCommune.size} communes, years ${[...yearsSeen].sort().join(",")}.`,
  );
  console.log(`Keeping ${latestYear} (+ ${previousYear} for trend only).`);

  const index: Record<
    string,
    {
      annee: number;
      indicateurs: {
        indicateur: string;
        nombre: number | null;
        tauxPour1000: number | null;
        diffuse: boolean;
        trend: "hausse" | "baisse" | "stable" | null;
      }[];
    }
  > = {};

  for (const [codgeo, byYear] of byCommune) {
    const current = byYear.get(latestYear);
    if (!current) continue;
    const previous = byYear.get(previousYear);

    const indicateurs = [...current.entries()].map(([indicateur, value]) => {
      const prevValue = previous?.get(indicateur);
      let trend: "hausse" | "baisse" | "stable" | null = null;
      if (
        value.diffuse &&
        prevValue?.diffuse &&
        value.tauxPour1000 !== null &&
        prevValue.tauxPour1000 !== null
      ) {
        const delta = value.tauxPour1000 - prevValue.tauxPour1000;
        const relative = prevValue.tauxPour1000 > 0 ? delta / prevValue.tauxPour1000 : 0;
        trend = relative > 0.05 ? "hausse" : relative < -0.05 ? "baisse" : "stable";
      }
      return {
        indicateur,
        nombre: value.nombre,
        tauxPour1000: value.tauxPour1000,
        diffuse: value.diffuse,
        trend,
      };
    });

    index[codgeo] = { annee: latestYear, indicateurs };
  }

  await mkdir(path.dirname(OUTPUT_PATH), { recursive: true });
  const json = JSON.stringify(index);
  await writeFile(OUTPUT_PATH, gzipSync(json));
  console.log(
    `Wrote ${OUTPUT_PATH} (${(gzipSync(json).length / 1e6).toFixed(1)}MB gzipped, ${Object.keys(index).length} communes).`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
