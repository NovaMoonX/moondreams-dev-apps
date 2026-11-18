import type { Weekday as CadenceWeekday } from '@/utils/cadenceUtils';
import { generateUuid } from '@/utils/idUtils';
import { readNaturalSchedule } from '@/utils/naturalRepeatUtils';
import { describeRepeat, localeWeekStart } from '@/utils/repeatRule';
import { HELM_COPY } from '@apps/helm/constants';
import type { DayPart } from '@apps/helm/engine/habitDay';
import {
  formatCadence,
  fromWhenDraft,
  toPartWindow,
  type WhenDraft,
} from '@apps/helm/utils/habitDraft';
import { formatClockWords, formatRunDay } from '@apps/helm/utils/runWords';

interface SayWhenContext {
  now: number;
  zone: string;
}

const WEEKDAY_NUMBERS = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];

const PART_WORDS: [DayPart, RegExp][] = [
  ['morning', /\bmornings?\b/i],
  ['midday', /\bmid-?days?\b/i],
  ['afternoon', /\bafternoons?\b/i],
  ['evening', /\bevenings?\b/i],
  ['bedtime', /\b(?:bedtime|before bed|at night|nightly)\b/i],
];

const readSchedule = (text: string, context: SayWhenContext) =>
  readNaturalSchedule(text, {
    now: context.now,
    timeZone: context.zone,
    weekStart: localeWeekStart(),
  });

/** What a typed schedule says, for the scheduled form: a repeat, a first day and a time, and the plain words that read back only the parts the form takes (`appliesDay`, `appliesRule`); null when it says none of them. */
export function readScheduleWords(
  text: string,
  context: SayWhenContext,
  applies: { appliesDay: boolean; appliesRule: boolean },
) {
  const schedule = readSchedule(text, context);
  if (!schedule || schedule.timesPerWeek !== null) return null;
  const time = schedule.time ? formatClockWords(schedule.time) : null;
  const day =
    applies.appliesDay && schedule.startsOn
      ? formatRunDay(schedule.startsOn)
      : null;
  const repeat =
    applies.appliesRule && schedule.rule
      ? describeRepeat(schedule.rule, schedule.startsOn ?? '', {
          time: schedule.time,
          timeFormat: formatClockWords,
        })
      : null;
  const words = repeat
    ? day
      ? HELM_COPY.sayWhenStarting(repeat, day)
      : repeat
    : day
      ? HELM_COPY.sayWhenOnce(day, time)
      : time
        ? HELM_COPY.sayWhenTimeOnly(time)
        : null;
  return words === null ? null : { schedule, words };
}

/** A typed day for something that happens once and keeps no clock; a repeat in the words is not read. */
export function readOnceWords(text: string, context: SayWhenContext) {
  const schedule = readSchedule(text, context);
  return schedule && !schedule.rule && schedule.startsOn
    ? {
        schedule,
        words: HELM_COPY.sayWhenOnce(formatRunDay(schedule.startsOn), null),
      }
    : null;
}

const nextHour = (time: string) => {
  const [hour, minute] = time.split(':').map(Number);
  return hour >= 23
    ? '23:59'
    : `${String(hour + 1).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
};

/** A typed "when" for a habit laid over the draft it fills: days (every day, some weekdays, a count a week) and times (parts of the day, or one clock time), with the words that read it back; a repeat a habit can't keep (every other week, monthly) is not read. */
export function readHabitWords(
  text: string,
  draft: WhenDraft,
  context: SayWhenContext & {
    profile: { dayStartTime: string; dayEndTime: string };
  },
): { draft: WhenDraft; words: string } | null {
  const schedule = readSchedule(text, context);
  const parts = PART_WORDS.filter(([, re]) => re.test(text)).map(
    ([part]) => part,
  );
  const rule = schedule?.rule ?? null;
  if (
    rule &&
    (rule.interval !== 1 || !['daily', 'weekly'].includes(rule.freq))
  ) {
    return null;
  }
  const weekdays =
    rule?.freq === 'weekly'
      ? rule.weekdays.map(
          (code) => WEEKDAY_NUMBERS.indexOf(code) as CadenceWeekday,
        )
      : [];
  const week = schedule?.timesPerWeek ?? null;
  const withDays: WhenDraft =
    week !== null
      ? week >= 7
        ? { ...draft, often: 'everyDay' }
        : { ...draft, often: 'timesPerWeek', weekCount: Math.max(week, 1) }
      : rule?.freq === 'daily' || weekdays.length === 7
        ? { ...draft, often: 'everyDay' }
        : rule
          ? { ...draft, often: 'onWeekdays', weekdays }
          : draft;
  const time = schedule?.time ?? null;
  const withTimes: WhenDraft =
    parts.length > 0
      ? {
          ...withDays,
          mode: 'parts',
          windows: parts.map((part) => toPartWindow(part, context.profile)),
        }
      : time
        ? {
            ...withDays,
            mode: 'parts',
            windows: [
              {
                id: generateUuid(),
                part: null,
                label: formatClockWords(time),
                start: time,
                end: nextHour(time),
              },
            ],
          }
        : withDays;
  const hasDays = week !== null || rule !== null;
  if (!hasDays && parts.length === 0 && !time) return null;
  const timeWords =
    parts.length > 0
      ? parts.map((part) => HELM_COPY.habitPartLabels[part]).join(', ')
      : time
        ? formatClockWords(time)
        : null;
  const cadenceWords = hasDays
    ? formatCadence(fromWhenDraft(withDays, null, 0).cadence)
    : null;
  return {
    draft: withTimes,
    words: [cadenceWords, timeWords].filter(Boolean).join(', '),
  };
}
