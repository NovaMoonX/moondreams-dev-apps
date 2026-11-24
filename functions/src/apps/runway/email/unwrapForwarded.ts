import { isForwardingConfirmation } from '../../../email/forwardingConfirmation.js';

const DAY_MS = 86_400_000;
const MAX_LINE = 400;

const PLAIN_PREFIX = /^\s*(?:fwd?|tr|wg)\s*:\s*/i;
const BRACKET_PREFIX = /^\s*\[\s*fwd?\s*:\s*([\s\S]*?)\]\s*$/i;
const MARKER =
  /^[-_=*\s]*(?:begin\s+)?(?:forwarded|original)\s+message[-_=*\s]*:?$/i;
const UNDERSCORES = /^_{8,}$/;
const HEADER = /^(from|to|cc|bcc|date|sent|subject|reply-to)\s*:\s*(.*)$/i;

const MONTH = '(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\\.?';
const ZONES: Record<string, number> = {
  utc: 0,
  gmt: 0,
  est: -5,
  edt: -4,
  cst: -6,
  cdt: -5,
  mst: -7,
  mdt: -6,
  pst: -8,
  pdt: -7,
};

interface ForwardableMail {
  from: string;
  subject: string;
  text: string;
  receivedAt: number;
  isDkimPassed: boolean;
  dkimDomain?: string | null;
}

/** The subject without any number of leading `Fwd:`, `Fw:`, `TR:`, `WG:` or `[Fwd: …]` marks. */
export function stripForwardPrefixes(subject: string): string {
  const next = subject.replace(PLAIN_PREFIX, '').replace(BRACKET_PREFIX, '$1');
  return next === subject ? subject.trim() : stripForwardPrefixes(next);
}

const monthIndex = (name: string) =>
  [
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
  ].indexOf(name.slice(0, 3).toLowerCase());

function readDay(text: string): [number, number, number] | null {
  const monthFirst = new RegExp(
    `\\b${MONTH}\\s+(\\d{1,2})(?:st|nd|rd|th)?,?\\s+(\\d{4})\\b`,
    'i',
  ).exec(text);
  if (monthFirst) {
    return [
      Number(monthFirst[3]),
      monthIndex(monthFirst[1]),
      Number(monthFirst[2]),
    ];
  }
  const dayFirst = new RegExp(
    `\\b(\\d{1,2})\\s+${MONTH},?\\s+(\\d{4})\\b`,
    'i',
  ).exec(text);
  if (dayFirst) {
    return [Number(dayFirst[3]), monthIndex(dayFirst[2]), Number(dayFirst[1])];
  }
  const iso = /\b(\d{4})-(\d{2})-(\d{2})\b/.exec(text);
  if (iso) return [Number(iso[1]), Number(iso[2]) - 1, Number(iso[3])];
  const us = /\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/.exec(text);
  return us ? [Number(us[3]), Number(us[1]) - 1, Number(us[2])] : null;
}

