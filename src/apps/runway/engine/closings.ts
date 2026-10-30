import {
  CLOSING_LAG_MONTHS,
  CLOSING_SETTLE_DAYS,
  CLOSING_VERSION,
  RECENT_DAYS_WINDOW,
  START_DAY_KEY,
} from '@apps/runway/constants';
import type {
  Cents,
  ClosingSealed,
  DateOnly,
  OpenDay,
  OpenMove,
  OpenPurchase,
  OpenRecord,
} from '@apps/runway/types';

import { sumConfirmedByItem } from './confirm';
import { getEffectiveSplits } from './correct';
import { DAY_MS } from './dates';
import {
  collectCardPaid,
  collectFunded,
  collectPaid,
  collectStarted,
  collectTransferEntries,
  sumTransfers,
  type TransferEntry,
  getPaidMoveId,
  settlePaid,
  type BillProgressInput,
  type CardPaid,
  type FundedDay,
  type PaidPayment,
} from './progress';

/** What a funded day decoded from a closing is called; only the starting amount's key is told apart from the rest. */
export const CLOSED_DAY_KEY = 'closed';

/**
 * Everything the ledger summed to at the end of `month`, counted from the starting day. The starting
 * amounts themselves are not in it: they are always read, so the starting day can be corrected without
 * touching a closing. A closing is a cache and can always be rebuilt from the ledger.
 */
export interface ClosingState {
  month: string;
  startDate: DateOnly;
  /** What confirmed days that arrived since the starting day brought in. */
  arrivedCents: Cents;
  /** What those days gave each item. */
  given: Record<string, Cents>;
  spentCents: Cents;
  spentByItem: Record<string, Cents>;
  /** What confirmed days set aside for each bill, one entry per day. */
  billFunded: Record<string, FundedDay[]>;
  /** Each bill's payments not undone; the ones before the starting day are kept and left out of the sums. */
  billPaid: Record<string, PaidPayment[]>;
  /** The splits summed in `arrivedCents` and `given` whose money arrived after this month ended, so a figure as of a day just after it can leave them out. */
  late: LateSplit[];
  /** What purchases charged to each card; spending, so it is left out with the rest of it at Plan. */
  chargedByCard: Record<string, Cents>;
  /** Each card's payments not undone; the ones before the starting day are kept and left out of the sums. */
  cardPaid: Record<string, CardPaid[]>;
  /** Each transfer not undone, with its day so a figure as of an earlier day can leave it out; money moved, never spent, so it stays when spending is left out. */
  transfers: TransferEntry[];
}

/** One confirmed day's money that arrived after the month it was expected in had closed. */
export interface LateSplit {
  on: DateOnly;
  arrivedCents: Cents;
  given: Record<string, Cents>;
}

/** The ledger entries whose date falls in one month, with the day documents the records belong to. */
export interface ClosingEntries {
  startDate: DateOnly;
  days: readonly Pick<OpenDay, 'id' | 'expectedOn' | 'arrivedOn'>[];
  records: readonly OpenRecord[];
  moves: readonly OpenMove[];
  purchases: readonly OpenPurchase[];
  /** Which items are bills; only a bill's funded days are kept. */
  billIds: ReadonlySet<string>;
}

const MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

export const isMonthKey = (value: unknown): value is string =>
  typeof value === 'string' && MONTH_PATTERN.test(value);

/** `yyyy-mm` of a date-only value. */
export function toMonthKey(date: DateOnly): string {
  const value = new Date(date);
  const result = `${String(value.getUTCFullYear()).padStart(4, '0')}-${String(value.getUTCMonth() + 1).padStart(2, '0')}`;
  return result;
}

/** The first day of a month, as UTC midnight. */
export function getMonthStart(month: string): DateOnly {
  const [year, number] = month.split('-').map(Number);
  const result = Date.UTC(year, number - 1, 1);
  return result;
}

export const getNextMonth = (month: string) =>
  toMonthKey(Date.UTC(...toYearAndMonth(month, 1)));

export const getPreviousMonth = (month: string) =>
  toMonthKey(Date.UTC(...toYearAndMonth(month, -1)));

function toYearAndMonth(
  month: string,
  offset: number,
): [number, number, number] {
  const [year, number] = month.split('-').map(Number);
  return [year, number - 1 + offset, 1];
}

