export type PinchTab = 'calendar' | 'recipes' | 'kitchen';

export type Unit =
  | 'G'
  | 'KG'
  | 'OZ'
  | 'LB'
  | 'ML'
  | 'L'
  | 'TSP'
  | 'TBSP'
  | 'CUP'
  | 'FL_OZ'
  | 'PINCH'
  | 'EACH';

export interface NutritionValues {
  calories: number | null;
  protein: number | null;
  carbs: number | null;
  fat: number | null;
}

export interface CatalogFamily {
  id: string;
  name: string;
}

export interface CatalogIngredient {
  /** `cat-` plus the slug; the id a person's records and recipes refer to. */
  id: string;
  name: string;
  familyId: string | null;
  /** Other names people search by or write in a recipe. */
  aliases: string[];
  per100g: { calories: number; protein: number; carbs: number; fat: number };
  /** A sensible "1 serving". */
  serving: { amount: number; unit: Unit };
  gramsPerMl: number | null;
  gramsEach: number | null;
  /** The vendored icon's file name (without `.svg`), or null for the jar glyph. */
  iconKey: string | null;
}
