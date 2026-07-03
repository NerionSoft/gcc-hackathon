import { z } from "zod";

/**
 * Optional, user-supplied listing details for the specific property being
 * evaluated — not part of the profile (lifestyle), but needed to compute a
 * price-per-m² we can actually compare against the DVF sector median. Without
 * this, "overvalued given a poor DPE" is not a computable claim, only a
 * neighborhood-level observation.
 */
export const propertyListingSchema = z.object({
  askingPrice: z.number().positive().optional(),
  askingSurface: z.number().positive().optional(),
});
export type PropertyListing = z.infer<typeof propertyListingSchema>;

export function askingPriceM2(listing: PropertyListing): number | null {
  if (!listing.askingPrice || !listing.askingSurface) return null;
  return listing.askingPrice / listing.askingSurface;
}