/** An instant from a forwarded block's Date or Sent line, or null when it holds no clear day. */
export function readForwardedDate(value: string): number | null {
  const text = value
    .replace(/\bat\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const day = readDay(text);
  if (day === null) return null;
  const [year, month, date] = day;
  const time = /\b(\d{1,2}):(\d{2})(?::\d{2})?\s*([ap])\.?m\b/i.exec(text);
  const plain = /\b(\d{1,2}):(\d{2})(?::\d{2})?\b/.exec(text);
  const hour = time
    ? (Number(time[1]) % 12) + (time[3].toLowerCase() === 'p' ? 12 : 0)
    : plain
      ? Number(plain[1])
      : 12;
  const minute = Number(time?.[2] ?? plain?.[2] ?? 0);
  const afterTime = text.slice((time ?? plain)?.index ?? 0);
  const named = /\b(utc|gmt|[ecmp][sd]t)\b/i.exec(afterTime);
  const numeric = /\s([+-])(\d{2}):?(\d{2})\b/.exec(afterTime);
  const offsetHours = named
    ? ZONES[named[1].toLowerCase()]
    : numeric
      ? (numeric[1] === '-' ? -1 : 1) *
        (Number(numeric[2]) + Number(numeric[3]) / 60)
      : 0;
  const instant =
    Date.UTC(year, month, date, hour, minute) - offsetHours * 3_600_000;
  return Number.isFinite(instant) ? instant : null;
}

interface Block {
  from: string | null;
  subject: string | null;
  date: string | null;
  body: string;
}

const MAX_HEADER_LINES = 40;
const MAX_BLANK_RUN = 20;

function readHeaders(lines: string[], start: number) {
  const isHeader = (line: string) =>
    line.length <= MAX_LINE && HEADER.test(line);
  const nextFilled = (from: number) => {
    const stop = Math.min(lines.length, from + MAX_BLANK_RUN);
    return (
      Array.from({ length: stop - from }, (_, step) => from + step).find(
        (index) => lines[index].trim() !== '',
      ) ?? stop
    );
  };
  const isAddressLine = (line: string) =>
    line.length <= MAX_LINE && /[@<>,]/.test(line);
  const isStillHeaders = (headers: Record<string, string>, index: number) =>
    Object.keys(headers).length === 0 ||
    (index < lines.length && isHeader(lines[index].trim()));
  const read = (
    index: number,
    steps: number,
    headers: Record<string, string>,
    last: string | null,
  ): { headers: Record<string, string>; end: number } => {
    if (steps >= MAX_HEADER_LINES || index >= lines.length) {
      return { headers, end: index };
    }
    const line = lines[index].trim();
    const header = isHeader(line) ? HEADER.exec(line) : null;
    if (header) {
      const name = header[1].toLowerCase();
      return read(
        index + 1,
        steps + 1,
        { ...headers, [name]: headers[name] ?? header[2] },
        name,
      );
    }
    if (line === '') {
      const next = nextFilled(index);
      return isStillHeaders(headers, next)
        ? read(next, steps + 1, headers, last)
        : { headers, end: next };
    }
    return last !== null && /^(?:to|cc|bcc)$/.test(last) && isAddressLine(line)
      ? read(index + 1, steps + 1, headers, last)
      : { headers, end: index };
  };
  return read(start, 0, {}, null);
}

const cleanFrom = (value: string) =>
  value
    .replace(/<mailto:([^>]+)>/gi, '<$1>')
    .replace(/\[mailto:([^\]]+)\]/gi, '<$1>')
    .replace(/\*/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 320);

function readBlock(text: string): Block | null {
  const lines = text.split(/\r?\n/);
  const isStart = (line: string) =>
    line.length <= MAX_LINE && (MARKER.test(line) || UNDERSCORES.test(line));
  const toBlock = (index: number): Block | null => {
    const { headers, end } = readHeaders(lines, index + 1);
    const from = cleanFrom(headers.from ?? '');
    const subject = (headers.subject ?? '').trim();
    if (!from.includes('@') && subject === '') return null;
    return {
      from: from.includes('@') ? from : null,
      subject: subject === '' ? null : subject.slice(0, 1000),
      date: headers.date ?? headers.sent ?? null,
      body: lines.slice(end).join('\n').trim(),
    };
  };
  const starts = lines.flatMap((line, index) =>
    isStart(line.trim()) ? [index] : [],
  );
  return (
    starts
      .slice(0, 10)
      .map(toBlock)
      .find((block) => block !== null) ?? null
  );
}

/** The email as its original sender wrote it, read from a hand-forwarded block when there is one. A forwarding confirmation is returned untouched. */
export function unwrapForwarded<T extends ForwardableMail>(mail: T): T {
  if (isForwardingConfirmation(mail)) return mail;
  const block = readBlock(mail.text);
  if (block === null) {
    return { ...mail, subject: stripForwardPrefixes(mail.subject) };
  }
  const original = block.date === null ? null : readForwardedDate(block.date);
  const isPlausible =
    original !== null &&
    original <= mail.receivedAt + DAY_MS &&
    original >= mail.receivedAt - 365 * DAY_MS;
  return {
    ...mail,
    from: block.from ?? mail.from,
    subject: stripForwardPrefixes(block.subject ?? mail.subject),
    text: block.body !== '' ? block.body : mail.text,
    receivedAt: isPlausible ? original : mail.receivedAt,
    // The original sender's signature was never checked on unwrapped mail.
    isDkimPassed: false,
    dkimDomain: null,
  };
}
