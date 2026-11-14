import { COMMON_WORDS, toComparable } from '@/utils/optionMatchUtils';

export interface NameHintCandidate {
  text: string;
  /** Lower ranks are kept first. */
  rank: number;
  /** Orders terms within a rank, higher first. */
  weight: number;
}

export interface NameHintOptions {
  maxTerms?: number;
  maxTokens?: number;
  /** Refuses a term outright; the caller builds it from everything it must never send, not only from the candidates. */
  exclude?: (text: string) => boolean;
}

const DEFAULT_MAX_TERMS = 90;
const DEFAULT_MAX_TOKENS = 450;
const CHARS_PER_TOKEN = 3;

const DATE_AND_UNIT_WORDS: ReadonlySet<string> = new Set([
  ...'monday tuesday wednesday thursday friday saturday sunday january february march april june july august september october november december today tomorrow tonight yesterday morning afternoon evening noon midnight am pm'.split(
    ' ',
  ),
  ...'tsp tbsp teaspoon tablespoon cup cups oz ounce ounces lb lbs pound pounds gram grams kg kilo ml liter litre gallon quart pint mg mph km mile miles inch inches foot feet minute minutes hour hours day days week weeks month months year years second seconds percent dollar dollars cents'.split(
    ' ',
  ),
]);

/** One per term plus one per 3 characters, so a budget counted this way never undercounts what a recognizer charges. */
export const countHintTokens = (terms: string[]) =>
  terms.reduce(
    (total, term) => total + 1 + Math.ceil(term.length / CHARS_PER_TOKEN),
    0,
  );

const isWorthHinting = (text: string) => {
  const term = text.trim();
  if (term.length < 2 || term.includes('@') || /\d/.test(term)) return false;
  const words = toComparable(term).split(' ').filter(Boolean);

  return (
    words.length > 0 &&
    !words.every(
      (word) => COMMON_WORDS.has(word) || DATE_AND_UNIT_WORDS.has(word),
    )
  );
};

/** The names a recognizer should expect, best first: drops what recognizers already hear well (everyday words, dates, numbers, units, anything with `@`) and whatever `exclude` refuses, keeps one of each spelling, and cuts to the budget. */
export const buildNameHints = (
  candidates: NameHintCandidate[],
  {
    maxTerms = DEFAULT_MAX_TERMS,
    maxTokens = DEFAULT_MAX_TOKENS,
    exclude,
  }: NameHintOptions = {},
): string[] => {
  const ordered = candidates
    .map((candidate) => ({ ...candidate, text: candidate.text.trim() }))
    .filter(({ text }) => isWorthHinting(text) && !(exclude?.(text) ?? false))
    .sort(
      (left, right) => left.rank - right.rank || right.weight - left.weight,
    );
  const seen = new Set<string>();
  const unique = ordered.filter(({ text }) => {
    const key = toComparable(text);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return unique.reduce(
    (kept, { text }) => {
      const tokens = kept.tokens + countHintTokens([text]);
      if (kept.terms.length >= maxTerms || tokens > maxTokens) return kept;
      return { terms: [...kept.terms, text], tokens };
    },
    { terms: [] as string[], tokens: 0 },
  ).terms;
};
