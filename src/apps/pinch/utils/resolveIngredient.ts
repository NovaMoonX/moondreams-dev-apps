import { CATALOG_INGREDIENTS } from '@apps/pinch/catalog';
import { DEFAULT_SERVING } from '@apps/pinch/constants';
import { getRecordAliases } from '@apps/pinch/utils/ingredientRecord';
import type {
  CatalogIngredient,
  IngredientRecord,
  NutritionValues,
  ResolvedIngredient,
} from '@apps/pinch/types';

const NO_NUTRITION: NutritionValues = {
  calories: null,
  protein: null,
  carbs: null,
  fat: null,
};

/** Each metric falls back to the catalog's when the record leaves it null; a custom ingredient's null stays unknown. */
const mergeNutrition = (
  record: NutritionValues | null,
  catalog: NutritionValues,
): NutritionValues => ({
  calories: record?.calories ?? catalog.calories,
  protein: record?.protein ?? catalog.protein,
  carbs: record?.carbs ?? catalog.carbs,
  fat: record?.fat ?? catalog.fat,
});

/** A record that only points at a default product changes nothing the person can see about the ingredient. */
const hasAdjustments = (record: IngredientRecord) =>
  record.name != null ||
  record.familyId != null ||
  record.nutritionPer100g != null ||
  record.servingAmount != null ||
  record.gramsPerMl != null ||
  record.gramsEach != null ||
  getRecordAliases(record).length > 0;

const mergeAliases = (catalog: string[], own: string[]) => {
  const have = new Set(catalog.map((alias) => alias.toLowerCase()));
  const result = [
    ...catalog,
    ...own.filter((alias) => !have.has(alias.toLowerCase())),
  ];
  return result;
};

export function resolveCatalogIngredient(
  catalog: CatalogIngredient,
  record: IngredientRecord | null,
): ResolvedIngredient {
  const hasServing =
    record !== null &&
    record.servingAmount != null &&
    record.servingUnit != null;

  return {
    id: catalog.id,
    name: record?.name ?? catalog.name,
    familyId: record?.familyId ?? catalog.familyId,
    aliases: record
      ? mergeAliases(catalog.aliases, getRecordAliases(record))
      : catalog.aliases,
    per100g: mergeNutrition(record?.nutritionPer100g ?? null, catalog.per100g),
    serving: hasServing
      ? {
          amount: record.servingAmount as number,
          unit: record.servingUnit as NonNullable<typeof record.servingUnit>,
        }
      : catalog.serving,
    gramsPerMl: record?.gramsPerMl ?? catalog.gramsPerMl,
    gramsEach: record?.gramsEach ?? catalog.gramsEach,
    isCustom: false,
    isAdjusted: record !== null && hasAdjustments(record),
    isArchived: false,
  };
}

export function resolveCustomIngredient(
  record: IngredientRecord,
): ResolvedIngredient {
  const hasServing = record.servingAmount != null && record.servingUnit != null;

  return {
    id: record.id,
    name: record.name ?? 'Unnamed ingredient',
    familyId: record.familyId,
    aliases: getRecordAliases(record),
    per100g: mergeNutrition(record.nutritionPer100g, NO_NUTRITION),
    serving: hasServing
      ? {
          amount: record.servingAmount as number,
          unit: record.servingUnit as NonNullable<typeof record.servingUnit>,
        }
      : { ...DEFAULT_SERVING },
    gramsPerMl: record.gramsPerMl,
    gramsEach: record.gramsEach,
    isCustom: true,
    isAdjusted: false,
    isArchived: record.isArchived === true,
  };
}

/** The catalog overlaid by the person's records, then their own ingredients: one resolved entry per id. */
export function resolveIngredients(
  records: IngredientRecord[],
): ResolvedIngredient[] {
  const recordsById = new Map(records.map((record) => [record.id, record]));
  const fromCatalog = CATALOG_INGREDIENTS.map((catalog) =>
    resolveCatalogIngredient(catalog, recordsById.get(catalog.id) ?? null),
  );
  const custom = records
    .filter((record) => record.catalogId === null)
    .map(resolveCustomIngredient);

  return [...fromCatalog, ...custom];
}
