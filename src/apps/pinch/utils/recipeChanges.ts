import {
  MAX_RECIPE_NOTE_LENGTH,
  MAX_TWEAK_CHANGE_LENGTH,
  MAX_TWEAK_CHANGES,
  NUTRITION_CELLS,
  UNIT_LABELS,
} from '@apps/pinch/constants';
import type {
  NutritionValues,
  Recipe,
  RecipeIngredient,
} from '@apps/pinch/types';
import {
  getGroupKey,
  getRepeatedLineGroups,
} from '@apps/pinch/utils/ingredientGroups';
import { formatMinutes } from '@apps/pinch/utils/recipeFormat';

/** What a tweak looks at: everything a recipe's form edits except the cover picture. */
export type RecipeContent = Pick<
  Recipe,
  | 'title'
  | 'description'
  | 'servings'
  | 'prepMinutes'
  | 'cookMinutes'
  | 'ingredients'
  | 'steps'
  | 'nutritionOverride'
  | 'sourceId'
>;

const INGREDIENTS_REORDERED = 'Ingredients reordered';
const STEPS_REORDERED = 'Steps reordered';
const STEP_QUOTE_LENGTH = 80;
const TITLE_QUOTE_LENGTH = 80;
const METRIC_KEYS = NUTRITION_CELLS.map((cell) => cell.key);

const truncate = (text: string, max: number) => {
  if (text.length <= max) return text;
  const end = /[\uDC00-\uDFFF]/.test(text.charAt(max - 1)) ? max - 2 : max - 1;
  return `${text.slice(0, end).trimEnd()}…`;
};

const clip = (text: string, max: number) =>
  truncate(text.replace(/\s+/g, ' ').trim(), max);

const formatAmount = (amount: number) => String(Math.round(amount * 100) / 100);

const formatQuantity = ({
  amount,
  unit,
}: Pick<RecipeIngredient, 'amount' | 'unit'>) =>
  amount === null
    ? 'no amount'
    : `${formatAmount(amount)} ${UNIT_LABELS[unit]}`;

type ComparedLine = Omit<RecipeIngredient, 'group'>;

const normalizeLine = (line: RecipeIngredient): ComparedLine => ({
  id: line.id,
  ingredientId: line.ingredientId,
  amount: line.amount,
  unit: line.amount === null ? 'EACH' : line.unit,
  note: (line.note ?? '').trim() || null,
});

const normalize = (content: RecipeContent) => ({
  title: content.title.trim(),
  description: (content.description ?? '').trim() || null,
  servings: content.servings,
  prepMinutes: content.prepMinutes ?? null,
  cookMinutes: content.cookMinutes ?? null,
  // Order has its own check, group by group, so a line moved to another group is no change here.
  ingredients: content.ingredients
    .map(normalizeLine)
    .sort((a, b) => a.id.localeCompare(b.id)),
  steps: content.steps.map((step) => step.trim()).filter(Boolean),
  nutrition: Object.fromEntries(
    METRIC_KEYS.map((key) => [key, content.nutritionOverride?.[key] ?? null]),
  ) as unknown as NutritionValues,
  sourceId: content.sourceId ?? null,
});

type Normalized = ReturnType<typeof normalize>;

const getMinutesLine = (
  label: string,
  before: number | null,
  after: number | null,
) => {
  if (before === after) return [];
  if (after === null) return [`${label} removed`];
  if (before === null) return [`${label} set to ${formatMinutes(after)}`];
  return [
    before < 60 && after < 60
      ? `${label} ${before} → ${after} min`
      : `${label} ${formatMinutes(before)} → ${formatMinutes(after)}`,
  ];
};

const getLineChanges = (
  before: ComparedLine,
  after: ComparedLine,
  beforeName: string,
  name: string,
) => {
  const isAmountChanged = formatQuantity(before) !== formatQuantity(after);
  const amountLine =
    before.unit === after.unit &&
    before.amount !== null &&
    after.amount !== null
      ? `${name} ${formatAmount(before.amount)} → ${formatAmount(after.amount)} ${UNIT_LABELS[after.unit]}`
      : `${name} ${formatQuantity(before)} → ${formatQuantity(after)}`;
  const swapLine = `Swapped ${beforeName} for ${name}${isAmountChanged ? `, ${formatQuantity(after)}` : ''}`;
  const noteLine = () => {
    if (before.note === after.note) return [];
    if (before.note === null) return [`Added a note to ${name}`];
    if (after.note === null) return [`Removed the note from ${name}`];
    return [`Note on ${name} changed`];
  };

  if (before.ingredientId !== after.ingredientId) {
    return [swapLine, ...noteLine()];
  }
  return [...(isAmountChanged ? [amountLine] : []), ...noteLine()];
};

