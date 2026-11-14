// Generated from src/utils/repeatRule.ts by scripts/checks/serverCopies.ts. Do not edit; run npm run connections:vendor.
// A repeat as a date-only RRULE body over whole UTC days ('YYYY-MM-DD'). No time, no zone: the caller turns each day into an instant.
export type RepeatFreq = 'daily' | 'weekly' | 'monthly' | 'yearly';
export type Weekday = 'MO' | 'TU' | 'WE' | 'TH' | 'FR' | 'SA' | 'SU';

export interface RepeatRule {
  freq: RepeatFreq;
  interval: number;
  weekStart: Weekday;
  weekdays: Weekday[];
  monthBy: 'day' | 'nthWeekday' | null;
  monthDay: number | null;
  nth: 1 | 2 | 3 | 4 | -1 | null;
  nthWeekday: Weekday | null;
  until: string | null;
  count: number | null;
}

export interface RepeatParts {
  freq: RepeatFreq | null;
  interval: number;
  weekdays: Weekday[];
  monthBy: 'day' | 'nthWeekday' | 'lastDay' | null;
  nth: 1 | 2 | 3 | 4 | -1 | null;
  endsKind: 'never' | 'on' | 'after';
  until: string | null;
  count: number | null;
}

export interface RepeatPreset {
  key: string;
  label: string;
  detail: string | null;
  rule: RepeatRule | null;
}

export type RepeatCapError =
  | 'tooOften'
  | 'interval'
  | 'count'
  | 'untilBeforeStart'
  | 'neverComes'
  | 'shape';

type Moved = Record<string, { day: string; time: string | null }>;

export const REPEAT_CAPS = {
  daily: 365,
  weekly: 52,
  monthly: 12,
  yearly: 10,
  count: 999,
};

const DAY_MS = 86_400_000;
const MAX_DAY = Date.UTC(9999, 11, 31) / DAY_MS;
const SUN_FIRST: Weekday[] = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];
const WEEKDAY_NAMES = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
];
const MONTH_SHORT = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];
const ORDINAL_WORDS: Record<number, string> = {
  1: 'first',
  2: 'second',
  3: 'third',
  4: 'fourth',
  [-1]: 'last',
};
const FREQ_WORDS: Record<RepeatFreq, string> = {
  daily: 'DAILY',
  weekly: 'WEEKLY',
  monthly: 'MONTHLY',
  yearly: 'YEARLY',
};
const WEEKDAYS_MON_FRI: Weekday[] = ['MO', 'TU', 'WE', 'TH', 'FR'];

const isWeekday = (value: string): value is Weekday =>
  SUN_FIRST.includes(value as Weekday);
const weekdayIndex = (weekday: Weekday) => SUN_FIRST.indexOf(weekday);
const toDays = (key: string) => {
  const [year, month, day] = key.split('-').map(Number);
  return Date.UTC(year, month - 1, day) / DAY_MS;
};
const toKey = (days: number) =>
  new Date(days * DAY_MS).toISOString().slice(0, 10);
const isDayKey = (value: string) =>
  /^\d{4}-\d{2}-\d{2}$/.test(value) && toKey(toDays(value)) === value;
const dayOfWeek = (days: number) => (((days + 4) % 7) + 7) % 7;
const daysInMonth = (year: number, month: number) =>
  new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
const isLeap = (year: number) => daysInMonth(year, 1) === 29;
const dateOf = (days: number) => {
  const date = new Date(days * DAY_MS);
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth(),
    day: date.getUTCDate(),
  };
};
const weekdayOf = (days: number) => SUN_FIRST[dayOfWeek(days)];

const sortFromWeekStart = (weekdays: Weekday[], weekStart: Weekday) =>
  Array.from(new Set(weekdays)).sort(
    (a, b) =>
      ((weekdayIndex(a) - weekdayIndex(weekStart) + 7) % 7) -
      ((weekdayIndex(b) - weekdayIndex(weekStart) + 7) % 7),
  );

const isWholeNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value);

const readInteger = (text: string, min: number, max: number) => {
  if (!/^-?\d{1,4}$/.test(text)) return null;
  const value = Number(text);
  return value >= min && value <= max ? value : null;
};

const readUntil = (text: string) => {
  if (!/^\d{8}$/.test(text)) return null;
  const key = `${text.slice(0, 4)}-${text.slice(4, 6)}-${text.slice(6)}`;
  return isDayKey(key) ? key : null;
};

