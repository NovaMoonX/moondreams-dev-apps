import { deflateSync } from 'node:zlib';

import {
  shareCoverPath,
  toCoveredCopy,
  toSharedMeal,
  toSharedRecipe,
} from '../../functions/src/apps/pinch/pinchShareView.ts';
import { CATALOG_INGREDIENTS } from '../../src/apps/pinch/catalog/catalogIngredients.ts';
import {
  EMPTY_SEED_RESULT,
  FIXTURE_USERS,
  type SeedContext,
  type SeedResult,
} from './types.ts';

const DAY_MS = 86_400_000;

const SEED_FAMILIES = [{ id: 'seed-pinch-family-chips', name: 'Chips' }];

// The last one is only on a recipe Alex retired, so the list shows a source with nothing listed under it.
const SEED_SOURCES = [
  { id: 'seed-pinch-source-serious-eats', label: 'Serious Eats' },
  { id: 'seed-pinch-source-recipe-cards', label: "Mom's recipe cards" },
  { id: 'seed-pinch-source-nyt', label: 'NYT Cooking' },
];

// High-protein is on the adobo and the nachos, Weeknight on the adobo and the rice; the retired chili has no `collectionIds` key, the shape from before collections.
const SEED_COLLECTIONS = [
  { id: 'seed-pinch-collection-high-protein', label: 'High-protein' },
  { id: 'seed-pinch-collection-weeknight', label: 'Weeknight' },
];

const shoppingItem = (
  ingredientId: string,
  unit: string,
  amount: number,
  isChecked: boolean,
  sources: string[],
) => ({
  id: `${ingredientId}__${unit}`,
  ingredientId,
  amount,
  unit,
  isChecked,
  sources,
});

// The adobo lines are the recipe at its own four servings, added from its drawer before a recipe's source kept its servings (so that older
// shape stays exercised: it reads as the recipe's own servings); the rice lines are today's and tomorrow's dinners (two servings each), already got;
// the chicken breast was typed on the list.
const ADOBO_ADDED = ['recipe:seed-pinch-recipe-adobo'];
const DINNERS_ADDED = ['seed-pinch-planned-4', 'seed-pinch-planned-7'];
const SEED_SHOPPING = [
  shoppingItem('cat-chicken-thigh', 'LB', 2, false, ADOBO_ADDED),
  shoppingItem('cat-chicken-breast', 'LB', 1, false, []),
  shoppingItem('cat-soy-sauce', 'CUP', 0.25, false, ADOBO_ADDED),
  shoppingItem('cat-soy-sauce', 'TBSP', 2, false, ADOBO_ADDED),
  shoppingItem('cat-garlic', 'EACH', 6, false, ADOBO_ADDED),
  shoppingItem('cat-lime-juice', 'TBSP', 2, true, DINNERS_ADDED),
  shoppingItem('cat-cilantro', 'CUP', 0.25, true, DINNERS_ADDED),
];

const idea = (
  id: string,
  kind: 'LINK' | 'TEXT',
  title: string,
  fields: {
    note?: string;
    url?: string;
    siteName?: string;
    imageUrl?: string;
    recipeId?: string;
  } = {},
) => ({
  id: `seed-pinch-idea-${id}`,
  kind,
  title,
  note: fields.note ?? null,
  url: fields.url ?? null,
  siteName: fields.siteName ?? null,
  imageUrl: fields.imageUrl ?? null,
  photoPath: null,
  recipeId: fields.recipeId ?? null,
});

const LONG_NOTE = [
  "Had this at a friend's place in the spring: a bowl of rice, miso-glazed salmon and a pile of quick-pickled cucumbers.",
  'The glaze was white miso, mirin and a little honey, brushed on and broiled until it caught at the edges.',
  'Things to work out: how long the salmon sits in the glaze (she said overnight, the recipe I found says 20 minutes), whether the cucumbers need sesame, and what to serve it with so it still feels like a weeknight dinner.',
  'Maybe try it once with the cilantro lime rice before changing anything.',
].join('\n\n');

// Two links with a site and no picture, one whose picture address cannot load offline (so the fallback shows),
// two jotted ideas (one with a long note) and one link already turned into the adobo recipe.
const SEED_IDEAS = [
  idea('smashed-potatoes', 'LINK', 'Crispy smashed potatoes', {
    url: 'https://www.seriouseats.com/crispy-smashed-potatoes',
    siteName: 'Serious Eats',
  }),
  idea('brown-butter-cookies', 'LINK', 'Brown butter chocolate chip cookies', {
    url: 'https://cooking.nytimes.com/recipes/brown-butter-chocolate-chip-cookies',
    siteName: 'NYT Cooking',
    note: 'Chill the dough overnight.',
  }),
  idea('lemon-bars-link', 'LINK', 'Lemon bars with a shortbread crust', {
    url: 'https://smittenkitchen.com/lemon-bars',
    siteName: 'Smitten Kitchen',
    imageUrl: 'https://images.example.test/lemon-bars.jpg',
  }),
  idea('moms-lemon-bars', 'TEXT', "Something like Mom's lemon bars"),
  idea('miso-salmon', 'TEXT', 'Miso salmon and quick pickles', {
    note: LONG_NOTE,
  }),
  idea('adobo', 'LINK', 'Sticky chicken adobo', {
    url: 'https://www.seriouseats.com/chicken-adobo',
    siteName: 'Serious Eats',
    recipeId: 'seed-pinch-recipe-adobo',
  }),
];

// Adobo three times over the past weeks at different servings and rice once, all marked from the recipe, plus the dinner
// Alex marked from his plan three days ago (the deterministic id of `seed-pinch-planned-1`). Nachos and the chili have none.
const SEED_COOKS = [
  {
    id: 'seed-pinch-cook-1',
    recipeId: 'seed-pinch-recipe-adobo',
    plannedMealId: null,
    daysAgo: 24,
    hour: 18,
    servings: 4,
  },
  {
    id: 'seed-pinch-cook-2',
    recipeId: 'seed-pinch-recipe-adobo',
    plannedMealId: null,
    daysAgo: 17,
    hour: 18,
    servings: 6,
  },
  {
    id: 'seed-pinch-cook-3',
    recipeId: 'seed-pinch-recipe-adobo',
    plannedMealId: null,
    daysAgo: 9,
    hour: 18,
    servings: 2,
  },
  {
    id: 'seed-pinch-cook-4',
    recipeId: 'seed-pinch-recipe-rice',
    plannedMealId: null,
    daysAgo: 6,
    hour: 18,
    servings: 4,
  },
  {
    id: 'seed-pinch-planned-1__seed-pinch-recipe-adobo',
    recipeId: 'seed-pinch-recipe-adobo',
    plannedMealId: 'seed-pinch-planned-1',
    daysAgo: 3,
    hour: 12,
    servings: 4,
  },
];

