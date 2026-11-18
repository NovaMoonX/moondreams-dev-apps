const ONES: Record<string, number> = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  thirteen: 13,
  fourteen: 14,
  fifteen: 15,
  sixteen: 16,
  seventeen: 17,
  eighteen: 18,
  nineteen: 19,
};

const TENS: Record<string, number> = {
  twenty: 20,
  thirty: 30,
  forty: 40,
  fifty: 50,
  sixty: 60,
  seventy: 70,
  eighty: 80,
  ninety: 90,
};

/** What a recognizer writes for a small number said on its own, so "sick" in a number's place is six. */
const SOUND_ALIKES: Record<string, number> = {
  a: 1,
  an: 1,
  won: 1,
  wan: 1,
  juan: 1,
  to: 2,
  too: 2,
  tu: 2,
  couple: 2,
  tree: 3,
  free: 3,
  for: 4,
  fore: 4,
  fifth: 5,
  fife: 5,
  hive: 5,
  sick: 6,
  sicks: 6,
  sic: 6,
  sex: 6,
  sax: 6,
  sixth: 6,
  seeks: 6,
  sikh: 6,
  sevin: 7,
  seventh: 7,
  ate: 8,
  eat: 8,
  eighth: 8,
  nein: 9,
  ninth: 9,
  tin: 10,
  then: 10,
  tenth: 10,
  twelfth: 12,
  dozen: 12,
};

const readWord = (word: string, isLoose: boolean) =>
  ONES[word] ?? TENS[word] ?? (isLoose ? SOUND_ALIKES[word] : undefined);

/**
 * A count heard where the caller expects one: digits ("6", "2.5"), words ("twenty four") or, as a single word, what a
 * recognizer writes for a small number ("sick" is 6, "for" is 4, "ate" is 8). Null for anything else; only for a slot
 * that holds nothing but a number, since the sound-alikes are ordinary words anywhere else.
 */
export const readHeardCount = (text: string): number | null => {
  const words = text
    .trim()
    .toLowerCase()
    .replace(/^(?:a|an) (?=couple|dozen)/, '')
    .replace(/ of$/, '')
    .split(/[\s-]+/)
    .filter(Boolean);
  if (words.length === 1 && /^\d+(?:\.\d+)?$/.test(words[0])) {
    return Number(words[0]);
  }
  if (words.length === 1) return readWord(words[0], true) ?? null;
  if (words.length !== 2) return null;
  const tens = TENS[words[0]];
  const ones = readWord(words[1], false);
  if (tens === undefined || ones === undefined || ones >= 10) return null;
  return tens + ones;
};
