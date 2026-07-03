import { describe, it, expect, vi, beforeEach } from "vitest";
import { energyTool } from "@/mastra/tools/energy";
import { directToolContext } from "@/mastra/tools/context";
import { execTool } from "../helpers/exec-tool";

function jsonResponse(body: unknown): Response {
  return { ok: true, status: 200, headers: new Headers(), json: async () => body } as Response;
}

describe("energyTool", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("prefers the exact building's DPE over neighbours when a housenumber is given", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse({
          total: 3,
          results: [
            {
              numero_dpe: "1",
              etiquette_dpe: "D",
              etiquette_ges: "D",
              adresse_ban: "6 Rue de la Paix 75002 Paris",
              date_etablissement_dpe: "2026-04-24",
            },
            {
              numero_dpe: "2",
              etiquette_dpe: "C",
              etiquette_ges: "C",
              adresse_ban: "8 Rue de la Paix 75002 Paris",
              date_etablissement_dpe: "2026-01-23",
            },
            {
              numero_dpe: "3",
              etiquette_dpe: "E",
              etiquette_ges: "D",
              adresse_ban: "8 Rue de la Paix 75002 Paris",
              date_etablissement_dpe: "2022-06-27",
            },
          ],
        }),
      ),
    );

    const result = await execTool(
      energyTool.execute!(
        { lat: 48.868831, lon: 2.330992, housenumber: "8", street: "Rue de la Paix" },
        directToolContext,
      ),
    );

    expect(result.status).toBe("ok");
    expect(result.data?.records).toHaveLength(2);
    expect(result.data?.mostRecent?.etiquetteDpe).toBe("C");
  });

  it("falls back to neighbouring DPEs with a warning when no exact match exists", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse({
          total: 1,
          results: [
            {
              numero_dpe: "1",
              etiquette_dpe: "F",
              etiquette_ges: "E",
              adresse_ban: "6 Rue de la Paix 75002 Paris",
              date_etablissement_dpe: "2026-04-24",
            },
          ],
        }),
      ),
    );

    const result = await execTool(
      energyTool.execute!(
        { lat: 48.87, lon: 2.331, housenumber: "8", street: "Rue de la Paix" },
        directToolContext,
      ),
    );

    expect(result.status).toBe("ok");
    expect(result.warnings.some((w) => w.includes("voisinage"))).toBe(true);
  });

  it("returns unavailable when no DPE exists nearby", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ total: 0, results: [] })));

    const result = await execTool(energyTool.execute!({ lat: 0, lon: 0 }, directToolContext));

    expect(result.status).toBe("unavailable");
  });
});
