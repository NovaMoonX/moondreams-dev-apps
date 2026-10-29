import type {
  Cents,
  DateOnly,
  OpenMove,
  OpenPurchase,
  OpenRecord,
} from '@apps/runway/types';

import {
  closingBefore,
  joinCardPaid,
  joinCents,
  joinPaid,
  sumChargedByCard,
  type ClosingState,
} from './closings';
import { getEffectiveSplits } from './correct';
import { START_DAY_KEY } from '@apps/runway/constants';

import {
  collectCardPaid,
  collectFunded,
  collectPaid,
  collectStarted,
  settlePaid,
} from './progress';

export interface BalancesInput {
  startDate: DateOnly | null;
  moves: readonly OpenMove[];
  records: readonly OpenRecord[];
  /** The day each confirmed day's money arrived, by day id; a split of a day that arrived before the start is not counted. */
  arrivedOn: ReadonlyMap<string, DateOnly>;
  /** Each day's scheduled date, by day id, which places what it set aside for a bill against that bill's payments; `arrivedOn` stands in when it is left out. */
  expectedOn?: ReadonlyMap<string, DateOnly>;
  /** Which plan items are goals, bills and envelopes, and which ids are cards. */
  kinds: Readonly<Record<string, 'goal' | 'bill' | 'envelope' | 'card'>>;
  /** The day each item that stopped for good (archived, or ended) no longer holds money, by item id: what it held is Free to spend from then. */
  releasedFrom?: Readonly<Record<string, DateOnly>>;
  /** The day the figures are for, which `releasedFrom` is read against; every release counts when it is left out. */
  asOf?: DateOnly;
  /** What was spent, only while tracking is on; a purchase dated before the starting point is not counted. */
  purchases?: readonly OpenPurchase[];
  /** Cards are part of tracking: while it is off they are left out entirely, a bill charged to one reads as paid in cash, and nothing waits on a card. Counted when left out. */
  isCountingCards?: boolean;
  /** What the ledger before the records, moves and purchases above summed to, counted from the same starting day; its spending is left out by the caller when spending is not counted. */
  closing?: ClosingState | null;
}

export interface Balances {
  /** A starting point exists. */
  isStarted: boolean;
  /** The person said how much money they have; without it Free to spend is unknown, never zero. */
  hasMoney: boolean;
  /** The starting money, plus what arrived since, less the bills paid. */
  moneyOnHandCents: Cents;
  /** Money that has a job, by item: its starting amount plus what confirmed days gave it, less a paid bill's set-aside and, at Track, what was spent from it; below zero when an envelope is over. */
  assignedByItem: Record<string, Cents>;
  assignedToBillsCents: Cents;
  assignedToGoalsCents: Cents;
  /** What envelopes still hold; an envelope that is over holds nothing, and its overspend has already left the money on hand. */
  assignedToEnvelopesCents: Cents;
  /** What each card owes and waits to be paid: what it owed on the starting day, plus what was charged to it, less what was paid off; below zero when it was overpaid. */
  reserveByCard: Record<string, Cents>;
  /** What the cards wait to be paid; an overpaid card counts as zero. */
  assignedToCardsCents: Cents;
  /** Money on hand less everything assigned; below zero when more is assigned than is held. */
  freeToSpendCents: Cents;
  startMoneyCents: Cents;
  arrivedCents: Cents;
  paidCents: Cents;
  /** What was spent since the starting point, less refunds. */
  spentCents: Cents;
}

/**
 * Every figure, summed from the ledger since the starting point: the start moves, the confirmed days'
 * latest splits and the bills marked paid. Nothing is stored, so the same inputs always give the same
 * figures.
 */
