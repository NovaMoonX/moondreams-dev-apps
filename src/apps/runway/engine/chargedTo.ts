import type { Cents, DateOnly, OpenPurchase } from '@apps/runway/types';

import { isNamedLike } from './autoPay';
import { DAY_MS, addUtcDays } from './dates';

/** The card or account something is charged to. */
export interface ChargedPlace {
  kind: 'card' | 'account';
  id: string;
}

export interface ChargedToBill {
  id: string;
  name: string;
  merchantKeys: readonly string[];
  /** The card or account the bill names or resolves to; null when it names none. */
  place: ChargedPlace | null;
  /** The bill itself names a card or account, so one charge elsewhere is not enough to suggest a change. */
  isExplicit: boolean;
  payments: readonly {
    dueOn: DateOnly;
    payOn?: DateOnly;
    lowCents: Cents;
    highCents: Cents;
  }[];
}

export interface ChargedToHint {
  billId: string;
  place: ChargedPlace;
  /** Recent charges of the bill that were on that place. */
  chargeCount: number;
  lastChargedOn: DateOnly;
}

const WINDOW_DAYS = 75;
const NEAR_PAYMENT_DAYS = 5;
const AMOUNT_MARGIN_PERCENT = 10;
const AMOUNT_MARGIN_MIN_CENTS = 200;

export const isSamePlace = (a: ChargedPlace | null, b: ChargedPlace | null) =>
  a !== null && b !== null && a.kind === b.kind && a.id === b.id;

const getChargePlace = (purchase: OpenPurchase): ChargedPlace | null => {
  if (purchase.paidByCardId) return { kind: 'card', id: purchase.paidByCardId };
  return purchase.accountId
    ? { kind: 'account', id: purchase.accountId }
    : null;
};

const isCandidate = (purchase: OpenPurchase) =>
  purchase.source === 'link' &&
  purchase.amountCents > 0 &&
  purchase.status !== 'pending' &&
  purchase.pairedWithId === null &&
  purchase.incomeDayId === null &&
  (purchase.costRef ?? null) === null;

const getMargin = (cents: Cents) =>
  Math.max(
    Math.round((cents * AMOUNT_MARGIN_PERCENT) / 100),
    AMOUNT_MARGIN_MIN_CENTS,
  );

const isLikePayment = (bill: ChargedToBill, purchase: OpenPurchase) =>
  isNamedLike(bill, purchase) &&
  bill.payments.some(
    (payment) =>
      [payment.dueOn, payment.payOn ?? payment.dueOn].some(
        (on) => Math.abs(purchase.date - on) <= NEAR_PAYMENT_DAYS * DAY_MS,
      ) &&
      purchase.amountCents >= payment.lowCents - getMargin(payment.lowCents) &&
      purchase.amountCents <= payment.highCents + getMargin(payment.highCents),
  );

/** The bills whose recent bank charges were on a card or account other than the one the bill names. A bill that names none needs one charge; one that names a place needs its two newest charges on the same other place. */
export function findChargedToHints(input: {
  today: DateOnly;
  bills: readonly ChargedToBill[];
  purchases: readonly OpenPurchase[];
  isLinkHistory: (purchase: OpenPurchase) => boolean;
  isOpenPlace: (place: ChargedPlace) => boolean;
}): ChargedToHint[] {
  const from = addUtcDays(input.today, -WINDOW_DAYS);
  const charges = [
    ...new Map(
      input.purchases.map((purchase) => [purchase.id, purchase]),
    ).values(),
  ].filter(
    (purchase) =>
      isCandidate(purchase) &&
      purchase.date >= from &&
      purchase.date <= input.today &&
      !input.isLinkHistory(purchase),
  );
  return input.bills.flatMap((bill): ChargedToHint[] => {
    const evidence = charges
      .filter((purchase) =>
        purchase.billRef
          ? purchase.billRef.billId === bill.id
          : isLikePayment(bill, purchase),
      )
      .flatMap((purchase) => {
        const place = getChargePlace(purchase);
        return place ? [{ purchase, place }] : [];
      })
      .sort(
        (a, b) =>
          b.purchase.date - a.purchase.date ||
          (a.purchase.id < b.purchase.id ? -1 : 1),
      );
    const [newest, second] = evidence;
    if (
      !newest ||
      isSamePlace(newest.place, bill.place) ||
      !input.isOpenPlace(newest.place) ||
      (bill.isExplicit && !isSamePlace(second?.place ?? null, newest.place))
    ) {
      return [];
    }
    return [
      {
        billId: bill.id,
        place: newest.place,
        chargeCount: evidence.filter(({ place }) =>
          isSamePlace(place, newest.place),
        ).length,
        lastChargedOn: newest.purchase.date,
      },
    ];
  });
}
