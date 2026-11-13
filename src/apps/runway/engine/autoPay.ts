import { toComparable } from '@/utils/optionMatchUtils';
import { AUTO_PAY_DAYS } from '@apps/runway/constants';
import type {
  Cents,
  DateOnly,
  Level,
  OpenMove,
  OpenPurchase,
  BillSealed,
} from '@apps/runway/types';

import { DAY_MS, addUtcDays, startOfUtcDay, toDayStamp } from './dates';
import { isTrackingLevel } from './level';
import type { PaidPayment } from './progress';

export interface AutoPayment {
  dueOn: DateOnly;
  /** The day it is paid, on or before `dueOn`; missing reads as `dueOn`. */
  payOn?: DateOnly;
  lowCents: Cents;
  highCents: Cents;
  paid: PaidPayment | null;
}

export interface AutoBill {
  id: string;
  name: string;
  /** The first due day the app handles: never before tracking began or the day the setting was turned on. */
  since: DateOnly;
  /** Null when the bill is pulled from the bank. */
  cardId: string | null;
  accountId: string | null;
  merchantKeys: readonly string[];
  payments: readonly AutoPayment[];
  undoneDueOn: readonly DateOnly[];
}

/** Whether a bill's setting means the app pays it for the person: only from Track up. */
export const isAutoBill = (
  payload: Pick<BillSealed, 'paysItself'>,
  level: Level,
): boolean => payload.paysItself === true && isTrackingLevel(level);

/** What decides whether the app pays one of a bill's payments. */
export interface SelfPayingFacts {
  paysItself?: boolean | null;
  undoneDueOn?: readonly DateOnly[];
  paysItselfFrom?: DateOnly | null;
  isAtLink?: boolean;
}

/** Whether the payment due on `dueOn` is left to the app; at Link one unmarked past the asking window goes back to the person. */
export const isSelfPaying = (
  bill: SelfPayingFacts,
  dueOn: DateOnly,
  today?: DateOnly,
): boolean =>
  bill.paysItself === true &&
  !(bill.undoneDueOn ?? []).includes(dueOn) &&
  dueOn >= (bill.paysItselfFrom ?? 0) &&
  !(
    bill.isAtLink === true &&
    today !== undefined &&
    today - dueOn > AUTO_PAY_DAYS.askDays * DAY_MS
  );

/** The day the setting took effect: the later of the day the newest unbroken run with it on was saved (one change's versions share a `createdAt`) and its earliest `effectiveFrom`; null when the newest has it off. */
export function getPaysItselfFrom(
  versions: readonly {
    createdAt: number;
    effectiveFrom?: DateOnly | null;
    payload: { paysItself?: boolean | null };
  }[],
): DateOnly | null {
  const stamps = [
    ...new Set(versions.map((version) => version.createdAt)),
  ].sort((a, b) => b - a);
  const run = stamps.reduce<{ from: number | null; isBroken: boolean }>(
    (acc, createdAt) => {
      if (acc.isBroken) return acc;
      const isOn = versions
        .filter((version) => version.createdAt === createdAt)
        .every((version) => version.payload.paysItself === true);
      return isOn
        ? { from: createdAt, isBroken: false }
        : { ...acc, isBroken: true };
    },
    { from: null, isBroken: false },
  );
  if (run.from === null) return null;
  const firstEffective = versions
    .filter((version) => version.createdAt === run.from)
    .map((version) => version.effectiveFrom ?? 0);
  return Math.max(startOfUtcDay(run.from), ...firstEffective);
}

/** What names one payment, with no name in it: the bill's id and the due day. */
export const getPaymentKey = (billId: string, dueOn: DateOnly) =>
  `${billId}:${toDayStamp(dueOn)}`;

/** The due days of each bill's payments whose newest mark the person took back; a correction or a match writes a later mark and is not that, and neither is the app reversing its own match. */
export function getUndoneDueDays(
  moves: readonly OpenMove[],
): Record<string, DateOnly[]> {
  const reversed = new Set(
    moves.flatMap((move) => (move.reversesMoveId ? [move.reversesMoveId] : [])),
  );
  const newest = moves.reduce<Map<string, OpenMove>>((acc, move) => {
    if (move.kind !== 'billPaid' || move.reversesMoveId || move.refId === null)
      return acc;
    const key = getPaymentKey(move.refId, move.date);
    const seen = acc.get(key);
    const isNewer =
      !seen ||
      move.createdAt > seen.createdAt ||
      (move.createdAt === seen.createdAt && move.id > seen.id);
    return isNewer ? acc.set(key, move) : acc;
  }, new Map());
  return [...newest.values()].reduce<Record<string, DateOnly[]>>(
    (acc, move) =>
      move.refId === null ||
      !reversed.has(move.id) ||
      (move.kind === 'billPaid' && move.payload.auto?.purchaseId != null)
        ? acc
        : { ...acc, [move.refId]: [...(acc[move.refId] ?? []), move.date] },
    {},
  );
}

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
  /** The day the app records it paid: the bill's pay day. */
  paidOn: DateOnly;
  /** The planned amount, or the top of a range. */
  amountCents: Cents;
  /** A ranged bill's top of range: the real amount is still to come. */
  isEstimate: boolean;
  cardId: string | null;
}

