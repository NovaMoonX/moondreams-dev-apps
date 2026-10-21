import { MAX_FEE_CHIPS, MAX_TAX_CHIPS } from '@apps/a-list/constants';
import type { AmcFormat, Viewing } from '@apps/a-list/types';
import { getItemizedTaxCents } from '@apps/a-list/utils/tax';

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

/** What a new ticket starts with: the fee and tax rate the member's own past tickets at this theater point to. */
export interface TicketSuggestion {
  feeCents: number;
  /** The fee came from tickets in this format at this theater, not the fallback. */
  isFeeLearned: boolean;
  taxRate: number | null;
  /** The rate came from tickets at this theater. */
  isTaxLearned: boolean;
}

function getMostUsed(uses: { value: number; at: number }[]): number | null {
  const byValue = uses.reduce<Record<string, { count: number; at: number }>>(
    (acc, use) => ({
      ...acc,
      [use.value]: {
        count: (acc[use.value]?.count ?? 0) + 1,
        at: Math.max(acc[use.value]?.at ?? 0, use.at),
      },
    }),
    {},
  );
  const best = Object.entries(byValue).sort(
    ([, left], [, right]) => right.count - left.count || right.at - left.at,
  )[0];
  const result = best ? Number(best[0]) : null;
  return result;
}

/** A ticket's rate is rounded from its tax amount, so tickets at one theater disagree slightly; the best rate is the one that reproduces the most past tax amounts. */
function getBestFittingRate(taxed: Viewing[]): number | null {
  const candidates = Array.from(
    new Set(taxed.map((viewing) => roundRate(viewing.ticket!.taxRate!))),
  );
  const scored = candidates.map((rate) => ({
    rate,
    hits: taxed.filter(
      (viewing) =>
        getItemizedTaxCents(viewing.ticket!.priceCents, rate) ===
        viewing.ticket!.taxCents,
    ).length,
    at: Math.max(
      ...taxed
        .filter((viewing) => roundRate(viewing.ticket!.taxRate!) === rate)
        .map((viewing) => viewing.showtimeAt),
    ),
  }));
  const best = scored.sort(
    (left, right) => right.hits - left.hits || right.at - left.at,
  )[0];
  const result = best?.rate ?? null;
  return result;
}

/**
 * Tax follows the theater (it's a local rate) and the fee follows the theater and format (premium
 * formats charge more). Both take the most-used value, ties to the most recent. With no history the
 * fee falls back to `fallbackFeeCents` and the tax stays unknown.
 */
export function getTicketSuggestion(
  viewings: Viewing[],
  theatreId: string | null,
  format: AmcFormat,
  fallbackFeeCents: number,
): TicketSuggestion {
  const here = viewings.filter(
    (viewing) =>
      theatreId !== null &&
      viewing.ticket &&
      viewing.theatre?.theatreId === theatreId,
  );
  const learnedFee = getMostUsed(
    here
      .filter((viewing) => viewing.ticket!.format === format)
      .map((viewing) => ({
        value: viewing.ticket!.feeAvoidedCents,
        at: viewing.showtimeAt,
      })),
  );
  const taxed = here.filter((viewing) => viewing.ticket!.taxRate !== null);
  const learnedRate = getBestFittingRate(taxed);
  const result = {
    feeCents: learnedFee ?? fallbackFeeCents,
    isFeeLearned: learnedFee !== null,
    taxRate: learnedRate,
    isTaxLearned: learnedRate !== null,
  };
  return result;
}
