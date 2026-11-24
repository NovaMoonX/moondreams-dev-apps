const DAY_MS = 86_400_000;
export const MAX_CENTS = 100_000_000;
const MONTHS = [
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

const MONTH_NAME =
  '(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sept?(?:ember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)';
const NAMED_DATE = new RegExp(
  `\\b(${MONTH_NAME})\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s+(\\d{4}))?\\b`,
  'gi',
);
const NUMERIC_DATE = /\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/g;
const AMOUNT =
  '\\$\\s?(\\d{1,3}(?:,\\d{3})+(?:\\.\\d{1,2})?|\\d+(?:\\.\\d{1,2})?)';
const AMOUNT_ANYWHERE = new RegExp(AMOUNT, 'g');

const MERCHANT = '([A-Za-z0-9][^|]{1,60}?)';
const MERCHANT_END =
  '(?=\\s+(?:on|for|using|with|has|was|is|ending|charged|were|via|from|if|at|in)\\b|\\s+\\$|\\s+\\d{1,2}/\\d{1,2}|\\s*[,;(|]|\\.(?:\\s|$)|\\s*$)';

const MERCHANT_PATTERNS = [
  new RegExp(
    `\\bmerchant(?:\\s+name)?\\s*:\\s*${MERCHANT}${MERCHANT_END}`,
    'i',
  ),
  new RegExp(`\\bwhere\\s*:\\s*${MERCHANT}${MERCHANT_END}`, 'i'),
  new RegExp(
    `\\b(?:transaction|charge|purchase|payment|spend)\\s+(?:with|at|to|from)\\s+${MERCHANT}${MERCHANT_END}`,
    'i',
  ),
  new RegExp(
    `${AMOUNT}\\s+(?:at|to|with|from)\\s+${MERCHANT}${MERCHANT_END}`,
    'i',
  ),
];
const GENERIC_AT = new RegExp(`\\bat\\s+${MERCHANT}${MERCHANT_END}`, 'gi');

const AMOUNT_PATTERNS = [
  new RegExp(
    `${AMOUNT}\\s+(?:transaction|charge|purchase|payment|debit|authorization|at|to|with)\\b`,
    'i',
  ),
  new RegExp(
    `\\b(?:transaction|charge|purchase|spent|amount|total|payment|debit)(?:\\s+(?:of|for))?\\s*:?\\s*${AMOUNT}`,
    'i',
  ),
];

const PURCHASE_SIGNAL =
  /\b(transaction|purchase|purchased|charge|charged|spent|spend|approved|authorization|authorized|debit card|card was used|card used)\b/i;
const HARD_NOT_PURCHASE_SIGNAL =
  /\b(declined|refund(?:ed)?|credit(?:ed)? (?:posted|to your)|(?:received|posted) your payment|payment (?:received|posted|was received|has been received)|thank you for your payment|revers(?:ed|al)|voided)\b/i;
const STRONG_PURCHASE_SUBJECT =
  /\$\s?\d[\d,.]*\s+(?:transaction|charge|purchase)\b|\b(?:you made|you spent|purchase (?:approved|of)|was charged)\b/i;
const NOT_PURCHASE_SIGNAL =
  /\b(payment (?:received|posted|scheduled|due|reminder|confirmation|was received|has been received|is due)|statement (?:is )?(?:ready|available)|password|verification code|security code|one-time|refund|credit (?:posted|to your)|deposit|low balance|balance (?:alert|summary)|declined|minimum payment|due date|thank you for your payment|zelle|transfer|unsubscribe from)\b/i;
const MERCHANT_STOP = /^(?:this|your|the|least|any|a|an|\d{1,2}:\d{2})\b/i;

const INSTITUTIONS: [RegExp, string][] = [
  [/american express|amex|americanexpress/i, 'American Express'],
  [/capital ?one/i, 'Capital One'],
  [/bank ?of ?america|bofa|bankofamerica/i, 'Bank of America'],
  [/wells ?fargo|wellsfargo/i, 'Wells Fargo'],
  [/apple card|card\.apple\.com|apple\.com/i, 'Apple Card'],
  [/discover/i, 'Discover'],
  [/\bciti(?:bank|card|group)?\b/i, 'Citi'],
  [/\bchase\b/i, 'Chase'],
];

export interface ParsedAlert {
  isPurchase: boolean;
  amountCents: number | null;
  merchant: string | null;
  lastFour: string | null;
  /** UTC midnight of the spending day. */
  date: number | null;
  institution: string | null;
}

/** Who an email came from: a bank or card issuer, a merchant's own receipt, order or refund, or anything else. */
export type SenderKind = 'bank' | 'store' | 'other';

export const NOT_A_PURCHASE: ParsedAlert = {
  isPurchase: false,
  amountCents: null,
  merchant: null,
  lastFour: null,
  date: null,
  institution: null,
};

const collapse = (value: string) => value.replace(/\s+/g, ' ').trim();

/** Subject with amounts, dates and digit runs replaced, so one bank's alerts share one shape whatever they charge. */
export function subjectTemplate(subject: string): string {
  return collapse(
    subject
      .toLowerCase()
      .replace(new RegExp(NAMED_DATE.source, 'gi'), '{date}')
      .replace(/\b\d{1,2}\/\d{1,2}(?:\/\d{2,4})?\b/g, '{date}')
      .replace(/\$\s?[\d,]+(?:\.\d+)?/g, '{amount}')
      .replace(/\d+/g, '{n}'),
  );
}

const ENTITIES: Record<string, string> = {
  nbsp: ' ',
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  '#39': "'",
};

export function htmlToText(html: string): string {
  return html
    .replace(/<(style|script|head)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<(?:br|\/p|\/div|\/tr|\/li|\/h\d)[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&(#?\w+);/g, (whole, name: string) => ENTITIES[name] ?? whole)
    .replace(/[ \t\r\f\v]+/g, ' ');
}

const BODY_MAX = 4000;
const EXCERPT_LINES = 6;
const EXCERPT_MAX = 600;
const BOILERPLATE_LINE =
  /^(?:\[[^\]]*\]|[\W_]+|(?:view|open|read)\b.{0,40}\b(?:browser|online)\b.*|.{0,60}\bunsubscribe\b.{0,60})$/i;

/** The email's readable text: line breaks kept, runs of blank lines collapsed, every web link shortened to its host name, capped at 4,000 characters. */
export function readableBody(text: string): string {
  return text
    .replace(
      /<?https?:\/\/([^\s/?#"'<>)\]]+)[^\s"'<>)\]]*>?/gi,
      (_whole, host: string) => host,
    )
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .reduce<string[]>(
      (lines, line) =>
        line === '' && (lines.length === 0 || lines.at(-1) === '')
          ? lines
          : [...lines, line],
      [],
    )
    .join('\n')
    .trim()
    .slice(0, BODY_MAX);
}

/** Up to six lines of the readable text centred on the line holding the amount (or the merchant), else the first lines after the header clutter. */
export function excerptOf(
  body: string,
  found: { amountCents: number | null; merchant: string | null },
): string {
  const lines = body
    .split('\n')
    .filter((line) => line !== '' && !BOILERPLATE_LINE.test(line));
  const hasAmount = (line: string) =>
    found.amountCents !== null &&
    [...line.matchAll(AMOUNT_ANYWHERE)].some(
      (match) => toCents(match[1]) === found.amountCents,
    );
  const merchant = found.merchant?.toLowerCase() ?? null;
  const hasMerchant = (line: string) =>
    merchant !== null && line.toLowerCase().includes(merchant);
  const firstProse = lines.findIndex((line) => line.split(' ').length >= 4);
  const hit = [hasAmount, hasMerchant]
    .map((test) => lines.findIndex(test))
    .find((index) => index >= 0);
  const center = hit !== undefined ? hit - 2 : Math.max(0, firstProse);
  const start = Math.max(0, Math.min(center, lines.length - EXCERPT_LINES));
  return lines
    .slice(start, start + EXCERPT_LINES)
    .join('\n')
    .slice(0, EXCERPT_MAX);
}

const PROTON_DOMAINS = ['proton.me', 'protonmail.com', 'pm.me'];

export function isProtonSender(from: string): boolean {
  const address = (/<([^>]+)>/.exec(from)?.[1] ?? from).trim().toLowerCase();
  const domain = address.split('@')[1] ?? '';
  return PROTON_DOMAINS.some(
    (known) => domain === known || domain.endsWith(`.${known}`),
  );
}

/** Proton's forwarding invitation: from a Proton sender that passed DKIM, with forwarding in the subject and an invitation link. */
export const isProtonInvitation = (mail: {
  from: string;
  subject: string;
  text: string;
  isDkimPassed: boolean;
}): boolean =>
  isProtonSender(mail.from) &&
  mail.isDkimPassed &&
  /forward/i.test(mail.subject) &&
  readProtonLink(mail.text) !== undefined;

/** The invitation's accept link: a proton.me https link that mentions forwarding, accepting or an invite; support, legal and blog pages are never it. */
export function readProtonLink(text: string) {
  const links = Array.from(
    text.matchAll(
      /(?:^|[\s"'<(])(https:\/\/((?:[a-z0-9-]+\.)*proton\.me)(?=[/?#\s"'<>)\]]|$)(\/[^\s"'<>)\]]*)?)/gi,
    ),
  )
    .filter(
      ([, , host, path = '']) =>
        !/^(?:help|legal|policies)\./i.test(host) &&
        !/^\/(?:support|legal|blog)(?:[/?#]|$)/i.test(path),
    )
    .map(([, link]) => link);
  const isInvitePath = (link: string) =>
    /forward|accept|invite/i.test(link.replace(/^https:\/\/[^/]+/i, ''));
  return links.find(isInvitePath);
}

export function toCents(value: string): number | null {
  const [whole, fraction = ''] = value.replace(/[,\s]/g, '').split('.');
  if (!/^\d+$/.test(whole) || !/^\d{0,2}$/.test(fraction)) return null;
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  return cents > 0 && cents <= MAX_CENTS ? cents : null;
}

const cleanMerchant = (value: string) =>
  collapse(value).replace(/[\s.:,*-]+$/, '');

const readMerchant = (text: string): string | null => {
  const found = MERCHANT_PATTERNS.map((pattern) => {
    const match = pattern.exec(text);
    return match ? match[match.length - 1] : null;
  })
    .concat(
      [...text.matchAll(GENERIC_AT)].map(
        (match) => match[match.length - 1] ?? null,
      ),
    )
    .map((value) => (value === null ? null : cleanMerchant(value)))
    .find(
      (value) =>
        value !== null &&
        value.length >= 2 &&
        !MERCHANT_STOP.test(value) &&
        !/^\$/.test(value),
    );
  return found ?? null;
};

const readAmount = (text: string): number | null => {
  const explicit = AMOUNT_PATTERNS.map((pattern) => pattern.exec(text)).find(
    (match) => match !== null,
  );
  if (explicit) return toCents(explicit[1]);
  const all = [
    ...new Set([...text.matchAll(AMOUNT_ANYWHERE)].map((match) => match[1])),
  ];
  return all.length === 1 ? toCents(all[0]) : null;
};

const readLastFour = (text: string): string | null => {
  const match =
    /(?:ending(?:\s+in|\s+with)?|\.{2,}|…|\*+|•+|x{2,}|card\s*#|account\s*#)\s*:?\s*(\d{4})\b/i.exec(
      text,
    );
  return match ? match[1] : null;
};

const dayOf = (year: number, month: number, day: number) =>
  Date.UTC(year, month, day);

/** The day an email arrived, shifted six hours back so a US evening keeps that evening's date; the plan's time zone is not known here. */
export function arrivalDay(receivedAt: number): number {
  const received = new Date(receivedAt - 6 * 3_600_000);
  return dayOf(
    received.getUTCFullYear(),
    received.getUTCMonth(),
    received.getUTCDate(),
  );
}

/** The spending day written in the email, or the day it arrived; never a day after it arrived. */
function readDate(text: string, receivedAt: number): number {
  const received = new Date(receivedAt - 6 * 3_600_000);
  const arrivedOn = arrivalDay(receivedAt);
  const withYear = (month: number, day: number, year: number | null) => {
    const base = year ?? received.getUTCFullYear();
    const candidate = dayOf(base < 100 ? 2000 + base : base, month, day);
    return year === null && candidate > arrivedOn + DAY_MS
      ? dayOf(base - 1, month, day)
      : candidate;
  };
  const named = [...text.matchAll(NAMED_DATE)].map((match) =>
    withYear(
      MONTHS.indexOf(match[1].slice(0, 3).toLowerCase()),
      Number(match[2]),
      match[3] ? Number(match[3]) : null,
    ),
  );
  const numeric = [...text.matchAll(NUMERIC_DATE)]
    .filter((match) => Number(match[1]) <= 12 && Number(match[2]) <= 31)
    .map((match) =>
      withYear(
        Number(match[1]) - 1,
        Number(match[2]),
        match[3] ? Number(match[3]) : null,
      ),
    );
  const plausible = [...named, ...numeric].find(
    (date) => date <= arrivedOn + DAY_MS && date >= arrivedOn - 45 * DAY_MS,
  );
  return plausible ?? arrivedOn;
}

const INSTITUTION_HOST_LABELS: Record<string, string[]> = {
  'American Express': ['americanexpress', 'aexp', 'amex'],
  'Bank of America': ['bankofamerica', 'bofa'],
  'Apple Card': ['apple'],
  Citi: ['citi', 'citibank', 'citicards'],
};

const MAIL_PROVIDERS =
  /^(?:gmail|googlemail|yahoo|outlook|hotmail|live|icloud|me|proton|protonmail|aol)$/;

/** The registrable name of an address's host ("alerts@email.chase.com" is "chase"); empty when there is no host or it is a mailbox provider's, which names nobody. */
const readHostLabel = (address: string) => {
  const label = address.split('@')[1]?.split('.').slice(-2, -1)[0] ?? '';
  return MAIL_PROVIDERS.test(label) ? '' : label;
};

/** Whether an address is the bank's own: its host's name is the bank's name (no spaces) or one it is known by. A name that only appears in a subject, body or display name proves nothing. */
export const isInstitutionHost = (address: string, institution: string) => {
  const label = readHostLabel(address);
  const compact = institution.toLowerCase().replace(/[^a-z0-9]/g, '');
  return (
    label !== '' &&
    (label === compact ||
      (Object.hasOwn(INSTITUTION_HOST_LABELS, institution) &&
        INSTITUTION_HOST_LABELS[institution].includes(label)))
  );
};

/** Whether an address's host names the shop: its name is the shop's (no spaces) or the start of it ("bluebottle" for Blue Bottle Coffee), at least four letters. */
export const isMerchantHost = (address: string, merchant: string) => {
  const label = readHostLabel(address);
  return (
    label.length >= 4 &&
    merchant
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '')
      .startsWith(label)
  );
};

/** Whether the sender's address belongs to one of the known banks or card issuers. */
export const isKnownInstitutionSender = (from: string) =>
  INSTITUTIONS.some(([pattern]) => pattern.test(from));

const readInstitution = (
  from: string,
  subject: string,
  text: string,
): string | null => {
  const named = (value: string) =>
    INSTITUTIONS.find(([pattern]) => pattern.test(value))?.[1] ?? null;
  const host = from.split('@')[1]?.toLowerCase() ?? '';
  const label = host.split('.').slice(-2, -1)[0] ?? '';
  const fromHost =
    label === '' ||
    /^(gmail|yahoo|outlook|hotmail|icloud|googlemail)$/.test(label)
      ? null
      : label.charAt(0).toUpperCase() + label.slice(1);
  return named(from) ?? named(subject) ?? fromHost ?? named(text.slice(0, 600));
};

/** Reads a bank's purchase alert by pattern. `null` when it cannot be sure (the caller may ask the AI); `isPurchase: false` when it is plainly something else. */
export function parseAlertEmail({
  from,
  subject,
  text,
  receivedAt,
}: {
  from: string;
  subject: string;
  text: string;
  receivedAt: number;
}): ParsedAlert | null {
  const body = text.replace(/\s*\n\s*/g, ' | ').replace(/[ \t]+/g, ' ');
  const all = `${subject} | ${body}`;
  if (!/\$\s?\d/.test(all)) return NOT_A_PURCHASE;
  if (NOT_PURCHASE_SIGNAL.test(subject) && !PURCHASE_SIGNAL.test(subject)) {
    return NOT_A_PURCHASE;
  }
  const bodyHead = body.slice(0, 300);
  if (HARD_NOT_PURCHASE_SIGNAL.test(`${subject} | ${bodyHead}`)) {
    return NOT_A_PURCHASE;
  }
  if (
    NOT_PURCHASE_SIGNAL.test(bodyHead) &&
    !STRONG_PURCHASE_SUBJECT.test(subject)
  ) {
    return NOT_A_PURCHASE;
  }
  const amountCents = readAmount(all);
  const merchant = readMerchant(all);
  if (amountCents === null || merchant === null || !PURCHASE_SIGNAL.test(all)) {
    return NOT_PURCHASE_SIGNAL.test(all) && !PURCHASE_SIGNAL.test(all)
      ? NOT_A_PURCHASE
      : null;
  }
  return {
    isPurchase: true,
    amountCents,
    merchant,
    lastFour: readLastFour(all),
    date: readDate(all, receivedAt),
    institution: readInstitution(from, subject, body),
  };
}
