import {
  BILL_WORDS,
  BILL_FREQUENCY_LABELS,
  BILL_FREQUENCIES,
  GROUP_WORDS,
} from '@apps/runway/constants';
import type { BillPayment } from '@apps/runway/engine/demands';
import { monthlyTotal } from '@apps/runway/engine/groups';
import type {
  GroupEnvelopeMember,
  GroupMember,
  GroupTotal,
} from '@apps/runway/engine/groups';
import type { BillFundedBy, MoneyRange, Schedule } from '@apps/runway/types';
import { formatDateShortUTC, formatDateUTC } from '@/utils/formatUtils';
import { formatCents } from '@/utils/moneyUtils';

/** What a group's bills and envelopes come to in a month, the same figure on its heading and in its sheet: "$140 to $180". */
export const describeGroupTotal = (range: MoneyRange) =>
  range.lowCents === range.highCents
    ? formatCents(range.lowCents)
    : `${formatCents(range.lowCents)} to ${formatCents(range.highCents)}`;

/** What a group's heading and sheet lead with: its monthly total, or the one-time bills when those are all it has, or that it is empty. `amount` is the private part. */
export function describeGroupLead(total: GroupTotal, memberCount: number) {
  if (memberCount === 0)
    return { amount: null, rest: GROUP_WORDS.noBills, isOneTime: false };
  const { oneTime } = total;
  if (total.total.highCents === 0 && oneTime.count > 0) {
    return {
      amount: describeGroupTotal(oneTime.range),
      rest:
        oneTime.count === 1 && oneTime.dueOn !== null
          ? GROUP_WORDS.oneTimeDue(formatDateShortUTC(oneTime.dueOn))
          : GROUP_WORDS.oneTimeCount(oneTime.count),
      isOneTime: true,
    };
  }
  return {
    amount: describeGroupTotal(total.total),
    rest: 'a month',
    isOneTime: false,
  };
}

/** The bill and envelope names a group's monthly figure stands for; every name only when none is counted (a group of one-time bills). */
export function getGroupMemberNames(
  bills: readonly (GroupMember & { name: string })[],
  envelopes: readonly (GroupEnvelopeMember & { name: string })[],
  today: number,
) {
  const counted = [
    ...bills.filter(
      (member) => monthlyTotal([member], today).total.highCents > 0,
    ),
    ...envelopes.filter(
      (member) => monthlyTotal([], today, [member]).total.highCents > 0,
    ),
  ];
  return (counted.length > 0 ? counted : [...bills, ...envelopes]).map(
    ({ name }) => name,
  );
}

export function describeBillRepeat(kind: Schedule['kind']) {
  const known = BILL_FREQUENCIES.find((frequency) => frequency === kind);
  const result = known ? BILL_FREQUENCY_LABELS[known] : kind;
  return result;
}

/** When a bill falls due, in the words a row and a change entry share: "Due Dec 1", "Monthly from Dec 1" or, with no date yet, "Monthly, date later". */
export function describeBillTiming(schedule: Schedule) {
  if (schedule.anchor === null) {
    return schedule.kind === 'once'
      ? 'Due date later'
      : `${describeBillRepeat(schedule.kind)}, date later`;
  }
  const start = formatDateUTC(schedule.anchor);
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
  const result = `Up to ${first} from each ${scope}, ${formatCents(last)} on the last`;
  return result;
}

/** Where a payment stands: paid, set aside in part ("$400.00 of $1,200.00 set aside · 1 of 3 days"), set aside in full, or nothing yet (null). */
export function describeBillProgress(payment: BillPayment) {
  const { paid, fundedCents, totalCents } = payment;
  if (paid) {
    const when =
      paid.paidOn < payment.dueOn
        ? `Paid ahead on ${formatDateUTC(paid.paidOn)}`
        : `Paid ${formatDateUTC(paid.paidOn)}`;
    return paid.fromFreeCents > 0
      ? `${when} · ${formatCents(paid.fromFreeCents)} came from Free to Spend`
      : when;
  }
  if (fundedCents <= 0) return null;
  if (fundedCents >= totalCents) return BILL_WORDS.readyToPay;
  const days = payment.fundedDays + payment.parts.length;
  return `${formatCents(fundedCents)} of ${formatCents(totalCents)} set aside · ${payment.fundedDays} of ${days} income days`;
}
