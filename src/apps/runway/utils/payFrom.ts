import { PAID_FROM_WORDS } from '@apps/runway/constants';
import type { ResolvedSource } from '@apps/runway/store/selectors/runwaySelectors';
import type { BillFundedBy } from '@apps/runway/types';
import { toOrdinal } from '@apps/runway/utils/monthDays';

type PayFundedBy = Extract<BillFundedBy, { kind: 'pay' }>;

export interface PayOption {
  value: string;
  fundedBy: PayFundedBy;
  label: string;
}

const toValue = (payLineId: string, monthDay: number | null) =>
  `${payLineId}:${monthDay ?? ''}`;

export const toPayValue = (fundedBy: PayFundedBy) =>
  toValue(fundedBy.payLineId, fundedBy.monthDay);

const toDayWord = (day: number) =>
  day === 31 ? 'the last day' : `the ${toOrdinal(day)}`;

/** The pays a repeating bill can come from: one per day of the month for a monthly or twice-a-month pay, one by name for any other. Empty unless there is more than one to pick from. */
export function getPayOptions(plan: readonly ResolvedSource[]): PayOption[] {
  const isManySources = plan.length > 1;
  const options = plan.flatMap(({ version, payLines }) =>
    payLines.flatMap(({ item, version: line }): PayOption[] => {
      const { kind, monthDays } = line.payload.schedule;
      const isMonthly =
        (kind === 'monthly' || kind === 'twiceMonthly') && monthDays.length > 0;
      if (!isMonthly) {
        return [
          {
            value: toValue(item.id, null),
            fundedBy: { kind: 'pay', payLineId: item.id, monthDay: null },
            label: line.payload.name,
          },
        ];
      }
      return [...monthDays]
        .sort((a, b) => a - b)
        .map((day) => ({
          value: toValue(item.id, day),
          fundedBy: { kind: 'pay', payLineId: item.id, monthDay: day },
          label: `${isManySources ? `${version.payload.name} pay` : 'The pay'} on ${toDayWord(day)}`,
        }));
    }),
  );
  return options.length > 1 ? options : [];
}

/** Which pay a bill's choice names, in words; a pay that left the plan still has a name. */
export function describePayChoice(
  fundedBy: PayFundedBy,
  plan: readonly ResolvedSource[],
) {
  const found = getPayOptions(plan).find(
    (option) => option.value === toPayValue(fundedBy),
  );
  if (found) return found.label;
  const line = plan
    .flatMap(({ payLines }) => payLines)
    .find(({ item }) => item.id === fundedBy.payLineId);
  if (line && fundedBy.monthDay === null) return line.version.payload.name;
  if (fundedBy.monthDay !== null) {
    return `The pay on ${toDayWord(fundedBy.monthDay)}`;
  }
  return PAID_FROM_WORDS.gone;
}

/** "Spread across my pays", "The pay right before it's due" or the pay's own name. */
export function describePaidFrom(
  fundedBy: BillFundedBy,
  plan: readonly ResolvedSource[],
) {
  if (fundedBy.kind === 'lastBefore') return PAID_FROM_WORDS.lastBefore;
  if (fundedBy.kind === 'pay') return describePayChoice(fundedBy, plan);
  return PAID_FROM_WORDS.spread;
}
