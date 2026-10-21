export type PinchTab = 'calendar' | 'recipes' | 'kitchen' | 'shopping';

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
  /** @deprecated Icons were removed from the app. Existing documents may carry a value; new ones write null. */
  iconKey: string | null;
  nutritionPer100g: NutritionValues | null;
  servingAmount: number | null;
  servingUnit: Unit | null;
  /** Density, bridging mass and volume. */
  gramsPerMl: number | null;
  /** Weight of one, bridging mass and count. */
  gramsEach: number | null;
  /** The product that prices this ingredient; a product's own document is the source of truth, so a missing or stale id reads as "the first product". Documents written before products existed lack the key. */
  defaultProductId: string | null;
  /** Hidden from lists and pickers but still resolving for the planned days and recipes that use it; only a custom ingredient is ever archived. Documents written before archiving lack the key, which reads as false. */
  isArchived: boolean;
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
  per100g: NutritionValues;
  serving: { amount: number; unit: Unit };
  gramsPerMl: number | null;
  gramsEach: number | null;
  isCustom: boolean;
  /** A catalog ingredient the person changed. */
  isAdjusted: boolean;
  /** Hidden from lists and pickers, still resolved for what uses it. */
  isArchived: boolean;
}

export interface ResolvedFamily {
  id: string;
  name: string;
  isCustom: boolean;
}

export interface NutritionSwitches {
  calories: boolean;
  protein: boolean;
  carbs: boolean;
  fat: boolean;
}

/** The kitchen document: what the person has switched on and which nudges they closed. Created by their first change. */
export interface KitchenSettings {
  /** Immutable. */
  uid: string;
  showNutrition: NutritionSwitches;
  /** `"{GapKind}:{ingredientId}"` to when it was closed. */
  dismissedNudges: Record<string, number>;
  /** Immutable. */
  createdAt: number;
  updatedAt: number;
}

export type MealType =
  'BREAKFAST' | 'LUNCH' | 'DINNER' | 'SNACK' | 'DESSERT' | 'DRINK';
export type ItemKind = 'RECIPE' | 'INGREDIENT';

/** One row of a meal: a recipe or an ingredient, and how many servings of it. */
export interface MealItem {
  id: string;
  kind: ItemKind;
  /** A recipe id or an ingredient id. */
  refId: string;
  /** Above zero; halves allowed. */
  servings: number;
}

/** A meal worth eating again: a name and its items, copied onto a day when planned. */
export interface Meal {
  id: string;
  name: string;
  items: MealItem[];
  createdAt: number;
  updatedAt: number;
}

/** What a past meal cost, written when its day passed so later price changes don't rewrite history. */
export interface PlannedSnapshot {
  frozenAt: number;
  /** When the person asked for the day to be priced again; null for the snapshot written when the day passed. Older snapshots lack the key. */
  repricedAt: number | null;
  costCents: number | null;
  /** The ingredients the cost left out, so a day or month still names them. */
  leftOut: Gap[];
  nutrition: NutritionValues;
  lines: { itemId: string; costCents: number | null }[];
}

/** A meal on a day: its own copy of the items, so editing a saved meal never touches planned days. */
export interface PlannedMeal {
  id: string;
  /** UTC midnight of the planned day (a date-only value). */
  date: number;
  mealType: MealType;
  /** The saved meal's name when it came from one. */
  name: string | null;
  sourceMealId: string | null;
  items: MealItem[];
  /** Every recipe and ingredient id in `items`, for the "in use" check. */
  refIds: string[];
  snapshot: PlannedSnapshot | null;
  createdAt: number;
  updatedAt: number;
}

export type KitchenView = 'yours' | 'all';
export type GapKind = 'NO_PRODUCT' | 'NOT_COMPARABLE' | 'NO_NUTRITION';
export type NutritionMetric = keyof NutritionValues;
export type RecipesView = 'recipes' | 'meals' | 'ideas';

