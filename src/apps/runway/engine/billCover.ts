import { addUtcDays } from '@apps/runway/engine/dates';
import type { BillPayment } from '@apps/runway/engine/demands';
import type { Cents, DateOnly } from '@apps/runway/types';

/** How many days ahead a bill's gap is covered from Free to Spend, at the least; a pay further off than this stretches it to that pay. */
export const BILL_COVER_DAYS = 30;

export interface BillCoverBill {
  id: string;
  name: string;
  /** False for a bill with no due date: nothing to cover it by. */
  isDated: boolean;
}

export interface BillCoverInput {
  today: DateOnly;
  /** The bills in plan order (Must, Should, Want, then rank): money runs out on the later ones first. */
  bills: readonly BillCoverBill[];
  payments: Readonly<Record<string, readonly BillPayment[]>>;
  /** The first income day still to come, or null when none is. */
  nextPayOn: DateOnly | null;
  /** Free to Spend before anything is covered. */
  freeToSpendCents: Cents;
}

export interface BillCoverPayment {
  billId: string;
  name: string;
  dueOn: DateOnly;
  payOn: DateOnly;
  /** What the pays before it leave of it, before Free to Spend steps in. */
  gapCents: Cents;
  coveredCents: Cents;
  /** What is still missing once Free to Spend ran out. */
  shortCents: Cents;
}

export interface BillCover {
  /** The last day a payment is covered for. */
  through: DateOnly;
  payments: BillCoverPayment[];
  coveredCents: Cents;
  coveredByBill: Record<string, Cents>;
}

/** The last day a bill's gap is covered for: 30 days out, or the next pay when that is further. */
export const getCoverThrough = (
  today: DateOnly,
  nextPayOn: DateOnly | null,
): DateOnly => Math.max(addUtcDays(today, BILL_COVER_DAYS), nextPayOn ?? 0);

/** The key a payment's cover is read by: the bill and the due date it is marked paid by. */
export const coverKey = (billId: string, dueOn: DateOnly) =>
  `${billId}:${dueOn}`;

/** What Free to Spend sets aside for each unpaid bill payment soon enough that its pays won't carry it in time: Must before Should before Want, then the earlier payment, until Free to Spend runs out. Nothing is stored; it moves as the bills, pays and money move. */
export function computeBillCover(input: BillCoverInput): BillCover {
  const through = getCoverThrough(input.today, input.nextPayOn);
  const gaps = input.bills
    .filter((bill) => bill.isDated)
    .flatMap((bill, rank) =>
      (input.payments[bill.id] ?? [])
        .filter(
          (payment) =>
            payment.paid === null &&
            payment.dueOn >= input.today &&
            payment.payOn <= through,
        )
        .map((payment) => ({
          rank,
          billId: bill.id,
          name: bill.name,
          dueOn: payment.dueOn,
          payOn: payment.payOn,
          gapCents: Math.max(
            0,
            payment.totalCents -
              payment.fundedCents -
              payment.parts.reduce((sum, part) => sum + part.cents, 0),
          ),
        }))
        .filter((gap) => gap.gapCents > 0),
    )
    .sort((a, b) => a.rank - b.rank || a.payOn - b.payOn);
  const walked = gaps.reduce<{ left: Cents; payments: BillCoverPayment[] }>(
    (acc, { rank: _rank, ...gap }) => {
      const coveredCents = Math.min(gap.gapCents, Math.max(0, acc.left));
      return {
        left: acc.left - coveredCents,
        payments: [
          ...acc.payments,
          { ...gap, coveredCents, shortCents: gap.gapCents - coveredCents },
        ],
      };
    },
    { left: input.freeToSpendCents, payments: [] },
  );
  const coveredByBill = walked.payments.reduce<Record<string, Cents>>(
    (sums, payment) => ({
      ...sums,
      [payment.billId]: (sums[payment.billId] ?? 0) + payment.coveredCents,
    }),
    {},
  );
  const result: BillCover = {
    through,
    payments: walked.payments,
    coveredCents: walked.payments.reduce(
      (sum, payment) => sum + payment.coveredCents,
      0,
    ),
    coveredByBill,
  };
  return result;
}

/** What Free to Spend covers of one payment; nothing when it isn't in the cover. */
export const getCoveredCents = (
  cover: Pick<BillCover, 'payments'> | null,
  billId: string,
  dueOn: DateOnly,
): Cents =>
  cover?.payments.find(
    (payment) => payment.billId === billId && payment.dueOn === dueOn,
  )?.coveredCents ?? 0;
