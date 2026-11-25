import { toAddress } from '../../../email/emailUtils.js';
import type { AmcFormat, TicketPriceKind } from '../types.js';

export interface LocalShowtime {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
}

export interface AmcReservation {
  kind: 'reservation';
  confirmation: string;
  title: string;
  contentRating: string | null;
  showtimeLocal: LocalShowtime;
  theatreName: string;
  auditorium: string | null;
  seats: string | null;
  ticketCount: number;
  ticketKind: TicketPriceKind | null;
  /** What one ticket listed for, before the member's savings; null when the email lists none. */
  ticketPriceCents: number | null;
  /** The convenience fee AMC waived, per ticket. */
  feeWaivedCents: number;
  /** A premium format named beside the title; null when none is. */
  format: AmcFormat | null;
}

export interface AmcCancellation {
  kind: 'cancellation';
  confirmation: string;
  orderNumber: string | null;
  /** The refund date as the email prints it ("11/23/2026"); null when it prints none. */
  refundDate: string | null;
  title: string;
  showtimeLocal: LocalShowtime;
  theatreName: string;
  /** The tickets the email says were refunded; null when it gives no count. */
  refundedCount: number | null;
}

export type AmcReading = AmcReservation | AmcCancellation;

const AMC_DOMAIN = /(?:^|\.)amctheatres\.com$/;
const RATINGS = /^(.*\S)\s+(G|PG-13|PG|R|NC-17|NR|Not Rated|Unrated)$/;
const DATE = /\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/;
const TIME = /\b(\d{1,2}):(\d{2})(?:\s*([AP])\.?M\b\.?)?/i;
const FORMAT_WORDS: [RegExp, AmcFormat][] = [
  [/\bdolby cinema(?: at amc)?/gi, 'DOLBY_CINEMA'],
  [/\bimax(?: with laser(?: at amc)?)?(?: 70mm)?/gi, 'IMAX'],
  [/\bprime at amc/gi, 'PRIME'],
  [/\breal ?d 3d\b|\b3d\b/gi, 'REALD_3D'],
];

const collapse = (value: string) => value.replace(/\s+/g, ' ').trim();

/** One line per non-empty line, its spaces collapsed, so a title and a theater on their own lines stay apart. */
const toLines = (value: string) =>
  value
    .split('\n')
    .map(collapse)
    .filter((line) => line !== '')
    .join('\n');

const LANGUAGE_LINE =
  /\b(?:spoken|subtitles?|subtitled|dubbed|open caption(?:ed)?)\b/i;
const LINK = /<https?:\/\/[^>\s]*>|https?:\/\/\S+/gi;

const isRealDate = (year: number, month: number, day: number) => {
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
};

/** Whether the email came from AMC: its sender domain, or a forwarded-message header naming it. */
export function isFromAmc(from: string, text: string) {
  const domain = toAddress(from).split('@')[1] ?? '';
  return (
    AMC_DOMAIN.test(domain) ||
    /^[ >]*from:[^\n]*@(?:[a-z0-9-]+\.)*amctheatres\.com/im.test(text)
  );
}

/** Whether the text reads like an order, a reservation or a refund rather than news or an offer. */
export const looksLikeAmcOrder = (text: string) =>
  /ticket reservation|reservation details|ticket confirmation|confirmation\s*#|order number|ticket refund|refunded tickets|canceled your reservation|cancelled your reservation/i.test(
    text,
  );

function readShowing(segment: string) {
  const date = DATE.exec(segment);
  const time = TIME.exec(segment);
  if (date === null || time === null) return null;
  const [month, day, year] = [date[1], date[2], date[3]].map(Number);
  const meridiem = time[3]?.toUpperCase() ?? null;
  const rawHour = Number(time[1]);
  const minute = Number(time[2]);
  const hour =
    meridiem === null ? rawHour : (rawHour % 12) + (meridiem === 'P' ? 12 : 0);
  const isValid =
    isRealDate(year, month, day) &&
    minute <= 59 &&
    (meridiem === null ? rawHour <= 23 : rawHour >= 1 && rawHour <= 12);
  if (!isValid) return null;
  const start = Math.min(date.index, time.index);
  const end = Math.max(
    date.index + date[0].length,
    time.index + time[0].length,
  );
  const head = collapse(
    segment
      .slice(0, start)
      .split('\n')
      .filter((line) => !LANGUAGE_LINE.test(line))
      .join(' '),
  );
  const rated = RATINGS.exec(head);
  const title = (rated?.[1] ?? head).replace(/[\s:,;.-]+$/, '').trim();
  const theatreName = (segment.slice(end).trim().split('\n')[0] ?? '').slice(
    0,
    80,
  );
  return title === '' || theatreName === ''
    ? null
    : {
        title: title.slice(0, 120),
        contentRating: rated?.[2] ?? null,
        showtimeLocal: { year, month, day, hour, minute },
        theatreName,
      };
}

