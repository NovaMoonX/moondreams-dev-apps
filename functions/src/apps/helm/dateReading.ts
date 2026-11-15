// Generated from src/apps/helm/utils/dateReading.ts by scripts/checks/serverCopies.ts. Do not edit; run npm run connections:vendor.
import { parseNaturalDate } from './naturalDate.js';
import type { DateSpan } from './nomos/commands.js';

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

export const readIsUrgent = (text: string) => URGENT_RE.test(text);

/** The dates the words give: natural phrases ("Friday", "tomorrow at 3") and month, year or decade spans, none overlapping, in order of the text. */
export function readDates(
  text: string,
  options: { now: number; timeZone: string },
): DateSpan[] {
  const natural: DateSpan[] = parseNaturalDate(text, options).map((entry) => ({
    id: `date:${entry.start}`,
    text: entry.text,
    start: entry.start,
    end: entry.end,
    due: entry.due,
    precision: null,
  }));
  return readCoarseDates(text, new Date(options.now).getUTCFullYear())
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
}
