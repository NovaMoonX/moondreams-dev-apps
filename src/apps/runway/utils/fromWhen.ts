import { fromDateInputValue } from '@/utils/dateInputUtils';
import { CHANGE_WORDS, MAX_CHANGE_DAYS_AHEAD } from '@apps/runway/constants';
import type { ComingDay } from '@apps/runway/engine/comingDays';
import { addUtcDays, DAY_MS } from '@apps/runway/engine/dates';
import { getStretchEnd } from '@apps/runway/engine/stretch';

export type FromWhenChoice = 'now' | 'date' | 'fromDay' | 'dayOnly' | 'stretch';

export interface FromWhenValue {
  choice: FromWhenChoice;
  /** A date input's text; used when `choice` is `date`. */
  date: string;
  /** The income day for `dayOnly`, chosen in the picker or fixed by the screen that opened the form. */
  dayKey: string;
  stretch: 'count' | 'until';
  /** Income days a stretch lasts, as typed. */
  count: string;
  /** The last day of a stretch, as a date input's text. */
  until: string;
}

export const INITIAL_FROM_WHEN: FromWhenValue = {
  choice: 'now',
  date: '',
  dayKey: '',
  stretch: 'count',
  count: '',
  until: '',
};

/** What a "from when" answer comes to: a version over a span of days, or a change to one income day. */
export type ChangeSpan =
  | { kind: 'version'; effectiveFrom: number; effectiveUntil: number | null }
  | { kind: 'day'; day: ComingDay };

export interface ChangeSpanResult {
  span: ChangeSpan | null;
  /** Why the answer is not complete yet, in words for the footer. */
  blocker: string | null;
}

interface SpanContext {
  today: number;
  /** The income days ahead that can still be changed. */
  days: readonly ComingDay[];
  /** The income day the screen opened the form for, if any. */
  presetDayKey: string | null;
}

const none = (blocker: string): ChangeSpanResult => ({ span: null, blocker });

const getStretch = (
  value: FromWhenValue,
  { today, days }: SpanContext,
): ChangeSpanResult => {
  if (value.stretch === 'until') {
    const last = fromDateInputValue(value.until);
    if (
      last === undefined ||
      last < today ||
      last > addUtcDays(today, MAX_CHANGE_DAYS_AHEAD)
    )
      return none(CHANGE_WORDS.stretchDateBlocker);
    return {
      span: {
        kind: 'version',
        effectiveFrom: today,
        effectiveUntil: last + DAY_MS,
      },
      blocker: null,
    };
  }
  const count = Number.parseInt(value.count, 10);
  if (!Number.isInteger(count) || count < 1)
    return none(CHANGE_WORDS.stretchCountBlocker);
  const end = getStretchEnd(days, today, count);
  if (end === null) {
    const planned = days.filter((day) => day.on >= today).length;
    return none(CHANGE_WORDS.stretchTooFar(planned));
  }
  return {
    span: { kind: 'version', effectiveFrom: today, effectiveUntil: end },
    blocker: null,
  };
};

/** The span a "from when" answer means, or why it does not mean one yet. */
export function getChangeSpan(
  value: FromWhenValue,
  context: SpanContext,
): ChangeSpanResult {
  const { today, days, presetDayKey } = context;
  if (value.choice === 'now') {
    return {
      span: { kind: 'version', effectiveFrom: today, effectiveUntil: null },
      blocker: null,
    };
  }
  if (value.choice === 'date') {
    const date = fromDateInputValue(value.date);
    if (
      date === undefined ||
      date <= today ||
      date > addUtcDays(today, MAX_CHANGE_DAYS_AHEAD)
    )
      return none(CHANGE_WORDS.dateBlocker);
    return {
      span: { kind: 'version', effectiveFrom: date, effectiveUntil: null },
      blocker: null,
    };
  }
  if (value.choice === 'stretch') return getStretch(value, context);
  const dayKey = presetDayKey ?? value.dayKey;
  const day = days.find(
    (entry) => entry.dayKey === dayKey && entry.on >= today,
  );
  if (!day) return none(CHANGE_WORDS.dayBlocker);
  if (value.choice === 'fromDay') {
    return {
      span: { kind: 'version', effectiveFrom: day.on, effectiveUntil: null },
      blocker: null,
    };
  }
  return { span: { kind: 'day', day }, blocker: null };
}
