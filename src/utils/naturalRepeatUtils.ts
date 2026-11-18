import { parseNaturalDate } from '@/utils/naturalDateUtils';
import {
  listOccurrences,
  type RepeatRule,
  type Weekday,
} from '@/utils/repeatRule';

export interface NaturalSchedule {
  /** The repeat the words describe; null for a one-off or when only a count a week was said. */
  rule: RepeatRule | null;
  /** "twice a week" with no days named. */
  timesPerWeek: number | null;
  /** The first day, "YYYY-MM-DD" in the zone: the day the words name, or the first run of the rule on or after today. */
  startsOn: string | null;
  /** "HH:mm" in the zone. */
  time: string | null;
}

interface Recurrence {
  freq: RepeatRule['freq'];
  interval: number;
  weekdays: Weekday[] | null;
  monthDay: number | null;
  nth: 1 | 2 | 3 | 4 | -1 | null;
  nthWeekday: Weekday | null;
}

const WEEKDAY_CODES: Weekday[] = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];
const WORD_NUMBERS: Record<string, number> = {
  one: 1,
  once: 1,
  two: 2,
  twice: 2,
  three: 3,
  thrice: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
};
const ORDINAL_WORDS = [
  'first',
  'second',
  'third',
  'fourth',
  'fifth',
  'sixth',
  'seventh',
  'eighth',
  'ninth',
  'tenth',
  'eleventh',
  'twelfth',
  'thirteenth',
  'fourteenth',
  'fifteenth',
  'sixteenth',
  'seventeenth',
  'eighteenth',
  'nineteenth',
  'twentieth',
  'twenty-first',
  'twenty-second',
  'twenty-third',
  'twenty-fourth',
  'twenty-fifth',
  'twenty-sixth',
  'twenty-seventh',
  'twenty-eighth',
  'twenty-ninth',
  'thirtieth',
  'thirty-first',
];
const UNIT_FREQ: Record<string, RepeatRule['freq']> = {
  day: 'daily',
  daily: 'daily',
  everyday: 'daily',
  nightly: 'daily',
  week: 'weekly',
  weekly: 'weekly',
  month: 'monthly',
  monthly: 'monthly',
  year: 'yearly',
  yearly: 'yearly',
  annually: 'yearly',
};

const WD =
  '(?:sunday|monday|tuesday|wednesday|thursday|friday|saturday|sun|mon|tues?|wed|thu(?:rs?)?|fri|sat)';
const WD_PLURAL =
  '(?:sundays|mondays|tuesdays|wednesdays|thursdays|fridays|saturdays)';
const SEP = '(?:\\s*,\\s*(?:and\\s+)?|\\s+and\\s+|\\s*&\\s*)';
const list = (item: string) => `${item}(?:${SEP}${item})*`;
const NUM = `\\d{1,3}|${Object.keys(WORD_NUMBERS).join('|')}`;
const ORD = `\\d{1,2}(?:st|nd|rd|th)|${[...ORDINAL_WORDS].reverse().join('|')}`;
const NTH = '1st|2nd|3rd|4th|first|second|third|fourth|last';

const readWeekday = (word: string): Weekday | null => {
  const key = word.toLowerCase().replace(/s$/, '').slice(0, 3);
  const index = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'].indexOf(key);
  return index < 0 ? null : WEEKDAY_CODES[index];
};

const readWeekdayList = (text: string) =>
  Array.from(text.matchAll(/[a-z]+/gi)).flatMap((word) => {
    const day = readWeekday(word[0]);
    return day ? [day] : [];
  });

const readOrdinal = (word: string) => {
  const digits = /^\d+/.exec(word);
  return digits
    ? Number(digits[0])
    : ORDINAL_WORDS.indexOf(word.toLowerCase()) + 1;
};

const readNth = (word: string): 1 | 2 | 3 | 4 | -1 => {
  const lower = word.toLowerCase();
  if (lower === 'last') return -1;
  const index = ['1st', '2nd', '3rd', '4th'].indexOf(lower);
  const named = ['first', 'second', 'third', 'fourth'].indexOf(lower);
  return ([1, 2, 3, 4] as const)[index >= 0 ? index : named];
};

const read = (value: string | undefined) => value?.toLowerCase();

const base: Recurrence = {
  freq: 'daily',
  interval: 1,
  weekdays: null,
  monthDay: null,
  nth: null,
  nthWeekday: null,
};

const readRange = (from: Weekday, to: Weekday) => {
  const start = WEEKDAY_CODES.indexOf(from);
  const span = (WEEKDAY_CODES.indexOf(to) - start + 7) % 7;
  return Array.from(
    { length: span + 1 },
    (_, step) => WEEKDAY_CODES[(start + step) % 7],
  );
};

interface Matcher {
  re: RegExp;
  read: (match: RegExpExecArray) => Recurrence | { timesPerWeek: number };
}

