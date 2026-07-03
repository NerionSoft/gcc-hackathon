import type { EvidenceUpdate } from "@/db/schema";

/**
 * Pre-written evidence-feed updates, replayed by the evidence-feed simulator
 * (spec §4.3) so the demo is deterministic — no live LLM loop.
 *
 * Mix: 24 corroborating (green) / 10 new minor (amber) / 6 material adverse
 * (red) = 40 items ≈ 60% / 25% / 15%.
 *
 * SIMULATED content: recordIds carry the "simulated-feed:" prefix and URLs
 * point at the real dataset they imitate. Never presented as real events.
 */

const FEED_TIME = "2026-07-01T09:00:00.000Z";

interface FeedSpec {
  kind: EvidenceUpdate["kind"];
  severity: EvidenceUpdate["severity"];
  dimensionCode: EvidenceUpdate["dimensionCode"];
  signalCode: string;
  headline: string;
  detail: string;
  dataset: string;
  url: string;
}

function feed(spec: FeedSpec, n: number): EvidenceUpdate {
  return {
    id: `feed-${String(n).padStart(3, "0")}`,
    kind: spec.kind,
    severity: spec.severity,
    dimensionCode: spec.dimensionCode,
    signalCode: spec.signalCode,
    headline: spec.headline,
    detail: spec.detail,
    sourceRef: {
      dataset: spec.dataset,
      recordId: `simulated-feed:${String(n).padStart(3, "0")}`,
      url: spec.url,
      retrievedAt: FEED_TIME,
    },
  };
}

const POLICE_URL = "https://data.police.uk/api/crimes-street/all-crime";
const EA_URL = "https://environment.data.gov.uk/flood-monitoring/id/floods";
const PLANNING_URL = "https://www.planning.data.gov.uk/entity.json";
const CH_URL = "https://api.company-information.service.gov.uk";
const EPC_URL = "https://epc.opendatacommunities.org/";
const UKHPI_URL = "https://landregistry.data.gov.uk/data/ukhpi";
const ONS_URL = "https://api.beta.ons.gov.uk/v1/datasets/index-private-housing-rental-prices";
const GIAS_URL = "https://get-information-schools.service.gov.uk/Downloads";
const OCOD_URL = "https://use-land-property-data.service.gov.uk/datasets/ocod";

