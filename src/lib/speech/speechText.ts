/** Lower case, accents and punctuation off, apostrophes dropped and spaces single: what spoken phrases are compared as. */
export const toPlainText = (text: string) =>
  text
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/(\d)\.(\d)/g, '$1#$2')
    .replace(/[^\p{L}\p{N}#\s]/gu, ' ')
    .replace(/#/g, '.')
    .replace(/\s+/g, ' ')
    .trim();

const FILLERS = new Set([
  'um',
  'uh',
  'er',
  'hm',
  'hmm',
  'so',
  'ok',
  'okay',
  'well',
  'alright',
]);
const MAX_FILLERS = 2;

/** The text as it is, and with each run of up to two leading fillers dropped, so a phrase that itself starts with "okay" still matches. */
const withoutFillers = (text: string) => {
  const words = text.split(' ');
  const leading = words.findIndex((word) => !FILLERS.has(word));
  const count = Math.min(leading === -1 ? words.length : leading, MAX_FILLERS);
  return Array.from({ length: count + 1 }, (_, dropped) =>
    words.slice(dropped).join(' '),
  );
};

/** What follows a wake phrase at the start of one guess ("" when nothing does), or null when the guess does not start with it. */
const readRest = (guess: string, spellings: readonly string[]) => {
  const found = withoutFillers(toPlainText(guess)).flatMap((text) =>
    spellings
      .filter(
        (candidate) => text === candidate || text.startsWith(`${candidate} `),
      )
      .map((candidate) => text.slice(candidate.length).trim()),
  );
  return found[0] ?? null;
};

/**
 * Looks for a wake phrase at the start of what a recognizer heard. `spellings` are the ways it writes the phrase, in
 * `toPlainText` form, kept in one constant by the caller; up to two fillers ("okay", "um") may come before it. Any guess
 * can wake, and what follows keeps its guess's rank (null where that guess lacks the phrase), so a lower-ranked guess's
 * command can be told apart from the top one. Null when no guess has the phrase.
 */
export const readWakePhrase = (
  alternatives: string | string[],
  spellings: readonly string[],
): { rests: (string | null)[] } | null => {
  const guesses =
    typeof alternatives === 'string' ? [alternatives] : alternatives;
  const rests = guesses.map((guess) => readRest(guess, spellings));
  return rests.some((rest) => rest !== null) ? { rests } : null;
};
