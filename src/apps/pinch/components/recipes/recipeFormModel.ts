import { NEW_CHOICE } from '@/components/forms/PickOrCreate';
import { generateUuid } from '@/utils';
import { clipAtWord } from '@/utils/stringUtils';
import { getWebLinkHost } from '@/utils/urlUtils';
import {
  MAX_MINUTES,
  MAX_NOTE_LENGTH,
  MAX_RECIPE_INGREDIENTS,
  MAX_SERVING_AMOUNT,
  NUTRITION_METRICS,
} from '@apps/pinch/constants';
import type { ExtractedRecipe } from '@apps/pinch/lib/extractRecipe';
import {
  cleanGroupName,
  getGroupKey,
  orderIngredientLines,
} from '@apps/pinch/utils/ingredientGroups';
import {
  EMPTY_COLLECTIONS_CHOICE,
  getInitialCollectionsChoice,
  type CollectionsChoice,
} from '@apps/pinch/utils/collections';
import { addPrepToNote, splitPrep } from '@apps/pinch/utils/ingredientNames';
import { findNearMatches } from '@apps/pinch/utils/catalogSearch';
import {
  normalizeName,
  resolveReadName,
} from '@apps/pinch/utils/ingredientMatch';
import {
  EMPTY_CARE_TEXT,
  getCareText,
  getRecipeCare,
  type CareText,
} from '@apps/pinch/utils/recipeCare';
import {
  getLinksText,
  getRecipeLinks,
  type LinksText,
} from '@apps/pinch/utils/recipeLinks';
import { getHostSource, getRecipeSource } from '@apps/pinch/utils/sources';
import type {
  Collection,
  Idea,
  NutritionMetric,
  NutritionValues,
  Recipe,
  RecipeIngredient,
  RecipeSource,
  ResolvedIngredient,
  Source,
  Unit,
} from '@apps/pinch/types';

/** Where a recipe is from, as the form's picker reports it: a source id, `NEW_CHOICE` with the label typed, or `''` for none. */
export interface SourceChoice {
  choice: string;
  newText: string;
}

const NO_SOURCE_CHOICE: SourceChoice = { choice: '', newText: '' };

export interface IngredientRow {
  id: string;
  /** Empty while the reader's name hasn't been resolved to an ingredient yet. */
  ingredientId: string;
  amount: string;
  unit: Unit;
  /** No amount by choice ("to taste", "a handful"): the note says how much, if anything, and the line saves without one. */
  isAmountless: boolean;
  note: string | null;
  /** A name from the reader that no ingredient matches: shown until the person adds it as new or picks another. */
  proposedName: string | null;
  /** Set when the person chose "Add as new ingredient": it is created with the recipe. */
  newName: string | null;
  /** The heading it sits under, or null; rows are kept in the order the list shows them, so the saved order is the shown one. */
  group: string | null;
}

export interface RecipeFormData {
  title: string;
  basics: { servings: number; prep: string; cook: string };
  description: string;
  ingredients: IngredientRow[];
  steps: string[];
  care: CareText;
  links: LinksText;
  sourceChoice: SourceChoice;
  collections: CollectionsChoice;
  /** What the person typed over the added-up value, per metric; blank keeps that metric derived. */
  nutrition: Record<NutritionMetric, string>;
  /** Why the recipe is being changed; becomes the tweak's note when saving records one. */
  why: string;
}

export const getInitialData = (
  recipe: Recipe | null,
  sourcesById: Map<string, Source> = new Map(),
  collections: readonly Collection[] = [],
): RecipeFormData => ({
  title: recipe?.title ?? '',
  basics: {
    servings: recipe?.servings ?? 4,
    prep: recipe?.prepMinutes != null ? String(recipe.prepMinutes) : '',
    cook: recipe?.cookMinutes != null ? String(recipe.cookMinutes) : '',
  },
  description: recipe?.description ?? '',
  ingredients: (recipe?.ingredients ?? []).map((line) => ({
    id: line.id,
    ingredientId: line.ingredientId,
    amount: line.amount === null ? '' : String(line.amount),
    unit: line.unit,
    isAmountless: line.amount === null,
    note: line.note ?? null,
    proposedName: null,
    newName: null,
    group: cleanGroupName(line.group),
  })),
  steps: recipe?.steps ?? [],
  care: recipe ? getCareText(getRecipeCare(recipe)) : { ...EMPTY_CARE_TEXT },
  links: getLinksText(recipe ? getRecipeLinks(recipe) : []),
  sourceChoice: {
    choice: recipe ? (getRecipeSource(recipe, sourcesById)?.id ?? '') : '',
    newText: '',
  },
  collections: recipe
    ? getInitialCollectionsChoice(recipe, collections)
    : EMPTY_COLLECTIONS_CHOICE,
  nutrition: Object.fromEntries(
    NUTRITION_METRICS.map((metric) => [
      metric,
      recipe?.nutritionOverride?.[metric] != null
        ? String(recipe.nutritionOverride[metric])
        : '',
    ]),
  ) as Record<NutritionMetric, string>,
  why: '',
});

const clipNote = (note: string | null) =>
  note === null ? null : clipAtWord(note, MAX_NOTE_LENGTH);

