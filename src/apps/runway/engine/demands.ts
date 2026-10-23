import type { DRAFT_TIE_KEYS, FUNDING_CADENCES } from '@apps/runway/constants';
import type {
  Cents,
  DateOnly,
  FundingRule,
  MoneyRange,
  Priority,
} from '@apps/runway/types';

import { selectFundedDays } from './schedule';

export type DraftCadence = (typeof FUNDING_CADENCES)[number];
export type DraftTieKey = (typeof DRAFT_TIE_KEYS)[number];

export interface DraftDayInput {
  dayKey: string;
  sourceId: string | null;
  on: DateOnly;
  amount: MoneyRange;
}

export interface DraftEnvelopeInput {
  itemId: string;
  createdAt: number;
  priority: Priority;
  orderIndex: number;
  funding: FundingRule;
}

/** What one day owes one envelope before the money is walked. */
export interface Demand {
  dayKey: string;
  itemId: string;
  tier: Priority;
  dueBeforeNext: boolean;
  orderIndex: number;
  createdAt: number;
  cents: Cents;
  cadence: DraftCadence;
}

export const TIER_RANK: Record<Priority, number> = {
  must: 0,
  should: 1,
  want: 2,
};

/** Code-unit order, so a sort never depends on the viewer's locale. */
export const compareText = (a: string, b: string) =>
  a < b ? -1 : a > b ? 1 : 0;

export const compareDays = (
  a: { on: number; dayKey: string },
  b: { on: number; dayKey: string },
) => a.on - b.on || compareText(a.dayKey, b.dayKey);

/** The order demands are funded in; the last two keys only separate items, so they are never "ties". */
export const compareDemands = (a: Demand, b: Demand) =>
  TIER_RANK[a.tier] - TIER_RANK[b.tier] ||
  Number(b.dueBeforeNext) - Number(a.dueBeforeNext) ||
  a.orderIndex - b.orderIndex ||
  a.createdAt - b.createdAt ||
  compareText(a.itemId, b.itemId);

const cadenceCode = (cadence: FundingRule['cadence']): DraftCadence => {
  if (cadence.kind === 'everyNth') return cadence.n === 2 ? 'every2' : 'every3';
  return cadence.kind === 'chosen' ? 'chosen' : 'everyIncomeDay';
};

/** What each planned day owes: an envelope asks for its amount on every day its cadence selects, counted over the plan-wide income days. */
export function buildDemands(
  days: readonly DraftDayInput[],
  incomeDays: readonly { dayKey: string; on: number }[],
  envelopes: readonly DraftEnvelopeInput[],
): Demand[] {
  const planned = new Set(days.map((day) => day.dayKey));
  const chronological = [...incomeDays].sort(compareDays);

  const result = envelopes.flatMap((envelope) =>
    selectFundedDays(envelope.funding.cadence, chronological)
      .filter((day) => planned.has(day.dayKey))
      .map((day): Demand => ({
        dayKey: day.dayKey,
        itemId: envelope.itemId,
        tier: envelope.priority,
        dueBeforeNext: false,
        orderIndex: envelope.orderIndex,
        createdAt: envelope.createdAt,
        cents: envelope.funding.amount.cents,
        cadence: cadenceCode(envelope.funding.cadence),
      })),
  );
  return result;
}
