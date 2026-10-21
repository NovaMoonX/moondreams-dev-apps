import { getWordSimilarity } from '@/utils/stringUtils';

const MIN_SIMILARITY = 0.82;
const MIN_TYPO_WORD_LENGTH = 6;
const ACRONYM = /^[A-Z]{2,4}$/;
const INNER_CAPITAL = /\p{Ll}\p{Lu}/u;
const LETTERS = /^\p{L}+$/u;

const toSingular = (word: string) => {
  if (word.length > 4 && word.endsWith('ies')) return `${word.slice(0, -3)}y`;
  if (word.length > 4 && word.endsWith('ie')) return `${word.slice(0, -2)}y`;
  if (word.length > 4 && /(ches|shes|oes|ses|xes)$/.test(word))
    return word.slice(0, -2);
  if (word.length > 3 && word.endsWith('s') && !word.endsWith('ss'))
    return word.slice(0, -1);
  return word;
};

/** The form two names are compared in: accents on Latin letters, case and punctuation off, one space between words, English plurals folded only when asked. Marks on other scripts (a dakuten, a vowel sign) tell words apart and stay. */
export const toComparable = (text: string, foldPlurals = false) =>
  text
    .normalize('NFD')
    .replace(/(?<=\p{Script=Latin})\p{M}+/gu, '')
    .normalize('NFC')
    .toLowerCase()
    .replace(/[^\p{L}\p{M}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => (foldPlurals ? toSingular(word) : word))
    .join(' ');

export interface DisplayCaseOptions {
  /** `sentence` capitalizes the first letter only ("Chicken thigh"); `title` capitalizes every word ("Maine Coon"). */
  style?: 'sentence' | 'title';
  /** Keeps a short all-capitals word such as BBQ as written, when the rest of the text has lowercase letters (a name typed in capitals is recased whole). */
  keepAcronyms?: boolean;
  /** Leaves a word with a capital inside it as written ("KitKat", "iPhone"); every other word is recased. */
  keepMixedCase?: boolean;
}

const capitalize = (text: string) =>
  text.charAt(0).toUpperCase() + text.slice(1);

/** A name written the way a list writes its own, whatever case it arrived in. */
export const toDisplayCase = (
  text: string,
  {
    style = 'sentence',
    keepAcronyms = false,
    keepMixedCase = false,
  }: DisplayCaseOptions = {},
) => {
  const words = text.trim().split(/\s+/).filter(Boolean);
  const hasLower = /\p{Ll}/u.test(text);
  const isKept = (word: string) => keepMixedCase && INNER_CAPITAL.test(word);

  const recased = words.map((word) =>
    isKept(word) || (keepAcronyms && hasLower && ACRONYM.test(word))
      ? word
      : word.toLowerCase(),
  );
  const cased =
    style === 'title'
      ? recased.map((word, index) =>
          isKept(words[index]) ? word : capitalize(word),
        )
      : recased;
  const joined = cased.join(' ');

  if (style === 'title' || isKept(words[0])) return joined;

  return capitalize(joined);
};

const sortedWords = (text: string) => text.split(' ').sort().join(' ');

const getSimilarity = (left: string, right: string) => {
  const longest = Math.max(left.length, right.length);
  const isTooFarApart =
    Math.abs(left.length - right.length) > longest * (1 - MIN_SIMILARITY);

  return isTooFarApart ? 0 : getWordSimilarity(left, right);
};

/** Two names are a typo of each other only when one word of six or more letters, starting with the same letter, is spelled differently: "veterinry" for "veterinary", never "goat" for "oat", "stick" for "stock", "1%" for "2%", "juiced" for "juice" or "Biscuits" for "Biscuit". */
const isTypoOf = (known: string, target: string) => {
  const knownWords = known.split(' ');
  const targetWords = target.split(' ');
  if (knownWords.length !== targetWords.length) return false;

  const differing = knownWords
    .map((word, index) => [word, targetWords[index]])
    .filter(([left, right]) => left !== right);
  if (differing.length !== 1) return false;

  const [left, right] = differing[0];
  const [short, long] =
    left.length <= right.length ? [left, right] : [right, left];
  const isSuffix =
    long.length === short.length + 1 &&
    long.startsWith(short) &&
    /[sd]$/.test(long);

  return (
    short.length >= MIN_TYPO_WORD_LENGTH &&
    LETTERS.test(left) &&
    LETTERS.test(right) &&
    left[0] === right[0] &&
    !isSuffix
  );
};

export interface OptionMatcherConfig<T> {
  /** The names an option answers to, its label first and then any aliases; a list of plain strings needs none. */
  names?: (option: T) => readonly string[];
  /** Words that describe an option without changing which one it is, dropped from both the typed value and the options' names before comparing. */
  ignoreWords?: ReadonlySet<string>;
  /** Words a typed or read value may carry that the option it means does not ("fresh" in "fresh basil"), dropped from the typed value only, so an option whose own name has the word ("Ground pork", "Canned diced tomatoes") is never reached by a value without it. Prefer this to `ignoreWords`. */
  ignoreTypedWords?: ReadonlySet<string>;
  /** Runs on every name before it is compared, for what only this list needs removed ("bone-in" from a food). */
  prepare?: (text: string) => string;
  /** English plurals compare as one word. Off by default, since a person's, pet's or place's name is not a plural. */
  foldPlurals?: boolean;
  /** An option that wins when several fit a name equally well (the person's own ingredient over the catalog's). Two preferred options that fit equally are ambiguous, so neither is picked. */
  prefer?: (option: T) => boolean;
  /** The same words in another order are the same option. On by default; off where order tells options apart ("egg white" is not "white egg"). */
  reorder?: boolean;
  /** A typo still matches when one option is clearly the closest. `true` (the default) allows one misspelled word of six or more letters, which is safe to write without asking; `'loose'` allows any small misspelling, for matches the person reviews before they are saved; `false` where a near miss is another option (airlines). */
  typos?: boolean | 'loose';
  /** How the label of a custom option is written; `resolve` uses it. */
  casing?: DisplayCaseOptions;
}

export type OptionResolution<T> =
  { kind: 'match'; option: T } | { kind: 'custom'; label: string };

interface KnownName {
  full: string;
  core: string;
}

/** Turns a typed or read value into one of a list's known options, or a custom option written like the rest. Two options that fit a value equally well are ambiguous, so neither is picked unless `prefer` names one; option objects are cached by identity. Not for search boxes or ids. */
export function createOptionMatcher<T = string>(
  config: OptionMatcherConfig<T> = {},
) {
  const {
    names = (option: T) => [String(option)],
    ignoreWords,
    ignoreTypedWords,
    prefer,
    prepare = (text: string) => text,
    foldPlurals = false,
    reorder = true,
    typos = true,
    casing,
  } = config;
  const namesByOption = new WeakMap<object, KnownName[]>();

  const analyze = (text: string, isTyped = false): KnownName => {
    const words = toComparable(prepare(text), foldPlurals)
      .split(' ')
      .filter(Boolean);

    return {
      full: words.join(' '),
      core: words
        .filter(
          (word) =>
            !ignoreWords?.has(word) &&
            !(isTyped && ignoreTypedWords?.has(word)),
        )
        .join(' '),
    };
  };

  const comparable = (text: string) => analyze(text, true).core;

  const getKnownNames = (option: T) => {
    const compute = () =>
      names(option)
        .map((name) => analyze(name))
        .filter(({ full }) => full !== '');
    if (typeof option !== 'object' || option === null) return compute();
    const cached = namesByOption.get(option);
    if (cached) return cached;
    const result = compute();
    namesByOption.set(option, result);
    return result;
  };

  const match = (value: string, options: readonly T[]): T | null => {
    const target = analyze(value, true);
    if (target.full === '') return null;

    const known = options.map((option) => ({
      option,
      names: getKnownNames(option),
    }));
    const fits = (isSame: (name: KnownName) => boolean) =>
      known
        .filter((entry) => entry.names.some(isSame))
        .map((entry) => entry.option);
    const pickSure = (candidates: T[]) => {
      if (candidates.length === 1) return candidates[0];
      const preferred = prefer ? candidates.filter(prefer) : [];

      return preferred.length === 1 ? preferred[0] : null;
    };

    const exact = fits((name) => name.full === target.full);
    if (exact.length > 0) return pickSure(exact);
    if (target.core === '') return null;

    const sameCore = fits((name) => name.core === target.core);
    if (sameCore.length > 0) return pickSure(sameCore);

    const targetWords = sortedWords(target.core);
    const sameWords = reorder
      ? fits((name) => sortedWords(name.core) === targetWords)
      : [];
    if (sameWords.length > 0) return pickSure(sameWords);
    if (!typos) return null;

    const close = known
      .map((entry) => ({
        option: entry.option,
        score: Math.max(
          0,
          ...entry.names
            .filter(
              (name) => typos === 'loose' || isTypoOf(name.core, target.core),
            )
            .map((name) => getSimilarity(name.core, target.core)),
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
