// Generated from src/utils/optionMatchUtils.ts by scripts/checks/serverCopies.ts. Do not edit; run npm run connections:vendor.
import { getWordSimilarity } from './stringUtils.js';

const MIN_SIMILARITY = 0.82;
const SOUND_MIN_SCORE = 0.8;
const SOUND_MIN_LEAD = 0.15;
const SOUND_MAX_SPELLING_GAP = 0.4;
const SOUND_MAX_SPELLING_GAP_SAME_KEY = 0.75;
const SOUND_SPAN_WORDS = 3;
const SOUND_MIN_LETTERS = 3;
const SOUND_KEY_WEIGHT = 0.8;
const MIN_TYPO_WORD_LENGTH = 6;
const ACRONYM = /^[A-Z]{2,4}$/;
const INNER_CAPITAL = /\p{Ll}\p{Lu}/u;
const LETTERS = /^\p{L}+$/u;

/** Everyday English words a recognizer already gets right and that are easily another word's sound-alike ("mark" the verb): never swapped for a name and not worth a recognizer hint. */
export const COMMON_WORDS: ReadonlySet<string> = new Set(
  `
    a about above after again all also am an and any are as at back be
    because been before being between both but by can come could day did do
    does down each even every few first for from get give go going good got
    had has have he her here hers him his how i if in into is it its just
    know let like little look made make many may me more most my new no not
    now of off on one only or other our out over own people really right
    said same say see she should so some such take than that the their them
    then there these they thing think this those through time to too two up
    us use very want was way we well went were what when where which while
    who why will with would yes yet you your mark grace rose hope bill art
    june april august dawn faith joy pat sue ray sandy summer holly ivy lily
    violet amber ruby pearl heather rich frank dean drew guy jean jay page
    penny sky star van bell blue cash chase cliff dale daisy dash dusk
  `
    .split(/\s+/)
    .filter(Boolean),
);

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

const VOWELS = 'aeiou';
const isVowel = (letter: string | undefined) =>
  letter !== undefined && VOWELS.includes(letter);

const readInitial = (word: string) => {
  const head = word.slice(0, 2);
  if (['kn', 'gn', 'pn', 'wr', 'ae'].includes(head)) return word.slice(1);
  if (head === 'wh') return `w${word.slice(2)}`;
  return word.startsWith('x') ? `s${word.slice(1)}` : word;
};

/** A compact English phonetic key (Metaphone family) so spellings that sound alike share it: "Shivon" and "Siobhan" are both XFN, "Xander" and "Zander" both SNTR. Letters of other scripts are kept as they are. */
export const toSoundKey = (word: string) => {
  const letters = toComparable(word).replace(/[^\p{L}]/gu, '');
  if (!/^[a-z]+$/.test(letters)) return letters;
  const text = readInitial(letters);
  const sound = (at: number): string => {
    const letter = text[at];
    const previous = text[at - 1];
    const next = text[at + 1];
    const after = text[at + 2];
    if (letter === previous && letter !== 'c') return '';
    if (isVowel(letter)) return at === 0 ? 'A' : '';
    switch (letter) {
      case 'b':
        if (next === 'h') return 'F';
        return previous === 'm' && next === undefined ? '' : 'B';
      case 'c':
        if (next === 'i' && after === 'a') return 'X';
        if (next === 'h') return text[at + 2] === 'r' ? 'K' : 'X';
        if (next !== undefined && 'iey'.includes(next))
          return previous === 's' ? '' : 'S';
        return 'K';
      case 'd':
        return next === 'g' && after !== undefined && 'eiy'.includes(after)
          ? 'J'
          : 'T';
      case 'g':
        if (next === 'h') return isVowel(after) ? 'K' : '';
        if (next === 'n' && at + 2 >= text.length) return '';
        return next !== undefined && 'eiy'.includes(next) ? 'J' : 'K';
      case 'h':
        return isVowel(next) && !'bcgpst'.includes(previous ?? '') ? 'H' : '';
      case 'k':
        return previous === 'c' ? '' : 'K';
      case 'm':
        return next === 'h' && at + 2 >= text.length ? 'F' : 'M';
      case 'p':
        return next === 'h' ? 'F' : 'P';
      case 'q':
        return 'K';
      case 's':
        if (next === 'h') return 'X';
        return next === 'i' && (after === 'o' || after === 'a') ? 'X' : 'S';
      case 't':
        if (next === 'h') return '0';
        if (next === 'i' && (after === 'o' || after === 'a')) return 'X';
        return next === 'c' && after === 'h' ? '' : 'T';
      case 'v':
        return 'F';
      case 'w':
      case 'y':
        return isVowel(next) ? letter.toUpperCase() : '';
      case 'x':
        return 'KS';
      case 'z':
        return 'S';
      default:
        return letter.toUpperCase();
    }
  };
  return Array.from(text, (_, at) => sound(at)).join('');
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
  /** Turns on `matchSounds`, which reads sound-alikes in heard text. Off by default. */
  sounds?: boolean;
  /** Forms an option was misheard as before: `matchSounds` reads them as the option, but `match` never does. */
  soundsLike?: (option: T) => readonly string[];
}

export interface SoundSpan {
  start: number;
  end: number;
  heard: string;
}

/** A span of heard text that sounds like exactly one option, clearly ahead of the next. */
export interface SoundMatch<T> extends SoundSpan {
  option: T;
  /** The name to show in place of the heard words: the option's own, never a form it was misheard as. */
  name: string;
  score: number;
}

