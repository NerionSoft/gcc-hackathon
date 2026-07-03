import { describe, it, expect } from "vitest";
import { crimeTool } from "@/mastra/tools/crime";
import { directToolContext } from "@/mastra/tools/context";
import { execTool } from "../helpers/exec-tool";

describe("crimeTool", () => {
  it("returns real per-arrondissement data for Paris (SSMSI publishes these directly)", async () => {
    const result = await execTool(crimeTool.execute!({ citycode: "75102" }, directToolContext));

    expect(result.status).toBe("ok");
    expect(result.data?.commune).toBe("75102");
    expect(result.data?.indicateurs.length).toBeGreaterThan(0);
  });

  it("flags suppressed indicators instead of fabricating a rate", async () => {
    const result = await execTool(crimeTool.execute!({ citycode: "75102" }, directToolContext));

    const suppressed = result.data?.indicateurs.find((i) => i.supprime);
    if (suppressed) {
      expect(suppressed.tauxPour1000).toBeNull();
    }
  });

  it("returns unavailable for an unknown commune code", async () => {
    const result = await execTool(crimeTool.execute!({ citycode: "00000" }, directToolContext));

    expect(result.status).toBe("unavailable");
    expect(result.data).toBeNull();
  });
});
