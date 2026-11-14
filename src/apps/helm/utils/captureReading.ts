import { parseNaturalDate } from '@/utils/naturalDateUtils';
import { getDateTimeFormat, zonedDateTimeToEpoch } from '@/utils/timezoneUtils';
import type {
  CaptureReading,
  DateSpan,
  TaskDue,
  Token,
} from '@apps/helm/types';

const SIGIL_RE =
  /(?<![\p{L}\p{N}_])([@#^])(\p{L}[\p{L}\p{N}_]*(?:['’-][\p{L}\p{N}_]+)*)/gu;
const CAPITALISED_WORD_RE = /^ (\p{Lu}[\p{L}\p{N}_]*(?:['’-][\p{L}\p{N}_]+)*)/u;
const TITLE_ABBREVIATION_RE = /(?<![\p{L}\p{N}_])(?:Dr|Mr|Mrs|Ms|Mx|St)$/u;
const POSSESSIVE_RE = /['’]s$/i;
const NAME_STOPLIST = new Set([
  'Please',
  'Thanks',
  'I',
  'The',
  'A',
  'An',
  'And',
  'About',
  'To',
  'At',
  'For',
  'On',
  'In',
  'With',
  'Then',
  'But',
  'So',
]);
const MONTH_YEAR_RE =
  /(?<![\p{L}\p{N}])(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sept?(?:ember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\.?,?\s+(\d{4})(?![\p{L}\p{N}])/giu;
const BARE_YEAR_RE = /(?<![\p{L}\p{N}])in\s+(\d{4})(?![\p{L}\p{N}])/giu;
const DECADE_RE =
  /(?<![\p{L}\p{N}])in\s+(the\s+['’]?((?:19|20)\d0|\d0)s)(?![\p{L}\p{N}])/giu;
const MONTH_NUMBERS = [
  'jan',
  'feb',
  'mar',
  'apr',
  'may',
  'jun',
  'jul',
  'aug',
  'sep',
  'oct',
  'nov',
  'dec',
];
const URGENT_RE = /(?<!\S)!(?!\S)|^!(?=\S)/;

export const EMPTY_READING: CaptureReading = {
  people: [],
  places: [],
  documents: [],
  commands: [],
  isUrgent: false,
  dates: [],
  addressedAs: null,
};

const KIND_BY_SIGIL = {
  '@': 'people',
  '#': 'places',
  '^': 'documents',
} as const;

const escapeRegExp = (value: string) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Takes the capitalised words that follow, so "#Sweet Layer Bakery" is one place and "@Dr. Alexandria Chen" one person, but never into a date phrase or a capitalised function word ("Please"). */
const extendRun = (
  text: string,
  end: number,
  isStopped: (start: number) => boolean,
): number => {
  const dot =
    text[end] === '.' && TITLE_ABBREVIATION_RE.test(text.slice(0, end));
  const from = dot ? end + 1 : end;
  const next = CAPITALISED_WORD_RE.exec(text.slice(from));
  const isFunctionWord = next && NAME_STOPLIST.has(next[1].split(/['’-]/)[0]);
  if (!next || isFunctionWord || isStopped(from + 1)) return end;
  return extendRun(text, from + next[0].length, isStopped);
};

const readAddressedAs = (text: string, assistantName: string): Token | null => {
  const name = assistantName.trim();
  if (!name) return null;
  const match = new RegExp(`^\\s*(${escapeRegExp(name)})\\s*,`, 'i').exec(text);
  if (!match) return null;
  const start = match[0].indexOf(match[1]);
  return {
    id: `addressedAs:${start}`,
    text: match[1],
    start,
    end: start + match[1].length,
  };
};

/** A decade's first year: "80" is 1980 and "10" is 2010, and a two-digit decade later than this year is in the 1900s. */
const toDecadeStart = (digits: string, thisYear: number) => {
  if (digits.length === 4) return Number(digits);
  const recent = 2000 + Number(digits);
  return recent <= thisYear ? recent : 1900 + Number(digits);
};

/** The dates the words give only to the month, the year or the decade, as spans on that period's first day. */
function readCoarseDates(text: string, thisYear: number): DateSpan[] {
  const span = (
    match: RegExpMatchArray,
    textStart: number,
    year: number,
    month: number,
    precision: 'month' | 'year' | 'decade',
  ): DateSpan => {
    const start = (match.index ?? 0) + textStart;
    const end = (match.index ?? 0) + match[0].length;
    return {
      id: `date:${start}`,
      text: text.slice(start, end),
      start,
      end,
      due: { kind: 'day', date: Date.UTC(year, month, 1) },
      precision,
    };
  };
  const months = Array.from(text.matchAll(MONTH_YEAR_RE)).flatMap((match) => {
    const year = Number(match[2]);
    const month = MONTH_NUMBERS.indexOf(match[1].slice(0, 3).toLowerCase());
    return year >= 1900 && year <= thisYear && month >= 0
      ? [span(match, 0, year, month, 'month')]
      : [];
  });
  const years = Array.from(text.matchAll(BARE_YEAR_RE)).flatMap((match) => {
    const year = Number(match[1]);
    return year >= 1900 && year <= thisYear
      ? [span(match, match[0].length - match[1].length, year, 0, 'year')]
      : [];
  });
  const decades = Array.from(text.matchAll(DECADE_RE)).flatMap((match) => {
    const year = toDecadeStart(match[2], thisYear);
    return year >= 1900 && year <= thisYear
      ? [span(match, match[0].length - match[1].length, year, 0, 'decade')]
      : [];
  });
  return [...months, ...years, ...decades];
}

const RANGE_END_RE =
  /^\s*(?:to|through|thru|until|-|–)\s*(\d{1,2})(?:st|nd|rd|th)?\b/i;

/** The bare day that closes a range ("Dec 2 to 9"), as a day in the same month as the date before it. */
function readRangeEnds(text: string, natural: DateSpan[]): DateSpan[] {
  return natural.flatMap((span) => {
    const match = RANGE_END_RE.exec(text.slice(span.end));
    if (!match || span.due.kind !== 'day') return [];
    const first = new Date(span.due.date);
    const day = Number(match[1]);
    const date = Date.UTC(first.getUTCFullYear(), first.getUTCMonth(), day);
    if (
      day <= first.getUTCDate() ||
      new Date(date).getUTCMonth() !== first.getUTCMonth()
    ) {
      return [];
    }
    const start = span.end + match[0].search(/\d/);
    const end = span.end + match[0].length;
    return [
      {
        id: `date:${start}`,
        text: text.slice(start, end),
        start,
        end,
        due: { kind: 'day' as const, date },
        precision: null,
      },
    ];
  });
}

/** Reads what is certain in the words: `@` people, `#` places, `^` procedures or notes, a lone `!`, date phrases and a leading "name,". Nothing is guessed. */
export function readCapture(
  text: string,
  options: { now: number; timeZone: string; assistantName: string },
): CaptureReading {
  const natural: DateSpan[] = parseNaturalDate(text, options).map((entry) => ({
    id: `date:${entry.start}`,
    text: entry.text,
    start: entry.start,
    end: entry.end,
    due: entry.due,
    precision: null,
  }));
  const dates = readCoarseDates(text, new Date(options.now).getUTCFullYear())
    .concat(readRangeEnds(text, natural))
    .filter(
      (coarse) =>
        !natural.some(
          (span) => coarse.start < span.end && span.start < coarse.end,
        ),
    )
    .reduce<DateSpan[]>(
      (kept, coarse) =>
        kept.some((span) => coarse.start < span.end && span.start < coarse.end)
          ? kept
          : [...kept, coarse],
      natural,
    )
    .sort((a, b) => a.start - b.start);
  const isInDate = (start: number) =>
    dates.some((span) => start >= span.start && start < span.end);
  const tokens = Array.from(text.matchAll(SIGIL_RE)).map((match) => {
    const start = match.index ?? 0;
    const kind = KIND_BY_SIGIL[match[1] as keyof typeof KIND_BY_SIGIL];
    const firstEnd = start + match[0].length;
    const isCapitalised = /^\p{Lu}/u.test(match[2]);
    const runEnd = isCapitalised
      ? extendRun(text, firstEnd, isInDate)
      : firstEnd;
    const end = POSSESSIVE_RE.test(text.slice(start + 1, runEnd))
      ? runEnd - 2
      : runEnd;
    return {
      kind,
      token: {
        id: `${kind}:${start}`,
        text: text.slice(start + 1, end),
        start,
        end,
      },
    };
  });
  const tokensOf = (kind: (typeof KIND_BY_SIGIL)[keyof typeof KIND_BY_SIGIL]) =>
    tokens.filter((entry) => entry.kind === kind).map((entry) => entry.token);
  return {
    people: tokensOf('people'),
    places: tokensOf('places'),
    documents: tokensOf('documents'),
    commands: [],
    isUrgent: URGENT_RE.test(text),
    dates,
    addressedAs: readAddressedAs(text, options.assistantName),
  };
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const isToken = (value: unknown): value is Token =>
  isRecord(value) &&
  typeof value.id === 'string' &&
  typeof value.text === 'string' &&
  typeof value.start === 'number' &&
  typeof value.end === 'number';

const isDue = (value: unknown): value is TaskDue =>
  isRecord(value) &&
  ((value.kind === 'day' && typeof value.date === 'number') ||
    (value.kind === 'moment' && typeof value.at === 'number'));

const PRECISIONS = ['month', 'year', 'decade'] as const;

const toTokens = (value: unknown) =>
  Array.isArray(value) ? value.filter(isToken) : [];

/** Opens any stored reading, an older turn's `{}` included, with every field present. */
export function normalizeReading(value: unknown): CaptureReading {
  if (!isRecord(value)) return EMPTY_READING;
  return {
    people: toTokens(value.people),
    places: toTokens(value.places),
    documents: toTokens(value.documents),
    commands: toTokens(value.commands),
    isUrgent: value.isUrgent === true,
    dates: Array.isArray(value.dates)
      ? value.dates
          .filter(
            (entry): entry is DateSpan =>
              isToken(entry) && isDue((entry as DateSpan).due),
          )
          .map((entry) => ({
            ...entry,
            precision:
              PRECISIONS.find((kind) => kind === entry.precision) ?? null,
          }))
      : [],
    addressedAs: isToken(value.addressedAs) ? value.addressedAs : null,
  };
}

/** What a chip is called when it is dropped or fixed: the same words keep the same answer while the person keeps typing before them. */
export const getReadingKey = (kind: string, text: string) =>
  `${kind}:${text.toLowerCase()}`;

export const URGENT_KEY = 'urgent';

export const getClockOf = (at: number, timeZone: string) => {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(at));
  const read = (type: string) =>
    parts.find((part) => part.type === type)?.value ?? '00';
  return `${read('hour')}:${read('minute')}`;
};

/** The calendar day of a due (UTC midnight): a moment's day is the one it falls on in `timeZone`. */
export const getDueDay = (due: TaskDue, timeZone: string) => {
  if (due.kind === 'day') return due.date;
  const parts = getDateTimeFormat({
    timeZone,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
  }).formatToParts(new Date(due.at));
  const read = (type: string) =>
    Number(parts.find((part) => part.type === type)?.value);
  return Date.UTC(read('year'), read('month') - 1, read('day'));
};

/** The same phrase on another calendar day (UTC midnight), keeping a moment's time of day in `timeZone`. */
export const moveDueToDay = (
  due: TaskDue,
  day: number,
  timeZone: string,
): TaskDue => {
  if (due.kind === 'day') return { kind: 'day', date: day };
  return {
    kind: 'moment',
    at: zonedDateTimeToEpoch(
      new Date(day).toISOString().slice(0, 10),
      getClockOf(due.at, timeZone),
      timeZone,
    ),
  };
};

/** The reading with the dropped chips taken out and the fixed days put in; the words are never touched. */
export function applyReadingEdits(
  reading: CaptureReading,
  edits: {
    dismissed: string[];
    days: Record<string, number>;
    timeZone: string;
  },
): CaptureReading {
  const isKept = (kind: string) => (token: Token) =>
    !edits.dismissed.includes(getReadingKey(kind, token.text));
  return {
    ...reading,
    people: reading.people.filter(isKept('people')),
    places: reading.places.filter(isKept('places')),
    documents: reading.documents.filter(isKept('documents')),
    isUrgent: reading.isUrgent && !edits.dismissed.includes(URGENT_KEY),
    dates: reading.dates.filter(isKept('dates')).map((span) => {
      const day = edits.days[getReadingKey('dates', span.text)];
      return day === undefined
        ? span
        : { ...span, due: moveDueToDay(span.due, day, edits.timeZone) };
    }),
  };
}
