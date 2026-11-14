import type { ShareDecision } from '@/lib/connections/fieldDecisions';
import type {
  NutritionValues,
  IngredientRecord,
  Family,
  NutritionSwitches,
  KitchenSettings,
  PinchReminderSettings,
  PinchVoiceSettings,
  PinchSettings,
  MealItem,
  Meal,
  PlannedSnapshot,
  PlannedMeal,
  CatalogStore,
  Store,
  Product,
  Source,
  Collection,
  ShoppingItem,
  Idea,
  Cook,
  ContainerEvent,
  Container,
  PackageEvent,
  Package,
  RecipeNote,
  RecipeIngredient,
  RecipeCare,
  RecipeLink,
  Recipe,
  CookingResume,
  PinchShare,
} from '@apps/pinch/types';

const NUTRITION_VALUES_FIELDS = {
  calories: 'never',
  protein: 'never',
  carbs: 'never',
  fat: 'never',
} satisfies Record<keyof NutritionValues, ShareDecision>;

const INGREDIENT_RECORD_FIELDS = {
  id: 'notUseful',
  catalogId: 'shared',
  name: 'shared',
  familyId: 'notUseful',
  iconKey: 'notUseful',
  nutritionPer100g: 'never',
  servingAmount: 'notUseful',
  servingUnit: 'notUseful',
  gramsPerMl: 'notUseful',
  gramsEach: 'notUseful',
  defaultProductId: 'notUseful',
  isArchived: 'notUseful',
  createdAt: 'notUseful',
  updatedAt: 'notUseful',
} satisfies Record<keyof IngredientRecord, ShareDecision>;

const FAMILY_FIELDS = {
  id: 'notUseful',
  name: 'notUseful',
  createdAt: 'notUseful',
  updatedAt: 'notUseful',
} satisfies Record<keyof Family, ShareDecision>;

const NUTRITION_SWITCHES_FIELDS = {
  calories: 'never',
  protein: 'never',
  carbs: 'never',
  fat: 'never',
} satisfies Record<keyof NutritionSwitches, ShareDecision>;

const KITCHEN_SETTINGS_FIELDS = {
  uid: 'notUseful',
  showNutrition: 'never',
  dismissedNudges: 'notUseful',
  createdAt: 'notUseful',
  updatedAt: 'notUseful',
} satisfies Record<keyof KitchenSettings, ShareDecision>;

const PINCH_REMINDER_SETTINGS_FIELDS = {
  eatSoon: 'notUseful',
  expiring: 'notUseful',
  timers: 'notUseful',
  leadDays: 'shared',
  hour: 'notUseful',
  timeZone: 'shared',
} satisfies Record<keyof PinchReminderSettings, ShareDecision>;

const PINCH_VOICE_SETTINGS_FIELDS = {
  hasAgreed: 'notUseful',
  isReadingAloud: 'notUseful',
  isReadingNotes: 'notUseful',
  isWaiting: 'notUseful',
} satisfies Record<keyof PinchVoiceSettings, ShareDecision>;

const PINCH_SETTINGS_FIELDS = {
  fridgeDays: 'notUseful',
  freezerDays: 'notUseful',
  suggestPhotos: 'notUseful',
  calendarStats: 'notUseful',
  defaultTab: 'notUseful',
  voice: 'notUseful',
  reminders: 'shared',
  updatedAt: 'notUseful',
  lastDigestDay: 'notUseful',
} satisfies Record<keyof PinchSettings, ShareDecision>;

const MEAL_ITEM_FIELDS = {
  id: 'notUseful',
  kind: 'shared',
  refId: 'shared',
  servings: 'notUseful',
} satisfies Record<keyof MealItem, ShareDecision>;

const MEAL_FIELDS = {
  id: 'notUseful',
  name: 'shared',
  items: 'shared',
  isFavorite: 'notUseful',
  categories: 'notUseful',
  createdAt: 'notUseful',
  updatedAt: 'shared',
} satisfies Record<keyof Meal, ShareDecision>;

const PLANNED_SNAPSHOT_FIELDS = {
  frozenAt: 'never',
  repricedAt: 'never',
  costCents: 'never',
  leftOut: 'never',
  nutrition: 'never',
  lines: 'never',
} satisfies Record<keyof PlannedSnapshot, ShareDecision>;

const PLANNED_MEAL_FIELDS = {
  id: 'notUseful',
  date: 'shared',
  mealType: 'shared',
  name: 'shared',
  sourceMealId: 'notUseful',
  items: 'shared',
  refIds: 'notUseful',
  snapshot: 'never',
  createdAt: 'notUseful',
  updatedAt: 'shared',
} satisfies Record<keyof PlannedMeal, ShareDecision>;

