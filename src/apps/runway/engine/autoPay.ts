import { toComparable } from '@/utils/optionMatchUtils';
import { AUTO_PAY_WORDS } from '@apps/runway/constants';
import type {
  Cents,
  DateOnly,
  Level,
  OpenMove,
  OpenPurchase,
  BillSealed,
} from '@apps/runway/types';

import { DAY_MS, addUtcDays, toDayStamp } from './dates';
import { isTrackingLevel } from './level';
import type { PaidPayment } from './progress';

/** One payment of a bill that pays itself: what it can come to (equal ends for an exact bill) and the mark that paid it, if any. */
export interface AutoPayment {
  dueOn: DateOnly;
  lowCents: Cents;
  highCents: Cents;
  paid: PaidPayment | null;
}

/** A bill that pays itself, with what the engine reads of it. */
export interface AutoBill {
  id: string;
  name: string;
  /** The first day its payments are tracked from. */
  since: DateOnly;
  /** The card it is charged to; null when it is pulled from the bank. */
  cardId: string | null;
  /** The account it is pulled from; null when the plan has no one account to read it as. */
  accountId: string | null;
  /** The comparable merchant names it has learned. */
  merchantKeys: readonly string[];
  payments: readonly AutoPayment[];
  /** Due days of payments whose automatic mark was taken back: they are the person's to mark from then on. */
  undoneDueOn: readonly DateOnly[];
}

/** Whether a bill's setting means the app pays it for the person: only from Track up. */
export const isAutoBill = (
  payload: Pick<BillSealed, 'paysItself'>,
  level: Level,
): boolean => payload.paysItself === true && isTrackingLevel(level);

/** Whether the payment due on `dueOn` is left to the app: the bill pays itself and the person has not taken a mark of it back. */
export const isSelfPaying = (
  bill: {
    paysItself?: boolean | null;
    undoneDueOn?: readonly DateOnly[];
  },
  dueOn: DateOnly,
): boolean =>
  bill.paysItself === true && !(bill.undoneDueOn ?? []).includes(dueOn);

/** The due days of each bill's payments that have a mark taken back, from the moves read. */
export function getUndoneDueDays(
  moves: readonly OpenMove[],
): Record<string, DateOnly[]> {
  const reversed = new Set(
    moves.flatMap((move) => (move.reversesMoveId ? [move.reversesMoveId] : [])),
  );
  const result = moves.reduce<Record<string, DateOnly[]>>((acc, move) => {
    if (
      move.kind !== 'billPaid' ||
      move.reversesMoveId ||
      move.refId === null ||
      !reversed.has(move.id)
    )
      return acc;
    const days = acc[move.refId] ?? [];
    return days.includes(move.date)
      ? acc
      : { ...acc, [move.refId]: [...days, move.date] };
  }, {});
  return result;
}

/** What names one payment, with no name in it: the bill's id and the due day. */
export const getPaymentKey = (billId: string, dueOn: DateOnly) =>
  `${billId}:${toDayStamp(dueOn)}`;

/** The payments that already have a charge matched to them. */
export const getMatchedKeys = (
  purchases: readonly Pick<OpenPurchase, 'billRef'>[],
): Set<string> =>
  new Set(
    purchases.flatMap((purchase) =>
      purchase.billRef
        ? [getPaymentKey(purchase.billRef.billId, purchase.billRef.dueOn)]
        : [],
    ),
  );

const isLinkAt = (level: Level) => level === 'link';

/** A payment with no settled amount behind it: unmarked, or marked by the app and not yet tied to a charge. */
const isOpenPayment = (
  bill: AutoBill,
  payment: AutoPayment,
  matched: ReadonlySet<string>,
) =>
  payment.dueOn >= bill.since &&
  !bill.undoneDueOn.includes(payment.dueOn) &&
  !matched.has(getPaymentKey(bill.id, payment.dueOn)) &&
  (payment.paid === null ||
    (payment.paid.auto != null && payment.paid.auto.purchaseId === null));

export interface AutoMark {
  billId: string;
  billName: string;
  dueOn: DateOnly;
  /** The planned amount, or the top of a range. */
  amountCents: Cents;
  /** A ranged bill's top of range: the real amount is still to come. */
  isEstimate: boolean;
  /** The card it is charged to; null when it comes from the bank. */
  cardId: string | null;
}

/**
 * The payments the app marks paid now: a bill that pays itself, unpaid, due today or before, inside what is tracked, with no mark ever
 * taken back. A bank-paid bill at Link waits for its charge instead, since Free to Spend there comes from the bank's balance.
 */
