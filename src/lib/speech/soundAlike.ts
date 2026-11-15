const INITIAL_SOUNDS: Record<string, string> = {
  kn: 'n',
  gn: 'n',
  pn: 'n',
  wr: 'r',
  ps: 's',
  wh: 'w',
};

const MIN_LETTERS = 3;

const toLetters = (text: string) =>
  text
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z]/g, '');

/** A rough sound of a word: letter pairs that sound alike merged, silent h dropped, every run of vowels one vowel and doubled letters one. */
const toSoundKey = (letters: string) =>
  letters
    .replace(/^(kn|gn|pn|wr|ps|wh)/, (pair) => INITIAL_SOUNDS[pair])
    .replace(/ph/g, 'f')
    .replace(/ck|q/g, 'k')
    .replace(/c(?=[eiy])/g, 's')
    .replace(/c/g, 'k')
    .replace(/x/g, 'ks')
    .replace(/z/g, 's')
    .replace(/(?<=.)h/g, '')
    .replace(/[aeiouy]+/g, 'a')
    .replace(/(.)\1+/g, '$1');

const getEditDistance = (a: string, b: string) =>
  Array.from(b).reduce(
    (row, charB, indexB) =>
      Array.from(a).reduce(
        (next, charA, indexA) => [
          ...next,
          Math.min(
            row[indexA + 1] + 1,
            next[indexA] + 1,
            row[indexA] + (charA === charB ? 0 : 1),
          ),
        ],
        [indexB + 1],
      ),
    Array.from({ length: a.length + 1 }, (_, index) => index),
  )[a.length];

/**
 * Whether a recognizer's words could be a spoken name: spaces ignored, so "row an" sounds like "Rowan". The sounds must
 * start alike and differ by at most one edit per four sounds of the name; anything under three letters never matches.
 */
export const soundsLike = (heard: string, name: string) => {
  const heardLetters = toLetters(heard);
  const nameLetters = toLetters(name);
  if (heardLetters.length < MIN_LETTERS || nameLetters.length < MIN_LETTERS) {
    return false;
  }
  const heardKey = toSoundKey(heardLetters);
  const nameKey = toSoundKey(nameLetters);
  return (
    heardKey[0] === nameKey[0] &&
    getEditDistance(heardKey, nameKey) <= Math.floor(nameKey.length / 4)
  );
};
