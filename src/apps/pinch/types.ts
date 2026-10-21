export type PinchTab =
  | 'calendar'
  | 'recipes'
  | 'kitchen'
  | 'shopping'
  | 'settings';

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

/** What Pinch can remind a person about. Each kind is a switch under `PinchSettings.reminders`. */
export type ReminderKind = 'eatSoon' | 'expiring' | 'timers';

export interface PinchReminderSettings {
  /** The morning note naming what is due or past its date. */
  eatSoon: boolean;
  /** The same note also naming the packages in the pantry that are past their date or about to be. Documents written before it lack the key, which reads as false. */
  expiring: boolean;
  /** A push when a cooking timer ends, for when the screen is off. */
  timers: boolean;
  /** How many days ahead a box counts as due, 1 to 3. */
  leadDays: number;
  /** The local hour, 0 to 23, the morning note goes out. */
  hour: number;
  /** The zone `hour` is in, written by the device that set it; null reads as UTC. */
  timeZone: string | null;
}

/** What a person chose for hands-free cooking, saved with the account so it follows them to another device. A key is null until they have chosen on any device, and then this device's own earlier choice (kept in localStorage before these were saved) still stands. The natural voice's switch is not here: its download is per device. */
export interface PinchVoiceSettings {
  /** Said yes to the voice explainer (who hears the audio, that nothing is kept). The browser still asks for the microphone on each device. */
  hasAgreed: boolean | null;
  /** Read each step aloud while the microphone is on. */
  isReadingAloud: boolean | null;
  /** Wait for the wake phrase instead of listening for one window per tap. */
  isWaiting: boolean | null;
}

/** The person's own choices, at `apps/pinch/settings/{uid}`: reminders, how long a new box keeps and whether the Calendar draws its stat tiles. Created the first time Pinch opens with the defaults, or by their first change. `KitchenSettings` is the older document that holds the list switches and closed nudges. */
export interface PinchSettings {
  /** Days a box starts with in the fridge; null is the built-in number. */
  fridgeDays: number | null;
  /** Days a box starts with in the freezer; null is the built-in number. */
  freezerDays: number | null;
  /** Whether a new recipe's Photo drawer searches the web with its title for pictures to pick. A document written before this key lacks it, which reads as true. */
  suggestPhotos: boolean;
  /** Whether the Calendar draws its stat tiles (the total, the averages and the daily nutrition) above the week or month. Saved with the account, so it follows the person to another device. A document written before this key lacks it, which reads as false. */
  calendarStats: boolean;
  /** Hands-free cooking choices. A document written before this key lacks it, which reads as every choice not made yet. */
  voice: PinchVoiceSettings;
  reminders: PinchReminderSettings;
  updatedAt: number;
  /** The local day (`YYYY-MM-DD`, in `reminders.timeZone`) the morning note last went out; only the scheduled Function writes it. */
  lastDigestDay: string | null;
}

export type MealType =
  'BREAKFAST' | 'LUNCH' | 'DINNER' | 'SNACK' | 'DESSERT' | 'DRINK';
export type ItemKind = 'RECIPE' | 'INGREDIENT';

/** What kind of dish a recipe or saved meal is. A dish can be several (a smoothie is a drink and breakfast); none is the normal start. */
export type DishCategory =
  | 'BREAKFAST'
  | 'MAIN'
  | 'SIDE'
  | 'SOUP_SALAD'
  | 'SNACK'
  | 'DESSERT'
  | 'BAKING'
  | 'DRINK'
  | 'SAUCE';

/** The sorts a Recipes view offers; `default` keeps the view's own order. */
export type ListSortKey = 'default' | 'created' | 'edited' | 'alpha';

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
  /** Starred by the person: favorites list first. Meals written before favorites lack the key, which reads as false. */
  isFavorite: boolean;
  /** The kinds of dish it is. Meals written before categories lack the key, which reads as empty; a value outside the list is ignored. */
  categories: DishCategory[];
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
export type ShoppingHalf = 'toBuy' | 'got';
export type ShoppingView = ShoppingHalf | 'all';

export type RecipeStartMethod = 'text' | 'file' | 'link' | 'manual';

export type IdeaKind = 'LINK' | 'PHOTO' | 'TEXT';

export type IdeaStartMethod = 'link' | 'photo' | 'text';

