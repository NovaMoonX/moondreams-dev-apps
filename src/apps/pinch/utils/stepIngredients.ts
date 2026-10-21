import { groupIngredientLines } from '@apps/pinch/utils/ingredientGroups';
import { normalizeName } from '@apps/pinch/utils/ingredientMatch';

export interface StepIngredientLine {
  id: string;
  ingredientId: string;
  /** The ingredient's name and the other names it goes by. */
  names: string[];
  group?: string | null;
}

export interface StepIngredients {
  /** The lines a step is the first to name (an ingredient in several groups: the next group's), in the order it names them. */
  lineIds: string[];
  /** The step writes an amount of its own ("2 cups of the broth"), which scaling doesn't touch. */
  hasWrittenAmount: boolean;
}

const DESCRIBING_WORDS = new Set([
  'fresh',
  'frozen',
  'large',
  'small',
  'medium',
  'chopped',
  'diced',
  'minced',
  'sliced',
  'ground',
  'boneless',
  'skinless',
  'raw',
  'whole',
  'extra',
  'virgin',
  'organic',
  'unsalted',
  'salted',
  'ripe',
  'of',
  'the',
  'a',
]);

const TOO_VAGUE_ALONE = new Set([
  'and',
  'with',
  'in',
  'for',
  'or',
  'to',
  'on',
  'half',
  'black',
  'white',
  'red',
  'green',
  'yellow',
  'brown',
  'sweet',
  'hot',
  'dark',
  'light',
  'dried',
  'dry',
  'sauce',
  'powder',
  'juice',
  'stock',
  'paste',
  'seed',
  'leave',
  'leaf',
  'flake',
  'mix',
  'baking',
  'plain',
  'purpose',
  'kosher',
  'sea',
  'fine',
  'coarse',
  'heavy',
  'cooked',
  'canned',
  'can',
  'clove',
  'stick',
  'piece',
  'slice',
  'bell',
  'spring',
  'sour',
  'smoked',
  'roasted',
  'toasted',
  'grated',
  'shredded',
  'crushed',
  'pure',
]);

const WRITTEN_AMOUNT =
  /(?:\d|[½¼¾⅓⅔⅛])\s?-?\s?(?:cups?|tablespoons?|tbsps?|tbs|teaspoons?|tsps?|grams?|g|kg|kilos?|kilograms?|oz|ounces?|lbs?|pounds?|ml|millilit(?:er|re)s?|l|lit(?:er|re)s?|quarts?|pints?|cloves?|cans?|pinch(?:es)?|dash(?:es)?|sticks?|handfuls?)\b/i;

const toWords = (text: string) =>
  normalizeName(text)
    .split(' ')
    .filter((word) => word !== '' && !DESCRIBING_WORDS.has(word));

const findAll = (words: string[], phrase: string[], taken: Set<number>) =>
  words.reduce<number[]>((starts, _, start) => {
    const fits =
      start + phrase.length <= words.length &&
      phrase.every(
        (word, offset) =>
          words[start + offset] === word && !taken.has(start + offset),
      );
    return fits ? [...starts, start] : starts;
  }, []);

/**
 * For each step, the recipe lines it is the first to name (by name or alias, whole phrases first, then the first or last word of a name when only one ingredient could mean it), since an amount is measured once, and whether it writes an amount of its own.
 * An ingredient with lines in several groups is shared out: each step that names it takes the next group's lines, in the order the groups show, and the last step that names it takes what is left.
 */
export function matchStepIngredients(
  steps: string[],
  lines: StepIngredientLine[],
): StepIngredients[] {
  const namesById = new Map(
    lines.map((line) => [line.ingredientId, line.names]),
  );
  const phrases = [...namesById]
    .flatMap(([ingredientId, names]) =>
      [...new Set(names.map((name) => toWords(name).join(' ')))]
        .filter(Boolean)
        .map((phrase) => ({ ingredientId, words: phrase.split(' ') })),
    )
    .sort((a, b) => b.words.length - a.words.length);
  const idsByWord = [...namesById].reduce((byWord, [ingredientId, names]) => {
    const words = toWords(names[0] ?? '');
    [words[0], words[words.length - 1]]
      .filter((word) => word !== undefined)
      .forEach((word) =>
        byWord.set(word, new Set([...(byWord.get(word) ?? []), ingredientId])),
      );
    return byWord;
  }, new Map<string, Set<string>>());
  const singleWords = [...idsByWord]
    .filter(
      ([word, ids]) =>
        ids.size === 1 && word.length > 2 && !TOO_VAGUE_ALONE.has(word),
    )
    .map(([word, ids]) => ({ ingredientId: [...ids][0], words: [word] }));

  const findNamed = (step: string) => {
    const words = toWords(step);
    const taken = new Set<number>();
    const firstAt = new Map<string, number>();
    const claim = (candidates: typeof phrases, onlyNew: boolean) =>
      candidates.forEach(({ ingredientId, words: phrase }) => {
        if (onlyNew && firstAt.has(ingredientId)) return;
        findAll(words, phrase, taken).forEach((start) => {
          phrase.forEach((_, offset) => taken.add(start + offset));
          firstAt.set(
            ingredientId,
            Math.min(firstAt.get(ingredientId) ?? start, start),
          );
        });
      });
    claim(phrases, false);
    claim(singleWords, true);

    return [...firstAt]
      .sort((a, b) => a[1] - b[1])
      .map(([ingredientId]) => ingredientId);
  };

  const batchesById = groupIngredientLines(lines)
    .flatMap((group) => [
      ...group.lines.reduce(
        (byIngredient, line) =>
          byIngredient.set(line.ingredientId, [
            ...(byIngredient.get(line.ingredientId) ?? []),
            line.id,
          ]),
        new Map<string, string[]>(),
      ),
    ])
    .reduce(
      (acc, [ingredientId, ids]) =>
        acc.set(ingredientId, [...(acc.get(ingredientId) ?? []), ids]),
      new Map<string, string[][]>(),
    );
  const named = steps.map(findNamed);
  const mentionsById = named.reduce(
    (acc, ids, stepIndex) =>
      ids.reduce(
        (byId, id) => byId.set(id, [...(byId.get(id) ?? []), stepIndex]),
        acc,
      ),
    new Map<string, number[]>(),
  );
  const assigned = [...mentionsById].reduce((acc, [ingredientId, mentions]) => {
    const batches = batchesById.get(ingredientId) ?? [];
    const shared = Math.min(mentions.length, batches.length);
    return mentions
      .slice(0, shared)
      .reduce(
        (byStep, stepIndex, turn) =>
          byStep.set(
            `${stepIndex}:${ingredientId}`,
            (turn === shared - 1
              ? batches.slice(turn)
              : [batches[turn]]
            ).flat(),
          ),
        acc,
      );
  }, new Map<string, string[]>());
  const result = steps.map((step, stepIndex) => ({
    lineIds: named[stepIndex].flatMap(
      (ingredientId) => assigned.get(`${stepIndex}:${ingredientId}`) ?? [],
    ),
    hasWrittenAmount: WRITTEN_AMOUNT.test(step),
  }));

  return result;
}
