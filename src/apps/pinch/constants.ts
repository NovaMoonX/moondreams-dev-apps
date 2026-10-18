import type {
  ContainerEventKind,
  ContainerPlace,
  Dimension,
  IdeaKind,
  IdeaStartMethod,
  KitchenView,
  MealType,
  PinchTab,
  RecipesView,
  RecipeStartMethod,
  ShoppingView,
  Unit,
} from '@apps/pinch/types';

export const PINCH_TABS: PinchTab[] = [
  'calendar',
  'recipes',
  'kitchen',
  'shopping',
];
export const DEFAULT_PINCH_TAB: PinchTab = 'calendar';

export const PINCH_TAB_LABELS: Record<PinchTab, string> = {
  calendar: 'Calendar',
  recipes: 'Recipes',
  kitchen: 'Kitchen',
  shopping: 'Shopping',
};

export const UNIT_LABELS: Record<Unit, string> = {
  G: 'g',
  KG: 'kg',
  OZ: 'oz',
  LB: 'lb',
  ML: 'ml',
  L: 'l',
  TSP: 'tsp',
  TBSP: 'tbsp',
  CUP: 'cup',
  FL_OZ: 'fl oz',
  PINCH: 'pinch',
  EACH: 'each',
};

export const NUTRITION_CELLS = [
  { key: 'calories', label: 'Calories', unit: '' },
  { key: 'protein', label: 'Protein', unit: ' g' },
  { key: 'carbs', label: 'Carbs', unit: ' g' },
  { key: 'fat', label: 'Fat', unit: ' g' },
] as const;

export const NUTRITION_METRICS = NUTRITION_CELLS.map((cell) => cell.key);

/** A list gets a search from this many rows. */
export const LIST_SEARCH_THRESHOLD = 8;
/** A section's heading counts its rows only past this many; fewer are counted at a glance. */
export const SECTION_COUNT_THRESHOLD = 10;

export const UNITS: Unit[] = [
  'G',
  'KG',
  'OZ',
  'LB',
  'ML',
  'L',
  'TSP',
  'TBSP',
  'CUP',
  'FL_OZ',
  'PINCH',
  'EACH',
];

export const UNIT_DIMENSION: Record<Unit, Dimension> = {
  G: 'MASS',
  KG: 'MASS',
  OZ: 'MASS',
  LB: 'MASS',
  ML: 'VOLUME',
  L: 'VOLUME',
  TSP: 'VOLUME',
  TBSP: 'VOLUME',
  CUP: 'VOLUME',
  FL_OZ: 'VOLUME',
  PINCH: 'VOLUME',
  EACH: 'COUNT',
};

export const KITCHEN_VIEWS: KitchenView[] = ['yours', 'all'];
export const KITCHEN_VIEW_LABELS: Record<KitchenView, string> = {
  yours: 'Yours',
  all: 'All',
};

export const MAX_NAME_LENGTH = 120;
export const MAX_SOURCE_LABEL_LENGTH = 80;
/** Writes per batch when a source's removal reaches many recipes: under Firestore's 500. */
export const SOURCE_BATCH_SIZE = 400;
/** The recipes filter's two answers that aren't a source; a source id is a UUID, so neither can collide with one. */
export const SOURCE_FILTER_ANY = 'any';
export const SOURCE_FILTER_NONE = 'none';

// Collections: what the person calls a named set of recipes. Every word on screen comes from these two nouns.
export const COLLECTION_NOUN = 'collection';
export const COLLECTION_NOUN_PLURAL = 'collections';
export const COLLECTIONS_TITLE = `${COLLECTION_NOUN_PLURAL.charAt(0).toUpperCase()}${COLLECTION_NOUN_PLURAL.slice(1)}`;
export const MAX_COLLECTION_LABEL_LENGTH = 40;
/** Counted by the client only: the rules cannot count documents. */
export const MAX_COLLECTIONS = 50;
/** The rules' cap on how many collections one recipe names. */
export const MAX_RECIPE_COLLECTIONS = 20;
/** Under Firestore's 500 writes: the action's limit, not the rules'. */
export const COLLECTION_BATCH_SIZE = 200;
/** A collection id is a UUID, so neither can collide with one. */
export const COLLECTION_FILTER_ANY = 'any';
export const COLLECTION_FILTER_NONE = 'none';
export const COLLECTION_CHIPS_SHOWN = 4;
export const COLLECTION_CHIPS_QUIET_HIDDEN = 3;
export const HIGH_PROTEIN_GRAMS = 25;
export const QUICK_MAX_MINUTES = 30;
export const COLLECTION_SUGGESTION_LABELS = {
  HIGH_PROTEIN: 'High-protein',
  QUICK: 'Quick',
  FREEZER_FRIENDLY: 'Freezer-friendly',
} as const;
export const MAX_SERVING_AMOUNT = 1_000_000;
/** What "1 serving" is for an ingredient with no serving size of its own. */
export const DEFAULT_SERVING = { amount: 100, unit: 'G' } as const;

