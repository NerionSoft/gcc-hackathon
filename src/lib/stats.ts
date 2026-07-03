export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

export type Trend = "hausse" | "baisse" | "stable";

/**
 * Splits a 5-year transaction window into "last 2 years" vs. "3 years
 * before that" and compares medians — used to check whether a repeated
 * risk history (CatNat) is actually showing up in local prices, without
 * needing an external market-trend source.
 */
export function priceTrendFromTransactions(
  transactions: { dateMutation: string; prixM2: number | null }[],
  now: Date = new Date(),
): Trend | null {
  const cutoff = new Date(now);
  cutoff.setFullYear(cutoff.getFullYear() - 2);

  const recent: number[] = [];
  const older: number[] = [];
  for (const t of transactions) {
    if (t.prixM2 === null) continue;
    const date = new Date(t.dateMutation);
    if (Number.isNaN(date.getTime())) continue;
    (date >= cutoff ? recent : older).push(t.prixM2);
  }
  if (recent.length < 3 || older.length < 3) return null;

  const recentMedian = median(recent)!;
  const olderMedian = median(older)!;
  const relative = olderMedian > 0 ? (recentMedian - olderMedian) / olderMedian : 0;
  if (relative > 0.05) return "hausse";
  if (relative < -0.05) return "baisse";
  return "stable";
}
