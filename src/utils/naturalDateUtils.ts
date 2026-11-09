import { zonedDateTimeToEpoch } from '@/utils/timezoneUtils';

export type NaturalDue =
  { kind: 'day'; date: number } | { kind: 'moment'; at: number };

export interface NaturalDate {
  /** Offsets of the phrase in the text. */
  start: number;
  end: number;
  text: string;
  due: NaturalDue;
}

const DAY_MS = 86_400_000;
const TONIGHT_HOUR = 20;

const WEEKDAYS = [
  'sunday',
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
];
const WEEKDAY_SHORT: Record<string, number> = {
  sun: 0,
  mon: 1,
  tue: 2,
  tues: 2,
  wed: 3,
  thu: 4,
  thur: 4,
  thurs: 4,
  fri: 5,
  sat: 6,
};
const MONTHS = [
  'january',
  'february',
  'march',
  'april',
  'may',
  'june',
  'july',
  'august',
  'september',
  'october',
  'november',
  'december',
];
const MONTH_SHORT: Record<string, number> = {
  jan: 0,
  feb: 1,
  mar: 2,
  apr: 3,
  jun: 5,
  jul: 6,
  aug: 7,
  sep: 8,
  sept: 8,
  oct: 9,
  nov: 10,
  dec: 11,
};

const weekdayPattern = [
  ...WEEKDAYS,
  ...Object.keys(WEEKDAY_SHORT).sort((a, b) => b.length - a.length),
].join('|');
const monthPattern = [
  ...MONTHS,
  ...Object.keys(MONTH_SHORT).sort((a, b) => b.length - a.length),
].join('|');

const DAY_RE = new RegExp(
  [
    '(?<![\\w@#^])(?:',
    '(?<word>today|tonight|tomorrow)',
    `|(?:(?<rel>next|this)\\s+)?(?<weekday>${weekdayPattern})`,
    `|(?<monthA>${monthPattern})\\.?\\s+(?<dayA>\\d{1,2})(?:st|nd|rd|th)?(?![\\d:])`,
    `|(?<![\\d$.,:/-])(?<dayB>\\d{1,2})(?:st|nd|rd|th)?\\s+(?:of\\s+)?(?<monthB>${monthPattern})`,
    ')\\b',
  ].join(''),
  'gi',
);

const TIME_PATTERN =
  '(?<![\\w])(?<at>(?:at|@)\\s*)?(?<hour>\\d{1,2})(?::(?<minute>\\d{2}))?(?:\\s*(?<meridiem>[ap]m))?\\b(?!:)';
const TIME_RE = new RegExp(TIME_PATTERN, 'gi');
const TIME_AFTER_DAY_RE = new RegExp(`\\s*,?\\s*${TIME_PATTERN}`, 'iy');

interface ClockTime {
  hour: number;
  minute: number;
  end: number;
}

const toCivil = (epochDay: number) => {
  const date = new Date(epochDay);
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth(),
    day: date.getUTCDate(),
  };
};

const getCivilToday = (now: number, timeZone: string) => {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
  }).formatToParts(new Date(now));
  const read = (type: string) =>
    Number(parts.find((part) => part.type === type)?.value);
  return Date.UTC(read('year'), read('month') - 1, read('day'));
};

const pad = (value: number) => String(value).padStart(2, '0');

const toClock = (match: RegExpMatchArray | RegExpExecArray, end: number) => {
  const groups = match.groups ?? {};
  const hour = Number(groups.hour);
  const minute = groups.minute === undefined ? 0 : Number(groups.minute);
  const meridiem = groups.meridiem?.toLowerCase();
  const isClear = groups.at !== undefined || meridiem || groups.minute;
  if (!isClear || minute > 59) return null;
  if (meridiem) {
    if (hour < 1 || hour > 12) return null;
    return { hour: (hour % 12) + (meridiem === 'pm' ? 12 : 0), minute, end };
  }
  if (groups.minute !== undefined) {
    return hour > 23 ? null : { hour, minute, end };
  }
  if (hour < 1 || hour > 12) return null;
  // No am/pm: a working-hours reading, 1 to 7 is afternoon.
  return { hour: hour <= 7 ? hour + 12 : hour, minute, end };
};

const readClockAfter = (text: string, from: number): ClockTime | null => {
  TIME_AFTER_DAY_RE.lastIndex = from;
  const match = TIME_AFTER_DAY_RE.exec(text);
  return match ? toClock(match, from + match[0].length) : null;
};

const weekPosition = (epochDay: number) =>
  (new Date(epochDay).getUTCDay() + 6) % 7;

const getWeekdayDay = (
  today: number,
  weekday: number,
  relative: string | undefined,
) => {
  const target = (weekday + 6) % 7;
  const current = weekPosition(today);
  if (relative === 'next') {
    return today - current * DAY_MS + (7 + target) * DAY_MS;
  }
  if (relative === 'this' && target >= current) {
    return today + (target - current) * DAY_MS;
  }
  return today + (((target - current + 6) % 7) + 1) * DAY_MS;
};