// Adobo's journal: a plain note from before the tweak, the tweak itself (two changes and a why, so the older note reads "Written before your tweak"),
// and a note after the planned dinner that came later (no label). Rice has one note after its own cook. Nachos and the chili have none.
const SEED_NOTES = [
  {
    id: 'seed-pinch-note-adobo-plain',
    recipeId: 'seed-pinch-recipe-adobo',
    kind: 'NOTE',
    text: 'Mom says a splash of pineapple juice rounds it out. Try it once before changing anything else.',
    changes: [],
    cookId: null,
    daysAgo: 14,
    hour: 20,
  },
  {
    id: 'seed-pinch-note-adobo-tweak',
    recipeId: 'seed-pinch-recipe-adobo',
    kind: 'TWEAK',
    text: 'The sauce was sharp last time, so less vinegar and a longer reduction.',
    changes: [
      'White vinegar 0.5 → 0.25 cup',
      'Step 3 now reads: “Uncover and reduce the sauce until it clings to the chicken.”',
    ],
    cookId: null,
    daysAgo: 8,
    hour: 21,
  },
  {
    id: 'seed-pinch-note-adobo-cook',
    recipeId: 'seed-pinch-recipe-adobo',
    kind: 'NOTE',
    text: 'Much better with less vinegar. The kids had seconds. Next time double the garlic and serve it with the cilantro lime rice.',
    changes: [],
    cookId: 'seed-pinch-planned-1__seed-pinch-recipe-adobo',
    daysAgo: 3,
    hour: 19,
  },
  {
    id: 'seed-pinch-note-rice',
    recipeId: 'seed-pinch-recipe-rice',
    kind: 'NOTE',
    text: "Rinse the rice twice so it doesn't clump, and stir the lime in after the heat is off.",
    changes: [],
    cookId: 'seed-pinch-cook-4',
    daysAgo: 6,
    hour: 19,
  },
];

type SeedPackageEventKind = 'ADDED' | 'USED' | 'MOVED' | 'TOSSED' | 'EDITED';

/** Eight packages over five ingredients, each its own document: two cartons of milk with different dates and amounts, a tray of chicken past its date beside a frozen one, a bag of rice with no date, and herbs and greens due soon. `expiresInDays` is from the seed's day, null for no date; the amount is what is left. */
const SEED_PACKAGES = [
  {
    id: 'seed-pinch-package-milk-1',
    ingredientId: 'cat-whole-milk',
    ingredientName: 'Whole milk',
    amount: 1,
    unit: 'L',
    place: 'FRIDGE',
    expiresInDays: 1,
    openedDaysAgo: null,
    events: [{ kind: 'ADDED', daysAgo: 4, amount: 1, place: 'FRIDGE' }],
  },
  {
    id: 'seed-pinch-package-milk-2',
    ingredientId: 'cat-whole-milk',
    ingredientName: 'Whole milk',
    amount: 0.5,
    unit: 'L',
    place: 'FRIDGE',
    expiresInDays: 6,
    openedDaysAgo: 2,
    events: [
      { kind: 'ADDED', daysAgo: 7, amount: 1, place: 'FRIDGE' },
      { kind: 'USED', daysAgo: 2, amount: 0.5, place: null },
    ],
  },
  {
    id: 'seed-pinch-package-chicken-fridge',
    ingredientId: 'cat-chicken-thigh',
    ingredientName: 'Chicken thigh',
    amount: 1.2,
    unit: 'LB',
    place: 'FRIDGE',
    expiresInDays: -2,
    openedDaysAgo: null,
    events: [{ kind: 'ADDED', daysAgo: 6, amount: 1.2, place: 'FRIDGE' }],
  },
  {
    id: 'seed-pinch-package-chicken-freezer',
    ingredientId: 'cat-chicken-thigh',
    ingredientName: 'Chicken thigh',
    amount: 2,
    unit: 'LB',
    place: 'FREEZER',
    expiresInDays: 75,
    openedDaysAgo: null,
    events: [{ kind: 'ADDED', daysAgo: 20, amount: 2, place: 'FREEZER' }],
  },
  {
    id: 'seed-pinch-package-rice',
    ingredientId: 'cat-jasmine-rice',
    ingredientName: 'Jasmine rice',
    amount: 8,
    unit: 'LB',
    place: 'PANTRY',
    expiresInDays: null,
    openedDaysAgo: 25,
    events: [
      { kind: 'ADDED', daysAgo: 30, amount: 12, place: 'PANTRY' },
      { kind: 'USED', daysAgo: 25, amount: 4, place: null },
    ],
  },
  {
    id: 'seed-pinch-package-cilantro',
    ingredientId: 'cat-cilantro',
    ingredientName: 'Cilantro',
    amount: 1,
    unit: 'CUP',
    place: 'FRIDGE',
    expiresInDays: 1,
    openedDaysAgo: null,
    events: [{ kind: 'ADDED', daysAgo: 5, amount: 1, place: 'FRIDGE' }],
  },
  {
    id: 'seed-pinch-package-spinach-1',
    ingredientId: 'cat-spinach',
    ingredientName: 'Spinach',
    amount: 5,
    unit: 'OZ',
    place: 'FRIDGE',
    expiresInDays: 3,
    openedDaysAgo: null,
    events: [{ kind: 'ADDED', daysAgo: 3, amount: 5, place: 'FRIDGE' }],
  },
  {
    id: 'seed-pinch-package-spinach-2',
    ingredientId: 'cat-spinach',
    ingredientName: 'Spinach',
    amount: 10,
    unit: 'OZ',
    place: 'FRIDGE',
    expiresInDays: 9,
    openedDaysAgo: null,
    events: [{ kind: 'ADDED', daysAgo: 1, amount: 10, place: 'FRIDGE' }],
  },
] satisfies {
  id: string;
  ingredientId: string;
  ingredientName: string;
  amount: number;
  unit: string;
  place: 'PANTRY' | 'FRIDGE' | 'FREEZER';
  expiresInDays: number | null;
  openedDaysAgo: number | null;
  events: {
    kind: SeedPackageEventKind;
    daysAgo: number;
    amount: number;
    place: 'PANTRY' | 'FRIDGE' | 'FREEZER' | null;
  }[];
}[];