/** A span that sounds like two options about equally well, so neither is picked. */
export interface SoundTie<T> extends SoundSpan {
  options: [T, T];
}

interface SoundForm {
  spelling: string;
  key: string;
  /** The option's own name this form stands for, as it is written. */
  shown: string;
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
    sounds = false,
    soundsLike,
  } = config;
  const soundsByOption = new WeakMap<object, SoundForm[]>();
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

  const toSoundForm = (text: string, shown = text): SoundForm => {
    const words = toComparable(prepare(text)).split(' ').filter(Boolean);
    return {
      spelling: words.join(''),
      key: words.map(toSoundKey).join(''),
      shown,
    };
  };

  const getSoundForms = (option: T) => {
    const compute = () =>
      [
        ...names(option).map((name) => toSoundForm(name)),
        ...(soundsLike?.(option) ?? []).map((form) =>
          toSoundForm(form, names(option)[0] ?? form),
        ),
      ].filter(({ spelling }) => spelling !== '');
    if (typeof option !== 'object' || option === null) return compute();
    const cached = soundsByOption.get(option);
    if (cached) return cached;
    const result = compute();
    soundsByOption.set(option, result);
    return result;
  };

  const scoreSound = (heard: SoundForm, known: SoundForm) => {
    const keyGap = 1 - getWordSimilarity(heard.key, known.key);
    const keyEdits = Math.round(
      keyGap * Math.max(heard.key.length, known.key.length),
    );
    const spellingGap = 1 - getWordSimilarity(heard.spelling, known.spelling);
    const isSameKey = keyEdits === 0;
    const maxGap = isSameKey
      ? SOUND_MAX_SPELLING_GAP_SAME_KEY
      : SOUND_MAX_SPELLING_GAP;
    if (keyEdits > 1 || spellingGap > maxGap) return 0;
    return (
      SOUND_KEY_WEIGHT * (1 - keyGap) +
      (1 - SOUND_KEY_WEIGHT) * (1 - spellingGap)
    );
  };

  const readSpan = (
    heard: SoundForm,
    known: { option: T; forms: SoundForm[]; names: KnownName[] }[],
  ) => {
    const scored = known
      .map((entry) => {
        const forms = entry.forms
          .map((form) => ({
            shown: form.shown,
            score: scoreSound(heard, form),
          }))
          .sort((left, right) => right.score - left.score);
        return {
          option: entry.option,
          name: forms[0]?.shown ?? '',
          score: forms[0]?.score ?? 0,
        };
      })
      .filter(({ score }) => score >= SOUND_MIN_SCORE)
      .sort((left, right) => right.score - left.score);
    if (scored.length === 0) return null;
    if (
      scored.length === 1 ||
      scored[0].score - scored[1].score >= SOUND_MIN_LEAD
    ) {
      return { kind: 'match' as const, ...scored[0] };
    }
    return {
      kind: 'tie' as const,
      options: [scored[0].option, scored[1].option] as [T, T],
    };
  };

  /** Reads a span of one to three words of heard text that sounds like one known option (or two near-equal ones, as a tie), never a word that already is a known name or an everyday word. */
  const matchSounds = (
    text: string,
    options: readonly T[],
  ): { matches: SoundMatch<T>[]; ties: SoundTie<T>[] } => {
    if (!sounds) return { matches: [], ties: [] };
    const words = Array.from(
      text.matchAll(/\p{L}[\p{L}\p{M}'’]*/gu),
      (hit) => ({
        text: hit[0],
        start: hit.index,
        end: hit.index + hit[0].length,
        comparable: toComparable(hit[0]),
      }),
    );
    const known = options.map((option) => ({
      option,
      forms: getSoundForms(option),
      names: getKnownNames(option),
    }));
    const isKnown = (comparable: string) =>
      known.some((entry) =>
        entry.names.some((name) => name.full === comparable),
      );
    const isEdgeCommon = (span: typeof words) =>
      COMMON_WORDS.has(span[0].comparable) ||
      COMMON_WORDS.has(span[span.length - 1].comparable);
    const readAt = (at: number) =>
      [SOUND_SPAN_WORDS, 2, 1].flatMap((length) => {
        const span = words.slice(at, at + length);
        if (span.length !== length || isEdgeCommon(span)) return [];
        const comparable = span.map((word) => word.comparable).join(' ');
        const heard = toSoundForm(comparable);
        if (heard.spelling.length < SOUND_MIN_LETTERS || isKnown(comparable)) {
          return [];
        }
        const read = readSpan(heard, known);
        if (read === null) return [];
        const base = {
          start: span[0].start,
          end: span[span.length - 1].end,
          heard: text.slice(span[0].start, span[span.length - 1].end),
        };
        return [
          read.kind === 'match'
            ? {
                match: {
                  ...base,
                  option: read.option,
                  name: read.name,
                  score: read.score,
                },
              }
            : { tie: { ...base, options: read.options } },
        ];
      })[0] ?? null;

    const { matches, ties } = words.reduce(
      (found, word, at) => {
        if (word.start < found.until) return found;
        const read = readAt(at);
        if (read === null) return found;
        const span = read.match ?? read.tie;
        return {
          until: span.end,
          matches: read.match ? [...found.matches, read.match] : found.matches,
          ties: read.tie ? [...found.ties, read.tie] : found.ties,
        };
      },
      { until: 0, matches: [] as SoundMatch<T>[], ties: [] as SoundTie<T>[] },
    );

    return { matches, ties };
  };

  return { comparable, match, resolve, matchSounds };
}