const getMonthDay = (today: number, month: number, day: number) => {
  const { year } = toCivil(today);
  const isReal = (candidate: number) => {
    const date = new Date(Date.UTC(candidate, month, day));
    return date.getUTCMonth() === month && date.getUTCDate() === day;
  };
  const found = [year, year + 1, year + 4]
    .filter(isReal)
    .map((candidate) => Date.UTC(candidate, month, day))
    .find((epochDay) => epochDay >= today);
  return found ?? null;
};

const lookupMonth = (name: string) => {
  const lower = name.toLowerCase();
  const full = MONTHS.indexOf(lower);
  return full === -1 ? MONTH_SHORT[lower] : full;
};

const lookupWeekday = (name: string) => {
  const lower = name.toLowerCase();
  const full = WEEKDAYS.indexOf(lower);
  return full === -1 ? WEEKDAY_SHORT[lower] : full;
};

interface DayHit {
  start: number;
  end: number;
  epochDay: number;
  hour: number | null;
}

const readDayHit = (match: RegExpMatchArray, today: number): DayHit | null => {
  const groups = match.groups ?? {};
  const start = match.index ?? 0;
  const end = start + match[0].length;
  const word = groups.word?.toLowerCase();
  if (word) {
    const epochDay = today + (word === 'tomorrow' ? DAY_MS : 0);
    return {
      start,
      end,
      epochDay,
      hour: word === 'tonight' ? TONIGHT_HOUR : null,
    };
  }
  if (groups.weekday) {
    const isBareLoose =
      !groups.rel && ['sat', 'sun'].includes(groups.weekday.toLowerCase());
    if (isBareLoose) return null;
    const epochDay = getWeekdayDay(
      today,
      lookupWeekday(groups.weekday),
      groups.rel?.toLowerCase(),
    );
    return { start, end, epochDay, hour: null };
  }
  const month = lookupMonth(groups.monthA ?? groups.monthB);
  const epochDay = getMonthDay(
    today,
    month,
    Number(groups.dayA ?? groups.dayB),
  );
  return epochDay === null ? null : { start, end, epochDay, hour: null };
};

const resolveClock = (hit: DayHit, clock: ClockTime | null) => {
  if (hit.hour === null) return clock;
  if (!clock) return { hour: hit.hour, minute: 0, end: hit.end };
  const isMorning = clock.hour >= 1 && clock.hour < 12;
  return isMorning ? { ...clock, hour: clock.hour + 12 } : clock;
};

const toDue = (
  epochDay: number,
  clock: { hour: number; minute: number } | null,
  timeZone: string,
): NaturalDue => {
  if (!clock) return { kind: 'day', date: epochDay };
  const { year, month, day } = toCivil(epochDay);
  return {
    kind: 'moment',
    at: zonedDateTimeToEpoch(
      `${year}-${pad(month + 1)}-${pad(day)}`,
      `${pad(clock.hour)}:${pad(clock.minute)}`,
      timeZone,
    ),
  };
};

/** Every date phrase in `text` ("tomorrow at 3", "next Fri", "Mar 12", "at 3:30pm"), read in `timeZone` from `now`: a day is UTC midnight of its calendar day, a phrase with a time is the instant. A bare weekday is the next one after today, "tonight" is 20:00, a time alone is today's or else tomorrow's, and a bare 1 to 7 means pm. */
export function parseNaturalDate(
  text: string,
  options: { now: number; timeZone: string },
): NaturalDate[] {
  const { now, timeZone } = options;
  const today = getCivilToday(now, timeZone);
  const dayHits = Array.from(text.matchAll(DAY_RE))
    .map((match) => readDayHit(match, today))
    .filter((hit): hit is DayHit => hit !== null)
    .map((hit) => {
      const clock = resolveClock(hit, readClockAfter(text, hit.end));
      return {
        start: hit.start,
        end: clock?.end ?? hit.end,
        due: toDue(hit.epochDay, clock, timeZone),
      };
    });
  const isInsideDay = (start: number) =>
    dayHits.some((hit) => start >= hit.start && start < hit.end);
  const timeHits = Array.from(text.matchAll(TIME_RE))
    .map((match) => ({ match, clock: toClock(match, 0) }))
    .filter(({ match }) => !isInsideDay(match.index ?? 0))
    .flatMap(({ match, clock }) => {
      if (!clock) return [];
      const start = match.index ?? 0;
      const at = toDue(today, clock, timeZone);
      const due =
        at.kind === 'moment' && at.at <= now
          ? toDue(today + DAY_MS, clock, timeZone)
          : at;
      return [{ start, end: start + match[0].length, due }];
    });
  return [...dayHits, ...timeHits]
    .sort((a, b) => a.start - b.start)
    .map((hit) => ({ ...hit, text: text.slice(hit.start, hit.end) }));
}