/** Lines are compared without their group, and order only among lines that stayed in their group: moving a line to another heading reorganizes the list without changing the dish, so on its own it records no tweak. A line whose ingredient sits in several groups is named with its group. */
const getIngredientChanges = (
  beforeLines: RecipeIngredient[],
  afterLines: RecipeIngredient[],
  getName: (ingredientId: string) => string,
) => {
  const labelWith = (labels: Map<string, string>) => (line: ComparedLine) => {
    const group = labels.get(line.id);
    return group
      ? `${getName(line.ingredientId)} (${group})`
      : getName(line.ingredientId);
  };
  const beforeLabel = labelWith(getRepeatedLineGroups(beforeLines));
  const afterLabel = labelWith(getRepeatedLineGroups(afterLines));
  const before = beforeLines.map(normalizeLine);
  const after = afterLines.map(normalizeLine);
  const beforeById = new Map(before.map((line) => [line.id, line]));
  const afterById = new Map(after.map((line) => [line.id, line]));
  const changed = after.flatMap((line) => {
    const was = beforeById.get(line.id);
    return was
      ? getLineChanges(was, line, beforeLabel(was), afterLabel(line))
      : [];
  });
  const added = after
    .filter((line) => !beforeById.has(line.id))
    .map((line) =>
      line.amount === null
        ? `Added ${afterLabel(line)}`
        : `Added ${afterLabel(line)}, ${formatQuantity(line)}`,
    );
  const removed = before
    .filter((line) => !afterById.has(line.id))
    .map((line) => `Removed ${beforeLabel(line)}`);
  const beforeKeys = new Map(
    beforeLines.map((line) => [line.id, getGroupKey(line.group)]),
  );
  const afterKeys = new Map(
    afterLines.map((line) => [line.id, getGroupKey(line.group)]),
  );
  const groupKeys = [...new Set(afterKeys.values())];
  const inGroups = (ids: string[]) =>
    groupKeys
      .flatMap((key) => ids.filter((id) => afterKeys.get(id) === key))
      .join('\u0000');
  const isStill = (id: string) =>
    beforeKeys.has(id) && beforeKeys.get(id) === afterKeys.get(id);
  const keptBefore = before
    .filter((line) => isStill(line.id))
    .map((line) => line.id);
  const keptAfter = after
    .filter((line) => isStill(line.id))
    .map((line) => line.id);
  const reordered =
    inGroups(keptBefore) === inGroups(keptAfter) ? [] : [INGREDIENTS_REORDERED];

  return [...changed, ...added, ...removed, ...reordered];
};

const getStepChanges = (before: string[], after: string[]) => {
  if (before.join('\u0000') === after.join('\u0000')) return [];

  const isSameSet =
    before.length === after.length &&
    [...before].sort().join('\u0000') === [...after].sort().join('\u0000');
  if (isSameSet) return [STEPS_REORDERED];

  const shared = Math.min(before.length, after.length);
  const prefix = Array.from({ length: shared }, (_, index) => index).findIndex(
    (index) => before[index] !== after[index],
  );
  const start = prefix === -1 ? shared : prefix;
  const suffix = Array.from(
    { length: shared - start },
    (_, index) => index,
  ).findIndex(
    (index) =>
      before[before.length - 1 - index] !== after[after.length - 1 - index],
  );
  const end = suffix === -1 ? shared - start : suffix;
  const middleBefore = before.slice(start, before.length - end);
  const middleAfter = after.slice(start, after.length - end);
  const paired = Math.min(middleBefore.length, middleAfter.length);

  const changed = middleAfter
    .slice(0, paired)
    .flatMap((step, index) =>
      step === middleBefore[index]
        ? []
        : [
            `Step ${start + index + 1} now reads: “${clip(step, STEP_QUOTE_LENGTH)}”`,
          ],
    );
  const added = middleAfter
    .slice(paired)
    .map(
      (step, index) =>
        `Added step ${start + paired + index + 1}: “${clip(step, STEP_QUOTE_LENGTH)}”`,
    );
  const removed = middleBefore
    .slice(paired)
    .map(
      (step, index) =>
        `Removed step ${start + paired + index + 1}: “${clip(step, STEP_QUOTE_LENGTH)}”`,
    );

  return [...changed, ...added, ...removed];
};

const getNutritionChanges = (before: NutritionValues, after: NutritionValues) =>
  NUTRITION_CELLS.flatMap(({ key, label, unit }) => {
    const was = before[key];
    const now = after[key];
    if (was === now) return [];
    if (was === null) return [`${label} set to ${now}${unit}`];
    if (now === null) return [`${label} back to the calculated number`];
    return [`${label} ${was} → ${now}${unit}`];
  });

const getTextChanges = (before: Normalized, after: Normalized) => {
  const titleChange =
    before.title === after.title
      ? []
      : [`Renamed to “${clip(after.title, TITLE_QUOTE_LENGTH)}”`];
  const servingsChange =
    formatAmount(before.servings) === formatAmount(after.servings)
      ? []
      : [
          `Serves ${formatAmount(before.servings)} → ${formatAmount(after.servings)}`,
        ];
  const getDescriptionChange = () => {
    if (before.description === after.description) return [];
    if (before.description === null) return ['Added a description'];
    if (after.description === null) return ['Removed the description'];
    return ['Description changed'];
  };

  return [...titleChange, ...servingsChange, ...getDescriptionChange()];
};

