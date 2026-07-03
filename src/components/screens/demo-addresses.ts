import type { Address, LifeProfileTag, PropertyType } from "@/types";
import type { DemoScenarioId } from "@/lib/demo-fixtures";

export interface DemoAddress {
  label: string;
  blurb: string;
  address: Address;
  tags: LifeProfileTag[];
  propertyType: PropertyType;
  /** Selects the hand-authored fixture replayed by /api/report/stream and /api/report/pdf — see src/lib/demo-fixtures.ts. */
  demoId: DemoScenarioId;
}

/**
 * Backed by hand-authored fixtures (src/lib/demo-fixtures.ts), replayed as
 * canned NDJSON/PDF whenever `demoId` is appended to the report URL — so the
 * demo never depends on live government APIs or network availability during
 * a presentation. Neither depends on the LLM being configured.
 */
export const DEMO_ADDRESSES: DemoAddress[] = [
  {
    label: "8 Rue de la Paix, Paris 2e",
    blurb:
      "City-centre apartment — clean report overall, one ageing-building energy rating to watch.",
    address: {
      label: "8 Rue de la Paix 75002 Paris",
      lat: 48.868831,
      lon: 2.330992,
      citycode: "75102",
      postcode: "75002",
      city: "Paris",
      street: "Rue de la Paix",
      housenumber: "8",
      score: 0.96,
      type: "housenumber",
    },
    tags: ["famille_enfants"],
    propertyType: "appartement",
    demoId: "urban",
  },
  {
    label: "Venelle de l'Église, Huelgoat (29)",
    blurb:
      "Old rural house — underground cavities, high radon potential, a flood-prone valley, and a repeated natural-disaster history.",
    address: {
      label: "Venelle de l'Eglise 29690 Huelgoat",
      lat: 48.364193,
      lon: -3.745773,
      citycode: "29081",
      postcode: "29690",
      city: "Huelgoat",
      street: "Venelle de l'Eglise",
      score: 0.55,
      type: "street",
    },
    tags: ["senior_mobilite"],
    propertyType: "maison",
    demoId: "rural",
  },
];