/** Whole months from `from` to `to`; negative when `to` is earlier. */
export function countMonthsBetween(from: string, to: string): number {
  const [fromYear, fromNumber] = from.split('-').map(Number);
  const [toYear, toNumber] = to.split('-').map(Number);
  const result = (toYear - fromYear) * 12 + (toNumber - fromNumber);
  return result;
}

/** Every month from `from` through `to`. */
export function listMonths(from: string, to: string): string[] {
  const count = countMonthsBetween(from, to) + 1;
  const result = Array.from({ length: Math.max(0, count) }, (_, index) =>
    toMonthKey(Date.UTC(...toYearAndMonth(from, index))),
  );
  return result;
}

/** The last month a closing may cover on `today`: one that ended at least `CLOSING_SETTLE_DAYS` ago. */
export function getLastClosableMonth(today: DateOnly): string {
  const result = getPreviousMonth(
    toMonthKey(today - CLOSING_SETTLE_DAYS * DAY_MS),
  );
  return result;
}

/**
 * The earliest closed month the dates touch, merged with `current`. A writer calls this with the days
 * its entry is dated on, and stores the result in the same transaction; `touched` says whether a
 * closing could have summed one of them. The writer reads two days ahead so a device whose clock is a
 * day ahead never closes a month a slower one still writes into unmarked.
 */
export function getDirtyFrom(
  current: string | null,
  dates: readonly DateOnly[],
  today: DateOnly,
): { dirtyFrom: string | null; isTouched: boolean } {
  const lastClosable = getLastClosableMonth(today + 2 * DAY_MS);
  const closed = dates.map(toMonthKey).filter((month) => month <= lastClosable);
  const earliest = [
    ...(current === null ? [] : [current]),
    ...closed,
  ].sort()[0];
  const result = {
    dirtyFrom: earliest ?? null,
    isTouched: closed.length > 0,
  };
  return result;
}

const addCents = (
  left: Readonly<Record<string, Cents>>,
  right: Readonly<Record<string, Cents>>,
): Record<string, Cents> =>
  Object.entries(right).reduce<Record<string, Cents>>(
    (sums, [id, cents]) => ({ ...sums, [id]: (sums[id] ?? 0) + cents }),
    { ...left },
  );

const joinLists = <T>(
  left: Readonly<Record<string, readonly T[]>>,
  right: Readonly<Record<string, readonly T[]>>,
): Record<string, T[]> =>
  Object.entries(right).reduce<Record<string, T[]>>(
    (lists, [id, list]) => ({
      ...lists,
      [id]: [...(lists[id] ?? []), ...list],
    }),
    Object.fromEntries(
      Object.entries(left).map(([id, list]) => [id, [...list]]),
    ),
  );

/** A closing with nothing summed yet, the base of the first month. */
export const emptyClosing = (
  month: string,
  startDate: DateOnly,
): ClosingState => ({
  month,
  startDate,
  arrivedCents: 0,
  given: {},
  spentCents: 0,
  spentByItem: {},
  billFunded: {},
  billPaid: {},
  late: [],
  chargedByCard: {},
  cardPaid: {},
  transfers: [],
});

/**
 * The closing of `month`: the closing before it plus the month's entries. Pure and deterministic, so
 * the same ledger always gives the same closing. Entries are placed by the date their listener reads
 * them by: a day by `expectedOn`, a move by `date`, a purchase by `date`; a record goes with its day.
 */
