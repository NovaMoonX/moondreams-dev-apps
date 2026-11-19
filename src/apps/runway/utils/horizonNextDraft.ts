import { toDateInputValue, fromDateInputValue } from '@/utils/dateInputUtils';
import { centsToInputValue, parseMoneyToCents } from '@/utils/moneyUtils';
import { FORM_FLOW_WORDS, HORIZON_NEXT_WORDS } from '@apps/runway/constants';
import { addUtcMonths } from '@apps/runway/engine/dates';
import {
  getNextHorizon,
  listCarriedCosts,
  type CostPaidEntry,
  type NextHorizonPlan,
} from '@apps/runway/engine/horizon';
import type { HorizonSealed, MoneyRange } from '@apps/runway/types';
import { getPaysStartBlocker } from '@apps/runway/utils/horizonText';

export const NEXT_LAST_DATE_MONTHS = 120;

/** What the person has typed for the next event: its day, when saving starts and each copied cost's amount, by the earlier event's cost id. */
export interface NextDraft {
  date: string;
  startsOn: number | null;
  amounts: Record<string, { low: string; high: string }>;
}

export const makeNextDraft = (
  horizon: HorizonSealed,
  paid: readonly CostPaidEntry[],
  today: number,
): NextDraft => {
  const lastDate = addUtcMonths(today, NEXT_LAST_DATE_MONTHS);
  const yearOn = addUtcMonths(horizon.happensOn, 12);
  const start =
    horizon.state === 'calledOff' && horizon.happensOn >= today
      ? horizon.happensOn
      : yearOn;
  return {
    date: toDateInputValue(Math.min(Math.max(start, today), lastDate)),
    startsOn: null,
    amounts: Object.fromEntries(
      listCarriedCosts(horizon, paid).map(({ cost, amount }) => [
        cost.id,
        {
          low: centsToInputValue(amount.lowCents),
          high: centsToInputValue(amount.highCents),
        },
      ]),
    ),
  };
};

/** The plan the draft stands for, or why it can't be used yet. */
export const readNextDraft = (
  draft: NextDraft,
  horizon: HorizonSealed,
  paid: readonly CostPaidEntry[],
  today: number,
): { plan: NextHorizonPlan | null; blocker: string | null } => {
  const happensOn = fromDateInputValue(draft.date);
  if (happensOn === undefined || happensOn < today) {
    return { plan: null, blocker: FORM_FLOW_WORDS.pastDay };
  }
  if (happensOn > addUtcMonths(today, NEXT_LAST_DATE_MONTHS)) {
    return { plan: null, blocker: HORIZON_NEXT_WORDS.tooFar };
  }
  const read = listCarriedCosts(horizon, paid).map(({ cost }) => {
    const typed = draft.amounts[cost.id];
    const range = cost.amount.lowCents !== cost.amount.highCents;
    const low = typed ? parseMoneyToCents(typed.low) : null;
    const high = range && typed ? parseMoneyToCents(typed.high) : low;
    return [
      cost.id,
      low === null || high === null
        ? null
        : { lowCents: Math.min(low, high), highCents: Math.max(low, high) },
    ] as const;
  });
  if (read.some(([, amount]) => amount === null)) {
    return { plan: null, blocker: HORIZON_NEXT_WORDS.needsAmount };
  }
  const startsOn =
    draft.startsOn !== null && draft.startsOn > today ? draft.startsOn : null;
  const plan: NextHorizonPlan = {
    happensOn,
    startsOn,
    today,
    amounts: Object.fromEntries(
      read.flatMap(([id, amount]) => (amount ? [[id, amount]] : [])),
    ) as Record<string, MoneyRange>,
  };
  return {
    plan,
    blocker: getPaysStartBlocker(
      getNextHorizon(horizon, paid, '', plan).costs,
      startsOn,
    ),
  };
};
