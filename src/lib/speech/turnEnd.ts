import { toSpokenText } from '@/lib/speech/spokenText';
import { toPlainText } from '@/lib/speech/speechText';

// A person pausing to think mid-sentence is common on a phone, and a turn sent too early can't be taken back.
export const TURN_END_COMPLETE_MS = 2400;
export const TURN_END_UNFINISHED_MS = 3600;
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
  'the',
  'a',
  'an',
  'to',
  'with',
  'if',
  'of',
  'for',
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

/** True when `heard` holds at least two words the playing line doesn't contain, written or as spoken: the person talking over it, not its echo. Numbers never count, since a recognizer writes them either way. */
export const isBargeConfirmed = (heard: string, playing: string) => {
  const own = new Set([...wordsOf(playing), ...wordsOf(toSpokenText(playing))]);
  return (
    wordsOf(heard).filter((word) => !own.has(word) && !/^\d+$/.test(word))
      .length >= BARGE_MIN_NEW_WORDS
  );
};