/** The longest edge of a store's own image: it only ever shows in a small round tile. */
export const STORE_IMAGE_MAX_DIMENSION = 512;

export const MAX_DISMISSED_NUDGES = 500;
/** The most ingredient names one copy carries. */
/** The longest recipe text the reader takes, and the biggest photo, screenshot or PDF. */
export const MAX_PASTE_CHARS = 20_000;
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
export const MAX_MEAL_ITEMS = 10;

/** The caps on lines per add and on items are not enforced by the rules. */
export const MAX_SHOPPING_LINES_PER_ADD = 200;
export const SOFT_MAX_SHOPPING_ITEMS = 300;
/** The rules' cap on what one item remembers put it on the list. */
export const MAX_SHOPPING_SOURCES = 60;
export const SHOPPING_GROUP_PAGE_SIZE = 100;
export const SHOPPING_MOVE_DELAY_MS = 1200;
export const SHOPPING_VIEWS: ShoppingView[] = ['toBuy', 'got', 'all'];
export const SHOPPING_VIEW_LABELS: Record<ShoppingView, string> = {
  toBuy: 'To buy',
  got: 'Got it',
  all: 'All',
};
/** The shopping list's sections, in the order a shop is walked. */
export const SHOP_SECTIONS = [
  'produce',
  'meat',
  'dairy',
  'bakery',
  'pantry',
  'spices',
  'snacks',
  'frozen',
  'other',
] as const;
export type ShopSection = (typeof SHOP_SECTIONS)[number];
export const SHOP_SECTION_LABELS: Record<ShopSection, string> = {
  produce: 'Produce',
  meat: 'Meat & fish',
  dairy: 'Dairy & eggs',
  bakery: 'Bakery',
  pantry: 'Pantry',
  spices: 'Spices & oils',
  snacks: 'Snacks & drinks',
  frozen: 'Frozen',
  other: 'Other',
};
/** Where each catalog family is found in a shop; a family not listed, the person's own included, is Other. */
export const SHOP_SECTION_BY_FAMILY: Partial<Record<string, ShopSection>> = {
  'cat-fam-onion': 'produce',
  'cat-fam-pepper': 'produce',
  'cat-fam-tomato': 'produce',
  'cat-fam-potato': 'produce',
  'cat-fam-vegetables': 'produce',
  'cat-fam-greens': 'produce',
  'cat-fam-fruit': 'produce',
  'cat-fam-citrus': 'produce',
  'cat-fam-berries': 'produce',
  'cat-fam-herbs': 'produce',
  'cat-fam-soy': 'produce',
  'cat-fam-chicken': 'meat',
  'cat-fam-beef': 'meat',
  'cat-fam-pork': 'meat',
  'cat-fam-turkey': 'meat',
  'cat-fam-lamb': 'meat',
  'cat-fam-fish': 'meat',
  'cat-fam-shellfish': 'meat',
  'cat-fam-eggs': 'dairy',
  'cat-fam-milk': 'dairy',
  'cat-fam-cheese': 'dairy',
  'cat-fam-yogurt': 'dairy',
  'cat-fam-butter': 'dairy',
  'cat-fam-bread': 'bakery',
  'cat-fam-rice': 'pantry',
  'cat-fam-grains': 'pantry',
  'cat-fam-pasta': 'pantry',
  'cat-fam-flour': 'pantry',
  'cat-fam-baking': 'pantry',
  'cat-fam-sugar': 'pantry',
  'cat-fam-beans': 'pantry',
  'cat-fam-broth': 'pantry',
  'cat-fam-pickles': 'pantry',
  'cat-fam-sauces': 'pantry',
  'cat-fam-nuts': 'pantry',
  'cat-fam-seeds': 'pantry',
  'cat-fam-spices': 'spices',
  'cat-fam-oil': 'spices',
  'cat-fam-vinegar': 'spices',
  'cat-fam-snacks': 'snacks',
  'cat-fam-drinks': 'snacks',
};
/** Catalog ingredients shelved away from their family: a can of tomatoes sits in the pantry, ice cream in the freezer. */
export const SHOP_SECTION_BY_INGREDIENT: Partial<Record<string, ShopSection>> =
  {
    'cat-fresh-ginger': 'produce',
    'cat-canned-diced-tomatoes': 'pantry',
    'cat-crushed-tomatoes': 'pantry',
    'cat-tomato-sauce': 'pantry',
    'cat-tomato-paste': 'pantry',
    'cat-marinara-sauce': 'pantry',
    'cat-sun-dried-tomatoes': 'pantry',
    'cat-pumpkin-puree': 'pantry',
    'cat-raisins': 'pantry',
    'cat-dates': 'pantry',
    'cat-dried-cranberries': 'pantry',
    'cat-shredded-coconut': 'pantry',
    'cat-canned-tuna': 'pantry',
    'cat-sardines': 'pantry',
    'cat-coconut-milk': 'pantry',
    'cat-evaporated-milk': 'pantry',
    'cat-vanilla-ice-cream': 'frozen',
  };