/** A blank recipe filled with what a reader found; names that match an ingredient are linked, the rest wait for the person to add or pick, cased like the app's own names with prep words such as "bone-in" moved to the line's note. A second line for an ingredient already listed under the same heading adds to it when the units agree and stays its own line when they don't, so no amount is lost; under another heading it is always its own line. A line the recipe gives no amount ("salt to taste") keeps none. */
export const getDataFromExtracted = (
  extracted: ExtractedRecipe,
  ingredients: ResolvedIngredient[],
): RecipeFormData => {
  const blank = getInitialData(null);
  const rows = extracted.ingredients.reduce<IngredientRow[]>((acc, line) => {
    const { resolution, leftover } = resolveReadName(
      line.name,
      line.alsoCalled,
      ingredients,
    );
    const match = resolution.kind === 'match' ? resolution.option : null;
    const { prep } = splitPrep(line.name);
    const newName =
      resolution.kind === 'custom' &&
      findNearMatches(ingredients, resolution.label).length === 0
        ? resolution.label
        : null;
    const stagedId =
      newName === null
        ? null
        : (acc.find(
            (row) =>
              row.newName !== null &&
              normalizeName(row.newName) === normalizeName(newName),
          )?.ingredientId ?? generateUuid());
    const unit = line.unit ?? match?.serving.unit ?? 'EACH';
    const { amount } = line;
    const group = cleanGroupName(line.group);
    const existing = match
      ? acc.find(
          (row) =>
            row.ingredientId === match.id &&
            getGroupKey(row.group) === getGroupKey(group) &&
            row.unit === unit &&
            row.amount.trim() !== '' &&
            amount !== null,
        )
      : undefined;
    if (existing && amount !== null) {
      return acc.map((row) =>
        row === existing
          ? { ...row, amount: String(Number(row.amount) + amount) }
          : row,
      );
    }

    return [
      ...acc,
      {
        id: generateUuid(),
        ingredientId: match?.id ?? stagedId ?? '',
        amount: amount === null ? '' : String(amount),
        unit,
        isAmountless: amount === null,
        note: clipNote(
          addPrepToNote(line.note, leftover ? [...prep, leftover] : prep),
        ),
        proposedName:
          resolution.kind === 'custom' && newName === null
            ? resolution.label
            : null,
        newName,
        group,
      },
    ];
  }, []);

  return {
    ...blank,
    title: extracted.title ?? '',
    basics: {
      servings: extracted.servings ?? blank.basics.servings,
      prep: extracted.prepMinutes === null ? '' : String(extracted.prepMinutes),
      cook: extracted.cookMinutes === null ? '' : String(extracted.cookMinutes),
    },
    description: extracted.description ?? '',
    ingredients: orderIngredientLines(rows).slice(0, MAX_RECIPE_INGREDIENTS),
    steps: extracted.steps,
    care: getCareText(extracted.care),
  };
};

const getSiteSourceChoice = (
  label: string,
  sources: Source[],
): SourceChoice => {
  const { existing, label: site } = getHostSource(label, sources);
  if (existing) return { choice: existing.id, newText: '' };
  return site === '' ? NO_SOURCE_CHOICE : { choice: NEW_CHOICE, newText: site };
};

/** What a reading starts the source on: for a link, the site's own source (made on save if there isn't one yet); a pasted text or a file names no place. */
export const getReadSourceChoice = (
  source: RecipeSource,
  label: string,
  sources: Source[],
): SourceChoice =>
  source === 'AI_LINK' ? getSiteSourceChoice(label, sources) : NO_SOURCE_CHOICE;

export const getDataFromIdea = (
  idea: Idea,
  sources: Source[],
): RecipeFormData => ({
  ...getInitialData(null),
  title: idea.title,
  description: idea.note ?? '',
  sourceChoice:
    idea.kind === 'LINK' && idea.url
      ? getSiteSourceChoice(getWebLinkHost(idea.url) ?? '', sources)
      : NO_SOURCE_CHOICE,
});

/** Whether a row's amount can be saved: a number above zero and within the cap, or no amount by choice. */
export const isRowAmountValid = (row: IngredientRow) => {
  if (row.isAmountless) return true;
  const amount = Number(row.amount);
  return (
    row.amount.trim() !== '' &&
    Number.isFinite(amount) &&
    amount > 0 &&
    amount <= MAX_SERVING_AMOUNT
  );
};

/** The line a row saves as; one with no amount by choice saves none, in `EACH`. */
export const toRecipeLine = (row: IngredientRow): RecipeIngredient => ({
  id: row.id,
  ingredientId: row.ingredientId,
  amount: row.isAmountless ? null : Number(row.amount),
  unit: row.isAmountless ? 'EACH' : row.unit,
  note: row.note,
  group: cleanGroupName(row.group),
});

const parseTyped = (text: string) => (text.trim() === '' ? null : Number(text));

export const parseMinutes = parseTyped;

export const isValidMinutes = (value: number | null) =>
  value === null ||
  (Number.isInteger(value) && value >= 0 && value <= MAX_MINUTES);

export const isValidNutrition = (values: Record<NutritionMetric, string>) =>
  NUTRITION_METRICS.every((metric) => {
    const value = parseTyped(values[metric]);
    return (
      value === null ||
      (Number.isFinite(value) && value >= 0 && value <= 100000)
    );
  });

/** The typed-over nutrition as per-serving values, a blank metric staying derived; null when nothing was typed. */
export const parseNutrition = (
  values: Record<NutritionMetric, string>,
): NutritionValues | null => {
  const parsed = Object.fromEntries(
    NUTRITION_METRICS.map((metric) => [metric, parseTyped(values[metric])]),
  ) as unknown as NutritionValues;
  return Object.values(parsed).every((value) => value === null) ? null : parsed;
};