export function findAutoMarks(input: {
  level: Level;
  today: DateOnly;
  bills: readonly AutoBill[];
}): AutoMark[] {
  if (!isTrackingLevel(input.level)) return [];
  const result = input.bills
    .filter((bill) => !(isLinkAt(input.level) && bill.cardId === null))
    .flatMap((bill) =>
      bill.payments
        .filter(
          (payment) =>
            payment.paid === null &&
            payment.dueOn <= input.today &&
            payment.dueOn >= bill.since &&
            !bill.undoneDueOn.includes(payment.dueOn),
        )
        .map((payment): AutoMark => ({
          billId: bill.id,
          billName: bill.name,
          dueOn: payment.dueOn,
          amountCents: payment.highCents,
          isEstimate: payment.lowCents !== payment.highCents,
          cardId: bill.cardId,
        })),
    )
    .sort((a, b) => a.dueOn - b.dueOn || a.billName.localeCompare(b.billName));
  return result;
}

/** A bank charge a bill's payment could be: bought on its card or pulled from its account, and not already somewhere else. */
const isCharge = (purchase: OpenPurchase) =>
  purchase.source === 'link' &&
  purchase.amountCents > 0 &&
  purchase.pairedWithId === null &&
  purchase.incomeDayId === null &&
  (purchase.billRef ?? null) === null &&
  (purchase.costRef ?? null) === null;

const isOnBill = (
  bill: AutoBill,
  purchase: OpenPurchase,
  pullAccountId: string | null,
) => {
  if (bill.cardId !== null) return purchase.paidByCardId === bill.cardId;
  const accountId = bill.accountId ?? pullAccountId;
  return (
    accountId !== null &&
    purchase.accountId === accountId &&
    (purchase.paidByCardId ?? null) === null
  );
};

const getPurchaseKeys = (purchase: OpenPurchase) =>
  [purchase.merchant, purchase.bankName].flatMap((name) => {
    const key = name ? toComparable(name) : '';
    return key === '' ? [] : [key];
  });

/** The comparable names a charge carries, which a bill learns when the charge is matched to it. */
export const getMerchantKeys = (purchase: OpenPurchase): string[] => [
  ...new Set(getPurchaseKeys(purchase)),
];

const MIN_NAME_LENGTH = 3;

const isNamedLike = (bill: AutoBill, purchase: OpenPurchase) => {
  const keys = getPurchaseKeys(purchase);
  if (bill.merchantKeys.length > 0) {
    return keys.some((key) => bill.merchantKeys.includes(key));
  }
  const name = toComparable(bill.name);
  return (
    name.length >= MIN_NAME_LENGTH &&
    keys.some(
      (key) =>
        key.length >= MIN_NAME_LENGTH &&
        (key.includes(name) || name.includes(key)),
    )
  );
};

const isNearDue = (purchase: OpenPurchase, dueOn: DateOnly, days: number) =>
  purchase.date >= addUtcDays(dueOn, -days) &&
  purchase.date <= addUtcDays(dueOn, days);

export interface ChargeMatch {
  billId: string;
  billName: string;
  payment: AutoPayment;
  purchase: OpenPurchase;
}

/**
 * The charges that are clearly a bill's payment, at Link: waiting at the bank, on the bill's card or account, dated within three days
 * of the due day, inside the bill's range, named like the bill, and the only such charge for that payment. One charge never settles two
 * payments and one payment never takes two charges.
 */
export function findChargeMatches(input: {
  level: Level;
  today: DateOnly;
  bills: readonly AutoBill[];
  /** What the bank brought in that still waits for a home, history left out. */
  waiting: readonly OpenPurchase[];
  /** The plan's one pull account, which a bank-paid bill with no account of its own reads as. */
  pullAccountId: string | null;
  matched: ReadonlySet<string>;
}): ChargeMatch[] {
  if (!isLinkAt(input.level)) return [];
  const charges = input.waiting.filter(
    (purchase) =>
      isCharge(purchase) && purchase.needsHome && purchase.status !== 'pending',
  );
  const options = input.bills.flatMap((bill) =>
    bill.payments
      .filter(
        (payment) =>
          payment.dueOn <= input.today &&
          isOpenPayment(bill, payment, input.matched),
      )
      .map((payment) => ({
        bill,
        payment,
        candidates: charges.filter(
          (purchase) =>
            isOnBill(bill, purchase, input.pullAccountId) &&
            isNearDue(purchase, payment.dueOn, AUTO_PAY_WORDS.matchDays) &&
            purchase.amountCents >= payment.lowCents &&
            purchase.amountCents <= payment.highCents &&
            isNamedLike(bill, purchase),
        ),
      })),
  );
  const claims = options.reduce<Map<string, number>>((acc, option) => {
    option.candidates.forEach((purchase) =>
      acc.set(purchase.id, (acc.get(purchase.id) ?? 0) + 1),
    );
    return acc;
  }, new Map());
  const result = options.flatMap(({ bill, payment, candidates }) =>
    candidates.length === 1 && claims.get(candidates[0].id) === 1
      ? [
          {
            billId: bill.id,
            billName: bill.name,
            payment,
            purchase: candidates[0],
          },
        ]
      : [],
  );
  return result;
}