/** Staples outside Spices & oils that an add sheet also leaves unticked. */
export const USUALLY_AT_HOME_IDS: readonly string[] = ['cat-water'];
/** Below this many rows the list is one run in shop order, with no section dividers. */
export const SHOP_SECTION_DIVIDER_MIN_ROWS = 8;

export const SHOPPING_ADD_MODES = ['one', 'plan'] as const;
export type ShoppingAddMode = (typeof SHOPPING_ADD_MODES)[number];
export const SHOPPING_ADD_MODE_LABELS: Record<ShoppingAddMode, string> = {
  one: 'One thing',
  plan: 'From your plan',
};
/** A chunk reads then deletes each item, two operations apiece, under Firestore's 500 per transaction. */
export const SHOPPING_BATCH_SIZE = 250;
export const MAX_SHOPPING_AMOUNT = 1_000_000;

export const MAX_IDEA_TITLE_LENGTH = 120;
export const MAX_IDEA_NOTE_LENGTH = 1000;
export const MAX_IDEA_URL_LENGTH = 2000;
export const MAX_IDEA_SITE_NAME_LENGTH = 120;
/** The most ideas the list takes before asking to delete one: the action and the screens, not the rules. */
export const SOFT_MAX_IDEAS = 200;
export const IDEA_LOOKUP_TIMEOUT_MS = 6000;
export const IDEA_PHOTO_MAX_DIMENSION = 1280;
export const IDEA_KIND_EMOJIS: Record<IdeaKind, string> = {
  LINK: '🔗',
  PHOTO: '📷',
  TEXT: '📝',
};

export const IDEA_START_METHODS: {
  id: IdeaStartMethod;
  emoji: string;
  title: string;
  description: string;
}[] = [
  {
    id: 'link',
    emoji: IDEA_KIND_EMOJIS.LINK,
    title: 'From a link',
    description: 'Paste a recipe page you like',
  },
  {
    id: 'photo',
    emoji: IDEA_KIND_EMOJIS.PHOTO,
    title: 'From a photo',
    description: 'A picture or screenshot of a dish or recipe',
  },
  {
    id: 'text',
    emoji: IDEA_KIND_EMOJIS.TEXT,
    title: 'Jot it down',
    description: 'Just a few words',
  },
];

export const RECIPE_START_METHODS: {
  id: RecipeStartMethod;
  emoji: string;
  title: string;
  description: string;
}[] = [
  {
    id: 'text',
    emoji: '📝',
    title: 'From text',
    description: 'Paste a recipe, say from a chat',
  },
  {
    id: 'file',
    emoji: '📎',
    title: 'From a file',
    description: 'A photo, screenshot or PDF',
  },
  {
    id: 'link',
    emoji: '🔗',
    title: 'From a link',
    description: 'A recipe page on the web',
  },
  {
    id: 'manual',
    emoji: '✍️',
    title: 'Write it yourself',
    description: 'Start with a blank recipe',
  },
];

