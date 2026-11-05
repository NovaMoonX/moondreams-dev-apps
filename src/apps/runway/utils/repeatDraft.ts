import { fromDateInputValue, toDateInputValue } from '@/utils/dateInputUtils';
import {
  BILL_EVERY_UNITS,
  BILL_FREQUENCIES,
  INCOME_ENDINGS,
  MAX_ENDING_COUNT,
  MAX_EVERY_MONTHS,
} from '@apps/runway/constants';
import { getIntervalMonths } from '@apps/runway/engine/schedule';
import type { Ending, Schedule } from '@apps/runway/types';

type Frequency = (typeof BILL_FREQUENCIES)[number];

/** A repeating cost's answers as the form holds them, with the same choices and words the bill form offers. */
export interface RepeatDraft {
  frequency: Frequency;
  everyCount: string;
  everyUnit: (typeof BILL_EVERY_UNITS)[number];
  endKind: (typeof INCOME_ENDINGS)[number];
  endDate: string;
  endCount: string;
}

export const ONCE_REPEAT_DRAFT: RepeatDraft = {
  frequency: 'once',
  everyCount: '',
  everyUnit: 'months',
  endKind: 'never',
  endDate: '',
  endCount: '',
};

/** A saved schedule and ending as the form's answers. */
export const toRepeatDraft = (
  schedule: Schedule,
  ending: Ending,
): RepeatDraft => {
  const interval = getIntervalMonths(schedule);
  const isYears = interval !== null && interval % 12 === 0;
  const repeat: Pick<RepeatDraft, 'frequency' | 'everyCount' | 'everyUnit'> =
    interval === 12
      ? { frequency: 'yearly', everyCount: '', everyUnit: 'months' }
      : interval !== null
        ? {
            frequency: 'custom',
            everyCount: String(isYears ? interval / 12 : interval),
            everyUnit: isYears ? 'years' : 'months',
          }
        : {
            frequency:
              BILL_FREQUENCIES.find((kind) => kind === schedule.kind) ?? 'once',
            everyCount: '',
            everyUnit: 'months',
          };
  return {
    ...repeat,
    endKind:
      ending.onDate !== null
        ? 'date'
        : ending.afterCount !== null
          ? 'count'
          : 'never',
    endDate: ending.onDate === null ? '' : toDateInputValue(ending.onDate),
    endCount: ending.afterCount === null ? '' : String(ending.afterCount),
  };
};

/** The months between a cost's dates when it repeats yearly or on a custom period, else null. */
const getEveryMonths = (draft: RepeatDraft): number | null => {
  if (draft.frequency === 'yearly') return 12;
  if (draft.frequency !== 'custom') return null;
  const count = Number(draft.everyCount);
  const months = count * (draft.everyUnit === 'years' ? 12 : 1);
  return Number.isInteger(count) && months >= 2 && months <= MAX_EVERY_MONTHS
    ? months
    : null;
};

export const isRepeatAnswered = (draft: RepeatDraft) =>
  draft.frequency !== 'custom' || getEveryMonths(draft) !== null;

const parseCount = (value: string) => {
  const count = Number(value);
  return Number.isInteger(count) && count >= 1 && count <= MAX_ENDING_COUNT
    ? count
    : null;
};

/** The ending the answers make; null while a chosen end is unfinished or falls before the first payment. */
export const buildEnding = (
  draft: RepeatDraft,
  start: number | undefined,
): Ending | null => {
  if (draft.frequency === 'once' || draft.endKind === 'never') {
    return { onDate: null, afterCount: null };
  }
  if (draft.endKind === 'date') {
    const onDate = fromDateInputValue(draft.endDate);
    return onDate === undefined || (start !== undefined && onDate < start)
      ? null
      : { onDate, afterCount: null };
  }
  const afterCount = parseCount(draft.endCount);
  return afterCount === null ? null : { onDate: null, afterCount };
};

/** The schedule the answers make from the first payment's day. */
export const buildSchedule = (draft: RepeatDraft, anchor: number): Schedule => {
  if (draft.frequency === 'yearly' || draft.frequency === 'custom') {
    return {
      kind: 'everyMonths',
      anchor,
      monthDays: [],
      intervalMonths: getEveryMonths(draft),
    };
  }
  return {
    kind: draft.frequency,
    anchor,
    monthDays:
      draft.frequency === 'monthly' ? [new Date(anchor).getUTCDate()] : [],
  };
};
