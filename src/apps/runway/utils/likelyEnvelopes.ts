import { toComparable } from '@/utils/optionMatchUtils';
import type { OpenPurchase } from '@apps/runway/types';

/** Envelopes this merchant was put in before, most often first, then most recent; never padded with envelopes it has not been in. */
export function rankLikelyEnvelopes(
  merchant: string | null,
  history: readonly OpenPurchase[],
  envelopeIds: readonly string[],
  limit: number,
): string[] {
  const wanted = merchant ? toComparable(merchant) : '';
  if (wanted === '') return [];
  const known = new Set(envelopeIds);
  const stats = history.reduce<Map<string, { count: number; latest: number }>>(
    (acc, purchase) => {
      const [line] = purchase.lines;
      if (
        purchase.needsHome ||
        purchase.lines.length !== 1 ||
        line.envelopeId === null ||
        !known.has(line.envelopeId) ||
        toComparable(purchase.merchant ?? '') !== wanted
      ) {
        return acc;
      }
      const seen = acc.get(line.envelopeId);
      return acc.set(line.envelopeId, {
        count: (seen?.count ?? 0) + 1,
        latest: Math.max(seen?.latest ?? 0, purchase.date),
      });
    },
    new Map(),
  );
  return [...stats.entries()]
    .sort((a, b) => b[1].count - a[1].count || b[1].latest - a[1].latest)
    .map(([id]) => id)
    .slice(0, limit);
}