/** Not a way to make the recipe now, so it follows the list of ways as a quiet row. */
export const KEEP_AS_IDEA_METHOD = {
  id: 'idea',
  emoji: '💡',
  title: 'Keep it as an idea',
  description: 'Save a link, a photo or a few words for later',
};
/** Months loaded on each side of the window's centre: enough that paging a month or a few weeks seldom restarts the listener. */
export const MONTH_WINDOW_PADDING = 2;

export const MEAL_TYPES: MealType[] = [
  'BREAKFAST',
  'LUNCH',
  'DINNER',
  'SNACK',
  'DESSERT',
  'DRINK',
];
/** The order a month cell shows its meals in, so dinner, the meal most people plan, is never the one behind "+N"; drawers and Week keep meal-time order. */
export const MONTH_CELL_MEAL_ORDER: MealType[] = [
  'DINNER',
  'LUNCH',
  'BREAKFAST',
  'SNACK',
  'DESSERT',
  'DRINK',
];
export const MEAL_TYPE_LABELS: Record<MealType, string> = {
  BREAKFAST: 'Breakfast',
  LUNCH: 'Lunch',
  DINNER: 'Dinner',
  SNACK: 'Snack',
  DESSERT: 'Dessert',
  DRINK: 'Drink',
};
export const MEAL_TYPE_EMOJIS: Record<MealType, string> = {
  BREAKFAST: '🍳',
  LUNCH: '🥪',
  DINNER: '🍝',
  SNACK: '🍿',
  DESSERT: '🍰',
  DRINK: '🥤',
};

export const MAX_PRICE_CENTS = 100_000_000;

export const MAX_RECIPE_INGREDIENTS = 60;
export const MAX_RECIPE_STEPS = 60;
export const MAX_RECIPE_TITLE_LENGTH = 200;
export const MAX_RECIPE_DESCRIPTION_LENGTH = 2000;
export const MAX_STEP_LENGTH = 2000;
export const MAX_NOTE_LENGTH = 200;
/** The client's cap on the heading a recipe line sits under ("For the sauce"); the rules don't check a line's fields. */
export const MAX_INGREDIENT_GROUP_LENGTH = 40;
export const MAX_MINUTES = 100_000;
/** The cap the rules enforce. */
export const MAX_CARE_DAYS = 365;
export const CARE_DAYS_PER_MONTH = 30;
export const CARE_DAYS_PER_WEEK = 7;
export const MAX_CARE_REHEAT_LENGTH = 300;
export const MAX_CARE_TIP_LENGTH = 300;
/** The longest edge of a recipe cover: it shows in a list row and a drawer header. */
export const RECIPE_COVER_MAX_DIMENSION = 1280;

export const RECIPES_VIEWS: RecipesView[] = ['recipes', 'meals', 'ideas'];
export const RECIPES_VIEW_LABELS: Record<RecipesView, string> = {
  recipes: 'Recipes',
  meals: 'Saved meals',
  ideas: 'Ideas',
};
/** The Recipes header's add button for each view: one pattern, naming what it makes. */
export const RECIPES_VIEW_NEW_LABELS: Record<RecipesView, string> = {
  recipes: 'New recipe',
  meals: 'New saved meal',
  ideas: 'New idea',
};

/** Grams for a mass unit, millilitres for a volume unit, 1 for a count. */
export const UNIT_TO_BASE: Record<Unit, number> = {
  G: 1,
  KG: 1000,
  OZ: 28.3495,
  LB: 453.592,
  ML: 1,
  L: 1000,
  TSP: 4.92892,
  TBSP: 14.7868,
  CUP: 236.588,
  FL_OZ: 29.5735,
  PINCH: 0.308,
  EACH: 1,
};

export const CALENDAR_VIEWS = ['month', 'week'] as const;
export type CalendarView = (typeof CALENDAR_VIEWS)[number];
/** Month from `lg` up, where the grid has room for meal names; Week, starting today, on anything narrower. */
export const DEFAULT_CALENDAR_VIEW: Record<'wide' | 'narrow', CalendarView> = {
  wide: 'month',
  narrow: 'week',
};
export const CALENDAR_VIEW_LABELS: Record<CalendarView, string> = {
  month: 'Month',
  week: 'Week',
};
/** Fewer fully priced meals than this say too little for an average, so the Calendar shows none. */
export const MIN_FULLY_PRICED_MEALS = 3;

