import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { fetchJson } from "@/lib/http";
import { withCache } from "@/lib/cache";
import { haversineDistanceM } from "@/lib/geo";
import { median } from "@/lib/stats";
import {
  pricesDataSchema,
  toolResultSchema,
  okResult,
  errorResult,
  dvfExcludedDepartments,
  departmentFromCitycode,
  type PricesData,
  type SourceRef,
  type DvfTransaction,
} from "@/types";

/**
 * Cerema "API Données Foncières" — open (unauthenticated) subset of DVF with
 * parcel geometry, doc at apidf-preprod.cerema.fr/swagger/. No street address
 * field in this dataset (only parcelle/commune ids), so transactions are
 * plotted by parcel centroid rather than a postal address. The domain name
 * says "preprod" but it is the production open endpoint; it is occasionally
 * slow, hence the generous timeout below.
 */
const CEREMA_BASE = "https://apidf-preprod.cerema.fr/dvf_opendata/geomutations";
const LOOKBACK_YEARS = 5;
const RADIUS_DEG_LAT = 0.006; // ~650m — DVF's own "5 dernières années" window is date-based, this is the spatial window.

interface MultiPolygonGeom {
  type: "MultiPolygon" | "Polygon";
  coordinates: number[][][][] | number[][][];
}
interface GeomutationFeature {
  geometry: MultiPolygonGeom;
  properties: {
    datemut: string;
    anneemut: number;
    valeurfonc: string;
    sbati: string;
    libtypbien: string;
  };
}
interface GeomutationResponse {
  count: number;
  features: GeomutationFeature[];
}

function centroid(geom: MultiPolygonGeom): { lat: number; lon: number } {
  let sumLat = 0;
  let sumLon = 0;
  let n = 0;
  const rings: number[][][] =
    geom.type === "Polygon"
      ? (geom.coordinates as number[][][])
      : (geom.coordinates as number[][][][]).flat();
  for (const ring of rings) {
    for (const [lon, lat] of ring) {
      sumLat += lat;
      sumLon += lon;
      n++;
    }
  }
  return n > 0 ? { lat: sumLat / n, lon: sumLon / n } : { lat: 0, lon: 0 };
}

function parseTypeLocal(libelle: string): DvfTransaction["typeLocal"] {
  const upper = libelle.toUpperCase();
  if (upper.includes("MAISON")) return "maison";
  if (upper.includes("APPARTEMENT")) return "appartement";
  if (upper.includes("DEPENDANCE")) return "dependance";
  if (upper.includes("LOCAL") || upper.includes("INDUSTRIEL") || upper.includes("COMMERCIAL"))
    return "local_industriel";
  return "autre";
}

function ceremaSource(url: string): SourceRef {
  return {
    name: "Cerema — API Données Foncières (DVF open data)",
    url,
    retrievedAt: new Date().toISOString(),
  };
}

export const pricesInputSchema = z.object({
  lat: z.number(),
  lon: z.number(),
  citycode: z.string(),
  propertyType: z.enum(["maison", "appartement", "inconnu"]).default("inconnu"),
});
export const pricesOutputSchema = toolResultSchema(pricesDataSchema);

export const pricesTool = createTool({
  id: "prices-dvf",
  description:
    "Interroge les Demandes de Valeurs Foncières (DVF) autour d'une adresse via l'API ouverte du Cerema.",
  inputSchema: pricesInputSchema,
  outputSchema: pricesOutputSchema,
  execute: async ({
    lat,
    lon,
    citycode,
    propertyType,
  }): Promise<z.infer<typeof pricesOutputSchema>> => {
    const department = departmentFromCitycode(citycode);
    if (dvfExcludedDepartments.has(department)) {
      const source = ceremaSource(CEREMA_BASE);
      const data: PricesData = {
        transactions: [],
        medianPriceM2: null,
        sampleSize: 0,
        coverageExcluded: true,
      };
      return {
        status: "partial",
        data,
        confidence: "high",
        source,
        warnings: [
          "DVF ne couvre pas ce territoire (Mayotte ou droit local d'Alsace-Moselle) — aucune donnée de transaction disponible ici.",
        ],
      };
    }

    const deltaLon = RADIUS_DEG_LAT / Math.cos((lat * Math.PI) / 180);
    const bbox = [lon - deltaLon, lat - RADIUS_DEG_LAT, lon + deltaLon, lat + RADIUS_DEG_LAT].join(
      ",",
    );
    const minYear = new Date().getFullYear() - LOOKBACK_YEARS;
    const url = `${CEREMA_BASE}/?in_bbox=${bbox}&anneemut_min=${minYear}&page_size=200`;
    const source = ceremaSource(url);

    let response: GeomutationResponse;
    try {
      response = await withCache(
        `prices:${bbox}:${minYear}`,
        { ttlMs: 24 * 3600 * 1000, disk: true },
        () => fetchJson<GeomutationResponse>(url, { timeoutMs: 12000, retries: 2 }),
      );
    } catch (err) {
      return errorResult(
        source,
        `DVF indisponible pour cette zone : ${err instanceof Error ? err.message : "erreur"}.`,
      );
    }

    const radiusM = RADIUS_DEG_LAT * 111_000 * 1.5; // sanity margin: drop multi-commune parcels whose centroid drifted out of the query area.
    const transactions: DvfTransaction[] = response.features
      .map((f): DvfTransaction | null => {
        const { lat: cLat, lon: cLon } = centroid(f.geometry);
        const distanceM = haversineDistanceM(lat, lon, cLat, cLon);
        if (distanceM > radiusM) return null;
        const surface = Number(f.properties.sbati);
        const valeur = Number(f.properties.valeurfonc);
        return {
          dateMutation: f.properties.datemut,
          valeurFonciere: valeur,
          surfaceReelleBati: surface > 0 ? surface : null,
          prixM2: surface > 1 ? Math.round((valeur / surface) * 100) / 100 : null,
          typeLocal: parseTypeLocal(f.properties.libtypbien),
          lat: cLat,
          lon: cLon,
          distanceM: Math.round(distanceM),
        };
      })
      .filter((t): t is DvfTransaction => t !== null)
      .sort((a, b) => (a.distanceM ?? 0) - (b.distanceM ?? 0));

    const relevantForMedian =
      propertyType === "inconnu"
        ? transactions
        : transactions.filter((t) => t.typeLocal === propertyType);
    const medianPriceM2 = median(
      relevantForMedian.map((t) => t.prixM2).filter((v): v is number => v !== null),
    );

    const warnings: string[] = [];
    if (response.count > response.features.length) {
      warnings.push(
        `${response.count} mutations recensées dans la zone, ${response.features.length} récupérées (limite de page) — l'échantillon est représentatif mais pas exhaustif.`,
      );
    }
    if (transactions.length < 5) {
      warnings.push(
        "Peu de transactions comparables dans le rayon retenu — la médiane est peu fiable statistiquement.",
      );
    }

    const data: PricesData = {
      transactions: transactions.slice(0, 50),
      medianPriceM2,
      sampleSize: relevantForMedian.length,
      coverageExcluded: false,
    };
    return okResult(data, source, transactions.length >= 5 ? "high" : "medium", warnings);
  },
});
