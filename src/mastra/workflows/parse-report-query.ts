import {
  addressSchema,
  userProfileSchema,
  propertyListingSchema,
  type Address,
  type UserProfile,
  type PropertyListing,
} from "@/types";

export interface ReportQueryInput {
  address: Address;
  profile: UserProfile;
  listing: PropertyListing;
}

/** Shared by the streaming and PDF report routes — both take the exact same query shape. */
export function parseReportQuery(searchParams: URLSearchParams): ReportQueryInput {
  const get = (key: string) => searchParams.get(key) ?? undefined;

  const address = addressSchema.parse({
    label: get("label"),
    lat: Number(get("lat")),
    lon: Number(get("lon")),
    citycode: get("citycode"),
    postcode: get("postcode"),
    city: get("city"),
    street: get("street"),
    housenumber: get("housenumber"),
    score: Number(get("score") ?? "1"),
    type: get("type") ?? "housenumber",
  });

  const tagsParam = get("tags");
  const profile = userProfileSchema.parse({
    tags: tagsParam ? tagsParam.split(",") : [],
    propertyType: get("propertyType") ?? "inconnu",
  });

  const listing = propertyListingSchema.parse({
    askingPrice: get("askingPrice") ? Number(get("askingPrice")) : undefined,
    askingSurface: get("askingSurface") ? Number(get("askingSurface")) : undefined,
  });

  return { address, profile, listing };
}
