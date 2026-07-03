import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { fetchJson } from "@/lib/http";
import { withCache } from "@/lib/cache";
import {
  addressSchema,
  toolResultSchema,
  okResult,
  unavailableResult,
  errorResult,
  type Address,
  type SourceRef,
} from "@/types";

/**
 * IGN Géoplateforme — Base Adresse Nationale. The old api-adresse.data.gouv.fr
 * host was decommissioned end of January 2026; this is its documented
 * successor with the same GeoJSON contract.
 */
const BAN_BASE_URL = "https://data.geopf.fr/geocodage/search";

interface BanFeature {
  geometry: { coordinates: [number, number] };
  properties: {
    label: string;
    score: number;
    housenumber?: string;
    name: string;
    postcode: string;
    citycode: string;
    city: string;
    street?: string;
    type: "housenumber" | "street" | "locality" | "municipality";
  };
}
interface BanResponse {
  type: "FeatureCollection";
  features: BanFeature[];
}

function toAddress(feature: BanFeature): Address {
  const [lon, lat] = feature.geometry.coordinates;
  const p = feature.properties;
  return {
    label: p.label,
    lat,
    lon,
    citycode: p.citycode,
    postcode: p.postcode,
    city: p.city,
    street: p.street ?? (p.type === "street" ? p.name : undefined),
    housenumber: p.housenumber,
    score: p.score,
    type: p.type,
  };
}

function banSource(url: string): SourceRef {
  return {
    name: "Base Adresse Nationale (IGN Géoplateforme)",
    url,
    retrievedAt: new Date().toISOString(),
  };
}

export const geocodeInputSchema = z.object({
  query: z.string().min(2),
  limit: z.number().min(1).max(10).default(5),
});

export const geocodeOutputSchema = toolResultSchema(z.array(addressSchema));

export const geocodeTool = createTool({
  id: "geocode-ban",
  description:
    "Géocode une adresse française via la Base Adresse Nationale (point d'entrée obligatoire de TerraVista).",
  inputSchema: geocodeInputSchema,
  outputSchema: geocodeOutputSchema,
  execute: async ({ query, limit }) => {
    const url = `${BAN_BASE_URL}?q=${encodeURIComponent(query)}&limit=${limit}&autocomplete=1`;
    const source = banSource(url);
    try {
      const data = await withCache(`geocode:${query}:${limit}`, { ttlMs: 5 * 60 * 1000 }, () =>
        fetchJson<BanResponse>(url, { timeoutMs: 4000, retries: 2 }),
      );
      const addresses = data.features.map(toAddress);
      if (addresses.length === 0) {
        return unavailableResult(source, "Aucune adresse trouvée pour cette recherche.");
      }
      const confidence =
        addresses[0].score > 0.8 ? "high" : addresses[0].score > 0.5 ? "medium" : "low";
      return okResult(addresses, source, confidence);
    } catch (err) {
      return errorResult(
        source,
        err instanceof Error ? err.message : "Erreur inconnue lors du géocodage.",
      );
    }
  },
});