const readConfirmationNumber = (text: string) => {
  const match = /Confirmation\s*#?\s*:?\s*(\d{6,12})/i.exec(text);
  return match === null
    ? null
    : { digits: match[1], after: text.slice(match.index + match[0].length) };
};

const toCents = (value: string) =>
  Math.round(Number(value.replace(/,/g, '')) * 100);

const readTicketKind = (word: string): TicketPriceKind | null =>
  /senior/i.test(word)
    ? 'SENIOR'
    : /child|kid|youth/i.test(word)
      ? 'CHILD'
      : /adult/i.test(word)
        ? 'ADULT'
        : null;

function readReservation(text: string): AmcReservation | null {
  const found = readConfirmationNumber(text);
  if (found === null) return null;
  const endIndex = found.after.search(
    /The listed showtime|Auditorium:|Reserved Seats:|Ticket:/i,
  );
  const rawSegment = endIndex === -1 ? '' : found.after.slice(0, endIndex);
  const format =
    FORMAT_WORDS.find(([pattern]) => {
      pattern.lastIndex = 0;
      return pattern.test(rawSegment);
    })?.[1] ?? null;
  const segment = toLines(
    FORMAT_WORDS.reduce(
      (kept, [pattern]) => kept.replace(pattern, ' '),
      rawSegment,
    ),
  );
  const showing = readShowing(segment);
  if (showing === null) return null;
  const lines = Array.from(
    found.after.matchAll(
      /Ticket:\s*(\d{1,2})\s+([A-Za-z ]{3,20}?);\s*\$([\d,]+\.\d{2})/gi,
    ),
  );
  const ticketCount = lines.reduce((sum, line) => sum + Number(line[1]), 0);
  const first = lines[0];
  const fee = /Waived\s+Convenience\s+Fee:\s*\$([\d,]+\.\d{2})/i.exec(
    found.after,
  );
  const count = Math.max(ticketCount, 1);
  return {
    kind: 'reservation',
    confirmation: found.digits,
    ...showing,
    auditorium:
      /Auditorium:\s*([A-Za-z0-9-]{1,12})/i.exec(found.after)?.[1] ?? null,
    seats:
      /Reserved Seats:\s*([A-Z]\d{1,2}(?:\s*,\s*[A-Z]\d{1,2})*)/i.exec(
        found.after,
      )?.[1] ?? null,
    ticketCount: ticketCount > 0 ? ticketCount : 1,
    ticketKind: first === undefined ? null : readTicketKind(first[2]),
    ticketPriceCents:
      first === undefined
        ? null
        : Math.round(toCents(first[3]) / Number(first[1])),
    feeWaivedCents: fee === null ? 0 : Math.round(toCents(fee[1]) / count),
    format,
  };
}

function readCancellation(text: string): AmcCancellation | null {
  const found = readConfirmationNumber(text);
  if (found === null) return null;
  const endIndex = found.after.search(/Refunded Tickets:/i);
  const segment = toLines(
    (endIndex === -1
      ? found.after.slice(0, 300)
      : found.after.slice(0, endIndex)
    ).replace(/Refund Date:\s*\d{1,2}\/\d{1,2}\/\d{4}/gi, ' '),
  );
  const showing = readShowing(segment);
  if (showing === null) return null;
  const refunded = Array.from(
    text.matchAll(/Refunded Tickets:\s*(\d{1,2})\s+[A-Za-z ]{3,20}?;/gi),
  );
  return {
    kind: 'cancellation',
    confirmation: found.digits,
    orderNumber: /Order Number:\s*(\d{6,12})/i.exec(text)?.[1] ?? null,
    refundDate:
      /Refund Date:\s*(\d{1,2}\/\d{1,2}\/\d{4})/i.exec(text)?.[1] ?? null,
    title: showing.title,
    showtimeLocal: showing.showtimeLocal,
    theatreName: showing.theatreName,
    refundedCount:
      refunded.length === 0
        ? null
        : refunded.reduce((sum, line) => sum + Number(line[1]), 0),
  };
}