const ON_TAIL = `(?:\\s+on\\s+(?:the\\s+(${ORD})\\b|(${list(WD)})\\b))?`;

const MATCHERS: Matcher[] = [
  {
    re: new RegExp(
      `\\b(?:the\\s+)?(${NTH})\\s+(${WD})\\s+of\\s+(?:every|each)\\s+month\\b`,
      'iu',
    ),
    read: (m) => ({
      ...base,
      freq: 'monthly',
      nth: readNth(m[1]),
      nthWeekday: readWeekday(m[2]),
    }),
  },
  {
    re: new RegExp(
      `\\b(?:(?:every|each)\\s+month|monthly)\\s+on\\s+the\\s+(${NTH})\\s+(${WD})\\b`,
      'iu',
    ),
    read: (m) => ({
      ...base,
      freq: 'monthly',
      nth: readNth(m[1]),
      nthWeekday: readWeekday(m[2]),
    }),
  },
  {
    re: /\b(?:on\s+)?the\s+last\s+day\s+of\s+(?:every|each)\s+month\b/iu,
    read: () => ({ ...base, freq: 'monthly', monthDay: -1 }),
  },
  {
    re: new RegExp(
      `\\b(?:on\\s+)?(?:the\\s+)?(${ORD})\\s+(?:day\\s+)?of\\s+(?:every|each)\\s+month\\b`,
      'iu',
    ),
    read: (m) => ({ ...base, freq: 'monthly', monthDay: readOrdinal(m[1]) }),
  },
  {
    re: new RegExp(
      `\\b(?:every|each)\\s+(?:(other)|(${NUM}))?\\s*(day|week|month|year)s?\\b${ON_TAIL}`,
      'iu',
    ),
    read: (m) => ({
      ...base,
      freq: UNIT_FREQ[read(m[3])!],
      interval: m[1]
        ? 2
        : m[2]
          ? (WORD_NUMBERS[read(m[2])!] ?? Number(m[2]))
          : 1,
      monthDay: m[4] ? readOrdinal(m[4]) : null,
      weekdays: m[5] ? readWeekdayList(m[5]) : null,
    }),
  },
  {
    re: new RegExp(`\\b(?:every|each)\\s+other\\s+(${list(WD)})\\b`, 'iu'),
    read: (m) => ({
      ...base,
      freq: 'weekly',
      interval: 2,
      weekdays: readWeekdayList(m[1]),
    }),
  },
  {
    re: /\b(?:every\s+(weekday|weekend)|(weekdays|weekends))\b/iu,
    read: (m) => ({
      ...base,
      freq: 'weekly',
      weekdays: read(m[1] ?? m[2])!.startsWith('weekday')
        ? ['MO', 'TU', 'WE', 'TH', 'FR']
        : ['SA', 'SU'],
    }),
  },
  {
    re: new RegExp(`\\b(${WD})\\s*(?:-|–|to|through|thru)\\s*(${WD})\\b`, 'iu'),
    read: (m) => ({
      ...base,
      freq: 'weekly',
      weekdays: readRange(readWeekday(m[1])!, readWeekday(m[2])!),
    }),
  },
  {
    re: new RegExp(`\\b(?:every|each)\\s+(${list(WD)})\\b`, 'iu'),
    read: (m) => ({ ...base, freq: 'weekly', weekdays: readWeekdayList(m[1]) }),
  },
  {
    re: new RegExp(`\\b(?:on\\s+)?(${list(WD_PLURAL)})\\b`, 'iu'),
    read: (m) => ({ ...base, freq: 'weekly', weekdays: readWeekdayList(m[1]) }),
  },
  {
    re: new RegExp(
      `\\b(${NUM})(?:\\s+times?)?\\s+(?:a|per|each|every)\\s+week\\b`,
      'iu',
    ),
    read: (m) => ({
      timesPerWeek: WORD_NUMBERS[read(m[1])!] ?? Number(m[1]),
    }),
  },
  {
    re: /\bevery\s+(?:morning|afternoon|evening|night)\b/iu,
    read: () => base,
  },
  {
    re: new RegExp(
      `\\b(daily|everyday|nightly|weekly|monthly|yearly|annually)\\b${ON_TAIL}`,
      'iu',
    ),
    read: (m) => ({
      ...base,
      freq: UNIT_FREQ[read(m[1])!],
      monthDay: m[2] ? readOrdinal(m[2]) : null,
      weekdays: m[3] ? readWeekdayList(m[3]) : null,
    }),
  },
];

const UNTIL_RE = /\b(?:until|till)\s+(.+)$/iu;
const TIME_ONLY_RE =
  /^(?:\s|at|@|:|\d|[ap]\.?m\.?|o'clock|noon|midnight|,)*$/iu;

const blank = (text: string, start: number, end: number) =>
  text.slice(0, start) + ' '.repeat(end - start) + text.slice(end);

const dayKeyIn = (at: number, timeZone: string) =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(at));