/** The meal type's colour tokens from `pinch.css`: the solid for an edge or a dot, the soft tint for a chip or a pill. */
export const MEAL_TYPE_COLORS: Record<
  MealType,
  { solid: string; soft: string }
> = {
  BREAKFAST: {
    solid: 'var(--pinch-meal-breakfast)',
    soft: 'var(--pinch-meal-breakfast-soft)',
  },
  LUNCH: {
    solid: 'var(--pinch-meal-lunch)',
    soft: 'var(--pinch-meal-lunch-soft)',
  },
  DINNER: {
    solid: 'var(--pinch-meal-dinner)',
    soft: 'var(--pinch-meal-dinner-soft)',
  },
  SNACK: {
    solid: 'var(--pinch-meal-snack)',
    soft: 'var(--pinch-meal-snack-soft)',
  },
  DESSERT: {
    solid: 'var(--pinch-meal-dessert)',
    soft: 'var(--pinch-meal-dessert-soft)',
  },
  DRINK: {
    solid: 'var(--pinch-meal-drink)',
    soft: 'var(--pinch-meal-drink-soft)',
  },
};

export const INGREDIENT_PRICE_FILTER_OPTIONS = [
  { value: 'any', label: 'Any' },
  { value: 'needs', label: 'Needs a price', emoji: '🏷️' },
  { value: 'has', label: 'Has a price', emoji: '💰' },
] as const;

export const INGREDIENT_FLAG_OPTIONS = [
  { value: 'noNutrition', label: 'Missing nutrition', emoji: '📊' },
  { value: 'custom', label: 'Custom only', emoji: '🧑‍🍳' },
] as const;

export const PRODUCT_SORT_OPTIONS = [
  { value: 'store', label: 'By store', emoji: '🏪' },
  { value: 'ingredient', label: 'By ingredient', emoji: '🔤' },
  { value: 'price', label: 'By price', emoji: '💰' },
  { value: 'newest', label: 'By date added', emoji: '🆕' },
] as const;

/** Each product sort's two directions, the first being the one it starts in. */
export const PRODUCT_SORT_ORDER_LABELS = {
  store: ['A to Z', 'Z to A'],
  ingredient: ['A to Z', 'Z to A'],
  price: ['Lowest first', 'Highest first'],
  newest: ['Newest first', 'Oldest first'],
} as const;

export const PRODUCT_DEFAULT_FILTER_OPTIONS = [
  { value: 'any', label: 'Any' },
  { value: 'default', label: 'Default only', emoji: '⭐' },
  { value: 'other', label: 'Not the default' },
] as const;

/** Rows a long list draws before "Show more". */
export const LIST_PAGE_SIZE = 60;

/** The most one nutrition value can be, per 100 g: the same cap the rules enforce. */
export const MAX_NUTRITION_VALUE = 100_000;

/** What a typed nutrition label is "per" in the ingredient form. */
export const NUTRITION_ENTRY_UNITS = [
  { value: 'G', label: 'g' },
  { value: 'OZ', label: 'oz' },
  { value: 'SERVING', label: 'serving' },
] as const;

/** What an ingredient's calories and macros are shown per: its serving, or 100 g. */
export const NUTRITION_BASIS_OPTIONS = [
  { value: 'SERVING', label: 'Per serving' },
  { value: 'PER_100G', label: 'Per 100 g' },
] as const;

export const MAX_COOK_TIMERS = 4;
/** An undismissed Time's up buzzes and beeps again this often, up to five more times. */
export const ALERT_REPEAT_MS = 60_000;
export const MAX_ALERT_REPEATS = 5;
/** A step offers a timer card for each of the first four times it mentions, as many as can run at once. */
export const MAX_STEP_TIMERS = MAX_COOK_TIMERS;

export const MIN_COOK_SERVINGS = 0.5;
export const MAX_COOK_SERVINGS = 1000;

export const MAX_COOKED_SERVINGS = 1000;
/** The most cooks one recipe's history takes before asking to delete one: the action and the screens, not the rules. */
export const SOFT_MAX_COOKS_PER_RECIPE = 500;
/** Under Firestore's 500 writes per batch. */
export const COOK_BATCH_SIZE = 400;
export const COOK_HISTORY_FIRST_PAGE = 8;
export const COOK_HISTORY_PAGE_SIZE = 50;

