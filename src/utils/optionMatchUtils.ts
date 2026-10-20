import { getWordSimilarity } from '@/utils/stringUtils';

const MIN_SIMILARITY = 0.82;
const ACRONYM = /^[A-Z]{2,4}$/;

const toSingular = (word: string) => {
  if (word.length > 4 && word.endsWith('ies')) return `${word.slice(0, -3)}y`;
  if (word.length > 4 && /(ches|shes|oes|ses|xes)$/.test(word))
    return word.slice(0, -2);
  if (word.length > 3 && word.endsWith('s') && !word.endsWith('ss'))
    return word.slice(0, -1);
  return word;
};

/** The form two names are compared in: accents, case and punctuation off, one space between words, English plurals folded only when asked. */
export const toComparable = (text: string, foldPlurals = false) =>
  text
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => (foldPlurals ? toSingular(word) : word))
    .join(' ');

export interface DisplayCaseOptions {
  /** `sentence` capitalizes the first letter only ("Chicken thigh"); `title` capitalizes every word ("Maine Coon"). */
  style?: 'sentence' | 'title';
  /** Keeps a short all-capitals word such as BBQ as written. */
  keepAcronyms?: boolean;
}

const capitalize = (text: string) =>
  text.charAt(0).toUpperCase() + text.slice(1);

/** A name written the way a list writes its own, whatever case it arrived in. */
export const toDisplayCase = (
  text: string,
  { style = 'sentence', keepAcronyms = false }: DisplayCaseOptions = {},
) => {
  const words = text
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((word) =>
      keepAcronyms && ACRONYM.test(word) ? word : word.toLowerCase(),
    );
  const cased = style === 'title' ? words.map(capitalize) : words;
  const joined = cased.join(' ');

  return style === 'title' ? joined : capitalize(joined);
};

const sortedWords = (text: string) => text.split(' ').sort().join(' ');

const getSimilarity = (left: string, right: string) => {
  const longest = Math.max(left.length, right.length);
  const isTooFarApart =
    Math.abs(left.length - right.length) > longest * (1 - MIN_SIMILARITY);

  return isTooFarApart ? 0 : getWordSimilarity(left, right);
};

export interface OptionMatcherConfig<T> {
  /** The names an option answers to, its label first and then any aliases; a list of plain strings needs none. */
  names?: (option: T) => readonly string[];
  /** Words that describe an option without saying which one ("fresh", "large"), dropped from both sides before comparing. */
  ignoreWords?: ReadonlySet<string>;
  /** Runs on every name before it is compared, for what only this list needs removed ("bone-in" from a food). */
  prepare?: (text: string) => string;
  /** English plurals compare as one word. Off by default, since a person's, pet's or place's name is not a plural. */
  foldPlurals?: boolean;
  /** The same words in another order are the same option. On by default; off where order tells options apart. */
  reorder?: boolean;
  /** One wrong letter in a name of six or more still matches when exactly one option is clearly closest. On by default; off where a near miss is another option (airlines). */
  typos?: boolean;
  /** How the label of a custom option is written; `resolve` uses it. */
  casing?: DisplayCaseOptions;
}

export type OptionResolution<T> =
  { kind: 'match'; option: T } | { kind: 'custom'; label: string };

/** Turns a typed or read value into one of a list's known options, or a custom option written like the rest. Earlier options win a tie and option objects are cached by identity. Not for search boxes or ids. */
export function createOptionMatcher<T = string>(
  config: OptionMatcherConfig<T> = {},
) {
  const {
    names = (option: T) => [String(option)],
    ignoreWords,
    prepare = (text: string) => text,
    foldPlurals = false,
    reorder = true,
    typos = true,
    casing,
  } = config;
  const namesByOption = new WeakMap<object, string[]>();

  const comparable = (text: string) =>
    toComparable(prepare(text), foldPlurals)
      .split(' ')
      .filter((word) => word !== '' && !ignoreWords?.has(word))
      .join(' ');

  const getKnownNames = (option: T) => {
    const compute = () => names(option).map(comparable).filter(Boolean);
    if (typeof option !== 'object' || option === null) return compute();
    const cached = namesByOption.get(option);
    if (cached) return cached;
    const result = compute();
    namesByOption.set(option, result);
    return result;
  };

  const match = (value: string, options: readonly T[]): T | null => {
    const target = comparable(value);
    if (target === '') return null;

    const known = options.map((option) => ({
      option,
      names: getKnownNames(option),
    }));
    const sameName = known.find((entry) => entry.names.includes(target));
    if (sameName) return sameName.option;

    const targetWords = sortedWords(target);
    const sameWords = reorder
      ? known.find((entry) =>
          entry.names.some((name) => sortedWords(name) === targetWords),
        )
      : undefined;
    if (sameWords) return sameWords.option;
    if (!typos) return null;

    const close = known
      .map((entry) => ({
        option: entry.option,
        score: Math.max(
          0,
          ...entry.names.map((name) => getSimilarity(name, target)),
        ),
      }))
      .filter(({ score }) => score >= MIN_SIMILARITY)
      .sort((left, right) => right.score - left.score);
    const isClear =
      close.length === 1 ||
      (close.length > 1 && close[0].score > close[1].score);

    return isClear ? close[0].option : null;
  };

  const resolve = (
    value: string,
    options: readonly T[],
  ): OptionResolution<T> => {
    const option = match(value, options);
    if (option !== null) return { kind: 'match', option };

    return { kind: 'custom', label: toDisplayCase(prepare(value), casing) };
  };

  return { comparable, match, resolve };
}
