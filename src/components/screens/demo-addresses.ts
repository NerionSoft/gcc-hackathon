import type { Address, LifeProfileTag, PropertyType } from "@/types";

export interface DemoAddress {
  label: string;
  blurb: string;
  address: Address;
  tags: LifeProfileTag[];
  propertyType: PropertyType;
}

/**
 * Pre-verified against the live APIs (see the workflow smoke tests run during
 * development) — both reliably surface non-trivial, real findings, so the
 * demo doesn't depend on picking the right address live during a
 * presentation. Neither depends on the LLM being configured.
 */
export const DEMO_ADDRESSES: DemoAddress[] = [
  {
    label: "8 Rue de la Paix, Paris 2e",
    blurb:
      "Appartement urbain — zone inondable documentée, argile fort, sécurité et air à surveiller.",
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
  },
  {
    label: "Venelle de l'Église, Huelgoat (29)",
    blurb:
      "Maison rurale ancienne — cavités souterraines, potentiel radon élevé, historique CatNat répété.",
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
  },
];