/** Reads AMC's reservation and cancellation layouts from the email's text; null when it is neither or the layout isn't recognised. Never reads the member's name or Stubs number. */
export function parseAmcEmail(email: string): AmcReading | null {
  // AMC's own plain text puts a tracking link between a label and its value, and a forward writes one after a linked word.
  const text = email.replace(LINK, ' ');
  const isCancellation =
    /canceled your reservation|cancelled your reservation|ticket refund details|refunded tickets/i.test(
      text,
    );
  return isCancellation ? readCancellation(text) : readReservation(text);
}

const NOT_A_NAME = [
  'amc',
  'team',
  'there',
  'friend',
  'member',
  'guest',
  'hello',
  'thanks',
  'thank',
  'enjoy',
  'here',
  'your',
  'order',
  'confirmed',
  'tickets',
  'reminder',
  'important',
  'reservation',
  'great',
  'congrats',
];

const names = (text: string) =>
  Array.from(
    new Set(
      [
        /^[ \t>]*(?:(?:member|full|guest) )?name\s*:\s*([^\n]+)/im.exec(
          text,
        )?.[1],
        /^\s*(?:Hi|Hello|Hey|Dear)\s+([A-Z][A-Za-z'’-]+)\s*[,!:]/m.exec(
          text,
        )?.[1],
        /^\s*([A-Z][A-Za-z'’-]+),\s+below/m.exec(text)?.[1],
        /^\s*(?:(?:Subject|Fwd?|Fw|Re):\s*)*([A-Z][A-Za-z'’-]+(?: [A-Z][A-Za-z'’-]+){0,2}),\s+(?:[Yy]ou|[Yy]our|[Hh]ere|[Tt]hanks|[Ee]njoy)\b/m.exec(
          text,
        )?.[1],
      ].flatMap((name) =>
        name === undefined
          ? []
          : [name.trim(), ...name.trim().split(/\s+/)].filter(
              (part) =>
                part.length >= 3 && !NOT_A_NAME.includes(part.toLowerCase()),
            ),
      ),
    ),
  ).sort((left, right) => right.length - left.length);

const escapeRegExp = (value: string) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const STANDALONE_NAME_LINE =
  /^[ \t]*[A-Z][A-Za-z'’-]+(?: (?:[A-Z]\.|[A-Z][A-Za-z'’-]+)){1,3}[ \t]*$/gm;
const GROUPED_DIGITS = /\b\d{3,}(?:[ -]\d{3,})+\b/g;

const isNameLine = (line: string, found: string[], subject: string) =>
  line.split(' ').some((word) => found.includes(word)) ||
  (!line.startsWith('amc ') && !subject.includes(line));

/**
 * The email's text without the membership block, the member's name or any long number, for the short excerpt an event keeps and the prompt the AI gets.
 * Names come from `text` and `context` (the subject and body read together), so a name in either is removed from both; a line of two to four capitalised words goes unless the subject holds it (a title) and holds no found name.
 */
export function withoutMemberDetails(text: string, subject = '', context = '') {
  const known = names(`${subject}\n${text}\n${context}`);
  const found = known.map((name) => name.toLowerCase());
  const keptSubject = subject.toLowerCase();
  const stripped = text
    .replace(/AMC Stubs Details[\s\S]*?(?=\bSummary\b|$)/i, ' ')
    .replace(/^[ \t>]*(?:(?:member|full|guest) )?name\s*:[^\n]*/gim, ' ')
    .replace(STANDALONE_NAME_LINE, (line) =>
      isNameLine(line.trim().toLowerCase(), found, keptSubject) ? ' ' : line,
    )
    .replace(GROUPED_DIGITS, (run) =>
      run.replace(/\D/g, '').length >= 12 ? ' ' : run,
    )
    .replace(/\b\d{12,}\b/g, ' ');
  return known.reduce(
    (kept, name) =>
      kept.replace(new RegExp(`\\b${escapeRegExp(name)}\\b`, 'gi'), ' '),
    stripped,
  );
}