export function closing(
  month: string,
  previous: ClosingState | null,
  entries: ClosingEntries,
): ClosingState {
  const { startDate } = entries;
  if (previous !== null && previous.startDate !== startDate) {
    throw new Error(
      'A closing cannot continue one counted from another starting day.',
    );
  }
  const base = previous ?? emptyClosing(month, startDate);
  const arrivedOn = new Map(
    entries.days.map((day) => [day.id, day.arrivedOn ?? day.expectedOn]),
  );
  const expectedOn = new Map(
    entries.days.map((day) => [day.id, day.expectedOn]),
  );
  const counted = entries.records.filter(
    (record) => (arrivedOn.get(record.dayId) ?? 0) >= startDate,
  );
  const arrivedCents = getEffectiveSplits(counted).reduce(
    (sum, split) => sum + split.arrivedCents,
    0,
  );
  const funded = Object.fromEntries(
    Object.entries(collectFunded(counted, expectedOn))
      .filter(([id]) => entries.billIds.has(id))
      .map(([id, list]) => [
        id,
        list.map((entry) => ({ ...entry, dayKey: CLOSED_DAY_KEY })),
      ]),
  );
  const purchases = entries.purchases.filter(
    (purchase) => purchase.date >= startDate,
  );
  const spentByItem = purchases
    .flatMap((purchase) => purchase.lines)
    .reduce<Record<string, Cents>>((sums, line) => {
      if (line.envelopeId !== null) {
        sums[line.envelopeId] = (sums[line.envelopeId] ?? 0) + line.cents;
      }
      return sums;
    }, {});
  const chargedByCard = sumChargedByCard(purchases);
  const boundary = getMonthStart(getNextMonth(month));
  const late = [
    ...base.late.filter((split) => split.on >= boundary),
    ...getEffectiveSplits(counted).flatMap((split): LateSplit[] => {
      const on = arrivedOn.get(split.dayId) ?? 0;
      return on >= boundary
        ? [
            {
              on,
              arrivedCents: split.arrivedCents,
              given: split.lines.reduce<Record<string, Cents>>(
                (sums, line) => ({
                  ...sums,
                  [line.itemId]: (sums[line.itemId] ?? 0) + line.cents,
                }),
                {},
              ),
            },
          ]
        : [];
    }),
  ];
  const result: ClosingState = {
    month,
    startDate,
    late,
    arrivedCents: base.arrivedCents + arrivedCents,
    given: addCents(base.given, sumConfirmedByItem(counted)),
    spentCents:
      base.spentCents +
      purchases.reduce((sum, purchase) => sum + purchase.amountCents, 0),
    spentByItem: addCents(base.spentByItem, spentByItem),
    billFunded: joinLists(base.billFunded, funded),
    billPaid: joinLists(base.billPaid, collectPaid(entries.moves)),
    chargedByCard: addCents(base.chargedByCard, chargedByCard),
    cardPaid: joinLists(base.cardPaid, collectCardPaid(entries.moves)),
    transfers: [
      ...base.transfers,
      ...collectTransferEntries(entries.moves, startDate),
    ],
  };
  return result;
}

/** What purchases charged to each card, by card id; a refund to a card lowers it. */
export const sumChargedByCard = (purchases: readonly OpenPurchase[]) =>
  purchases.reduce<Record<string, Cents>>((sums, purchase) => {
    const cardId = purchase.paidByCardId ?? null;
    if (cardId !== null) {
      sums[cardId] = (sums[cardId] ?? 0) + purchase.amountCents;
    }
    return sums;
  }, {});

/** What a closing contributes when spending is not counted (Plan level): everything but the purchases. */
export const withoutSpending = (state: ClosingState): ClosingState => ({
  ...state,
  spentCents: 0,
  spentByItem: {},
  chargedByCard: {},
});

/**
 * The closing as it stood at the start of `day`, a day inside the window that follows it: money that
 * arrived, and payments made, on or after `day` are taken out, which is what `deriveBalancesBefore` does
 * to the ledger read since.
 */
export function closingBefore(
  state: ClosingState,
  day: DateOnly,
): ClosingState {
  const dropped = state.late.filter((split) => split.on >= day);
  const result: ClosingState = {
    ...state,
    arrivedCents:
      state.arrivedCents -
      dropped.reduce((sum, split) => sum + split.arrivedCents, 0),
    given: dropped
      .flatMap((split) => Object.entries(split.given))
      .reduce<Record<string, Cents>>(
        (sums, [id, cents]) => ({ ...sums, [id]: (sums[id] ?? 0) - cents }),
        { ...state.given },
      ),
    late: state.late.filter((split) => split.on < day),
    billPaid: Object.fromEntries(
      Object.entries(state.billPaid).map(([id, list]) => [
        id,
        list.filter((payment) => payment.paidOn < day),
      ]),
    ),
    cardPaid: Object.fromEntries(
      Object.entries(state.cardPaid).map(([id, list]) => [
        id,
        list.filter((payment) => payment.on < day),
      ]),
    ),
    transfers: state.transfers.filter((entry) => entry.on < day),
  };
  return result;
}

