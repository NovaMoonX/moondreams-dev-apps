import {
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

const normalizeLine = (line: RecipeIngredient): RecipeIngredient => ({
  id: line.id,
  ingredientId: line.ingredientId,
  amount: line.amount,
  unit: line.unit,
  note: (line.note ?? '').trim() || null,
});

const normalize = (content: RecipeContent) => ({
  title: content.title.trim(),
  description: (content.description ?? '').trim() || null,
  servings: content.servings,
  prepMinutes: content.prepMinutes ?? null,
  cookMinutes: content.cookMinutes ?? null,
  ingredients: content.ingredients.map(normalizeLine),
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
  before: RecipeIngredient,
  after: RecipeIngredient,
  getName: (ingredientId: string) => string,
) => {
  const name = getName(after.ingredientId);
  const isAmountChanged =
    formatAmount(before.amount) !== formatAmount(after.amount) ||
    before.unit !== after.unit;
  const amountLine =
    before.unit === after.unit
      ? `${name} ${formatAmount(before.amount)} → ${formatAmount(after.amount)} ${UNIT_LABELS[after.unit]}`
      : `${name} ${formatAmount(before.amount)} ${UNIT_LABELS[before.unit]} → ${formatAmount(after.amount)} ${UNIT_LABELS[after.unit]}`;
  const swapLine = `Swapped ${getName(before.ingredientId)} for ${name}${isAmountChanged ? `, ${formatAmount(after.amount)} ${UNIT_LABELS[after.unit]}` : ''}`;
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

const getIngredientChanges = (
  before: RecipeIngredient[],
  after: RecipeIngredient[],
  getName: (ingredientId: string) => string,
) => {
  const beforeById = new Map(before.map((line) => [line.id, line]));
  const afterById = new Map(after.map((line) => [line.id, line]));
  const changed = after.flatMap((line) => {
    const was = beforeById.get(line.id);
    return was ? getLineChanges(was, line, getName) : [];
  });
  const added = after
    .filter((line) => !beforeById.has(line.id))
    .map(
      (line) =>
        `Added ${getName(line.ingredientId)}, ${formatAmount(line.amount)} ${UNIT_LABELS[line.unit]}`,
    );
  const removed = before
    .filter((line) => !afterById.has(line.id))
    .map((line) => `Removed ${getName(line.ingredientId)}`);
  const keptBefore = before
    .filter((line) => afterById.has(line.id))
    .map((line) => line.id);
  const keptAfter = after
    .filter((line) => beforeById.has(line.id))
    .map((line) => line.id);
  const reordered =
    keptBefore.join('\u0000') === keptAfter.join('\u0000')
      ? []
      : ['Ingredients reordered'];

  return [...changed, ...added, ...removed, ...reordered];
};

const getStepChanges = (before: string[], after: string[]) => {
  if (before.join('\u0000') === after.join('\u0000')) return [];

  const isSameSet =
    before.length === after.length &&
    [...before].sort().join('\u0000') === [...after].sort().join('\u0000');
  if (isSameSet) return ['Steps reordered'];

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
    ...getIngredientChanges(was.ingredients, now.ingredients, getName),
    ...getStepChanges(was.steps, now.steps),
    ...getNutritionChanges(was.nutrition, now.nutrition),
  ];
  const hasMissedChange =
    lines.length === 0 && JSON.stringify(was) !== JSON.stringify(now);
  const result = capLines(hasMissedChange ? ['The recipe changed'] : lines);

  return result;
};
