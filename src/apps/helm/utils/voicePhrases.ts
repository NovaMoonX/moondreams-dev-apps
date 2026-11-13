import { toPlainText } from '@/lib/speech/speechText';
import { UNDO_PHRASES } from '@apps/helm/constants';

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

/** The ways a recognizer writes "Hey {name}", in `toPlainText` form; renaming the assistant renames the phrase. */
export const toWakeSpellings = (name: string) => [`hey ${toPlainText(name)}`];
