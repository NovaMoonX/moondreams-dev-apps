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

  await Promise.all([
    ...SEED_FAMILIES.map((family) =>
      kitchenRef
        .collection('families')
        .doc(family.id)
        .set({ ...family, createdAt, updatedAt: createdAt }),
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
    firestoreDocuments: SEED_FAMILIES.length + SEED_INGREDIENTS.length,
  };
}
