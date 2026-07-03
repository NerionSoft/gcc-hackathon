import { describe, it, expect, vi, beforeEach } from "vitest";
import { pricesTool } from "@/mastra/tools/prices";
import { directToolContext } from "@/mastra/tools/context";
import { execTool } from "../helpers/exec-tool";

function jsonResponse(body: unknown): Response {
  return { ok: true, status: 200, headers: new Headers(), json: async () => body } as Response;
}

// A small square centred close to (2.331, 48.869) so the centroid lands well within the query radius.
function squareAround(lon: number, lat: number): number[][][] {
  const d = 0.0002;
  return [
    [
      [lon - d, lat - d],
      [lon + d, lat - d],
      [lon + d, lat + d],
      [lon - d, lat + d],
      [lon - d, lat - d],
    ],
  ];
}

describe("pricesTool", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("computes a median price/m2 from nearby transactions, sorted by distance", async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({
        count: 2,
        features: [
          {
            geometry: { type: "Polygon", coordinates: squareAround(2.332, 48.869) },
            properties: {
              datemut: "2023-05-01",
              anneemut: 2023,
              valeurfonc: "300000",
              sbati: "60",
              libtypbien: "UN APPARTEMENT",
            },
          },
          {
            geometry: { type: "Polygon", coordinates: squareAround(2.331, 48.8691) },
            properties: {
              datemut: "2022-01-01",
              anneemut: 2022,
              valeurfonc: "200000",
              sbati: "50",
              libtypbien: "APPARTEMENT INDETERMINE",
            },
          },
        ],
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await execTool(
      pricesTool.execute!(
        { lat: 48.868831, lon: 2.330992, citycode: "75102", propertyType: "appartement" },
        directToolContext,
      ),
    );

    expect(result.status).toBe("ok");
    expect(result.data?.coverageExcluded).toBe(false);
    expect(result.data?.transactions).toHaveLength(2);
    expect(result.data?.transactions[0].prixM2).toBeCloseTo(4000);
    // Median of 4000 and 5000 (200000/50) is 4500.
    expect(result.data?.medianPriceM2).toBeCloseTo(4500);
  });

  it("reports coverage exclusion for Alsace-Moselle without calling the API", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const result = await execTool(
      pricesTool.execute!(
        { lat: 48.58, lon: 7.75, citycode: "67482", propertyType: "inconnu" },
        directToolContext,
      ),
    );

    expect(result.data?.coverageExcluded).toBe(true);
    expect(result.warnings.some((w) => w.includes("Alsace-Moselle"))).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns an error result when Cerema is unreachable", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("timeout")));

    const result = await execTool(
      pricesTool.execute!(
        { lat: 45, lon: 1, citycode: "19000", propertyType: "inconnu" },
        directToolContext,
      ),
    );

    expect(result.status).toBe("error");
    expect(result.data).toBeNull();
  });
});
