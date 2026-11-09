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

const ORDINAL = '(?:st|nd|rd|th)?';
const YEAR_PART = (name: string) =>
  `(?:,?\\s+(?<${name}>(?:19|20)\\d{2})(?!\\d))?`;

const DAY_RE = new RegExp(
  [
    '(?<![\\w@#^])(?:',
    "(?<word>today|tonight|tomorrow)(?!['’]\\p{L})",
    `|(?<wdC>${weekdayPattern})\\.?,?\\s+(?<monthC>${monthPattern})\\.?\\s+(?<dayC>\\d{1,2})${ORDINAL}(?![\\d:])${YEAR_PART('yearC')}`,
    `|(?:(?<rel>next|this)\\s+)?(?<weekday>${weekdayPattern})`,
    `|(?<monthA>${monthPattern})\\.?\\s+(?<dayA>\\d{1,2})${ORDINAL}(?![\\d:])${YEAR_PART('yearA')}`,
    `|(?<![\\d$.,:/-])(?<dayB>\\d{1,2})${ORDINAL}\\s+(?:of\\s+)?(?<monthB>${monthPattern})${YEAR_PART('yearB')}`,
    ')\\b',
  ].join(''),
  'giu',
);

// Words that are also plain English count only when capitalised or right after "on".
const LOOSE_WORDS = new Set([
  'may',
  'march',
  'mar',
  'wed',
  'mon',
  'sat',
  'sun',
]);

const TIME_PATTERN =
  '(?<![\\w])(?<at>(?:at|@)\\s*)?(?:(?<hour>\\d{1,2})(?::(?<minute>\\d{2}))?(?:\\s*(?<meridiem>[ap]m))?|(?<named>noon|midnight))\\b(?!:)';
const TIME_RE = new RegExp(TIME_PATTERN, 'giu');
const TIME_AFTER_DAY_RE = new RegExp(`\\s*,?\\s*${TIME_PATTERN}`, 'iuy');
const TIME_BEFORE_DAY_RE = new RegExp(
  `${TIME_PATTERN}\\s*,?\\s*(?:on\\s+)?$`,
  'iu',
);

