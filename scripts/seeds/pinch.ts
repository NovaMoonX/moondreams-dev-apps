import { deflateSync } from 'node:zlib';

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

const shoppingItem = (
  ingredientId: string,
  unit: string,
  amount: number,
  isChecked: boolean,
) => ({
  id: `${ingredientId}__${unit}`,
  ingredientId,
  amount,
  unit,
  isChecked,
});

const SEED_SHOPPING = [
  shoppingItem('cat-chicken-thigh', 'LB', 2, false),
  shoppingItem('cat-chicken-breast', 'LB', 1, false),
  shoppingItem('cat-soy-sauce', 'CUP', 0.25, false),
  shoppingItem('cat-garlic', 'EACH', 6, false),
  shoppingItem('cat-lime-juice', 'TBSP', 2, true),
  shoppingItem('cat-cilantro', 'CUP', 0.25, true),
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

/** Uploads the seeded store's image to the Storage emulator; a bucket the app isn't configured for just leaves the letter tile. */
async function uploadSeedImage(path: string) {
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
      body: makeSquarePng(64, [86, 140, 76]),
    },
  ).catch(() => null);
  if (!response?.ok) {
    console.warn(
      'Pinch seed: could not upload the store image to the Storage emulator, so Green Market shows a letter tile.',
    );
  }
}

const line = (
  id: string,
  ingredientId: string,
  amount: number,
  unit: string,
) => ({ id, ingredientId, amount, unit, note: null });

const SEED_RECIPES = [
  {
    id: 'seed-pinch-recipe-adobo',
    title: 'Adobo chicken',
    description: 'Sticky, tangy chicken thighs braised in soy and vinegar.',
    servings: 4,
    prepMinutes: 10,
    cookMinutes: 35,
    coverPath: null,
    ingredients: [
      line('adobo-1', 'cat-chicken-thigh', 2, 'LB'),
      line('adobo-2', 'cat-soy-sauce', 0.25, 'CUP'),
      line('adobo-3', 'cat-white-vinegar', 0.25, 'CUP'),
      line('adobo-4', 'cat-garlic', 6, 'EACH'),
      line('adobo-5', 'cat-bay-leaves', 2, 'EACH'),
      line('adobo-6', 'cat-black-pepper', 1, 'TSP'),
    ],
    steps: [
      'Marinate the chicken in the soy sauce, vinegar and garlic for 30 minutes.',
      'Simmer everything with the bay leaves and pepper, covered, for 25 minutes.',
      'Uncover and reduce the sauce until it clings to the chicken.',
    ],
    nutritionOverride: null,
    source: 'MANUAL',
    sourceId: 'seed-pinch-source-recipe-cards',
  },
  {
    id: 'seed-pinch-recipe-rice',
    title: 'Cilantro lime rice',
    description: null,
    servings: 4,
    prepMinutes: 5,
    cookMinutes: 20,
    coverPath: null,
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
    nutritionOverride: null,
    source: 'MANUAL',
    sourceId: 'seed-pinch-source-serious-eats',
  },
  {
    id: 'seed-pinch-recipe-nachos',
    title: 'Game night nachos',
    description: 'Sheet-pan nachos built on a bag of Doritos.',
    servings: 6,
    prepMinutes: null,
    cookMinutes: 10,
    coverPath: null,
    ingredients: [
      line('nachos-1', 'seed-pinch-ingredient-doritos', 9, 'OZ'),
      line('nachos-2', 'cat-cheddar', 8, 'OZ'),
      line('nachos-3', 'cat-jalapeno', 2, 'EACH'),
      line('nachos-4', 'cat-salsa', 0.5, 'CUP'),
    ],
    steps: [],
    // Typed over the added-up calories; the other metrics stay derived.
    nutritionOverride: { calories: 520, protein: null, carbs: null, fat: null },
    source: 'MANUAL',
    sourceId: null,
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
const SEED_MEALS = [
  {
    id: 'seed-pinch-meal-adobo-rice',
    name: 'Adobo and rice',
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
];

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
  await uploadSeedImage(customImagePath);

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
          snapshot: null,
          createdAt: createdAt + index,
          updatedAt: createdAt + index,
        });
    }),
    ...SEED_MEALS.map((meal) =>
      kitchenRef
        .collection('meals')
        .doc(meal.id)
        .set({ ...meal, createdAt, updatedAt: createdAt }),
    ),
    ...SEED_RECIPES.map((recipe) =>
      kitchenRef
        .collection('recipes')
        .doc(recipe.id)
        .set({
          isArchived: false,
          ...recipe,
          createdAt,
          updatedAt: createdAt,
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
      SEED_SHOPPING.length +
      SEED_COOKS.length +
      SEED_IDEAS.length +
      SEED_INGREDIENTS.length +
      SEED_PRODUCTS.length +
      SEED_RECIPES.length +
      CATALOG_STORE_SEEDS.length +
      PLANNED_BLUEPRINTS.length +
      SEED_MEALS.length +
      2,
  };
}
