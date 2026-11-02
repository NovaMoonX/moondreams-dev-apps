import { createHash } from 'node:crypto';

// Functions can't import the client's constants, so the caps are repeated here; a check fails when they drift.
export const INQUIRY_LIMITS = {
  MAX_NAME_LENGTH: 80,
  MAX_CONTACT_LENGTH: 254,
  MAX_MESSAGE_LENGTH: 1000,
  MAX_PAYLOAD_BYTES: 4096,
  PER_SALE_PER_DAY: 100,
  PER_THING: 40,
  RESEND_GAP_MS: 10 * 60_000,
  MAX_SENDS_PER_INQUIRY: 20,
  THROTTLE_SENDS: 5,
  THROTTLE_WINDOW_MS: 10 * 60_000,
} as const;

export type ReadContact =
  | { kind: 'email'; email: string; phone: null; key: string }
  | { kind: 'phone'; email: null; phone: string; key: string };

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_PATTERN = /^\+?\d{7,20}$/;
const PHONE_PUNCTUATION = /[\s().-]/g;

/** The one "Phone or email" field read as an email (an `@` with a dot after it) or else a phone (7 to 20 digits once spaces and `( ) - .` are gone); `null` when it is neither. */
export function readContact(raw: unknown): ReadContact | null {
  if (typeof raw !== 'string') {
    return null;
  }

  const text = raw.trim();
  if (text.length === 0 || text.length > INQUIRY_LIMITS.MAX_CONTACT_LENGTH) {
    return null;
  }

  if (text.includes('@')) {
    const email = text.toLowerCase();
    return EMAIL_PATTERN.test(email)
      ? { kind: 'email', email, phone: null, key: email }
      : null;
  }

  const phone = text.replace(PHONE_PUNCTUATION, '');
  return PHONE_PATTERN.test(phone)
    ? { kind: 'phone', email: null, phone, key: phone.replace('+', '') }
    : null;
}

const BASE32 = 'abcdefghijklmnopqrstuvwxyz234567';

/** 26 base32 characters of SHA-256 over the thing and the normalised contact, so a double tap or a resend is the same document. */
export function toInquiryId(itemId: string, contactKey: string): string {
  const bits = [
    ...createHash('sha256').update(`${itemId}\n${contactKey}`).digest(),
  ]
    .map((byte) => byte.toString(2).padStart(8, '0'))
    .join('');
  return Array.from(
    { length: 26 },
    (_, index) => BASE32[parseInt(bits.slice(index * 5, index * 5 + 5), 2)],
  ).join('');
}

/** The UTC day a daily count belongs to. */
export const toDayKey = (now: number) =>
  new Date(now).toISOString().slice(0, 10);
