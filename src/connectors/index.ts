/**
 * UK open-data connector pack for Civic Property Intelligence.
 *
 * Forkability: this folder IS the country pack. Every client returns the
 * same `ConnectorResult` shape and declares its licence; replacing UK
 * sources with e.g. French ones (DVF, Géorisques, BAN) touches nothing
 * outside `src/connectors/`.
 */

export * from "@/connectors/types";
export { fetchJson } from "@/connectors/http";
export { readCache, writeCache } from "@/connectors/cache";

export * as landRegistryPricePaid from "@/connectors/land-registry-price-paid";
export * as landRegistryUkhpi from "@/connectors/land-registry-ukhpi";
export * as onsRents from "@/connectors/ons-rents";
export * as epc from "@/connectors/epc";
export * as planning from "@/connectors/planning";
export * as eaFlood from "@/connectors/ea-flood";
export * as policeUk from "@/connectors/police-uk";
export * as dfeSchools from "@/connectors/dfe-schools";
export * as companiesHouse from "@/connectors/companies-house";
export * as ccodOcod from "@/connectors/ccod-ocod";
export * as defraNoise from "@/connectors/defra-noise";
export * as bgs from "@/connectors/bgs";

import { meta as pricePaidMeta } from "@/connectors/land-registry-price-paid";
import { meta as ukhpiMeta } from "@/connectors/land-registry-ukhpi";
import { meta as onsRentsMeta } from "@/connectors/ons-rents";
import { meta as epcMeta } from "@/connectors/epc";
import { meta as planningMeta } from "@/connectors/planning";
import { meta as eaFloodMeta } from "@/connectors/ea-flood";
import { meta as policeUkMeta } from "@/connectors/police-uk";
import { meta as dfeSchoolsMeta } from "@/connectors/dfe-schools";
import { meta as companiesHouseMeta } from "@/connectors/companies-house";
import { meta as ccodOcodMeta } from "@/connectors/ccod-ocod";
import { meta as defraNoiseMeta } from "@/connectors/defra-noise";
import { meta as bgsMeta } from "@/connectors/bgs";
import type { ConnectorMeta } from "@/connectors/types";

/** Registry of every source in the pack — drives README + data-freshness UI. */
export const CONNECTOR_REGISTRY: readonly ConnectorMeta[] = [
  pricePaidMeta,
  ukhpiMeta,
  onsRentsMeta,
  epcMeta,
  planningMeta,
  eaFloodMeta,
  policeUkMeta,
  dfeSchoolsMeta,
  companiesHouseMeta,
  ccodOcodMeta,
  defraNoiseMeta,
  bgsMeta,
];
