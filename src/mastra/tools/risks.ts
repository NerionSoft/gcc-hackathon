import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { fetchJson } from "@/lib/http";
import { withCache } from "@/lib/cache";
import { haversineDistanceM } from "@/lib/geo";
import { resolveWholeCityCommuneCode } from "@/lib/commune";
import {
  risksDataSchema,
  toolResultSchema,
  okResult,
  errorResult,
  type RisksData,
  type SourceRef,
  type CatNatArrete,
  type AziZone,
} from "@/types";

/**
 * Géorisques (BRGM / ministère de la Transition écologique) — the richest
 * single source. Doc: georisques.gouv.fr/doc-api (Swagger spec discovered at
 * /api/v3/api-docs/georisques-api-v1, verified live against real addresses).
 *
 * Known quirk (documented, not a bug in this code): the dedicated /rga
 * endpoint returns an empty body for many valid points — we rely on the
 * qualitative level embedded in /resultats_rapport_risque instead, which is
 * always populated. This mirrors the spec's own caveat that the API doesn't
 * always surface everything the public website shows.
 */
const GEORISQUES_BASE = "https://www.georisques.gouv.fr/api/v1";
const DISK_TTL_MS = 24 * 3600 * 1000;
const COMMUNE_TTL_MS = 7 * 24 * 3600 * 1000;

interface RisqueDetail {
  present: boolean;
  libelleStatutCommune: string | null;
  libelleStatutAdresse: string | null;
}
interface ResultatsRapportRisque {
  risquesNaturels: {
    inondation: RisqueDetail;
    mouvementTerrain: RisqueDetail;
    retraitGonflementArgile: RisqueDetail;
  };
}
interface PagedResponse<T> {
  results: number;
  data: T[];
}
interface CatnatRow {
  date_debut_evt: string;
  date_fin_evt: string;
  date_publication_arrete: string;
  date_publication_jo: string | null;
  libelle_risque_jo: string;
}
interface ZonageSismiqueRow {
  code_insee: string;
  code_zone: string;
}
interface RadonRow {
  classe_potentiel: string;
}
interface CasiasRow {
  nom_etablissement: string | null;
  statut: string | null;
  geom: { coordinates: [number, number] };
}

function levelFromText(text: string | null): "faible" | "moyen" | "fort" | "inconnu" {
  if (!text) return "inconnu";
  const lower = text.toLowerCase();
  if (lower.includes("fort") || lower.includes("important")) return "fort";
  if (lower.includes("moyen")) return "moyen";
  if (lower.includes("faible")) return "faible";
  return "inconnu";
}

/**
 * The per-address field is frequently an uninformative "Risque non Connu"
 * even when the commune-level field carries a real level (seen live on
 * Géorisques for retrait-gonflement des argiles) — fall back to the
 * commune-level text whenever the address-level one isn't a recognised level.
 */
function parseNiveau(detail: RisqueDetail): "faible" | "moyen" | "fort" | "inconnu" {
  const fromAdresse = levelFromText(detail.libelleStatutAdresse);
  if (fromAdresse !== "inconnu") return fromAdresse;
  return levelFromText(detail.libelleStatutCommune);
}

function georisquesSource(url: string): SourceRef {
  return {
    name: "Géorisques (BRGM / ministère de la Transition écologique)",
    url,
    retrievedAt: new Date().toISOString(),
  };
}

function extractValue<T>(settled: PromiseSettledResult<T>): T | null {
  return settled.status === "fulfilled" ? settled.value : null;
}

/**
 * Géorisques' commune-indexed sub-datasets disagree on how they treat Paris,
 * Lyon and Marseille: CatNat and AZI only have a row for the whole-city
 * aggregate code (75056/69123/13055), while zonage sismique and radon only
 * have rows per arrondissement (75101, 75102, ...) — verified live, in both
 * directions, for several of these endpoints. Rather than assume one
 * convention, try the address's own code first and fall back to the
 * whole-city code only if that came back empty (a no-op for the ~35,000
 * other French communes, where the two codes are identical anyway).
 */
