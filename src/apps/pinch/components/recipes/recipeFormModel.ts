import { generateUuid } from '@/utils';
import {
  MAX_MINUTES,
  MAX_RECIPE_INGREDIENTS,
  NUTRITION_METRICS,
} from '@apps/pinch/constants';
import type { ExtractedRecipe } from '@apps/pinch/lib/extractRecipe';
import { matchIngredient } from '@apps/pinch/utils/ingredientMatch';
import type {
  NutritionMetric,
  NutritionValues,
  Recipe,
  ResolvedIngredient,
  Unit,
} from '@apps/pinch/types';

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
  /** What the person typed over the added-up value, per metric; blank keeps that metric derived. */
  nutrition: Record<NutritionMetric, string>;
}

export const EMPTY_NUTRITION: Record<NutritionMetric, string> = {
  calories: '',
  protein: '',
  carbs: '',
  fat: '',
};

export const getInitialData = (recipe: Recipe | null): RecipeFormData => ({
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
  nutrition: Object.fromEntries(
    NUTRITION_METRICS.map((metric) => [
      metric,
      recipe?.nutritionOverride?.[metric] != null
        ? String(recipe.nutritionOverride[metric])
        : '',
    ]),
  ) as Record<NutritionMetric, string>,
});

/** A blank recipe filled with what a reader found; names that match an ingredient are linked, the rest wait for the person to add or pick. */
export const getDataFromExtracted = (
  extracted: ExtractedRecipe,
  ingredients: ResolvedIngredient[],
): RecipeFormData => {
  const blank = getInitialData(null);
  const known = new Set<string>();
  const rows = extracted.ingredients.flatMap((line) => {
    const match = matchIngredient(line.name, ingredients);
    if (match && known.has(match.id)) {
      return [];
    }
    if (match) {
      known.add(match.id);
    }
    return [
      {
        id: generateUuid(),
        ingredientId: match?.id ?? '',
        amount: line.amount === null ? '' : String(line.amount),
        unit: line.unit ?? match?.serving.unit ?? 'EACH',
        note: line.note,
        proposedName: match ? null : line.name,
        newName: null,
      } satisfies IngredientRow,
    ];
  });

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
  };
};

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