function readNthWeekday(text: string) {
  const match = /^(-1|[1-4])(MO|TU|WE|TH|FR|SA|SU)$/.exec(text);
  if (!match) return null;
  return {
    nth: Number(match[1]) as 1 | 2 | 3 | 4 | -1,
    weekday: match[2] as Weekday,
  };
}

/** Reads an RRULE body of the closed repeat subset (a day, week, month or year step, one end); anything else is `null`. */
export function parseRepeatRule(text: string): RepeatRule | null {
  const pairs = text
    .trim()
    .replace(/^RRULE:/, '')
    .split(';')
    .map((part) => part.split('='));
  if (pairs.some((pair) => pair.length !== 2 || !pair[1])) return null;
  const entries = new Map(pairs as [string, string][]);
  if (entries.size !== pairs.length) return null;
  const allowed = [
    'FREQ',
    'INTERVAL',
    'WKST',
    'BYDAY',
    'BYMONTHDAY',
    'UNTIL',
    'COUNT',
  ];
  if ([...entries.keys()].some((key) => !allowed.includes(key))) return null;

  const freq = (['daily', 'weekly', 'monthly', 'yearly'] as const).find(
    (value) => FREQ_WORDS[value] === entries.get('FREQ'),
  );
  if (!freq) return null;
  const interval = entries.has('INTERVAL')
    ? readInteger(entries.get('INTERVAL')!, 1, REPEAT_CAPS[freq])
    : 1;
  const wkst = entries.get('WKST') ?? 'MO';
  if (interval === null || !isWeekday(wkst)) return null;

  const byDay = entries.get('BYDAY')?.split(',') ?? null;
  const byMonthDay = entries.get('BYMONTHDAY') ?? null;
  const hasUntil = entries.has('UNTIL');
  const hasCount = entries.has('COUNT');
  if (hasUntil && hasCount) return null;
  const until = hasUntil ? readUntil(entries.get('UNTIL')!) : null;
  const count = hasCount ? readInteger(entries.get('COUNT')!, 1, 999) : null;
  if ((hasUntil && !until) || (hasCount && count === null)) return null;

  const base: RepeatRule = {
    freq,
    interval,
    weekStart: wkst,
    weekdays: [],
    monthBy: null,
    monthDay: null,
    nth: null,
    nthWeekday: null,
    until,
    count,
  };

  if (freq === 'daily' || freq === 'yearly') {
    return byDay || byMonthDay ? null : base;
  }
  if (freq === 'weekly') {
    if (!byDay || byMonthDay || !byDay.every(isWeekday)) return null;
    const weekdays = sortFromWeekStart(byDay as Weekday[], wkst);
    return weekdays.length === byDay.length ? { ...base, weekdays } : null;
  }
  if (byDay && byMonthDay) return null;
  if (byMonthDay) {
    const monthDay = readInteger(byMonthDay, -1, 31);
    return monthDay === null || monthDay === 0
      ? null
      : { ...base, monthBy: 'day', monthDay };
  }
  const ordinal = byDay && byDay.length === 1 ? readNthWeekday(byDay[0]) : null;
  return ordinal
    ? {
        ...base,
        monthBy: 'nthWeekday',
        nth: ordinal.nth,
        nthWeekday: ordinal.weekday,
      }
    : null;
}

/** The RRULE body for a rule, in the order `parseRepeatRule` reads it back. */
export function formatRepeatRule(rule: RepeatRule): string {
  const byDay =
    rule.freq === 'weekly'
      ? `BYDAY=${sortFromWeekStart(rule.weekdays, rule.weekStart).join(',')}`
      : rule.freq === 'monthly' && rule.monthBy === 'nthWeekday'
        ? `BYDAY=${rule.nth}${rule.nthWeekday}`
        : null;
  const byMonthDay =
    rule.freq === 'monthly' && rule.monthBy === 'day'
      ? `BYMONTHDAY=${rule.monthDay}`
      : null;
  return [
    `FREQ=${FREQ_WORDS[rule.freq]}`,
    rule.interval !== 1 ? `INTERVAL=${rule.interval}` : null,
    `WKST=${rule.weekStart}`,
    byDay,
    byMonthDay,
    rule.until ? `UNTIL=${rule.until.replaceAll('-', '')}` : null,
    rule.count !== null ? `COUNT=${rule.count}` : null,
  ]
    .filter((part) => part !== null)
    .join(';');
}