async function fetchCommuneIndexed<T>(
  endpointPath: string,
  citycode: string,
  extraQuery: string,
  cacheKeyPrefix: string,
  ttlMs: number,
): Promise<PagedResponse<T>> {
  const fetchFor = (code: string) =>
    withCache(`${cacheKeyPrefix}:${code}`, { ttlMs, disk: true }, () =>
      fetchJson<PagedResponse<T>>(
        `${GEORISQUES_BASE}/${endpointPath}?code_insee=${code}${extraQuery}`,
        { timeoutMs: 6000 },
      ),
    );

  const primary = await fetchFor(citycode);
  if (primary.results > 0) return primary;
  const wholeCity = resolveWholeCityCommuneCode(citycode);
  if (wholeCity === citycode) return primary;
  return fetchFor(wholeCity);
}

export const risksInputSchema = z.object({
  lat: z.number(),
  lon: z.number(),
  citycode: z.string(),
});
export const risksOutputSchema = toolResultSchema(risksDataSchema);

export const risksTool = createTool({
  id: "risks-georisques",
  description:
    "Interroge Géorisques (BRGM) : risques naturels, sismicité, radon, cavités, sites et sols pollués (buffer 200m), arrêtés CatNat.",
  inputSchema: risksInputSchema,
  outputSchema: risksOutputSchema,
  execute: async ({ lat, lon, citycode }): Promise<z.infer<typeof risksOutputSchema>> => {
    const latlon = `${lon},${lat}`;
    const urls = {
      summary: `${GEORISQUES_BASE}/resultats_rapport_risque?latlon=${latlon}`,
      cavites: `${GEORISQUES_BASE}/cavites?rayon=1000&latlon=${latlon}`,
      casias: `${GEORISQUES_BASE}/ssp/casias?rayon=200&latlon=${latlon}&page_size=20`,
      pdf: `${GEORISQUES_BASE}/rapport_pdf?latlon=${latlon}`,
    };
    const source = georisquesSource(urls.summary);
    const warnings: string[] = [];

    let summary: ResultatsRapportRisque;
    try {
      summary = await withCache(`risks:summary:${latlon}`, { ttlMs: DISK_TTL_MS, disk: true }, () =>
        fetchJson<ResultatsRapportRisque>(urls.summary, { timeoutMs: 6000 }),
      );
    } catch (err) {
      return errorResult(
        source,
        `Géorisques indisponible pour cette adresse : ${err instanceof Error ? err.message : "erreur"}.`,
      );
    }

    const [catnatRes, seismeRes, radonRes, cavitesRes, casiasRes] = await Promise.allSettled([
      fetchCommuneIndexed<CatnatRow>(
        "gaspar/catnat",
        citycode,
        "&page_size=50",
        "risks:catnat",
        DISK_TTL_MS,
      ),
      fetchCommuneIndexed<ZonageSismiqueRow>(
        "zonage_sismique",
        citycode,
        "",
        "risks:seisme",
        COMMUNE_TTL_MS,
      ),
      fetchCommuneIndexed<RadonRow>("radon", citycode, "", "risks:radon", COMMUNE_TTL_MS),
      withCache(`risks:cavites:${latlon}`, { ttlMs: DISK_TTL_MS, disk: true }, () =>
        fetchJson<PagedResponse<unknown>>(urls.cavites, { timeoutMs: 6000 }),
      ),
      withCache(`risks:casias:${latlon}`, { ttlMs: DISK_TTL_MS, disk: true }, () =>
        fetchJson<PagedResponse<CasiasRow>>(urls.casias, { timeoutMs: 6000 }),
      ),
    ]);

    const catnat = extractValue(catnatRes);
    if (!catnat) warnings.push("Historique des arrêtés CatNat indisponible.");
    const catnatList: CatNatArrete[] = (catnat?.data ?? []).map((row) => ({
      libelleRisqueJo: row.libelle_risque_jo,
      dateDebut: row.date_debut_evt,
      dateFin: row.date_fin_evt,
      dateArrete: row.date_publication_arrete,
      dateJo: row.date_publication_jo,
    }));

    const seisme = extractValue(seismeRes);
    if (!seisme) warnings.push("Zone de sismicité réglementaire indisponible.");
    const seismeRow = seisme?.data[0];
    const seismeZone = seismeRow ? (Number(seismeRow.code_zone) as 1 | 2 | 3 | 4 | 5) : null;

    const radon = extractValue(radonRes);
    if (!radon || radon.data.length === 0)
      warnings.push("Classe de potentiel radon non diffusée pour cette commune.");
    const radonClasse = radon?.data[0]
      ? (Number(radon.data[0].classe_potentiel) as 1 | 2 | 3)
      : null;

    const cavites = extractValue(cavitesRes);
    if (!cavites) warnings.push("Cavités souterraines : donnée indisponible.");

    const casias = extractValue(casiasRes);
    if (!casias) warnings.push("Sites et sols pollués (CASIAS) : donnée indisponible.");
    const sitesPollues = (casias?.data ?? [])
      .map((row) => ({
        nom: row.nom_etablissement ?? "Site sans nom renseigné",
        lat: row.geom.coordinates[1],
        lon: row.geom.coordinates[0],
        distanceM: Math.round(
          haversineDistanceM(lat, lon, row.geom.coordinates[1], row.geom.coordinates[0]),
        ),
        etatActivite: row.statut ?? undefined,
      }))
      .sort((a, b) => a.distanceM - b.distanceM)
      .slice(0, 5);

    if (
      summary.risquesNaturels.retraitGonflementArgile.libelleStatutAdresse === "Risque non Connu"
    ) {
      warnings.push(
        "Niveau argile précis à l'adresse indisponible ; niveau communal utilisé en repli.",
      );
    }

    const data: RisksData = {
      summary: {
        inondation: {
          expose: summary.risquesNaturels.inondation.present,
        },
        argiles: {
          niveau: parseNiveau(summary.risquesNaturels.retraitGonflementArgile),
        },
        sismicite: { zone: seismeZone },
        radon: { classe: radonClasse },
        cavites: {
          present: (cavites?.results ?? 0) > 0,
          nombre: cavites?.results,
        },
        mouvementsTerrain: {
          present: summary.risquesNaturels.mouvementTerrain.present,
        },
        sitesPollues: {
          nombre: casias?.results ?? 0,
          sites: sitesPollues,
        },
      },
      catnat: catnatList,
      reportPdfUrl: urls.pdf,
    };

    const failedSubCalls = [catnatRes, seismeRes, radonRes, cavitesRes, casiasRes].filter(
      (r) => r.status === "rejected",
    ).length;
    if (failedSubCalls === 0) {
      return okResult(data, source, "high", warnings);
    }
    return { status: "partial", data, confidence: "medium", source, warnings };
  },
});

interface AziRow {
  libelle_azi: string;
  liste_libelle_risque: { libelle_risque_long: string }[];
}

/**
 * Cascade step, not part of the default plan: the Planner calls this only
 * after risksTool reports flood exposure, to fetch the precise flood-zone
 * name (Atlas des Zones Inondables) — "relance une recherche de contexte
 * (zone inondable, historique)" per the brief, made concrete.
 */
export async function fetchAziZones(citycode: string): Promise<AziZone[]> {
  const data = await fetchCommuneIndexed<AziRow>(
    "gaspar/azi",
    citycode,
    "&page_size=20",
    "risks:azi",
    COMMUNE_TTL_MS,
  );
  return data.data.map((row) => ({
    libelle: row.libelle_azi,
    risques: row.liste_libelle_risque.map((r) => r.libelle_risque_long),
  }));
}
