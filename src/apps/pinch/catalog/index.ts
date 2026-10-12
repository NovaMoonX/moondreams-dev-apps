import { CATALOG_FAMILIES } from '@apps/pinch/catalog/catalogFamilies';
import { CATALOG_INGREDIENTS } from '@apps/pinch/catalog/catalogIngredients';

export { CATALOG_FAMILIES, CATALOG_INGREDIENTS };

export const CATALOG_INGREDIENTS_BY_ID = new Map(
  CATALOG_INGREDIENTS.map((ingredient) => [ingredient.id, ingredient]),
);
export const CATALOG_FAMILIES_BY_ID = new Map(
  CATALOG_FAMILIES.map((family) => [family.id, family]),
);