function nthFromDay(day: number): 1 | 2 | 3 | 4 | -1 {
  const ordinal = Math.ceil(day / 7);
  return ordinal === 5 ? -1 : (ordinal as 1 | 2 | 3 | 4);
}

/** Builds a rule from the fields a picker or a model fills; `null` when it doesn't say how it ends or doesn't repeat. Caps are `checkRepeatRule`'s. */
export function repeatFromParts(
  parts: RepeatParts,
  startsOn: string,
  weekStart: Weekday = 'SU',
): RepeatRule | null {
  if (!parts.freq) return null;
  if (parts.endsKind === 'on' && !parts.until) return null;
  if (parts.endsKind === 'after' && parts.count === null) return null;
  const startDays = toDays(startsOn);
  const { day } = dateOf(startDays);
  const startWeekday = weekdayOf(startDays);
  const base: RepeatRule = {
    freq: parts.freq,
    interval: parts.interval,
    weekStart,
    weekdays: [],
    monthBy: null,
    monthDay: null,
    nth: null,
    nthWeekday: null,
    until: parts.endsKind === 'on' ? parts.until : null,
    count: parts.endsKind === 'after' ? parts.count : null,
  };
  if (parts.freq === 'weekly') {
    const picked = parts.weekdays.length ? parts.weekdays : [startWeekday];
    return { ...base, weekdays: sortFromWeekStart(picked, weekStart) };
  }
  if (parts.freq !== 'monthly') return base;
  if (parts.monthBy === 'lastDay') {
    return { ...base, monthBy: 'day', monthDay: -1 };
  }
  if (parts.monthBy === 'nthWeekday') {
    return {
      ...base,
      monthBy: 'nthWeekday',
      nth: parts.nth ?? nthFromDay(day),
      nthWeekday: parts.weekdays[0] ?? startWeekday,
    };
  }
  return { ...base, monthBy: 'day', monthDay: day };
}

function hasValidShape(rule: RepeatRule) {
  const hasEnd = rule.until !== null && rule.count !== null;
  const isWeekly = rule.freq === 'weekly';
  const weekdaysFit = isWeekly
    ? rule.weekdays.length >= 1 &&
      rule.weekdays.length <= 7 &&
      rule.weekdays.every(isWeekday) &&
      new Set(rule.weekdays).size === rule.weekdays.length
    : rule.weekdays.length === 0;
  const monthFits =
    rule.freq !== 'monthly'
      ? rule.monthBy === null &&
        rule.monthDay === null &&
        rule.nth === null &&
        rule.nthWeekday === null
      : rule.monthBy === 'day'
        ? isWholeNumber(rule.monthDay) &&
          (rule.monthDay === -1 ||
            (rule.monthDay >= 1 && rule.monthDay <= 31)) &&
          rule.nth === null &&
          rule.nthWeekday === null
        : rule.monthBy === 'nthWeekday' &&
          rule.monthDay === null &&
          [1, 2, 3, 4, -1].includes(rule.nth as number) &&
          rule.nthWeekday !== null &&
          isWeekday(rule.nthWeekday);
  return (
    !hasEnd &&
    isWeekday(rule.weekStart) &&
    weekdaysFit &&
    monthFits &&
    (rule.until === null || isDayKey(rule.until))
  );
}

/** The first broken cap of a rule begun on `startsOn`, or `null`; `today` is a day key. */
export function checkRepeatRule(
  rule: RepeatRule,
  startsOn: string,
  today: string,
): RepeatCapError | null {
  if (!isDayKey(startsOn) || !hasValidShape(rule)) return 'shape';
  if (!isWholeNumber(rule.interval) || rule.interval < 1) return 'tooOften';
  if (rule.interval > REPEAT_CAPS[rule.freq]) return 'interval';
  if (
    rule.count !== null &&
    (!isWholeNumber(rule.count) ||
      rule.count < 1 ||
      rule.count > REPEAT_CAPS.count)
  ) {
    return 'count';
  }
  if (rule.until !== null && rule.until < startsOn) return 'untilBeforeStart';
  const next = listOccurrences(rule, startsOn, { fromDay: today, limit: 1 });
  return next.length ? null : 'neverComes';
}

