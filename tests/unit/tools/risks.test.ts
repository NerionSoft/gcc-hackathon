import { describe, it, expect, vi, beforeEach } from "vitest";
import { risksTool } from "@/mastra/tools/risks";
import { directToolContext } from "@/mastra/tools/context";
import { execTool } from "../helpers/exec-tool";

function jsonResponse(body: unknown): Response {
  return { ok: true, status: 200, headers: new Headers(), json: async () => body } as Response;
}

const SUMMARY_BODY = {
  risquesNaturels: {
    inondation: {
      present: true,
      libelleStatutCommune: "Risque Existant",
      libelleStatutAdresse: "Risque Existant",
    },
    mouvementTerrain: { present: false, libelleStatutCommune: null, libelleStatutAdresse: null },
    retraitGonflementArgile: {
      present: true,
      libelleStatutCommune: "Risque Existant - important",
      libelleStatutAdresse: "Risque non Connu",
    },
  },
};

function routeFetch(url: string): Response {
  if (url.includes("resultats_rapport_risque")) return jsonResponse(SUMMARY_BODY);
  if (url.includes("gaspar/catnat")) {
    return jsonResponse({
      results: 1,
      data: [
        {
          date_debut_evt: "2003-05-31",
          date_fin_evt: "2003-05-31",
          date_publication_arrete: "2003-10-03",
          date_publication_jo: "2003-10-19",
          libelle_risque_jo: "Sécheresse",
        },
      ],
    });
  }
  if (url.includes("zonage_sismique"))
    return jsonResponse({ results: 1, data: [{ code_insee: "29081", code_zone: "2" }] });
  if (url.includes("radon")) return jsonResponse({ results: 1, data: [{ classe_potentiel: "3" }] });
  if (url.includes("cavites")) return jsonResponse({ results: 0, data: [] });
  if (url.includes("ssp/casias")) {
    return jsonResponse({
      results: 2,
      data: [
        { nom_etablissement: "Loin", statut: "En activité", geom: { coordinates: [-3.77, 48.36] } },
        {
          nom_etablissement: "Proche",
          statut: "En arrêt",
          geom: { coordinates: [-3.7648, 48.36] },
        },
      ],
    });
  }
  throw new Error(`unexpected url in test: ${url}`);
}

describe("risksTool", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("aggregates all Géorisques sub-sources into one high-confidence result", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => routeFetch(url)),
    );

    const result = await execTool(
      risksTool.execute!({ lat: 48.36, lon: -3.7647, citycode: "29081" }, directToolContext),
    );

    expect(result.status).toBe("ok");
    expect(result.confidence).toBe("high");
    expect(result.data?.summary.inondation.expose).toBe(true);
    expect(result.data?.summary.argiles.niveau).toBe("fort");
    expect(result.data?.summary.sismicite.zone).toBe(2);
    expect(result.data?.summary.radon.classe).toBe(3);
    expect(result.data?.catnat).toHaveLength(1);
    expect(result.data?.catnat[0].libelleRisqueJo).toBe("Sécheresse");
    // Closer site should sort first.
    expect(result.data?.summary.sitesPollues.sites[0].nom).toBe("Proche");
    expect(result.warnings.some((w) => w.includes("argile"))).toBe(true);
  });

  it("degrades to partial confidence when a sub-source fails, without dropping the report", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.includes("zonage_sismique")) throw new Error("503");
        return routeFetch(url);
      }),
    );

    const result = await execTool(
      risksTool.execute!({ lat: 45.1, lon: 1.2, citycode: "19000" }, directToolContext),
    );

    expect(result.status).toBe("partial");
    expect(result.confidence).toBe("medium");
    expect(result.data?.summary.sismicite.zone).toBeNull();
    expect(result.warnings.some((w) => w.includes("sismi"))).toBe(true);
  });

  it("returns an error result when the core risk summary itself is unavailable", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("timeout")));

    const result = await execTool(
      risksTool.execute!({ lat: 0, lon: 0, citycode: "00000" }, directToolContext),
    );

    expect(result.status).toBe("error");
    expect(result.data).toBeNull();
  });
});