type SeedEventKind =
  'MADE' | 'FRIDGE' | 'FREEZE' | 'THAW' | 'EAT' | 'TOSS' | 'CLEAR' | 'EDIT';

const seedEvent = (
  kind: SeedEventKind,
  daysAgo: number,
  hour: number,
  details: {
    servings?: number;
    place?: 'FRIDGE' | 'FREEZER';
    note?: string;
  } = {},
) => ({
  kind,
  daysAgo,
  hour,
  servings: details.servings ?? null,
  place: details.place ?? null,
  note: details.note ?? null,
});

const SEED_CONTAINERS = [
  {
    id: 'seed-pinch-container-adobo-fridge',
    title: 'Adobo chicken',
    recipeId: 'seed-pinch-recipe-adobo',
    mealId: null,
    cookId: 'seed-pinch-planned-1__seed-pinch-recipe-adobo',
    servings: 2,
    status: 'IN_STOCK',
    place: 'FRIDGE',
    eatByDays: 1,
    events: [
      seedEvent('MADE', 3, 12, { servings: 4 }),
      seedEvent('FRIDGE', 3, 12, { servings: 4, place: 'FRIDGE' }),
      seedEvent('EAT', 1, 19, { servings: 2 }),
    ],
  },
  {
    id: 'seed-pinch-container-rice-fridge',
    title: 'Cilantro lime rice',
    recipeId: 'seed-pinch-recipe-rice',
    mealId: null,
    cookId: null,
    servings: 3,
    status: 'IN_STOCK',
    place: 'FRIDGE',
    eatByDays: 4,
    events: [seedEvent('FRIDGE', 0, 9, { servings: 3, place: 'FRIDGE' })],
  },
  {
    id: 'seed-pinch-container-adobo-freezer',
    title: 'Adobo chicken',
    recipeId: 'seed-pinch-recipe-adobo',
    mealId: null,
    cookId: 'seed-pinch-cook-2',
    servings: 5,
    status: 'IN_STOCK',
    place: 'FREEZER',
    eatByDays: 80,
    events: [
      seedEvent('MADE', 10, 19, { servings: 6 }),
      seedEvent('FREEZE', 10, 19, { servings: 6, place: 'FREEZER' }),
      seedEvent('EAT', 4, 18, { servings: 1 }),
    ],
  },
  {
    id: 'seed-pinch-container-stock-freezer',
    title: 'Chicken stock',
    recipeId: null,
    mealId: null,
    cookId: null,
    servings: 4,
    status: 'IN_STOCK',
    place: 'FREEZER',
    eatByDays: -3,
    events: [seedEvent('FREEZE', 100, 17, { servings: 4, place: 'FREEZER' })],
  },
  {
    id: 'seed-pinch-container-adobo-thawed',
    title: 'Adobo chicken',
    recipeId: 'seed-pinch-recipe-adobo',
    mealId: null,
    cookId: null,
    servings: 3,
    status: 'IN_STOCK',
    place: 'FRIDGE',
    eatByDays: 2,
    events: [
      seedEvent('FREEZE', 40, 18, { servings: 3, place: 'FREEZER' }),
      seedEvent('THAW', 12, 8, { servings: 3, place: 'FRIDGE' }),
      seedEvent('FREEZE', 12, 20, { servings: 3, place: 'FREEZER' }),
      seedEvent('THAW', 0, 8, { servings: 3, place: 'FRIDGE' }),
    ],
  },
  {
    id: 'seed-pinch-container-meal-fridge',
    title: 'Adobo and rice',
    recipeId: null,
    mealId: 'seed-pinch-meal-adobo-rice',
    cookId: null,
    servings: 2,
    status: 'IN_STOCK',
    place: 'FRIDGE',
    eatByDays: 3,
    events: [seedEvent('FRIDGE', 1, 20, { servings: 2, place: 'FRIDGE' })],
  },
  {
    id: 'seed-pinch-container-soup-fridge-1',
    title: 'Pumpkin soup',
    recipeId: null,
    mealId: null,
    cookId: null,
    servings: 2,
    status: 'IN_STOCK',
    place: 'FRIDGE',
    eatByDays: -2,
    events: [seedEvent('FRIDGE', 6, 19, { servings: 2, place: 'FRIDGE' })],
  },
  {
    id: 'seed-pinch-container-soup-fridge-2',
    title: 'Pumpkin soup',
    recipeId: null,
    mealId: null,
    cookId: null,
    servings: 2,
    status: 'IN_STOCK',
    place: 'FRIDGE',
    eatByDays: -2,
    events: [seedEvent('FRIDGE', 6, 19, { servings: 2, place: 'FRIDGE' })],
  },
  {
    id: 'seed-pinch-container-chili-fridge',
    title: 'Turkey chili',
    recipeId: null,
    mealId: null,
    cookId: null,
    servings: 3,
    status: 'IN_STOCK',
    place: 'FRIDGE',
    eatByDays: -1,
    events: [seedEvent('FRIDGE', 5, 20, { servings: 3, place: 'FRIDGE' })],
  },
  {
    id: 'seed-pinch-container-lentil-freezer',
    title: "Grandma's lentil soup",
    recipeId: null,
    mealId: null,
    cookId: null,
    servings: 6,
    status: 'IN_STOCK',
    place: 'FREEZER',
    eatByDays: 45,
    events: [seedEvent('FREEZE', 30, 16, { servings: 6, place: 'FREEZER' })],
  },
  {
    id: 'seed-pinch-container-adobo-done',
    title: 'Adobo chicken',
    recipeId: 'seed-pinch-recipe-adobo',
    mealId: null,
    cookId: 'seed-pinch-cook-1',
    servings: 2,
    status: 'DONE',
    place: 'FRIDGE',
    eatByDays: -16,
    events: [
      seedEvent('MADE', 24, 18, { servings: 4 }),
      seedEvent('FRIDGE', 24, 18, { servings: 4, place: 'FRIDGE' }),
      seedEvent('EAT', 23, 19, { servings: 2 }),
      seedEvent('EAT', 21, 19, { servings: 2 }),
    ],
  },
  {
    id: 'seed-pinch-container-rice-tossed',
    title: 'Cilantro lime rice',
    recipeId: 'seed-pinch-recipe-rice',
    mealId: null,
    cookId: null,
    servings: 2,
    status: 'DONE',
    place: 'FRIDGE',
    eatByDays: -10,
    events: [
      seedEvent('FRIDGE', 14, 20, { servings: 2, place: 'FRIDGE' }),
      seedEvent('EDIT', 12, 8, { note: 'EAT_BY_MOVED' }),
      seedEvent('TOSS', 8, 18, { servings: 2 }),
    ],
  },
  {
    id: 'seed-pinch-container-chili-cleared',
    title: 'Turkey chili',
    recipeId: null,
    mealId: null,
    cookId: null,
    servings: 3,
    status: 'DONE',
    place: 'FREEZER',
    eatByDays: 30,
    events: [
      seedEvent('FREEZE', 60, 19, { servings: 4, place: 'FREEZER' }),
      seedEvent('EAT', 40, 19, { servings: 1 }),
      seedEvent('CLEAR', 5, 10, { servings: 3 }),
    ],
  },
];

