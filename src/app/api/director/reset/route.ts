import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { NextResponse } from "next/server";
import { apiHandler } from "@/infrastructure/http/api-handler";
import { closeDb } from "@/db/client";
import { countProperties } from "@/db/access/properties";
import { countSignals } from "@/db/access/signals";
import { clearActiveCampaign } from "@/mastra/engine/campaign";
import { resetSimulator } from "@/mastra/simulator/evidence-feed-simulator";
import { DomainError } from "@/shared/errors/domain-error";
import { getLogger } from "@/infrastructure/logging/logger";

export const runtime = "nodejs";

const logger = getLogger("director:reset");

/** Re-run the deterministic seed pipeline in a child process. */
function reseed(): Promise<void> {
  return new Promise((resolvePromise, reject) => {
    const bin = process.platform === "win32" ? "tsx.cmd" : "tsx";
    const tsxPath = resolve(process.cwd(), "node_modules", ".bin", bin);
    const child = spawn(tsxPath, ["scripts/seed.ts"], {
      cwd: process.cwd(),
      env: process.env,
      stdio: "ignore",
    });
    child.on("error", reject);
    child.on("close", (code) =>
      code === 0 ? resolvePromise() : reject(new Error(`seed exited with code ${code}`)),
    );
  });
}

/**
 * F7 director — full data reset. Stops the evidence-feed simulator, forgets
 * the active campaign run, releases the SQLite handle, and rebuilds the
 * database from scratch through the same seed pipeline as `pnpm seed`
 * (deterministic — same portfolio every time). The demo returns to Act 1.
 */
export const POST = apiHandler(async () => {
  logger.info("Director reset requested — rebuilding the demo portfolio");

  resetSimulator();
  clearActiveCampaign();
  // Release our connection so the seed child can delete and recreate the file.
  closeDb();

  try {
    await reseed();
  } catch (error) {
    throw new DomainError(
      "RESET_FAILED",
      `Re-seed failed: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  const totals = { properties: countProperties(), signals: countSignals() };
  logger.info("Director reset complete", totals);
  return NextResponse.json({ ok: true, ...totals });
});
