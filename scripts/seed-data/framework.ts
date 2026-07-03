import type { RiskFramework } from "@/db/schema";

/**
 * "Civic Property Risk v1" — the expert-validated playbook (spec §3):
 * 6 dimensions, each with signal definitions that name the open source
 * answering them (with licence) and a severity rubric in plain British
 * English. This is what Nadia has signed off; investigator agents cite it.
 */
export const CIVIC_PROPERTY_RISK_V1: RiskFramework = {
  id: "framework-cpr-v1",
  name: "Civic Property Risk v1",
  version: "1.0.0",
  effectiveDate: "2026-07-01T00:00:00.000Z",
  dimensions: [
    {
      id: "dim-building",
      code: "BUILDING",
      title: "Building",
      description:
        "The structure itself: planning permissions and enforcement, energy performance, heritage constraints, works history and defects.",
      signals: [
        {
          id: "sigdef-building-permit",
          dimensionCode: "BUILDING",
          code: "BUILDING-PERMIT",
          title: "Planning permissions & constraints",
          description:
            "Planning designations and applications affecting the building: article 4 directions, enforcement notices, unimplemented or refused permissions.",
          source: {
            dataset: "planning-data",
            endpoint: "https://www.planning.data.gov.uk/entity.json",
            licence: "OGL v3.0",
          },
          method:
            "Point-intersect the property coordinates against national planning datasets (article 4, conservation area, TPO zones); review returned entities deterministically.",
          severityRubric: {
            green: "No restrictive designations or open enforcement matters at the location.",
            amber:
              "Restrictive designations present (article 4 direction, tree preservation zone) that constrain works or conversion.",
            red: "Evidence of enforcement action, unauthorised works, or a refused permission material to the intended use.",
          },
        },
        {
          id: "sigdef-building-energy",
          dimensionCode: "BUILDING",
          code: "BUILDING-ENERGY",
          title: "Energy performance",
          description:
            "Latest Energy Performance Certificate band and retrofit exposure for the building.",
          source: {
            dataset: "epc-domestic",
            endpoint: "https://epc.opendatacommunities.org/api/v1/domestic/search",
            licence: "OGL v3.0 (EPC data © Crown copyright)",
          },
          method:
            "Look up the most recent certificate for the address; compare the current band against the minimum energy efficiency standard.",
          severityRubric: {
            green: "Current EPC band A–D, or a valid exemption is registered.",
            amber: "Current EPC band E, or certificate more than ten years old.",
            red: "Current EPC band F or G — below the minimum standard for lettings; material retrofit liability.",
          },
        },
        {
          id: "sigdef-building-heritage",
          dimensionCode: "BUILDING",
          code: "BUILDING-HERITAGE",
          title: "Heritage constraints",
          description:
            "Listed-building status and conservation-area membership limiting alterations and raising repair costs.",
          source: {
            dataset: "planning-data",
            endpoint: "https://www.planning.data.gov.uk/entity.json",
            licence: "OGL v3.0",
          },
          method:
            "Point-intersect against listed-building outlines and conservation areas on the national planning data platform.",
          severityRubric: {
            green: "No listing and no conservation-area membership.",
            amber: "Inside a conservation area, or adjoining a listed structure.",
            red: "The building itself is listed and the intended use requires alterations likely to need listed-building consent.",
          },
        },
      ],
    },
    {
      id: "dim-unit",
      code: "UNIT",
      title: "Unit",
      description:
        "The specific unit's lived exposure: environmental noise, resale history and turnover.",
      signals: [
        {
          id: "sigdef-unit-noise",
          dimensionCode: "UNIT",
          code: "UNIT-NOISE",
          title: "Environmental noise exposure",
          description: "Strategic road-noise mapping (Lden) at the unit's location.",
          source: {
            dataset: "defra-road-noise-lden-round-3",
            endpoint:
              "https://environment.data.gov.uk/spatialdata/road-noise-lden-england-round-3/wfs",
            licence: "OGL v3.0",
          },
          method:
            "Intersect the location with Defra round-3 Lden noise bands; take the loudest band touching the unit.",
          severityRubric: {
            green: "Outside mapped bands (below 55 dB Lden).",
            amber: "Mapped band 60.0–69.9 dB Lden at the facade.",
            red: "Mapped band 70 dB Lden or above — major-road exposure likely to affect habitability and value.",
          },
        },
        {
          id: "sigdef-unit-resale",
          dimensionCode: "UNIT",
          code: "UNIT-RESALE",
          title: "Resale history & turnover",
          description:
            "Transaction history for the unit and its postcode: rapid flips and repeated short-hold sales are weak signals of hidden defects.",
          source: {
            dataset: "land-registry-price-paid",
            endpoint: "https://landregistry.data.gov.uk/data/ppi/transaction-record.json",
            licence: "OGL v3.0",
          },
          method:
            "Pull Price Paid transactions for the address and postcode; compute holding periods and price paths deterministically.",
          severityRubric: {
            green: "Normal holding periods; price path consistent with the local index.",
            amber:
              "Two sales within three years, or a sale at a marked discount to the prior price.",
            red: "Multiple rapid resales (three or more within five years) or a distressed-level discount on the latest sale.",
          },
        },
      ],
    },
    {
      id: "dim-block",
      code: "BLOCK",
      title: "Block",
      description:
        "The immediate surroundings: public incidents and crime, local schools and civic amenities.",
      signals: [
        {
          id: "sigdef-block-incident",
          dimensionCode: "BLOCK",
          code: "BLOCK-INCIDENT",
          title: "Public incidents & crime",
          description:
            "Street-level incident volumes and mix around the block, from published police data.",
          source: {
            dataset: "police-uk-street-crime",
            endpoint: "https://data.police.uk/api/crimes-street/all-crime",
            licence: "OGL v3.0",
          },
          method:
            "Count incidents within a one-mile radius for the latest published month; compare the burglary/criminal-damage share against the area baseline.",
          severityRubric: {
            green: "Incident volume at or below the local-authority norm for the month.",
            amber: "Volume noticeably above the norm, or a rising burglary/criminal-damage share.",
            red: "Sustained hotspot: volumes well above the norm across categories relevant to habitability.",
          },
        },
        {
          id: "sigdef-block-school",
          dimensionCode: "BLOCK",
          code: "BLOCK-SCHOOL",
          title: "Schools & civic amenities",
          description:
            "Presence and status of schools serving the block — a due-diligence fact for family-housing use, never a people-profiling input.",
          source: {
            dataset: "dfe-gias-establishments",
            endpoint: "https://get-information-schools.service.gov.uk/Downloads",
            licence: "OGL v3.0",
          },
          method:
            "List open establishments in the postcode district from the GIAS register; note closures or absence for family-housing scenarios.",
          severityRubric: {
            green: "Open schools present in the district appropriate to the intended use.",
            amber: "Nearest relevant school recently closed or converted; provision thinning.",
            red: "No open provision within the district for a family-housing intended use.",
          },
        },
      ],
    },
    {
      id: "dim-people",
      code: "PEOPLE",
      title: "People (ownership & control)",
      description:
        "Who controls the asset: corporate and offshore ownership, insolvency and public disputes. Facts about legal entities and control — never about residents.",
      signals: [
        {
          id: "sigdef-people-owner",
          dimensionCode: "PEOPLE",
          code: "PEOPLE-OWNER",
          title: "Ownership & control transparency",
          description:
            "Whether the registered proprietor's control chain can be resolved from public registers (Companies House, CCOD/OCOD).",
          source: {
            dataset: "land-registry-ccod-ocod",
            endpoint: "https://use-land-property-data.service.gov.uk/api/v1/datasets",
            licence: "HM Land Registry Free Datasets Licence",
          },
          method:
            "Match the proprietor against CCOD/OCOD and Companies House; walk the control chain through public filings only.",
          severityRubric: {
            green: "Named UK proprietor with a resolvable control chain in public filings.",
            amber:
              "Corporate vehicle whose beneficial control cannot be fully resolved from public filings.",
            red: "Overseas-registered proprietor (OCOD) with unresolved control, or control chain routed through secrecy jurisdictions.",
          },
        },
        {
          id: "sigdef-people-litigation",
          dimensionCode: "PEOPLE",
          code: "PEOPLE-LITIGATION",
          title: "Insolvency & public disputes",
          description:
            "Insolvency events, striking-off, charges and public disputes attached to the proprietor entity.",
          source: {
            dataset: "companies-house-register",
            endpoint: "https://api.company-information.service.gov.uk",
            licence: "OGL v3.0 (Companies House public register)",
          },
          method:
            "Review the proprietor's Companies House record: status, insolvency history, outstanding charges, gazette notices.",
          severityRubric: {
            green: "Active proprietor entity with clean filing history.",
            amber: "Late filings, outstanding charges, or a recent gazette first notice.",
            red: "Live insolvency, liquidation, or striking-off proceedings against the proprietor.",
          },
        },
      ],
    },
    {
      id: "dim-land",
      code: "LAND",
      title: "Land",
      description:
        "The ground under the asset: flood risk, soil and ground stability, contamination legacy.",
      signals: [
        {
          id: "sigdef-land-flood",
          dimensionCode: "LAND",
          code: "LAND-FLOOD",
          title: "Flood exposure",
          description:
            "Membership of Environment Agency flood alert/warning areas and any live warnings.",
          source: {
            dataset: "ea-flood-monitoring",
            endpoint: "https://environment.data.gov.uk/flood-monitoring",
            licence: "OGL v3.0",
          },
          method:
            "Check flood alert/warning areas within 3 km and live warnings within 5 km of the location via the EA real-time API.",
          severityRubric: {
            green: "No alert or warning area covers the location.",
            amber: "Inside a flood alert area, without recent warning activations.",
            red: "Inside a flood warning area, or a live warning in force nearby.",
          },
        },
        {
          id: "sigdef-land-soil",
          dimensionCode: "LAND",
          code: "LAND-SOIL",
          title: "Ground & soil hazards",
          description:
            "Radon potential (open BGS layer) and ground-stability context. GeoSure shrink–swell has no open endpoint and is reported as a data gap when unavailable.",
          source: {
            dataset: "bgs-radon-indicative-atlas",
            endpoint: "https://map.bgs.ac.uk/arcgis/rest/services/GeoIndex_Onshore/radon/MapServer",
            licence: "Contains British Geological Survey materials © UKRI",
          },
          method:
            "Identify the 1 km radon grid square at the location; report ground-stability as a data gap where no open layer exists.",
          severityRubric: {
            green: "Radon class 1–2 and no known ground-hazard indicators.",
            amber:
              "Radon class 3–4, or unresolved ground-stability data gap on clay-prone geology.",
            red: "Radon class 5–6 (protective measures required), or documented ground-instability at the site.",
          },
        },
        {
          id: "sigdef-land-pollution",
          dimensionCode: "LAND",
          code: "LAND-POLLUTION",
          title: "Contamination legacy",
          description:
            "Brownfield registrations and contaminated-land context from the planning register.",
          source: {
            dataset: "planning-data",
            endpoint: "https://www.planning.data.gov.uk/entity.json",
            licence: "OGL v3.0",
          },
          method:
            "Point-intersect brownfield-land/brownfield-site datasets; review remediation conditions in linked planning records.",
          severityRubric: {
            green: "No brownfield registration at or adjoining the site.",
            amber:
              "Adjoining brownfield registration, or historic industrial use without recorded remediation.",
            red: "The site itself is a registered brownfield/contaminated plot without evidenced remediation.",
          },
        },
      ],
    },
    {
      id: "dim-market",
      code: "MARKET",
      title: "Market",
      description:
        "Price behaviour and liquidity: anomalies against the local index, transaction depth, rental stress.",
      signals: [
        {
          id: "sigdef-market-anomaly",
          dimensionCode: "MARKET",
          code: "MARKET-ANOMALY",
          title: "Price anomaly vs local index",
          description:
            "The committed value against the UK House Price Index for the local authority.",
          source: {
            dataset: "uk-house-price-index",
            endpoint: "https://landregistry.data.gov.uk/data/ukhpi",
            licence: "OGL v3.0",
          },
          method:
            "Compare the scenario value with the LA average price and 12-month change from UKHPI; flag deviations deterministically.",
          severityRubric: {
            green: "Within ±20% of the local-authority average for the property type.",
            amber: "20–40% deviation from the local average without an evidenced explanation.",
            red: "More than 40% deviation — potential mispricing, incentive distortion or data error.",
          },
        },
        {
          id: "sigdef-market-liquidity",
          dimensionCode: "MARKET",
          code: "MARKET-LIQUIDITY",
          title: "Liquidity & transaction depth",
          description:
            "Sales-volume trend for the local authority — thin markets exit slowly and reprice sharply.",
          source: {
            dataset: "uk-house-price-index",
            endpoint: "https://landregistry.data.gov.uk/data/ukhpi",
            licence: "OGL v3.0",
          },
          method: "Read UKHPI monthly sales volumes for the LA; compare against the trailing year.",
          severityRubric: {
            green: "Stable or rising volumes over the trailing year.",
            amber: "Volumes down by a quarter or more against the trailing year.",
            red: "Volumes down by half or more — thin exit market for the capital committed.",
          },
        },
        {
          id: "sigdef-market-rent",
          dimensionCode: "MARKET",
          code: "MARKET-RENT",
          title: "Rental stress",
          description:
            "Regional private-rent index trajectory versus the national path — sharp rent inflation stresses tenancy sustainability for community and social uses.",
          source: {
            dataset: "ons-private-housing-rental-prices",
            endpoint: "https://api.beta.ons.gov.uk/v1/datasets/index-private-housing-rental-prices",
            licence: "OGL v3.0",
          },
          method:
            "Read the IPHRP index for the English region; compare 12-month growth against the national figure.",
          severityRubric: {
            green: "Regional rent growth at or below the national rate.",
            amber: "Regional rent growth up to three points above the national rate.",
            red: "Regional rent growth more than three points above the national rate — affordability stress for the intended community use.",
          },
        },
      ],
    },
  ],
};