export const MAX_RECIPE_NOTE_LENGTH = 2000;
/** A tweak's lines, the "and N more" one included: the cap the rules enforce. */
export const MAX_TWEAK_CHANGES = 8;
export const MAX_TWEAK_CHANGE_LENGTH = 200;
/** The most notes one recipe's journal takes before asking to delete one: the action and the screens, not the rules. */
export const SOFT_MAX_RECIPE_NOTES = 300;
/** Under Firestore's 500 writes per batch. */
export const RECIPE_NOTE_BATCH_SIZE = 400;
export const RECIPE_NOTES_FIRST_PAGE = 5;
export const RECIPE_NOTES_PAGE_SIZE = 50;
/** How many of a recipe's latest cooks the note sheet offers as answers. */
export const NOTE_COOK_CHOICES = 4;
/** The most meals one day can have priced again in the one transaction that does it, under Firestore's 500 writes: the action's limit, not the rules'. */
export const MAX_REPRICE_MEALS = 400;

export const CONTAINER_PLACES: ContainerPlace[] = ['FRIDGE', 'FREEZER'];
export const CONTAINER_PLACE_LABELS: Record<ContainerPlace, string> = {
  FRIDGE: 'Fridge',
  FREEZER: 'Freezer',
};
/** Two that don't both read "frozen": an ice cube beside a snowflake said freezer twice. */
export const CONTAINER_PLACE_EMOJIS: Record<ContainerPlace, string> = {
  FRIDGE: '🥛',
  FREEZER: '❄️',
};
export const CONTAINER_PLACE_OPTIONS = CONTAINER_PLACES.map((place) => ({
  value: place,
  label: CONTAINER_PLACE_LABELS[place],
  emoji: CONTAINER_PLACE_EMOJIS[place],
}));
export const CONTAINER_EMOJI = '🍱';
export const CONTAINER_FINISH_EMOJIS: Record<'EAT' | 'TOSS' | 'CLEAR', string> =
  { EAT: '🍽️', TOSS: '🗑️', CLEAR: '🧹' };
export const CONTAINER_EVENT_KINDS: ContainerEventKind[] = [
  'MADE',
  'FRIDGE',
  'FREEZE',
  'THAW',
  'EAT',
  'TOSS',
  'CLEAR',
  'EDIT',
];
export const MAX_CONTAINER_SERVINGS = 100;
export const MAX_CONTAINERS_PER_PUT_AWAY = 20;
/** Set by the rules evaluator's budget of 1,000 expressions a request, not only by the length check: ten events with servings and place each pass; ten that also carry a note can fail. */
export const MAX_CONTAINER_HISTORY = 10;
export const MAX_CONTAINER_NOTE_LENGTH = 80;
export const MAX_CONTAINER_TITLE_LENGTH = 120;
// 2000-01-01 and 2100-01-01, UTC midnight: the bounds the rules take.
export const MIN_EAT_BY_DATE = 946_684_800_000;
export const MAX_EAT_BY_DATE = 4_102_444_800_000;
export const CONTAINER_FRIDGE_DAYS = 4;
export const CONTAINER_FREEZER_DAYS = 90;
export const CONTAINER_THAWED_DAYS = 2;
/** Due today or tomorrow: a wider window tints most of a box's life and stops meaning "eat it now". */
export const CONTAINER_EAT_SOON_DAYS = 1;
/** A freezer row names its eat-by only once it is this close, or past; before that it says when it was frozen. */
export const CONTAINER_FREEZER_DATE_DAYS = 7;
export const BULK_MEAL_SERVINGS = 5;
export const CONTAINER_SITTING_SERVINGS = 2;
/** Counted by the client only; the rules do not count documents. */
export const SOFT_MAX_CONTAINERS = 500;
export const CONTAINER_LIST_PAGE_SIZE = 20;
export const CONTAINER_FINISHED_PAGE_SIZE = 25;
export const CONTAINER_QUERY_LIMIT = 200;
/** Containers one transaction of a clear-out or its Undo re-reads and writes, under Firestore's 500: the action's limit, not the rules'. */
export const CONTAINER_CLEAR_CHUNK_SIZE = 200;
