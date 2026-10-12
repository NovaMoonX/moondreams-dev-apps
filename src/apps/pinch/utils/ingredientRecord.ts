import type { IngredientRecord } from '@apps/pinch/types';

/** The person's record for a catalog ingredient they haven't changed, written the first time something needs to point at it (a default product). */
export function buildCatalogRecord(catalogId: string, defaultProductId: string | null, now: number): IngredientRecord {
  const record: IngredientRecord = {
    id: catalogId,
    catalogId,
    name: null,
    familyId: null,
    iconKey: null,
    nutritionPer100g: null,
    servingAmount: null,
    servingUnit: null,
    gramsPerMl: null,
    gramsEach: null,
    defaultProductId,
    createdAt: now,
    updatedAt: now,
  };

  return record;
}
