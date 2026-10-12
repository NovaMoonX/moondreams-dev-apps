import type { Dimension, KitchenView, PinchTab, Unit } from '@apps/pinch/types';

export const PINCH_TABS: PinchTab[] = ['calendar', 'recipes', 'kitchen'];
export const DEFAULT_PINCH_TAB: PinchTab = 'calendar';

export const PINCH_TAB_LABELS: Record<PinchTab, string> = {
  calendar: 'Calendar',
  recipes: 'Recipes',
  kitchen: 'Kitchen',
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

/** A list gets a search from this many rows. */
export const LIST_SEARCH_THRESHOLD = 8;

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
export const MAX_SERVING_AMOUNT = 1_000_000;
/** What "1 serving" is for an ingredient with no serving size of its own. */
export const DEFAULT_SERVING = { amount: 100, unit: 'G' } as const;

/** The longest edge of a store's own image: it only ever shows in a small round tile. */
export const STORE_IMAGE_MAX_DIMENSION = 512;
