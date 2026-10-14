import { NEW_CHOICE } from '@/components/forms/PickOrCreate';
import { generateUuid } from '@/utils';
import { getWebLinkHost } from '@/utils/urlUtils';
import {
  MAX_MINUTES,
  MAX_RECIPE_INGREDIENTS,
  NUTRITION_METRICS,
} from '@apps/pinch/constants';
import type { ExtractedRecipe } from '@apps/pinch/lib/extractRecipe';
import { matchIngredient } from '@apps/pinch/utils/ingredientMatch';
import {
  EMPTY_CARE_TEXT,
  getCareText,
  getRecipeCare,
  type CareText,
} from '@apps/pinch/utils/recipeCare';
import { getHostSource, getRecipeSource } from '@apps/pinch/utils/sources';
import type {
  Idea,
  NutritionMetric,
  NutritionValues,
  Recipe,
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
  note: string | null;
  /** A name from the reader that no ingredient matches: shown until the person adds it as new or picks another. */
  proposedName: string | null;
  /** Set when the person chose "Add as new ingredient": it is created with the recipe. */
  newName: string | null;
}

export interface RecipeFormData {
  title: string;
  basics: { servings: number; prep: string; cook: string };
  description: string;
  ingredients: IngredientRow[];
  steps: string[];
  /** How to keep the leftovers, each part as typed; blank parts are null when saved. */
  care: CareText;
  sourceChoice: SourceChoice;
  /** What the person typed over the added-up value, per metric; blank keeps that metric derived. */
  nutrition: Record<NutritionMetric, string>;
  /** Why the recipe is being changed; becomes the tweak's note when saving records one. */
  why: string;
}

export const getInitialData = (
  recipe: Recipe | null,
  sourcesById: Map<string, Source> = new Map(),
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
    amount: String(line.amount),
    unit: line.unit,
    note: line.note ?? null,
    proposedName: null,
    newName: null,
  })),
  steps: recipe?.steps ?? [],
  care: recipe ? getCareText(getRecipeCare(recipe)) : EMPTY_CARE_TEXT,
  sourceChoice: {
    choice: recipe ? (getRecipeSource(recipe, sourcesById)?.id ?? '') : '',
    newText: '',
  },
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

/** A blank recipe filled with what a reader found; names that match an ingredient are linked, the rest wait for the person to add or pick. A second line for an ingredient already listed adds to it when the units agree and stays its own line when they don't, so no amount is lost. */
export const getDataFromExtracted = (
  extracted: ExtractedRecipe,
  ingredients: ResolvedIngredient[],
): RecipeFormData => {
  const blank = getInitialData(null);
  const rows = extracted.ingredients.reduce<IngredientRow[]>((acc, line) => {
    const match = matchIngredient(line.name, ingredients);
    const unit = line.unit ?? match?.serving.unit ?? 'EACH';
    const { amount } = line;
    const existing = match
      ? acc.find(
          (row) =>
            row.ingredientId === match.id &&
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
        ingredientId: match?.id ?? '',
        amount: amount === null ? '' : String(amount),
        unit,
        note: line.note,
        proposedName: match ? null : line.name,
        newName: null,
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
    ingredients: rows.slice(0, MAX_RECIPE_INGREDIENTS),
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
