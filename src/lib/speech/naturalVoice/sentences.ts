const MIN_CHARS = 24;
const MAX_CHARS = 220;
const KEEP = '\u0000';

const wrapLong = (piece: string, maxChars: number) =>
  piece.length <= maxChars
    ? [piece]
    : piece.split(' ').reduce<string[]>((lines, word) => {
        const last = lines[lines.length - 1];
        if (last === undefined) return [word];
        return `${last} ${word}`.length <= maxChars
          ? [...lines.slice(0, -1), `${last} ${word}`]
          : [...lines, word];
      }, []);

/**
 * Cuts text into pieces a voice can say one at a time, so the first is ready quickly: at sentence ends (a decimal point
 * is not one), with very short pieces joined to the next and very long ones wrapped at a space.
 */
export const splitSentences = (
  text: string,
  { minChars = MIN_CHARS, maxChars = MAX_CHARS } = {},
) => {
  const clean = text
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/(\d)\.(\d)/g, `$1${KEEP}$2`);
  if (clean === '') return [];
  const pieces = (clean.match(/[^.!?…]+(?:[.!?…]+["'”’)]*|$)\s*/g) ?? [clean])
    .map((piece) => piece.trim())
    .filter((piece) => piece !== '');
  const joined = pieces.reduce<string[]>((lines, piece) => {
    const last = lines[lines.length - 1];
    return last !== undefined && last.length < minChars
      ? [...lines.slice(0, -1), `${last} ${piece}`]
      : [...lines, piece];
  }, []);
  const result = joined
    .flatMap((piece) => wrapLong(piece, maxChars))
    .map((piece) => piece.split(KEEP).join('.'));
  return result;
};
