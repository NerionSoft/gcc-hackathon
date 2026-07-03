import { randomUUID } from "node:crypto";
import { getDb } from "@/db/client";
import { appendAuditEvent } from "@/db/access/audit";
import { getProperty, insertProperty, listProperties } from "@/db/access/properties";
import { listSignalsForProperty } from "@/db/access/signals";
import type { Property, RiskSignal } from "@/db/schema";
import { computeVerdict, type VerdictComputation } from "@/mastra/engine/adjudication";
import { scanProperties, type ScanSummary } from "@/mastra/engine/scan";
import { DomainError } from "@/shared/errors/domain-error";

/**
 * F0 — single-property lookup, the civic front door. A single property is a
 * portfolio of one: it resolves the query to a Property (seeded or new) and
 * runs the SAME scanPortfolio engine on a list of 1, then the SAME verdict
 * engine. No duplicated logic.
 */

export class UnresolvableAddressError extends DomainError {
  constructor(query: string) {
    super(
      "UNRESOLVABLE_ADDRESS",
      `Could not resolve "${query}" to a property. Use an address or a UK postcode inside ` +
        "the demo's covered local authorities (Hull, Great Yarmouth, Middlesbrough, " +
        "Stoke-on-Trent, Islington, Brighton and Hove).",
    );
  }
}

const UK_POSTCODE_RE = /\b([A-Z]{1,2}\d[A-Z\d]?)\s*(\d[A-Z]{2})\b/i;
const UK_DISTRICT_RE = /\b([A-Z]{1,2}\d[A-Z\d]?)\b/i;

interface PropertyRowLite {
  id: string;
}

/** Resolve an address / postcode / listing text to a Property (seeded or new). */
export function resolveProperty(query: string): Property {
  const q = query.trim();
  if (!q) throw new UnresolvableAddressError(query);
  const db = getDb();

  // 1. Exact id (deep links from the UI).
  const byId = getProperty(q);
  if (byId) return byId;

  // 2. Address / postcode match among the seeded portfolio.
  const like = `%${q.replace(/[%_]/g, "")}%`;
  const row = db
    .prepare(
      `SELECT id FROM properties
       WHERE address LIKE ? OR postcode LIKE ? OR REPLACE(postcode, ' ', '') = REPLACE(?, ' ', '')
       ORDER BY provenance = 'real_open_data' DESC, id LIMIT 1`,
    )
    .get(like, like, q.toUpperCase()) as PropertyRowLite | undefined;
  if (row) {
    const found = getProperty(row.id);
    if (found) return found;
  }

  // 3. New property: needs at least a postcode district we can geolocate
  //    from the seeded cohort (no external geocoder in the demo).
  const postcodeMatch = q.toUpperCase().match(UK_POSTCODE_RE);
  const districtMatch = postcodeMatch?.[1] ?? q.toUpperCase().match(UK_DISTRICT_RE)?.[1];
  if (!districtMatch) throw new UnresolvableAddressError(query);

  const neighbours = listProperties({ limit: 5000 }).filter((p) =>
    p.postcode.toUpperCase().startsWith(`${districtMatch} `) ||
    p.postcode.toUpperCase().startsWith(districtMatch),
  );
  if (neighbours.length === 0) throw new UnresolvableAddressError(query);

  const lat = neighbours.reduce((s, p) => s + p.lat, 0) / neighbours.length;
  const lng = neighbours.reduce((s, p) => s + p.lng, 0) / neighbours.length;
  const localAuthority = neighbours[0]?.localAuthority ?? "Unknown";

  const property = insertProperty({
    id: `lookup-${randomUUID().slice(0, 8)}`,
    uprn: null,
    address: q,
    postcode: postcodeMatch ? `${postcodeMatch[1]} ${postcodeMatch[2]}` : districtMatch,
    localAuthority,
    lat,
    lng,
    propertyType: "residential",
    tenure: "unknown",
    value: 0,
    intendedUse: "Single-property civic lookup",
    capitalType: "community",
    status: "unscanned",
    provenance: "real_open_data",
  });
  appendAuditEvent({
    actor: "user:nadia",
    action: "property_lookup_created",
    entityType: "Property",
    entityId: property.id,
    rationale:
      `Single-property lookup created "${q}" (geolocated from ${neighbours.length} seeded ` +
      `neighbours in district ${districtMatch}). It will be investigated live by the six agents.`,
  });
  return property;
}

export interface LookupDossier {
  property: Property;
  signals: RiskSignal[];
  verdict: Pick<VerdictComputation, "verdict" | "escalationReason" | "rationale">;
  /** Material sourced risks a listing would not volunteer (F0's key section). */
  whatTheListingDoesntMention: RiskSignal[];
  scan: ScanSummary | null;
}

/** Full sourced dossier for one query — the same engine end to end. */
export async function lookupProperty(query: string): Promise<LookupDossier> {
  const property = resolveProperty(query);

  // A portfolio of one, through the very same scan engine.
  const scan =
    property.status === "unscanned" ? await scanProperties([property.id]) : null;

  const refreshed = getProperty(property.id) ?? property;
  const signals = listSignalsForProperty(property.id);
  const { verdict, escalationReason, rationale } = await computeVerdict(signals, {
    withLlm: refreshed.provenance === "real_open_data",
  });

  appendAuditEvent({
    actor: "agent",
    action: "lookup_dossier_served",
    entityType: "Property",
    entityId: property.id,
    rationale:
      `Single-property dossier: ${signals.length} sourced signals, composite verdict ${verdict}.`,
    payloadSnapshot: { query, verdict, escalationReason },
  });

  return {
    property: refreshed,
    signals,
    verdict: { verdict, escalationReason, rationale },
    whatTheListingDoesntMention: signals.filter((s) => s.severity !== "green"),
    scan,
  };
}