function* baseDays(rule: RepeatRule, startDay: number): Generator<number> {
  const start = dateOf(startDay);
  if (rule.freq === 'daily') {
    for (let step = 0; step < 40_000; step++)
      yield startDay + step * rule.interval;
    return;
  }
  if (rule.freq === 'weekly') {
    const weekStartIndex = weekdayIndex(rule.weekStart);
    const offsets = rule.weekdays
      .map((weekday) => (weekdayIndex(weekday) - weekStartIndex + 7) % 7)
      .sort((a, b) => a - b);
    const weekBegin =
      startDay - ((dayOfWeek(startDay) - weekStartIndex + 7) % 7);
    for (let step = 0; step < 6_000; step++) {
      for (const offset of offsets) {
        const day = weekBegin + step * 7 * rule.interval + offset;
        if (day >= startDay) yield day;
      }
    }
    return;
  }
  if (rule.freq === 'monthly') {
    for (let step = 0; step < 12_000; step++) {
      const total = start.year * 12 + start.month + step * rule.interval;
      const year = Math.floor(total / 12);
      const month = total % 12;
      const length = daysInMonth(year, month);
      const first = Date.UTC(year, month, 1) / DAY_MS;
      const day = (() => {
        if (rule.monthBy === 'day') {
          const monthDay = rule.monthDay!;
          const target = monthDay === -1 ? length : monthDay;
          return target <= length ? first + target - 1 : null;
        }
        const wanted = weekdayIndex(rule.nthWeekday!);
        if (rule.nth === -1) {
          const last = first + length - 1;
          return last - ((dayOfWeek(last) - wanted + 7) % 7);
        }
        return (
          first + ((wanted - dayOfWeek(first) + 7) % 7) + 7 * (rule.nth! - 1)
        );
      })();
      if (day !== null && day >= startDay) yield day;
    }
    return;
  }
  for (let step = 0; step < 2_000; step++) {
    const year = start.year + step * rule.interval;
    if (start.month === 1 && start.day === 29 && !isLeap(year)) continue;
    yield Date.UTC(year, start.month, start.day) / DAY_MS;
  }
}

function* ruleDays(rule: RepeatRule | null, startsOn: string) {
  const startDay = toDays(startsOn);
  if (!rule) {
    yield startDay;
    return;
  }
  const untilDay = rule.until ? toDays(rule.until) : Infinity;
  let counted = 0;
  for (const day of baseDays(rule, startDay)) {
    if (day > untilDay || day > MAX_DAY) return;
    if (rule.count !== null && counted >= rule.count) return;
    counted++;
    yield day;
  }
}

function* effectiveDays(
  rule: RepeatRule | null,
  startsOn: string,
  skipped: string[],
  moved: Moved,
) {
  const skippedKeys = new Set(skipped);
  for (const day of ruleDays(rule, startsOn)) {
    const key = toKey(day);
    if (skippedKeys.has(key)) continue;
    yield { ruleKey: key, key: moved[key] ? moved[key].day : key };
  }
}

/** The days a rule runs on, from `fromDay` (inclusive), at most `limit`; skipped days still count toward `count`, moved ones come out on their new day. A null rule runs once, on `startsOn`. */
export function listOccurrences(
  rule: RepeatRule | null,
  startsOn: string,
  options: {
    fromDay?: string;
    limit: number;
    skipped?: string[];
    moved?: Moved;
  },
): string[] {
  const { fromDay = startsOn, limit, skipped = [], moved = {} } = options;
  if (limit <= 0) return [];
  const lastMoved = Object.values(moved).reduce(
    (latest, { day }) => (day > latest ? day : latest),
    '',
  );
  const found = new Set<string>();
  for (const { ruleKey, key } of effectiveDays(
    rule,
    startsOn,
    skipped,
    moved,
  )) {
    if (key >= fromDay) found.add(key);
    if (found.size >= limit && ruleKey > lastMoved) break;
  }
  return Array.from(found).sort().slice(0, limit);
}

/** Whether two rules (or no rule) say the same thing. */
export function sameRepeatRule(
  a: RepeatRule | null,
  b: RepeatRule | null,
): boolean {
  return (a && formatRepeatRule(a)) === (b && formatRepeatRule(b));
}