interface ClockTime {
  hour: number;
  minute: number;
  start: number;
  end: number;
  nextDay: boolean;
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

/** A lone time needs am/pm, a colon or noon/midnight; "at" counts as evidence only beside a day word. */
const toClock = (
  match: RegExpMatchArray | RegExpExecArray,
  base: number,
  isLone: boolean,
): ClockTime | null => {
  const groups = match.groups ?? {};
  const start = base + (match.index ?? 0);
  const end = start + match[0].length;
  const named = groups.named?.toLowerCase();
  if (named) {
    return {
      hour: named === 'noon' ? 12 : 0,
      minute: 0,
      start,
      end,
      nextDay: false,
    };
  }
  const hour = Number(groups.hour);
  const minute = groups.minute === undefined ? 0 : Number(groups.minute);
  const meridiem = groups.meridiem?.toLowerCase();
  const isClear =
    meridiem || groups.minute !== undefined || (!isLone && groups.at);
  if (!isClear || minute > 59) return null;
  const read = (value: number) => ({
    hour: value,
    minute,
    start,
    end,
    nextDay: false,
  });
  if (meridiem) {
    if (hour < 1 || hour > 12) return null;
    return read((hour % 12) + (meridiem === 'pm' ? 12 : 0));
  }
  if (groups.minute !== undefined) return hour > 23 ? null : read(hour);
  if (hour < 1 || hour > 12) return null;
  // No am/pm: a working-hours reading, 1 to 7 is afternoon.
  return read(hour <= 7 ? hour + 12 : hour);
};

const readClockAfter = (text: string, from: number): ClockTime | null => {
  TIME_AFTER_DAY_RE.lastIndex = from;
  const match = TIME_AFTER_DAY_RE.exec(text);
  return match ? toClock(match, 0, false) : null;
};

const readClockBefore = (
  text: string,
  from: number,
  to: number,
): ClockTime | null => {
  const match = TIME_BEFORE_DAY_RE.exec(text.slice(from, to));
  return match ? toClock(match, from, false) : null;
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

const getMonthDay = (
  today: number,
  month: number,
  day: number,
  year: number | null,
) => {
  const isReal = (candidate: number) => {
    const date = new Date(Date.UTC(candidate, month, day));
    return date.getUTCMonth() === month && date.getUTCDate() === day;
  };
  const thisYear = toCivil(today).year;
  // A 29 Feb is found by stepping on to the next leap year.
  const years =
    year === null
      ? Array.from({ length: 9 }, (_, offset) => thisYear + offset)
      : [year];
  const found = years
    .filter(isReal)
    .map((candidate) => Date.UTC(candidate, month, day))
    .find((epochDay) => year !== null || epochDay >= today);
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
  isTonight: boolean;
}

const toYear = (value: string | undefined) =>
  value === undefined ? null : Number(value);

const isReadableWord = (word: string, isAfterOn: boolean) =>
  !LOOSE_WORDS.has(word.toLowerCase()) || /^\p{Lu}/u.test(word) || isAfterOn;

const readDayHit = (
  match: RegExpMatchArray,
  today: number,
  text: string,
): DayHit | null => {
  const groups = match.groups ?? {};
  const start = match.index ?? 0;
  const end = start + match[0].length;
  const isAfterOn = /\bon\s+$/i.test(text.slice(0, start));
  const hit = (epochDay: number | null, isTonight = false) =>
    epochDay === null ? null : { start, end, epochDay, isTonight };
  const word = groups.word?.toLowerCase();
  if (word)
    return hit(today + (word === 'tomorrow' ? DAY_MS : 0), word === 'tonight');
  if (groups.wdC) {
    if (!isReadableWord(groups.wdC, isAfterOn)) return null;
    if (!isReadableWord(groups.monthC, false)) return null;
    const epochDay = getMonthDay(
      today,
      lookupMonth(groups.monthC),
      Number(groups.dayC),
      toYear(groups.yearC),
    );
    // A weekday that contradicts its date is never trusted.
    const isSameWeekday =
      epochDay !== null &&
      new Date(epochDay).getUTCDay() === lookupWeekday(groups.wdC);
    return isSameWeekday ? hit(epochDay) : null;
  }
  if (groups.weekday) {
    if (!groups.rel && !isReadableWord(groups.weekday, isAfterOn)) return null;
    return hit(
      getWeekdayDay(
        today,
        lookupWeekday(groups.weekday),
        groups.rel?.toLowerCase(),
      ),
    );
  }
  if (groups.monthA) {
    if (!isReadableWord(groups.monthA, isAfterOn)) return null;
    return hit(
      getMonthDay(
        today,
        lookupMonth(groups.monthA),
        Number(groups.dayA),
        toYear(groups.yearA),
      ),
    );
  }
  if (!isReadableWord(groups.monthB, false)) return null;
  return hit(
    getMonthDay(
      today,
      lookupMonth(groups.monthB),
      Number(groups.dayB),
      toYear(groups.yearB),
    ),
  );
};

const resolveClock = (hit: DayHit, clock: ClockTime | null) => {
  if (!hit.isTonight || !clock) return clock;
  // "Tonight at 12" is the coming midnight.
  if (clock.hour === 12 || clock.hour === 0) {
    return { ...clock, hour: 0, nextDay: true };
  }
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

/** Every date phrase in `text` ("tomorrow at 3", "3pm Friday", "next Fri", "Mar 12 2027", "at 3:30pm"), read in `timeZone` from `now`: a day is UTC midnight of its calendar day, a phrase with a time is the instant. A bare weekday is the next one after today, a date with no year is its next occurrence, a time alone is today's or else tomorrow's, and a bare 1 to 7 means pm. */
export function parseNaturalDate(
  text: string,
  options: { now: number; timeZone: string },
): NaturalDate[] {
  const { now, timeZone } = options;
  const today = getCivilToday(now, timeZone);
  const dayHits = Array.from(text.matchAll(DAY_RE)).reduce<
    { start: number; end: number; due: NaturalDue }[]
  >((found, match) => {
    const hit = readDayHit(match, today, text);
    const floor = found.at(-1)?.end ?? 0;
    if (!hit || hit.start < floor) return found;
    const clock = resolveClock(
      hit,
      readClockAfter(text, hit.end) ?? readClockBefore(text, floor, hit.start),
    );
    const epochDay = hit.epochDay + (clock?.nextDay ? DAY_MS : 0);
    return [
      ...found,
      {
        start: Math.min(hit.start, clock?.start ?? hit.start),
        end: Math.max(hit.end, clock?.end ?? hit.end),
        due: toDue(epochDay, clock, timeZone),
      },
    ];
  }, []);
  const isInsideDay = (start: number) =>
    dayHits.some((hit) => start >= hit.start && start < hit.end);
  const timeHits = Array.from(text.matchAll(TIME_RE))
    .map((match) => toClock(match, 0, true))
    .filter((clock): clock is ClockTime => clock !== null)
    .filter((clock) => !isInsideDay(clock.start))
    .map((clock) => {
      const at = toDue(today, clock, timeZone);
      const due =
        at.kind === 'moment' && at.at <= now
          ? toDue(today + DAY_MS, clock, timeZone)
          : at;
      return { start: clock.start, end: clock.end, due };
    });
  return [...dayHits, ...timeHits]
    .sort((a, b) => a.start - b.start)
    .map((hit) => ({ ...hit, text: text.slice(hit.start, hit.end) }));
}
