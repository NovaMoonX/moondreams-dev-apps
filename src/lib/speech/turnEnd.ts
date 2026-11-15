import { toPlainText } from '@/lib/speech/speechText';

/** How long the heard words may stay unchanged before the turn ends. */
export const SETTLE_MS = 1800;
/** The same, when the words end on one that says more is coming. */
export const LONG_SETTLE_MS = 3500;

const CONTINUING = new Set([
  'and',
  'um',
  'uh',
  'er',
  'so',
  'but',
  'or',
  'then',
  'like',
  'because',
  'with',
  'to',
  'the',
  'a',
]);

/** How long to wait with no new words after `text` before treating the turn as finished. */
export const getSettleMs = (text: string) =>
  CONTINUING.has(toPlainText(text).split(' ').pop() ?? '')
    ? LONG_SETTLE_MS
    : SETTLE_MS;