/** The first run on or after `fromDay`, or `null` when none is left. */
export function nextOccurrence(
  rule: RepeatRule | null,
  startsOn: string,
  options: { fromDay: string; skipped?: string[]; moved?: Moved },
): string | null {
  return listOccurrences(rule, startsOn, { ...options, limit: 1 })[0] ?? null;
}

/** "1st", "22nd", "29th". */
export const ordinalNumber = (day: number) => {
  const tens = day % 100;
  if (tens >= 11 && tens <= 13) return `${day}th`;
  return `${day}${['th', 'st', 'nd', 'rd'][day % 10] ?? 'th'}`;
};

const weekdayName = (weekday: Weekday) => WEEKDAY_NAMES[weekdayIndex(weekday)];

function formatDay(key: string, withYear: boolean) {
  const days = toDays(key);
  const { year, month, day } = dateOf(days);
  const text = `${WEEKDAY_NAMES[dayOfWeek(days)].slice(0, 3)}, ${MONTH_SHORT[month]} ${day}`;
  return withYear ? `${text}, ${year}` : text;
}

const formatMonthDay = (key: string) => {
  const { month, day } = dateOf(toDays(key));
  return `${MONTH_SHORT[month]} ${day}`;
};

const joinWords = (words: string[]) =>
  words.length < 2
    ? words.join('')
    : `${words.slice(0, -1).join(', ')} and ${words[words.length - 1]}`;

const nthWeekdayWords = (nth: number, weekday: Weekday) =>
  `the ${ORDINAL_WORDS[nth]} ${weekdayName(weekday)}`;

function currentYear() {
  return new Date(Date.now()).getUTCFullYear();
}

/** Google's presets worded from the first day (Does not repeat first); Custom is the picker's own row. */
export function repeatPresets(
  startsOn: string,
  weekStart: Weekday = 'SU',
): RepeatPreset[] {
  const startDays = toDays(startsOn);
  const { year, month, day } = dateOf(startDays);
  const startWeekday = weekdayOf(startDays);
  const length = daysInMonth(year, month);
  const make = (
    parts: Partial<RepeatParts> & Pick<RepeatParts, 'freq'>,
  ): RepeatRule | null =>
    repeatFromParts(
      {
        interval: 1,
        weekdays: [],
        monthBy: null,
        nth: null,
        endsKind: 'never',
        until: null,
        count: null,
        ...parts,
      },
      startsOn,
      weekStart,
    );
  const nth = nthFromDay(day);
  const startLabel = formatDay(startsOn, year !== currentYear());
  const presets: RepeatPreset[] = [
    {
      key: 'none',
      label: 'Does not repeat',
      detail: `Runs once, ${startLabel}`,
      rule: null,
    },
    {
      key: 'daily',
      label: 'Every day',
      detail: null,
      rule: make({ freq: 'daily' }),
    },
    {
      key: 'weekdays',
      label: 'Every weekday',
      detail: 'Monday to Friday',
      rule: make({ freq: 'weekly', weekdays: WEEKDAYS_MON_FRI }),
    },
    {
      key: 'weekly',
      label: `Every week on ${weekdayName(startWeekday)}`,
      detail: null,
      rule: make({ freq: 'weekly', weekdays: [startWeekday] }),
    },
    {
      key: 'monthlyDay',
      label: `Every month on the ${ordinalNumber(day)}`,
      detail:
        day >= 29 ? `Months without a ${ordinalNumber(day)} are skipped` : null,
      rule: make({ freq: 'monthly', monthBy: 'day' }),
    },
    {
      key: 'monthlyWeekday',
      label: `Every month on ${nthWeekdayWords(nth, startWeekday)}`,
      detail: null,
      rule: make({
        freq: 'monthly',
        monthBy: 'nthWeekday',
        nth,
        weekdays: [startWeekday],
      }),
    },
  ];
  const lastWeekday: RepeatPreset[] =
    nth === 4 && day + 7 > length
      ? [
          {
            key: 'monthlyLastWeekday',
            label: `Every month on ${nthWeekdayWords(-1, startWeekday)}`,
            detail: null,
            rule: make({
              freq: 'monthly',
              monthBy: 'nthWeekday',
              nth: -1,
              weekdays: [startWeekday],
            }),
          },
        ]
      : [];
  const lastDay: RepeatPreset[] =
    day === length
      ? [
          {
            key: 'monthlyLastDay',
            label: 'Every month on the last day',
            detail: null,
            rule: make({ freq: 'monthly', monthBy: 'lastDay' }),
          },
        ]
      : [];
  const yearly: RepeatPreset = {
    key: 'yearly',
    label: `Every year on ${formatMonthDay(startsOn)}`,
    detail: month === 1 && day === 29 ? 'Only in leap years' : null,
    rule: make({ freq: 'yearly' }),
  };
  return [...presets, ...lastWeekday, ...lastDay, yearly];
}

