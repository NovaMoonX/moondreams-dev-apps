import { randomInt } from 'node:crypto';

/** 26 characters of a 32-letter alphabet, 5 bits each: 130 bits. */
export const SHARE_ID_LENGTH = 26;

const SHARE_ID_ALPHABET = '23456789abcdefghjklmnpqrstuvwxyz';
const SHARE_ID_PATTERN = /^[2-9a-hj-np-z]{26}$/;

export const isShareId = (value: unknown): value is string =>
  typeof value === 'string' && SHARE_ID_PATTERN.test(value);

/** Mints a 26-character, 130-bit id from `crypto.randomInt`; `random` is a test seam. */
export function mintShareId(random: (max: number) => number = randomInt) {
  const id = Array.from(
    { length: SHARE_ID_LENGTH },
    () => SHARE_ID_ALPHABET[random(SHARE_ID_ALPHABET.length)],
  ).join('');
  return id;
}