const CATALOG_STORE_FIELDS = {
  id: 'notUseful',
  name: 'notUseful',
  domain: 'notUseful',
} satisfies Record<keyof CatalogStore, ShareDecision>;

const STORE_FIELDS = {
  id: 'notUseful',
  name: 'notUseful',
  catalogStoreId: 'notUseful',
  imagePath: 'notUseful',
  isArchived: 'notUseful',
  createdAt: 'notUseful',
  updatedAt: 'notUseful',
} satisfies Record<keyof Store, ShareDecision>;

const PRODUCT_FIELDS = {
  id: 'never',
  ingredientId: 'never',
  storeId: 'never',
  label: 'never',
  priceCents: 'never',
  sizeAmount: 'never',
  sizeUnit: 'never',
  url: 'never',
  createdAt: 'never',
  updatedAt: 'never',
} satisfies Record<keyof Product, ShareDecision>;

const SOURCE_FIELDS = {
  id: 'notUseful',
  label: 'notUseful',
  createdAt: 'notUseful',
  updatedAt: 'notUseful',
} satisfies Record<keyof Source, ShareDecision>;

const COLLECTION_FIELDS = {
  id: 'notUseful',
  label: 'notUseful',
  createdAt: 'notUseful',
  updatedAt: 'notUseful',
} satisfies Record<keyof Collection, ShareDecision>;

const SHOPPING_ITEM_FIELDS = {
  id: 'notUseful',
  ingredientId: 'shared',
  amount: 'shared',
  unit: 'shared',
  isChecked: 'filter',
  sources: 'notUseful',
  pantryAddedAt: 'notUseful',
  createdAt: 'notUseful',
  updatedAt: 'shared',
} satisfies Record<keyof ShoppingItem, ShareDecision>;

const IDEA_FIELDS = {
  id: 'notUseful',
  kind: 'notUseful',
  title: 'notUseful',
  note: 'never',
  url: 'notUseful',
  siteName: 'notUseful',
  imageUrl: 'notUseful',
  photoPath: 'notUseful',
  recipeId: 'notUseful',
  createdAt: 'notUseful',
  updatedAt: 'notUseful',
} satisfies Record<keyof Idea, ShareDecision>;

const COOK_FIELDS = {
  id: 'never',
  recipeId: 'never',
  plannedMealId: 'never',
  servings: 'never',
  cookedAt: 'never',
  rating: 'never',
  photoPath: 'never',
  createdAt: 'never',
  updatedAt: 'never',
} satisfies Record<keyof Cook, ShareDecision>;

const CONTAINER_EVENT_FIELDS = {
  kind: 'notUseful',
  at: 'notUseful',
  servings: 'notUseful',
  place: 'notUseful',
  note: 'never',
} satisfies Record<keyof ContainerEvent, ShareDecision>;

const CONTAINER_FIELDS = {
  id: 'notUseful',
  title: 'shared',
  recipeId: 'notUseful',
  mealId: 'notUseful',
  cookId: 'notUseful',
  servings: 'shared',
  status: 'filter',
  place: 'shared',
  eatBy: 'shared',
  history: 'notUseful',
  createdAt: 'notUseful',
  updatedAt: 'shared',
} satisfies Record<keyof Container, ShareDecision>;

const PACKAGE_EVENT_FIELDS = {
  kind: 'notUseful',
  at: 'notUseful',
  amount: 'notUseful',
  place: 'notUseful',
  note: 'never',
} satisfies Record<keyof PackageEvent, ShareDecision>;

const PACKAGE_FIELDS = {
  id: 'notUseful',
  ingredientId: 'notUseful',
  ingredientName: 'shared',
  productId: 'notUseful',
  amount: 'shared',
  unit: 'shared',
  place: 'shared',
  expiresAt: 'shared',
  openedAt: 'notUseful',
  status: 'filter',
  history: 'notUseful',
  createdAt: 'notUseful',
  updatedAt: 'shared',
} satisfies Record<keyof Package, ShareDecision>;

const RECIPE_NOTE_FIELDS = {
  id: 'never',
  recipeId: 'never',
  kind: 'never',
  text: 'never',
  changes: 'never',
  cookId: 'never',
  stepIndex: 'never',
  stepText: 'never',
  reason: 'never',
  previous: 'never',
  createdAt: 'never',
  updatedAt: 'never',
} satisfies Record<keyof RecipeNote, ShareDecision>;

const RECIPE_INGREDIENT_FIELDS = {
  id: 'never',
  ingredientId: 'never',
  amount: 'never',
  unit: 'never',
  note: 'never',
  group: 'never',
} satisfies Record<keyof RecipeIngredient, ShareDecision>;

const RECIPE_CARE_FIELDS = {
  fridgeDays: 'never',
  freezerDays: 'never',
  reheat: 'never',
  tip: 'never',
} satisfies Record<keyof RecipeCare, ShareDecision>;

