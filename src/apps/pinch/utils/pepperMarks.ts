import { formatList } from '@/utils/formatUtils';
import type { RecipeFormData } from '@apps/pinch/components/recipes/recipeFormModel';
import { MAX_RECIPE_NOTE_LENGTH } from '@apps/pinch/constants';
import type { RevisionMarks } from '@apps/pinch/utils/pepperRevision';

const same = (a: unknown, b: unknown) =>
  JSON.stringify(a) === JSON.stringify(b);

const countOf = (n: number, one: string, many: string) =>
  n === 1 ? one : `${n} ${many}`;

/** What is still as Pepper left it: a mark ends once the person edits that item. */
export function getLiveMarks(
  marks: RevisionMarks,
  applied: RecipeFormData,
  current: RecipeFormData,
): RevisionMarks {
  const currentRows = new Map(current.ingredients.map((row) => [row.id, row]));
  const appliedRows = new Map(applied.ingredients.map((row) => [row.id, row]));
  const isRowKept = (id: string) =>
    currentRows.has(id) && same(currentRows.get(id), appliedRows.get(id));
  const live = {
    title: marks.title && current.title === applied.title,
    description:
      marks.description && current.description === applied.description,
    servings:
      marks.servings && current.basics.servings === applied.basics.servings,
    times:
      marks.times &&
      current.basics.prep === applied.basics.prep &&
      current.basics.cook === applied.basics.cook,
    categories:
      marks.categories && same(current.categories, applied.categories),
    care: marks.care && same(current.care, applied.care),
    source: marks.source && same(current.sourceChoice, applied.sourceChoice),
    collections:
      marks.collections && same(current.collections, applied.collections),
    addedIngredientIds: marks.addedIngredientIds.filter(isRowKept),
    changedIngredientIds: marks.changedIngredientIds.filter(isRowKept),
    removedIngredientNames: marks.removedIngredientNames,
    changedStepIndices: marks.changedStepIndices.filter(
      (index) =>
        current.steps[index] !== undefined &&
        current.steps[index] === applied.steps[index],
    ),
  };

  return {
    ...live,
    isEmpty:
      !live.title &&
      !live.description &&
      !live.servings &&
      !live.times &&
      !live.categories &&
      !live.care &&
      !live.source &&
      !live.collections &&
      live.addedIngredientIds.length === 0 &&
      live.changedIngredientIds.length === 0 &&
      live.changedStepIndices.length === 0,
  };
}

/** What a change did, to follow the name: "changed 2 ingredients and a step". */
export function describePepperChange(marks: RevisionMarks) {
  const ingredientCount =
    marks.addedIngredientIds.length + marks.changedIngredientIds.length;
  const stepCount = marks.changedStepIndices.length;
  const changed = [
    marks.title && 'the title',
    marks.description && 'the description',
    marks.servings && 'the servings',
    marks.times && 'the times',
    marks.categories && 'the categories',
    marks.care && 'how it keeps',
    marks.source && "where it's from",
    marks.collections && 'the collections',
    ingredientCount > 0 &&
      countOf(ingredientCount, 'an ingredient', 'ingredients'),
    stepCount > 0 && countOf(stepCount, 'a step', 'steps'),
  ].filter((part): part is string => part !== false);
  if (changed.length > 0) return `changed ${formatList(changed)}`;
  const removedCount = marks.removedIngredientNames.length;

  return `took out ${countOf(removedCount, 'an ingredient', 'ingredients')}`;
}

/** The reason a save starts with when the person asked Pepper for the change. */
export function getPepperReason(asks: string[]) {
  if (asks.length === 0) return null;
  const text = `Asked Pepper: ${asks.join('; ')}`;

  return text.length > MAX_RECIPE_NOTE_LENGTH
    ? `${text.slice(0, MAX_RECIPE_NOTE_LENGTH - 1)}…`
    : text;
}