export type RecipeStartMethod = 'text' | 'file' | 'link' | 'manual';

export type IdeaKind = 'LINK' | 'PHOTO' | 'TEXT';

export type IdeaStartMethod = 'link' | 'photo' | 'text';

/** A full-page screen that takes over the app; the tabs stay mounted underneath. */
export type PinchSubview =
  | { kind: 'stores' }
  | { kind: 'products' }
  | { kind: 'sources' }
  /** The way a new recipe already chose to begin; without one it opens on the list of ways. */
  | {
      kind: 'recipe';
      id: string | null;
      method?: RecipeStartMethod;
      /** Opened from the phone's start drawer, which a way's back button raises again. */
      fromDrawer?: boolean;
      fromIdeaId?: string;
      /** The note the form was opened from: shown as a quote, never changed by the save. */
      fromNoteId?: string;
      /** Opened from the calendar's empty state, whose screen shows no new row afterwards, so saving says what was added. */
      fromCalendar?: boolean;
    }
  /** Cooking one recipe step by step; it starts at the recipe's own servings unless `servings` says otherwise. A `plannedMealId` makes Finish mark that planned meal's cook. */
  | {
      kind: 'cook';
      recipeId: string;
      servings?: number;
      plannedMealId?: string;
    }
  | {
      kind: 'plan';
      dayKey: string;
      mealType: MealType | null;
      /** The planned meal being changed; null plans a new one. */
      plannedMealId: string | null;
      /** A saved meal whose items start the plate. */
      fromMealId: string | null;
      /** A recipe that starts the plate. */
      fromRecipeId: string | null;
    }
  | { kind: 'meal'; id: string | null };

export interface CatalogStore {
  /** `cat-store-` plus the slug; also the document id of the person's own copy. */
  id: string;
  name: string;
  /** The website the logo is looked up by; nothing else leaves the app. */
  domain: string;
}

/** A shop the person buys from: a well-known one they picked (its id is the catalog id) or one they added. */
export interface Store {
  id: string;
  name: string;
  /** Immutable; null for a store the person added. */
  catalogStoreId: string | null;
  /** Storage path of the person's own image. */
  imagePath: string | null;
  /** Hidden from lists and pickers once products point at it, still named on them. Documents written before archiving lack the key, which reads as false. */
  isArchived: boolean;
  createdAt: number;
  updatedAt: number;
}

/** What a person buys: an ingredient at a store, with a price for a package size. Recipes never name one; they only feed cost. */
export interface Product {
  id: string;
  /** Immutable. */
  ingredientId: string;
  storeId: string;
  /** The brand or pack name ("Great Value"). */
  label: string | null;
  priceCents: number;
  sizeAmount: number;
  sizeUnit: Unit;
  /** https only. */
  url: string | null;
  createdAt: number;
  updatedAt: number;
}

/** How a recipe draft was made. Not where it came from: that is a `Source`, named by `Recipe.sourceId`. */
export type RecipeSource = 'MANUAL' | 'AI_TEXT' | 'AI_FILE' | 'AI_LINK';

/** Where the person gets recipes from (a site, a cookbook, a relative), in their own words. */
export interface Source {
  id: string;
  /** Trimmed, 1 to 80 characters, and different from every other source's label ignoring case. */
  label: string;
  createdAt: number;
  updatedAt: number;
}

