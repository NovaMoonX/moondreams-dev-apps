import { formatDateOrdinalUTC, toDayOrdinal } from '@/utils/formatUtils';
import { formatCentsShort } from '@/utils/moneyUtils';
import { HORIZON_WORDS } from '@apps/runway/constants';
import { getIntervalMonths } from '@apps/runway/engine/schedule';
import type { Ending, HorizonCost, Schedule } from '@apps/runway/types';
import { describeBillRepeat } from '@apps/runway/engine/billRepeat';
import { getHorizonStatus } from '@apps/runway/engine/horizonStatus';

/** "Jan 15th" for a cost paid once; "Monthly from Feb 1st to Jun 1st" or "Monthly from Feb 1st, 6 times" for one that repeats. */
export function describeCostTiming(
  schedule: Schedule,
  ending: Ending,
  isSummary = false,
) {
  const { anchor } = schedule;
  if (anchor === null) return '';
  const date = formatDateOrdinalUTC(anchor);
  if (schedule.kind === 'once') {
    return isSummary ? HORIZON_WORDS.costOnceSummary(date) : date;
  }
  const stop =
    ending.onDate !== null
      ? HORIZON_WORDS.costEndsOn(formatDateOrdinalUTC(ending.onDate))
      : ending.afterCount !== null
        ? HORIZON_WORDS.costEndsAfter(ending.afterCount)
        : '';
  const start = isSummary
    ? HORIZON_WORDS.costRepeatSummary(describeBillRepeat(schedule), date)
    : HORIZON_WORDS.costFrom(date);
  return `${start}${stop}`;
}

const lowerFirst = (text: string) =>
  text.charAt(0).toLowerCase() + text.slice(1);

/** A cost's day inside a sentence: "Feb 1st" for one paid once, "monthly from Feb 1st, 6 times" for a repeat. */
export const describeCostWhen = (schedule: Schedule, ending: Ending) =>
  schedule.kind === 'once'
    ? describeCostTiming(schedule, ending)
    : lowerFirst(describeCostTiming(schedule, ending, true));

/** A cost's timing as a sentence names it: "due Jan 15th" for one paid once, "from Feb 1st · $100 a month" for a repeat. */
export function describeCostInSentence(cost: HorizonCost) {
  const { schedule, ending } = cost;
  if (schedule.kind === 'once') {
    return HORIZON_WORDS.costDueLower(describeCostTiming(schedule, ending));
  }
  const { per } = describeCost(cost);
  const { lowCents, highCents } = cost.amount;
  // An en dash keeps "to" in a change line meaning only the change.
  const figure =
    lowCents === highCents
      ? formatCentsShort(lowCents)
      : `${formatCentsShort(lowCents)}–${formatCentsShort(highCents)}`;
  return `${lowerFirst(describeCostTiming(schedule, ending))} · ${[figure, per].filter(Boolean).join(' ')}`;
}

/** What one payment of a repeating cost is per beat: "a month", "every 2 weeks", "a year", "every 3 months". */
const describeCostPer = (schedule: Schedule) => {
  const interval = getIntervalMonths(schedule);
  if (interval === 12) return HORIZON_WORDS.costPerYear;
  if (interval !== null) return describeBillRepeat(schedule).toLowerCase();
  if (schedule.kind === 'weekly') return HORIZON_WORDS.costPerWeek;
  if (schedule.kind === 'everyOtherWeek') return HORIZON_WORDS.costPerOtherWeek;
  return schedule.kind === 'monthly' ? HORIZON_WORDS.costPerMonth : '';
};

/** A cost in plain pieces (`isTagged` false leaves off "Outside the plan", for a row whose paid line says it): the date line ("Jan 15th", "From Feb 1st, 6 times"), the figure ("$600 to $800" for a range) and, for a repeat, its beat ("a month"). */
export function describeCost(cost: HorizonCost, isTagged = true) {
  const { lowCents, highCents } = cost.amount;
  const amount =
    lowCents === highCents
      ? formatCentsShort(lowCents)
      : `${formatCentsShort(lowCents)} to\u00A0${formatCentsShort(highCents)}`;
  const per = describeCostPer(cost.schedule);
  return {
    line: [
      describeCostTiming(cost.schedule, cost.ending),
      isTagged &&
        cost.isOutside &&
        HORIZON_WORDS.outsideTag.toLowerCase().replaceAll(' ', '\u00A0'),
    ]
      .filter(Boolean)
      .join('\u00A0· '),
    figure: amount,
    per,
  };
}

/** "Jan 15th to 17th, 2027": the month and year are written once when both dates share them. */
export function formatDateRangeOrdinalUTC(from: number, to: number) {
  const start = new Date(from);
  const end = new Date(to);
  const isSameYear = start.getUTCFullYear() === end.getUTCFullYear();
  if (!isSameYear)
    return `${formatDateOrdinalUTC(from)} to ${formatDateOrdinalUTC(to)}`;
  const [startDay] = formatDateOrdinalUTC(from).split(',');
  const [endDay, ...endYear] = formatDateOrdinalUTC(to).split(',');
  const isSameMonth = start.getUTCMonth() === end.getUTCMonth();
  const lastDay = isSameMonth ? toDayOrdinal(end.getUTCDate()) : endDay;
  return `${startDay} to ${lastDay}${endYear.map((year) => `,${year}`).join('')}`;
}

export { getHorizonStatus };
