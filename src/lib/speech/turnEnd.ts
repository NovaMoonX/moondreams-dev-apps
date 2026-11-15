import { toPlainText } from '@/lib/speech/speechText';

export const TURN_END_COMPLETE_MS = 900;
export const TURN_END_UNFINISHED_MS = 2500;
export const BARGE_MIN_NEW_WORDS = 2;

const TRAILING_WORDS = new Set([
  'and',
  'or',
  'but',
  'so',
  'because',
  'cause',
  'um',
  'uh',
  'umm',
  'uhh',
  'er',
  'hmm',
  'like',
  'then',
  'the',
  'a',
  'an',
  'to',
  'with',
  'if',
  'that',
  'of',
  'for',
  'in',
  'on',
  'at',
  'my',
  'your',
  'our',
  'is',
  'are',
  'was',
  'also',
  'plus',
  'when',
  'while',
  'which',
  'who',
  'what',
  'where',
  'how',
  'from',
  'about',
  'into',
]);

const wordsOf = (text: string) =>
  toPlainText(text)
    .split(' ')
    .filter((word) => word !== '');

/** How long to wait in silence before sending what was heard: short when it sounds finished, long when it ends on a connector, a filler or a comma. English only. */
export const readTurnEndDelay = (text: string) => {
  if (/,\s*$/.test(text)) return TURN_END_UNFINISHED_MS;
  const last = wordsOf(text).pop() ?? '';
  return TRAILING_WORDS.has(last)
    ? TURN_END_UNFINISHED_MS
    : TURN_END_COMPLETE_MS;
};

/** True when both readings have the same words, whatever the punctuation or capitals. */
export const hasSameWords = (a: string, b: string) =>
  wordsOf(a).join(' ') === wordsOf(b).join(' ');

/** True when `heard` holds at least two words the playing line doesn't contain: the person talking over it, not its echo. */
export const isBargeConfirmed = (heard: string, playing: string) => {
  const own = new Set(wordsOf(playing));
  return (
    wordsOf(heard).filter((word) => !own.has(word)).length >=
    BARGE_MIN_NEW_WORDS
  );
};