const capLines = (lines: string[]) => {
  const fitted =
    lines.length <= MAX_TWEAK_CHANGES
      ? lines
      : [
          ...lines.slice(0, MAX_TWEAK_CHANGES - 1),
          `and ${lines.length - (MAX_TWEAK_CHANGES - 1)} more`,
        ];

  return fitted.map((line) => truncate(line, MAX_TWEAK_CHANGE_LENGTH));
};

/**
 * Plain-word lines saying what an edit changed, in the order the recipe form shows things; empty when nothing a person could see changed.
 * At most `MAX_TWEAK_CHANGES` lines: past that the last one says how many more there were.
 */
export const getRecipeChanges = (
  before: RecipeContent,
  after: RecipeContent,
  ingredientsById: Map<string, { name: string }>,
  sourcesById: Map<string, { label: string }> = new Map(),
) => {
  const was = normalize(before);
  const now = normalize(after);
  const getName = (ingredientId: string) =>
    ingredientsById.get(ingredientId)?.name ?? 'Removed ingredient';
  const getSourceLine = () => {
    if (was.sourceId === now.sourceId) return [];
    if (now.sourceId === null) return ['Source removed'];
    const label = sourcesById.get(now.sourceId)?.label;
    return [
      `Source ${was.sourceId === null ? 'set' : 'changed'} to ${label ?? 'another source'}`,
    ];
  };

  const lines = [
    ...getTextChanges(was, now),
    ...getMinutesLine('Prep time', was.prepMinutes, now.prepMinutes),
    ...getMinutesLine('Cook time', was.cookMinutes, now.cookMinutes),
    ...getSourceLine(),
    ...getIngredientChanges(before.ingredients, after.ingredients, getName),
    ...getStepChanges(was.steps, now.steps),
    ...getNutritionChanges(was.nutrition, now.nutrition),
  ];
  const hasMissedChange =
    lines.length === 0 && JSON.stringify(was) !== JSON.stringify(now);
  const result = capLines(hasMissedChange ? ['The recipe changed'] : lines);

  return result;
};

/** What an edit touched that is worth asking the person about: the ingredients (an amount, a swap, a line added or taken out) or the steps. Moving lines or steps around is not asked about. */
export interface ChangeTopics {
  hasIngredients: boolean;
  hasSteps: boolean;
}

export const getChangeTopics = (
  before: RecipeContent,
  after: RecipeContent,
): ChangeTopics => {
  const ingredientLines = getIngredientChanges(
    before.ingredients,
    after.ingredients,
    () => '',
  );
  const stepLines = getStepChanges(
    normalize(before).steps,
    normalize(after).steps,
  );
  const result = {
    hasIngredients: ingredientLines.some(
      (line) => line !== INGREDIENTS_REORDERED,
    ),
    hasSteps: stepLines.some((line) => line !== STEPS_REORDERED),
  };

  return result;
};

type DraftContent = RecipeContent & {
  newIngredients: { id: string; name: string }[];
  newSource: { id: string; label: string } | null;
};

/** The lines and topics of a form's draft against the recipe it edits, naming an ingredient and a source the draft is about to create. */
export const getDraftChanges = (
  existing: RecipeContent,
  draft: DraftContent,
  ingredientsById: ReadonlyMap<string, { name: string }>,
  sourcesById: ReadonlyMap<string, { label: string }>,
) => {
  const ingredientNames = new Map([
    ...ingredientsById,
    ...draft.newIngredients.map(
      (ingredient) =>
        [ingredient.id, { name: ingredient.name.trim() }] as const,
    ),
  ]);
  const sourceLabels = new Map([
    ...sourcesById,
    ...(draft.newSource
      ? [[draft.newSource.id, draft.newSource] as const]
      : []),
  ]);
  const result = {
    changes: getRecipeChanges(existing, draft, ingredientNames, sourceLabels),
    topics: getChangeTopics(existing, draft),
  };

  return result;
};

/** Whether saving this edit stops to ask why: only when an ingredient or a step changed. */
export const isWhyAsked = (topics: ChangeTopics) =>
  topics.hasIngredients || topics.hasSteps;

/** Four quick reasons that fit what changed, to start the sentence the person finishes or leaves as it is. */
export const getWhyChoices = (topics: ChangeTopics) => {
  if (topics.hasIngredients && topics.hasSteps) {
    return [
      'Tasted better',
      'Easier this way',
      'Ran out of something',
      'Fixing a mistake',
    ];
  }
  if (topics.hasSteps) {
    return ['Easier this way', 'Faster', 'Tasted better', 'Fixing a mistake'];
  }
  return ['Tasted better', 'Ran out of it', 'Too much', 'Not enough'];
};

/** What the reason box reads after a chip is tapped: the chip's words when the box is empty or holds only another chip, otherwise added after what was typed, and never past the note's length or twice. */
export const applyWhyChoice = (
  current: string,
  choice: string,
  choices: readonly string[],
) => {
  const typed = current.trim();
  if (typed === '' || choices.includes(typed)) return choice;
  if (typed.toLowerCase().includes(choice.toLowerCase())) return current;
  const joined = `${typed.replace(/[.!?]+$/, '')}. ${choice}`;
  return joined.length > MAX_RECIPE_NOTE_LENGTH ? current : joined;
};
