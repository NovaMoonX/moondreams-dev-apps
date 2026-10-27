import { formatDateUTC } from '@/utils/formatUtils';
import { formatCents } from '@/utils/moneyUtils';
import { SCHEDULE_LABELS } from '@apps/runway/constants';
import { describeBillTiming } from '@apps/runway/utils/billText';
import { describeFundingShort } from '@apps/runway/utils/fundingText';
import { formatRange } from '@apps/runway/utils/rangeText';
import type {
  BillSealed,
  EnvelopeSealed,
  GoalSealed,
  MoneyRange,
  Schedule,
} from '@apps/runway/types';

export interface StartRow {
  id: string;
  name: string;
  emoji: string | null;
  /** The one muted line under the name. */
  line: string;
  /** The figure on the right, or null when the row has none. */
  amount: string | null;
}

const WEEKDAYS = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
];

/** How often an income arrives, with the weekday for a weekly one: "Every other Friday". */
export function describeSchedule(schedule: Schedule) {
  const weekday =
    schedule.anchor === null
      ? ''
      : WEEKDAYS[new Date(schedule.anchor).getUTCDay()];
  if (schedule.kind === 'weekly') return `Every ${weekday}`;
  if (schedule.kind === 'everyOtherWeek') return `Every other ${weekday}`;
  if (schedule.kind === 'once' && schedule.anchor !== null)
    return `Once, ${formatDateUTC(schedule.anchor)}`;
  if (schedule.kind === 'monthly' && schedule.anchor !== null)
    return `Monthly from ${formatDateUTC(schedule.anchor)}`;
  const known = (SCHEDULE_LABELS as Record<string, string>)[schedule.kind];
  return known ?? schedule.kind;
}

export const toIncomeRow = (
  id: string,
  sourceName: string,
  amount: MoneyRange,
  schedule: Schedule,
): StartRow => ({
  id,
  name: sourceName,
  emoji: null,
  line: describeSchedule(schedule),
  amount: formatRange(amount),
});

export const toBillRow = (id: string, bill: BillSealed): StartRow => ({
  id,
  name: bill.name,
  emoji: bill.emoji,
  line: describeBillTiming(bill.timing.schedule),
  amount: formatRange(bill.amount),
});

export const toEnvelopeRow = (
  id: string,
  envelope: EnvelopeSealed,
): StartRow => ({
  id,
  name: envelope.name,
  emoji: envelope.emoji,
  line: describeFundingShort(envelope.funding),
  amount: null,
});

export const toGoalRow = (id: string, goal: GoalSealed): StartRow => ({
  id,
  name: goal.name,
  emoji: goal.emoji,
  line:
    goal.targetDate === null
      ? describeFundingShort(goal.funding)
      : `By ${formatDateUTC(goal.targetDate)}`,
  amount: formatCents(goal.targetCents),
});
