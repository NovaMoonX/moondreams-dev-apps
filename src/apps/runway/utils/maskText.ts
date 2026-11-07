import { MASK } from '@/components/SensitiveValue';
import { hasScrambledMoney, isMoneyScrambled } from '@/utils/moneyScramble';

const AMOUNT = String.raw`[−+-]?\$[\d,]+(?:\.\d+)?\u2060?`;
const SIGN_WORD = String.raw`(?:\s(?:short|over|left)\b)?`;

/** Matches one amount, a range as one, and the "short", "over" or "left" that follows it; the match is the one capture group, so `split` keeps it. */
export const FIGURE = new RegExp(
  `(${AMOUNT}(?:\\s?[–-]\\s?${AMOUNT}|–[\\d,]+(?:\\.\\d+)?)?${SIGN_WORD})`,
  'g',
);

/** A line with every amount in it replaced by the mask, for text that is not drawn as nodes (an aria-label, a confirm's message). */
export const maskFigures = (text: string) => text.replace(FIGURE, MASK);

/** A line masked for the mode it is drawn in: every amount while hidden, and while amounts are made up every amount that was not made up (stored text keeps the real figures). */
export const maskForMode = (text: string, isHidden: boolean) => {
  if (isHidden) return maskFigures(text);
  if (!isMoneyScrambled()) return text;
  return text.replace(FIGURE, (figure) =>
    hasScrambledMoney(figure) ? figure : MASK,
  );
};
