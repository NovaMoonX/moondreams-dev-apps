import type { RootState } from '@/store';
import { todayAsUtcDate } from '@apps/runway/engine/dates';
import { getCountedFrom } from '@apps/runway/engine/purchases';
import { resolveSpill, type SpillChains } from '@apps/runway/engine/spill';
import { selectLedgerOnlyBalances as selectBalances } from '@apps/runway/store/selectors/balanceSelectors';
import { selectEnvelopes } from '@apps/runway/store/selectors/runwaySelectors';
import type { DateOnly, PurchaseLine } from '@apps/runway/types';

/** A purchase's chosen lines with the overage each envelope's chain takes, against the balances now; a day not counted is left as chosen. */
export function getSpilledLines(
  state: RootState,
  lines: readonly PurchaseLine[],
  previousLines: readonly PurchaseLine[] | null,
  date: DateOnly,
): PurchaseLine[] {
  const countedFrom = getCountedFrom(state.runway.plan?.trackingPeriods ?? []);
  if (countedFrom === null || date < countedFrom) return [...lines];
  const envelopes = selectEnvelopes(state, todayAsUtcDate());
  const { assignedByItem } = selectBalances(state);
  const left = Object.fromEntries(
    envelopes.map(({ item }) => [
      item.id,
      (assignedByItem[item.id] ?? 0) +
        (previousLines ?? []).reduce(
          (sum, line) => (line.envelopeId === item.id ? sum + line.cents : sum),
          0,
        ),
    ]),
  );
  const chains: SpillChains = Object.fromEntries(
    envelopes.map(({ item, version }) => [item.id, version.payload.spillTo]),
  );
  return resolveSpill(lines, left, chains);
}

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