export function deriveBalances(input: BalancesInput): Balances {
  const { startDate } = input;
  const started = collectStarted(input.moves, startDate);
  const splits = getEffectiveSplits(input.records).filter(
    (split) =>
      startDate !== null &&
      (input.arrivedOn.get(split.dayId) ?? 0) >= startDate,
  );
  const base = input.closing ?? null;
  const arrivedCents =
    (base?.arrivedCents ?? 0) +
    splits.reduce((sum, split) => sum + split.arrivedCents, 0);

  const given = joinCents(
    base?.given,
    splits
      .flatMap((split) => split.lines)
      .reduce<Record<string, Cents>>((sums, line) => {
        sums[line.itemId] = (sums[line.itemId] ?? 0) + line.cents;
        return sums;
      }, {}),
  );

  const funded = collectFunded(
    input.records.filter(
      (record) =>
        startDate !== null &&
        (input.arrivedOn.get(record.dayId) ?? 0) >= startDate,
    ),
    input.expectedOn ?? input.arrivedOn,
  );
  const paidByBill = Object.entries(
    joinPaid(base, collectPaid(input.moves)),
  ).map(([billId, payments]) => {
    const counted =
      startDate === null
        ? []
        : settlePaid(
            [
              ...(started.byItem[billId] === undefined
                ? []
                : [
                    {
                      dayKey: START_DAY_KEY,
                      on: startDate,
                      cents: started.byItem[billId],
                    },
                  ]),
              ...(base?.billFunded[billId] ?? []),
              ...(funded[billId] ?? []),
            ],
            payments.filter((payment) => payment.paidOn >= startDate),
          );
    return {
      billId,
      amountCents: counted.reduce((sum, p) => sum + p.amountCents, 0),
      fromFreeCents: counted.reduce((sum, p) => sum + p.fromFreeCents, 0),
      charged: counted.filter((p) => p.cardId !== null),
    };
  });
  const paidCents = paidByBill.reduce((sum, bill) => sum + bill.amountCents, 0);
  const consumed = Object.fromEntries(
    paidByBill.map((bill) => [
      bill.billId,
      bill.amountCents - bill.fromFreeCents,
    ]),
  );

  const counted =
    startDate === null
      ? []
      : (input.purchases ?? []).filter(
          (purchase) => purchase.date >= startDate,
        );
  const spentCents =
    (base?.spentCents ?? 0) +
    counted.reduce((sum, purchase) => sum + purchase.amountCents, 0);
  const spentByItem = joinCents(
    base?.spentByItem,
    counted
      .flatMap((purchase) => purchase.lines)
      .reduce<Record<string, Cents>>((sums, line) => {
        if (line.envelopeId !== null) {
          sums[line.envelopeId] = (sums[line.envelopeId] ?? 0) + line.cents;
        }
        return sums;
      }, {}),
  );

  const isCard = (id: string) => input.kinds[id] === 'card';
  const itemIds = new Set(
    [
      ...Object.keys(given),
      ...Object.keys(started.byItem),
      ...Object.keys(spentByItem),
    ].filter((id) => !isCard(id)),
  );
  const assignedByItem = Object.fromEntries(
    [...itemIds].map((id) => [
      id,
      (started.byItem[id] ?? 0) +
        (given[id] ?? 0) -
        (consumed[id] ?? 0) -
        (spentByItem[id] ?? 0),
    ]),
  );
  const isReleased = (id: string) =>
    Object.hasOwn(input.releasedFrom ?? {}, id) &&
    (input.releasedFrom?.[id] ?? 0) <= (input.asOf ?? Infinity);
  const sumKind = (kind: 'goal' | 'bill' | 'envelope') =>
    Object.entries(assignedByItem)
      .filter(([id]) => input.kinds[id] === kind && !isReleased(id))
      .reduce(
        (sum, [, cents]) =>
          sum + (kind === 'envelope' ? Math.max(0, cents) : cents),
        0,
      );
  const assignedToBillsCents = sumKind('bill');
  const assignedToGoalsCents = sumKind('goal');
  const assignedToEnvelopesCents = sumKind('envelope');

  const isCountingCards = input.isCountingCards ?? true;
  const allCharged = joinCents(
    joinCents(base?.chargedByCard, sumChargedByCard(counted)),
    paidByBill
      .flatMap((bill) => bill.charged)
      .reduce<Record<string, Cents>>((sums, payment) => {
        const cardId = payment.cardId ?? '';
        sums[cardId] = (sums[cardId] ?? 0) + payment.amountCents;
        return sums;
      }, {}),
  );
  const charged = isCountingCards ? allCharged : {};
  const allCardPaid = Object.fromEntries(
    Object.entries(joinCardPaid(base, collectCardPaid(input.moves))).map(
      ([id, list]) => [
        id,
        list
          .filter((payment) => startDate !== null && payment.on >= startDate)
          .reduce((sum, payment) => sum + payment.cents, 0),
      ],
    ),
  );
  const cardPaid = isCountingCards ? allCardPaid : {};
  const cardIds = new Set([
    ...(isCountingCards ? Object.keys(started.byItem).filter(isCard) : []),
    ...Object.keys(charged),
    ...Object.keys(cardPaid),
  ]);
  const reserveByCard = Object.fromEntries(
    [...cardIds].map((id) => [
      id,
      (started.byItem[id] ?? 0) + (charged[id] ?? 0) - (cardPaid[id] ?? 0),
    ]),
  );
  const assignedToCardsCents = Object.values(reserveByCard).reduce(
    (sum, cents) => sum + Math.max(0, cents),
    0,
  );
  const sumValues = (sums: Record<string, Cents>) =>
    Object.values(sums).reduce((sum, cents) => sum + cents, 0);

  const startMoneyCents = started.money ?? 0;
  const moneyOnHandCents =
    startMoneyCents +
    arrivedCents -
    paidCents -
    spentCents +
    sumValues(charged) -
    sumValues(cardPaid);
  const result: Balances = {
    isStarted: startDate !== null,
    hasMoney: started.money !== null,
    moneyOnHandCents,
    assignedByItem,
    assignedToBillsCents,
    assignedToGoalsCents,
    assignedToEnvelopesCents,
    reserveByCard,
    assignedToCardsCents,
    freeToSpendCents:
      moneyOnHandCents -
      assignedToBillsCents -
      assignedToGoalsCents -
      assignedToEnvelopesCents -
      assignedToCardsCents,
    startMoneyCents,
    arrivedCents,
    paidCents,
    spentCents,
  };
  return result;
}

