import { describe, it, expect, vi, beforeEach } from "vitest";
import { geocodeTool } from "@/mastra/tools/geocode";
import { directToolContext } from "@/mastra/tools/context";
import { execTool } from "../helpers/exec-tool";

function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    headers: new Headers(),
    json: async () => body,
  } as Response;
}

describe("geocodeTool", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("returns a high-confidence ok result for a well-matched address", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse({
          type: "FeatureCollection",
          features: [
            {
              geometry: { coordinates: [2.330992, 48.868831] },
              properties: {
                label: "8 Rue de la Paix 75002 Paris",
                score: 0.96,
                housenumber: "8",
                name: "8 Rue de la Paix",
                postcode: "75002",
                citycode: "75102",
                city: "Paris",
                street: "Rue de la Paix",
                type: "housenumber",
              },
            },
          ],
        }),
      ),
    );

    const result = await execTool(
      geocodeTool.execute!({ query: "8 rue de la paix paris", limit: 5 }, directToolContext),
    );

    expect(result.status).toBe("ok");
    expect(result.confidence).toBe("high");
    expect(result.data?.[0]).toMatchObject({ citycode: "75102", lat: 48.868831, lon: 2.330992 });
  });

  it("returns unavailable when the BAN finds nothing", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse({ type: "FeatureCollection", features: [] })),
    );

    const result = await execTool(
      geocodeTool.execute!({ query: "adresse inexistante xyz", limit: 5 }, directToolContext),
    );

    expect(result.status).toBe("unavailable");
    expect(result.data).toBeNull();
  });

  it("returns an error result instead of throwing when the network fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));

    const result = await execTool(
      geocodeTool.execute!({ query: "8 rue de la paix", limit: 1 }, directToolContext),
    );

    expect(result.status).toBe("error");
    expect(result.error).toContain("network down");
  });
});
