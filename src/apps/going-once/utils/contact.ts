export type ReadContact =
  { kind: 'email'; value: string } | { kind: 'phone'; value: string };

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_PATTERN = /^\+?\d{7,20}$/;
const PHONE_PUNCTUATION = /[\s().-]/g;

/** The one "Phone or email" field read the way `submitSaleInterest` reads it: an `@` with a dot after it is an email, else 7 to 20 digits is a phone; `null` when it is neither. */
export function readContact(raw: string): ReadContact | null {
  const text = raw.trim();
  if (text.includes('@')) {
    const email = text.toLowerCase();
    return EMAIL_PATTERN.test(email) && email.length <= 254
      ? { kind: 'email', value: email }
      : null;
  }

  const phone = text.replace(PHONE_PUNCTUATION, '');
  return PHONE_PATTERN.test(phone) ? { kind: 'phone', value: phone } : null;
}

/** A stored phone as a person writes it: ten digits as 206-555-0142, anything else as stored. */
export function formatPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  return phone.startsWith('+') || digits.length !== 10
    ? phone
    : `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
}
