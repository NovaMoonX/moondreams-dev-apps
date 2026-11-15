import { toPlainText } from '@/lib/speech/speechText';
import {
  DEFAULT_ASSISTANT_MISHEARINGS,
  DEFAULT_ASSISTANT_NAME,
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