/** The payments of every bill from a closing and from the ledger read since, none of them counted twice. */
export const joinPaid = (
  base: ClosingState | null,
  live: Readonly<Record<string, PaidPayment[]>>,
) => joinLists(base?.billPaid ?? {}, live);

/** The payments of every card from a closing and from the ledger read since, none of them counted twice. */
export const joinCardPaid = (
  base: ClosingState | null,
  live: Readonly<Record<string, CardPaid[]>>,
) => joinLists(base?.cardPaid ?? {}, live);

export const joinCents = (
  base: Readonly<Record<string, Cents>> | undefined,
  live: Readonly<Record<string, Cents>>,
) => addCents(base ?? {}, live);

/**
 * What each plan item holds from the ledger: its starting amount plus what confirmed days gave it,
 * from the closing and from the records read since. `records` are those of days that arrived on or
 * after the starting day.
 */
export function deriveHeldByItem(
  records: readonly OpenRecord[],
  moves: readonly OpenMove[],
  startDate: DateOnly | null,
  base: ClosingState | null,
): Record<string, Cents> {
  const confirmed = addCents(base?.given ?? {}, sumConfirmedByItem(records));
  const { byItem } = collectStarted(moves, startDate);
  const moved = sumTransfers([
    ...(base?.transfers ?? []),
    ...collectTransferEntries(moves, startDate),
  ]);
  const ids = new Set([
    ...Object.keys(confirmed),
    ...Object.keys(byItem),
    ...Object.keys(moved),
  ]);
  const result = Object.fromEntries(
    [...ids].map((id) => [
      id,
      (confirmed[id] ?? 0) + (byItem[id] ?? 0) + (moved[id] ?? 0),
    ]),
  );
  return result;
}

/**
 * What confirmed days set aside for each item and which payments were marked paid: the starting
 * amount, the days of the closing and the days read since. `records` are those of days that arrived on
 * or after the starting day; `expectedOn` is each day's scheduled date, by id.
 */
export function deriveBillProgress(
  records: readonly OpenRecord[],
  expectedOn: ReadonlyMap<string, DateOnly>,
  moves: readonly OpenMove[],
  startDate: DateOnly | null,
  base: ClosingState | null,
): Record<string, BillProgressInput> {
  const confirmedFunded = joinLists(
    base?.billFunded ?? {},
    collectFunded(records, expectedOn),
  );
  const started = collectStarted(moves, startDate);
  const funded = Object.fromEntries(
    [
      ...new Set([
        ...Object.keys(confirmedFunded),
        ...Object.keys(started.byItem),
      ]),
    ].map((id) => [
      id,
      [
        ...(startDate !== null && (started.byItem[id] ?? 0) > 0
          ? [
              {
                dayKey: START_DAY_KEY,
                on: startDate,
                cents: started.byItem[id],
              },
            ]
          : []),
        ...(confirmedFunded[id] ?? []),
      ],
    ]),
  );
  const paid = joinPaid(base, collectPaid(moves));
  const ids = new Set([...Object.keys(funded), ...Object.keys(paid)]);
  const result = Object.fromEntries(
    [...ids].map((id) => [
      id,
      {
        funded: funded[id] ?? [],
        paid: settleCounted(funded[id] ?? [], paid[id] ?? [], startDate),
      },
    ]),
  );
  return result;
}

/** Settles the payments counted since the starting day; one made before it keeps its mark as it was. */
function settleCounted(
  funded: readonly FundedDay[],
  paid: readonly PaidPayment[],
  startDate: DateOnly | null,
): PaidPayment[] {
  if (startDate === null) return [...paid];
  const settled = new Map(
    settlePaid(
      funded,
      paid.filter((payment) => payment.paidOn >= startDate),
    ).map((payment) => [payment.moveId, payment]),
  );
  const result = paid.map((payment) => settled.get(payment.moveId) ?? payment);
  return result;
}

const toDays = (date: DateOnly) => date / DAY_MS;

/** The number of the mark in a payment's move id, or the id itself when it is not one `getPaidMoveId` makes. */
function getMark(billId: string, payment: PaidPayment): number | string {
  const marks = Array.from({ length: 12 }, (_, index) => index).find(
    (index) => getPaidMoveId(billId, payment.dueOn, index) === payment.moveId,
  );
  return marks ?? payment.moveId;
}

