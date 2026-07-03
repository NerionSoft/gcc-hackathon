const GBP_COMPACT = new Intl.NumberFormat("en-GB", {
  style: "currency",
  currency: "GBP",
  notation: "compact",
  maximumFractionDigits: 1,
});

const GBP_FULL = new Intl.NumberFormat("en-GB", {
  style: "currency",
  currency: "GBP",
  maximumFractionDigits: 0,
});

const INT = new Intl.NumberFormat("en-GB");

export function formatGBPCompact(value: number): string {
  return GBP_COMPACT.format(value);
}

export function formatGBP(value: number): string {
  return GBP_FULL.format(value);
}

export function formatInt(value: number): string {
  return INT.format(value);
}

/** "2026-07-03T13:35:36.721Z" → "2026-07-03 13:35 UTC" (mono-friendly). */
export function formatTimestamp(iso: string): string {
  const match = iso.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/);
  return match ? `${match[1]} ${match[2]} UTC` : iso;
}