const nutrition = (
  calories: number,
  protein: number,
  carbs: number,
  fat: number,
) => ({ calories, protein, carbs, fat });

const baseIngredient = {
  catalogId: null,
  name: null,
  familyId: null,
  iconKey: null,
  nutritionPer100g: null,
  servingAmount: null,
  servingUnit: null,
  gramsPerMl: null,
  gramsEach: null,
  defaultProductId: null,
};

// A ready-to-eat food in a family of its own, a variant joined to a catalog family, one with nothing but a name,
// and a catalog ingredient Alex adjusted (its document id is the catalog id).
const SEED_INGREDIENTS = [
  {
    ...baseIngredient,
    id: 'seed-pinch-ingredient-doritos',
    name: 'Doritos nacho cheese',
    familyId: 'seed-pinch-family-chips',
    iconKey: null,
    nutritionPer100g: nutrition(497, 7, 60, 25),
    servingAmount: 28,
    servingUnit: 'G',
  },
  {
    ...baseIngredient,
    id: 'seed-pinch-ingredient-chicken-feet',
    name: 'Chicken feet',
    familyId: 'cat-fam-chicken',
    iconKey: null,
    nutritionPer100g: nutrition(215, 19.4, 0.2, 14.6),
    defaultProductId: 'seed-pinch-product-chicken-feet-green-market',
  },
  {
    ...baseIngredient,
    id: 'seed-pinch-ingredient-house-blend',
    name: 'House spice blend',
  },
  {
    ...baseIngredient,
    id: 'cat-chicken-breast',
    catalogId: 'cat-chicken-breast',
    nutritionPer100g: nutrition(120, 26, 0, 1.5),
    servingAmount: 5,
    servingUnit: 'OZ',
    defaultProductId: 'seed-pinch-product-chicken-walmart',
  },
  // A catalog ingredient that only points at a default product: Alex changed nothing else about it.
  {
    ...baseIngredient,
    id: 'cat-jasmine-rice',
    catalogId: 'cat-jasmine-rice',
    defaultProductId: 'seed-pinch-product-rice-costco',
  },
];

const SEED_PRODUCTS = [
  {
    id: 'seed-pinch-product-chicken-walmart',
    ingredientId: 'cat-chicken-breast',
    storeId: 'cat-store-walmart',
    label: 'Great Value',
    priceCents: 948,
    sizeAmount: 3,
    sizeUnit: 'LB',
    url: null,
  },
  {
    id: 'seed-pinch-product-chicken-costco',
    ingredientId: 'cat-chicken-breast',
    storeId: 'cat-store-costco',
    label: null,
    priceCents: 1999,
    sizeAmount: 6.5,
    sizeUnit: 'LB',
    url: 'https://www.costco.com/',
  },
  {
    id: 'seed-pinch-product-rice-costco',
    ingredientId: 'cat-jasmine-rice',
    storeId: 'cat-store-costco',
    label: null,
    priceCents: 1499,
    sizeAmount: 20,
    sizeUnit: 'LB',
    url: null,
  },
  // Priced after the lunch three days back was fixed, so that day can use today's prices.
  {
    id: 'seed-pinch-product-chicken-feet-green-market',
    ingredientId: 'seed-pinch-ingredient-chicken-feet',
    storeId: 'seed-pinch-store-green-market',
    label: null,
    priceCents: 599,
    sizeAmount: 2,
    sizeUnit: 'LB',
    url: null,
  },
  {
    id: 'seed-pinch-product-doritos-green-market',
    ingredientId: 'seed-pinch-ingredient-doritos',
    storeId: 'seed-pinch-store-green-market',
    label: null,
    priceCents: 498,
    sizeAmount: 9.25,
    sizeUnit: 'OZ',
    url: null,
  },
];

const CATALOG_STORE_SEEDS = [
  { id: 'cat-store-walmart', name: 'Walmart' },
  { id: 'cat-store-costco', name: 'Costco' },
];
const CUSTOM_STORE = {
  id: 'seed-pinch-store-green-market',
  name: 'Green Market',
};