/** The distance of an amount from a range: zero inside it. */
const getAmountDistance = (payment: AutoPayment, amountCents: Cents) =>
  Math.max(0, payment.lowCents - amountCents, amountCents - payment.highCents);

/**
 * The charges a person can pick as a payment's, closest first (by how far the amount is from what the payment can come to, then how many
 * days from the due day): on the bill's card or account, from five days before the due day to ten after, and not already matched, paired
 * or brought in as a link's history.
 */
export function rankChargeCandidates(input: {
  bill: AutoBill;
  payment: AutoPayment;
  purchases: readonly OpenPurchase[];
  pullAccountId: string | null;
  isLinkHistory: (purchase: OpenPurchase) => boolean;
}): OpenPurchase[] {
  const { bill, payment } = input;
  const from = addUtcDays(payment.dueOn, -AUTO_PAY_WORDS.pickDaysBefore);
  const to = addUtcDays(payment.dueOn, AUTO_PAY_WORDS.pickDaysAfter);
  const result = [
    ...new Map(
      input.purchases.map((purchase) => [purchase.id, purchase]),
    ).values(),
  ]
    .filter(
      (purchase) =>
        isCharge(purchase) &&
        purchase.date >= from &&
        purchase.date <= to &&
        isOnBill(bill, purchase, input.pullAccountId) &&
        !input.isLinkHistory(purchase),
    )
    .sort(
      (a, b) =>
        getAmountDistance(payment, a.amountCents) -
          getAmountDistance(payment, b.amountCents) ||
        Math.abs(a.date - payment.dueOn) - Math.abs(b.date - payment.dueOn) ||
        (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
    );
  return result;
}

/** A question a bill that pays itself leaves for the person. */
export type AutoCheck =
  | {
      /** Track: a ranged bill was marked at the top of its range; the person says what it came to. */
      kind: 'amount';
      billId: string;
      billName: string;
      dueOn: DateOnly;
      moveId: string;
    }
  | {
      /** Link: no charge was matched to the payment. */
      kind: 'charge';
      billId: string;
      billName: string;
      dueOn: DateOnly;
    };

/**
 * What the app could not settle by itself. At Track, a ranged bill's automatic mark still holds the top of its range. At Link, a payment
 * three or more days past due has no clear charge (until the question has been dropped for good, or put off, which the caller passes in
 * `snoozed` as payment keys).
 */
export function findAutoChecks(input: {
  level: Level;
  today: DateOnly;
  bills: readonly AutoBill[];
  matched: ReadonlySet<string>;
  snoozed: ReadonlySet<string>;
}): AutoCheck[] {
  const result = input.bills
    .flatMap((bill): AutoCheck[] =>
      bill.payments.flatMap((payment): AutoCheck[] => {
        if (
          !isTrackingLevel(input.level) ||
          payment.dueOn < bill.since ||
          bill.undoneDueOn.includes(payment.dueOn)
        )
          return [];
        const base = {
          billId: bill.id,
          billName: bill.name,
          dueOn: payment.dueOn,
        };
        if (!isLinkAt(input.level)) {
          const auto = payment.paid?.auto ?? null;
          return payment.paid !== null &&
            auto !== null &&
            auto.isEstimate &&
            auto.purchaseId === null
            ? [{ kind: 'amount', ...base, moveId: payment.paid.moveId }]
            : [];
        }
        const age = input.today - payment.dueOn;
        return isOpenPayment(bill, payment, input.matched) &&
          age >= AUTO_PAY_WORDS.matchDays * DAY_MS &&
          age <= AUTO_PAY_WORDS.askDays * DAY_MS &&
          !input.snoozed.has(getPaymentKey(bill.id, payment.dueOn))
          ? [{ kind: 'charge', ...base }]
          : [];
      }),
    )
    .sort((a, b) => a.dueOn - b.dueOn || a.billName.localeCompare(b.billName));
  return result;
}