const clockIn = (at: number, timeZone: string) =>
  new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(new Date(at));

const weekdayOf = (dayKey: string) =>
  WEEKDAY_CODES[new Date(`${dayKey}T00:00:00Z`).getUTCDay()];

const dayOfMonth = (dayKey: string) => Number(dayKey.slice(8, 10));

/** Reads one day, and the clock, out of what is left once the repeat is taken away. */
function readWhen(text: string, now: number, timeZone: string) {
  const hits = parseNaturalDate(text, { now, timeZone });
  const dayHit = hits.find(
    (hit) => hit.due.kind === 'day' || !TIME_ONLY_RE.test(hit.text),
  );
  const bareClock = /(?:at|@)\s*\d{1,2}(?::\d{2})?\b/iu.exec(text)?.[0];
  // A bare "at 9" is only a time after a day, so it borrows today to be read.
  const timeHit =
    hits.find((hit) => hit.due.kind === 'moment') ??
    (bareClock
      ? parseNaturalDate(`today ${bareClock}`, { now, timeZone })[0]
      : undefined);
  return {
    day: !dayHit
      ? null
      : dayHit.due.kind === 'day'
        ? new Date(dayHit.due.date).toISOString().slice(0, 10)
        : dayKeyIn(dayHit.due.at, timeZone),
    time:
      timeHit && timeHit.due.kind === 'moment'
        ? clockIn(timeHit.due.at, timeZone)
        : null,
  };
}

const toRule = (
  found: Recurrence,
  anchor: string,
  weekStart: Weekday,
  until: string | null,
): RepeatRule => ({
  freq: found.freq,
  interval: found.interval,
  weekStart,
  weekdays:
    found.freq === 'weekly' ? (found.weekdays ?? [weekdayOf(anchor)]) : [],
  monthBy:
    found.freq !== 'monthly' ? null : found.nth !== null ? 'nthWeekday' : 'day',
  monthDay:
    found.freq !== 'monthly' || found.nth !== null
      ? null
      : (found.monthDay ?? dayOfMonth(anchor)),
  nth: found.freq === 'monthly' ? found.nth : null,
  nthWeekday: found.freq === 'monthly' ? found.nthWeekday : null,
  until,
  count: null,
});

/** Reads a schedule written in words ("every other Tuesday at 9", "weekdays at 7am", "the 1st of every month", "tomorrow at 3", "every Monday until Dec 20") into a repeat rule, a first day and a time, all in `timeZone`; null when it finds none of them. Plain code, no model: a repeat's `startsOn` is the first run on or after the day named (or today), and a one-off with no day has none. */
export function readNaturalSchedule(
  text: string,
  options: { now: number; timeZone: string; weekStart: Weekday },
): NaturalSchedule | null {
  const { now, timeZone, weekStart } = options;
  const untilMatch = UNTIL_RE.exec(text);
  const until = untilMatch ? readWhen(untilMatch[1], now, timeZone).day : null;
  const withoutUntil =
    untilMatch && until ? blank(text, untilMatch.index, text.length) : text;
  const hit = MATCHERS.reduce<{
    match: RegExpExecArray;
    value: Recurrence | { timesPerWeek: number };
  } | null>((found, matcher) => {
    if (found) return found;
    const match = matcher.re.exec(withoutUntil);
    return match ? { match, value: matcher.read(match) } : null;
  }, null);
  const rest = hit
    ? blank(
        withoutUntil,
        hit.match.index,
        hit.match.index + hit.match[0].length,
      )
    : withoutUntil;
  const when = readWhen(rest, now, timeZone);
  const today = dayKeyIn(now, timeZone);
  if (!hit) {
    return when.day || when.time
      ? { rule: null, timesPerWeek: null, startsOn: when.day, time: when.time }
      : null;
  }
  if ('timesPerWeek' in hit.value) {
    return {
      rule: null,
      timesPerWeek: hit.value.timesPerWeek,
      startsOn: when.day,
      time: when.time,
    };
  }
  const isTodayOver =
    when.day === null &&
    when.time !== null &&
    when.time <= clockIn(now, timeZone);
  const anchor =
    when.day ??
    (isTodayOver
      ? new Date(Date.parse(`${today}T00:00:00Z`) + 86_400_000)
          .toISOString()
          .slice(0, 10)
      : today);
  const rule = toRule(hit.value, anchor, weekStart, until);
  const [first] = listOccurrences({ ...rule, interval: 1 }, anchor, {
    limit: 1,
  });
  return {
    rule,
    timesPerWeek: null,
    startsOn: first ?? anchor,
    time: when.time,
  };
}
