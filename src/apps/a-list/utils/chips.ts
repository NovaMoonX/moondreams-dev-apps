import { MAX_FEE_CHIPS, MAX_TAX_CHIPS } from '@apps/a-list/constants';
import type { Viewing } from '@apps/a-list/types';

/** Five decimals, so a three-decimal percent like 8.875% survives. */
function roundRate(rate: number) {
  return Math.round(rate * 100_000) / 100_000;
}

/** $0 first, then the distinct fees entered before, most recent showing first. */
export function getFeeChips(viewings: Viewing[]): number[] {
  const fees = viewings
    .filter((viewing) => viewing.ticket)
    .sort((left, right) => right.showtimeAt - left.showtimeAt)
    .map((viewing) => viewing.ticket!.feeAvoidedCents);
  const result = Array.from(new Set([0, ...fees])).slice(0, MAX_FEE_CHIPS);
  return result;
}

interface RateUse {
  rate: number;
  count: number;
  lastUsedAt: number;
}

/**
 * The rates used on past tickets plus the membership's gauged rate. The default is the most-used
 * rate (ties to the most recent), else the membership's, else none.
 */
export function getTaxRateChips(
  viewings: Viewing[],
  membershipRate: number | null,
): { chips: number[]; defaultRate: number | null } {
  const uses = viewings.reduce<Record<string, RateUse>>((byRate, viewing) => {
    const rate = viewing.ticket?.taxRate;
    if (rate === null || rate === undefined) return byRate;
    const key = roundRate(rate).toString();
    const previous = byRate[key];
    return {
      ...byRate,
      [key]: {
        rate: roundRate(rate),
        count: (previous?.count ?? 0) + 1,
        lastUsedAt: Math.max(previous?.lastUsedAt ?? 0, viewing.showtimeAt),
      },
    };
  }, {});
  const byUse = Object.values(uses).sort(
    (left, right) =>
      right.count - left.count || right.lastUsedAt - left.lastUsedAt,
  );
  const byRecency = [...byUse]
    .sort((left, right) => right.lastUsedAt - left.lastUsedAt)
    .map((use) => use.rate);
  const seededRate = membershipRate === null ? null : roundRate(membershipRate);
  const defaultRate = byUse[0]?.rate ?? seededRate;
  const ordered = [defaultRate, ...byRecency, seededRate].filter(
    (rate): rate is number => rate !== null,
  );
  const result = {
    chips: Array.from(new Set(ordered)).slice(0, MAX_TAX_CHIPS),
    defaultRate,
  };
  return result;
}