/** A full-page screen that takes over the app; the tabs stay mounted underneath. */
export type PinchSubview =
  /** Stores & prices: every price grouped under the store it is at, and the stores themselves. */
  | { kind: 'products' }
  | { kind: 'sources' }
  /** Every link the person shared, to copy, update or stop; back returns to the screen it was opened from. */
  | { kind: 'shares' }
  /** The ingredients the person has on hand, grouped, each package with its own amount and date; `ingredientId` opens that ingredient's packages first. */
  | { kind: 'pantry'; ingredientId?: string }
  /** Fridge & freezer; `place` is the one a door named, shown first. */
  | {
      kind: 'containers';
      recipeId?: string;
      mealId?: string;
      place?: ContainerPlace;
    }
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
  /** Cooking step by step, at each recipe's own servings; `servings` is what a plan has for tonight (it starts there only when that is more), and a `plannedMealId` makes Finish mark that planned meal's cooks. */
  | {
      kind: 'cook';
      recipeId: string;
      servings?: number;
      plannedMealId?: string;
      /** A planned plate's recipes cooked in one session, in plate order, `recipeId` first; absent for one recipe. */
      plate?: PlateCookRecipe[];
      /** Where a saved session left off, when the screen opens to pick it up. */
      resume?: CookingResume;
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

/** A named set of recipes the person made ("Bulk", "High-protein"); a recipe names the ones it is in by `collectionIds`. */
export interface Collection {
  id: string;
  /** Trimmed, 1 to 40 characters, and different from every other collection's label ignoring case, spaces and hyphens. */
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
  /** Above zero, at most 1,000,000, two decimals; null for a line that is just the name ("Parsley"), which is always in `EACH`. */
  amount: number | null;
  /** Immutable: a different unit is a different item. */
  unit: Unit;
  isChecked: boolean;
  /** What put it on the list: planned meal ids, `recipe:<id>` and `meal:<id>`, oldest first, at most 60; empty for something added on the list itself. Documents written before sources lack the key, which reads as empty. */
  sources: string[];
  /** An instant: the line's `updatedAt` as it was put in the pantry. It counts as put away only while `updatedAt` still equals this, so ticking, unticking or editing it again offers it once more. Documents written before this lack the key, which reads as null. */
  pantryAddedAt: number | null;
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

export type ContainerPlace = 'FRIDGE' | 'FREEZER';
export type ContainerStatus = 'IN_STOCK' | 'DONE';
export type ContainerEventKind =
  'MADE' | 'FRIDGE' | 'FREEZE' | 'THAW' | 'EAT' | 'TOSS' | 'CLEAR' | 'EDIT';

export interface ContainerEvent {
  kind: ContainerEventKind;
  /** An instant. */
  at: number;
  servings: number | null;
  /** Set for FRIDGE, FREEZE and THAW, else null. */
  place: ContainerPlace | null;
  note: string | null;
}

export interface Container {
  id: string;
  title: string;
  /** Immutable. */
  recipeId: string | null;
  /** Immutable; never set together with `recipeId`. */
  mealId: string | null;
  /** Immutable. */
  cookId: string | null;
  /** A finished container keeps the portions it ended with. */
  servings: number;
  status: ContainerStatus;
  place: ContainerPlace;
  /** Date-only: UTC midnight. */
  eatBy: number;
  /** Oldest first, capped. */
  history: ContainerEvent[];
  /** Immutable. */
  createdAt: number;
  updatedAt: number;
}

export type PackagePlace = 'PANTRY' | 'FRIDGE' | 'FREEZER';
export type PackageStatus = 'IN_STOCK' | 'DONE';
export type PackageEventKind = 'ADDED' | 'USED' | 'MOVED' | 'TOSSED' | 'EDITED';

export interface PackageEvent {
  kind: PackageEventKind;
  /** An instant. */
  at: number;
  /** What was added, used or tossed, in the package's unit at the time; null for a move or an edit. */
  amount: number | null;
  /** Set for ADDED and MOVED, else null. */
  place: PackagePlace | null;
  note: string | null;
}

/** One physical thing the person has: a bag of rice, a carton of milk. Two cartons of one ingredient are two packages. */
export interface Package {
  id: string;
  /** Immutable. */
  ingredientId: string;
  /** The ingredient's name when this was last saved, for the morning note, which can't read the catalog; screens read the live name by `ingredientId`. */
  ingredientName: string;
  /** The pack it is, which can fill in its size. A product that is gone reads as none. */
  productId: string | null;
  /** What is left, in `unit`. A finished package keeps the amount it had when it ended. */
  amount: number;
  unit: Unit;
  place: PackagePlace;
  /** Date-only: UTC midnight of the last day to use it. Null is no date known, never a guess. */
  expiresAt: number | null;
  /** An instant: when it was first used from. */
  openedAt: number | null;
  status: PackageStatus;
  /** Oldest first, capped. */
  history: PackageEvent[];
  /** Immutable. */
  createdAt: number;
  updatedAt: number;
}

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
  | { kind: 'items'; items: MealItem[]; label: string; mealId?: string | null }
  /** One day's planned meals, each remembered as what put its lines on the list. */
  | { kind: 'day'; dayKey: string }
  /** Planned days, both ends included (one day has the same start and end); the days before today are left out. */
  | { kind: 'range'; startKey: string; endKey: string };

/** One line of a recipe: it names the ingredient and an amount, never a store or product. */
export interface RecipeIngredient {
  /** A row id, so edits and reordering keep stable keys. */
  id: string;
  ingredientId: string;
  /** Null for a line with no amount ("salt to taste"), whose note says how much: it never scales and is left out of cost and nutrition without being a gap. Written with `EACH` as its unit. */
  amount: number | null;
  unit: Unit;
  note: string | null;
  /** The heading the line sits under ("For the sauce"), or null for none; one ingredient may have a line in several groups. Lines written before groups lack the key, which reads as null. */
  group: string | null;
}

export interface RecipeCare {
  fridgeDays: number | null;
  freezerDays: number | null;
  reheat: string | null;
  tip: string | null;
}

/** What a recipe link is for. At most one recipe link is a `HOW_TO`, the primary how-to video. */
export type RecipeLinkKind =
  'HOW_TO' | 'ARTICLE' | 'ORIGINAL' | 'TECHNIQUE' | 'OTHER';

export interface RecipeLink {
  id: string;
  kind: RecipeLinkKind;
  /** The person's own label; null shows the kind's default. */
  label: string | null;
  /** An http(s) address, trimmed. */
  url: string;
}

/** One picture the photo search found: both addresses are https. The thumbnail is what the grid loads; the full picture is loaded only once the person picks it. */
export interface WebPhoto {
  thumbUrl: string;
  imageUrl: string;
  title: string;
  /** The site the picture was found on, without `www.`. */
  host: string;
}

export interface Recipe {
  id: string;
  title: string;
  description: string | null;
  servings: number;
  prepMinutes: number | null;
  cookMinutes: number | null;
  /** Storage path of the cover image the person uploaded. A recipe has at most one of `coverPath` and `coverUrl`. */
  coverPath: string | null;
  /** The https address of a cover picked from the web search: the picture stays on its own site and may stop loading. A recipe written before web covers lacks the key, which reads as null. */
  coverUrl: string | null;
  ingredients: RecipeIngredient[];
  steps: string[];
  /** Per serving; a null metric falls back to the value added up from the ingredients. */
  nutritionOverride: NutritionValues | null;
  source: RecipeSource;
  /** The `Source` it came from. A missing key (recipes written before sources) or an id no source has reads as no source. */
  sourceId: string | null;
  /** A recipe written before care lacks the key, which reads as null. */
  care: RecipeCare | null;
  /** The `Collection`s it is in, at most 20. A recipe written before collections lacks the key, which reads as empty; an id no collection has is ignored. */
  collectionIds: string[];
  /** The kinds of dish it is. A recipe written before categories lacks the key, which reads as empty; a value outside the list is ignored. */
  categories: DishCategory[];
  /** A recipe written before links lacks the key, which reads as `[]`. */
  links: RecipeLink[];
  /** Hidden from lists and pickers once a planned day or saved meal uses it, still resolved there. Documents written before archiving lack the key, which reads as false. */
  isArchived: boolean;
  /** Starred by the person: favorites list first. Recipes written before favorites lack the key, which reads as false; only the star writes it. */
  isFavorite: boolean;
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

/** A recipe of a planned plate that cooking holds, with what the plan has for it tonight. */
export interface PlateCookRecipe {
  recipeId: string;
  servings: number;
}

/** A cooking timer as it is saved on this device: a wall-clock deadline while running, what was left while paused, when it rang once done. */
export type ResumeTimer = {
  recipeId: string;
  stepNumber: number;
  label: string;
  durationMs: number;
} & (
  | {
      status: 'running';
      startedAt: number;
      endsAt: number;
      /** The push scheduled for its end, so a picked-up session keeps or cancels it instead of scheduling a second; null when it has none. */
      reminderId: string | null;
    }
  | { status: 'paused'; remainingMs: number }
  | { status: 'done'; endedAt: number }
);

/** What a cooking session needs to be picked up again: the dish on screen, each recipe's step and servings, and the timers. */
export interface CookingResume {
  currentId: string;
  positions: Record<string, { stepIndex: number; servings: number }>;
  timers: ResumeTimer[];
}

export type ShareKind = 'RECIPE' | 'MEAL';

/** One ingredient line as a visitor sees it: a name and an amount, never the owner's own ingredient record. */
export interface SharedIngredient {
  name: string;
  /** The `cat-` id when the owner's line is a catalog ingredient, which every kitchen shares; null for one the owner made. */
  catalogId: string | null;
  amount: number | null;
  unit: Unit;
  note: string | null;
  group: string | null;
}

export interface SharedRecipeLink {
  kind: RecipeLinkKind;
  label: string | null;
  /** https only. */
  url: string;
}

/** A recipe as a share carries it: what is needed to read it, cook it and copy it. No prices, notes, ratings, collections, source or favorite. */
export interface SharedRecipe {
  title: string;
  description: string | null;
  servings: number;
  prepMinutes: number | null;
  cookMinutes: number | null;
  ingredients: SharedIngredient[];
  steps: string[];
  care: RecipeCare | null;
  links: SharedRecipeLink[];
  /** True when the share holds a copy of the cover the owner uploaded (`apps/pinch/shares/{shareId}/cover-{index}.webp`); a web cover is never shared. */
  hasCover: boolean;
}

export type SharedMealItem =
  | { kind: 'RECIPE'; servings: number; /** An index into `SharedMeal.recipes`. */ recipeIndex: number }
  | { kind: 'INGREDIENT'; servings: number; name: string; catalogId: string | null };

/** A saved meal as a share carries it: its name and items, with each recipe inline once. */
export interface SharedMeal {
  name: string;
  recipes: SharedRecipe[];
  items: SharedMealItem[];
}

/** The owner's own record of a link they made; the shared copy itself lives where only the server reads it. */
export interface PinchShare {
  /** An unguessable 26-character id (`[2-9a-hj-np-z]`), also the address of the link. */
  id: string;
  ownerUid: string;
  kind: ShareKind;
  /** The owner's recipe or saved meal. */
  sourceId: string;
  /** For the owner's own list. */
  title: string;
  /** The source's change stamp when the copy was taken, to tell whether it has changed since. */
  sourceUpdatedAt: number;
  createdAt: number;
  /** When the copy was last taken. */
  updatedAt: number;
}

/** What `getPinchShare` answers a visitor: the same body for a malformed, unknown and deleted id. */
export type PinchShareResult =
  | { status: 'not_found' }
  | {
      status: 'ok';
      kind: ShareKind;
      sharedAt: number;
      /** Whether the signed-in visitor is the one who shared it; the owner's uid is never sent. */
      isOwner: boolean;
      /** The owner's own recipe or meal id, sent only to the owner. */
      ownerSourceId: string | null;
      recipe: SharedRecipe | null;
      meal: SharedMeal | null;
    };

export interface ShareCoverRef {
  /** The recipe's index in the share (0 for a recipe share). */
  index: number;
  /** The owner's recipe the cover is copied from. */
  recipeId: string;
}

/** What `changePinchShare` takes; the server rebuilds the copy from the allowlist and mints the id. */
export type ChangePinchShareRequest =
  | {
      action: 'create' | 'update';
      /** Required to update; ignored to create (the server mints it, and returns the existing share for a source that already has one). */
      shareId: string | null;
      kind: ShareKind;
      sourceId: string;
      recipe: SharedRecipe | null;
      meal: SharedMeal | null;
      covers: ShareCoverRef[];
      sourceUpdatedAt: number;
    }
  | { action: 'renew' | 'delete'; shareId: string };

export interface ChangePinchShareResult {
  /** The id of the share after the change; null once it is deleted. */
  shareId: string | null;
}

export interface CopyPinchShareCoverRequest {
  shareId: string;
  index: number;
  /** The signed-in visitor's new recipe the cover is copied onto. */
  recipeId: string;
}

export interface CopyPinchShareCoverResult {
  /** The Storage path of the new cover, or null when the share has none to copy. */
  coverPath: string | null;
}