/** A solid-colour square PNG, so the seeded store has a real image without any asset file. */
function makeSquarePng(
  size: number,
  [red, green, blue]: [number, number, number],
) {
  const row = Buffer.concat([
    Buffer.from([0]),
    Buffer.from(Array.from({ length: size }, () => [red, green, blue]).flat()),
  ]);
  const raw = Buffer.concat(Array.from({ length: size }, () => row));
  const crcTable = Array.from({ length: 256 }, (_, n) =>
    Array.from({ length: 8 }).reduce<number>(
      (c) => (c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1),
      n,
    ),
  );
  const crc = (buffer: Buffer) =>
    (buffer.reduce(
      (c, byte) => crcTable[(c ^ byte) & 0xff] ^ (c >>> 8),
      0xffffffff,
    ) ^
      0xffffffff) >>>
    0;
  const chunk = (type: string, data: Buffer) => {
    const body = Buffer.concat([Buffer.from(type), data]);
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    const checksum = Buffer.alloc(4);
    checksum.writeUInt32BE(crc(body));
    return Buffer.concat([length, body, checksum]);
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header.set([8, 2, 0, 0, 0], 8);
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/** Uploads a seeded image to the Storage emulator; a bucket the app isn't configured for just leaves what `fallback` says. */
async function uploadSeedImage(
  path: string,
  fallback: string,
  color: [number, number, number] = [86, 140, 76],
) {
  const bucket =
    process.env.STORAGE_BUCKET ??
    process.env.VITE_FIREBASE_STORAGE_BUCKET ??
    'moondreams-dev-apps.firebasestorage.app';
  const host = process.env.FIREBASE_STORAGE_EMULATOR_HOST ?? '127.0.0.1:9199';
  const response = await fetch(
    `http://${host}/v0/b/${bucket}/o?name=${encodeURIComponent(path)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'image/png', Authorization: 'Bearer owner' },
      body: makeSquarePng(64, color),
    },
  ).catch(() => null);
  if (!response?.ok) {
    console.warn(
      `Pinch seed: could not upload an image to the Storage emulator, so ${fallback}.`,
    );
  }
  return response?.ok === true;
}

const line = (
  id: string,
  ingredientId: string,
  amount: number,
  unit: string,
  group: string | null = null,
) => ({ id, ingredientId, amount, unit, note: null, group });

// Lines written before groups have no `group` key; the nachos keep that shape so the legacy path stays exercised.
const legacyLine = (
  id: string,
  ingredientId: string,
  amount: number,
  unit: string,
) => ({ id, ingredientId, amount, unit, note: null });

// Adobo's lines sit under two headings, with soy sauce and garlic in both.
const FOR_THE_CHICKEN = 'For the chicken';
const FOR_THE_SAUCE = 'For the sauce';

const SEED_RECIPES = [
  {
    id: 'seed-pinch-recipe-adobo',
    // Alex starred two recipes; nachos and the chili have no `isFavorite` key, the shape from before the star.
    isFavorite: true,
    title: 'Adobo chicken',
    description: 'Sticky, tangy chicken thighs braised in soy and vinegar.',
    servings: 4,
    prepMinutes: 10,
    cookMinutes: 35,
    coverPath: null,
    coverUrl: null,
    ingredients: [
      line('adobo-1', 'cat-chicken-thigh', 2, 'LB', FOR_THE_CHICKEN),
      line('adobo-2', 'cat-soy-sauce', 0.25, 'CUP', FOR_THE_CHICKEN),
      line('adobo-4', 'cat-garlic', 4, 'EACH', FOR_THE_CHICKEN),
      line('adobo-6', 'cat-black-pepper', 1, 'TSP', FOR_THE_CHICKEN),
      line('adobo-8', 'cat-soy-sauce', 2, 'TBSP', FOR_THE_SAUCE),
      line('adobo-3', 'cat-white-vinegar', 0.25, 'CUP', FOR_THE_SAUCE),
      line('adobo-9', 'cat-garlic', 2, 'EACH', FOR_THE_SAUCE),
      line('adobo-5', 'cat-bay-leaves', 2, 'EACH', FOR_THE_SAUCE),
      {
        id: 'adobo-7',
        ingredientId: 'cat-salt',
        amount: null,
        unit: 'EACH',
        note: 'to taste',
        group: FOR_THE_SAUCE,
      },
    ],
    steps: [
      'Marinate the chicken in the soy sauce, garlic and pepper for 30 minutes.',
      'Add the vinegar, the rest of the soy sauce and garlic, and the bay leaves, then simmer covered for 25 minutes.',
      'Uncover and reduce the sauce until it clings to the chicken.',
    ],
    // Nachos and the chili keep the older shape (no `care` key) so the legacy path stays exercised.
    care: {
      fridgeDays: 3,
      freezerDays: 90,
      reheat:
        'Warm it in a covered pan over low heat with a splash of water, about 10 minutes.',
      tip: 'Keep the sauce with the chicken. It thickens in the fridge, so loosen it with a little water.',
    },
    // The other recipes have no `links` key, the shape from before links.
    links: [
      {
        id: 'seed-pinch-link-adobo-video',
        kind: 'HOW_TO',
        label: null,
        url: 'https://www.youtube.com/watch?v=aqz-KE-bpKQ',
      },
      {
        id: 'seed-pinch-link-adobo-article',
        kind: 'ARTICLE',
        label: null,
        url: 'https://www.seriouseats.com/',
      },
    ],
    nutritionOverride: null,
    source: 'MANUAL',
    sourceId: 'seed-pinch-source-recipe-cards',
    collectionIds: [
      'seed-pinch-collection-high-protein',
      'seed-pinch-collection-weeknight',
    ],
    // Nachos hold two categories and the rice none (no `categories` key, the shape from before categories), so the filter shows "No category".
    categories: ['MAIN'],
  },
  {
    id: 'seed-pinch-recipe-rice',
    isFavorite: true,
    title: 'Cilantro lime rice',
    description: null,
    servings: 4,
    prepMinutes: 5,
    cookMinutes: 20,
    coverPath: null,
    coverUrl: null,
    ingredients: [
      line('rice-1', 'cat-jasmine-rice', 1, 'CUP'),
      line('rice-2', 'cat-cilantro', 0.25, 'CUP'),
      line('rice-3', 'cat-lime-juice', 2, 'TBSP'),
      line('rice-4', 'cat-salt', 0.5, 'TSP'),
      line('rice-5', 'cat-olive-oil', 1, 'TBSP'),
    ],
    steps: [
      'Cook the rice.',
      'Fold in the cilantro, lime juice, salt and olive oil.',
    ],
    care: { fridgeDays: 3, freezerDays: null, reheat: null, tip: null },
    nutritionOverride: null,
    source: 'MANUAL',
    sourceId: 'seed-pinch-source-serious-eats',
    collectionIds: ['seed-pinch-collection-weeknight'],
  },
  {
    id: 'seed-pinch-recipe-nachos',
    title: 'Game night nachos',
    description: 'Sheet-pan nachos built on a bag of Doritos.',
    servings: 6,
    prepMinutes: null,
    cookMinutes: 10,
    coverPath: null,
    coverUrl: null,
    ingredients: [
      legacyLine('nachos-1', 'seed-pinch-ingredient-doritos', 9, 'OZ'),
      legacyLine('nachos-2', 'cat-cheddar', 8, 'OZ'),
      legacyLine('nachos-3', 'cat-jalapeno', 2, 'EACH'),
      legacyLine('nachos-4', 'cat-salsa', 0.5, 'CUP'),
    ],
    steps: [],
    // Typed over the added-up calories; the other metrics stay derived.
    nutritionOverride: { calories: 520, protein: null, carbs: null, fat: null },
    source: 'MANUAL',
    sourceId: null,
    collectionIds: ['seed-pinch-collection-high-protein'],
    categories: ['SNACK', 'MAIN'],
  },
  // Deleted by Alex while a planned day still used it, so it is archived: hidden from lists and pickers, still named on that day.
  {
    id: 'seed-pinch-recipe-chili',
    title: 'Retired chili',
    description: null,
    servings: 4,
    prepMinutes: null,
    cookMinutes: 40,
    coverPath: null,
    coverUrl: null,
    ingredients: [
      line('chili-1', 'cat-jasmine-rice', 1, 'CUP'),
      line('chili-2', 'cat-salt', 1, 'TSP'),
    ],
    steps: ['Simmer until thick.'],
    nutritionOverride: null,
    source: 'MANUAL',
    sourceId: 'seed-pinch-source-nyt',
    isArchived: true,
  },
];

const HOUR_MS = 60 * 60 * 1000;

// Hours after the seed's base time. Sorting by created, edited and name gives three different orders; the shared Adobo chicken and Adobo and rice keep the base time because a share compares the original's `updatedAt` with the copy's.
const SEED_ORDER_HOURS: Record<string, { created: number; updated: number }> = {
  'seed-pinch-recipe-rice': { created: 4, updated: 4 },
  'seed-pinch-recipe-nachos': { created: 2, updated: 6 },
  'seed-pinch-meal-snack-plate': { created: 1, updated: 3 },
};

type SeedMealType =
  'BREAKFAST' | 'LUNCH' | 'DINNER' | 'SNACK' | 'DESSERT' | 'DRINK';

const item = (
  id: string,
  kind: 'RECIPE' | 'INGREDIENT',
  refId: string,
  servings: number,
) => ({
  id,
  kind,
  refId,
  servings,
});

// Days are offsets from today (UTC midnight): an empty day, one meal, a full day, five meals and a day of ten, so the cells and drawer show every size.
// "Adobo and rice" is starred; "Snack plate" has no `isFavorite` or `categories` key, the shape from before favorites and categories.
const SEED_MEALS = [
  {
    id: 'seed-pinch-meal-adobo-rice',
    name: 'Adobo and rice',
    isFavorite: true,
    categories: ['MAIN'],
    items: [
      item('a', 'RECIPE', 'seed-pinch-recipe-adobo', 2),
      item('b', 'RECIPE', 'seed-pinch-recipe-rice', 2),
    ],
  },
  {
    id: 'seed-pinch-meal-snack-plate',
    name: 'Snack plate',
    items: [
      item('a', 'INGREDIENT', 'seed-pinch-ingredient-doritos', 1),
      item('b', 'INGREDIENT', 'cat-banana', 1),
    ],
  },
];

const PLANNED_BLUEPRINTS: {
  day: number;
  type: SeedMealType;
  items: ReturnType<typeof item>[];
  meal?: string;
  fixedWithoutPrice?: {
    leftOut: { kind: string; ingredientId: string }[];
    nutrition: ReturnType<typeof nutrition>;
    lines: { itemId: string; costCents: number | null }[];
  };
}[] = [
  {
    day: -3,
    type: 'DINNER',
    items: [item('a', 'RECIPE', 'seed-pinch-recipe-adobo', 4)],
  },
  {
    day: -2,
    type: 'DINNER',
    items: [item('a', 'RECIPE', 'seed-pinch-recipe-chili', 2)],
  },
  {
    day: 0,
    type: 'BREAKFAST',
    items: [item('a', 'INGREDIENT', 'cat-banana', 1)],
  },
  {
    day: 0,
    type: 'DINNER',
    items: [
      item('a', 'RECIPE', 'seed-pinch-recipe-adobo', 2),
      item('b', 'RECIPE', 'seed-pinch-recipe-rice', 2),
    ],
  },
  {
    day: 0,
    type: 'DESSERT',
    items: [item('a', 'INGREDIENT', 'seed-pinch-ingredient-doritos', 1)],
  },
  {
    day: 1,
    type: 'LUNCH',
    items: [item('a', 'RECIPE', 'seed-pinch-recipe-rice', 1)],
  },
  // Planned from "Adobo and rice", then tweaked: the saved meal still has two servings of each.
  {
    day: 1,
    type: 'DINNER',
    meal: 'seed-pinch-meal-adobo-rice',
    items: [
      item('a', 'RECIPE', 'seed-pinch-recipe-adobo', 3),
      item('b', 'RECIPE', 'seed-pinch-recipe-rice', 2),
    ],
  },
  {
    day: 2,
    type: 'BREAKFAST',
    items: [item('a', 'INGREDIENT', 'cat-banana', 2)],
  },
  {
    day: 2,
    type: 'LUNCH',
    items: [item('a', 'RECIPE', 'seed-pinch-recipe-rice', 1)],
  },
  {
    day: 2,
    type: 'DINNER',
    items: [item('a', 'RECIPE', 'seed-pinch-recipe-nachos', 3)],
  },
  {
    day: 2,
    type: 'SNACK',
    items: [item('a', 'INGREDIENT', 'seed-pinch-ingredient-doritos', 1)],
  },
  { day: 2, type: 'DRINK', items: [item('a', 'INGREDIENT', 'cat-banana', 1)] },
  ...Array.from({ length: 10 }, (_, index) => ({
    day: 5,
    type: (
      [
        'BREAKFAST',
        'LUNCH',
        'DINNER',
        'SNACK',
        'DESSERT',
        'DRINK',
      ] as SeedMealType[]
    )[index % 6],
    items: [item('a', 'RECIPE', 'seed-pinch-recipe-rice', 1 + (index % 3) / 2)],
  })),
  // Fixed the morning after, before chicken feet had a price, so it says "Wasn't priced" until the day is priced again.
  // Written the way snapshots were before `repricedAt` existed, so that shape stays exercised.
  {
    day: -3,
    type: 'LUNCH',
    items: [item('a', 'INGREDIENT', 'seed-pinch-ingredient-chicken-feet', 1)],
    fixedWithoutPrice: {
      leftOut: [
        {
          kind: 'NO_PRODUCT',
          ingredientId: 'seed-pinch-ingredient-chicken-feet',
        },
      ],
      nutrition: nutrition(215, 19.4, 0.2, 14.6),
      lines: [{ itemId: 'a', costCents: null }],
    },
  },
];

// Fixed ids from the share alphabet, so a seeded link can be opened by hand: /pinch/shared/<id>.
export const SEED_SHARE_IDS = {
  recipe: 'seedsharercp23456789abcdef',
  meal: 'seedsharemeal23456789abcde',
};

const CATALOG_NAMES = new Map(
  CATALOG_INGREDIENTS.map((entry) => [entry.id, entry.name]),
);

interface SeedRecipeLike {
  title: string;
  description: string | null;
  servings: number;
  prepMinutes: number | null;
  cookMinutes: number | null;
  ingredients: {
    ingredientId: string;
    amount: number | null;
    unit: string;
    note: string | null;
    group?: string | null;
  }[];
  steps: string[];
  care?: object | null;
  links?: { kind: string; label: string | null; url: string }[];
}

// What the app builds from a recipe: lines named the way a visitor reads them and nothing of the owner's. The share's own allowlist then rebuilds it.
const toShareRecipe = (recipe: SeedRecipeLike) => ({
  title: recipe.title,
  description: recipe.description,
  servings: recipe.servings,
  prepMinutes: recipe.prepMinutes,
  cookMinutes: recipe.cookMinutes,
  ingredients: recipe.ingredients.map((entry) => ({
    name: CATALOG_NAMES.get(entry.ingredientId) ?? entry.ingredientId,
    catalogId: entry.ingredientId.startsWith('cat-')
      ? entry.ingredientId
      : null,
    amount: entry.amount,
    unit: entry.unit,
    note: entry.note,
    group: entry.group ?? null,
  })),
  steps: recipe.steps,
  care: recipe.care ?? null,
  links: (recipe.links ?? []).map(({ kind, label, url }) => ({
    kind,
    label,
    url,
  })),
  hasCover: false,
});

const findSeedRecipe = (id: string) =>
  SEED_RECIPES.find((recipe) => recipe.id === id) ?? SEED_RECIPES[0];

/** Alex's two shares as `changePinchShare` would have written them: Adobo chicken (taken from the recipe as it is now, with a cover when `hasRecipeCover`) and "Adobo and rice" (taken before its last edit, so the owner's list reads it as changed since). */
export function buildSeedShares(
  ownerUid: string,
  now: number,
  hasRecipeCover: boolean,
) {
  const recipeSourceId = 'seed-pinch-recipe-adobo';
  const meal = SEED_MEALS[0];
  const recipeIds = Array.from(new Set(meal.items.map((entry) => entry.refId)));
  const recipeCopy = toCoveredCopy(
    {
      recipe: toSharedRecipe(toShareRecipe(findSeedRecipe(recipeSourceId))),
      meal: null,
    },
    new Set(hasRecipeCover ? [0] : []),
  );
  const mealCopy = {
    recipe: null,
    meal: toSharedMeal({
      name: meal.name,
      recipes: recipeIds.map((id) => toShareRecipe(findSeedRecipe(id))),
      items: meal.items.map((entry) => ({
        kind: 'RECIPE',
        servings: entry.servings,
        recipeIndex: recipeIds.indexOf(entry.refId),
      })),
    }),
  };
  const recipeAt = now - 3 * DAY_MS;
  const mealAt = now - 16 * DAY_MS;
  const sourceUpdatedAt = now - 14 * DAY_MS;
  return [
    {
      share: {
        id: SEED_SHARE_IDS.recipe,
        ownerUid,
        kind: 'RECIPE',
        sourceId: recipeSourceId,
        title: 'Adobo chicken',
        sourceUpdatedAt,
        createdAt: recipeAt,
        updatedAt: recipeAt,
      },
      snapshot: {
        id: SEED_SHARE_IDS.recipe,
        kind: 'RECIPE',
        ...recipeCopy,
        updatedAt: recipeAt,
      },
    },
    {
      share: {
        id: SEED_SHARE_IDS.meal,
        ownerUid,
        kind: 'MEAL',
        sourceId: meal.id,
        title: meal.name,
        sourceUpdatedAt: mealAt,
        createdAt: mealAt,
        updatedAt: mealAt,
      },
      snapshot: {
        id: SEED_SHARE_IDS.meal,
        kind: 'MEAL',
        ...mealCopy,
        updatedAt: mealAt,
      },
    },
  ];
}

// Alex's own kitchen; every other fixture account starts with an empty one.
export async function seedPinch(context: SeedContext): Promise<SeedResult> {
  const alex = FIXTURE_USERS.partnerOne;
  const kitchenRef = context.firestore
    .collection('apps')
    .doc('pinch')
    .collection('kitchens')
    .doc(alex.uid);
  const createdAt = context.now - 14 * DAY_MS;
  const today = Math.floor(context.now / DAY_MS) * DAY_MS;

  const customImagePath = `apps/pinch/kitchens/${alex.uid}/stores/${CUSTOM_STORE.id}/logo.webp`;
  await uploadSeedImage(customImagePath, 'Green Market shows a letter tile');
  const hasShareCover = await uploadSeedImage(
    shareCoverPath(SEED_SHARE_IDS.recipe, 0),
    'the shared Adobo chicken has no picture',
    [176, 108, 52],
  );
  const seedShares = buildSeedShares(alex.uid, context.now, hasShareCover);

  await Promise.all([
    // Alex already closed the nudge for the vinegar, so the adobo recipe's fill-in starts one short.
    kitchenRef.set({
      uid: alex.uid,
      showNutrition: {
        calories: false,
        protein: false,
        carbs: false,
        fat: false,
      },
      dismissedNudges: { 'NO_PRODUCT:cat-white-vinegar': createdAt },
      createdAt,
      updatedAt: createdAt,
    }),
    ...CATALOG_STORE_SEEDS.map((store) =>
      kitchenRef.collection('stores').doc(store.id).set({
        id: store.id,
        name: store.name,
        catalogStoreId: store.id,
        imagePath: null,
        createdAt,
        updatedAt: createdAt,
      }),
    ),
    kitchenRef.collection('stores').doc(CUSTOM_STORE.id).set({
      id: CUSTOM_STORE.id,
      name: CUSTOM_STORE.name,
      catalogStoreId: null,
      imagePath: customImagePath,
      createdAt,
      updatedAt: createdAt,
    }),
    ...SEED_FAMILIES.map((family) =>
      kitchenRef
        .collection('families')
        .doc(family.id)
        .set({ ...family, createdAt, updatedAt: createdAt }),
    ),
    ...SEED_SOURCES.map((source) =>
      kitchenRef
        .collection('sources')
        .doc(source.id)
        .set({ ...source, createdAt, updatedAt: createdAt }),
    ),
    ...SEED_COLLECTIONS.map((collection) =>
      kitchenRef
        .collection('collections')
        .doc(collection.id)
        .set({ ...collection, createdAt, updatedAt: createdAt }),
    ),
    ...SEED_IDEAS.map((entry, index) =>
      kitchenRef
        .collection('ideas')
        .doc(entry.id)
        .set({
          ...entry,
          createdAt: createdAt + index,
          updatedAt: createdAt + index,
        }),
    ),
    ...SEED_COOKS.map(({ daysAgo, hour, ...cook }) => {
      const cookedAt = today - daysAgo * DAY_MS + hour * 3_600_000;
      return kitchenRef
        .collection('cooks')
        .doc(cook.id)
        .set({ ...cook, cookedAt, createdAt: cookedAt, updatedAt: cookedAt });
    }),
    ...SEED_CONTAINERS.map(({ eatByDays, events, ...container }) => {
      const formatDay = (ms: number) =>
        new Date(ms).toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
          timeZone: 'UTC',
        });
      const history = events.map(({ daysAgo, hour, ...event }) => ({
        ...event,
        note:
          event.note === 'EAT_BY_MOVED'
            ? `Eat by ${formatDay(today + (eatByDays - 2) * DAY_MS)} → ${formatDay(today + eatByDays * DAY_MS)}`
            : event.note,
        at: today - daysAgo * DAY_MS + hour * 3_600_000,
      }));
      const lastAt = history[history.length - 1].at;
      return kitchenRef
        .collection('containers')
        .doc(container.id)
        .set({
          ...container,
          eatBy: today + eatByDays * DAY_MS,
          history,
          createdAt: history[0].at,
          updatedAt: lastAt,
        });
    }),
    ...SEED_PACKAGES.map(({ expiresInDays, openedDaysAgo, events, ...pkg }) => {
      const history = events.map(({ daysAgo, ...event }) => ({
        ...event,
        note: null,
        at: today - daysAgo * DAY_MS + 10 * 3_600_000,
      }));
      return kitchenRef
        .collection('packages')
        .doc(pkg.id)
        .set({
          ...pkg,
          productId: null,
          expiresAt:
            expiresInDays === null ? null : today + expiresInDays * DAY_MS,
          openedAt:
            openedDaysAgo === null
              ? null
              : today - openedDaysAgo * DAY_MS + 10 * 3_600_000,
          status: 'IN_STOCK',
          history,
          createdAt: history[0].at,
          updatedAt: history[history.length - 1].at,
        });
    }),
    ...SEED_NOTES.map(({ daysAgo, hour, ...entry }) => {
      const at = today - daysAgo * DAY_MS + hour * 3_600_000;
      return kitchenRef
        .collection('notes')
        .doc(entry.id)
        .set({ ...entry, createdAt: at, updatedAt: at });
    }),
    ...SEED_SHOPPING.map((entry, index) =>
      kitchenRef
        .collection('shoppingItems')
        .doc(entry.id)
        .set({
          ...entry,
          createdAt: createdAt + index,
          updatedAt: createdAt + index,
        }),
    ),
    ...PLANNED_BLUEPRINTS.map((blueprint, index) => {
      const id = `seed-pinch-planned-${index + 1}`;
      return kitchenRef
        .collection('plannedMeals')
        .doc(id)
        .set({
          id,
          date: today + blueprint.day * DAY_MS,
          mealType: blueprint.type,
          name:
            SEED_MEALS.find((meal) => meal.id === blueprint.meal)?.name ?? null,
          sourceMealId: blueprint.meal ?? null,
          items: blueprint.items,
          refIds: Array.from(
            new Set(blueprint.items.map((entry) => entry.refId)),
          ),
          snapshot: blueprint.fixedWithoutPrice
            ? {
                frozenAt: today - 2 * DAY_MS + 9 * 3_600_000,
                costCents: null,
                ...blueprint.fixedWithoutPrice,
              }
            : null,
          createdAt: createdAt + index,
          updatedAt: createdAt + index,
        });
    }),
    ...seedShares.flatMap(({ share, snapshot }) => [
      context.firestore.doc(`apps/pinch/shares/${share.id}`).set(share),
      context.firestore
        .doc(`apps/pinch/shareSnapshots/${snapshot.id}`)
        .set(snapshot),
    ]),
    ...SEED_MEALS.map((meal) =>
      kitchenRef
        .collection('meals')
        .doc(meal.id)
        .set({
          ...meal,
          createdAt:
            createdAt + (SEED_ORDER_HOURS[meal.id]?.created ?? 0) * HOUR_MS,
          updatedAt:
            createdAt + (SEED_ORDER_HOURS[meal.id]?.updated ?? 0) * HOUR_MS,
        }),
    ),
    ...SEED_RECIPES.map((recipe) =>
      kitchenRef
        .collection('recipes')
        .doc(recipe.id)
        .set({
          isArchived: false,
          ...recipe,
          createdAt:
            createdAt + (SEED_ORDER_HOURS[recipe.id]?.created ?? 0) * HOUR_MS,
          updatedAt:
            createdAt + (SEED_ORDER_HOURS[recipe.id]?.updated ?? 0) * HOUR_MS,
        }),
    ),
    ...SEED_PRODUCTS.map((product) =>
      kitchenRef
        .collection('products')
        .doc(product.id)
        .set({ ...product, createdAt, updatedAt: createdAt }),
    ),
    ...SEED_INGREDIENTS.map((ingredient) =>
      kitchenRef
        .collection('ingredients')
        .doc(ingredient.id)
        .set({ ...ingredient, createdAt, updatedAt: createdAt }),
    ),
  ]);

  return {
    ...EMPTY_SEED_RESULT,
    firestoreDocuments:
      SEED_FAMILIES.length +
      SEED_SOURCES.length +
      SEED_COLLECTIONS.length +
      SEED_SHOPPING.length +
      SEED_COOKS.length +
      SEED_CONTAINERS.length +
      SEED_PACKAGES.length +
      SEED_NOTES.length +
      SEED_IDEAS.length +
      SEED_INGREDIENTS.length +
      SEED_PRODUCTS.length +
      SEED_RECIPES.length +
      CATALOG_STORE_SEEDS.length +
      PLANNED_BLUEPRINTS.length +
      SEED_MEALS.length +
      seedShares.length * 2 +
      2,
  };
}
