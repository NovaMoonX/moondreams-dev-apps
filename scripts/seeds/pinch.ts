import { deflateSync } from 'node:zlib';

import {
  EMPTY_SEED_RESULT,
  FIXTURE_USERS,
  type SeedContext,
  type SeedResult,
} from './types.ts';

const DAY_MS = 86_400_000;

const SEED_FAMILIES = [{ id: 'seed-pinch-family-chips', name: 'Chips' }];

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
    iconKey: '1f32e',
    nutritionPer100g: nutrition(497, 7, 60, 25),
    servingAmount: 28,
    servingUnit: 'G',
  },
  {
    ...baseIngredient,
    id: 'seed-pinch-ingredient-chicken-feet',
    name: 'Chicken feet',
    familyId: 'cat-fam-chicken',
    iconKey: '1f357',
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
    source: 'MANUAL',
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
    source: 'MANUAL',
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
    source: 'MANUAL',
  },
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
    ...SEED_RECIPES.map((recipe) =>
      kitchenRef
        .collection('recipes')
        .doc(recipe.id)
        .set({ ...recipe, createdAt, updatedAt: createdAt }),
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
      SEED_INGREDIENTS.length +
      SEED_PRODUCTS.length +
      SEED_RECIPES.length +
      CATALOG_STORE_SEEDS.length +
      2,
  };
}
