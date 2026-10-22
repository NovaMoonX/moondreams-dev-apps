import { MAX_INGREDIENT_ALIASES, MAX_NAME_LENGTH } from '@apps/pinch/constants';
import type { IngredientRecord } from '@apps/pinch/types';

/** The person's record for a catalog ingredient they haven't changed, written the first time something needs to point at it (a default product). */
export function buildCatalogRecord(
  catalogId: string,
  defaultProductId: string | null,
  now: number,
): IngredientRecord {
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
    aliases: [],
    defaultProductId,
    isArchived: false,
    createdAt: now,
    updatedAt: now,
  };

  return record;
}

/** A record's own aliases; a document written before aliases has no key. */
export const getRecordAliases = (record: IngredientRecord | null) =>
  Array.isArray(record?.aliases) ? record.aliases : [];

/** Typed other names ready to save: trimmed, no blanks, repeats or the ingredient's own name (ignoring case), at most `MAX_INGREDIENT_ALIASES`. */
export function cleanAliases(typed: string[], ownName: string | null) {
  const seen = new Set([ownName?.trim().toLowerCase() ?? '']);
  const result = typed
    .map((alias) => alias.trim().replace(/\s+/g, ' ').slice(0, MAX_NAME_LENGTH))
    .filter((alias) => {
      const key = alias.toLowerCase();
      if (alias === '' || seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    })
    .slice(0, MAX_INGREDIENT_ALIASES);

  return result;
}
