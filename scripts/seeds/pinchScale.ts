import type { Firestore } from 'firebase-admin/firestore';

import {
  FIXTURE_USERS,
  type SeedContext,
  type SeedResult,
  EMPTY_SEED_RESULT,
} from './types.ts';

const DAY_MS = 86_400_000;
const FAMILY_COUNT = 40;
const INGREDIENT_COUNT = 300;
const PRODUCT_COUNT = 150;
const RECIPE_COUNT = 200;
const MEAL_COUNT = 60;
const DAYS_BACK = 45;
const DAYS_AHEAD = 45;
const MEALS_PER_DAY = 12;
const STORE_IDS = [
  'cat-store-walmart',
  'cat-store-costco',
  'cat-store-target',
  'cat-store-kroger',
  'cat-store-safeway',
  'cat-store-albertsons',
  'cat-store-publix',
  'cat-store-whole-foods',
  'cat-store-trader-joes',
  'cat-store-aldi',
  'cat-store-lidl',
  'cat-store-sams-club',
];
const STORE_NAMES: Record<string, string> = {
  'cat-store-walmart': 'Walmart',
  'cat-store-costco': 'Costco',
  'cat-store-target': 'Target',
  'cat-store-kroger': 'Kroger',
  'cat-store-safeway': 'Safeway',
  'cat-store-albertsons': 'Albertsons',
  'cat-store-publix': 'Publix',
  'cat-store-whole-foods': 'Whole Foods Market',
  'cat-store-trader-joes': "Trader Joe's",
  'cat-store-aldi': 'Aldi',
  'cat-store-lidl': 'Lidl',
  'cat-store-sams-club': "Sam's Club",
};
const MEAL_TYPES = [
  'BREAKFAST',
  'LUNCH',
  'DINNER',
  'SNACK',
  'DESSERT',
  'DRINK',
] as const;
const FAMILY_WORDS = [
  'Greens',
  'Roots',
  'Grains',
  'Beans',
  'Nuts',
  'Spices',
  'Herbs',
  'Sauces',
  'Pickles',
  'Breads',
  'Noodles',
  'Seeds',
  'Fruit',
  'Berries',
  'Citrus',
  'Mushrooms',
  'Squash',
  'Peppers',
  'Stocks',
  'Oils',
  'Vinegars',
  'Cheeses',
  'Yogurts',
  'Smoked',
  'Cured',
  'Frozen',
  'Canned',
  'Dried',
  'Fermented',
  'Sweeteners',
  'Flours',
  'Pastas',
  'Salts',
  'Teas',
  'Coffees',
  'Chocolates',
  'Crackers',
  'Jams',
  'Pastes',
  'Broths',
];
const INGREDIENT_WORDS = [
  'Garden',
  'Smoky',
  'Sweet',
  'Wild',
  'Toasted',
  'Golden',
  'Rustic',
  'Spiced',
  'Silky',
  'Crisp',
  'Tangy',
  'Savory',
  'Fresh',
  'Aged',
  'Roasted',
  'Pickled',
  'Minced',
  'Ground',
  'Whole',
  'Baby',
];
const RECIPE_WORDS = [
  'Skillet',
  'Sheet-pan',
  'Slow-cooker',
  'One-pot',
  'Weeknight',
  'Sunday',
  'Crispy',
  'Creamy',
  'Herby',
  'Spicy',
  'Lemony',
  'Cozy',
];
const DISH_WORDS = [
  'stew',
  'bowls',
  'tacos',
  'curry',
  'salad',
  'pasta',
  'soup',
  'wraps',
  'bake',
  'fried rice',
  'noodles',
  'chili',
  'hash',
  'flatbread',
  'dumplings',
];
const MASS_UNITS = ['G', 'OZ', 'LB', 'KG'] as const;
const IDEA_SITES = [
  'Serious Eats',
  'NYT Cooking',
  'Smitten Kitchen',
  'Budget Bytes',
  'Minimalist Baker',
];
const SHOPPING_UNITS = ['G', 'EACH', 'LB', 'CUP', 'OZ'] as const;
const SHOPPING_ITEM_COUNT = 80;
const IDEA_COUNT = 80;
// Cooks per recipe by recipe index (about 330 in all); recipe 1 gets twelve, enough for the history's "Show N more".
const COOKS_PER_RECIPE = [0, 1, 2, 3, 1, 1, 5, 0, 1, 2];
const COOK_DAYS_BACK = 60;
// Notes per recipe by recipe index (about 310 in all); recipe 1 gets twelve, enough for the journal's "Show N more".
const NOTES_PER_RECIPE = [0, 2, 2, 1, 3, 1, 2, 1, 0, 3];
const NOTE_TEXTS = [
  'Needed more salt than I thought.',
  'Cut the cooking time by five minutes, it was done early.',
  'Kids asked for this again. Doubling it next time.',
  'Too sweet. Half the sugar.',
  'Great with a squeeze of lemon at the end.',
  'Left it in the oven a bit long, the edges caught. Check at 20 minutes.',
  "A friend who doesn't eat dairy liked it with oat milk.",
  "Doubled the garlic and it still wasn't enough.",
];
const TWEAKS = [
  ['Salt 1 → 1.5 tsp'],
  [
    'Cook time 30 → 25 min',
    'Step 2 now reads: “Cook until done, about 20 minutes.”',
  ],
  ['Serves 4 → 6', 'Added Lemon juice, 1 tbsp'],
  ['Removed Sugar'],
];
// Seven lines and "and 3 more": the longest a tweak can be.
const BIG_TWEAK = [
  'Salt 1 → 1.5 tsp',
  'Serves 4 → 6',
  'Cook time 30 → 25 min',
  'Added Lemon juice, 1 tbsp',
  'Removed Sugar',
  'Step 2 now reads: “Cook until done, about 20 minutes.”',
  'Ingredients reordered',
  'and 3 more',
];
const SHOPPING_FAMILY_COUNT = 25;
// The last label is long on purpose, to see a name wrap on a phone.
const SOURCE_LABELS = [
  'Serious Eats',
  'NYT Cooking',
  "Mom's recipe cards",
  'Bon Appétit',
  'Budget Bytes',
  'Smitten Kitchen',
  'Minimalist Baker',
  "Grandma's binder",
  'Half Baked Harvest',
  'Food52',
  'Love and Lemons',
  'The big spiral-bound community cookbook from the Maple Street church fair',
];

