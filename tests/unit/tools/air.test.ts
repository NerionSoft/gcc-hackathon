import { describe, it, expect, vi, beforeEach } from "vitest";
import { airTool } from "@/mastra/tools/air";
import { directToolContext } from "@/mastra/tools/context";
import { execTool } from "../helpers/exec-tool";

function jsonResponse(body: unknown): Response {
  return { ok: true, status: 200, headers: new Headers(), json: async () => body } as Response;
}

describe("airTool", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("returns today's ATMO index when available", async () => {
    const today = new Date().toISOString().slice(0, 10);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse({
          features: [
            {
              properties: {
                code_qual: 2,
                lib_qual: "Moyen",
                date_ech: today,
                lib_zone: "Paris 2e Arrondissement",
              },
            },
          ],
        }),
      ),
    );

    const result = await execTool(airTool.execute!({ citycode: "75102" }, directToolContext));

    expect(result.status).toBe("ok");
    expect(result.data?.atmoIndex).toBe(2);
    expect(result.data?.atmoLabel).toBe("Moyen");
  });

  it("returns unavailable for communes outside the measurement network", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ features: [] })));

    const result = await execTool(airTool.execute!({ citycode: "29081" }, directToolContext));

    expect(result.status).toBe("unavailable");
    expect(result.data).toBeNull();
  });

  it("returns an error result when Atmo Data is unreachable", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));

    const result = await execTool(airTool.execute!({ citycode: "13055" }, directToolContext));

    expect(result.status).toBe("error");
  });
});
