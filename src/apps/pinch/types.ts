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

export type Dimension = 'MASS' | 'VOLUME' | 'COUNT';

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

/** The person's own record for an ingredient: a custom one, or a catalog one they adjusted (its id is then the catalog id). */
export interface IngredientRecord {
  id: string;
  /** Immutable; null for a custom ingredient. */
  catalogId: string | null;
  /** Required for a custom ingredient; null on an adjusted catalog one means "use the catalog name". */
  name: string | null;
  /** A catalog family id (`cat-fam-…`) or a `Family` id; null leaves a catalog ingredient where it is, and puts a custom one on its own. */
  familyId: string | null;
  iconKey: string | null;
  nutritionPer100g: NutritionValues | null;
  servingAmount: number | null;
  servingUnit: Unit | null;
  /** Density, bridging mass and volume. */
  gramsPerMl: number | null;
  /** Weight of one, bridging mass and count. */
  gramsEach: number | null;
  createdAt: number;
  updatedAt: number;
}

/** Only the person's own families live in Firestore; the catalog's are constants. */
export interface Family {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
}

/** What screens read: the catalog entry overlaid by the person's record, or a custom record on its own. Never stored. */
export interface ResolvedIngredient {
  id: string;
  name: string;
  familyId: string | null;
  aliases: string[];
  iconKey: string | null;
  per100g: NutritionValues;
  serving: { amount: number; unit: Unit };
  gramsPerMl: number | null;
  gramsEach: number | null;
  isCustom: boolean;
  /** A catalog ingredient the person changed. */
  isAdjusted: boolean;
}

export interface ResolvedFamily {
  id: string;
  name: string;
  isCustom: boolean;
}

export type KitchenView = 'yours' | 'all';