/** Deterministic, so the same fixture comes out on every run. */
const makeRandom = (seed: number) => {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

const chunk = <T>(items: T[], size: number) =>
  Array.from({ length: Math.ceil(items.length / size) }, (_, index) =>
    items.slice(index * size, (index + 1) * size),
  );

async function writeAll(
  firestore: Firestore,
  writes: { path: string; data: Record<string, unknown> }[],
) {
  for (const group of chunk(writes, 400)) {
    const batch = firestore.batch();
    group.forEach(({ path, data }) => batch.set(firestore.doc(path), data));
    await batch.commit();
  }
}

/** Seeds Taylor's kitchen with the volume a long-time cook might reach: 300 ingredients in 40 families, 150 products at 12 stores, 200 recipes from 12 sources, 60 saved meals, about 1,100 planned meals over three months, an 80-item shopping list, 80 recipe ideas, about 330 cooks and about 310 notes. Emulators only, and only when asked for (`npm run seed:pinch-scale`); `seed:reset` brings the baseline back. */
export async function seedPinchScale(
  context: SeedContext,
): Promise<SeedResult> {
  const { firestore } = context;
  const random = makeRandom(20260101);
  const pick = <T>(items: readonly T[]) =>
    items[Math.floor(random() * items.length)];
  const owner = FIXTURE_USERS.nineLivesCaretaker;
  const base = `apps/pinch/kitchens/${owner.uid}`;
  const createdAt = context.now - 60 * DAY_MS;
  const today = Math.floor(context.now / DAY_MS) * DAY_MS;
  const writes: { path: string; data: Record<string, unknown> }[] = [];
  const add = (path: string, data: Record<string, unknown>) =>
    writes.push({ path: `${base}/${path}`, data });

  writes.push({
    path: base,
    data: {
      uid: owner.uid,
      showNutrition: {
        calories: true,
        protein: true,
        carbs: false,
        fat: false,
      },
      dismissedNudges: {},
      createdAt,
      updatedAt: createdAt,
    },
  });

  const families = Array.from({ length: FAMILY_COUNT }, (_, index) => ({
    id: `scale-family-${index}`,
    name: `${FAMILY_WORDS[index % FAMILY_WORDS.length]}${index >= FAMILY_WORDS.length ? ` ${Math.floor(index / FAMILY_WORDS.length) + 1}` : ''}`,
  }));
  families.forEach((family) =>
    add(`families/${family.id}`, {
      ...family,
      createdAt,
      updatedAt: createdAt,
    }),
  );

  STORE_IDS.forEach((id) =>
    add(`stores/${id}`, {
      id,
      name: STORE_NAMES[id],
      catalogStoreId: id,
      imagePath: null,
      isArchived: false,
      createdAt,
      updatedAt: createdAt,
    }),
  );

  const ingredients = Array.from({ length: INGREDIENT_COUNT }, (_, index) => ({
    id: `scale-ingredient-${index}`,
    name: `${INGREDIENT_WORDS[index % INGREDIENT_WORDS.length]} ${families[index % FAMILY_COUNT].name.toLowerCase()} ${Math.floor(index / INGREDIENT_WORDS.length) + 1}`,
    familyId: families[index % FAMILY_COUNT].id,
    hasProduct: index % 2 === 0,
  }));
  const productIdByIngredient = new Map<string, string>();
  const products = ingredients
    .filter((ingredient) => ingredient.hasProduct)
    .slice(0, PRODUCT_COUNT)
    .map((ingredient, index) => {
      const sizeUnit = pick(MASS_UNITS);
      const product = {
        id: `scale-product-${index}`,
        ingredientId: ingredient.id,
        storeId: STORE_IDS[index % STORE_IDS.length],
        label: null,
        priceCents: 199 + Math.floor(random() * 2400),
        sizeAmount:
          sizeUnit === 'G'
            ? 250 + Math.floor(random() * 750)
            : 1 + Math.floor(random() * 5),
        sizeUnit,
        url: null,
      };
      productIdByIngredient.set(ingredient.id, product.id);
      return product;
    });
  products.forEach((product) =>
    add(`products/${product.id}`, {
      ...product,
      createdAt,
      updatedAt: createdAt,
    }),
  );
  ingredients.forEach((ingredient, index) =>
    add(`ingredients/${ingredient.id}`, {
      id: ingredient.id,
      catalogId: null,
      name: ingredient.name,
      familyId: ingredient.familyId,
      iconKey: null,
      nutritionPer100g:
        index % 10 < 7
          ? {
              calories: 20 + Math.floor(random() * 480),
              protein: Math.round(random() * 250) / 10,
              carbs: Math.round(random() * 700) / 10,
              fat: Math.round(random() * 300) / 10,
            }
          : null,
      servingAmount: 50,
      servingUnit: 'G',
      gramsPerMl: null,
      gramsEach: null,
      defaultProductId: productIdByIngredient.get(ingredient.id) ?? null,
      isArchived: false,
      createdAt,
      updatedAt: createdAt,
    }),
  );

  const sources = SOURCE_LABELS.map((label, index) => ({
    id: `scale-source-${index}`,
    label,
  }));
  sources.forEach((source) =>
    add(`sources/${source.id}`, {
      ...source,
      createdAt,
      updatedAt: createdAt,
    }),
  );

  const getSourceId = (index: number) => {
    const slot = index % 17;
    return slot >= 15 ? null : sources[Math.max(0, slot - 3)].id;
  };

  // Two recipes in four carry care and the rest keep the older shape with no key. It draws no random number, so nothing else in the fixture moves.
  const getCare = (index: number) => {
    if (index % 4 === 0) {
      return {
        care: {
          fridgeDays: 4,
          freezerDays: 90,
          reheat: 'Warm it in a covered pan over low heat, about 10 minutes.',
          tip: 'Keep any sauce in its own container.',
        },
      };
    }
    if (index % 4 === 1) {
      return {
        care: { fridgeDays: 3, freezerDays: null, reheat: null, tip: null },
      };
    }
    return {};
  };

  const recipes = Array.from({ length: RECIPE_COUNT }, (_, index) => {
    const lineCount = 3 + Math.floor(random() * 6);
    return {
      id: `scale-recipe-${index}`,
      title: `${RECIPE_WORDS[index % RECIPE_WORDS.length]} ${DISH_WORDS[index % DISH_WORDS.length]} ${Math.floor(index / DISH_WORDS.length) + 1}`,
      description:
        index % 3 === 0 ? 'A weeknight favorite from the scale kitchen.' : null,
      servings: 2 + Math.floor(random() * 5),
      prepMinutes: 5 + Math.floor(random() * 25),
      cookMinutes: index % 4 === 0 ? null : 10 + Math.floor(random() * 50),
      coverPath: null,
      ingredients: Array.from({ length: lineCount }, (_, lineIndex) => ({
        id: `scale-recipe-${index}-line-${lineIndex}`,
        ingredientId: pick(ingredients).id,
        amount: 25 + Math.floor(random() * 300),
        unit: 'G',
        note: null,
      })),
      steps: ['Prep everything.', 'Cook until done.', 'Season and serve.'],
      ...getCare(index),
      nutritionOverride: null,
      source: 'MANUAL',
      sourceId: getSourceId(index),
      isArchived: false,
    };
  });
  recipes.forEach((recipe) =>
    add(`recipes/${recipe.id}`, { ...recipe, createdAt, updatedAt: createdAt }),
  );

  const shoppingItems = Array.from(
    { length: SHOPPING_ITEM_COUNT },
    (_, index) => {
      const ingredient =
        ingredients[
          (index % SHOPPING_FAMILY_COUNT) +
            FAMILY_COUNT * Math.floor(index / SHOPPING_FAMILY_COUNT)
        ];
      const unit = SHOPPING_UNITS[index % SHOPPING_UNITS.length];
      return {
        id: `${ingredient.id}__${unit}`,
        ingredientId: ingredient.id,
        amount: unit === 'G' ? 100 + index * 5 : 1 + (index % 4) / 2,
        unit,
        isChecked: index % 5 === 4,
      };
    },
  );
  shoppingItems.forEach((entry, index) =>
    add(`shoppingItems/${entry.id}`, {
      ...entry,
      createdAt: createdAt + index,
      updatedAt: createdAt + index,
    }),
  );

  // 80 ideas: a link in two of every three (one in three with a picture address that cannot load offline) and the rest jotted,
  // every seventh with a title over 100 characters, every ninth with a long note, and every tenth already made into a recipe.
  const ideas = Array.from({ length: IDEA_COUNT }, (_, index) => {
    const isLink = index % 3 !== 2;
    const dish = `${RECIPE_WORDS[index % RECIPE_WORDS.length]} ${DISH_WORDS[(index * 5) % DISH_WORDS.length]}`;
    const site = IDEA_SITES[index % IDEA_SITES.length];
    return {
      id: `scale-idea-${index}`,
      kind: isLink ? 'LINK' : 'TEXT',
      title:
        index % 7 === 6
          ? `${dish} with a long list of extras: roasted garlic, a quick pickle, toasted seeds and something green on the side`
          : `${dish} ${index + 1}`,
      note:
        index % 9 === 8
          ? 'Worth trying on a slow weekend. '.repeat(18).trim()
          : index % 4 === 0
            ? 'Saw this and liked it.'
            : null,
      url: isLink ? `https://www.example.com/scale/idea-${index}` : null,
      siteName: isLink ? site : null,
      imageUrl:
        isLink && index % 3 === 0
          ? `https://images.example.test/scale/idea-${index}.jpg`
          : null,
      photoPath: null,
      recipeId: index % 10 === 9 ? `scale-recipe-${index}` : null,
    };
  });
  ideas.forEach((entry, index) =>
    add(`ideas/${entry.id}`, {
      ...entry,
      createdAt: createdAt + index,
      updatedAt: createdAt + index,
    }),
  );

  // Its own generator, so adding cooks leaves every earlier part of the fixture as it was.
  const cookRandom = makeRandom(20260202);
  const cooks = recipes.flatMap((recipe, recipeIndex) =>
    Array.from(
      {
        length:
          recipeIndex === 1
            ? 12
            : COOKS_PER_RECIPE[recipeIndex % COOKS_PER_RECIPE.length],
      },
      (_, cookIndex) => {
        const cookedAt =
          today -
          Math.floor(cookRandom() * COOK_DAYS_BACK) * DAY_MS +
          (11 + Math.floor(cookRandom() * 10)) * 3_600_000;
        return {
          id: `scale-cook-${recipeIndex}-${cookIndex}`,
          recipeId: recipe.id,
          plannedMealId: null,
          servings: 1 + Math.floor(cookRandom() * 8) / 2,
          cookedAt,
        };
      },
    ),
  );
  cooks.forEach((cook) =>
    add(`cooks/${cook.id}`, {
      ...cook,
      createdAt: cook.cookedAt,
      updatedAt: cook.cookedAt,
    }),
  );

  // Its own generator again. A recipe with cooks gets a tweak among its notes now and then, and some notes follow one of its cooks.
  const noteRandom = makeRandom(20260303);
  const pickNote = <T>(items: readonly T[]) =>
    items[Math.floor(noteRandom() * items.length)];
  const notes = recipes.flatMap((recipe, recipeIndex) => {
    const count =
      recipeIndex === 1
        ? 12
        : NOTES_PER_RECIPE[recipeIndex % NOTES_PER_RECIPE.length];
    const recipeCooks = cooks.filter((cook) => cook.recipeId === recipe.id);
    return Array.from({ length: count }, (_, noteIndex) => {
      const isBigTweak = recipeIndex === 1 && noteIndex === 6;
      const isTweak =
        recipeCooks.length > 0 && (noteRandom() < 0.2 || isBigTweak);
      const text = pickNote(NOTE_TEXTS);
      const isForcedFollowUp =
        recipeIndex === 1 && [0, 3, 9].includes(noteIndex);
      const cook =
        !isTweak &&
        recipeCooks.length > 0 &&
        (isForcedFollowUp || noteRandom() < 0.4)
          ? pickNote(recipeCooks)
          : null;
      const createdAt = cook
        ? cook.cookedAt + 2 * 3_600_000
        : today -
          Math.floor(noteRandom() * COOK_DAYS_BACK) * DAY_MS +
          (9 + Math.floor(noteRandom() * 12)) * 3_600_000;
      const getText = () => {
        if (recipeIndex === 1 && noteIndex === 2) return NOTE_TEXTS.join(' ');
        return isTweak && noteRandom() < 0.5 ? null : text;
      };
      return {
        id: `scale-note-${recipeIndex}-${noteIndex}`,
        recipeId: recipe.id,
        kind: isTweak ? 'TWEAK' : 'NOTE',
        text: getText(),
        changes: isBigTweak ? BIG_TWEAK : isTweak ? pickNote(TWEAKS) : [],
        cookId: cook?.id ?? null,
        createdAt,
        updatedAt: createdAt,
      };
    });
  });
  notes.forEach((note) => add(`notes/${note.id}`, note));

  const mealItems = (count: number, salt: number) =>
    Array.from({ length: count }, (_, itemIndex) => {
      const isRecipe = (salt + itemIndex) % 3 !== 0;
      return {
        id: `i${itemIndex}`,
        kind: isRecipe ? 'RECIPE' : 'INGREDIENT',
        refId: isRecipe ? pick(recipes).id : pick(ingredients).id,
        servings: 1 + Math.floor(random() * 3) / 2,
      };
    });
  const meals = Array.from({ length: MEAL_COUNT }, (_, index) => ({
    id: `scale-meal-${index}`,
    name: `${pick(RECIPE_WORDS)} plate ${index + 1}`,
    items: mealItems(2 + (index % 3), index),
  }));
  meals.forEach((meal) =>
    add(`meals/${meal.id}`, { ...meal, createdAt, updatedAt: createdAt }),
  );

  const totalDays = DAYS_BACK + DAYS_AHEAD + 1;
  Array.from(
    { length: totalDays * MEALS_PER_DAY },
    (_, index) => index,
  ).forEach((index) => {
    const day = Math.floor(index / MEALS_PER_DAY) - DAYS_BACK;
    const items = mealItems(1 + (index % 3), index);
    add(`plannedMeals/scale-planned-${index}`, {
      id: `scale-planned-${index}`,
      date: today + day * DAY_MS,
      mealType: MEAL_TYPES[index % MEAL_TYPES.length],
      name: null,
      sourceMealId: null,
      items,
      refIds: Array.from(new Set(items.map((entry) => entry.refId))),
      snapshot: null,
      createdAt: createdAt + index,
      updatedAt: createdAt + index,
    });
  });

  await writeAll(firestore, writes);

  return { ...EMPTY_SEED_RESULT, firestoreDocuments: writes.length };
}
