import { addUtcDays } from './dates';
import type { BillPayment } from './demands';
import type { DateOnly } from '@apps/runway/types';

export type BillCoverage =
  | { kind: 'noBills' }
  | { kind: 'covered'; through: DateOnly }
  | {
      kind: 'gap';
      /** The last day every payment before the first gap is set aside for; null when the first payment is the gap. */
      through: DateOnly | null;
      billId: string;
      dueOn: DateOnly;
    };

/**
 * How far the plan sets bills aside. A payment is covered once it is paid, set aside in full or has an
 * income day before it that will set it aside; a payment with none left is a gap in the plan, not in the
 * person's money.
 */
export function getBillCoverage(
  billIds: readonly string[],
  payments: Readonly<Record<string, BillPayment[]>>,
  today: DateOnly,
  horizon: DateOnly,
): BillCoverage {
  if (billIds.length === 0) return { kind: 'noBills' };
  const upcoming = billIds
    .flatMap((billId) =>
      (payments[billId] ?? [])
        .filter((payment) => payment.dueOn >= today && payment.paid === null)
        .map((payment) => ({ billId, payment })),
    )
    .sort(
      (a, b) =>
        a.payment.dueOn - b.payment.dueOn || (a.billId < b.billId ? -1 : 1),
    );
  const gap = upcoming.find(
    ({ payment }) =>
      payment.fundedCents < payment.totalCents && payment.parts.length === 0,
  );
  if (!gap) return { kind: 'covered', through: horizon };
  const through = addUtcDays(gap.payment.dueOn, -1);
  return {
    kind: 'gap',
    through: through >= today ? through : null,
    billId: gap.billId,
    dueOn: gap.payment.dueOn,
  };
}