/** The closing as it is sealed. */
export function encodeClosing(state: ClosingState): ClosingSealed {
  const result: ClosingSealed = {
    version: CLOSING_VERSION,
    startDay: toDays(state.startDate),
    arrivedCents: state.arrivedCents,
    given: state.given,
    spentCents: state.spentCents,
    spentByItem: state.spentByItem,
    funded: Object.fromEntries(
      Object.entries(state.billFunded).map(([id, list]) => [
        id,
        list.map((entry): [number, Cents] => [toDays(entry.on), entry.cents]),
      ]),
    ),
    late: state.late.map((split): [number, Cents, Record<string, Cents>] => [
      toDays(split.on),
      split.arrivedCents,
      split.given,
    ]),
    paid: Object.fromEntries(
      Object.entries(state.billPaid).map(([id, list]) => [
        id,
        list.map(
          (
            payment,
          ): [number, Cents, number, Cents, number | string, string | null] => [
            toDays(payment.dueOn),
            payment.amountCents,
            toDays(payment.paidOn),
            payment.fromFreeCents,
            getMark(id, payment),
            payment.cardId,
          ],
        ),
      ]),
    ),
    charged: state.chargedByCard,
    cardPaid: Object.fromEntries(
      Object.entries(state.cardPaid).map(([id, list]) => [
        id,
        list.map((payment): [number, Cents, string] => [
          toDays(payment.on),
          payment.cents,
          payment.moveId,
        ]),
      ]),
    ),
    transfers: state.transfers.map(
      (entry): [number, string, string | null, Cents, string] => [
        toDays(entry.on),
        entry.fromId,
        entry.toId,
        entry.cents,
        entry.moveId,
      ],
    ),
  };
  return result;
}

/** Reads a sealed closing back; a version this build does not know throws, and the closing is rebuilt. */
export function decodeClosing(
  month: string,
  sealed: ClosingSealed,
): ClosingState {
  if (sealed.version !== CLOSING_VERSION) {
    throw new Error('This closing was written by another version.');
  }
  const result: ClosingState = {
    month,
    startDate: sealed.startDay * DAY_MS,
    arrivedCents: sealed.arrivedCents,
    given: sealed.given,
    late: sealed.late.map(([day, arrivedCents, given]) => ({
      on: day * DAY_MS,
      arrivedCents,
      given,
    })),
    spentCents: sealed.spentCents,
    spentByItem: sealed.spentByItem,
    billFunded: Object.fromEntries(
      Object.entries(sealed.funded).map(([id, list]) => [
        id,
        list.map(([day, cents]) => ({
          dayKey: CLOSED_DAY_KEY,
          on: day * DAY_MS,
          cents,
        })),
      ]),
    ),
    billPaid: Object.fromEntries(
      Object.entries(sealed.paid).map(([id, list]) => [
        id,
        list.map(
          ([dueDay, amountCents, paidDay, fromFreeCents, mark, cardId]) => ({
            moveId:
              typeof mark === 'string'
                ? mark
                : getPaidMoveId(id, dueDay * DAY_MS, mark),
            dueOn: dueDay * DAY_MS,
            amountCents,
            paidOn: paidDay * DAY_MS,
            fromFreeCents,
            cardId,
          }),
        ),
      ]),
    ),
    chargedByCard: sealed.charged,
    cardPaid: Object.fromEntries(
      Object.entries(sealed.cardPaid).map(([id, list]) => [
        id,
        list.map(([day, cents, moveId]) => ({
          moveId,
          on: day * DAY_MS,
          cents,
        })),
      ]),
    ),
    transfers: sealed.transfers.map(([day, fromId, toId, cents, moveId]) => ({
      moveId,
      on: day * DAY_MS,
      fromId,
      toId,
      cents,
    })),
  };
  return result;
}

/** What a rebuild starts from: the plan as it stands and the newest closing that still applies. */
export interface RebuildNeed {
  startDate: DateOnly | null;
  dirtyFrom: string | null;
  /** The month of the newest valid closing, or null when none applies. */
  validMonth: string | null;
  /** The last month that may be closed today. */
  target: string;
}

