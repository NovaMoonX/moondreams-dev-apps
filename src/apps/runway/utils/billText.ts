import {
  BILL_FREQUENCY_LABELS,
  BILL_FREQUENCIES,
} from '@apps/runway/constants';
import type { BillPayment } from '@apps/runway/engine/demands';
import type { BillFundedBy, Schedule } from '@apps/runway/types';
import { formatDateUTC } from '@/utils/formatUtils';
import { formatCents } from '@/utils/moneyUtils';

export function describeBillRepeat(kind: Schedule['kind']) {
  const known = BILL_FREQUENCIES.find((frequency) => frequency === kind);
  const result = known ? BILL_FREQUENCY_LABELS[known] : kind;
  return result;
}

/** When a bill falls due, in the words a row and a change entry share: "Due Dec 1" or "Monthly from Dec 1". */
export function describeBillTiming(schedule: Schedule) {
  const start = schedule.anchor === null ? '' : formatDateUTC(schedule.anchor);
  if (schedule.kind === 'once') return `Due ${start}`;
  const result = `${describeBillRepeat(schedule.kind)} from ${start}`;
  return result;
}

/** What a bill's next payment sets aside from each income day: "$62.50 from each of the next 4 income days". */
export function describeBillFunding(
  payment: BillPayment | null,
  fundedBy: BillFundedBy,
) {
  if (!payment || payment.parts.length === 0) {
    return 'No income day comes before it is due.';
  }
  const amounts = payment.parts.map((part) => part.cents);
  const count = amounts.length;
  const first = formatCents(amounts[0]);
  if (count === 1) {
    return `${first} from the income on ${formatDateUTC(payment.parts[0].day.on)}`;
  }
  const last = amounts[count - 1];
  const scope =
    fundedBy.kind === 'chosen'
      ? `of the ${count} days you chose`
      : `of the next ${count} income days`;
  const isEven = amounts.every((cents) => cents === amounts[0]);
  if (isEven) return `${first} from each ${scope}`;
  const result = `${first} from each ${scope}, ${formatCents(last)} at the end`;
  return result;
}