/** The payments to mark paid now: unpaid, due today or before, on or after `since`, never taken back. A bank-paid bill at Link waits for its charge instead, since Free to Spend there comes from the bank's balance. */
export function findAutoMarks(input: {
  level: Level;
  today: DateOnly;
  bills: readonly AutoBill[];
  /** Payments whose charge waits in Needs a home (`findHeldPaymentKeys`), left unmarked for up to the asking window so a drop from Link never counts the payment twice. */
  held?: ReadonlySet<string>;
}): AutoMark[] {
  if (!isTrackingLevel(input.level) || isLinkAt(input.level)) return [];
  const result = input.bills
    .flatMap((bill) =>
      bill.payments
        .filter(
          (payment) =>
            payment.paid === null &&
            (payment.payOn ?? payment.dueOn) <= input.today &&
            payment.dueOn >= bill.since &&
            !bill.undoneDueOn.includes(payment.dueOn) &&
            !(
              input.held?.has(getPaymentKey(bill.id, payment.dueOn)) &&
              input.today - payment.dueOn <= AUTO_PAY_DAYS.askDays * DAY_MS
            ),
        )
        .map((payment): AutoMark => ({
          billId: bill.id,
          billName: bill.name,
          dueOn: payment.dueOn,
          paidOn: Math.max(payment.payOn ?? payment.dueOn, bill.since),
          amountCents: payment.highCents,
          isEstimate: payment.lowCents !== payment.highCents,
          cardId: bill.cardId,
        })),
    )
    .sort((a, b) => a.dueOn - b.dueOn || a.billName.localeCompare(b.billName));
  return result;
}

/** A bank charge a bill's payment could be: not already somewhere else. */
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

/** Whether a charge carries a name the bill has learned, or else one that contains or is contained by the bill's own name. */
export const isNamedLike = (
  bill: Pick<AutoBill, 'name' | 'merchantKeys'>,
  purchase: OpenPurchase,
) => {
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

interface ChargeInput {
  level: Level;
  today: DateOnly;
  bills: readonly AutoBill[];
  /** What the bank brought in that still waits for a home, history left out. */
  waiting: readonly OpenPurchase[];
  /** The plan's one pull account, which a bank-paid bill with no account of its own reads as. */
  pullAccountId: string | null;
  matched: ReadonlySet<string>;
}

const getChargeOptions = (input: ChargeInput, isPendingKept: boolean) => {
  if (!isLinkAt(input.level)) return [];
  const charges = input.waiting.filter(
    (purchase) =>
      isCharge(purchase) &&
      purchase.needsHome &&
      (isPendingKept || purchase.status !== 'pending'),
  );
  return input.bills.flatMap((bill) =>
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
            isNearDue(purchase, payment.dueOn, AUTO_PAY_DAYS.matchDays) &&
            purchase.amountCents >= payment.lowCents &&
            purchase.amountCents <= payment.highCents &&
            isNamedLike(bill, purchase),
        ),
      })),
  );
};

/** The waiting charges a bill's open payment could take, so a rule leaves them for the bill matcher. */
export const findBillCandidateIds = (input: ChargeInput): Set<string> =>
  new Set(
    getChargeOptions(input, true).flatMap(({ candidates }) =>
      candidates.map((purchase) => purchase.id),
    ),
  );

/** The payments, at any level, that a waiting charge could settle: left to the charge matcher rather than marked. */
export const findHeldPaymentKeys = (
  input: Omit<ChargeInput, 'level'>,
): Set<string> =>
  new Set(
    getChargeOptions({ ...input, level: 'link' }, true).flatMap(
      ({ bill, payment, candidates }) =>
        candidates.some((purchase) => purchase.assignedBy !== 'person')
          ? [getPaymentKey(bill.id, payment.dueOn)]
          : [],
    ),
  );

/** The charges that are clearly a bill's payment, at Link: the only candidate for that payment, and claimed by no other payment. The person's send-backs are left alone. */
export function findChargeMatches(input: ChargeInput): ChargeMatch[] {
  const options = getChargeOptions(input, false).map((option) => ({
    ...option,
    candidates: option.candidates.filter(
      (purchase) => purchase.assignedBy !== 'person',
    ),
  }));
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

const getAmountDistance = (payment: AutoPayment, amountCents: Cents) =>
  Math.max(0, payment.lowCents - amountCents, amountCents - payment.highCents);

/** The charges a person can pick as a payment's, closest first: on the bill's card or account, five days before the due day to ten after, not matched, paired or a link's history. */
export function rankChargeCandidates(input: {
  bill: AutoBill;
  payment: AutoPayment;
  purchases: readonly OpenPurchase[];
  pullAccountId: string | null;
  isLinkHistory: (purchase: OpenPurchase) => boolean;
}): OpenPurchase[] {
  const { bill, payment } = input;
  const from = addUtcDays(payment.dueOn, -AUTO_PAY_DAYS.pickDaysBefore);
  const to = addUtcDays(payment.dueOn, AUTO_PAY_DAYS.pickDaysAfter);
  const result = [
    ...new Map(
      input.purchases.map((purchase) => [purchase.id, purchase]),
    ).values(),
  ]
    .filter(
      (purchase) =>
        isCharge(purchase) &&
        purchase.status !== 'pending' &&
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
      /** Track: a ranged bill was marked at the top of its range. */
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

/** What the app could not settle by itself: at Track a ranged bill's mark still at the top of its range, at Link a payment three or more days past due with no charge (until `snoozed`, as payment keys). */
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
          age >= AUTO_PAY_DAYS.matchDays * DAY_MS &&
          age <= AUTO_PAY_DAYS.askDays * DAY_MS &&
          !input.snoozed.has(getPaymentKey(bill.id, payment.dueOn))
          ? [{ kind: 'charge', ...base }]
          : [];
      }),
    )
    .sort((a, b) => a.dueOn - b.dueOn || a.billName.localeCompare(b.billName));
  return result;
}
