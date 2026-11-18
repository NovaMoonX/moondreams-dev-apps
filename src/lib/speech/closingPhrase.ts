import { toPlainText } from '@/lib/speech/speechText';

export type ClosingKind = 'dismiss' | 'finish';

/** The words that end a conversation, English only. A dismiss drops what is pending; a finish ends after what was said. An app adds its own names through `extra`, never its own list. */
export const CLOSING_PHRASES: Record<ClosingKind, readonly string[]> = {
  dismiss: [
    'never mind',
    'nevermind',
    'forget it',
    'forget about it',
    'cancel',
    'cancel it',
    'cancel that',
    'stop',
    'leave it',
    'no thanks',
    'no thank you',
    'nothing',
    "don't worry about it",
    "it doesn't matter",
  ],
  finish: [
    "that's all",
    "that's it",
    'thanks',
    'thank you',
    'thanks a lot',
    'thank you so much',
    "i'm done",
    'all done',
    "that's everything",
  ],
};

export interface ClosingRead {
  kind: ClosingKind;
  /** `whole`: the phrase is the turn. `end`: it closes words that came before, which are `rest`. */
  position: 'whole' | 'end';
  rest: string;
}

const FILLERS = [
  'oh',
  'um',
  'uh',
  'okay',
  'ok',
  'actually',
  'ugh',
  'well',
  'no',
  'nah',
  'just',
  'so',
  'alright',
  'yeah',
];
const CUES = [
  'actually',
  'oh',
  'wait',
  'no',
  'on second thought',
  'scratch that',
];
const ANYWHERE_FINISH = ["that's all", "that's it", "that's everything"];
const MAX_END_WORDS = 2;
const GAP = '[\\s,.!?;:-]+';
const TAIL = '[\\s,.!?;:\\u2026-]*';

const escapeRegExp = (text: string) =>
  text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const toWordsPattern = (phrase: string) =>
  phrase
    .trim()
    .split(/\s+/)
    .map((word) => escapeRegExp(word).replace(/['’]/g, "['’]?"))
    .join(GAP);

const toAlternation = (phrases: readonly string[]) =>
  phrases
    .slice()
    .sort((a, b) => b.length - a.length)
    .map(toWordsPattern)
    .join('|');

const foldChar = (char: string) => {
  const base = char.normalize('NFD').replace(/\p{M}/gu, '');
  return base.length === char.length ? base : char;
};

/** Same length as the text, so a match index in it is an index in the person's own words. */
const fold = (text: string) => Array.from(text, foldChar).join('');

const toNamePattern = (name: string) =>
  Array.from(
    fold(name)
      .toLowerCase()
      .replace(/['’\s]+/g, (gap) => (/\s/.test(gap) ? ' ' : '')),
  )
    .map((char) => (char === ' ' ? GAP : `${escapeRegExp(char)}['’]?`))
    .join('');

const countWords = (phrase: string) => toPlainText(phrase).split(' ').length;

const clean = (text: string) => text.replace(/[\s,;:-]+$/, '').trim();

/**
 * Reads whether the words end a conversation. The phrase may follow up to two fillers ("oh", "okay", "no") and be followed by a name in `extra` ("thanks, Robin"); it is the whole turn, or closes words before it: a dismiss phrase of two or more words after a retraction ("actually", "wait", "scratch that") or a sentence break, a finish phrase after a sentence break, a comma or a retraction, except "that's all", "that's it" and "that's everything", which may follow anything ("tell Sam thank you" is a request). Accents and apostrophes in a name never matter. A one-word phrase ("cancel", "stop", "thanks") counts only as the whole turn, so "remind me to cancel" is a request. Null otherwise.
 */
export const readClosingPhrase = (
  text: string,
  { extra = [] }: { extra?: readonly string[] } = {},
): ClosingRead | null => {
  const original = text.trim();
  if (original === '') return null;
  const trimmed = fold(original);
  const names = extra
    .map((name) => toNamePattern(name.trim()))
    .filter((name) => name !== '');
  const namePart = names.length > 0 ? `(?:${GAP}(?:${names.join('|')}))?` : '';
  const filler = `(?:(?:${FILLERS.join('|')})${GAP}){0,${MAX_END_WORDS}}`;
  const all = [...CLOSING_PHRASES.dismiss, ...CLOSING_PHRASES.finish];
  const isMatch = (pattern: string) => new RegExp(pattern, 'i').exec(trimmed);
  const whole = isMatch(
    `^${filler}(?:${toAlternation(all)})${namePart}${TAIL}$`,
  );
  if (whole) {
    const kind = CLOSING_PHRASES.dismiss.some((phrase) =>
      new RegExp(
        `^${filler}${toWordsPattern(phrase)}${namePart}${TAIL}$`,
        'i',
      ).test(trimmed),
    )
      ? 'dismiss'
      : 'finish';
    return { kind, position: 'whole', rest: '' };
  }
  const dismissEnd = isMatch(
    `^(.+?)(?:[.!?;]+\\s+|${GAP}(?:${toAlternation(CUES)})${GAP}|[.!?;]+\\s*(?:${toAlternation(CUES)})${GAP})${filler}(?:${toAlternation(
      CLOSING_PHRASES.dismiss.filter((phrase) => countWords(phrase) > 1),
    )})${namePart}${TAIL}$`,
  );
  if (dismissEnd && clean(dismissEnd[1]) !== '') {
    return {
      kind: 'dismiss',
      position: 'end',
      rest: clean(original.slice(0, dismissEnd[1].length)),
    };
  }
  const multiWord = CLOSING_PHRASES.finish.filter(
    (phrase) => countWords(phrase) > 1,
  );
  const finishEnd =
    isMatch(
      `^(.+?)(?:[.!?;,]+\\s*|${GAP}(?:${toAlternation(CUES)})${GAP})(?:${toAlternation(multiWord)})${namePart}${TAIL}$`,
    ) ??
    isMatch(
      `^(.+?)${GAP}(?:${toAlternation(ANYWHERE_FINISH)})${namePart}${TAIL}$`,
    );
  return finishEnd && clean(finishEnd[1]) !== ''
    ? {
        kind: 'finish',
        position: 'end',
        rest: clean(original.slice(0, finishEnd[1].length)),
      }
    : null;
};

/** The words with every closing phrase taken out: what is left when "forget it" is only the person's way of ending. */
export const withoutClosingPhrases = (
  text: string,
  options: { extra?: readonly string[] } = {},
) => {
  const read = readClosingPhrase(text, options);
  return read === null ? text.trim() : read.rest;
};