/** One thing to buy: an ingredient in one unit, so adding it again merges into it. */
export interface ShoppingItem {
  /** Immutable. */
  id: string;
  /** Immutable. */
  ingredientId: string;
  /** Above zero, at most 1,000,000, two decimals. */
  amount: number;
  /** Immutable: a different unit is a different item. */
  unit: Unit;
  isChecked: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface Idea {
  id: string;
  kind: IdeaKind;
  title: string;
  note: string | null;
  /** http(s) only. */
  url: string | null;
  siteName: string | null;
  /** https only: the page's own picture, a third party's address. */
  imageUrl: string | null;
  photoPath: string | null;
  /** The recipe this became. A missing key, an id no recipe has, or an archived recipe reads as not made yet. */
  recipeId: string | null;
  createdAt: number;
  updatedAt: number;
}

/** A record that a recipe was made: when, and at how many servings. */
export interface Cook {
  /** Immutable. `{plannedMealId}__{recipeId}` for a cook marked from a planned meal, a UUID otherwise. */
  id: string;
  /** Immutable. A recipe that no longer exists reads as none: its cooks are ignored. */
  recipeId: string;
  /** Immutable. The planned meal it was marked from, else null. */
  plannedMealId: string | null;
  /** Above zero, at most 1,000. */
  servings: number;
  /** An instant, shown in local time. */
  cookedAt: number;
  /** Immutable. */
  createdAt: number;
  updatedAt: number;
}

export type NoteKind = 'NOTE' | 'TWEAK';

/** One entry in a recipe's journal: something to remember after cooking, or the record of an edit to the recipe. */
export interface RecipeNote {
  /** Immutable. */
  id: string;
  /** Immutable. A recipe that no longer exists reads as none: its notes are ignored. */
  recipeId: string;
  /** Immutable. */
  kind: NoteKind;
  /** A NOTE always has it; a TWEAK's is the optional reason for the change. 1 to 2,000 characters when set. */
  text: string | null;
  /** A TWEAK's short summaries of what the edit changed, fixed when it was saved; empty for a NOTE. Immutable. */
  changes: string[];
  /** Immutable. The cook this follows up; a cook that no longer exists reads as none. */
  cookId: string | null;
  /** An instant, shown in local time. Immutable. */
  createdAt: number;
  updatedAt: number;
}

export type ShoppingRequest =
  | { kind: 'recipe'; recipeId: string }
  | { kind: 'items'; items: MealItem[]; label: string };

/** One line of a recipe: it names the ingredient and an amount, never a store or product. */
export interface RecipeIngredient {
  /** A row id, so edits and reordering keep stable keys. */
  id: string;
  ingredientId: string;
  amount: number;
  unit: Unit;
  note: string | null;
}

export interface RecipeCare {
  fridgeDays: number | null;
  freezerDays: number | null;
  reheat: string | null;
  tip: string | null;
}

export interface Recipe {
  id: string;
  title: string;
  description: string | null;
  servings: number;
  prepMinutes: number | null;
  cookMinutes: number | null;
  /** Storage path of the cover image. */
  coverPath: string | null;
  ingredients: RecipeIngredient[];
  steps: string[];
  /** Per serving; a null metric falls back to the value added up from the ingredients. */
  nutritionOverride: NutritionValues | null;
  source: RecipeSource;
  /** The `Source` it came from. A missing key (recipes written before sources) or an id no source has reads as no source. */
  sourceId: string | null;
  /** A recipe written before care lacks the key, which reads as null. */
  care: RecipeCare | null;
  /** Hidden from lists and pickers once a planned day or saved meal uses it, still resolved there. Documents written before archiving lack the key, which reads as false. */
  isArchived: boolean;
  createdAt: number;
  updatedAt: number;
}

/** What leaves a number short: an ingredient with no product to price it, or an amount that can't be compared with its package size. */
export interface Gap {
  kind: GapKind;
  ingredientId: string;
}

export interface LineCost {
  /** Unrounded cents, or null when the line couldn't be priced. */
  cents: number | null;
  gap: Gap | null;
}

export interface RecipeCost {
  /** Unrounded cents of the lines that could be priced; null when none could. */
  totalCents: number | null;
  perServingCents: number | null;
  /** One entry per ingredient and kind that is missing from the total. */
  leftOut: Gap[];
  lines: Map<string, LineCost>;
}

export type CookView = 'steps' | 'ingredients';