function defaultTimeFormat(time: string) {
  const match = /^(\d{1,2}):(\d{2})$/.exec(time);
  if (!match) return time;
  const hour = Number(match[1]);
  return `${hour % 12 || 12}:${match[2]} ${hour < 12 ? 'AM' : 'PM'}`;
}

function describeCadence(rule: RepeatRule, startsOn: string) {
  const every = (unit: string) =>
    rule.interval === 1 ? `Every ${unit}` : `Every ${rule.interval} ${unit}s`;
  if (rule.freq === 'daily') return every('day');
  if (rule.freq === 'yearly') {
    return `${every('year')} on ${formatMonthDay(startsOn)}`;
  }
  if (rule.freq === 'weekly') {
    const days = sortFromWeekStart(rule.weekdays, rule.weekStart);
    const isWeekdays =
      days.length === 5 && WEEKDAYS_MON_FRI.every((day) => days.includes(day));
    if (rule.interval === 1 && isWeekdays) return 'Every weekday';
    if (rule.interval === 1 && days.length === 7) return 'Every day';
    const names =
      days.length === 7 ? 'every day' : joinWords(days.map(weekdayName));
    return `${every('week')} on ${names}`;
  }
  const where =
    rule.monthDay === -1
      ? 'the last day'
      : rule.monthBy === 'day'
        ? `the ${ordinalNumber(rule.monthDay!)}`
        : nthWeekdayWords(rule.nth!, rule.nthWeekday!);
  return `${every('month')} on ${where}`;
}

/** The one words line for a rule ("Every 2 weeks on Sunday and Wednesday at 6:00 PM, until Sun, Feb 28"); `time` is "HH:mm" and `timeFormat` words it. */
export function describeRepeat(
  rule: RepeatRule | null,
  startsOn: string,
  options: {
    time?: string | null;
    timeFormat?: (time: string) => string;
  } = {},
): string {
  if (!rule) return 'Does not repeat';
  const { time = null, timeFormat = defaultTimeFormat } = options;
  const skipsMonths =
    (rule.freq === 'monthly' &&
      rule.monthBy === 'day' &&
      rule.monthDay! >= 29) ||
    (rule.freq === 'yearly' && startsOn.slice(5) === '02-29');
  const untilYearShown =
    rule.until !== null && rule.until.slice(0, 4) !== startsOn.slice(0, 4);
  const timeWords = time ? ` at ${timeFormat(time)}` : '';
  if (rule.count === 1) {
    const [only = startsOn] = listOccurrences(rule, startsOn, { limit: 1 });
    return `Once, on ${formatDay(only, only.slice(0, 4) !== startsOn.slice(0, 4))}${timeWords}`;
  }
  return [
    describeCadence(rule, startsOn),
    timeWords,
    skipsMonths
      ? rule.freq === 'yearly'
        ? ' (leap years only)'
        : ' (months without one are skipped)'
      : '',
    rule.until ? `, until ${formatDay(rule.until, untilYearShown)}` : '',
    rule.count !== null ? `, ${rule.count} times` : '',
  ].join('');
}

/** The person's first day of the week from `Intl.Locale` week info; Sunday when the browser doesn't say. */
export function localeWeekStart(locale?: string): Weekday {
  try {
    const intlLocale = new Intl.Locale(
      locale ??
        (typeof navigator !== 'undefined' ? navigator.language : 'en-US'),
    ) as Intl.Locale & {
      getWeekInfo?: () => { firstDay: number };
      weekInfo?: { firstDay: number };
    };
    const info = intlLocale.getWeekInfo?.() ?? intlLocale.weekInfo;
    return info ? SUN_FIRST[info.firstDay % 7] : 'SU';
  } catch {
    return 'SU';
  }
}
