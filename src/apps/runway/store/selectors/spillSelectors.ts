import type { RootState } from '@/store';
import { todayAsUtcDate } from '@apps/runway/engine/dates';
import { getCountedFrom } from '@apps/runway/engine/purchases';
import { getSpilledLines as spillLines } from '@apps/runway/engine/spill';
import { selectLedgerOnlyBalances as selectBalances } from '@apps/runway/store/selectors/balanceSelectors';
import { selectEnvelopes } from '@apps/runway/store/selectors/runwaySelectors';
import type { DateOnly, PurchaseLine } from '@apps/runway/types';

/** A purchase's chosen lines with the overage each envelope's chain takes, against the balances now; a day not counted is left as chosen. */
export const getSpilledLines = (
  state: RootState,
  lines: readonly PurchaseLine[],
  previousLines: readonly PurchaseLine[] | null,
  date: DateOnly,
): PurchaseLine[] => {
  const trackingPeriods = state.runway.plan?.trackingPeriods ?? [];
  const countedFrom = getCountedFrom(trackingPeriods);
  if (countedFrom === null || date < countedFrom) return [...lines];
  return spillLines(
    {
      trackingPeriods,
      envelopes: selectEnvelopes(state, todayAsUtcDate()),
      assignedByItem: () => selectBalances(state).assignedByItem,
    },
    lines,
    previousLines,
    date,
  );
};

export interface PickEffect {
  /** What the envelope has left before this purchase. */
  leftCents: number;
  /** What it has left once its part of the purchase is taken (its own chain takes the rest first). */
  afterCents: number;
  /** How much of the purchase would take the envelope below zero; 0 when it covers it or the day isn't counted. */
  shortCents: number;
  /** Where its "When it runs out" chain sends the rest, in order; null is Free to Spend. */
  spillTo: (string | null)[];
}

/** What sending an amount to one envelope does to it: what is left now, after, and how much it can't cover. */
export function getPickEffect(
  state: RootState,
  envelopeId: string,
  cents: number,
  previousLines: readonly PurchaseLine[] | null,
  date: DateOnly,
): PickEffect {
  const leftCents =
    (selectBalances(state).assignedByItem[envelopeId] ?? 0) +
    (previousLines ?? []).reduce(
      (sum, line) => (line.envelopeId === envelopeId ? sum + line.cents : sum),
      0,
    );
  const countedFrom = getCountedFrom(state.runway.plan?.trackingPeriods ?? []);
  if (countedFrom === null || date < countedFrom || cents <= 0) {
    return { leftCents, afterCents: leftCents, shortCents: 0, spillTo: [] };
  }
  const lines = getSpilledLines(
    state,
    [{ envelopeId, cents, via: 'chosen' }],
    previousLines,
    date,
  );
  const taken = lines.reduce(
    (sum, line) => (line.envelopeId === envelopeId ? sum + line.cents : sum),
    0,
  );
  const afterCents = leftCents - taken;
  return {
    leftCents,
    afterCents,
    shortCents: Math.min(taken, Math.max(0, -afterCents)),
    spillTo: lines.flatMap((line) =>
      line.via === 'spill' ? [line.envelopeId] : [],
    ),
  };
}

export interface PlacedOver {
  envelopeId: string;
  /** What the envelope had left before this purchase took from it. */
  leftCents: number;
  shortCents: number;
}

/** How far a placed purchase takes its chosen envelope below zero now, or null when it doesn't. */
export function getPlacedOver(
  state: RootState,
  lines: readonly PurchaseLine[],
): PlacedOver | null {
  const envelopeId =
    lines.find((line) => line.via === 'chosen' && line.envelopeId !== null)
      ?.envelopeId ?? null;
  if (envelopeId === null) return null;
  const taken = lines.reduce(
    (sum, line) => (line.envelopeId === envelopeId ? sum + line.cents : sum),
    0,
  );
  const nowLeft = selectBalances(state).assignedByItem[envelopeId] ?? 0;
  const shortCents = Math.min(taken, Math.max(0, -nowLeft));
  return shortCents > 0 && nowLeft + taken > 0
    ? { envelopeId, leftCents: nowLeft + taken, shortCents }
    : null;
}
