import { NextResponse } from "next/server";
import { z } from "zod";
import { apiHandler } from "@/infrastructure/http/api-handler";
import {
  getSimulatorState,
  pauseSimulator,
  resetSimulator,
  setSimulatorSpeed,
  startSimulator,
} from "@/mastra/simulator/evidence-feed-simulator";

const bodySchema = z.discriminatedUnion("command", [
  z.object({ command: z.literal("start"), intervalMs: z.number().int().min(250).optional() }),
  z.object({ command: z.literal("pause") }),
  z.object({ command: z.literal("speed"), intervalMs: z.number().int().min(250) }),
  z.object({ command: z.literal("reset") }),
]);

/** F7 — director controls for the evidence-feed simulator. */
export const GET = apiHandler(async () => NextResponse.json(getSimulatorState()));

export const POST = apiHandler(async (req) => {
  const body = bodySchema.parse(await req.json());
  switch (body.command) {
    case "start":
      return NextResponse.json(startSimulator(body.intervalMs));
    case "pause":
      return NextResponse.json(pauseSimulator());
    case "speed":
      return NextResponse.json(setSimulatorSpeed(body.intervalMs));
    case "reset":
      return NextResponse.json(resetSimulator());
  }
});
