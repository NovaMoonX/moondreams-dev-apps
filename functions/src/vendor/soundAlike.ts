// Generated from src/lib/speech/soundAlike.ts by scripts/checks/serverCopies.ts. Do not edit; run npm run connections:vendor.
import { toSoundKey } from './optionMatchUtils.js';

const MIN_LETTERS = 3;

const toLetters = (text: string) =>
  text
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z]/g, '');

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
 * start alike and differ by at most one edit per four letters of the name; anything under three letters never matches.
 */
export const soundsLike = (heard: string, name: string) => {
  const heardLetters = toLetters(heard);
  const nameLetters = toLetters(name);
  if (heardLetters.length < MIN_LETTERS || nameLetters.length < MIN_LETTERS) {
    return false;
  }
  const heardKey = toSoundKey(heardLetters);
  const nameKey = toSoundKey(nameLetters);
  if (heardKey === '' || nameKey === '') return false;
  return (
    heardKey[0] === nameKey[0] &&
    getEditDistance(heardKey, nameKey) <= Math.floor(nameLetters.length / 4)
  );
};