/** How the history reads on a day: still to rebuild, unable to, or ready with the closing the recent window follows. */
export type History =
  | { status: 'building'; need: RebuildNeed }
  | { status: 'failed' }
  | { status: 'ready'; closing: ClosingState | null; from: DateOnly };

export interface HistoryInput {
  startDate: DateOnly | null;
  dirtyFrom: string | null;
  /** The newest closing before `dirtyFrom`, or the newest of all when none is dirty. */
  closing: ClosingState | null;
  today: DateOnly;
  /** A rebuild was tried and could not finish. */
  hasFailed: boolean;
}

/** A closing applies only to the starting day it was counted from and only before `dirtyFrom`. */
export function getValidClosing(
  input: Pick<HistoryInput, 'startDate' | 'dirtyFrom' | 'closing'>,
): ClosingState | null {
  const { closing: candidate, startDate, dirtyFrom } = input;
  const isValid =
    candidate !== null &&
    startDate !== null &&
    candidate.startDate === startDate &&
    (dirtyFrom === null || candidate.month < dirtyFrom);
  const result = isValid ? candidate : null;
  return result;
}

/** Where the recent window starts on `today` and what must be rebuilt first. */
export function getHistory(input: HistoryInput): History {
  const valid = getValidClosing(input);
  const target = getLastClosableMonth(input.today);
  const first = input.startDate === null ? null : toMonthKey(input.startDate);
  const isBehind =
    first !== null &&
    first <= target &&
    (valid === null ||
      countMonthsBetween(valid.month, target) >= CLOSING_LAG_MONTHS);
  const needs = input.dirtyFrom !== null || isBehind;
  if (needs && !input.hasFailed) {
    return {
      status: 'building',
      need: {
        startDate: input.startDate,
        dirtyFrom: input.dirtyFrom,
        validMonth: valid?.month ?? null,
        target,
      },
    };
  }
  if (needs && valid === null) return { status: 'failed' };
  const from =
    valid === null
      ? input.today - RECENT_DAYS_WINDOW * DAY_MS
      : getMonthStart(getNextMonth(valid.month));
  const result: History = { status: 'ready', closing: valid, from };
  return result;
}

/** The first and last month a rebuild writes, or null when it only has to clear what is stale. */
export function getRebuildRange(
  need: RebuildNeed,
): { from: string; to: string } | null {
  if (need.startDate === null) return null;
  const first = toMonthKey(need.startDate);
  const from = need.validMonth === null ? first : getNextMonth(need.validMonth);
  const result = from > need.target ? null : { from, to: need.target };
  return result;
}

const joinEntries = (
  left: ClosingEntries,
  right: ClosingEntries,
): ClosingEntries => ({
  ...right,
  days: [...left.days, ...right.days],
  records: [...left.records, ...right.records],
  moves: [...left.moves, ...right.moves],
  purchases: [...left.purchases, ...right.purchases],
});

/**
 * Builds the closings of the months `from` through `to`, each on the one before it, reading up to
 * `limit` months ahead while the earlier ones are summed. Stops at the first month that cannot be read.
 * The first closing of a chain (no `previous`) also reads the month before it: a day expected, or a
 * payment due, in the month before the starting day still counts when it arrives or is paid after it, and
 * nothing else would hold it once the recent window starts after the closing.
 */
export async function buildClosings(
  months: readonly string[],
  previous: ClosingState | null,
  read: (month: string) => Promise<ClosingEntries>,
  limit = 3,
): Promise<ClosingState[]> {
  const readFirst = async (month: string) => {
    if (previous !== null) return read(month);
    const [before, here] = await Promise.all([
      read(getPreviousMonth(month)),
      read(month),
    ]);
    return joinEntries(before, here);
  };
  const reads = months.reduce<Promise<ClosingEntries>[]>(
    (started, month, index) => [
      ...started,
      index === 0
        ? readFirst(month)
        : index < limit
          ? read(month)
          : started[index - limit].then(
              () => read(month),
              () => read(month),
            ),
    ],
    [],
  );
  reads.forEach((pending) => pending.catch(() => undefined));
  const result = await months.reduce<Promise<ClosingState[]>>(
    async (done, month, index) => {
      const built = await done;
      const entries = await reads[index];
      return [...built, closing(month, built.at(-1) ?? previous, entries)];
    },
    Promise.resolve([]),
  );
  return result;
}
