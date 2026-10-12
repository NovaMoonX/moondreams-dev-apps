import {
  MAX_MINUTES,
  MAX_NAME_LENGTH,
  MAX_NOTE_LENGTH,
  MAX_RECIPE_DESCRIPTION_LENGTH,
  MAX_RECIPE_INGREDIENTS,
  MAX_RECIPE_STEPS,
  MAX_RECIPE_TITLE_LENGTH,
  MAX_SERVING_AMOUNT,
  MAX_STEP_LENGTH,
  UNITS,
} from '@apps/pinch/constants';
import type { Unit } from '@apps/pinch/types';

export interface ExtractedIngredient {
  name: string;
  amount: number | null;
  unit: Unit | null;
  note: string | null;
}

/** What the reader found. It only ever fills the form; nothing is saved from it. */
export interface ExtractedRecipe {
  title: string | null;
  servings: number | null;
  prepMinutes: number | null;
  cookMinutes: number | null;
  description: string | null;
  ingredients: ExtractedIngredient[];
  steps: string[];
  /** Parts of the recipe the reader could not make out. */
  unread: string[];
}

const asString = (value: unknown) =>
  typeof value === 'string' && value.trim() !== '' ? value.trim() : null;
const asNumber = (value: unknown) =>
  typeof value === 'number' &&
  Number.isFinite(value) &&
  value > 0 &&
  value <= MAX_SERVING_AMOUNT
    ? value
    : null;
const asMinutes = (value: unknown) =>
  typeof value === 'number' &&
  Number.isFinite(value) &&
  value >= 0 &&
  value <= MAX_MINUTES
    ? Math.round(value)
    : null;

/** Turns whatever the model returned into the safe shape the form takes: wrong types become null, lists are capped, units must be real. */
export function normalizeExtractedRecipe(raw: unknown): ExtractedRecipe {
  const parsed = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<
    string,
    unknown
  >;
  const list = (value: unknown) => (Array.isArray(value) ? value : []);

  return {
    title: asString(parsed.title)?.slice(0, MAX_RECIPE_TITLE_LENGTH) ?? null,
    servings: asNumber(parsed.servings),
    prepMinutes: asMinutes(parsed.prepMinutes),
    cookMinutes: asMinutes(parsed.cookMinutes),
    description:
      asString(parsed.description)?.slice(0, MAX_RECIPE_DESCRIPTION_LENGTH) ??
      null,
    ingredients: list(parsed.ingredients)
      .flatMap((entry) => {
        const item = (
          typeof entry === 'object' && entry !== null ? entry : {}
        ) as Record<string, unknown>;
        const name = asString(item.name)?.slice(0, MAX_NAME_LENGTH);
        return name
          ? [
              {
                name,
                amount: asNumber(item.amount),
                unit: UNITS.find((unit) => unit === item.unit) ?? null,
                note: asString(item.note)?.slice(0, MAX_NOTE_LENGTH) ?? null,
              },
            ]
          : [];
      })
      .slice(0, MAX_RECIPE_INGREDIENTS),
    steps: list(parsed.steps)
      .flatMap((step) =>
        asString(step) ? [asString(step)!.slice(0, MAX_STEP_LENGTH)] : [],
      )
      .slice(0, MAX_RECIPE_STEPS),
    unread: list(parsed.unread)
      .flatMap((entry) =>
        asString(entry) ? [asString(entry)!.slice(0, 200)] : [],
      )
      .slice(0, 10),
  };
}