const SPECS: FeedSpec[] = [
  // ------------------------------------------------------------------
  // Corroborating (green) × 24 — monthly refreshes that confirm the file.
  // ------------------------------------------------------------------
  {
    kind: "corroborating",
    severity: "green",
    dimensionCode: "BLOCK",
    signalCode: "BLOCK-INCIDENT",
    headline: "Monthly police statistics published: incident volume steady",
    detail:
      "The latest street-level crime release shows incident volumes within the local-authority norm for the twelfth consecutive month. No change to the block assessment.",
    dataset: "police-uk-street-crime",
    url: POLICE_URL,
  },
  {
    kind: "corroborating",
    severity: "green",
    dimensionCode: "BLOCK",
    signalCode: "BLOCK-INCIDENT",
    headline: "Police data refresh: burglary share declining",
    detail:
      "Burglary and criminal-damage share of incidents fell month on month around the block. Corroborates the existing green finding.",
    dataset: "police-uk-street-crime",
    url: POLICE_URL,
  },
  {
    kind: "corroborating",
    severity: "green",
    dimensionCode: "LAND",
    signalCode: "LAND-FLOOD",
    headline: "Environment Agency feed: no flood alerts in force",
    detail:
      "The real-time flood-monitoring feed reports no alert or warning covering the location this period. Flood posture unchanged.",
    dataset: "ea-flood-monitoring",
    url: EA_URL,
  },
  {
    kind: "corroborating",
    severity: "green",
    dimensionCode: "LAND",
    signalCode: "LAND-FLOOD",
    headline: "Seasonal flood-area review completed without boundary change",
    detail:
      "The Environment Agency's periodic review left alert-area boundaries around the site unchanged. Existing severity stands.",
    dataset: "ea-flood-monitoring",
    url: EA_URL,
  },
  {
    kind: "corroborating",
    severity: "green",
    dimensionCode: "BUILDING",
    signalCode: "BUILDING-PERMIT",
    headline: "Planning register refresh: no new applications at the site",
    detail:
      "The weekly planning-data refresh lists no new applications, designations or enforcement entries affecting the property.",
    dataset: "planning-data",
    url: PLANNING_URL,
  },
  {
    kind: "corroborating",
    severity: "green",
    dimensionCode: "BUILDING",
    signalCode: "BUILDING-PERMIT",
    headline: "Neighbouring application decided with no impact on the site",
    detail:
      "A householder application on the adjoining plot was granted with standard conditions; no shadowing or access implications for the assessed property.",
    dataset: "planning-data",
    url: PLANNING_URL,
  },
  {
    kind: "corroborating",
    severity: "green",
    dimensionCode: "PEOPLE",
    signalCode: "PEOPLE-LITIGATION",
    headline: "Companies House: proprietor filings up to date",
    detail:
      "The proprietor entity filed accounts and confirmation statement on time; status remains active with no gazette notices.",
    dataset: "companies-house-register",
    url: CH_URL,
  },
  {
    kind: "corroborating",
    severity: "green",
    dimensionCode: "PEOPLE",
    signalCode: "PEOPLE-OWNER",
    headline: "Ownership check: control chain unchanged",
    detail:
      "Monthly CCOD refresh shows the same UK-registered proprietor; no transfer to a corporate vehicle detected.",
    dataset: "land-registry-ccod-ocod",
    url: OCOD_URL,
  },
  {
    kind: "corroborating",
    severity: "green",
    dimensionCode: "MARKET",
    signalCode: "MARKET-ANOMALY",
    headline: "UKHPI monthly release: local prices tracking the assessment",
    detail:
      "The house price index for the local authority moved 0.3% month on month, consistent with the valuation context used in the dossier.",
    dataset: "uk-house-price-index",
    url: UKHPI_URL,
  },
  {
    kind: "corroborating",
    severity: "green",
    dimensionCode: "MARKET",
    signalCode: "MARKET-LIQUIDITY",
    headline: "UKHPI volumes stable for the third month",
    detail:
      "Registered sales volumes in the local authority held within 5% of the trailing-year average. Liquidity assessment unchanged.",
    dataset: "uk-house-price-index",
    url: UKHPI_URL,
  },
  {
    kind: "corroborating",
    severity: "green",
    dimensionCode: "MARKET",
    signalCode: "MARKET-RENT",
    headline: "ONS rental index: regional growth in line with national",
    detail:
      "IPHRP shows regional private-rent growth level with the national rate this quarter. No added tenancy-sustainability stress.",
    dataset: "ons-private-housing-rental-prices",
    url: ONS_URL,
  },
  {
    kind: "corroborating",
    severity: "green",
    dimensionCode: "UNIT",
    signalCode: "UNIT-RESALE",
    headline: "Price Paid refresh: no new transactions at the address",
    detail:
      "The monthly Price Paid Data load contains no new sale of the unit; holding-period analysis unchanged.",
    dataset: "land-registry-price-paid",
    url: "https://landregistry.data.gov.uk/data/ppi/transaction-record.json",
  },
  {
    kind: "corroborating",
    severity: "green",
    dimensionCode: "UNIT",
    signalCode: "UNIT-NOISE",
    headline: "Noise mapping round confirmed current",
    detail:
      "Defra confirmed round-3 strategic noise maps remain the current published round; the unit's Lden band is unchanged.",
    dataset: "defra-road-noise-lden-round-3",
    url: "https://environment.data.gov.uk/spatialdata/road-noise-lden-england-round-3/wfs",
  },
  {
    kind: "corroborating",
    severity: "green",
    dimensionCode: "BLOCK",
    signalCode: "BLOCK-SCHOOL",
    headline: "GIAS refresh: local school provision unchanged",
    detail:
      "The daily establishment extract lists the same open schools in the district; no closures or conversions affecting the block.",
    dataset: "dfe-gias-establishments",
    url: GIAS_URL,
  },
  {
    kind: "corroborating",
    severity: "green",
    dimensionCode: "LAND",
    signalCode: "LAND-SOIL",
    headline: "Radon atlas check: classification unchanged",
    detail:
      "The BGS radon indicative atlas grid square retains its previous classification following the periodic dataset refresh.",
    dataset: "bgs-radon-indicative-atlas",
    url: "https://map.bgs.ac.uk/arcgis/rest/services/GeoIndex_Onshore/radon/MapServer",
  },
  {
    kind: "corroborating",
    severity: "green",
    dimensionCode: "LAND",
    signalCode: "LAND-POLLUTION",
    headline: "Brownfield register refresh: no new entries near the site",
    detail:
      "The updated brownfield-land dataset introduces no new registered plots at or adjoining the property.",
    dataset: "planning-data",
    url: PLANNING_URL,
  },
  {
    kind: "corroborating",
    severity: "green",
    dimensionCode: "BUILDING",
    signalCode: "BUILDING-ENERGY",
    headline: "EPC register refresh: certificate unchanged",
    detail:
      "No new certificate was lodged for the address; the current band and expiry remain as assessed.",
    dataset: "epc-domestic",
    url: EPC_URL,
  },
  {
    kind: "corroborating",
    severity: "green",
    dimensionCode: "BUILDING",
    signalCode: "BUILDING-HERITAGE",
    headline: "Heritage datasets refresh: no new designations",
    detail:
      "The listed-building and conservation-area datasets show no new designation covering the property.",
    dataset: "planning-data",
    url: PLANNING_URL,
  },
  {
    kind: "corroborating",
    severity: "green",
    dimensionCode: "BLOCK",
    signalCode: "BLOCK-INCIDENT",
    headline: "Quarterly incident trend: within seasonal norms",
    detail:
      "Three-month incident totals around the block sit within seasonal norms for the local authority; no emerging hotspot pattern.",
    dataset: "police-uk-street-crime",
    url: POLICE_URL,
  },
  {
    kind: "corroborating",
    severity: "green",
    dimensionCode: "LAND",
    signalCode: "LAND-FLOOD",
    headline: "Winter readiness bulletin: defences maintained",
    detail:
      "The Environment Agency seasonal bulletin confirms local defence maintenance completed; no change to area classifications.",
    dataset: "ea-flood-monitoring",
    url: EA_URL,
  },
  {
    kind: "corroborating",
    severity: "green",
    dimensionCode: "PEOPLE",
    signalCode: "PEOPLE-OWNER",
    headline: "OCOD monthly file: no overseas transfer recorded",
    detail:
      "The overseas-companies dataset refresh contains no entry for the title; proprietor remains UK-registered.",
    dataset: "land-registry-ccod-ocod",
    url: OCOD_URL,
  },
  {
    kind: "corroborating",
    severity: "green",
    dimensionCode: "MARKET",
    signalCode: "MARKET-ANOMALY",
    headline: "Local index annual revision: dossier values still in range",
    detail:
      "UKHPI annual revisions left the local-authority average within 2% of the figure used in the assessment.",
    dataset: "uk-house-price-index",
    url: UKHPI_URL,
  },
  {
    kind: "corroborating",
    severity: "green",
    dimensionCode: "UNIT",
    signalCode: "UNIT-RESALE",
    headline: "Postcode transactions: orderly market behaviour",
    detail:
      "New Price Paid entries in the postcode show normal holding periods and no distressed pricing.",
    dataset: "land-registry-price-paid",
    url: "https://landregistry.data.gov.uk/data/ppi/transaction-record.json",
  },
  {
    kind: "corroborating",
    severity: "green",
    dimensionCode: "BLOCK",
    signalCode: "BLOCK-SCHOOL",
    headline: "School inspection outcome published: no provision change",
    detail:
      "The latest inspection outcome for the district's primary school records no change in registration or status.",
    dataset: "dfe-gias-establishments",
    url: GIAS_URL,
  },
  // ------------------------------------------------------------------
  // New minor (amber) × 10 — worth a look, not dossier-changing alone.
  // ------------------------------------------------------------------
  {
    kind: "new_minor",
    severity: "amber",
    dimensionCode: "BUILDING",
    signalCode: "BUILDING-PERMIT",
    headline: "New planning application lodged next door",
    detail:
      "A change-of-use application (residential to small HMO) was validated for the adjoining property. Amenity impact possible; monitor the decision.",
    dataset: "planning-data",
    url: PLANNING_URL,
  },
  {
    kind: "new_minor",
    severity: "amber",
    dimensionCode: "BLOCK",
    signalCode: "BLOCK-INCIDENT",
    headline: "Monthly police data: localised uptick in criminal damage",
    detail:
      "Criminal-damage incidents rose above the local norm on the adjacent street this month. Single-month movement; watch for persistence.",
    dataset: "police-uk-street-crime",
    url: POLICE_URL,
  },
  {
    kind: "new_minor",
    severity: "amber",
    dimensionCode: "LAND",
    signalCode: "LAND-FLOOD",
    headline: "Flood alert issued and stood down within 24 hours",
    detail:
      "A short-lived flood alert covered the wider alert area following heavy rainfall, stood down the next morning. First activation this year.",
    dataset: "ea-flood-monitoring",
    url: EA_URL,
  },
  {
    kind: "new_minor",
    severity: "amber",
    dimensionCode: "MARKET",
    signalCode: "MARKET-LIQUIDITY",
    headline: "UKHPI volumes dip below trailing-year average",
    detail:
      "Registered sales volumes fell 27% against the trailing year in the local authority. One month below the amber threshold; monitor the trend.",
    dataset: "uk-house-price-index",
    url: UKHPI_URL,
  },
  {
    kind: "new_minor",
    severity: "amber",
    dimensionCode: "MARKET",
    signalCode: "MARKET-RENT",
    headline: "Regional rent growth edges above national",
    detail:
      "IPHRP shows regional private-rent growth 1.8 points above the national rate this quarter — early tenancy-affordability stress.",
    dataset: "ons-private-housing-rental-prices",
    url: ONS_URL,
  },
  {
    kind: "new_minor",
    severity: "amber",
    dimensionCode: "PEOPLE",
    signalCode: "PEOPLE-LITIGATION",
    headline: "Proprietor filed accounts late",
    detail:
      "The proprietor entity's annual accounts were filed six weeks after the deadline. No insolvency indicator, but a governance flag.",
    dataset: "companies-house-register",
    url: CH_URL,
  },
  {
    kind: "new_minor",
    severity: "amber",
    dimensionCode: "BUILDING",
    signalCode: "BUILDING-ENERGY",
    headline: "New EPC lodged one band lower",
    detail:
      "A renewal certificate was lodged at band E, down from D, citing degraded glazing. Above the statutory floor but a retrofit-cost signal.",
    dataset: "epc-domestic",
    url: EPC_URL,
  },
  {
    kind: "new_minor",
    severity: "amber",
    dimensionCode: "UNIT",
    signalCode: "UNIT-NOISE",
    headline: "Road scheme consultation may shift traffic patterns",
    detail:
      "A published highways consultation proposes rerouting through-traffic one block away; Lden exposure could rise at the facade if adopted.",
    dataset: "defra-road-noise-lden-round-3",
    url: "https://environment.data.gov.uk/spatialdata/road-noise-lden-england-round-3/wfs",
  },
  {
    kind: "new_minor",
    severity: "amber",
    dimensionCode: "BLOCK",
    signalCode: "BLOCK-SCHOOL",
    headline: "District school consults on conversion",
    detail:
      "The GIAS record shows a consultation to convert the nearest primary to academy status; provision continuity expected but unconfirmed.",
    dataset: "dfe-gias-establishments",
    url: GIAS_URL,
  },
  {
    kind: "new_minor",
    severity: "amber",
    dimensionCode: "LAND",
    signalCode: "LAND-POLLUTION",
    headline: "Brownfield registration on an adjoining plot",
    detail:
      "The refreshed brownfield-land dataset adds an adjoining plot with remediation status 'not started'. No entry for the site itself.",
    dataset: "planning-data",
    url: PLANNING_URL,
  },
  // ------------------------------------------------------------------
  // Material adverse (red) × 6 — dossier-changing; will drive escalation.
  // ------------------------------------------------------------------
  {
    kind: "material_adverse",
    severity: "red",
    dimensionCode: "LAND",
    signalCode: "LAND-FLOOD",
    headline: "Severe flood warning issued for the warning area",
    detail:
      "The Environment Agency issued a severe flood warning covering the property's warning area, with property-level flooding reported on the same street.",
    dataset: "ea-flood-monitoring",
    url: EA_URL,
  },
  {
    kind: "material_adverse",
    severity: "red",
    dimensionCode: "PEOPLE",
    signalCode: "PEOPLE-LITIGATION",
    headline: "Winding-up petition filed against the proprietor",
    detail:
      "A winding-up petition against the proprietor entity appears in the latest gazette feed via Companies House. Title transfer during insolvency proceedings is a material completion risk.",
    dataset: "companies-house-register",
    url: CH_URL,
  },
  {
    kind: "material_adverse",
    severity: "red",
    dimensionCode: "PEOPLE",
    signalCode: "PEOPLE-OWNER",
    headline: "Title transferred to an overseas entity mid-review",
    detail:
      "The monthly OCOD refresh records transfer of the registered title to an overseas company with unresolved beneficial control.",
    dataset: "land-registry-ccod-ocod",
    url: OCOD_URL,
  },
  {
    kind: "material_adverse",
    severity: "red",
    dimensionCode: "BUILDING",
    signalCode: "BUILDING-PERMIT",
    headline: "Enforcement notice served for unauthorised works",
    detail:
      "The planning register now shows an enforcement notice for unauthorised structural alterations at the property, with a six-month compliance period.",
    dataset: "planning-data",
    url: PLANNING_URL,
  },
  {
    kind: "material_adverse",
    severity: "red",
    dimensionCode: "LAND",
    signalCode: "LAND-POLLUTION",
    headline: "Site added to the brownfield register with contamination noted",
    detail:
      "The refreshed dataset registers the site itself as brownfield land with contamination constraints recorded and no remediation evidence.",
    dataset: "planning-data",
    url: PLANNING_URL,
  },
  {
    kind: "material_adverse",
    severity: "red",
    dimensionCode: "MARKET",
    signalCode: "MARKET-ANOMALY",
    headline: "Cluster of sub-index sales recorded in the postcode",
    detail:
      "Three new Price Paid entries in the postcode completed at 45–60% below the local index — consistent with distressed disposals or unrecorded defects.",
    dataset: "land-registry-price-paid",
    url: "https://landregistry.data.gov.uk/data/ppi/transaction-record.json",
  },
];

export const EVIDENCE_UPDATES: EvidenceUpdate[] = SPECS.map((spec, i) => feed(spec, i + 1));
