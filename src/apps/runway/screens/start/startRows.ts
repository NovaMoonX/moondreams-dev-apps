import { formatDateShortUTC } from '@/utils/formatUtils';
import { formatCents } from '@/utils/moneyUtils';
import { SCHEDULE_LABELS } from '@apps/runway/constants';
import { toOrdinal } from '@apps/runway/utils/monthDays';
import { describeBillRepeat } from '@apps/runway/utils/billText';
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
  if (schedule.kind === 'twiceMonthly' && schedule.monthDays.length === 2)
    return `${toOrdinal(schedule.monthDays[0])} and ${toOrdinal(schedule.monthDays[1])}`;
  if (schedule.kind === 'once' && schedule.anchor !== null)
    return `Once, ${formatDateShortUTC(schedule.anchor)}`;
  if (schedule.kind === 'monthly' && schedule.anchor !== null)
    return `Monthly from ${formatDateShortUTC(schedule.anchor)}`;
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

const describeBillLine = (schedule: Schedule) => {
  const start =
    schedule.anchor === null ? '' : formatDateShortUTC(schedule.anchor);
  return schedule.kind === 'once'
    ? `Due ${start}`
    : `${describeBillRepeat(schedule.kind)} from ${start}`;
};

export const toBillRow = (id: string, bill: BillSealed): StartRow => ({
  id,
  name: bill.name,
  emoji: bill.emoji,
  line: describeBillLine(bill.timing.schedule),
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
      : `By ${formatDateShortUTC(goal.targetDate)}`,
  amount: formatCents(goal.targetCents),
});

const NOUNS = {
  income: ['income source', 'income sources'],
  bill: ['bill', 'bills'],
  envelope: ['envelope', 'envelopes'],
  goal: ['goal', 'goals'],
} as const;

/** "1 income source, 3 bills and 2 goals". */
export const describeCounts = (counts: Record<keyof typeof NOUNS, number>) => {
  const parts = (Object.keys(NOUNS) as (keyof typeof NOUNS)[])
    .filter((kind) => counts[kind] > 0)
    .map(
      (kind) => `${counts[kind]} ${NOUNS[kind][counts[kind] === 1 ? 0 : 1]}`,
    );
  return parts.length < 2
    ? (parts[0] ?? '')
    : `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
};
