import { formatMacro, type MacroKey } from '@/utils/macroUtils';
import { UNIT_LABELS } from '@apps/pinch/constants';
import type {
  CatalogIngredient,
  IngredientRecord,
  Unit,
} from '@apps/pinch/types';

export interface IngredientAdjustment {
  key: string;
  label: string;
  builtIn: string;
  yours: string;
}

const METRICS: { key: MacroKey; label: string; unit: string }[] = [
  { key: 'calories', label: 'Calories', unit: '' },
  { key: 'protein', label: 'Protein', unit: ' g' },
  { key: 'carbs', label: 'Carbs', unit: ' g' },
  { key: 'fat', label: 'Fat', unit: ' g' },
];

const round = (value: number) => String(Math.round(value * 100) / 100);

/** What a person's record changes about a built-in ingredient, one line for each value that really differs from the built-in one. */
export function getIngredientAdjustments(
  catalog: CatalogIngredient,
  record: IngredientRecord,
  getFamilyName: (familyId: string) => string | null,
): IngredientAdjustment[] {
  const familyText = (familyId: string | null) =>
    familyId === null ? 'None' : (getFamilyName(familyId) ?? 'Removed family');
  const recordServing =
    record.servingAmount != null && record.servingUnit != null
      ? { amount: record.servingAmount, unit: record.servingUnit }
      : null;
  const servingText = (serving: { amount: number; unit: Unit }) =>
    `${round(serving.amount)} ${UNIT_LABELS[serving.unit]}`;

  const adjustments: (IngredientAdjustment | null)[] = [
    record.name != null && record.name !== catalog.name
      ? {
          key: 'name',
          label: 'Name',
          builtIn: catalog.name,
          yours: record.name,
        }
      : null,
    record.familyId != null && record.familyId !== catalog.familyId
      ? {
          key: 'family',
          label: 'Family',
          builtIn: familyText(catalog.familyId),
          yours: familyText(record.familyId),
        }
      : null,
    ...METRICS.map(({ key, label, unit }) => {
      const yours = record.nutritionPer100g?.[key];
      return yours != null && yours !== catalog.per100g[key]
        ? {
            key,
            label: `${label} per 100 g`,
            builtIn: `${formatMacro(key, catalog.per100g[key])}${unit}`,
            yours: `${formatMacro(key, yours)}${unit}`,
          }
        : null;
    }),
    recordServing !== null &&
    (recordServing.amount !== catalog.serving.amount ||
      recordServing.unit !== catalog.serving.unit)
      ? {
          key: 'serving',
          label: 'Serving size',
          builtIn: servingText(catalog.serving),
          yours: servingText(recordServing),
        }
      : null,
    record.gramsPerMl != null && record.gramsPerMl !== catalog.gramsPerMl
      ? {
          key: 'gramsPerMl',
          label: 'Weight of 1 ml',
          builtIn:
            catalog.gramsPerMl === null
              ? 'Not set'
              : `${round(catalog.gramsPerMl)} g`,
          yours: `${round(record.gramsPerMl)} g`,
        }
      : null,
    record.gramsEach != null && record.gramsEach !== catalog.gramsEach
      ? {
          key: 'gramsEach',
          label: 'Weight of one',
          builtIn:
            catalog.gramsEach === null
              ? 'Not set'
              : `${round(catalog.gramsEach)} g`,
          yours: `${round(record.gramsEach)} g`,
        }
      : null,
  ];

  return adjustments.filter((adjustment) => adjustment !== null);
}
