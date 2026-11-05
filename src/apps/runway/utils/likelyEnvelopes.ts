import type { OpenPurchase } from '@apps/runway/types';

const normalize = (merchant: string | null) =>
  merchant?.trim().toLowerCase() || null;

/** Envelopes a waiting purchase probably belongs in: where the same merchant went before, most often first, then the rest in plan order. */
export function rankLikelyEnvelopes(
  merchant: string | null,
  history: readonly OpenPurchase[],
  envelopeIds: readonly string[],
  limit: number,
): string[] {
  const wanted = normalize(merchant);
  const known = new Set(envelopeIds);
  const counts = history.reduce<Map<string, number>>((acc, purchase) => {
    const [line] = purchase.lines;
    if (
      wanted === null ||
      purchase.needsHome ||
      purchase.lines.length !== 1 ||
      line.envelopeId === null ||
      !known.has(line.envelopeId) ||
      normalize(purchase.merchant) !== wanted
    ) {
      return acc;
    }
    return acc.set(line.envelopeId, (acc.get(line.envelopeId) ?? 0) + 1);
  }, new Map());
  const seen = [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([id]) => id);
  const result = [
    ...seen,
    ...envelopeIds.filter((id) => !counts.has(id)),
  ].slice(0, limit);
  return result;
}
