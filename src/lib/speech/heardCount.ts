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

/** What a recognizer writes for a small number said on its own that is rarely a word of its own at a phrase's end ("sick" for six). */
const DISTINCT_SOUND_ALIKES: Record<string, number> = {
  won: 1,
  wan: 1,
  juan: 1,
  couple: 2,
  tree: 3,
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
  eighth: 8,
  nein: 9,
  ninth: 9,
  tin: 10,
  tenth: 10,
  twelfth: 12,
  dozen: 12,
};

/** Sound-alikes that are everyday words ("for", "to", "a"): a number only where nothing else could stand. */
const COMMON_SOUND_ALIKES: Record<string, number> = {
  a: 1,
  an: 1,
  to: 2,
  too: 2,
  tu: 2,
  free: 3,
  for: 4,
  fore: 4,
  eat: 8,
  then: 10,
};

/** How loosely a count is heard: `'all'` where only a number can stand (right before "servings"), `'distinct'` where an everyday word could also end the phrase, `'none'` for digits and number words only. */
export type HeardCountSoundAlikes = 'all' | 'distinct' | 'none';

const readWord = (word: string, soundAlikes: HeardCountSoundAlikes) =>
  ONES[word] ??
  TENS[word] ??
  (soundAlikes === 'none' ? undefined : DISTINCT_SOUND_ALIKES[word]) ??
  (soundAlikes === 'all' ? COMMON_SOUND_ALIKES[word] : undefined);

/**
 * A count heard where the caller expects one: digits ("6", "2.5"), words ("twenty four", "a dozen") and, as a single
 * word and only as loosely as `soundAlikes` allows, what a recognizer writes for a small number ("sick" is 6, "for" is
 * 4), with "and a half" after any of them. Null for anything else.
 */
export const readHeardCount = (
  text: string,
  soundAlikes: HeardCountSoundAlikes = 'distinct',
): number | null => {
  const halved = text.trim().match(/^(?<whole>.+) and (?:a )?half$/)?.groups;
  if (halved) {
    const whole = readHeardCount(halved.whole, soundAlikes);
    return whole === null ? null : whole + 0.5;
  }
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
  if (words.length === 1) return readWord(words[0], soundAlikes) ?? null;
  if (words.length !== 2) return null;
  const tens = TENS[words[0]];
  const ones = readWord(words[1], 'none');
  if (tens === undefined || ones === undefined || ones >= 10) return null;
  return tens + ones;
};