const RECIPE_LINK_FIELDS = {
  id: 'never',
  kind: 'never',
  label: 'never',
  url: 'never',
} satisfies Record<keyof RecipeLink, ShareDecision>;

const RECIPE_FIELDS = {
  id: 'notUseful',
  title: 'shared',
  description: 'never',
  servings: 'shared',
  prepMinutes: 'shared',
  cookMinutes: 'shared',
  coverPath: 'notUseful',
  coverUrl: 'notUseful',
  ingredients: 'never',
  steps: 'never',
  nutritionOverride: 'never',
  source: 'notUseful',
  sourceId: 'notUseful',
  care: 'never',
  collectionIds: 'notUseful',
  categories: 'shared',
  links: 'never',
  isArchived: 'filter',
  isFavorite: 'notUseful',
  createdAt: 'notUseful',
  updatedAt: 'shared',
} satisfies Record<keyof Recipe, ShareDecision>;

const COOKING_RESUME_FIELDS = {
  currentId: 'notUseful',
  positions: 'notUseful',
  timers: 'notUseful',
  captured: 'notUseful',
} satisfies Record<keyof CookingResume, ShareDecision>;

const PINCH_SHARE_FIELDS = {
  id: 'never',
  ownerUid: 'never',
  kind: 'never',
  sourceId: 'never',
  title: 'never',
  sourceUpdatedAt: 'never',
  includesTips: 'never',
  includesNotes: 'never',
  createdAt: 'never',
  updatedAt: 'never',
} satisfies Record<keyof PinchShare, ShareDecision>;

/** What pinch lets Helm read, per stored field; an added, removed or renamed field fails the typecheck until it is decided here. */
export const SHARE_FIELDS = {
  NutritionValues: NUTRITION_VALUES_FIELDS,
  IngredientRecord: INGREDIENT_RECORD_FIELDS,
  Family: FAMILY_FIELDS,
  NutritionSwitches: NUTRITION_SWITCHES_FIELDS,
  KitchenSettings: KITCHEN_SETTINGS_FIELDS,
  PinchReminderSettings: PINCH_REMINDER_SETTINGS_FIELDS,
  PinchVoiceSettings: PINCH_VOICE_SETTINGS_FIELDS,
  PinchSettings: PINCH_SETTINGS_FIELDS,
  MealItem: MEAL_ITEM_FIELDS,
  Meal: MEAL_FIELDS,
  PlannedSnapshot: PLANNED_SNAPSHOT_FIELDS,
  PlannedMeal: PLANNED_MEAL_FIELDS,
  CatalogStore: CATALOG_STORE_FIELDS,
  Store: STORE_FIELDS,
  Product: PRODUCT_FIELDS,
  Source: SOURCE_FIELDS,
  Collection: COLLECTION_FIELDS,
  ShoppingItem: SHOPPING_ITEM_FIELDS,
  Idea: IDEA_FIELDS,
  Cook: COOK_FIELDS,
  ContainerEvent: CONTAINER_EVENT_FIELDS,
  Container: CONTAINER_FIELDS,
  PackageEvent: PACKAGE_EVENT_FIELDS,
  Package: PACKAGE_FIELDS,
  RecipeNote: RECIPE_NOTE_FIELDS,
  RecipeIngredient: RECIPE_INGREDIENT_FIELDS,
  RecipeCare: RECIPE_CARE_FIELDS,
  RecipeLink: RECIPE_LINK_FIELDS,
  Recipe: RECIPE_FIELDS,
  CookingResume: COOKING_RESUME_FIELDS,
  PinchShare: PINCH_SHARE_FIELDS,
};

/** Exported types that are not stored, so have no fields to decide. */
export const NOT_STORED: Record<string, string> = {
  CatalogFamily: 'built-in catalog kept in code',
  CatalogIngredient: 'built-in catalog kept in code',
  ResolvedIngredient: 'catalog and custom ingredient merged for display',
  ResolvedFamily: 'catalog and custom family merged for display',
  PlateCookRecipe: 'cooking screen input',
  WebPhoto: 'web search result',
  Gap: 'derived cost reading',
  LineCost: 'derived cost reading',
  RecipeCost: 'derived cost reading',
  SharedIngredient: 'frozen into a share, never a source document',
  SharedRecipeLink: 'frozen into a share, never a source document',
  SharedRecipeEntry: 'frozen into a share, never a source document',
  SharedRecipe: 'frozen into a share, never a source document',
  SharedMeal: 'frozen into a share, never a source document',
  ShareCoverRef: 'callable request',
  ChangePinchShareResult: 'callable result',
  CopyPinchShareCoverRequest: 'callable request',
  CopyPinchShareCoverResult: 'callable result',
};
