import { MASK } from '@/components/SensitiveValue';

const AMOUNT = String.raw`[−+-]?\$[\d,]+(?:\.\d+)?`;
const SIGN_WORD = String.raw`(?:\s(?:short|over|left)\b)?`;

/** Matches one amount, a range as one, and the "short", "over" or "left" that follows it; the match is the one capture group, so `split` keeps it. */
export const FIGURE = new RegExp(
  `(${AMOUNT}(?:\\s?[–-]\\s?${AMOUNT})?${SIGN_WORD})`,
  'g',
);

/** A line with every amount in it replaced by the mask, for text that is not drawn as nodes (an aria-label, a confirm's message). */
export const maskFigures = (text: string) => text.replace(FIGURE, MASK);