/** How the Free to spend figure reads: the amount, over-assigned, or not known yet. */
export type FreeToSpendFigure =
  | { kind: 'amount'; cents: Cents }
  | { kind: 'over'; cents: Cents }
  | { kind: 'unknown' };

export function getFreeToSpendFigure(balances: Balances): FreeToSpendFigure {
  if (!balances.isStarted || !balances.hasMoney) return { kind: 'unknown' };
  if (balances.freeToSpendCents < 0) {
    return { kind: 'over', cents: -balances.freeToSpendCents };
  }
  return { kind: 'amount', cents: balances.freeToSpendCents };
}

/** The figures as they stood at the start of `day`: days whose money arrived, and bills paid, from that day on are left out, because a start dated `day` adds them again. */
export function deriveBalancesBefore(
  input: BalancesInput,
  day: DateOnly,
): Balances {
  const dropped = new Set(
    input.moves.flatMap((move) =>
      !move.reversesMoveId &&
      ((move.kind === 'billPaid' && move.payload.paidOn >= day) ||
        (move.kind === 'cardPayment' && move.date >= day))
        ? [move.id]
        : [],
    ),
  );
  const result = deriveBalances({
    ...input,
    asOf: Math.min(day - 1, input.asOf ?? Infinity),
    closing: input.closing ? closingBefore(input.closing, day) : null,
    moves: input.moves.filter(
      (move) =>
        !dropped.has(move.id) &&
        !(move.reversesMoveId && dropped.has(move.reversesMoveId)),
    ),
    records: input.records.filter(
      (record) => (input.arrivedOn.get(record.dayId) ?? 0) < day,
    ),
    purchases: (input.purchases ?? []).filter(
      (purchase) => purchase.date < day,
    ),
  });
  return result;
}
