import { CLOSING_PHRASES } from '@/lib/speech/closingPhrase';
import { toPlainText } from '@/lib/speech/speechText';
import {
  ACKNOWLEDGEMENT_WORDS,
  DEFAULT_ASSISTANT_MISHEARINGS,
  DEFAULT_ASSISTANT_NAME,
  LIVE_CLOSING_PHRASES,
  UNDO_PHRASES,
} from '@apps/helm/constants';

/** What was said, lower case, with spaces and apostrophes settled and the end punctuation off. */
export const normalizeSaid = (text: string) =>
  text
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[\s.,!?;:…]+$/, '');

/** Whether a whole utterance asks to take the latest turn back ("undo the dentist" does not: it names something). */
export const isUndoPhrase = (text: string) =>
  UNDO_PHRASES.includes(normalizeSaid(text));

const toAlternatives = (phrases: readonly string[]) =>
  [...phrases]
    .sort((left, right) => right.length - left.length)
    .map((phrase) => phrase.replace(/ /g, ' +'))
    .join('|');

const NODS = `(?:(?:${toAlternatives(ACKNOWLEDGEMENT_WORDS)})(?: |$))`;
const ACKNOWLEDGEMENT_PATTERN = new RegExp(`^${NODS}+$`);
const isNod = (phrase: string) => ACKNOWLEDGEMENT_PATTERN.test(phrase);
const LIVE_CLOSERS = [
  ...CLOSING_PHRASES.finish.filter((phrase) => !isNod(phrase)),
  ...CLOSING_PHRASES.dismiss.filter((phrase) => phrase === 'stop'),
  ...LIVE_CLOSING_PHRASES,
];
const CLOSING_PATTERN = new RegExp(
  `^${NODS}*(?:${toAlternatives([
    ...LIVE_CLOSERS,
    ...LIVE_CLOSERS.map((phrase) => phrase.replace(/'/g, '')),
  ])})(?: |$)${NODS}*$`,
);

/** Words only, lower case, punctuation as single spaces. */
const toBareWords = (text: string) =>
  normalizeSaid(text)
    .replace(/-/g, ' ')
    .replace(/[^\p{L}\p{N}' ]+/gu, ' ')
    .replace(/ +/g, ' ')
    .trim();

/** Whether a whole utterance only acknowledges what was said ("Gotcha. Okay.", "thanks"), with nothing to act on. */
export const isAcknowledgement = (text: string) =>
  ACKNOWLEDGEMENT_PATTERN.test(toBareWords(text));

/** Whether a whole utterance only says the person is finished ("Okay, I'm done.", "bye"), which ends a live conversation. */
export const isLiveCloser = (text: string) =>
  CLOSING_PATTERN.test(toBareWords(text));

/** The ways a recognizer writes "Hey {name}", in `toPlainText` form: the name, the person's saved variants and, for the default name, its common mishearings; renaming the assistant renames the phrase. */
export const toWakeSpellings = (
  name: string,
  variants: readonly string[] = [],
) =>
  Array.from(
    new Set(
      [
        name,
        ...variants,
        ...(name === DEFAULT_ASSISTANT_NAME
          ? DEFAULT_ASSISTANT_MISHEARINGS
          : []),
      ].map((spelling) => `hey ${toPlainText(spelling)}`),
    ),
  );
