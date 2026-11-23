import { createHash, timingSafeEqual } from 'node:crypto';

import { Timestamp, type Firestore } from 'firebase-admin/firestore';

export const EMAIL_DOMAIN = 'apps.moondreams.dev';

const RATE_KEEP_MS = 2 * 86_400_000;

const digest = (value: string) => createHash('sha256').update(value).digest();

export const isSecretValid = (given: string | undefined, expected: string) =>
  given !== undefined && timingSafeEqual(digest(given), digest(expected));

/** The bare lowercase address from `Name <name@host>` or a plain address. */
export const toAddress = (value: string) =>
  (/<([^>]+)>/.exec(value)?.[1] ?? value).trim().toLowerCase();

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

/** The start of an email's text with whitespace collapsed. */
export const snippetOf = (text: string, max = 200) =>
  text.replace(/\s+/g, ' ').trim().slice(0, max);

/** The text with every email address taken out, so a forwarded header's To: line leaves no one's address behind. */
export const withoutEmailAddresses = (text: string) =>
  text.replace(/<?[^\s<>(),;:"'[\]]+@[^\s<>(),;:"'[\]]+>?/g, ' ');

/** A stable document id for one message to one person, so a redelivery finds its first handling. */
export const eventIdFor = (uid: string, messageId: string) =>
  createHash('sha256').update(`${uid}:${messageId}`).digest('hex').slice(0, 32);

export const hourKey = (now: number) =>
  new Date(now).toISOString().slice(0, 13).replace(/\D/g, '');

/** Counts one email against an hour's cap at `ratePath`; false once the cap is reached. The counter document expires on its own. */
export async function takeRateSlot(
  firestore: Firestore,
  ratePath: string,
  now: number,
  maxPerHour: number,
) {
  const ref = firestore.doc(ratePath);
  return firestore.runTransaction(async (transaction) => {
    const count = ((await transaction.get(ref)).data()?.count as number) ?? 0;
    if (count >= maxPerHour) return false;
    transaction.set(ref, {
      count: count + 1,
      expiresAt: Timestamp.fromMillis(now + RATE_KEEP_MS),
    });
    return true;
  });
}

const escapeRegExp = (value: string) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** The token in a `<prefix>-<token>@<domain>` address, or null for any other address. */
export const readAddressToken = (to: string, prefix: string, domain: string) =>
  new RegExp(
    `^${escapeRegExp(prefix)}-([a-z0-9_-]{12,32})@${escapeRegExp(domain)}$`,
  ).exec(to.trim().toLowerCase())?.[1] ?? null;
